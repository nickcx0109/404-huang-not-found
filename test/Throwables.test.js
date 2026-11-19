import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { CollisionWorld, Aabb } from '../web/js/CollisionWorld.js';
import { Grenade } from '../web/js/weapons/Grenade.js';
import { Molotov } from '../web/js/weapons/Molotov.js';
import { Effect } from '../web/js/effects/Effect.js';
import { ThrownGrenade } from '../web/js/effects/ThrownGrenade.js';
import { FireArea } from '../web/js/effects/FireArea.js';
import { EVENTS } from '../web/js/game/events.js';

function world(boxes = []) {
  const collision = new CollisionWorld();
  for (const box of boxes) collision.add(box);
  const events = new EventBus();
  const ctx = { events, collision, time: 0, enemies: [], players: [], effects: [],
    aim: { origin: { x: 0, y: 1.6, z: 0 }, direction: { x: 0, y: 0, z: -1 } } };
  const hits = [];
  events.on(EVENTS.DAMAGE_REQUESTED, info => hits.push(info));
  return { ctx, hits };
}

function enemy(id, x, z) {
  return { id, radius: 0.35, position: { x, y: 0, z }, damageable: { alive: true } };
}

function run(ctx, seconds) {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) {
    ctx.time = Math.round((ctx.time + 0.05) * 100) / 100;
    for (let index = 0; index < ctx.effects.length; index++) {
      if (!ctx.effects[index].update(0.05, ctx)) ctx.effects.splice(index--, 1);
    }
  }
}

test('Effect is abstract and needs a kind', () => {
  assert.throws(() => new Effect('x', { x: 0, z: 0 }), /abstract/);
});

test('Throwing spends one and puts a grenade in the world; the empty item is used up', () => {
  const { ctx } = world();
  const grenade = new Grenade({ count: 2 });
  grenade.ownerId = 'p1';
  const thrown = [];
  ctx.events.on(EVENTS.ITEM_THROWN, detail => thrown.push(detail.itemId));
  assert.equal(grenade.fire(ctx), true);
  assert.equal(grenade.count, 1);
  assert.equal(ctx.effects.length, 1);
  assert.equal(ctx.effects[0].kind, 'grenade');
  assert.equal(ctx.effects[0].velocity.z < 0, true, 'flies where the player looks');
  assert.equal(grenade.fire(ctx), false, 'cooldown between throws');
  ctx.time = 1;
  assert.equal(grenade.fire(ctx), true);
  assert.equal(grenade.depleted, true);
  assert.equal(grenade.fire(ctx), false, 'nothing left');
  assert.deepEqual(thrown, ['grenade', 'grenade']);
});

test('A grenade explodes after 3 seconds: 150 at the centre, less further out, nothing past 5 m', () => {
  const { ctx, hits } = world();
  const booms = [];
  ctx.events.on(EVENTS.EXPLODED, detail => booms.push(detail));
  ctx.enemies.push(enemy('near', 0.35, 0), enemy('mid', 2.85, 0), enemy('far', 7, 0));
  ctx.effects.push(new ThrownGrenade({ position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, ownerId: 'p1' }));
  run(ctx, 2.9);
  assert.equal(hits.length, 0, 'not before the fuse runs out');
  run(ctx, 0.2);
  assert.equal(booms.length, 1);
  assert.equal(ctx.effects.length, 0);
  const by = Object.fromEntries(hits.map(info => [info.targetId, info.amount]));
  assert.equal(by.near, 150);
  assert.equal(Math.round(by.mid), 90);
  assert.equal(by.far, undefined);
  assert.equal(hits[0].kind, 'explosion');
  assert.equal(hits[0].sourceId, 'p1');
});

test('A wall between the blast and an enemy shields it', () => {
  const { ctx, hits } = world([new Aabb(1, 0, -5, 1.4, 3, 5, 'wall')]);
  ctx.enemies.push(enemy('hidden', 3, 0), enemy('open', -3, 0));
  ctx.effects.push(new ThrownGrenade({ position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } }));
  run(ctx, 3.1);
  assert.deepEqual(hits.map(info => info.targetId), ['open']);
});

test('A thrown grenade bounces off a wall instead of passing through it', () => {
  const { ctx } = world([new Aabb(-5, 0, -3.2, 5, 3, -3, 'wall')]);
  const grenade = new ThrownGrenade({ position: { x: 0, y: 1.5, z: 0 }, velocity: { x: 0, y: 2, z: -12 } });
  ctx.effects.push(grenade);
  run(ctx, 2.5);
  assert.ok(grenade.position.z > -3, 'still on the near side of the wall');
  assert.equal(grenade.position.y, 0, 'lying on the ground');
});

test('A fire bottle breaks where it lands and burns 3 m for 6 seconds at 25 a second', () => {
  const { ctx, hits } = world();
  const bottle = new Molotov();
  bottle.ownerId = 'p1';
  bottle.fire(ctx);
  run(ctx, 2);
  assert.equal(ctx.effects.length, 1);
  const fire = ctx.effects[0];
  assert.ok(fire instanceof FireArea);
  assert.equal(fire.position.y, 0);
  ctx.enemies.push(enemy('in', fire.position.x + 2, fire.position.z), enemy('out', fire.position.x + 5, fire.position.z));
  run(ctx, 7);
  assert.equal(ctx.effects.length, 0, 'burned out');
  const inside = hits.filter(info => info.targetId === 'in');
  assert.equal(hits.some(info => info.targetId === 'out'), false);
  assert.ok(inside.length >= 9 && inside.length <= 12, 'about a tick every half second: ' + inside.length);
  assert.equal(inside[0].amount, 12.5);
  assert.equal(inside[0].kind, 'fire');
});
