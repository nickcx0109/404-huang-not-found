import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { CombatPlayer } from '../web/js/player/CombatPlayer.js';
import { StarterPistol } from '../web/js/weapons/StarterPistol.js';
import { Bat } from '../web/js/weapons/Bat.js';
import { Rifle } from '../web/js/weapons/Rifle.js';
import { LoadoutHolder } from '../web/js/weapons/LoadoutHolder.js';
import { AmmoCrate } from '../web/js/pickups/AmmoCrate.js';
import { AmmoCrateField } from '../web/js/pickups/AmmoCrateField.js';
import { InteractionList } from '../web/js/pickups/InteractionList.js';
import { EVENTS } from '../web/js/game/events.js';

function setup(x = 0) {
  const events = new EventBus();
  const ctx = { events, time: 0 };
  const player = new CombatPlayer('p1', { x, z: 0 }, events, new LoadoutHolder('p1', events));
  player.weapons.add(new StarterPistol());
  player.weapons.add(new Bat());
  const rifle = new Rifle();
  player.weapons.equip(rifle);
  const field = AmmoCrateField.fromLevel({ markers: [
    { id: 'box', type: 'ammo', x: 0.5, z: 0, r: 1.2 },
    { id: 'gun', type: 'weapon', x: 0, z: 0, r: 1 },
  ] }, { cooldownSeconds: 60 });
  return { ctx, player, rifle, field };
}

test('An ammo box fills every gun the player carries, then rests for a minute', () => {
  const { ctx, player, rifle, field } = setup();
  const refills = [];
  ctx.events.on(EVENTS.AMMO_REFILLED, detail => refills.push(detail.crateId));
  assert.equal(field.crates.length, 1, 'only ammo markers');
  rifle.ammo = 3;
  rifle.reserve = 10;
  const pistol = player.weapons.inSlot('sidearm');
  pistol.ammo = 1;
  assert.deepEqual({ ...field.offerFor(player, {}, 0) }, { name: 'AMMO', swap: false, verb: 'REFILL', full: false, note: null });
  assert.equal(field.take(player, ctx), true);
  assert.equal(rifle.ammo, rifle.magazine);
  assert.equal(rifle.reserve, rifle.maxReserve);
  assert.equal(pistol.ammo, pistol.magazine);
  assert.deepEqual(refills, ['box']);
  rifle.ammo = 0;
  ctx.time = 20;
  assert.equal(field.take(player, ctx), false, 'resting');
  assert.equal(field.offerFor(player, {}, 20).note, 'READY IN 40s');
  ctx.time = 60;
  assert.equal(field.take(player, ctx), true);
});

test('A box does nothing when every gun is full, and only within reach', () => {
  const { ctx, player, field } = setup();
  assert.equal(field.offerFor(player, {}, 0).note, 'FULL');
  assert.equal(field.take(player, ctx), false);
  assert.equal(field.crates[0].ready(0), true, 'not spent on nothing');
  const far = setup(5);
  assert.equal(far.field.offerFor(far.player, {}, 0), null);
  assert.throws(() => new AmmoCrate('x', { x: 0, z: 0 }, { cooldownSeconds: -1 }), /Invalid/);
});

test('InteractionList: the first part with something here answers E and the prompt', () => {
  const { ctx, player, rifle } = setup();
  const calls = [];
  const nothing = { take: () => (calls.push('nothing'), false), offerFor: () => null };
  const crates = setup().field;
  const list = new InteractionList([nothing, null, crates]);
  rifle.ammo = 0;
  assert.equal(list.offerFor(player, {}, 0).name, 'AMMO');
  assert.equal(list.take(player, ctx), true);
  assert.deepEqual(calls, ['nothing']);
  assert.equal(new InteractionList([nothing]).offerFor(player, {}, 0), null);
});
