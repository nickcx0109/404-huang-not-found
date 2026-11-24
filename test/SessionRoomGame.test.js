import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RoomServer } from '../server/RoomServer.js';
import { LevelCatalog } from '../server/rooms/LevelCatalog.js';
import { SessionRoomGame, levelFileLoader, STEP_SECONDS } from '../server/game/SessionRoomGame.js';
import { EVENTS } from '../web/js/game/events.js';
import { Difficulty } from '../web/js/game/Difficulty.js';
import { PLAYER_SPEED } from '../web/js/player/PlayerSpeed.js';
import { parseServerMessage } from '../web/js/net/protocol.js';
import { FakeMember } from './support/FakeMember.js';

const ch2 = JSON.parse(readFileSync(new URL('../web/levels/ch2.json', import.meta.url), 'utf8'));
const STEP_MS = STEP_SECONDS * 1000;

/** A RoomServer running SessionRoomGame on a fake clock, plus helpers to drive it like the browsers would. */
function makeServer(t, gameOptions = {}) {
  const clock = { ms: 1_000_000 };
  const now = () => clock.ms;
  const games = [];
  const server = new RoomServer({
    now, levels: new LevelCatalog(['ch2', 'empty']),
    createGame: () => {
      const game = new SessionRoomGame({ now, sessionOptions: { rng: () => 0.5 }, ...gameOptions });
      games.push(game);
      return game;
    },
  });
  t.after(() => { for (const game of games) game.end(); });
  const send = (connection, message) => server.receive(connection, JSON.stringify(message));
  const connect = label => {
    const connection = new FakeMember(label);
    server.connect(connection);
    return connection;
  };
  /** Advances the fake clock by one step, lets `each` send messages, then ticks the server. */
  const run = (steps, each = () => {}) => {
    for (let index = 0; index < steps; index++) {
      clock.ms += STEP_MS;
      each(index);
      server.tick(STEP_SECONDS);
    }
  };
  return { server, clock, games, send, connect, run };
}

/** What a browser keeps for itself: its own position and the next input seq. */
class Browser {
  constructor(connection, send) {
    this.connection = connection;
    this.send = send;
    this.seq = 0;
    this.actionSeq = 0;
  }

  get id() { return this.connection.ofType('room').at(-1).you; }

  get snapshots() { return this.connection.ofType('snapshot'); }

  get me() { return this.snapshots.at(-1).players.find(player => player.id === this.id); }

  placeAt(spawn) {
    this.x = spawn.x;
    this.z = spawn.z;
  }

  input({ x = this.x, z = this.z, yaw = 0, pitch = 0 } = {}) {
    this.x = x;
    this.z = z;
    this.send(this.connection, { t: 'input', seq: ++this.seq, x, y: 0, z, yaw, pitch });
  }

  action(kind, at, fields = {}) {
    this.send(this.connection, { t: 'action', seq: ++this.actionSeq, kind, at, ...fields });
  }
}

function startTwoPlayerGame(t, options) {
  const harness = makeServer(t, options);
  const { send, connect } = harness;
  const host = new Browser(connect('host'), send);
  send(host.connection, { t: 'create', name: 'Ann', level: 'ch2' });
  const code = host.connection.last.code;
  const guest = new Browser(connect('guest'), send);
  send(guest.connection, { t: 'join', name: 'Bo', code });
  send(host.connection, { t: 'start' });
  host.placeAt(ch2.spawns.players[0]);
  guest.placeAt(ch2.spawns.players[1]);
  return { ...harness, host, guest, room: harness.server.findRoom(code) };
}

function assertEveryMessageParses(...connections) {
  for (const connection of connections) {
    for (const message of connection.sent) {
      assert.deepEqual(parseServerMessage(JSON.stringify(message)), message, `${connection.label}: ${message.t}`);
    }
  }
}

