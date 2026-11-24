import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { InputThrottle, ThrottleResult, MIN_INPUT_INTERVAL_MS } from '../server/game/InputThrottle.js';
import { RoomServer } from '../server/RoomServer.js';
import { LevelCatalog } from '../server/rooms/LevelCatalog.js';
import { SessionRoomGame, STEP_SECONDS } from '../server/game/SessionRoomGame.js';
import { FakeMember } from './support/FakeMember.js';

const ch2 = JSON.parse(readFileSync(new URL('../web/levels/ch2.json', import.meta.url), 'utf8'));

/** Records what reaches it, like a RemoteController. */
class Target {
  constructor() { this.seen = []; }
  accept(message, now) {
    this.seen.push([message.seq, now]);
    return 'moved';
  }
}

const input = seq => ({ t: 'input', seq, x: seq, y: 0, z: 0, yaw: 0, pitch: 0 });

test('InputThrottle passes inputs at the normal 30 Hz straight through', () => {
  const target = new Target();
  const throttle = new InputThrottle(target);
  for (let seq = 1; seq <= 5; seq++) assert.equal(throttle.offer(input(seq), seq * 1000 / 30), 'moved');
  assert.deepEqual(target.seen.map(([seq]) => seq), [1, 2, 3, 4, 5]);
  assert.equal(throttle.flush(200), null, 'nothing waits');
  assert.equal(throttle.dropped, 0);
});

test('InputThrottle keeps only the newest of a burst and applies it on flush', () => {
  const target = new Target();
  const throttle = new InputThrottle(target, { minIntervalMs: 20 });
  assert.equal(throttle.offer(input(1), 0), 'moved');
  assert.equal(throttle.offer(input(2), 1), ThrottleResult.DEFERRED);
  assert.equal(throttle.offer(input(3), 2), ThrottleResult.DEFERRED);
  assert.equal(throttle.offer(input(4), 3), ThrottleResult.DEFERRED);
  assert.deepEqual(target.seen, [[1, 0]]);
  assert.equal(throttle.flush(10), 'moved');
  assert.deepEqual(target.seen, [[1, 0], [4, 10]], 'the latest input is never lost');
  assert.equal(throttle.dropped, 2);
  assert.equal(throttle.flush(11), null);
});

test('InputThrottle: an input after the interval replaces a pending one', () => {
  const target = new Target();
  const throttle = new InputThrottle(target, { minIntervalMs: 20 });
  throttle.offer(input(1), 0);
  throttle.offer(input(2), 5);
  assert.equal(throttle.offer(input(3), 25), 'moved');
  assert.deepEqual(target.seen.map(([seq]) => seq), [1, 3]);
  assert.equal(throttle.flush(30), null, 'the older pending input is gone');
});

test('InputThrottle never lets an older seq replace a newer pending input', () => {
  const target = new Target();
  const throttle = new InputThrottle(target, { minIntervalMs: 20 });
  throttle.offer(input(5), 0);
  throttle.offer(input(9), 1);
  throttle.offer(input(7), 2);
  throttle.flush(5);
  assert.deepEqual(target.seen.map(([seq]) => seq), [5, 9]);
});

test('InputThrottle bounds applied inputs however fast they come', () => {
  const target = new Target();
  const throttle = new InputThrottle(target);
  let seq = 0;
  // One second of a client sending 5000 inputs a second, with a server tick every 1/30 s.
  for (let ms = 0; ms < 1000; ms += 0.2) {
    throttle.offer(input(++seq), ms);
    if (Math.floor(ms / (1000 / 30)) !== Math.floor((ms + 0.2) / (1000 / 30))) throttle.flush(ms);
  }
  throttle.flush(1000);
  const most = Math.ceil(1000 / MIN_INPUT_INTERVAL_MS) + 31;
  assert.ok(target.seen.length <= most, `applied ${target.seen.length}, at most ${most}`);
  assert.equal(target.seen.at(-1)[0], seq, 'the newest input still lands');
});

test('InputThrottle.reset forgets the pending input and the last time', () => {
  const target = new Target();
  const throttle = new InputThrottle(target, { minIntervalMs: 20 });
  throttle.offer(input(1), 0);
  throttle.offer(input(2), 1);
  throttle.reset();
  assert.equal(throttle.flush(2), null);
  assert.equal(throttle.offer(input(1), 3), 'moved');
});

function playing(t) {
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
  const host = new FakeMember('host');
  server.connect(host);
  const send = message => server.receive(host, JSON.stringify(message));
  send({ t: 'create', name: 'Ann', level: 'ch2' });
  send({ t: 'start' });
  const game = games[0];
  const controller = game.controllers.get('p1');
  let calls = 0;
  const accept = controller.accept.bind(controller);
  controller.accept = (message, at) => {
    calls++;
    return accept(message, at);
  };
  const tick = () => {
    clock.ms += STEP_SECONDS * 1000;
    server.tick(STEP_SECONDS);
  };
  return { send, tick, controller, host, calls: () => calls };
}

test('a flood of inputs in one tick costs one controller move and ends on the newest pose', t => {
  const { send, tick, controller, calls } = playing(t);
  const spawn = ch2.spawns.players[0];
  for (let seq = 1; seq <= 1000; seq++) {
    send({ t: 'input', seq, x: spawn.x + seq * 0.0002, y: 0, z: spawn.z, yaw: seq / 1000, pitch: 0 });
  }
  assert.equal(calls(), 1, 'only the first one moved the player before the tick');
  tick();
  assert.equal(calls(), 2, 'the tick applied the newest pending one');
  assert.equal(controller.ack, 1000);
  assert.equal(controller.yaw, 1, 'the pose is the newest one');
});

test('an action right after a throttled input aims with that input', t => {
  const { send, controller, calls } = playing(t);
  const spawn = ch2.spawns.players[0];
  send({ t: 'input', seq: 1, x: spawn.x, y: 0, z: spawn.z, yaw: 0, pitch: 0 });
  send({ t: 'input', seq: 2, x: spawn.x, y: 0, z: spawn.z, yaw: 1.25, pitch: 0 });
  assert.equal(controller.yaw, 0, 'the second input is held back');
  send({ t: 'action', seq: 1, kind: 'reload', at: 1_000_000 });
  assert.equal(controller.yaw, 1.25, 'flushed before the action');
  assert.equal(calls(), 2);
});
