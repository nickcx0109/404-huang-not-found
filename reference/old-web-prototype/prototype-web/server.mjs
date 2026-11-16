/*
 * One room, at most three players. This server only relays data; it never simulates the game.
 * Client -> server
 * {t:"hello", name, role:"host"|"join"}
 * {t:"toHost", d:{...}}                    joined clients only
 * {t:"toClient", to:<clientId>, d:{...}}   host only
 * {t:"broadcast", d:{...}, except?:<id>}   host only (recipients are clients)
 * Server -> client
 * {t:"welcome", clientId, players:[{id,name}]}
 * {t:"hostExists"} / {t:"noHost"} / {t:"full"}   rejected hello, then close
 * {t:"peerJoined", id, name} / {t:"peerLeft", id}   all room members
 * {t:"fromClient", from, d}                to host
 * {t:"fromHost", d}                        to client
 * {t:"hostLeft"}                           to clients, then reset memberships
 * {t:"reload"} / {t:"css", href}           all connections, even before hello
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

const ROOT = fs.realpathSync(new URL('.', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function insideRoot(filename) {
  const relative = path.relative(ROOT, filename);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function privateFile(filename) {
  const relative = path.relative(ROOT, filename).replaceAll('\\', '/').toLowerCase();
  return relative === 'server.mjs' || relative === 'test' || relative.startsWith('test/');
}

function serveFile(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Prototype-Server', 'zombie-coop');
  const fail = code => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(http.STATUS_CODES[code]); };
  let pathname;
  try { pathname = decodeURIComponent(req.url.split('?')[0]).replaceAll('\\', '/'); }
  catch { return fail(400); }
  if (!pathname.startsWith('/') || pathname.includes('\0')) return fail(400);
  const filename = path.resolve(ROOT, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!insideRoot(filename)) return fail(403);
  if (privateFile(filename)) return fail(404);
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405);
  // Check the real target too, so a symlink cannot expose files outside the root.
  fs.realpath(filename, (error, real) => {
    if (error) return fail(404);
    if (!insideRoot(real)) return fail(403);
    if (privateFile(real)) return fail(404);
    fs.stat(real, (error, stat) => {
      if (error || !stat.isFile()) return fail(404);
      const stream = fs.createReadStream(real);
      stream.once('error', () => { if (!res.headersSent) fail(404); else res.destroy(); });
      stream.once('open', () => {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(real).toLowerCase()] || 'application/octet-stream', 'Content-Length': stat.size });
        if (req.method === 'HEAD') { stream.destroy(); res.end(); }
        else stream.pipe(res);
      });
      res.once('close', () => stream.destroy());
    });
  });
}

const server = http.createServer(serveFile);
const MAX_MESSAGE = 1024 * 1024;
const connections = new Set();
const utf8 = new TextDecoder('utf-8', { fatal: true });
const players = new Map();

function roomMessage(connection, obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  if (obj.t === 'hello') {
    if (connection.member || !['host', 'join'].includes(obj.role)) return;
    const host = players.get(0);
    const refusal = obj.role === 'host' ? (host ? 'hostExists' : null)
      : !host || host.closing ? 'noHost' : players.size >= 3 ? 'full' : null;
    if (refusal) { connection.send({ t: refusal }); connection.close(); return; }
    const id = obj.role === 'host' ? 0 : [1, 2].find(id => !players.has(id));
    const name = Array.from(typeof obj.name === 'string' ? obj.name.trim() : '').slice(0, 16).join('') || `玩家${id}`;
    connection.member = { id, name };
    players.set(id, connection);
    connection.send({ t: 'welcome', clientId: id, players: [...players.values()].map(peer => peer.member) });
    for (const peer of players.values()) peer.send({ t: 'peerJoined', id, name });
    return;
  }
  if (!connection.member || !obj.d || typeof obj.d !== 'object' || Array.isArray(obj.d)) return;
  const id = connection.member.id;
  if (obj.t === 'toHost' && id !== 0) players.get(0)?.send({ t: 'fromClient', from: id, d: obj.d });
  if (id !== 0) return;
  if (obj.t === 'toClient' && Number.isInteger(obj.to) && obj.to !== 0) players.get(obj.to)?.send({ t: 'fromHost', d: obj.d });
  if (obj.t === 'broadcast') {
    for (const [peerId, peer] of players) if (peerId !== 0 && peerId !== obj.except) peer.send({ t: 'fromHost', d: obj.d });
  }
}

function leaveRoom(connection) {
  if (!connection.member) return;
  const id = connection.member.id;
  players.delete(id); connection.member = null;
  if (id === 0) {
    for (const peer of players.values()) { peer.send({ t: 'hostLeft' }); peer.member = null; }
    players.clear();
  } else {
    for (const peer of players.values()) peer.send({ t: 'peerLeft', id });
  }
}

// RFC 6455 server frames are never masked.
function frame(opcode, payload = Buffer.alloc(0)) {
  const size = payload.length;
  const header = Buffer.alloc(size <= 125 ? 2 : size <= 65535 ? 4 : 10);
  header[0] = 0x80 | opcode;
  header[1] = size <= 125 ? size : size <= 65535 ? 126 : 127;
  if (header.length === 4) header.writeUInt16BE(size, 2);
  if (header.length === 10) header.writeBigUInt64BE(BigInt(size), 2);
  return Buffer.concat([header, payload]);
}

class Connection {
  constructor(socket) {
    this.socket = socket;
    this.pending = Buffer.alloc(0);
    this.fragments = [];
    this.messageSize = 0;
    this.fragmenting = false;
    this.closing = false;
    this.lastPong = Date.now();
    connections.add(this);
    socket.setNoDelay(true);
    socket.on('data', data => this.read(data));
    socket.on('error', () => socket.destroy());
    socket.on('close', () => { connections.delete(this); this.onDisconnect?.(); });
  }
  send(obj) {
    if (!this.closing && !this.socket.destroyed) this.socket.write(frame(1, Buffer.from(JSON.stringify(obj))));
  }
  close(code = 1000, payload) {
    if (this.closing) return;
    this.closing = true;
    if (!payload) { payload = Buffer.alloc(2); payload.writeUInt16BE(code); }
    this.socket.end(frame(8, payload));
    setTimeout(() => this.socket.destroy(), 1000).unref();
  }
  read(data) {
    if (this.closing) return;
    this.pending = Buffer.concat([this.pending, data]);
    while (!this.closing && this.pending.length >= 2) {
      const bytes = this.pending, first = bytes[0], second = bytes[1];
      const fin = (first & 0x80) !== 0, opcode = first & 0x0f, control = opcode >= 8;
      if ((first & 0x70) || !(second & 0x80) || ![0, 1, 2, 8, 9, 10].includes(opcode)) return this.close(1002);
      let length = second & 0x7f, offset = 2;
      if (control && (!fin || length > 125)) return this.close(1002);
      if (length === 126) {
        if (bytes.length < 4) return;
        length = bytes.readUInt16BE(2); offset = 4;
        if (length < 126) return this.close(1002);
      } else if (length === 127) {
        if (bytes.length < 10) return;
        const wide = bytes.readBigUInt64BE(2);
        if (wide & (1n << 63n)) return this.close(1002);
        if (wide < 65536n) return this.close(1002);
        if (wide > BigInt(MAX_MESSAGE)) return this.close(1009);
        length = Number(wide); offset = 10;
      }
      if (!control) {
        if ((opcode === 0 && !this.fragmenting) || (opcode !== 0 && this.fragmenting)) return this.close(1002);
        if (this.messageSize + length > MAX_MESSAGE) return this.close(1009);
        if (opcode === 2) return this.close(1003);
      }
      if (bytes.length < offset + 4 + length) return;
      const mask = bytes.subarray(offset, offset + 4);
      const payload = Buffer.from(bytes.subarray(offset + 4, offset + 4 + length));
      for (let i = 0; i < length; i++) payload[i] ^= mask[i & 3];
      this.pending = bytes.subarray(offset + 4 + length);
      if (opcode === 8) {
        if (payload.length === 1) return this.close(1002);
        if (payload.length >= 2) {
          const code = payload.readUInt16BE(0);
          if (!((code >= 1000 && code <= 1014 && ![1004, 1005, 1006].includes(code)) || (code >= 3000 && code <= 4999))) return this.close(1002);
          try { utf8.decode(payload.subarray(2)); } catch { return this.close(1007); }
        }
        return this.close(1000, payload);
      }
      if (opcode === 9) { this.socket.write(frame(10, payload)); continue; }
      if (opcode === 10) { this.lastPong = Date.now(); continue; }
      this.fragments.push(payload); this.messageSize += length; this.fragmenting = !fin;
      if (!fin) continue;
      const message = Buffer.concat(this.fragments, this.messageSize);
      this.fragments = []; this.messageSize = 0;
      let text;
      try { text = utf8.decode(message); } catch { return this.close(1007); }
      let obj;
      try { obj = JSON.parse(text); } catch { continue; }
      this.onMessage?.(obj);
    }
  }
}

server.on('upgrade', (req, socket, head) => {
  // Rejected handshakes never construct a Connection, but can still be reset.
  socket.on('error', () => socket.destroy());
  const key = req.headers['sec-websocket-key'];
  const validKey = typeof key === 'string' && /^[A-Za-z0-9+/]{22}==$/.test(key) && Buffer.from(key, 'base64').length === 16;
  if (req.url.split('?')[0] !== '/ws' || req.method !== 'GET'
    || req.headers.upgrade?.toLowerCase() !== 'websocket'
    || !req.headers.connection?.toLowerCase().split(',').some(token => token.trim() === 'upgrade')
    || req.headers['sec-websocket-version'] !== '13' || !validKey) {
    socket.end('HTTP/1.1 400 Bad Request\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    return;
  }
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nCache-Control: no-store\r\n\r\n`);
  const connection = new Connection(socket);
  connection.onMessage = obj => roomMessage(connection, obj);
  connection.onDisconnect = () => leaveRoom(connection);
  if (head.length) connection.read(head);
});

setInterval(() => {
  for (const connection of connections) {
    if (connection.closing) continue;
    if (Date.now() - connection.lastPong >= 20000) connection.socket.destroy();
    else connection.socket.write(frame(9));
  }
}, 10000).unref();

function watchFiles() {
  const changes = new Set();
  let debounce;
  try {
    const watcher = fs.watch(ROOT, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const relative = filename.toString().replaceAll('\\', '/');
      const parts = relative.split('/');
      if (parts.some(part => part.startsWith('.') || part.endsWith('~') || /\.(sw[pox]|tmp|temp|bak)$/i.test(part) || part === '4913') || parts[0].toLowerCase() === 'test') return;
      // Windows may also report the containing directory when a child changes.
      // Those metadata notifications must not turn a CSS edit into a full reload.
      try { if (fs.statSync(path.join(ROOT, relative)).isDirectory()) return; } catch { /* Deleted files still trigger reload. */ }
      changes.add(relative);
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const files = [...changes]; changes.clear();
        if (files.some(file => file.toLowerCase() === 'server.mjs')) console.log('server.mjs 有變更，請重新啟動');
        const publicFiles = files.filter(file => file.toLowerCase() !== 'server.mjs');
        if (!publicFiles.length) return;
        const messages = publicFiles.every(file => path.extname(file).toLowerCase() === '.css')
          ? publicFiles.map(href => ({ t: 'css', href })) : [{ t: 'reload' }];
        for (const connection of connections) for (const message of messages) connection.send(message);
      }, 150);
    });
    watcher.on('error', error => console.error(`檔案監看失敗：${error.message}`));
    server.once('close', () => { watcher.close(); clearTimeout(debounce); });
  } catch (error) { console.error(`無法啟用 live reload：${error.message}`); }
}

const port = Number(process.env.PORT ?? 8765);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('PORT 必須是 0–65535 的整數。');
  process.exitCode = 1;
} else {
  server.once('error', error => {
    console.error(error.code === 'EADDRINUSE'
      ? `Port ${port} 已被占用，請先關閉其他伺服器，或設定 PORT 使用其他連接埠。`
      : `伺服器無法啟動：${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '0.0.0.0', () => {
    watchFiles();
    const actualPort = server.address().port;
    console.log(`http://localhost:${actualPort}`);
    const addresses = new Set(Object.values(os.networkInterfaces()).flat().filter(address => address && address.family === 'IPv4' && !address.internal).map(address => address.address));
    for (const address of addresses) console.log(`http://${address}:${actualPort}`);
    console.log('第一次執行時 Windows 防火牆可能會跳出詢問，請允許「私人網路」。');
  });
}
