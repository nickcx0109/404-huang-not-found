import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { CombatPlayer } from '../web/js/player/CombatPlayer.js';
import { StarterPistol } from '../web/js/weapons/StarterPistol.js';
import { Bat } from '../web/js/weapons/Bat.js';
import { Rifle } from '../web/js/weapons/Rifle.js';
import { Grenade } from '../web/js/weapons/Grenade.js';
import { Bandage } from '../web/js/weapons/Bandage.js';
import { Chainsaw } from '../web/js/weapons/Chainsaw.js';
import { LoadoutHolder, LOADOUT_SLOTS } from '../web/js/weapons/LoadoutHolder.js';
import { createWeaponCatalog } from '../web/js/game/createSession.js';
import { CarryOverState } from '../web/js/game/CarryOverState.js';
import { CarryOverStore } from '../web/js/level/CarryOverStore.js';

/** A player as createSession makes one: pistol in hand, bat in its slot. */
function freshPlayer(events = new EventBus()) {
  const player = new CombatPlayer('player-local', { x: 0, z: 0 }, events, new LoadoutHolder('player-local', events));
  player.weapons.add(new StarterPistol());
  player.weapons.add(new Bat());
  return player;
}

function slotOf(name) {
  return LOADOUT_SLOTS.indexOf(name);
}

/** A player who has played a while: hurt, a used rifle in hand, a grenade, two bandages, a chainsaw. */
function playedPlayer() {
  const player = freshPlayer();
  player.damageable.health = 37;
  player.weapons.weapons[slotOf('sidearm')].ammo = 5;
  const rifle = new Rifle();
  rifle.ammo = 11;
  rifle.reserve = 42;
  player.weapons.equip(rifle);
  player.weapons.equip(new Grenade());
  player.weapons.equip(new Bandage({ count: 2 }));
  const saw = new Chainsaw();
  saw.battery = 63.5;
  player.weapons.equip(saw);
  player.weapons.switchTo(slotOf('primary'));
  return player;
}

/** In-memory Storage. */
class MemoryStorage {
  constructor() { this.items = new Map(); }
  getItem(key) { return this.items.has(key) ? this.items.get(key) : null; }
  setItem(key, value) { this.items.set(key, String(value)); }
  removeItem(key) { this.items.delete(key); }
}

function roundTrip(state) {
  return CarryOverState.fromJSON(JSON.parse(JSON.stringify(state)));
}

test('capture reads health, every slot and the slot in hand as plain JSON', () => {
  const state = CarryOverState.capture(playedPlayer());
  assert.equal(state.health, 37);
  assert.equal(state.slot, slotOf('primary'));
  assert.equal(state.slots.length, LOADOUT_SLOTS.length);
  assert.deepEqual(state.slots[slotOf('primary')], { id: 'rifle', state: { ammo: 11, reserve: 42 } });
  assert.deepEqual(state.slots[slotOf('sidearm')], { id: 'pistol', state: { ammo: 5 } }, 'the endless reserve is left out');
  assert.deepEqual(state.slots[slotOf('melee')], { id: 'bat', state: {} });
  assert.deepEqual(state.slots[slotOf('special')], { id: 'chainsaw', state: { battery: 63.5 } });
  assert.deepEqual(state.slots[slotOf('throwable')], { id: 'grenade', state: { count: 1 } });
  assert.deepEqual(state.slots[slotOf('healing')], { id: 'bandage', state: { count: 2 } });
  assert.equal(state.slots[slotOf('booster')], null);
  assert.ok(Object.isFrozen(state));
  assert.deepEqual(roundTrip(state).toJSON(), state.toJSON());
});

