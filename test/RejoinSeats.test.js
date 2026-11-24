import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RoomServer, REJOIN_GRACE_MS } from '../server/RoomServer.js';
import { Room, RoomState } from '../server/rooms/Room.js';
import { RoomGame } from '../server/rooms/RoomGame.js';
import { RejoinTokens, TOKEN_PATTERN } from '../server/rooms/RejoinTokens.js';
import { LevelCatalog } from '../server/rooms/LevelCatalog.js';
import { MessageParser } from '../server/protocol/ClientMessages.js';
import { SessionRoomGame, STEP_SECONDS } from '../server/game/SessionRoomGame.js';
import { parseServerMessage, roundCoord } from '../web/js/net/protocol.js';
import { FakeMember } from './support/FakeMember.js';

const ch2 = JSON.parse(readFileSync(new URL('../web/levels/ch2.json', import.meta.url), 'utf8'));

/** Tokens t0000000000000000, t0000000000000001, ... */
function countingTokens() {
  let next = 0;
  return { issue: () => 't' + String(next++).padStart(16, '0') };
}

class SpyGame extends RoomGame {
  constructor() { super(); this.calls = []; }
  memberAway(room, id) { this.calls.push(['away', id]); }
  memberBack(room, id) { this.calls.push(['back', id]); }
  memberLeft(room, id) { this.calls.push(['left', id]); }
  end() { this.calls.push(['end']); }
}

function playingRoom() {
  const game = new SpyGame();
  const room = new Room('ABCD', 'ch2', game, { tokens: countingTokens() });
  const [a, b] = [new FakeMember('a'), new FakeMember('b')];
  room.add(a, 'Ann');
  room.add(b, 'Bo');
  room.start();
  return { room, game, a, b };
}

test('RejoinTokens issues 128-bit base64url tokens the join schema accepts', () => {
  const tokens = new RejoinTokens();
  const first = tokens.issue();
  assert.match(first, TOKEN_PATTERN);
  assert.equal(first.length, 22);
  assert.notEqual(tokens.issue(), first);
  const fixed = new RejoinTokens({ bytes: size => Buffer.alloc(size, 0xff) });
  assert.equal(fixed.issue(), '_____________________w');
});

test('Room sends each member only their own token', () => {
  const { a, b } = playingRoom();
  assert.equal(a.last.token, 't0000000000000000');
  assert.equal(b.last.token, 't0000000000000001');
  assert.ok(!JSON.stringify(a.sent).includes('t0000000000000001'), 'a never sees b\'s token');
});

test('Room.drop removes a lobby member but holds a seat during the game', () => {
  const lobby = new Room('ABCD', 'ch2', new SpyGame(), { tokens: countingTokens() });
  lobby.add(new FakeMember(), 'Ann');
  lobby.add(new FakeMember(), 'Bo');
  assert.equal(lobby.drop('p2', 10_000), false);
  assert.equal(lobby.size, 1);

  const { room, game, a, b } = playingRoom();
  assert.equal(room.drop('p2', 10_000), true);
  assert.equal(room.size, 2, 'the seat stays taken');
  assert.equal(room.isAway('p2'), true);
  assert.deepEqual(game.calls, [['away', 'p2']]);
  assert.deepEqual(a.last.players, [{ id: 'p1', name: 'Ann' }, { id: 'p2', name: 'Bo', away: true }]);
  const before = b.sent.length;
  assert.equal(room.sendTo('p2', { t: 'snapshot' }), false, 'nobody to send to');
  room.broadcast({ t: 'event' });
  assert.equal(b.sent.length, before);
});

test('Room.reclaim gives the held seat back to the token holder only', () => {
  const { room, game, a } = playingRoom();
  room.drop('p2', 10_000);
  const back = new FakeMember('b2');
  assert.equal(room.reclaim('t0000000000000000x', back), null, 'a wrong token takes nothing');
  assert.equal(room.reclaim(undefined, back), null);
  assert.deepEqual(room.reclaim('t0000000000000001', back), { id: 'p2', previous: null });
  assert.equal(room.isAway('p2'), false);
  assert.deepEqual(game.calls, [['away', 'p2'], ['back', 'p2']]);
  assert.equal(back.last.you, 'p2');
  assert.equal(back.last.state, RoomState.PLAYING);
  assert.deepEqual(a.last.players, [{ id: 'p1', name: 'Ann' }, { id: 'p2', name: 'Bo' }]);
});

