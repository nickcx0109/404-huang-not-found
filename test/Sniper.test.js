import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventBus } from '../web/js/core/EventBus.js';
import { Aabb, CollisionWorld } from '../web/js/CollisionWorld.js';
import { createSession } from '../web/js/game/createSession.js';
import { EVENTS } from '../web/js/game/events.js';
import { Sniper } from '../web/js/weapons/Sniper.js';
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

test('Production catalog deals a sniper that can be picked up after the controller move is synchronized', t => {
  const level = JSON.parse(readFileSync(new URL('../web/levels/ch2.json', import.meta.url), 'utf8'));
  const controller = { ...level.spawns.players[0] };
  const session = createSession(level, { players: [{ id: 'player', controller }], rng: () => 0 });
  t.after(() => session.dispose());
  const field = session.pickups.weaponPickups;
  const pickup = field.pickups.find(pickup => pickup.weapon instanceof Sniper);
  assert.ok(pickup);
  assert.ok(level.markers.some(marker => marker.id === pickup.id && marker.type === 'weapon'));
  assert.ok(!field.catalog.idsIn('healing').includes('sniper'));
  const player = session.playerById('player');
  const request = { ownerId: player.id };
  const { events } = session.context;
  session.start();
  session.update(0);
  controller.x = pickup.position.x;
  controller.z = pickup.position.z;
  events.emit(EVENTS.PICKUP_REQUESTED, request);
  assert.equal(player.weapons.inSlot('primary'), null);
  assert.equal(pickup.empty, false);

  session.update(1 / 30);
  assert.equal(field.offerFor(player).name, 'SNIPER');
  events.emit(EVENTS.PICKUP_REQUESTED, request);
  assert.equal(player.weapons.inSlot('primary').id, 'sniper');
  assert.equal(player.weapons.current.ammo, 5);
  assert.equal(pickup.empty, true);
});
