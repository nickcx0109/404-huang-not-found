import test from 'node:test';
import assert from 'node:assert/strict';
import { Aabb, CollisionWorld } from '../web/js/CollisionWorld.js';
import { PathFinder } from '../web/js/PathFinder.js';
import { EventBus } from '../web/js/core/EventBus.js';
import { GameContext } from '../web/js/game/GameContext.js';
import { EnemyFactory } from '../web/js/enemies/EnemyFactory.js';
import { Walker } from '../web/js/enemies/Walker.js';
import { CrowdSeparation } from '../web/js/game/CrowdSeparation.js';

function fixture(x = 0, z = 0) {
  const collision = new CollisionWorld();
  collision.bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
  const ctx = new GameContext({ collision, pathFinder: new PathFinder(collision), events: new EventBus() });
  const factory = new EnemyFactory(ctx).register('walker', Walker);
  const a = factory.create('walker', { x, z });
  const b = factory.create('walker', { x, z });
  ctx.enemies.push(a, b);
  return { ctx, factory, a, b, separation: new CrowdSeparation() };
}

function assertFree(ctx) {
  for (const enemy of ctx.enemies) {
    assert.equal(ctx.collision.hit(enemy.position.x, enemy.position.z, enemy.radius, 0, enemy.height), null);
    assert.ok(enemy.position.x - enemy.radius >= ctx.collision.bounds.minX);
    assert.ok(enemy.position.x + enemy.radius <= ctx.collision.bounds.maxX);
    assert.equal(enemy.hitVolume.minX, enemy.position.x - enemy.radius, 'hit box follows separated body');
  }
}

test('CrowdSeparation splits coincident enemies by their summed radii, reuses buffers and syncs hit volumes', () => {
  const { ctx, factory, a, b, separation } = fixture();
  const movement = separation._movement;
  const position = a.position;
  separation.apply(ctx);
  assert.ok(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) >= a.radius + b.radius - 1e-9);
  assertFree(ctx);
  separation.apply(ctx);
  assert.equal(separation._movement, movement);
  assert.equal(a.position, position);
  factory.dispose();
});

test('CrowdSeparation sends correction away from a thin wall and respects bounds', () => {
  for (const side of [-1, 1]) {
    const { ctx, factory, a, b, separation } = fixture(side * 4.6);
    ctx.collision.add(side < 0 ? new Aabb(-4.24, 0, -1, -4.23, 3, 1) : new Aabb(4.23, 0, -1, 4.24, 3, 1));
    // Put the pair on the inner side of the wall (the outside corridor is too narrow).
    a.position.x = b.position.x = side * 3.87;
    for (let tick = 0; tick < 5; tick++) separation.apply(ctx);
    assertFree(ctx);
    assert.ok(Math.abs(a.position.x - b.position.x) >= a.radius + b.radius - 1e-9);
    assert.ok(side < 0 ? a.position.x > -4.23 && b.position.x > -4.23 : a.position.x < 4.23 && b.position.x < 4.23);
    factory.dispose();
  }
});

test('CrowdSeparation ignores inactive, dead and vertically disjoint enemies', () => {
  const { ctx, factory, a, b, separation } = fixture();
  for (const mode of ['inactive', 'dead', 'above']) {
    b.active = mode !== 'inactive';
    b.damageable.health = mode === 'dead' ? 0 : 60;
    b.position.y = mode === 'above' ? a.height : 0;
    separation.apply(ctx);
    assert.equal(a.position.x, 0);
    assert.equal(b.position.x, 0);
  }
  factory.dispose();
});

test('CrowdSeparation resolves diagonal overlap with different radii and overlap against the map edge', () => {
  const { ctx, factory, a, b, separation } = fixture();
  a.radius = 0.25;
  b.radius = 0.5;
  b.position.x = b.position.z = 0.1;
  separation.apply(ctx);
  assert.ok(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) >= 0.75 - 1e-9);
  a.position.x = b.position.x = ctx.collision.bounds.minX + b.radius;
  a.position.z = b.position.z = 0;
  separation.apply(ctx);
  assertFree(ctx);
  assert.ok(Math.abs(a.position.x - b.position.x) >= 0.75 - 1e-9);
  factory.dispose();
});
