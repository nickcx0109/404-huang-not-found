import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomServer } from '../server/RoomServer.js';
import { RoomCodes } from '../server/rooms/RoomCodes.js';
import { RoomGame } from '../server/rooms/RoomGame.js';
import { FakeMember } from './support/FakeMember.js';

/** A server with predictable codes: AAAA, BBBB, CCCC, ... */
function makeServer(options = {}) {
  let next = 0;
  const alphabetSize = 31;
  const codes = new RoomCodes({ random: () => (Math.floor(next++ / 4) % alphabetSize + 0.5) / alphabetSize });
  return new RoomServer({ codes, now: () => 5000, ...options });
}

function connect(server, label) {
  const connection = new FakeMember(label);
  server.connect(connection);
  return connection;
}

const send = (server, connection, message) =>
  server.receive(connection, typeof message === 'string' ? message : JSON.stringify(message));

function createRoom(server, name = 'Ann') {
  const host = connect(server, name);
  send(server, host, { t: 'create', name, level: 'ch2' });
  return { host, code: host.last.code };
}

test('create opens a room with a fresh code and replies with room', () => {
  const server = makeServer();
  const { host, code } = createRoom(server);
  assert.equal(code, 'AAAA');
  assert.deepEqual(host.last, {
    t: 'room', code: 'AAAA', you: 'p1', players: [{ id: 'p1', name: 'Ann' }], level: 'ch2', state: 'lobby',
  });
  assert.equal(createRoom(server, 'Bo').code, 'BBBB');
  assert.equal(server.rooms.size, 2);
});

test('a new room never reuses the code of a live room', () => {
  const draws = [0, 0, 0, 0, 0, 0, 0, 0, 0.04, 0.04, 0.04, 0.04];
  const server = makeServer({ codes: new RoomCodes({ random: () => draws.shift() ?? 0 }) });
  assert.equal(createRoom(server).code, 'AAAA');
  assert.equal(createRoom(server, 'Bo').code, 'BBBB');
});

test('join by code adds the player and updates everyone', () => {
  const server = makeServer();
  const { host, code } = createRoom(server);
  const guest = connect(server, 'Bo');
  send(server, guest, { t: 'join', name: 'Bo', code: code.toLowerCase() });
  const players = [{ id: 'p1', name: 'Ann' }, { id: 'p2', name: 'Bo' }];
  assert.deepEqual(guest.last, { t: 'room', code, you: 'p2', players, level: 'ch2', state: 'lobby' });
  assert.deepEqual(host.last.players, players);
  assert.equal(host.last.you, 'p1');
});

test('a fourth player gets full', () => {
  const server = makeServer();
  const { code } = createRoom(server);
  for (const name of ['Bo', 'Cy']) send(server, connect(server, name), { t: 'join', name, code });
  const late = connect(server, 'Dee');
  send(server, late, { t: 'join', name: 'Dee', code });
  assert.deepEqual(late.sent, [{ t: 'error', code: 'full' }]);
  assert.equal(server.findRoom(code).size, 3);
});

test('joining after start gets started, and start twice gets started', () => {
  const server = makeServer();
  const { host, code } = createRoom(server);
  const guest = connect(server, 'Bo');
  send(server, guest, { t: 'join', name: 'Bo', code });
  send(server, guest, { t: 'start' });
  assert.equal(host.last.state, 'playing');
  assert.equal(guest.last.state, 'playing');
  const late = connect(server, 'Cy');
  send(server, late, { t: 'join', name: 'Cy', code });
  assert.deepEqual(late.sent, [{ t: 'error', code: 'started' }]);
  send(server, host, { t: 'start' });
  assert.deepEqual(host.last, { t: 'error', code: 'started' });
});

test('unknown codes and start outside a room get no-room', () => {
  const server = makeServer();
  const lost = connect(server, 'Ann');
  send(server, lost, { t: 'join', name: 'Ann', code: 'ZZZZ' });
  send(server, lost, { t: 'start' });
  assert.deepEqual(lost.sent, [{ t: 'error', code: 'no-room' }, { t: 'error', code: 'no-room' }]);
});

