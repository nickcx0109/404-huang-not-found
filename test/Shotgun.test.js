import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { Aabb, CollisionWorld } from '../web/js/CollisionWorld.js';
import { Shotgun } from '../web/js/weapons/Shotgun.js';
import { Rifle } from '../web/js/weapons/Rifle.js';
import { Pistol } from '../web/js/weapons/Pistol.js';
import { SpreadFire } from '../web/js/weapons/SpreadFire.js';
import { WeaponHolder } from '../web/js/weapons/WeaponHolder.js';
import { WeaponTrigger } from '../web/js/weapons/WeaponTrigger.js';
import { EVENTS } from '../web/js/game/events.js';

test('Shotgun respects prototype fire rate, empty magazine and reload deadlines', () => {
  const ctx = { time: 0, events: new EventBus() };
  let shots = 0;
  const shotgun = new Shotgun({ fire: shot => {
    assert.deepEqual(shot, { damage: 15, range: 60, pellets: 9, spread: 0.065 });
    shots++;
    return null;
  } });
  assert.equal(shotgun.magazine, 6);
  assert.equal(shotgun.reserve, 36);
  assert.equal(shotgun.reload(ctx), false);
  for (let index = 0; index < 6; index++) {
    ctx.time = index * 0.85;
    assert.equal(shotgun.fire(ctx), true);
    ctx.time += 0.849;
    assert.equal(shotgun.fire(ctx), false);
  }
  ctx.time = 6;
  assert.equal(shotgun.fire(ctx), false);
  assert.equal(shots, 6);
  assert.equal(shotgun.reload(ctx), true);
  assert.equal(shotgun.reload(ctx), false);
  ctx.time = 8.099;
  assert.equal(shotgun.fire(ctx), false);
  ctx.time = 8.1;
  shotgun.update(0, ctx);
  assert.equal(shotgun.ammo, 6);
  assert.equal(shotgun.reserve, 30);
  assert.equal(shotgun.fire(ctx), true);
  shotgun.ammo = 0;
  shotgun.reserve = 2;
  assert.equal(shotgun.reload(ctx), true);
  ctx.time += 2.1;
  shotgun.update(0, ctx);
  assert.equal(shotgun.ammo, 2);
  assert.equal(shotgun.reserve, 0);
  assert.equal(shotgun.reload(ctx), false);
});

test('SpreadFire uses injectable uniform-disk randomness without changing the shared aim', () => {
  const aim = { origin: { x: 1, y: 2, z: 3 }, direction: { x: 0, y: 0, z: -1 } };
  const samples = [0, 1, 0.25, 0.25, 0.5, 0];
  const directions = [];
  const hit = { targetId: 'enemy' };
  const mode = new SpreadFire({ rng: () => samples.shift(), fireMode: { fire: (shot, ctx, ownerId) => {
    assert.equal(ownerId, 'player');
    assert.equal(ctx.aim.origin, aim.origin);
    directions.push({ ...ctx.aim.direction });
    return directions.length === 2 ? hit : null;
  } } });
  assert.equal(mode.fire({ damage: 15, range: 60, pellets: 3, spread: 0.065 }, { aim }, 'player'), hit);
  assert.equal(samples.length, 0);
  assert.equal(directions.length, 3);
  assert.ok(Math.abs(directions[0].x / -directions[0].z - 0.065) < 1e-12);
  assert.ok(Math.abs(directions[1].y / -directions[1].z - 0.0325) < 1e-12);
  assert.deepEqual(directions[2], aim.direction);
  for (const direction of directions) assert.ok(Math.abs(Math.hypot(direction.x, direction.y, direction.z) - 1) < 1e-12);
  assert.deepEqual(aim, { origin: { x: 1, y: 2, z: 3 }, direction: { x: 0, y: 0, z: -1 } });
});

