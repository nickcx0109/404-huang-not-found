import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { CombatPlayer } from '../web/js/player/CombatPlayer.js';
import { StarterPistol } from '../web/js/weapons/StarterPistol.js';
import { Bat } from '../web/js/weapons/Bat.js';
import { Rifle } from '../web/js/weapons/Rifle.js';
import { LoadoutHolder } from '../web/js/weapons/LoadoutHolder.js';
import { CarriedItem } from '../web/js/weapons/CarriedItem.js';
import { Bandage } from '../web/js/weapons/Bandage.js';
import { Grenade } from '../web/js/weapons/Grenade.js';
import { Molotov } from '../web/js/weapons/Molotov.js';
import { WeaponCatalog } from '../web/js/pickups/WeaponCatalog.js';
import { PickupField } from '../web/js/pickups/PickupField.js';
import { PlayerStatus } from '../web/js/ui/hud/PlayerStatus.js';
import { EVENTS } from '../web/js/game/events.js';

function setup(...positions) {
  const events = new EventBus();
  const ctx = { events, time: 0, players: [], enemies: [], effects: [],
    aim: { origin: { x: 0, y: 1.7, z: 0 }, direction: { x: 0, y: 0, z: -1 } } };
  for (const [index, [x, z]] of (positions.length ? positions : [[0, 0]]).entries()) {
    const id = 'p' + (index + 1);
    const body = new CombatPlayer(id, { x, z }, events, new LoadoutHolder(id, events));
    body.weapons.add(new StarterPistol());
    body.weapons.add(new Bat());
    ctx.players.push(body);
  }
  return ctx;
}

function advance(ctx, seconds) {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) {
    ctx.time = Math.round((ctx.time + 0.05) * 100) / 100;
    for (const player of ctx.players) player.update(0.05, ctx);
  }
}

test('CarriedItem is abstract and checks its stack', () => {
  assert.throws(() => new CarriedItem({ id: 'x', maxCount: 2 }), /abstract/);
  assert.throws(() => new Bandage({ count: 3 }), /stack/);
  const bandage = new Bandage();
  assert.equal(bandage.slot, 'healing');
  assert.equal(bandage.usesAmmo, false);
  assert.equal(new Grenade().slot, 'throwable');
  assert.equal(new Molotov().slot, 'throwable');
});

test('Damageable.heal adds up to the maximum, never to the dead, and reports it', () => {
  const ctx = setup();
  const health = ctx.players[0].damageable;
  const healed = [];
  ctx.events.on(EVENTS.ENTITY_HEALED, detail => healed.push(detail.amount));
  health.health = 90;
  assert.equal(health.heal(40), 10);
  assert.equal(health.heal(5), 0, 'already full');
  health.health = 0;
  assert.equal(health.heal(40), 0);
  assert.deepEqual(healed, [10]);
  assert.throws(() => health.heal(-1), /finite/);
});

test('Same items stack up to 2, the rest stays on the ground; a full stack refuses more', () => {
  const ctx = setup();
  const holder = ctx.players[0].weapons;
  assert.equal(holder.equip(new Bandage()), null);
  const second = new Bandage();
  assert.equal(holder.wouldSwap(second), false, 'stacking is not swapping');
  assert.equal(holder.equip(second), null, 'used up on pick up');
  assert.equal(holder.inSlot('healing').count, 2);
  assert.equal(holder.canEquip(new Bandage()), false, 'a full stack refuses another');
  const big = new Bandage({ count: 2 });
  holder.inSlot('healing').count = 1;
  assert.equal(holder.equip(big), big, 'what does not fit stays on the ground');
  assert.equal(big.count, 1);
  assert.equal(holder.inSlot('healing').count, 2);
});

test('Only one kind of throwable: picking up the other kind swaps the whole stack', () => {
  const ctx = setup();
  const holder = ctx.players[0].weapons;
  const grenades = new Grenade({ count: 2 });
  holder.equip(grenades);
  const molotov = new Molotov();
  assert.equal(holder.wouldSwap(molotov), true);
  assert.equal(holder.equip(molotov), grenades, 'the grenades are left behind, both of them');
  assert.equal(grenades.count, 2);
  assert.equal(holder.inSlot('throwable'), molotov);
  // Guns still swap even when the same gun is taken.
  holder.equip(new Rifle());
  assert.equal(holder.canEquip(new Rifle()), true);
  assert.equal(holder.wouldSwap(new Rifle()), true);
});