test('leaving updates the others and the last one out deletes the room', () => {
  const server = makeServer();
  const { host, code } = createRoom(server);
  const guest = connect(server, 'Bo');
  send(server, guest, { t: 'join', name: 'Bo', code });
  send(server, host, { t: 'leave' });
  assert.deepEqual(guest.last.players, [{ id: 'p2', name: 'Bo' }], 'the creator leaving does not close the room');
  assert.ok(server.findRoom(code));
  const hostMessages = host.sent.length;
  send(server, host, { t: 'leave' });
  assert.equal(host.sent.length, hostMessages, 'leave outside a room is a no-op');
  server.disconnect(guest);
  assert.equal(server.findRoom(code), null);
  assert.equal(server.rooms.size, 0);
  assert.equal(server.clients.size, 1);
});

test('a connection is in at most one room', () => {
  const server = makeServer();
  const first = createRoom(server, 'Ann');
  const second = createRoom(server, 'Bo');
  const roamer = connect(server, 'Cy');
  send(server, roamer, { t: 'join', name: 'Cy', code: first.code });
  send(server, roamer, { t: 'join', name: 'Cy', code: first.code });
  assert.equal(server.findRoom(first.code).size, 2, 'joining the same room twice does not duplicate');
  send(server, roamer, { t: 'join', name: 'Cy', code: second.code });
  assert.equal(server.findRoom(first.code).size, 1);
  assert.equal(server.findRoom(second.code).size, 2);
  send(server, second.host, { t: 'create', name: 'Bo', level: 'ch3' });
  assert.equal(server.findRoom(second.code).size, 1);
  assert.equal(second.host.last.level, 'ch3');
  assert.equal(server.rooms.size, 3);
});

test('a refused join keeps the player in their current room', () => {
  const server = makeServer();
  const playing = createRoom(server, 'Bo');
  send(server, playing.host, { t: 'start' });
  const stay = createRoom(server, 'Cy');
  send(server, stay.host, { t: 'join', name: 'Cy', code: playing.code });
  assert.deepEqual(stay.host.last, { t: 'error', code: 'started' });
  assert.equal(server.findRoom(stay.code).size, 1);
  assert.equal(server.findRoom(playing.code).size, 1);
});

test('malformed messages get bad-message and change nothing', () => {
  const server = makeServer();
  const client = connect(server, 'Ann');
  for (const text of ['garbage', '{"t":"create"}', '{"t":"fly"}', JSON.stringify({ t: 'ping', c: 1, x: 'y'.repeat(5000) })]) {
    send(server, client, text);
  }
  server.receive(client, Buffer.from('{"t":"leave"}'));
  assert.equal(client.sent.length, 5);
  assert.ok(client.sent.every(message => message.t === 'error' && message.code === 'bad-message'));
  assert.equal(server.rooms.size, 0);
  server.receive(new FakeMember(), '{"t":"leave"}');
});

test('ping is answered with pong carrying both clocks', () => {
  const server = makeServer();
  const client = connect(server, 'Ann');
  send(server, client, { t: 'ping', c: 1234.5 });
  assert.deepEqual(client.sent, [{ t: 'pong', c: 1234.5, s: 5000 }]);
});

test('input and action reach the room game only while playing', () => {
  const calls = [];
  class SpyGame extends RoomGame {
    start(room) { calls.push(['start', room.code]); }
    tick(room, dt) { calls.push(['tick', dt]); }
    input(room, id, message) { calls.push(['input', id, message.seq]); room.sendTo(id, { t: 'ack', seq: message.seq }); }
    action(room, id, message) { calls.push(['action', id, message.kind]); }
    memberLeft(room, id) { calls.push(['left', id]); }
    end(room) { calls.push(['end', room.code]); }
  }
  const server = makeServer({ createGame: () => new SpyGame() });
  const { host, code } = createRoom(server);
  const input = { t: 'input', seq: 1, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  send(server, host, input);
  server.tick(1 / 30);
  assert.deepEqual(calls, []);
  send(server, host, { t: 'start' });
  send(server, host, { ...input, seq: 2 });
  send(server, host, { t: 'action', seq: 3, kind: 'fire', at: 4000 });
  server.tick(0.25);
  server.disconnect(host);
  assert.deepEqual(calls, [
    ['start', code], ['input', 'p1', 2], ['action', 'p1', 'fire'], ['tick', 0.25], ['left', 'p1'], ['end', code],
  ]);
  assert.deepEqual(host.ofType('ack'), [{ t: 'ack', seq: 2 }]);
  const stray = connect(server, 'Bo');
  send(server, stray, input);
  assert.deepEqual(stray.sent, [], 'input outside a room is silently ignored');
});
