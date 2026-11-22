import test from 'node:test';
import assert from 'node:assert/strict';
import { Adrenaline } from '../web/js/weapons/Adrenaline.js';
import { CombatPlayer } from '../web/js/player/CombatPlayer.js';
import { TimedEffects } from '../web/js/player/TimedEffects.js';
import { LoadoutHolder } from '../web/js/weapons/LoadoutHolder.js';
import { StarterPistol } from '../web/js/weapons/StarterPistol.js';
import { Rifle } from '../web/js/weapons/Rifle.js';
import { EventBus } from '../web/js/core/EventBus.js';
import { DamageInfo } from '../web/js/entities/DamageInfo.js';
import { WeaponCatalog } from '../web/js/pickups/WeaponCatalog.js';
import { registerHealingItems } from '../web/js/pickups/healingItems.js';
import { ItemDeck } from '../web/js/pickups/ItemDeck.js';
import { PickupField } from '../web/js/pickups/PickupField.js';
import { HeldWeaponDriver } from '../web/js/weapons/views/HeldWeaponDriver.js';

function setup() {
  const events = new EventBus();
  const player = new CombatPlayer('p', { x: 0, z: 0 }, events, new LoadoutHolder('p', events));
  const ctx = { players: [player], time: 0, events };
  const use = () => { const item = player.weapons.equip(new Adrenaline()); return player.weapons.current.fire(ctx); };
  const advance = time => { ctx.time = time; player.update(0, ctx); };
  return { player, ctx, use, advance };
}

test('adrenaline occupies slot 7, caps stock at one and consumes once', () => {
  const { player, ctx } = setup();
  const item = new Adrenaline();
  player.weapons.equip(item);
  assert.equal(LoadoutHolder.slotIndex(item), 6);
  assert.equal(item.count, 1);
  assert.equal(player.weapons.canEquip(new Adrenaline()), false);
  assert.throws(() => new Adrenaline({ count: 2 }), TypeError);
  assert.equal(item.fire(ctx), true);
  assert.equal(item.fire(ctx), false);
  player.update(0, ctx);
  assert.equal(player.weapons.inSlot('booster'), null);
});

test('ten second speed and reload modifiers expire exactly', () => {
  const { player, use, advance } = setup();
  use();
  assert.equal(player.controller.speedMultiplier, 1.3);
  advance(9.999);
  assert.equal(player.effects.multiplier('reloadRate', 9.999), 2);
  assert.equal(player.controller.speedMultiplier, 1.3);
  advance(10);
  assert.equal(player.controller.speedMultiplier, 1);
  assert.equal(player.effects.multiplier('reloadRate', 10), 1);
  assert.equal(player.effects.entries.size, 0);
});

test('repeat use refreshes ten seconds without stacking', () => {
  const { player, use, advance } = setup();
  use(); advance(6); use(); advance(10);
  assert.equal(player.controller.speedMultiplier, 1.3);
  assert.equal(player.effects.multiplier('reloadRate', 10), 2);
  advance(16);
  assert.equal(player.controller.speedMultiplier, 1);
});

for (const Gun of [StarterPistol, Rifle]) test(Gun.name + ' reload takes half the ordinary time', () => {
  const { player, ctx, use, advance } = setup();
  const gun = player.weapons.add(new Gun()); gun.ammo--;
  use(); gun.reload(ctx);
  advance(gun.reloadSeconds / 2 - 0.001); assert.equal(gun.reloading, true);
  advance(gun.reloadSeconds / 2); assert.equal(gun.reloading, false);
});

test('an existing reload accelerates, and a reload crossing expiry resumes ordinary speed', () => {
  const { player, ctx, use, advance } = setup();
  const gun = player.weapons.add(new Rifle()); gun.ammo--;
  gun.reload(ctx); advance(0.5); use();
  advance(0.5 + (gun.reloadSeconds - 0.5) / 2);
  assert.equal(gun.reloading, false);
  advance(10); gun.ammo--; gun.reload(ctx);
  advance(10.5); assert.equal(gun.reloading, true);
  advance(10.5 + gun.reloadSeconds - 1); assert.equal(gun.reloading, false);
});

test('downing clears modifiers immediately, revive does not restore them, dispose resets controller', () => {
  const { player, use, ctx } = setup(); use();
  player.damageable.takeDamage(new DamageInfo({ amount: 100, sourceId: 'z', targetId: 'p' }));
  assert.equal(player.controller.speedMultiplier, 1);
  assert.equal(player.effects.entries.size, 0);
  assert.equal(new Adrenaline().fire(ctx), false);
  player.damageable.revive(40); use(); player.dispose();
  assert.equal(player.controller.speedMultiplier, 1);
  assert.equal(player.effects.entries.size, 0);
});

test('healing deck deals bandage and adrenaline separately from guns and throwables', () => {
  const catalog = registerHealingItems(new WeaponCatalog()
    .register('rifle', { create: () => new Rifle() })
    .register('grenade', { create: () => ({ id: 'grenade' }), pool: 'throwable' }));
  const deck = new ItemDeck(catalog, () => 0);
  const markers = Array.from({ length: 2 }, (_, i) => ({ id: 'h' + i, type: 'healing', x: i, z: 0, r: 1 }));
  const field = PickupField.fromLevel({ markers }, catalog, () => 0, pool => deck.next(pool));
  assert.deepEqual(field.pickups.map(p => p.weapon.id).sort(), ['adrenaline', 'bandage']);
  assert.equal(deck.next('weapon'), 'rifle');
  assert.equal(deck.next('throwable'), 'grenade');
});

test('TimedEffects composes arbitrary stats, integrates expiry, validates and clears', () => {
  const effects = new TimedEffects();
  effects.refresh('a', 2, { rate: 2 }, 0);
  effects.refresh('b', 1, { rate: 3 }, 0);
  assert.equal(effects.multiplier('rate', 0), 6);
  assert.equal(effects.elapsed('rate', 0, 3), 9);
  assert.throws(() => effects.refresh('x', 0, {}, 0), RangeError);
  assert.throws(() => effects.refresh('x', 1, { rate: 0 }, 0), RangeError);
  effects.clear(); assert.equal(effects.multiplier('rate', 0), 1);
});
test('timeToAccumulate inverts elapsed across a buff that expires', () => {
  const effects = new TimedEffects();
  effects.refresh('a', 1, { reloadRate: 2 }, 0);
  assert.equal(effects.timeToAccumulate('reloadRate', 0, 1.5), 0.75);
  assert.equal(effects.timeToAccumulate('reloadRate', 0, 3), 2, 'two units in the first second, one after it');
  assert.equal(effects.timeToAccumulate('reloadRate', 5, 1), 1, 'ordinary speed once it is over');
  assert.equal(effects.timeToAccumulate('reloadRate', 0, 0), 0);
});

test('the held weapon view plays a buffed reload in the time it really takes', () => {
  const { player, ctx, use } = setup();
  const gun = player.weapons.add(new Rifle()); gun.ammo--;
  player.weapons.switchTo(0);
  const reloads = [];
  const target = { equip() {}, fire() {}, finishReload() {}, showProgress() {}, reload: seconds => reloads.push(seconds) };
  const driver = new HeldWeaponDriver(ctx.events, 'p', player.weapons, target);
  use(); player.weapons.switchTo(0); gun.reload(ctx);
  assert.ok(Math.abs(gun.reloadSecondsLeft(0) - gun.reloadSeconds / 2) < 1e-9);
  driver.update(0);
  assert.equal(reloads.length, 1);
  assert.ok(Math.abs(reloads[0] - gun.reloadSeconds / 2) < 1e-9);
  driver.dispose();
});