test('two players start ch2: they stand on their spawns and get 20 snapshots per second of game time', t => {
  const { host, guest, room, run } = startTwoPlayerGame(t);
  assert.equal(room.state, 'playing');
  run(90);
  for (const browser of [host, guest]) {
    assert.equal(browser.snapshots.length, 60, `${browser.connection.label}: 3 s at 20 per second`);
    const ticks = browser.snapshots.map(snapshot => snapshot.tick);
    assert.deepEqual(ticks.slice(0, 4), [2, 3, 5, 6], 'two snapshots every three steps');
  }
  const last = host.snapshots.at(-1);
  assert.equal(last.state, 'playing');
  assert.equal(last.ack, -1, 'no input yet');
  assert.deepEqual(last.players.map(player => [player.id, player.x, player.z]),
    [['p1', ch2.spawns.players[0].x, ch2.spawns.players[0].z], ['p2', ch2.spawns.players[1].x, ch2.spawns.players[1].z]]);
  assertEveryMessageParses(host.connection, guest.connection);
});

test('inputs move the players, acks follow each player\'s own seq, and a teleport is clamped', t => {
  const { host, guest, run } = startTwoPlayerGame(t);
  const stride = PLAYER_SPEED.walk * STEP_SECONDS;
  run(30, () => {
    host.input({ z: host.z - stride });
    guest.input({ z: guest.z - stride, yaw: 0.25 });
    guest.input({ z: guest.z, yaw: 0.25 }); // the guest sends twice as many, so the acks differ
  });
  assert.equal(host.snapshots.at(-1).ack, 30);
  assert.equal(guest.snapshots.at(-1).ack, 60);
  assert.ok(Math.abs(host.me.z - host.z) < 0.011, `host z ${host.me.z} follows ${host.z}`);
  assert.ok(Math.abs(guest.me.z - guest.z) < 0.011);
  assert.equal(guest.me.yaw, 0.25);
  const hostSeen = host.snapshots.at(-1).players.find(player => player.id === 'p2');
  assert.deepEqual([hostSeen.x, hostSeen.z], [guest.me.x, guest.me.z], 'everyone sees the same positions');

  const before = { x: host.me.x, z: host.me.z };
  run(1, () => host.input({ x: host.x + 20 }));
  const moved = Math.hypot(host.me.x - before.x, host.me.z - before.z);
  const allowance = PLAYER_SPEED.sprint * STEP_SECONDS * 1.5 + 0.5;
  assert.ok(moved <= allowance + 0.01, `moved ${moved} m, at most ${allowance}`);
  assert.ok(host.x - host.me.x > 19, 'the snapshot carries the server position, far from the claimed one');
  assertEveryMessageParses(host.connection, guest.connection);
});

test('zombies appear near the players, a fire action shoots, and every message parses on the client', t => {
  // Players who stand still for 30 s must survive to shoot afterwards.
  const difficulty = new Difficulty({ count: 10, speed: 2, damage: 0.001 });
  const { host, guest, run, clock } = startTwoPlayerGame(t, { sessionOptions: { rng: () => 0.5, difficulty } });
  run(30 * 30);
  const withZombies = host.snapshots.find(snapshot => snapshot.enemies.length > 0);
  assert.ok(withZombies, 'zombies show up within 30 s');
  for (const snapshot of host.snapshots) {
    for (const enemy of snapshot.enemies) {
      const distance = Math.min(...snapshot.players.map(player => Math.hypot(player.x - enemy.x, player.z - enemy.z)));
      assert.ok(distance <= 60, `zombie ${enemy.id} is ${distance} m from the nearest player`);
    }
  }
  assert.ok(host.connection.ofType('event').some(event => event.name === EVENTS.WAVE_STARTED));

  run(1, () => host.action('fire', clock.ms - 50));
  run(2); // the next snapshot is due within two steps
  const fired = guest.connection.ofType('event').filter(event => event.name === EVENTS.WEAPON_FIRED);
  assert.equal(fired.length, 1, 'the guest hears the host\'s shot');
  assert.deepEqual(Object.keys(fired[0].detail), ['ownerId', 'weaponId', 'ammo', 'reserve', 'hit']);
  assert.equal(fired[0].detail.ownerId, 'p1');
  assert.equal(host.me.ammo, 11);
  assertEveryMessageParses(host.connection, guest.connection);
});

