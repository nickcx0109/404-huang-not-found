import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventBus } from '../web/js/core/EventBus.js';
import { Aabb, CollisionWorld } from '../web/js/CollisionWorld.js';
import { EVENTS } from '../web/js/game/events.js';
import { Sniper } from '../web/js/weapons/Sniper.js';
import { WeaponCatalog } from '../web/js/pickups/WeaponCatalog.js';
import { PickupField } from '../web/js/pickups/PickupField.js';
import { ItemDeck } from '../web/js/pickups/ItemDeck.js';
import { LoadoutHolder } from '../web/js/weapons/LoadoutHolder.js';
import { VIEWS } from '../web/js/weapons/views/standardViewModels.js';

const context = () => ({ events: new EventBus(), time: 0 });
const dryFire = { fire: () => null };

test('Sniper stats and primary slot match G17', () => {
  const gun = new Sniper();
  assert.equal(gun.id, 'sniper');
  assert.equal(gun.slot, 'primary');
  assert.deepEqual(gun.createShot(), { damage: 150, range: 120 });
  assert.equal(gun.magazine, 5);
  assert.equal(gun.ammo, 5);
  assert.equal(gun.reserve, 25);
  assert.equal(gun.cooldownSeconds, 1.2);
  assert.equal(VIEWS.sniper.id, 'sniper');
});

test('Sniper accepts a second shot only after 1.2 simulation seconds', () => {
  const gun = new Sniper(dryFire);
  const ctx = context();
  assert.equal(gun.fire(ctx), true);
  ctx.time = 1.199;
  assert.equal(gun.fire(ctx), false);
  assert.equal(gun.ammo, 4);
  ctx.time = 1.2;
  assert.equal(gun.fire(ctx), true);
  assert.equal(gun.ammo, 3);
});

test('Sniper empties five rounds, reloads from reserve and handles partial reserve', () => {
  const gun = new Sniper(dryFire);
  const ctx = context();
  assert.equal(gun.reload(ctx), false);
  for (let i = 0; i < 5; i++) {
    ctx.time = i * 1.2;
    assert.equal(gun.fire(ctx), true);
  }
  ctx.time = 6;
  assert.equal(gun.fire(ctx), false);
  assert.equal(gun.reserve, 25);
  assert.equal(gun.reload(ctx), true);
  ctx.time += gun.reloadSeconds - 0.001;
  assert.equal(gun.fire(ctx), false);
  assert.equal(gun.ammo, 0);
  ctx.time += 0.001;
  gun.update(0, ctx);
  assert.equal(gun.ammo, 5);
  assert.equal(gun.reserve, 20);
  gun.ammo = 0;
  gun.reserve = 2;
  assert.equal(gun.reload(ctx), true);
  ctx.time += gun.reloadSeconds;
  gun.update(0, ctx);
  assert.equal(gun.ammo, 2);
  assert.equal(gun.reserve, 0);
  assert.equal(gun.reload(ctx), false);
});

for (const [distance, expectedHits] of [[119, 1], [121, 0]]) {
  test(`Sniper hitscan at ${distance} m emits ${expectedHits} damage requests`, () => {
    const ctx = { ...context(), collision: new CollisionWorld(),
      aim: { origin: { x: 0, y: 1, z: 0 }, direction: { x: 0, y: 0, z: -1 } },
      enemies: [{ id: 'target', position: { y: 0 }, headHeight: 1.3, damageable: { alive: true },
        hitVolume: new Aabb(-0.3, 0, -distance - 0.5, 0.3, 1.8, -distance) }] };
    const hits = [];
    ctx.events.on(EVENTS.DAMAGE_REQUESTED, hit => hits.push(hit));
    const gun = new Sniper();
    gun.ownerId = 'player';
    assert.equal(gun.fire(ctx), true);
    assert.equal(hits.length, expectedHits);
    if (expectedHits) {
      assert.equal(hits[0].amount, 150);
      assert.equal(hits[0].sourceId, 'player');
      assert.equal(hits[0].hitPart, 'body');
    }
  });
}

test('Production catalog deals a sniper at weapon spots and pickup equips primary', () => {
  // Execute the composition root's actual catalog expression, without importing its browser/Three.js views.
  const source = readFileSync(new URL('../web/js/game/installGameplay.js', import.meta.url), 'utf8');
  const expression = source.match(/const catalog = ([\s\S]*?);\s*\/\/ Dealt/)[1];
  const catalog = new Function('WeaponCatalog', 'Sniper', 'return ' + expression)(WeaponCatalog, Sniper);
  assert.ok(catalog.idsIn('weapon').includes('sniper'));
  assert.ok(!catalog.idsIn('healing').includes('sniper'));
  assert.ok(catalog.create('sniper') instanceof Sniper);
  const deck = new ItemDeck(catalog, () => 0);
  const dealt = catalog.idsIn('weapon').map(() => deck.next('weapon'));
  assert.ok(dealt.includes('sniper'));
  const roll = (catalog.idsIn('weapon').indexOf('sniper') + 0.5) / catalog.idsIn('weapon').length;
  const field = PickupField.fromLevel({ markers: [{ id: 'ground', type: 'weapon', x: 0, z: 0 }] }, catalog, () => roll);
  const ctx = context();
  const player = { id: 'player', position: { x: 0, z: 0 }, body: { radius: 0.3 },
    weapons: new LoadoutHolder('player', ctx.events) };
  assert.equal(field.offerFor(player).name, 'SNIPER');
  assert.equal(field.take(player, ctx), true);
  assert.equal(player.weapons.inSlot('primary').id, 'sniper');
  assert.equal(player.weapons.current.ammo, 5);
  assert.equal(field.pickups[0].empty, true);
});
