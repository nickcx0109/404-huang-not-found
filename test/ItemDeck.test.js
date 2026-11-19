import test from 'node:test';
import assert from 'node:assert/strict';
import { ItemDeck } from '../web/js/pickups/ItemDeck.js';
import { WeaponCatalog } from '../web/js/pickups/WeaponCatalog.js';
import { PickupField } from '../web/js/pickups/PickupField.js';

const fake = id => () => ({ id });
function catalog() {
  return new WeaponCatalog()
    .register('rifle', { create: fake('rifle') })
    .register('shotgun', { create: fake('shotgun') })
    .register('smg', { create: fake('smg') })
    .register('katana', { create: fake('katana'), pool: ['weapon', 'melee'] })
    .register('chainsaw', { create: fake('chainsaw'), pool: ['weapon', 'melee'] })
    .register('grenade', { create: fake('grenade'), pool: 'throwable' })
    .register('molotov', { create: fake('molotov'), pool: 'throwable' });
}

function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

test('ItemDeck deals every item of a pool once before any comes twice', () => {
  for (let seed = 1; seed < 30; seed++) {
    const deck = new ItemDeck(catalog(), seeded(seed));
    const first = Array.from({ length: 5 }, () => deck.next('weapon'));
    assert.deepEqual([...first].sort(), ['chainsaw', 'katana', 'rifle', 'shotgun', 'smg']);
    const second = Array.from({ length: 5 }, () => deck.next('weapon'));
    assert.deepEqual([...second].sort(), [...first].sort(), 'then a fresh deck');
    assert.deepEqual([deck.next('throwable'), deck.next('throwable')].sort(), ['grenade', 'molotov']);
  }
});

test('ItemDeck shuffles, so the deal changes from game to game', () => {
  const orders = new Set();
  for (let seed = 1; seed < 30; seed++) {
    const deck = new ItemDeck(catalog(), seeded(seed));
    orders.add(Array.from({ length: 5 }, () => deck.next('weapon')).join());
  }
  assert.ok(orders.size > 5);
});

test('ItemDeck rejects an empty pool and a broken rng', () => {
  assert.throws(() => new ItemDeck(catalog()).next('laser'), RangeError);
  assert.throws(() => new ItemDeck(catalog(), () => 1).next('weapon'), RangeError);
});

test('a level dealt from an ItemDeck has every weapon on the ground', () => {
  const markers = Array.from({ length: 8 }, (_, i) => ({ id: 'gun' + i, type: 'weapon', x: i * 3, z: 0, r: 1 }));
  markers.push({ id: 'fixed', type: 'weapon', item: 'rifle', x: 40, z: 0, r: 1 });
  const lists = catalog();
  const deck = new ItemDeck(lists, seeded(7));
  const field = PickupField.fromLevel({ markers }, lists, seeded(7), pool => deck.next(pool));
  const ids = new Set(field.pickups.map(p => p.weapon.id));
  for (const id of lists.idsIn('weapon')) assert.ok(ids.has(id), id + ' lies somewhere');
  assert.equal(field.pickups.at(-1).weapon.id, 'rifle', 'a marker that names its item keeps it');
});