test('a player who leaves mid-game is taken out of the run and the other keeps playing', t => {
  const { host, guest, room, run, send, games } = startTwoPlayerGame(t);
  run(30);
  send(guest.connection, { t: 'leave' });
  const [game] = games;
  assert.deepEqual(game.session.context.players.map(player => player.id), ['p1']);
  assert.equal(game.controllers.has('p2'), false);
  const count = host.snapshots.length;
  const guestCount = guest.snapshots.length;
  run(30, () => host.input({ z: host.z - 0.1 }));
  assert.equal(host.snapshots.length, count + 20);
  assert.equal(guest.snapshots.length, guestCount, 'nothing more for the one who left');
  assert.deepEqual(host.snapshots.at(-1).players.map(player => player.id), ['p1']);
  assert.equal(host.snapshots.at(-1).state, 'playing');
  assert.equal(room.state, 'playing');

  send(host.connection, { t: 'leave' });
  assert.equal(game.session, null, 'the last one out ends the session');
});

test('a level that fails to load or has no spawns keeps the room in the lobby with start-failed', t => {
  for (const loadLevel of [
    () => { throw new Error('missing file'); },
    () => ({ ...ch2, spawns: { players: [], zombies: [] } }),
  ]) {
    const { send, connect, server } = makeServer(t, { loadLevel });
    const host = connect('host');
    send(host, { t: 'create', name: 'Ann', level: 'ch2' });
    const room = server.findRoom(host.last.code);
    room.logger = { error() {} }; // the failure is expected; keep the test output quiet
    send(host, { t: 'start' });
    assert.deepEqual(host.last, { t: 'error', code: 'start-failed' });
    assert.equal(room.state, 'lobby');
  }
});

test('a third player starts on the third spawn; ids past the spawn list reuse the last one', t => {
  const game = new SessionRoomGame({ loadLevel: () => ch2, now: () => 0, sessionOptions: { rng: () => 0.5 } });
  t.after(() => game.end());
  const room = { level: 'ch2', players: [{ id: 'p3', name: 'C' }, { id: 'p9', name: 'D' }], broadcast() {}, sendTo() {} };
  assert.equal(game.start(room), true);
  const [third, ninth] = ['p3', 'p9'].map(id => game.controllers.get(id));
  assert.deepEqual([third.x, third.z], [ch2.spawns.players[2].x, ch2.spawns.players[2].z]);
  assert.deepEqual([ninth.x, ninth.z], [ch2.spawns.players.at(-1).x, ch2.spawns.players.at(-1).z]);
});

test('levelFileLoader reads web/levels/<name>.json', () => {
  assert.equal(levelFileLoader()('ch2').name, ch2.name);
  assert.throws(() => levelFileLoader()('no-such-level'));
});

test('a late ticker catches up a few steps at once, stamped one step apart for shot rewind', t => {
  const clock = { ms: 10_000 };
  const game = new SessionRoomGame({ loadLevel: () => ch2, now: () => clock.ms, sessionOptions: { rng: () => 0.5 } });
  t.after(() => game.end());
  const room = { level: 'ch2', players: [{ id: 'p1', name: 'A' }], broadcast() {}, sendTo() {} };
  game.start(room);
  game.tick(room, STEP_SECONDS * 3 + 0.001);
  assert.equal(game.tickCount, 3);
  const times = game.history.frames.map(frame => frame.time);
  assert.deepEqual(times.map(time => Math.round(time - times[0])), [0, 33, 67]);
  assert.equal(times.at(-1), clock.ms);
  game.tick(room, 10);
  assert.equal(game.tickCount, 8, 'at most five steps per tick; the rest is dropped');
});
