import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../web/js/game/createSession.js';
import { Difficulty } from '../web/js/game/Difficulty.js';
import { EVENTS } from '../web/js/game/events.js';
import { EnemyHistory } from '../server/game/EnemyHistory.js';
import { ShotRewind } from '../server/game/ShotRewind.js';
import { RemoteController } from '../server/game/RemoteController.js';
import { ActionRegistry } from '../server/game/actions/ActionRegistry.js';

const fakeEnemy = (id, x, z = 0) => ({
  id, active: true, damageable: { alive: true }, position: { x, y: 0, z }, synced: 0,
  syncView() { this.synced++; },
});

test('EnemyHistory interpolates between steps and forgets frames older than its window', () => {
  const history = new EnemyHistory({ seconds: 1 });
  const enemy = fakeEnemy('enemy-1', 0);
  for (let time = 0; time <= 2000; time += 100) {
    enemy.position.x = time / 100;
    history.record(time, [enemy]);
  }
  assert.ok(history.frames[0].time >= 1000, 'nothing older than one second is kept');
  assert.ok(history.frames.length <= 11);
  assert.equal(history.positionAt('enemy-1', 1550).x, 15.5);
  assert.equal(history.positionAt('enemy-1', 500).x, 10, 'before the window: the oldest frame');
  assert.equal(history.positionAt('enemy-1', 9000).x, 20, 'after the newest: the newest frame');
  assert.equal(history.positionAt('enemy-2', 1500), null, 'unknown ids have no past');
});

test('EnemyHistory skips dead or pooled enemies, so a reused enemy starts without a past', () => {
  const history = new EnemyHistory();
  const dead = { ...fakeEnemy('enemy-1', 3), damageable: { alive: false } };
  const pooled = { ...fakeEnemy('enemy-2', 4), active: false };
  history.record(0, [dead, pooled]);
  assert.equal(history.newest.positions.size, 0);
});

test('ShotRewind aims 100 ms behind the shot, at most 250 ms back and never ahead of the server', () => {
  const rewind = new ShotRewind(new EnemyHistory());
  assert.equal(rewind.targetTime(10_000, 10_100), 9_900);
  assert.equal(rewind.targetTime(9_000, 10_000), 9_750);
  assert.equal(rewind.targetTime(20_000, 10_000), 10_000);
});

test('ShotRewind moves enemies and their hit volumes for one call, then puts them back', () => {
  const history = new EnemyHistory();
  const enemy = fakeEnemy('enemy-1', 0);
  const late = fakeEnemy('enemy-2', 7);
  history.record(1000, [enemy]);
  enemy.position.x = 5;
  history.record(1100, [enemy]);
  const rewind = new ShotRewind(history);
  const seen = rewind.run([enemy, late], 1100, 1100, () => [enemy.position.x, late.position.x]);
  assert.deepEqual(seen, [0, 7], 'rewound to 1000; an enemy without history stays put');
  assert.equal(enemy.position.x, 5);
  assert.equal(enemy.synced, 2);
  assert.throws(() => rewind.run([enemy], 1100, 1100, () => { throw new Error('boom'); }), /boom/);
  assert.equal(enemy.position.x, 5, 'restored even when the judge throws');
});

/** A real chapter-less session: one player at the origin looking toward −Z and one zombie 6 m ahead. */
function shootingRange(t) {
  const level = {
    name: 'range', bounds: { w: 40, d: 40 }, colliders: [], props: [], bookmarks: [],
    spawns: { players: [{ x: 0, z: 0 }], zombies: [{ x: 0, z: -6, r: 0 }] },
  };
  const controller = new RemoteController({ x: 0, z: 0 });
  const session = createSession(level, {
    players: [{ id: 'p1', controller }], difficulty: new Difficulty({ count: 0.5, speed: 0.001 }), rng: () => 0,
  });
  controller.attach(session, 'p1');
  t.after(() => session.dispose());
  session.start();
  for (let i = 0; i < 90 && session.context.enemies.length === 0; i++) session.update(1 / 30);
  const [zombie] = session.context.enemies;
  assert.ok(zombie, 'a zombie spawned');
  const history = new EnemyHistory();
  const rewind = new ShotRewind(history);
  const actions = ActionRegistry.standard();
  const hits = [];
  session.context.events.on(EVENTS.WEAPON_FIRED, ({ hit }) => hits.push(hit?.targetId ?? null));
  const now = 50_000;
  /** The zombie stood at x = path(time) over the last 400 ms, one frame per 50 ms; it is at path(now) now. */
  function walk(path) {
    history.clear();
    for (let time = now - 400; time <= now; time += 50) {
      zombie.position.x = path(time);
      zombie.syncView();
      history.record(time, session.context.enemies);
    }
  }
  /** Fires at `x` on the zombie's line, as a client that believes the server time is `at`. */
  function fireAt(x, at) {
    for (let i = 0; i < 10; i++) session.update(1 / 30); // past the pistol's cooldown
    controller.yaw = Math.atan2(-x, 6);
    controller.pitch = -0.05;
    actions.dispatch({ session, playerId: 'p1', controller, message: { t: 'action', kind: 'fire', seq: 1, at }, now, rewind });
    return hits.at(-1);
  }
  return { zombie, walk, fireAt, now };
}

test('a shot aimed where the zombie was 150 ms ago hits it; the same shot without rewind misses', t => {
  const { zombie, walk, fireAt, now } = shootingRange(t);
  // Stood at x = 3 until 150 ms ago, then stepped to x = 0.
  walk(time => (time <= now - 150 ? 3 : 0));
  assert.equal(fireAt(3, now - 50), zombie.id, 'the client saw it at at − 100 ms = now − 150 ms');
  assert.ok(Math.abs(zombie.position.x) < 0.01, 'back where it really is (it creeps a little each step)');
  assert.equal(fireAt(3, now + 100), null, 'judged at now: the zombie is no longer there');
});

test('a shot from 400 ms ago is judged 250 ms back, not where the zombie was then', t => {
  const { zombie, walk, fireAt, now } = shootingRange(t);
  // At x = -3 until 300 ms ago, at x = 3 from 250 ms ago until 100 ms ago, now at x = 0.
  walk(time => (time <= now - 300 ? -3 : time <= now - 100 ? 3 : 0));
  assert.equal(fireAt(-3, now - 300), null, 'where it stood 400 ms ago is too old');
  assert.equal(fireAt(3, now - 300), zombie.id, 'clamped to now − 250 ms, when it stood at x = 3');
});
