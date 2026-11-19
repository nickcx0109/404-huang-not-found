import test from 'node:test';
import assert from 'node:assert/strict';
import { Difficulty } from '../web/js/game/Difficulty.js';
import { WaveTable } from '../web/js/game/WaveTable.js';
import { SURVIVAL_WAVES } from '../web/js/game/waves/survival.js';
import { EnemyFactory } from '../web/js/enemies/EnemyFactory.js';
import { GameContext } from '../web/js/game/GameContext.js';
import { EventBus } from '../web/js/core/EventBus.js';
import { PathFinder } from '../web/js/PathFinder.js';
import { CollisionWorld } from '../web/js/CollisionWorld.js';
import { Walker } from '../web/js/enemies/Walker.js';
import { Exploder } from '../web/js/enemies/Exploder.js';

function context() {
  const collision = new CollisionWorld();
  collision.bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
  return new GameContext({ collision, pathFinder: new PathFinder(collision, { clearance: 0.002 }), events: new EventBus() });
}

test('Difficulty rejects nonsense', () => {
  assert.throws(() => new Difficulty({ count: 0 }), RangeError);
  assert.throws(() => new Difficulty({ speed: -1 }), RangeError);
  assert.throws(() => new Difficulty({ damage: Infinity }), RangeError);
});

test('Difficulty scales every wave and the overflow, spawning faster but never past the alive cap', () => {
  const scaled = new Difficulty({ count: 10 }).waves(SURVIVAL_WAVES);
  const first = SURVIVAL_WAVES.waves[0];
  assert.deepEqual(scaled.waves[0].counts, { walker: 40, runner: 0, tank: 0, exploder: 0 });
  assert.equal(scaled.waves[0].maxAlive, 30);
  assert.ok(Math.abs(scaled.waves[0].spawnInterval - first.spawnInterval / 10) < 1e-9);
  assert.equal(scaled.waves[0].breakSeconds, first.breakSeconds);
  assert.ok(scaled.waves.every(row => row.maxAlive <= 40));
  assert.deepEqual(scaled.overflow.addPerWave, { walker: 20, runner: 10, tank: 0, exploder: 10 });
  // The copy is valid wave data and the original is untouched.
  const table = new WaveTable(scaled);
  assert.equal(table.get(1).total, 40);
  assert.equal(table.get(6).total, new WaveTable(SURVIVAL_WAVES).get(6).total * 10);
  assert.equal(SURVIVAL_WAVES.waves[0].counts.walker, 4);
});

test('Difficulty of 1 leaves the waves as they were', () => {
  const same = new Difficulty().waves(SURVIVAL_WAVES);
  assert.deepEqual(same.waves.map(row => row.counts), SURVIVAL_WAVES.waves.map(row => row.counts));
  assert.deepEqual(same.waves.map(row => row.maxAlive), SURVIVAL_WAVES.waves.map(row => row.maxAlive));
});

test('EnemyFactory tunes each zombie once, so pooled zombies do not keep speeding up', () => {
  const ctx = context();
  const difficulty = new Difficulty({ speed: 5, damage: 0.5 });
  const factory = new EnemyFactory(ctx, () => null, { prepare: enemy => difficulty.tune(enemy) })
    .register('walker', Walker).register('exploder', Exploder);
  const plain = new Walker({ events: ctx.events, pathFinder: ctx.pathFinder });
  const walker = factory.create('walker', { x: 0, z: 0 });
  assert.equal(walker.speed, plain.speed * 5);
  assert.equal(walker.attackDamage, plain.attackDamage * 0.5);
  factory.release(walker);
  const again = factory.create('walker', { x: 1, z: 1 });
  assert.equal(again, walker, 'the pool hands back the same zombie');
  assert.equal(again.speed, plain.speed * 5);
  const exploder = factory.create('exploder', { x: 2, z: 2 });
  assert.equal(exploder.blastDamage, 20);
});
