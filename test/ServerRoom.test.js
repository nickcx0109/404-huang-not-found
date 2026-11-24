import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, RoomState, AdmitRefusal, StartResult } from '../server/rooms/Room.js';
import { RoomGame } from '../server/rooms/RoomGame.js';
import { RoomCodes, CODE_ALPHABET } from '../server/rooms/RoomCodes.js';
import { FakeMember } from './support/FakeMember.js';

class RecordingGame extends RoomGame {
  constructor() { super(); this.calls = []; }
  start(room) { this.calls.push(['start', room.code]); room.broadcast({ t: 'event', name: 'go' }); }
  tick(room, dt) { this.calls.push(['tick', dt]); }
  input(room, id, message) { this.calls.push(['input', id, message.seq]); }
  action(room, id, message) { this.calls.push(['action', id, message.kind]); }
  memberLeft(room, id) { this.calls.push(['left', id]); }
  end(room) { this.calls.push(['end', room.code]); }
}

function sequence(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

test('RoomCodes builds 4-character codes from the unambiguous alphabet', () => {
  const codes = new RoomCodes({ random: sequence([0, 0.5, 0.99, 0.999999]) });
  const code = codes.next();
  assert.equal(code.length, 4);
  assert.equal(code, 'A' + CODE_ALPHABET[15] + CODE_ALPHABET[30] + CODE_ALPHABET[30]);
  for (const char of new RoomCodes().next()) assert.ok(CODE_ALPHABET.includes(char));
  assert.ok(!/[01OIL]/.test(CODE_ALPHABET));
});

test('RoomCodes skips codes that are already taken and gives up eventually', () => {
  const codes = new RoomCodes({ random: sequence([0, 0, 0, 0, 0.04, 0.04, 0.04, 0.04]) });
  assert.equal(codes.next(code => code === 'AAAA'), 'BBBB');
  const stuck = new RoomCodes({ random: () => 0, maxAttempts: 5 });
  assert.throws(() => stuck.next(() => true), /No free room code/);
  assert.equal(RoomCodes.normalize(' k7qx '), 'K7QX');
});

test('Room admits three members with ids p1..p3 and refuses a fourth', () => {
  const room = new Room('ABCD', 'ch2');
  const [a, b, c] = [new FakeMember(), new FakeMember(), new FakeMember()];
  assert.equal(room.add(a, 'Ann'), 'p1');
  assert.equal(room.add(b, 'Bo'), 'p2');
  assert.equal(room.add(c, 'Cy'), 'p3');
  assert.equal(room.admitRefusal(), AdmitRefusal.FULL);
  assert.throws(() => room.add(new FakeMember(), 'Dee'), /full/);
  assert.deepEqual(a.last, {
    t: 'room', code: 'ABCD', you: 'p1', level: 'ch2', state: RoomState.LOBBY,
    players: [{ id: 'p1', name: 'Ann' }, { id: 'p2', name: 'Bo' }, { id: 'p3', name: 'Cy' }],
  });
  assert.equal(c.last.you, 'p3');
});

test('Room reuses a freed slot and announces the roster when someone leaves', () => {
  const room = new Room('ABCD', 'ch2');
  const [a, b] = [new FakeMember(), new FakeMember()];
  room.add(a, 'Ann');
  room.add(b, 'Bo');
  assert.equal(room.remove('p1'), true);
  assert.equal(room.remove('p1'), false);
  assert.deepEqual(b.last.players, [{ id: 'p2', name: 'Bo' }]);
  assert.equal(room.add(new FakeMember(), 'Cy'), 'p1');
});

test('Room start switches to playing once and drives the game strategy', () => {
  const game = new RecordingGame();
  const room = new Room('WXYZ', 'ch2', game);
  const a = new FakeMember();
  room.add(a, 'Ann');
  room.tick(1 / 30);
  room.receiveInput('p1', { seq: 1 });
  assert.deepEqual(game.calls, [], 'lobby rooms do not run the game');
  assert.equal(room.start(), StartResult.STARTED);
  assert.equal(room.start(), StartResult.ALREADY_PLAYING);
  assert.equal(room.admitRefusal(), AdmitRefusal.STARTED);
  assert.deepEqual(a.ofType('event'), [{ t: 'event', name: 'go' }]);
  assert.equal(a.last.state, RoomState.PLAYING);
  room.tick(0.5);
  room.receiveInput('p1', { seq: 7 });
  room.receiveAction('p1', { kind: 'fire' });
  room.receiveInput('p9', { seq: 8 });
  room.remove('p1');
  assert.deepEqual(game.calls, [
    ['start', 'WXYZ'], ['tick', 0.5], ['input', 'p1', 7], ['action', 'p1', 'fire'], ['left', 'p1'], ['end', 'WXYZ'],
  ]);
  assert.equal(room.isEmpty, true);
});

test('Room stays in the lobby when the game refuses or fails to start', () => {
  const errors = [];
  const logger = { error: (...args) => errors.push(args) };
  for (const game of [
    new (class extends RoomGame { start() { return false; } })(),
    new (class extends RoomGame { start() { throw new Error('level missing'); } })(),
  ]) {
    const room = new Room('ABCD', 'ch2', game, { logger });
    const [a, b] = [new FakeMember(), new FakeMember()];
    room.add(a, 'Ann');
    room.add(b, 'Bo');
    a.clear();
    b.clear();
    assert.equal(room.start(), StartResult.FAILED);
    assert.equal(room.state, RoomState.LOBBY);
    assert.equal(room.admitRefusal(), null, 'others can still join');
    for (const member of [a, b]) assert.deepEqual(member.sent, [{ t: 'error', code: 'start-failed' }]);
  }
  assert.equal(errors.length, 1, 'only the throw is logged');
});

test('Room is still in the lobby while the game starts', () => {
  const seen = [];
  const game = new (class extends RoomGame { start(room) { seen.push(room.state); return true; } })();
  const room = new Room('ABCD', 'ch2', game);
  room.add(new FakeMember(), 'Ann');
  assert.equal(room.start(), StartResult.STARTED);
  assert.deepEqual(seen, [RoomState.LOBBY]);
  assert.equal(room.state, RoomState.PLAYING);
});

test('Room sendTo targets one member and broadcast reaches everyone', () => {
  const room = new Room('ABCD', 'ch2');
  const [a, b] = [new FakeMember(), new FakeMember()];
  room.add(a, 'Ann');
  room.add(b, 'Bo');
  a.clear();
  b.clear();
  assert.equal(room.sendTo('p2', { t: 'x' }), true);
  assert.equal(room.sendTo('p3', { t: 'x' }), false);
  room.broadcast({ t: 'y' });
  assert.deepEqual(a.sent, [{ t: 'y' }]);
  assert.deepEqual(b.sent, [{ t: 'x' }, { t: 'y' }]);
});
