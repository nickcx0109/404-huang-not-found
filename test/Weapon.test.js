import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { Aabb, CollisionWorld } from '../web/js/CollisionWorld.js';
import { Weapon } from '../web/js/weapons/Weapon.js';
import { Pistol } from '../web/js/weapons/Pistol.js';
import { HitscanFire } from '../web/js/weapons/HitscanFire.js';
import { WeaponHolder } from '../web/js/weapons/WeaponHolder.js';
import { EVENTS } from '../web/js/game/events.js';

test('Weapon template respects ammo, cooldown and reload deadlines with a fake clock', () => {
  const ctx = { events: new EventBus(), time: 0 };
  let shots = 0;
  const weapon = new Pistol({ fire: () => { shots++; return null; } });
  assert.throws(() => new Weapon({}));
  assert.equal(weapon.reload(ctx), false);
  assert.equal(weapon.fire(ctx), true);
  assert.equal(weapon.fire(ctx), false);
  assert.equal(weapon.ammo, 11);
  assert.equal(weapon.reload(ctx), true);
  assert.equal(weapon.reload(ctx), false);
  ctx.time = 1;
  assert.equal(weapon.fire(ctx), false);
  ctx.time = 1.1;
  weapon.update(0, ctx);
  assert.equal(weapon.ammo, 12);
  assert.equal(weapon.reserve, 59);
  for (let index = 0; index < 12; index++) {
    ctx.time = 2 + index * 0.25;
    assert.equal(weapon.fire(ctx), true);
  }
  ctx.time++;
  assert.equal(weapon.fire(ctx), false);
  assert.equal(shots, 13);
  weapon.reserve = 2;
  weapon.reload(ctx);
  ctx.time += 1.1;
  weapon.update(0, ctx);
  assert.equal(weapon.ammo, 2);
  assert.equal(weapon.reserve, 0);
  assert.equal(weapon.reload(ctx), false);
  weapon.refill();
  assert.equal(weapon.canRefill, false);
});

test('WeaponHolder switches by interface and lets holstered reloads complete', () => {
  const ctx = { time: 0, events: new EventBus() };
  const holder = new WeaponHolder('player', ctx.events);
  const first = holder.add(new Pistol({ fire: () => null }));
  const second = holder.add(new Pistol({ fire: () => null }));
  first.fire(ctx);
  first.reload(ctx);
  assert.equal(holder.switchTo(1), true);
  assert.equal(holder.current, second);
  assert.equal(second.ownerId, 'player');
  assert.equal(holder.switchTo(2), false);
  assert.throws(() => holder.add(first));
  ctx.time = 2;
  holder.update(2, ctx);
  assert.equal(first.ammo, 12);
});

test('Hitscan chooses the nearest live hit volume and cannot shoot through a collider', () => {
  const collision = new CollisionWorld();
  const events = new EventBus();
  const hits = [];
  events.on(EVENTS.DAMAGE_REQUESTED, info => hits.push(info));
  const enemy = { id: 'enemy', position: { y: 0 }, headHeight: 1.3,
    damageable: { alive: true }, hitVolume: new Aabb(-0.3, 0, -6, 0.3, 1.8, -5) };
  const farther = { ...enemy, id: 'far', hitVolume: new Aabb(-0.3, 0, -9, 0.3, 1.8, -8) };
  const ctx = { collision, events, enemies: [farther, enemy],
    aim: { origin: { x: 0, y: 1.5, z: 0 }, direction: { x: 0, y: 0, z: -1 } } };
  const mode = new HitscanFire();
  assert.equal(mode.fire({ range: 20, damage: 34 }, ctx, 'player').targetId, 'enemy');
  assert.equal(hits[0].hitPart, 'head');
  assert.equal(hits[0].sourceId, 'player');
  collision.add(new Aabb(-1, 0, -3, 1, 3, -2));
  assert.equal(mode.fire({ range: 20, damage: 34 }, ctx, 'player'), null);
  assert.equal(hits.length, 1);
  assert.equal(collision.raycast(ctx.aim.origin, ctx.aim.direction, 1), Infinity);
});
