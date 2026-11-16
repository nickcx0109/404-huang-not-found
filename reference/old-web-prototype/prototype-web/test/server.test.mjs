import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { connect } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aoop-server-test-'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sockets = new Set();
let child, port, output = '', errors = '';

before(async () => {
  assert.equal(typeof WebSocket, 'function', 'Tests require Node 22+');
  for (const dir of ['core', 'ui', 'test']) fs.mkdirSync(path.join(root, dir));
  fs.copyFileSync(new URL('../server.mjs', import.meta.url), path.join(root, 'server.mjs'));
  fs.copyFileSync(new URL('../index.html', import.meta.url), path.join(root, 'index.html'));
  for (const file of ['core/net.js', 'ui/styles.css', 'test/private.json', ...['mjs', 'json', 'png', 'jpg', 'svg', 'ico'].map(ext => `fixture.${ext}`)]) fs.writeFileSync(path.join(root, file), '{}');
  // The copied server must locate its files independently of the process cwd.
  child = spawn(process.execPath, [path.join(root, 'server.mjs')], { cwd: os.tmpdir(), env: { ...process.env, PORT: '0' }, windowsHide: true });
  child.stderr.on('data', data => { errors += data; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`Startup timeout: ${errors}`)), 5000);
    child.stdout.on('data', data => { output += data; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) { port = +match[1]; clearTimeout(timer); resolve(); } });
    child.once('exit', code => { clearTimeout(timer); reject(Error(`Server exited ${code}: ${errors}`)); });
  });
});

after(async () => {
  for (const socket of sockets) socket.destroy ? socket.destroy() : socket.close();
  if (child && child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
  fs.rmSync(root, { recursive: true, force: true });
});

class Inbox {
  constructor(socket) { this.socket = socket; this.items = []; this.waiters = []; this.closed = false; sockets.add(socket); }
  push(item) {
    this.items.push(item);
    for (const waiter of [...this.waiters]) {
      const i = this.items.findIndex(waiter.predicate);
      if (i < 0) continue;
      clearTimeout(waiter.timer); this.waiters.splice(this.waiters.indexOf(waiter), 1); waiter.resolve(this.items.splice(i, 1)[0]);
    }
  }
  next(predicate = () => true, timeout = 2500) {
    const i = this.items.findIndex(predicate);
    if (i >= 0) return Promise.resolve(this.items.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: setTimeout(() => { this.waiters.splice(this.waiters.indexOf(waiter), 1); reject(Error('Message timeout')); }, timeout) };
      this.waiters.push(waiter);
    });
  }
  async close() {
    if (this.closed) return;
    const done = new Promise(resolve => this.socket.addEventListener('close', resolve, { once: true }));
    this.socket.close(); await done;
  }
}

