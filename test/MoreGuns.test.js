import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { SubmachineGun } from '../web/js/weapons/SubmachineGun.js';
import { Revolver } from '../web/js/weapons/Revolver.js';
import { Rifle } from '../web/js/weapons/Rifle.js';
import { Shotgun } from '../web/js/weapons/Shotgun.js';
import { WeaponCatalog } from '../web/js/pickups/WeaponCatalog.js';
import { PickupField } from '../web/js/pickups/PickupField.js';

function shotsIn(weapon, seconds) {
  const ctx = { events: new EventBus(), time: 0 };
  let fired = 0;
  for (; ctx.time <= seconds + 1e-9; ctx.time = Math.round((ctx.time + 0.01) * 100) / 100) {
    if (weapon.fire(ctx)) fired++;
  }
  return fired;
}

test('SMG: low damage, very fast and automatic; revolver: high damage, slow', () => {
  const silent = { fire: () => null };
  const smg = new SubmachineGun(silent);
  const revolver = new Revolver(silent);
  const rifle = new Rifle(silent);
  assert.equal(smg.id, 'smg');
  assert.equal(smg.automatic, true);
  assert.equal(revolver.automatic, undefined, 'one shot per click');
  assert.equal(smg.slot, 'primary');
  assert.equal(revolver.slot, 'primary');
  assert.ok(smg.createShot().damage < rifle.createShot().damage, 'SMG hits softer than the rifle');
  assert.ok(revolver.createShot().damage > rifle.createShot().damage * 3, 'revolver hits far harder');
  assert.ok(revolver.createShot().damage >= 68, 'a body shot drops a walker');
  assert.equal(shotsIn(new SubmachineGun(silent), 0.99), 17, 'about 1000 rounds a minute');
  assert.equal(shotsIn(new Revolver(silent), 2.99), 4, 'one shot every 0.75 s');
  assert.equal(revolver.magazine, 6);
});

function catalog() {
  return new WeaponCatalog()
    .register('rifle', { create: () => new Rifle() })
    .register('shotgun', { create: () => new Shotgun() })
    .register('smg', { create: () => new SubmachineGun() })
    .register('revolver', { create: () => new Revolver() });
}

test('WeaponCatalog.randomId draws every registered gun with equal shares and checks the rng', () => {
  const weapons = catalog();
  assert.deepEqual([0, 0.25, 0.5, 0.99].map(roll => weapons.randomId(() => roll)), ['rifle', 'shotgun', 'smg', 'revolver']);
  assert.throws(() => weapons.randomId(() => 1), /rng/);
  assert.throws(() => weapons.randomId(() => NaN), /rng/);
  assert.throws(() => new WeaponCatalog().randomId(() => 0), /No weapons/);
});

test('Weapon spots are fixed; the gun on a spot without an item is random, one with an item is fixed', () => {
  const markers = [
    { id: 'a', type: 'weapon', item: null, x: 1, z: 2, r: 1 },
    { id: 'b', type: 'weapon', item: null, x: 3, z: 4, r: 1 },
    { id: 'fixed', type: 'weapon', item: 'shotgun', x: 5, z: 6, r: 1 },
  ];
  const rolls = [0.6, 0.9];
  const field = PickupField.fromLevel({ markers }, catalog(), () => rolls.shift());
  assert.deepEqual(field.pickups.map(pickup => [pickup.id, pickup.position.x, pickup.position.z, pickup.weapon.id]),
    [['a', 1, 2, 'smg'], ['b', 3, 4, 'revolver'], ['fixed', 5, 6, 'shotgun']]);
  assert.equal(rolls.length, 0, 'the fixed spot does not use up a roll');

  const seen = new Set();
  for (let game = 0; game < 40; game++) seen.add(PickupField.fromLevel({ markers }, catalog(), () => (game * 0.37) % 1).pickups[0].weapon.id);
  assert.equal(seen.size, 4, 'over many games every gun turns up');
});
