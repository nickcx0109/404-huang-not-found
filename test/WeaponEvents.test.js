import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { EVENTS } from '../web/js/game/events.js';
import { Pistol } from '../web/js/weapons/Pistol.js';
import { Grenade } from '../web/js/weapons/Grenade.js';
import { Bat } from '../web/js/weapons/Bat.js';
import { WeaponHolder } from '../web/js/weapons/WeaponHolder.js';
import { LoadoutHolder } from '../web/js/weapons/LoadoutHolder.js';
import { TimedEffects } from '../web/js/player/TimedEffects.js';
import { AmmoCrate } from '../web/js/pickups/AmmoCrate.js';

function setup() {
  const events = new EventBus();
  const ctx = { events, time: 0 };
  const seen = {};
  for (const event of [EVENTS.WEAPON_FIRED, EVENTS.WEAPON_RELOADED, EVENTS.WEAPON_CHANGED,
    EVENTS.WEAPON_RELOAD_STARTED, EVENTS.WEAPON_REFILLED]) {
    seen[event] = [];
    events.on(event, detail => seen[event].push(detail));
  }
  const holder = new WeaponHolder('p', events);
  const gun = holder.add(new Pistol({ fire: () => null }));
  return { ctx, seen, holder, gun };
}
const state = (ammo, reserve) => ({ ownerId: 'p', weaponId: 'pistol', ammo, reserve });

test('gun events carry independent post-action snapshots and reject invalid actions silently', () => {
  const { ctx, seen, gun, holder } = setup();
  assert.deepEqual(seen[EVENTS.WEAPON_CHANGED], [state(12, 60)]);
  gun.fire(ctx);
  gun.fire(ctx);
  assert.deepEqual(seen[EVENTS.WEAPON_FIRED], [{ ...state(11, 60), hit: null }]);
  gun.reload(ctx);
  gun.reload(ctx);
  assert.deepEqual(seen[EVENTS.WEAPON_RELOAD_STARTED], [{ ...state(11, 60), duration: 1.1 }]);
  ctx.time = 1.1;
  holder.update(1.1, ctx);
  assert.deepEqual(seen[EVENTS.WEAPON_RELOADED], [state(12, 59)]);
  assert.equal(gun.refill(ctx), true);
  assert.equal(gun.refill(ctx), false);
  assert.deepEqual(seen[EVENTS.WEAPON_REFILLED], [state(12, 60)]);
  assert.equal(seen[EVENTS.WEAPON_CHANGED][0].ammo, 12);
  assert.equal(seen[EVENTS.WEAPON_FIRED][0].ammo, 11);
});

test('reload-start duration integrates adrenaline expiry', () => {
  const { ctx, seen, gun } = setup();
  const effects = new TimedEffects();
  effects.refresh('adrenaline', 0.25, { reloadRate: 2 }, 0);
  ctx.players = [{ id: 'p', effects }];
  gun.fire(ctx);
  gun.reload(ctx);
  const started = seen[EVENTS.WEAPON_RELOAD_STARTED][0];
  assert.ok(Math.abs(started.duration - 0.85) < 1e-9);
  ctx.time = started.duration;
  gun.update(0, ctx);
  assert.deepEqual(seen[EVENTS.WEAPON_RELOADED], [state(12, 59)]);
});

test('stack snapshots cover firing, equip, switching and absorption polymorphically', () => {
  const { ctx, seen } = setup();
  const holder = new LoadoutHolder('p', ctx.events);
  const item = new Grenade({ count: 2 });
  item.fireMode = { fire: () => null };
  holder.equip(item);
  item.fire(ctx);
  assert.deepEqual(seen[EVENTS.WEAPON_FIRED].at(-1), {
    ownerId: 'p', weaponId: 'grenade', ammo: null, reserve: null, count: 1, hit: null,
  });
  holder.equip(new Grenade());
  const snapshot = { ownerId: 'p', weaponId: 'grenade', ammo: null, reserve: null, count: 2 };
  assert.deepEqual(seen[EVENTS.WEAPON_CHANGED].at(-1), snapshot);
  holder.add(new Bat());
  holder.switchTo(2);
  holder.switchTo(4);
  assert.deepEqual(seen[EVENTS.WEAPON_CHANGED].at(-1), snapshot);
  assert.equal(item.refill(ctx), false);
  assert.deepEqual(seen[EVENTS.WEAPON_REFILLED], []);
});

test('ammo crate emits per-weapon refill after cancelling reload, and nothing when full', () => {
  const { ctx, seen, holder, gun } = setup();
  const crate = new AmmoCrate('box', { x: 0, z: 0 }, { cooldownSeconds: 0 });
  const player = { id: 'p', weapons: holder };
  assert.equal(crate.use(player, ctx), false);
  gun.fire(ctx);
  gun.reload(ctx);
  assert.equal(crate.use(player, ctx), true);
  assert.equal(gun.reloading, false);
  assert.deepEqual(seen[EVENTS.WEAPON_REFILLED], [state(12, 60)]);
  assert.equal(crate.use(player, ctx), false);
  ctx.time = 10;
  gun.update(10, ctx);
  assert.deepEqual(seen[EVENTS.WEAPON_RELOADED], []);
});