async function ws(t) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`), inbox = new Inbox(socket);
  socket.addEventListener('message', e => inbox.push(JSON.parse(e.data)));
  socket.addEventListener('close', () => { inbox.closed = true; });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  t.after(() => inbox.close());
  inbox.send = obj => socket.send(JSON.stringify(obj));
  inbox.hello = async (role, name = '') => { inbox.send({ t: 'hello', role, name }); return inbox.next(o => ['welcome', 'hostExists', 'noHost', 'full'].includes(o.t)); };
  return inbox;
}

function request(urlPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method }, res => {
      let body = ''; res.on('data', data => { body += data; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }); req.on('error', reject); req.end();
  });
}

function masked(opcode, data = '', fin = true, mask = true) {
  const body = Buffer.from(data), size = body.length, extra = size <= 125 ? 0 : size <= 65535 ? 2 : 8;
  const header = Buffer.alloc(2 + extra + (mask ? 4 : 0)); header[0] = (fin ? 128 : 0) | opcode;
  header[1] = (mask ? 128 : 0) | (extra === 0 ? size : extra === 2 ? 126 : 127);
  if (extra === 2) header.writeUInt16BE(size, 2);
  if (extra === 8) header.writeBigUInt64BE(BigInt(size), 2);
  const key = Buffer.from([1, 2, 3, 4]);
  if (mask) { key.copy(header, 2 + extra); for (let i = 0; i < size; i++) body[i] ^= key[i & 3]; }
  return Buffer.concat([header, body]);
}

async function raw(t, { urlPath = '/ws', version = '13', key = randomBytes(16).toString('base64'), upgrade = 'websocket', head = Buffer.alloc(0) } = {}) {
  const socket = connect({ host: '127.0.0.1', port }), inbox = new Inbox(socket);
  let pending = Buffer.alloc(0), ready;
  const handshake = new Promise(resolve => { ready = resolve; });
  socket.on('data', data => {
    pending = Buffer.concat([pending, data]);
    if (!inbox.headers) {
      const end = pending.indexOf('\r\n\r\n'); if (end < 0) return;
      inbox.headers = pending.subarray(0, end).toString(); pending = pending.subarray(end + 4); ready(inbox);
    }
    if (!inbox.headers.startsWith('HTTP/1.1 101')) return;
    while (pending.length >= 2) {
      const b = pending; let size = b[1] & 127, offset = 2;
      assert.equal(b[1] & 128, 0, 'server frames are unmasked');
      if (size === 126) { if (b.length < 4) return; size = b.readUInt16BE(2); offset = 4; }
      else if (size === 127) { if (b.length < 10) return; size = Number(b.readBigUInt64BE(2)); offset = 10; }
      if (b.length < offset + size) return;
      const opcode = b[0] & 15, payload = Buffer.from(b.subarray(offset, offset + size)); pending = b.subarray(offset + size);
      inbox.push({ opcode, payload }); if (opcode === 8) socket.end(masked(8, payload));
    }
  });
  socket.on('error', () => {}); socket.on('close', () => { inbox.closed = true; });
  t.after(() => socket.destroy());
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
  socket.write(Buffer.concat([Buffer.from(`GET ${urlPath} HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: ${upgrade}\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: ${version}\r\n\r\n`), head]));
  let timer;
  try { return await Promise.race([handshake, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Handshake timeout')), 2500); })]); }
  finally { clearTimeout(timer); }
}

async function room(t) {
  const host = await ws(t); await host.hello('host'); const a = await ws(t); await a.hello('join'); const b = await ws(t); await b.hello('join');
  return { host, a, b };
}

test('static files: MIME, no-store, independent cwd, HEAD, private files and decoded traversal', async () => {
  const types = { '/': 'text/html', '/core/net.js': 'text/javascript', '/ui/styles.css': 'text/css' };
  for (const [ext, mime] of Object.entries({ mjs: 'text/javascript', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', ico: 'image/x-icon' })) types[`/fixture.${ext}`] = mime;
  for (const [file, mime] of Object.entries(types)) { const r = await request(file); assert.equal(r.status, 200, file); assert.ok(r.headers['content-type'].startsWith(mime), file); assert.equal(r.headers['cache-control'], 'no-store'); }
  assert.equal((await request('/', 'HEAD')).body, ''); assert.equal((await request('/')).headers['x-prototype-server'], 'zombie-coop');
  for (const file of ['/../secret', '/%2e%2e/secret', '/..%5csecret', '/%2e%2e%2fsecret']) assert.equal((await request(file)).status, 403, file);
  for (const file of ['/server.mjs', '/test/private.json', '/%73erver.mjs', '/test%2fprivate.json', '/missing']) assert.equal((await request(file)).status, 404, file);
  assert.equal((await request('/%zz')).status, 400); assert.match(output, /私人網路/); assert.equal(errors, '');
});

test('occupied port exits with a clear message and no stack trace', async () => {
  const duplicate = spawn(process.execPath, [path.join(root, 'server.mjs')], { env: { ...process.env, PORT: String(port) }, windowsHide: true });
  let stderr = ''; duplicate.stderr.on('data', data => { stderr += data; });
  assert.equal(await new Promise(resolve => duplicate.once('exit', resolve)), 1); assert.match(stderr, /已被占用/); assert.doesNotMatch(stderr, /\n\s+at /);
});

test('handshake validates path, Upgrade, key, version and RFC accept', async t => {
  const valid = await raw(t, { key: 'dGhlIHNhbXBsZSBub25jZQ==' }); assert.match(valid.headers, /101 Switching Protocols/); assert.match(valid.headers, /Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=/);
  for (const options of [{ urlPath: '/wrong' }, { version: '12' }, { key: 'bad' }, { upgrade: 'other' }]) assert.match((await raw(t, options)).headers, /400 Bad Request/);
});

test('hello: host/join, duplicate host, full room, names, peer notifications and ID reuse', async t => {
  const alone = await ws(t); assert.deepEqual(await alone.hello('join'), { t: 'noHost' });
  const host = await ws(t); assert.deepEqual(await host.hello('host', '  主持人  '), { t: 'welcome', clientId: 0, players: [{ id: 0, name: '主持人' }] });
  const duplicate = await ws(t); assert.deepEqual(await duplicate.hello('host'), { t: 'hostExists' });
  const a = await ws(t), aw = await a.hello('join', '😀'.repeat(20)); assert.equal(aw.clientId, 1); assert.equal(Array.from(aw.players[1].name).length, 16);
  assert.equal((await host.next(o => o.t === 'peerJoined' && o.id === 1)).name, '😀'.repeat(16));
  const b = await ws(t), bw = await b.hello('join', '  '); assert.equal(bw.clientId, 2); assert.equal(bw.players[2].name, '玩家2');
  const full = await ws(t); assert.deepEqual(await full.hello('join'), { t: 'full' });
  await a.close(); assert.deepEqual(await host.next(o => o.t === 'peerLeft'), { t: 'peerLeft', id: 1 });
  const replacement = await ws(t); assert.equal((await replacement.hello('join')).clientId, 1);
});

test('relay: toHost, toClient, broadcast except and restrictions before hello or without host role', async t => {
  const { host, a, b } = await room(t), idle = await ws(t);
  a.send({ t: 'toHost', d: { shot: 1 } }); assert.deepEqual(await host.next(o => o.t === 'fromClient'), { t: 'fromClient', from: 1, d: { shot: 1 } });
  host.send({ t: 'toClient', to: 2, d: { hp: 80 } }); assert.deepEqual(await b.next(o => o.t === 'fromHost'), { t: 'fromHost', d: { hp: 80 } });
  host.send({ t: 'broadcast', d: { wave: 2 } }); for (const peer of [a, b]) assert.deepEqual(await peer.next(o => o.t === 'fromHost'), { t: 'fromHost', d: { wave: 2 } });
  host.send({ t: 'broadcast', except: 1, d: { except: true } }); assert.deepEqual(await b.next(o => o.t === 'fromHost'), { t: 'fromHost', d: { except: true } });
  for (const peer of [a, idle]) for (const obj of [{ t: 'broadcast', d: { forbidden: 1 } }, { t: 'toClient', to: 2, d: { forbidden: 2 } }]) peer.send(obj);
  idle.send({ t: 'toHost', d: { forbidden: 3 } }); host.send({ t: 'toHost', d: { forbidden: 4 } }); await sleep(100);
  for (const peer of [host, a, b, idle]) assert.ok(!peer.items.some(o => ['fromClient', 'fromHost'].includes(o.t)));
});

test('all three frame lengths round-trip, including JSON larger than 65535 bytes', async t => {
  const host = await ws(t); await host.hello('host'); const a = await ws(t); await a.hello('join');
  for (const size of [0, 125, 65536, 200000]) {
    const d = { text: '殭'.repeat(size) }; a.send({ t: 'toHost', d }); assert.deepEqual((await host.next(o => o.t === 'fromClient')).d, d);
    host.send({ t: 'toClient', to: 1, d }); assert.deepEqual((await a.next(o => o.t === 'fromHost')).d, d);
  }
});

test('hostLeft notifies clients and clears the room for the next host', async t => {
  const { host, a, b } = await room(t); await host.close();
  for (const peer of [a, b]) assert.deepEqual(await peer.next(o => o.t === 'hostLeft'), { t: 'hostLeft' });
  assert.deepEqual(await a.hello('join'), { t: 'noHost' }); assert.equal((await b.hello('host')).clientId, 0);
  const c = await ws(t); assert.equal((await c.hello('join')).clientId, 1);
});

test('fragmentation, TCP splits/coalescing, handshake head, ping/pong and invalid JSON', async t => {
  const host = await ws(t); await host.hello('host');
  const a = await raw(t, { head: masked(1, JSON.stringify({ t: 'hello', role: 'join' })) });
  assert.equal(JSON.parse((await a.next(f => f.opcode === 1)).payload).clientId, 1);
  const text = Buffer.from(JSON.stringify({ t: 'toHost', d: { text: '殭屍'.repeat(100) } })), first = masked(1, text.subarray(0, 23), false);
  a.socket.write(first.subarray(0, 1)); await sleep(10); a.socket.write(first.subarray(1, 5)); await sleep(10);
  a.socket.write(Buffer.concat([first.subarray(5), masked(9, 'ping'), masked(0, text.subarray(23)), masked(1, '{bad'), masked(1, JSON.stringify({ t: 'toHost', d: { second: true } }))]));
  assert.equal((await a.next(f => f.opcode === 10)).payload.toString(), 'ping');
  assert.equal((await host.next(o => o.t === 'fromClient')).d.text, '殭屍'.repeat(100)); assert.deepEqual((await host.next(o => o.t === 'fromClient')).d, { second: true });
});

test('reject unmasked/binary/invalid frames and close oversized messages with 1009', async t => {
  const cases = [[masked(1, '{}', true, false), 1002], [masked(2, 'binary'), 1003], [masked(0, '{}'), 1002], [masked(9, 'ping', false), 1002], [masked(9, 'x'.repeat(126)), 1002], [masked(1, Buffer.from([255])), 1007], [masked(1, 'x'.repeat(1024 * 1024 + 1)), 1009], [Buffer.concat([masked(1, 'x'.repeat(600000), false), masked(0, 'y'.repeat(600000))]), 1009]];
  for (const [bytes, code] of cases) { const a = await raw(t); a.socket.write(bytes); assert.equal((await a.next(f => f.opcode === 8)).payload.readUInt16BE(), code); }
});

test('watcher sends CSS to idle peers, reloads mixed changes and ignores private/temp files', async t => {
  const a = await ws(t), b = await ws(t);
  fs.appendFileSync(path.join(root, 'ui/styles.css'), '\n/* css */'); for (const peer of [a, b]) assert.deepEqual(await peer.next(), { t: 'css', href: 'ui/styles.css' });
  fs.appendFileSync(path.join(root, 'ui/styles.css'), '\n/* mixed */'); fs.appendFileSync(path.join(root, 'core/net.js'), '\n// changed'); for (const peer of [a, b]) assert.deepEqual(await peer.next(), { t: 'reload' });
  for (const file of ['test/private.json', '.hidden', 'ui/.nested', 'ui/styles.css~', 'core/file.swp', 'file.tmp', '4913']) fs.appendFileSync(path.join(root, file), 'x');
  fs.appendFileSync(path.join(root, 'server.mjs'), '\n// restart test'); await sleep(450);
  assert.deepEqual(a.items, []); assert.deepEqual(b.items, []); assert.match(output, /server.mjs 有變更，請重新啟動/);
});

test('10s heartbeat disconnects a peer without pong while a native client stays connected', { timeout: 35000 }, async t => {
  const silent = await raw(t), automatic = await ws(t); await silent.next(f => f.opcode === 9, 11000);
  const deadline = Date.now() + 23000; while (!silent.closed && Date.now() < deadline) await sleep(100);
  assert.ok(silent.closed); assert.equal(automatic.closed, false);
});