test('applyTo gives a fresh player of the next level everything back', () => {
  const state = roundTrip(CarryOverState.capture(playedPlayer()));
  const player = state.applyTo(freshPlayer(), id => createWeaponCatalog().create(id));
  const weapons = player.weapons;
  assert.equal(player.damageable.health, 37);
  assert.equal(weapons.current.id, 'rifle');
  assert.equal(weapons.current.ammo, 11);
  assert.equal(weapons.current.reserve, 42);
  assert.equal(weapons.current.ownerId, 'player-local');
  const pistol = weapons.inSlot('sidearm');
  assert.equal(pistol.ammo, 5);
  assert.equal(pistol.reserve, Infinity, 'the starter pistol still never runs out');
  assert.equal(weapons.inSlot('melee').id, 'bat');
  assert.equal(weapons.inSlot('special').battery, 63.5);
  assert.equal(weapons.inSlot('throwable').count, 1);
  assert.equal(weapons.inSlot('healing').count, 2);
  assert.equal(weapons.inSlot('booster'), null);
  assert.deepEqual(CarryOverState.capture(player).toJSON(), state.toJSON(), 'nothing was lost on the way');
});

test('applyTo leaves out what cannot be rebuilt and clamps numbers that do not fit', () => {
  const state = new CarryOverState({
    health: 500,
    slot: slotOf('primary'),
    slots: [
      { id: 'laser', state: { ammo: 3 } },
      { id: 'pistol', state: { ammo: 99 } },
      { id: 'rifle', state: {} },
      null,
      { id: 'bandage', state: { count: 1 } },
    ],
  });
  const player = state.applyTo(freshPlayer(), id => createWeaponCatalog().create(id));
  assert.equal(player.damageable.health, 100, 'never above the maximum');
  assert.equal(player.weapons.inSlot('primary'), null, 'unknown weapons are dropped');
  assert.equal(player.weapons.current.id, 'pistol', 'the empty slot in hand falls back to what was there');
  assert.equal(player.weapons.current.ammo, 12, 'a magazine count over capacity keeps the fresh value');
  assert.equal(player.weapons.inSlot('melee').id, 'bat', 'a kept slot holding something else is not replaced');
  assert.equal(player.weapons.inSlot('throwable'), null, 'an item for another slot is not forced in');
});

test('CarryOverState rejects data it did not write', () => {
  assert.throws(() => CarryOverState.fromJSON(null), TypeError);
  assert.throws(() => CarryOverState.fromJSON({ version: 99, health: 10 }), TypeError);
  assert.throws(() => new CarryOverState({ health: 0 }), TypeError, 'a downed player cannot change level');
  assert.throws(() => new CarryOverState({ health: 10, slot: 1.5 }), TypeError);
  assert.throws(() => new CarryOverState({ health: 10, slots: [{ id: '' }] }), TypeError);
  assert.throws(() => new CarryOverState({ health: 10, slots: [{ id: 'rifle', state: { ammo: 'x' } }] }), TypeError);
  assert.throws(() => new CarryOverState({ health: 10, slots: new Array(LOADOUT_SLOTS.length + 1).fill(null) }), TypeError);
});

test('CarryOverStore hands the state out once, only to the level it was saved for', () => {
  const storage = new MemoryStorage();
  const store = new CarryOverStore(storage);
  const state = CarryOverState.capture(playedPlayer());
  assert.equal(store.save('ch3_2f', state), true);
  assert.equal(new CarryOverStore(storage).take('ch3_2f').health, 37, 'a new page reads it back');
  assert.equal(store.take('ch3_2f'), null, 'a restart or reload starts fresh');

  store.save('ch3_2f', state);
  assert.equal(store.take('ch3_roof'), null, 'another level gets nothing');
  assert.equal(store.take('ch3_2f'), null, 'and the stale state is gone');

  storage.setItem(CarryOverStore.KEY, '{not json');
  assert.equal(store.take('ch3'), null);
  storage.setItem(CarryOverStore.KEY, JSON.stringify({ level: 'ch3', state: { version: 1, health: -1 } }));
  assert.equal(store.take('ch3'), null);
});

test('CarryOverStore never throws when storage is missing or broken', () => {
  const state = CarryOverState.capture(freshPlayer());
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('denied'); } };
  for (const storage of [null, broken]) {
    const store = new CarryOverStore(storage);
    assert.equal(store.save('ch3', state), false);
    assert.equal(store.take('ch3'), null);
  }
});