test('SpreadFire remains finite and bounded for vertical and oblique aim using context RNG', () => {
  for (const direction of [{ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0.6, y: 0, z: -0.8 }]) {
    let calls = 0;
    const mode = new SpreadFire({ fireMode: { fire: (shot, ctx) => {
      calls++;
      const pellet = ctx.aim.direction;
      assert.ok(Math.abs(Math.hypot(pellet.x, pellet.y, pellet.z) - 1) < 1e-12);
      const cosine = pellet.x * direction.x + pellet.y * direction.y + pellet.z * direction.z;
      assert.ok(Math.abs(cosine - 1 / Math.sqrt(1 + 0.065 ** 2)) < 1e-12);
      return null;
    } } });
    assert.equal(mode.fire({ pellets: 9, spread: 0.065 }, { rng: () => 1,
      aim: { origin: { x: 0, y: 0, z: 0 }, direction } }, 'player'), null);
    assert.equal(calls, 9);
  }
});

test('Shotgun spends one shell for nine independently occluded damage requests and one fire notification', () => {
  const ctx = { time: 0, rng: () => 0.5, events: new EventBus(), collision: new CollisionWorld(),
    aim: { origin: { x: 0, y: 1, z: 0 }, direction: { x: 0, y: 0, z: -1 } },
    enemies: [{ id: 'enemy', position: { y: 0 }, headHeight: 1.3, damageable: { alive: true },
      hitVolume: new Aabb(-1, 0, -6, 1, 2, -5) }] };
  const damage = [];
  const fired = [];
  ctx.events.on(EVENTS.DAMAGE_REQUESTED, info => damage.push(info));
  ctx.events.on(EVENTS.WEAPON_FIRED, info => fired.push(info));
  const shotgun = new Shotgun();
  shotgun.ownerId = 'player';
  assert.equal(shotgun.fire(ctx), true);
  assert.equal(shotgun.ammo, 5);
  assert.equal(damage.length, 9);
  for (const info of damage) {
    assert.equal(info.amount, 15);
    assert.equal(info.sourceId, 'player');
    assert.equal(info.targetId, 'enemy');
    assert.equal(info.hitPart, 'body');
  }
  assert.equal(fired.length, 1);
  assert.equal(fired[0].hit.targetId, 'enemy');
  ctx.collision.add(new Aabb(-1, 0, -3, 1, 3, -2));
  ctx.time = 0.85;
  assert.equal(shotgun.fire(ctx), true);
  assert.equal(damage.length, 9);
  assert.equal(fired[1].hit, null);
  ctx.collision = new CollisionWorld();
  ctx.enemies[0].damageable.alive = false;
  ctx.time = 1.7;
  assert.equal(shotgun.fire(ctx), true);
  assert.equal(damage.length, 9);
});

test('Rifle default strategy fires one pellet with prototype spread', () => {
  const directions = [];
  const ctx = { time: 0, rng: () => 1, events: new EventBus(), enemies: [],
    collision: { raycast: (origin, direction) => { directions.push({ ...direction }); return Infinity; } },
    aim: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 } } };
  assert.equal(new Rifle().fire(ctx), true);
  assert.equal(directions.length, 1);
  assert.ok(Math.abs(directions[0].x / -directions[0].z - 0.006) < 1e-12);
});

test('WeaponHolder selects all three slots, keeps cooldown and finishes holstered shotgun reload', () => {
  const ctx = { time: 0, events: new EventBus(), players: [] };
  const weapons = new WeaponHolder('player', ctx.events);
  const pistol = weapons.add(new Pistol({ fire: () => null }));
  const rifle = weapons.add(new Rifle({ fire: () => null }));
  const shotgun = weapons.add(new Shotgun({ fire: () => null }));
  ctx.players.push({ id: 'player', weapons });
  ctx.events.on(EVENTS.FIRE_REQUESTED, () => weapons.current.fire(ctx));
  assert.equal(weapons.current, pistol);
  weapons.switchTo(1);
  assert.equal(weapons.current, rifle);
  weapons.switchTo(2);
  const trigger = new WeaponTrigger(ctx, 'player');
  trigger.press();
  ctx.time = 0.85;
  trigger.update();
  assert.equal(shotgun.ammo, 5);
  trigger.release();
  trigger.press();
  assert.equal(shotgun.ammo, 4);
  weapons.switchTo(0);
  weapons.switchTo(2);
  assert.equal(shotgun.fire(ctx), false);
  assert.equal(shotgun.reload(ctx), true);
  weapons.switchTo(1);
  ctx.time += 2.1;
  weapons.update(0, ctx);
  assert.equal(shotgun.ammo, 6);
  assert.equal(shotgun.reserve, 34);
  assert.equal(weapons.switchTo(3), false);
});