test('Bandaging yourself takes 3 seconds, adds 40 and spends one; the empty slot is left', () => {
  const ctx = setup();
  const player = ctx.players[0];
  const holder = player.weapons;
  holder.equip(new Bandage());
  player.damageable.health = 30;
  assert.equal(holder.current.fire(ctx), true);
  assert.equal(holder.current.fire(ctx), false, 'one at a time');
  advance(ctx, 1.5);
  assert.equal(player.damageable.health, 30, 'nothing until it is done');
  assert.equal(holder.current.progress(ctx.time).fraction, 0.5);
  advance(ctx, 1.5);
  assert.equal(player.damageable.health, 70);
  assert.equal(holder.inSlot('healing'), null, 'the last bandage is gone');
  assert.equal(holder.current.id, 'pistol', 'the hand moves on to the next slot');
});

test('A bandage is not wasted on full health, and putting it away cancels it', () => {
  const ctx = setup();
  const player = ctx.players[0];
  const holder = player.weapons;
  holder.equip(new Bandage());
  assert.equal(holder.current.fire(ctx), false, 'already at full health');
  player.damageable.health = 50;
  assert.equal(holder.current.fire(ctx), true);
  advance(ctx, 1);
  holder.switchTo(1);
  advance(ctx, 3);
  assert.equal(player.damageable.health, 50);
  assert.equal(holder.inSlot('healing').count, 1, 'nothing spent');
});

test('Right click bandages the teammate in front within reach, and both screens show it', () => {
  const ctx = setup([0, 0], [0, -2], [0, 2]);
  const [me, ahead, behind] = ctx.players;
  me.weapons.equip(new Bandage());
  ahead.damageable.health = 20;
  behind.damageable.health = 20;
  assert.equal(me.weapons.current.secondary(ctx), true);
  const mine = new PlayerStatus().read({ context: ctx, canMove: true, state: 'playing', wave: 1 }, 'p1');
  assert.equal(mine.action, '正在治療 P2');
  const theirs = new PlayerStatus().read({ context: ctx, canMove: true, state: 'playing', wave: 1 }, 'p2');
  assert.equal(theirs.action, 'P1 正在治療你');
  advance(ctx, 3);
  assert.equal(ahead.damageable.health, 60);
  assert.equal(behind.damageable.health, 20, 'the one behind was not in front');
  me.weapons.equip(new Bandage());
  ctx.aim.direction = { x: 1, y: 0, z: 0 };
  assert.equal(me.weapons.current.secondary(ctx), false, 'nobody in front');
});

test('Healing and throwable spots draw from their own pools', () => {
  const catalog = new WeaponCatalog()
    .register('rifle', { create: () => new Rifle() })
    .register('bandage', { create: () => new Bandage(), pool: 'healing' })
    .register('grenade', { create: () => new Grenade(), pool: 'throwable' })
    .register('molotov', { create: () => new Molotov(), pool: 'throwable' });
  const level = { markers: [
    { id: 'a', type: 'weapon', x: 0, z: 0, r: 1 },
    { id: 'b', type: 'healing', x: 0, z: 0, r: 1 },
    { id: 'c', type: 'throwable', x: 0, z: 0, r: 1 },
    { id: 'd', type: 'throwable', x: 0, z: 0, r: 1 },
    { id: 'e', type: 'shop', x: 0, z: 0, r: 1 },
  ] };
  const rolls = [0.9, 0.9, 0.1, 0.9];
  const field = PickupField.fromLevel(level, catalog, () => rolls.shift());
  assert.deepEqual(field.pickups.map(pickup => pickup.weapon.id), ['rifle', 'bandage', 'grenade', 'molotov']);
  assert.equal(catalog.hasPool('healing'), true);
  assert.equal(catalog.hasPool('shop'), false);
  assert.throws(() => catalog.randomId(() => 0, 'booster'), /pool booster/);
});

test('Standing at an item you carry a full stack of says FULL instead of nothing', () => {
  const ctx = setup();
  const me = ctx.players[0];
  me.weapons.equip(new Bandage({ count: 2 }));
  const catalog = new WeaponCatalog().register('bandage', { create: () => new Bandage(), pool: 'healing' });
  const field = PickupField.fromLevel({ markers: [{ id: 'h', type: 'healing', x: 0.5, z: 0, r: 1.2 }] }, catalog);
  assert.equal(field.nearestFor(me), null, 'cannot take it');
  assert.equal(me.weapons.isFull(field.pickups[0].weapon), true);
  assert.deepEqual({ ...field.offerFor(me) }, { name: 'BANDAGE', swap: false, full: true });
  assert.equal(field.take(me, ctx), false);
  me.weapons.inSlot('healing').count = 1;
  assert.deepEqual({ ...field.offerFor(me) }, { name: 'BANDAGE', swap: false, full: false });
  assert.equal(field.take(me, ctx), true);
  assert.equal(me.weapons.inSlot('healing').count, 2);
});
