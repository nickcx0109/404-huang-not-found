import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { Aabb, CollisionWorld } from '../web/js/CollisionWorld.js';
import { StarterPistol } from '../web/js/weapons/StarterPistol.js';
import { Bat } from '../web/js/weapons/Bat.js';
import { MeleeWeapon } from '../web/js/weapons/MeleeWeapon.js';
import { MeleeSwing } from '../web/js/weapons/MeleeSwing.js';
import { Rifle } from '../web/js/weapons/Rifle.js';
import { Shotgun } from '../web/js/weapons/Shotgun.js';
import { Pistol } from '../web/js/weapons/Pistol.js';
import { LoadoutHolder, LOADOUT_SLOTS } from '../web/js/weapons/LoadoutHolder.js';
import { EVENTS } from '../web/js/game/events.js';

const silent = { fire: () => null };

test('StarterPistol never runs out of reserve but still reloads its magazine', () => {
  const ctx = { events: new EventBus(), time: 0 };
  const pistol = new StarterPistol(silent);
  assert.equal(pistol.id, 'pistol');
  assert.equal(pistol.slot, 'sidearm');
  assert.equal(new Pistol(silent).reserve, 60, 'the Pistol example is unchanged');
  for (let shot = 0; shot < 12; shot++) {
    ctx.time = shot * 0.25;
    assert.equal(pistol.fire(ctx), true);
  }
  ctx.time += 0.25;
  assert.equal(pistol.fire(ctx), false, 'an empty magazine still has to be reloaded');
  for (let round = 0; round < 20; round++) {
    assert.equal(pistol.reload(ctx), true);
    ctx.time += 1.1;
    pistol.update(0, ctx);
    assert.equal(pistol.ammo, 12);
    pistol.ammo = 0;
  }
  assert.equal(pistol.reserve, Infinity);
  assert.equal(pistol.canRefill, true, 'only the magazine can be short');
  pistol.ammo = 12;
  assert.equal(pistol.canRefill, false);
});

test('Melee weapons spend no ammo, never reload and keep their own cooldown', () => {
  const ctx = { events: new EventBus(), time: 0 };
  let swings = 0;
  const bat = new Bat({ fire: () => { swings++; return null; } });
  assert.throws(() => new MeleeWeapon({ id: 'x', damage: 1, range: 1, arcDegrees: 90, cooldownSeconds: 1 }), TypeError);
  assert.throws(() => new (class extends MeleeWeapon {})({ id: 'x', damage: 1, range: 1, arcDegrees: 200, cooldownSeconds: 1 }), TypeError);
  assert.equal(bat.slot, 'melee');
  assert.equal(bat.usesAmmo, false);
  assert.equal(bat.canRefill, false);
  for (let swing = 0; swing < 30; swing++) {
    ctx.time = swing * 0.6;
    assert.equal(bat.fire(ctx), true);
    assert.equal(bat.fire(ctx), false, 'cooldown');
  }
  assert.equal(swings, 30);
  assert.equal(bat.reload(ctx), false);
  assert.equal(bat.reloading, false);
});

function enemy(id, x, z, alive = true) {
  return { id, position: { x, y: 0, z }, radius: 0.3, damageable: { alive } };
}

function meleeContext(enemies, collision = new CollisionWorld()) {
  const events = new EventBus();
  const requests = [];
  events.on(EVENTS.DAMAGE_REQUESTED, info => requests.push(info));
  return { ctx: { events, collision, enemies, time: 0,
    aim: { origin: { x: 0, y: 1.7, z: 0 }, direction: { x: 0, y: -0.3, z: -0.954 } } }, requests };
}

