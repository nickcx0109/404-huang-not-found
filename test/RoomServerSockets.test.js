import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { RoomServer } from '../server/RoomServer.js';
import { WsTransport } from '../server/transport/WsTransport.js';

/** A real ws client that queues incoming messages so tests can await them in order. */
class TestSocket {
  static async open(url) {
    const socket = new TestSocket(new WebSocket(url));
    await new Promise((resolve, reject) => {
      socket.ws.once('open', resolve);
      socket.ws.once('error', reject);
    });
    return socket;
  }

  constructor(ws) {
    this.ws = ws;
    this.queue = [];
    this.waiters = [];
    ws.on('message', data => {
      const message = JSON.parse(data.toString('utf8'));
      const waiter = this.waiters.shift();
      if (waiter) waiter(message);
      else this.queue.push(message);
    });
  }

  send(message) {
    this.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  next() {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for a message')), 2000);
      this.waiters.push(message => { clearTimeout(timer); resolve(message); });
    });
  }

  close() {
    return new Promise(resolve => {
      this.ws.once('close', resolve);
      this.ws.close();
    });
  }
}

test('WsTransport reports server errors after binding instead of crashing', async t => {
  const errors = [];
  const transport = new WsTransport(new RoomServer(), { onError: error => errors.push(error.message) });
  const port = await transport.listen(0, '127.0.0.1');
  t.after(() => transport.close());
  transport.wss.emit('error', new Error('later failure'));
  assert.deepEqual(errors, ['later failure']);
  const socket = await TestSocket.open(`ws://127.0.0.1:${port}`);
  socket.send({ t: 'ping', c: 1 });
  assert.equal((await socket.next()).t, 'pong', 'still serving after the error');
  await socket.close();
});

test('WsTransport.listen rejects when the port is taken', async t => {
  const first = new WsTransport(new RoomServer());
  const port = await first.listen(0, '127.0.0.1');
  t.after(() => first.close());
  const errors = [];
  const second = new WsTransport(new RoomServer(), { onError: error => errors.push(error) });
  await assert.rejects(second.listen(port, '127.0.0.1'), { code: 'EADDRINUSE' });
  assert.deepEqual(errors, [], 'bind failures go to the promise, not onError');
});

test('real ws sockets can create, join, start, ping and leave', async t => {
  const rooms = new RoomServer();
  const transport = new WsTransport(rooms);
  const port = await transport.listen(0, '127.0.0.1');
  t.after(() => transport.close());
  const url = `ws://127.0.0.1:${port}`;

  const host = await TestSocket.open(url);
  host.send({ t: 'create', name: 'Ann', level: 'ch2' });
  const created = await host.next();
  assert.equal(created.t, 'room');
  assert.match(created.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
  assert.equal(created.you, 'p1');

  const guest = await TestSocket.open(url);
  guest.send({ t: 'join', name: 'Bo', code: created.code });
  const joined = await guest.next();
  assert.equal(joined.you, 'p2');
  assert.deepEqual((await host.next()).players.map(player => player.name), ['Ann', 'Bo']);

  guest.send('not json');
  assert.deepEqual(await guest.next(), { t: 'error', code: 'bad-message' });
  guest.ws.send(Buffer.from('{"t":"leave"}'), { binary: true });
  assert.deepEqual(await guest.next(), { t: 'error', code: 'bad-message' });

  guest.send({ t: 'ping', c: 42 });
  const pong = await guest.next();
  assert.equal(pong.t, 'pong');
  assert.equal(pong.c, 42);
  assert.equal(typeof pong.s, 'number');

  host.send({ t: 'start' });
  assert.equal((await host.next()).state, 'playing');
  assert.equal((await guest.next()).state, 'playing');

  await guest.close();
  assert.deepEqual((await host.next()).players, [{ id: 'p1', name: 'Ann' }]);
  await host.close();
  for (let i = 0; i < 100 && rooms.clients.size > 0; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(rooms.rooms.size, 0, 'closing the last socket deletes the room');
  assert.equal(rooms.clients.size, 0);
});