test('Room.reclaim takes over a seat whose old connection has not been seen closing', () => {
  const { room, game, b } = playingRoom();
  const fresh = new FakeMember('b2');
  assert.deepEqual(room.reclaim('t0000000000000001', fresh), { id: 'p2', previous: b });
  assert.deepEqual(game.calls, [], 'the player never left the game');
  room.sendTo('p2', { t: 'snapshot' });
  assert.deepEqual(fresh.last, { t: 'snapshot' });
});

test('Room.expire frees seats whose deadline passed as if the player left', () => {
  const { room, game, a } = playingRoom();
  room.drop('p2', 10_000);
  assert.deepEqual(room.expire(9_999), []);
  assert.deepEqual(room.expire(10_000), ['p2']);
  assert.deepEqual(game.calls, [['away', 'p2'], ['left', 'p2']]);
  assert.deepEqual(a.last.players, [{ id: 'p1', name: 'Ann' }]);
  assert.equal(room.canReclaim('t0000000000000001'), false, 'the token dies with the seat');
  room.drop('p1', 20_000);
  room.expire(20_000);
  assert.equal(room.isEmpty, true);
  assert.deepEqual(game.calls.at(-1), ['end']);
});

test('the join schema takes an optional token of the right shape', () => {
  const parser = new MessageParser();
  const join = { t: 'join', name: 'Bo', code: 'ABCD' };
  assert.deepEqual(parser.parse(JSON.stringify(join)), join);
  assert.deepEqual(parser.parse(JSON.stringify({ ...join, token: 'abcDEF123_-abcDEF123_' })),
    { ...join, token: 'abcDEF123_-abcDEF123_' });
  assert.equal(parser.parse(JSON.stringify({ ...join, token: 'short' })), null);
  assert.equal(parser.parse(JSON.stringify({ ...join, token: 'has spaces in it, bad!' })), null);
  assert.equal(parser.parse(JSON.stringify({ ...join, token: 42 })), null);
});

/** A RoomServer with a fake clock and a two-player room already playing. */
function playingServer(options = {}) {
  const clock = { ms: 5000 };
  const server = new RoomServer({
    now: () => clock.ms, levels: new LevelCatalog(['ch2']), tokens: countingTokens(), ...options,
  });
  const send = (connection, message) => server.receive(connection, JSON.stringify(message));
  const connect = label => {
    const connection = new FakeMember(label);
    server.connect(connection);
    return connection;
  };
  const host = connect('host');
  send(host, { t: 'create', name: 'Ann', level: 'ch2' });
  const code = host.last.code;
  const guest = connect('guest');
  send(guest, { t: 'join', name: 'Bo', code });
  const token = guest.last.token;
  send(host, { t: 'start' });
  return { server, clock, send, connect, host, guest, code, token, room: server.findRoom(code) };
}

test('RoomServer holds a dropped player\'s seat and the token takes it back', () => {
  const { server, clock, send, connect, host, guest, code, token, room } = playingServer();
  server.disconnect(guest);
  assert.equal(room.isAway('p2'), true);
  assert.equal(server.clients.has(guest), false);
  clock.ms += REJOIN_GRACE_MS - 1;
  server.tick(STEP_SECONDS);
  const back = connect('back');
  send(back, { t: 'join', name: 'Bo', code, token });
  assert.equal(back.last.t, 'room');
  assert.equal(back.last.you, 'p2');
  assert.equal(back.last.token, token, 'the token stays the same for the next drop');
  assert.equal(server.clients.get(back).playerId, 'p2');
  assert.deepEqual(host.last.players, [{ id: 'p1', name: 'Ann' }, { id: 'p2', name: 'Bo' }]);
});

test('joining a started room without a valid token still gets started', () => {
  const { server, send, connect, guest, code, token } = playingServer();
  server.disconnect(guest);
  const stranger = connect('stranger');
  send(stranger, { t: 'join', name: 'Cy', code });
  assert.deepEqual(stranger.last, { t: 'error', code: 'started' });
  send(stranger, { t: 'join', name: 'Cy', code, token: token.replace('0', 'x') });
  assert.deepEqual(stranger.last, { t: 'error', code: 'started' });
  assert.equal(server.clients.get(stranger).room, null);
});

test('a held seat expires after the grace period and its token stops working', () => {
  const { server, clock, send, connect, host, guest, code, token } = playingServer();
  server.disconnect(guest);
  clock.ms += REJOIN_GRACE_MS;
  server.tick(STEP_SECONDS);
  assert.deepEqual(host.last.players, [{ id: 'p1', name: 'Ann' }]);
  const late = connect('late');
  send(late, { t: 'join', name: 'Bo', code, token });
  assert.deepEqual(late.last, { t: 'error', code: 'started' });
});