test('MeleeSwing hits the closest living enemy in reach and in front, as a melee DamageInfo', () => {
  const shot = new Bat().createShot();
  const { ctx, requests } = meleeContext([
    enemy('far', 0, -2.4), enemy('near', 0.4, -1.2), enemy('dead', 0, -0.6, false),
    enemy('behind', 0, 1), enemy('side', 1.8, -0.2), enemy('out-of-reach', 0, -2.6),
  ]);
  const hit = new MeleeSwing().fire(shot, ctx, 'p1');
  assert.equal(hit.targetId, 'near');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].kind, 'melee');
  assert.equal(requests[0].sourceId, 'p1');
  assert.equal(requests[0].amount, 45);
  assert.equal(requests[0].hitPart, 'body');

  ctx.enemies = [enemy('behind', 0, 1), enemy('side', 1.8, -0.2), enemy('out-of-reach', 0, -2.6)];
  assert.equal(new MeleeSwing().fire(shot, ctx, 'p1'), null);
  ctx.enemies = [enemy('hugging', 0.1, 0.1)];
  assert.equal(new MeleeSwing().fire(shot, ctx, 'p1').targetId, 'hugging', 'an enemy on top of the player is always in front');
  ctx.aim.direction = { x: 0, y: -1, z: 0 };
  assert.equal(new MeleeSwing().fire(shot, ctx, 'p1'), null, 'looking straight down has no facing');
});

test('MeleeSwing cannot hit through a wall', () => {
  const collision = new CollisionWorld();
  collision.add(new Aabb(-2, 0, -0.9, 2, 3, -0.7, 'wall'));
  const { ctx, requests } = meleeContext([enemy('behind-wall', 0, -1.6)], collision);
  assert.equal(new MeleeSwing().fire(new Bat().createShot(), ctx, 'p1'), null);
  assert.equal(requests.length, 0);
});

test('LoadoutHolder keeps one weapon per slot and swaps the primary', () => {
  const events = new EventBus();
  const changes = [];
  events.on(EVENTS.WEAPON_CHANGED, detail => changes.push(detail.weaponId));
  const holder = new LoadoutHolder('p1', events);
  assert.deepEqual(LOADOUT_SLOTS, ['primary', 'sidearm', 'melee']);
  const pistol = holder.add(new StarterPistol());
  const bat = holder.add(new Bat());
  assert.equal(holder.current, pistol, 'the first weapon added is in hand');
  assert.deepEqual(holder.weapons, [null, pistol, bat]);
  assert.throws(() => holder.add(new StarterPistol()), /taken/);
  assert.throws(() => holder.add(pistol), /already/);
  assert.equal(holder.switchTo(0), false, 'the primary slot starts empty');
  assert.equal(holder.switchTo(5), false);
  assert.equal(holder.switchTo(2), true);
  assert.equal(holder.current, bat);

  assert.equal(holder.canEquip(new StarterPistol()), false, 'the sidearm is kept for good');
  assert.equal(holder.canEquip(new Bat()), false, 'so is the melee weapon');
  assert.equal(holder.canEquip(null), false);
  const rifle = new Rifle();
  assert.equal(holder.canEquip(rifle), true);
  assert.equal(holder.equip(rifle), null, 'nothing to drop yet');
  assert.equal(holder.current, rifle, 'a new gun goes straight into the hand');
  assert.equal(rifle.ownerId, 'p1');
  assert.equal(holder.canEquip(rifle), false, 'already held');

  rifle.ammo = 3;
  rifle.reloadEndsAt = 99;
  const shotgun = new Shotgun();
  assert.equal(holder.equip(shotgun), rifle);
  assert.equal(rifle.ownerId, null);
  assert.equal(rifle.reloading, false, 'a dropped gun loses its unfinished reload');
  assert.equal(rifle.ammo, 3, 'and keeps its rounds');
  assert.equal(holder.inSlot('primary'), shotgun);
  assert.deepEqual(changes, ['pistol', 'bat', 'rifle', 'shotgun']);
  assert.throws(() => holder.equip(new StarterPistol()), /Cannot equip/);

  let updated = 0;
  shotgun.update = () => { updated++; };
  holder.update(0.1, { time: 0, events });
  assert.equal(updated, 1, 'empty slots are skipped');
});
