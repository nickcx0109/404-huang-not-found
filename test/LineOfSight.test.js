import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld, Aabb } from '../web/js/CollisionWorld.js';
import { LineOfSight } from '../web/js/pickups/LineOfSight.js';
import { CombatPlayer } from '../web/js/player/CombatPlayer.js';
import { EventBus } from '../web/js/core/EventBus.js';
import { DamageInfo } from '../web/js/entities/DamageInfo.js';
import { GameContext } from '../web/js/game/GameContext.js';
import { GameSession } from '../web/js/game/GameSession.js';

function fixture(world) {
  const events = new EventBus();
  const ctx = new GameContext({ events, collision: world });
  const a = new CombatPlayer('a', { x: 0, z: 0 }, events);
  const b = new CombatPlayer('b', { x: 1.5, z: 0 }, events);
  ctx.players.push(a, b);
  const session = new GameSession(ctx, { factory: { dispose() {} }, director: {
    remaining: 1, start() {}, update() {}, nextSpawn() { return false; },
  } });
  session.start(); session.update(0);
  b.damageable.takeDamage(new DamageInfo({ sourceId: 'test', targetId: b.id, amount: 100 }));
  return { a, b, revive: session.revives };
}

test('LineOfSight is clear in the open and blocked by a collider between the players', () => {
  const world = new CollisionWorld();
  const a = { position: { x: 0, z: 0 } };
  const b = { position: { x: 1.5, z: 0 } };
  const sight = new LineOfSight(world);
  assert.equal(sight.clear(a, b), true);
  world.add(new Aabb(0.6, 0, -2, 0.8, 3, 2));
  assert.equal(sight.clear(a, b), false);
  assert.equal(new LineOfSight(null).clear(a, b), true);
});

test('a wall between rescuer and downed teammate blocks the revive prompt and progress', () => {
  const world = new CollisionWorld();
  world.add(new Aabb(0.6, 0, -2, 0.8, 3, 2));
  const { a, b, revive } = fixture(world);
  assert.equal(revive.targetFor(a), null);
  assert.equal(revive.take(a), false);
  revive.hold(a.id, true); revive.update(5);
  assert.equal(b.downed, true);
  assert.equal(revive.progressFor(a), null);
});

test('an obstruction appearing mid-revive cancels the progress', () => {
  const world = new CollisionWorld();
  const { a, b, revive } = fixture(world);
  revive.hold(a.id, true); revive.update(2);
  assert.ok(revive.progressFor(a));
  world.add(new Aabb(0.6, 0, -2, 0.8, 3, 2));
  revive.update(0.1);
  assert.equal(revive.progressFor(a), null);
  assert.equal(b.downed, true);
});
