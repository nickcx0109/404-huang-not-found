import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld, Aabb } from '../web/js/CollisionWorld.js';
import { PathFinder } from '../web/js/PathFinder.js';
import { EventBus } from '../web/js/core/EventBus.js';
import { GameContext } from '../web/js/game/GameContext.js';
import { GameSession } from '../web/js/game/GameSession.js';
import { WaveTable, ENEMY_TYPES } from '../web/js/game/WaveTable.js';
import { TimedWaveDirector, SPAWN_RETRY_SECONDS } from '../web/js/game/TimedWaveDirector.js';
import { SURVIVAL_WAVES } from '../web/js/game/waves/survival.js';
import { EnemyFactory } from '../web/js/enemies/EnemyFactory.js';
import { Walker } from '../web/js/enemies/Walker.js';
import { CombatPlayer } from '../web/js/player/CombatPlayer.js';
import { DamageInfo } from '../web/js/entities/DamageInfo.js';
import { EVENTS } from '../web/js/game/events.js';

function context() {
  const collision = new CollisionWorld();
  collision.bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
  return new GameContext({ collision, pathFinder: new PathFinder(collision), events: new EventBus(),
    level: { spawns: { zombies: [{ x: 5, z: 5, r: 1 }] }, markers: [] }, rng: () => 0.5 });
}

test('WaveTable exposes the five balancing rows and explicit linear overflow', () => {
  const table = new WaveTable(SURVIVAL_WAVES);
  const expected = [
    [4, 0, 0, 0, 1.2, 3, 6], [4, 2, 0, 0, 1, 4, 7], [5, 2, 1, 1, 0.9, 6, 8],
    [6, 3, 1, 2, 0.75, 8, 9], [8, 4, 2, 2, 0.65, 10, 10],
    [10, 5, 2, 3, 0.65, 10, 10], [12, 6, 2, 4, 0.65, 10, 10],
  ];
  for (let index = 0; index < expected.length; index++) {
    const spec = table.get(index + 1);
    assert.deepEqual([...ENEMY_TYPES.map(type => spec.counts[type]), spec.spawnInterval, spec.maxAlive, spec.breakSeconds], expected[index]);
    assert.equal(spec.total, expected[index].slice(0, 4).reduce((a, b) => a + b));
  }
  assert.deepEqual(table.get(100).counts, { walker: 198, runner: 99, tank: 2, exploder: 97 });
});

for (const wave of [1, 2, 3, 4, 5, 6, 9]) {
  test(`TimedWaveDirector wave ${wave} follows counts, types, interval, live cap and break duration`, () => {
    const ctx = context();
    const director = new TimedWaveDirector(SURVIVAL_WAVES);
    const spec = director.table.get(wave);
    const result = {};
    const counts = Object.fromEntries(ENEMY_TYPES.map(type => [type, 0]));
    director.start(wave, ctx);
    assert.equal(director.remaining, spec.total);
    assert.equal(director.breakSeconds, spec.breakSeconds);
    for (let index = 0; index < spec.total; index++) {
      if (index > 0) {
        director.update(spec.spawnInterval - 0.001, ctx);
        assert.equal(director.nextSpawn(ctx, result), false);
        director.update(0.001, ctx);
      }
      // Fill the field, including a dead body which must not count toward the cap.
      ctx.enemies = Array.from({ length: spec.maxAlive }, () => ({ damageable: { alive: true } }));
      ctx.enemies.push({ damageable: { alive: false } });
      director.update(20, ctx);
      assert.equal(director.nextSpawn(ctx, result), false);
      assert.equal(director.remaining, spec.total - index);
      ctx.enemies[0].damageable.alive = false;
      assert.equal(director.nextSpawn(ctx, result), true);
      counts[result.type]++;
      assert.equal(ctx.collision.hit(result.x, result.z, ctx.pathFinder.radius, 0, ctx.pathFinder.height), null);
      assert.equal(director.nextSpawn(ctx, result), false, 'no burst after time spent capped');
      assert.equal(director.remaining, spec.total - index - 1);
    }
    assert.deepEqual(counts, spec.counts);
    director.update(100, ctx);
    assert.equal(director.nextSpawn(ctx, result), false);
    ctx.enemies.length = 0;
    director.start(wave, ctx);
    assert.equal(director.nextSpawn(ctx, result), true, 'new wave resets its clock and counts');
  });
}

test('TimedWaveDirector retries spawn regions without consuming counts or returning a wall point', () => {
  const ctx = context();
  const director = new TimedWaveDirector(SURVIVAL_WAVES);
  ctx.level.spawns.zombies = [];
  assert.throws(() => director.start(1, ctx), /spawn areas/);
  ctx.level.spawns.zombies = [{ x: 0, z: 0, r: 0 }];
  ctx.collision.add(new Aabb(-1, 0, -1, 1, 3, 1));
  director.start(1, ctx);
  assert.equal(director.nextSpawn(ctx, {}), false);
  assert.equal(director.remaining, 4);
  ctx.level.spawns.zombies[0].x = 5;
  assert.equal(director.nextSpawn(ctx, {}), false, 'waits before retrying');
  director.update(SPAWN_RETRY_SECONDS, ctx);
  assert.equal(director.nextSpawn(ctx, {}), true);
  for (const dt of [-1, NaN, Infinity]) assert.throws(() => director.update(dt, ctx), /dt/);
});

