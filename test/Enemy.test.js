import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { CollisionWorld, Aabb } from '../web/js/CollisionWorld.js';
import { PathFinder } from '../web/js/PathFinder.js';
import { GameContext } from '../web/js/game/GameContext.js';
import { EnemyFactory } from '../web/js/enemies/EnemyFactory.js';
import { Walker } from '../web/js/enemies/Walker.js';
import { Brain } from '../web/js/enemies/Brain.js';
import { Node, Action, Condition, Selector, Sequence, STATUS } from '../web/js/enemies/behaviour/Nodes.js';
import { DamageInfo } from '../web/js/entities/DamageInfo.js';

function context() {
  const collision = new CollisionWorld();
  collision.bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
  return new GameContext({ collision, pathFinder: new PathFinder(collision, { clearance: 0.002 }), events: new EventBus() });
}

test('Behaviour tree nodes propagate success, failure, running and short-circuit reactively', () => {
  let calls = 0;
  const success = new Action(() => { calls++; return STATUS.SUCCESS; });
  const running = new Action(() => STATUS.RUNNING);
  const failure = new Condition(() => false);
  assert.equal(new Sequence(success, failure, success).tick(), STATUS.FAILURE);
  assert.equal(calls, 1);
  assert.equal(new Sequence(success, running, success).tick(), STATUS.RUNNING);
  assert.equal(calls, 2);
  assert.equal(new Selector(failure, running, success).tick(), STATUS.RUNNING);
  assert.equal(new Selector(failure, success).tick(), STATUS.SUCCESS);
  assert.equal(new Selector(failure).tick(), STATUS.FAILURE);
  assert.equal(new Sequence().tick(), STATUS.SUCCESS);
  assert.equal(new Selector().tick(), STATUS.FAILURE);
  assert.throws(() => new Node().tick());
  assert.throws(() => new Brain().update());
  const entity = {};
  const ctx = {};
  assert.equal(new Condition((received, context) => received === entity && context === ctx).tick(entity, 0, ctx), STATUS.SUCCESS);
});

test('EnemyFactory validates registration and reuses pooled enemies with fresh identity and health', () => {
  const ctx = context();
  const factory = new EnemyFactory(ctx).register('walker', Walker);
  assert.throws(() => factory.register('walker', Walker), /Duplicate/);
  assert.throws(() => factory.register('bad', class {}), /subclass/);
  assert.throws(() => factory.create('missing', {}), /Unknown/);
  const first = factory.create('walker', { x: -2, z: -2 });
  const id = first.id;
  first.damageable.takeDamage(new DamageInfo({ amount: 68, targetId: id }));
  factory.release(first);
  assert.throws(() => factory.release(first), /not acquired/);
  const reused = factory.create('walker', { x: 2, z: 2 });
  assert.equal(reused, first);
  assert.notEqual(reused.id, id);
  assert.equal(reused.damageable.health, 68);
  assert.deepEqual(reused.position, { x: 2, y: 0, z: 2 });
  assert.equal(ctx.pools.get('enemy:walker').activeCount, 1);
  factory.dispose();
  assert.equal(first.disposed, true);
  assert.equal(ctx.pools.size, 0);
});

test('Walker follows buffered routes and melee cannot pass through cover', () => {
  const ctx = context();
  const target = { position: { x: 2, z: 0 }, body: { radius: 0.35 }, damageable: { alive: true } };
  ctx.players.push(target);
  const factory = new EnemyFactory(ctx).register('walker', Walker);
  const walker = factory.create('walker', { x: -2, z: 0 });
  for (let frame = 0; frame < 40; frame++) {
    ctx.time += 0.05;
    walker.update(0.05, ctx);
  }
  assert.ok(walker.position.x > -1);
  walker.position.x = 1.1;
  walker.position.z = 0;
  assert.equal(walker.canAttack(target, ctx), true);
  ctx.collision.add(new Aabb(1.4, 0, -1, 1.5, 3, 1));
  assert.equal(walker.canAttack(target, ctx), false);
});

test('Walker clears a tangent low-wall corner without floating-point navigation stalls', () => {
  const ctx = context();
  ctx.collision.bounds = { minX: -10, maxX: 10, minZ: 0, maxZ: 20 };
  ctx.collision.add(new Aabb(5, 0, 8.2, 5.6, 0.9, 11.4));
  ctx.pathFinder = new PathFinder(ctx.collision, { clearance: 0.002 });
  const target = { position: { x: 0, z: 15.2 }, body: { radius: 0.35 }, damageable: { alive: true } };
  ctx.players.push(target);
  const walker = new EnemyFactory(ctx).register('walker', Walker).create('walker', { x: 6.25, z: 10 });
  for (let frame = 0; frame < 500; frame++) {
    ctx.time += 0.05;
    walker.moveToward(target, 0.05, ctx);
  }
  assert.ok(Math.hypot(walker.position.x, walker.position.z - 15.2) < 0.2);
});