test('a room whose every seat expires is deleted', () => {
  const { server, clock, host, guest, code } = playingServer({ rejoinGraceMs: 1000 });
  server.disconnect(host);
  server.disconnect(guest);
  assert.equal(server.rooms.has(code), true, 'kept while the seats are held');
  clock.ms += 1000;
  server.tick(STEP_SECONDS);
  assert.equal(server.rooms.has(code), false);
});

test('a rejoin while the old connection still looks open takes the seat over', () => {
  const { server, send, connect, guest, code, token } = playingServer();
  const fresh = connect('fresh');
  send(fresh, { t: 'join', name: 'Bo', code, token });
  assert.equal(fresh.last.you, 'p2');
  assert.equal(server.clients.get(guest).room, null, 'the old connection is out of the room');
  server.disconnect(guest);
  assert.equal(server.findRoom(code).isAway('p2'), false, 'its late close does not hold the seat again');
});

test('the lobby still lets a disconnected player go at once', () => {
  const clock = { ms: 0 };
  const server = new RoomServer({ now: () => clock.ms, levels: new LevelCatalog(['ch2']) });
  const host = new FakeMember();
  const guest = new FakeMember();
  server.connect(host);
  server.connect(guest);
  server.receive(host, JSON.stringify({ t: 'create', name: 'Ann', level: 'ch2' }));
  server.receive(guest, JSON.stringify({ t: 'join', name: 'Bo', code: host.last.code }));
  server.disconnect(guest);
  assert.deepEqual(host.last.players, [{ id: 'p1', name: 'Ann' }]);
});

test('a rejoined player keeps id, health, weapon and position in the running session', t => {
  const clock = { ms: 1_000_000 };
  const now = () => clock.ms;
  const games = [];
  const server = new RoomServer({
    now, levels: new LevelCatalog(['ch2']),
    createGame: () => {
      const game = new SessionRoomGame({ now, sessionOptions: { rng: () => 0.5 } });
      games.push(game);
      return game;
    },
  });
  t.after(() => { for (const game of games) game.end(); });
  const send = (connection, message) => server.receive(connection, JSON.stringify(message));
  const run = steps => {
    for (let index = 0; index < steps; index++) {
      clock.ms += STEP_SECONDS * 1000;
      server.tick(STEP_SECONDS);
    }
  };
  const host = new FakeMember('host');
  const guest = new FakeMember('guest');
  server.connect(host);
  server.connect(guest);
  send(host, { t: 'create', name: 'Ann', level: 'ch2' });
  const code = host.last.code;
  send(guest, { t: 'join', name: 'Bo', code });
  const token = guest.last.token;
  send(host, { t: 'start' });
  const spawn = ch2.spawns.players[1];
  let seq = 0;
  for (let step = 0; step < 15; step++) {
    send(guest, { t: 'input', seq: ++seq, x: spawn.x + 0.1 * step, y: 0, z: spawn.z, yaw: 0.5, pitch: 0 });
    run(1);
  }
  const session = games[0].session;
  session.playerById('p2').damageable.health = 61;
  const before = guest.ofType('snapshot').at(-1).players.find(player => player.id === 'p2');

  server.disconnect(guest);
  run(30);
  const held = session.playerById('p2');
  assert.ok(held, 'the player stays in the session while away');
  assert.equal(roundCoord(games[0].controllers.get('p2').x), before.x, 'nobody moves an away player');

  const back = new FakeMember('back');
  server.connect(back);
  send(back, { t: 'join', name: 'Bo', code, token });
  assert.ok(back.sent.every(message => parseServerMessage(JSON.stringify(message))), 'every message parses');
  run(3);
  const snapshot = back.ofType('snapshot').at(-1);
  assert.ok(snapshot, 'snapshots resume on the new connection');
  const me = snapshot.players.find(player => player.id === 'p2');
  assert.equal(me.health, 61);
  assert.equal(me.weapon, before.weapon);
  assert.equal(me.x, before.x);
  assert.equal(me.z, before.z);
  assert.equal(snapshot.ack, -1, 'the new connection numbers its inputs again');

  // A reloaded page starts its seq at 1; the server takes it.
  send(back, { t: 'input', seq: 1, x: before.x + 0.2, y: 0, z: before.z, yaw: 0, pitch: 0 });
  run(2);
  const moved = back.ofType('snapshot').at(-1);
  assert.equal(moved.ack, 1);
  assert.equal(moved.players.find(player => player.id === 'p2').x, roundCoord(before.x + 0.2));
});
