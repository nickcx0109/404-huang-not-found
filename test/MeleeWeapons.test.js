import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { CollisionWorld, Aabb } from '../web/js/CollisionWorld.js';
import { Katana } from '../web/js/weapons/Katana.js';
import { Bat } from '../web/js/weapons/Bat.js';
import { LoadoutHolder } from '../web/js/weapons/LoadoutHolder.js';
import { EVENTS } from '../web/js/game/events.js';

export function arena(boxes = []) {
  const collision = new CollisionWorld();
  for (const box of boxes) collision.add(box);
  const events = new EventBus();
  const ctx = { events, collision, time: 0, enemies: [], players: [],
    aim: { origin: { x: 0, y: 1.6, z: 0 }, direction: { x: 0, y: 0, z: -1 } } };
  const hits = [];
  events.on(EVENTS.DAMAGE_REQUESTED, info => hits.push(info));
  return { ctx, hits };
}

export function zombie(id, x, z) {
  return { id, radius: 0.35, position: { x, y: 0, z }, damageable: { alive: true } };
}

test('Katana cuts every zombie in its wide arc, not just the closest', () => {
  const { ctx, hits } = arena();
  ctx.enemies.push(zombie('front', 0, -2), zombie('left', -2.2, -0.6), zombie('right', 2.2, -0.6),
    zombie('behind', 0, 2), zombie('far', 0, -4));
  const katana = new Katana();
  katana.ownerId = 'p1';
  assert.equal(katana.fire(ctx), true);
  assert.deepEqual(hits.map(info => info.targetId).sort(), ['front', 'left', 'right']);
  assert.equal(hits[0].amount, 70);
  assert.equal(hits[0].kind, 'melee');
  assert.equal(katana.fire(ctx), false, 'half a second between cuts');
  ctx.time = 0.5;
  assert.equal(katana.fire(ctx), true);
});

test('Katana does not cut through walls', () => {
  const { ctx, hits } = arena([new Aabb(-3, 0, -1.2, 3, 3, -1, 'wall')]);
  ctx.enemies.push(zombie('hidden', 0, -2), zombie('side', 1.8, -0.8));
  new Katana().fire(ctx);
  assert.deepEqual(hits.map(info => info.targetId), ['side']);
});

test('Katana goes in slot 4, can be swapped, and the bat stays', () => {
  const events = new EventBus();
  const holder = new LoadoutHolder('p1', events);
  holder.add(new Bat());
  const katana = new Katana();
  assert.equal(katana.slot, 'special');
  assert.equal(katana.usesAmmo, false);
  assert.equal(holder.canEquip(katana), true);
  assert.equal(holder.equip(katana), null);
  assert.equal(holder.inSlot('melee').id, 'bat');
  assert.equal(holder.equip(new Katana()), katana, 'a second katana swaps');
});

test('Chainsaw: held, 200 damage a second to the closest zombie in front, battery for about 30 seconds', async () => {
  const { Chainsaw } = await import('../web/js/weapons/Chainsaw.js');
  const { ctx, hits } = arena();
  ctx.enemies.push(zombie('near', 0, -1.5), zombie('next', 0.3, -2.5));
  const saw = new Chainsaw();
  saw.ownerId = 'p1';
  assert.equal(saw.slot, 'special');
  assert.equal(saw.automatic, true);
  let cuts = 0;
  for (; ctx.time < 1 - 1e-9; ctx.time = Math.round((ctx.time + 0.01) * 100) / 100) if (saw.fire(ctx)) cuts++;
  assert.equal(cuts, 10);
  assert.equal(hits.reduce((sum, info) => sum + (info.targetId === 'near' ? info.amount : 0), 0), 200);
  assert.equal(hits.some(info => info.targetId === 'next'), false, 'one at a time');
  let seconds = 1;
  while (saw.fire(ctx) || saw.battery > 0) {
    ctx.time = Math.round((ctx.time + 0.1) * 100) / 100;
    seconds += 0.1;
    if (seconds > 60) break;
  }
  assert.ok(Math.abs(seconds - 30) < 0.5, 'about 30 seconds: ' + seconds);
  assert.equal(saw.fire(ctx), false, 'flat battery');
});

test('The chainsaw battery shows in the inventory as whole percent', async () => {
  const { Chainsaw } = await import('../web/js/weapons/Chainsaw.js');
  const { PlayerStatus } = await import('../web/js/ui/hud/PlayerStatus.js');
  const saw = new Chainsaw({ battery: 72.4 });
  assert.ok(Math.abs(saw.charge - 0.724) < 1e-9);
  assert.equal(new Katana().charge, null);
  const status = new PlayerStatus();
  status._readSlots({ weapons: { weapons: [saw, null], index: 0 } });
  assert.deepEqual(status.slots, [{ id: 'chainsaw', count: null, charge: 73 }, { id: null, count: null, charge: null }]);
});