test('WaveTable owns immutable data and rejects malformed fields with their locations', () => {
  const invalid = [
    [data => { data.waves = []; }, /waves/],
    [data => { data.waves[0] = null; }, /waves\[0\].counts/],
    [data => { delete data.waves[0].counts.runner; }, /counts.runner/],
    [data => { data.waves[0].counts.walker = -1; }, /counts.walker/],
    [data => { data.waves[0].counts.walker = 1.5; }, /counts.walker/],
    [data => { data.waves[0].counts.boss = 1; }, /unknown enemy type/],
    [data => { data.waves[0].counts.walker = 0; }, /positive safe total/],
    [data => { data.waves[0].spawnInterval = 0; }, /spawnInterval/],
    [data => { data.waves[0].spawnInterval = Infinity; }, /spawnInterval/],
    [data => { data.waves[0].maxAlive = 41; }, /maxAlive/],
    [data => { data.waves[0].maxAlive = 1.5; }, /maxAlive/],
    [data => { data.waves[0].breakSeconds = -1; }, /breakSeconds/],
    [data => { data.waves[0].breakSeconds = NaN; }, /breakSeconds/],
    [data => { delete data.overflow; }, /overflow.addPerWave/],
    [data => { data.overflow.addPerWave.tank = '1'; }, /overflow.addPerWave.tank/],
  ];
  for (const [mutate, message] of invalid) {
    const data = structuredClone(SURVIVAL_WAVES);
    mutate(data);
    assert.throws(() => new WaveTable(data), message);
  }
  const data = structuredClone(SURVIVAL_WAVES);
  const table = new WaveTable(data);
  data.waves[0].counts.walker = 100;
  assert.equal(table.get(1).total, 4);
  assert.throws(() => { table.get(6).counts.walker = 100; }, TypeError);
  for (const wave of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => table.get(wave), /wave/);
  assert.throws(() => table.get(Number.MAX_SAFE_INTEGER), /overflow counts/);
});

test('GameSession keeps playing through empty spawn gaps, clears only the exhausted wave and uses each row break', () => {
  const ctx = context();
  const player = new CombatPlayer('player', { x: 0, z: 0 }, ctx.events);
  ctx.players.push(player);
  const data = structuredClone(SURVIVAL_WAVES);
  data.waves = [
    { counts: { walker: 2, runner: 0, tank: 0, exploder: 0 }, spawnInterval: 0.2, maxAlive: 1, breakSeconds: 0.15 },
    { counts: { walker: 1, runner: 0, tank: 0, exploder: 0 }, spawnInterval: 0.1, maxAlive: 1, breakSeconds: 0.3 },
  ];
  const factory = new EnemyFactory(ctx).register('walker', Walker);
  const director = new TimedWaveDirector(data);
  let separations = 0;
  const session = new GameSession(ctx, { factory, director, separation: { apply: actual => {
    assert.equal(actual, ctx);
    separations++;
  } } });
  const started = [];
  ctx.events.on(EVENTS.WAVE_STARTED, detail => started.push(detail));
  const kill = () => ctx.events.emit(EVENTS.DAMAGE_REQUESTED, new DamageInfo({ amount: 1000, sourceId: player.id, targetId: ctx.enemies[0].id }));
  session.start();
  session.update(0.05);
  assert.equal(ctx.enemies.length, 1);
  assert.equal(director.remaining, 1);
  kill();
  session.update(0.05);
  assert.equal(ctx.enemies.length, 0);
  assert.equal(session.state, 'playing');
  session.update(0.05);
  session.update(0.05);
  assert.equal(ctx.enemies.length, 0);
  session.update(0.05);
  assert.equal(ctx.enemies.length, 1);
  assert.equal(director.remaining, 0);
  assert.equal(session.state, 'playing', 'live enemy prevents clearing');
  kill();
  session.update(0.05);
  assert.equal(session.state, 'wave-break');
  assert.ok(Math.abs(session.breakEndsAt - ctx.time - 0.15) < 1e-9);
  session.update(0.05);
  session.update(0.05);
  assert.equal(session.state, 'wave-break');
  session.update(0.05);
  assert.equal(session.wave, 2);
  kill();
  session.update(0.05);
  assert.equal(session.state, 'wave-break');
  assert.ok(Math.abs(session.breakEndsAt - ctx.time - 0.3) < 1e-9);
  assert.deepEqual(started, [{ wave: 1, count: 2 }, { wave: 2, count: 1 }]);
  assert.equal(separations, 6);
  session.dispose();
});

test('GameSession keeps running when every spawn sample is blocked and spawns once the area frees up', () => {
  const ctx = context();
  ctx.level.spawns.zombies = [{ x: 5, z: 5, r: 0 }];
  const blocker = new Aabb(4, 0, 4, 6, 3, 6);
  ctx.collision.add(blocker);
  const player = new CombatPlayer('p1', { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, ctx.events);
  ctx.players.push(player);
  const factory = new EnemyFactory(ctx).register('walker', Walker).register('runner', Walker)
    .register('tank', Walker).register('exploder', Walker);
  const session = new GameSession(ctx, { factory, director: new TimedWaveDirector(SURVIVAL_WAVES) });
  session.start();
  assert.doesNotThrow(() => { for (let tick = 0; tick < 20; tick++) session.update(0.05); });
  assert.equal(session.state, 'playing');
  assert.equal(ctx.enemies.length, 0);
  ctx.collision.boxes.splice(ctx.collision.boxes.indexOf(blocker), 1);
  for (let tick = 0; tick < 10; tick++) session.update(0.05);
  assert.equal(ctx.enemies.length, 1);
  session.dispose();
});
