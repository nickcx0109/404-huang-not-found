import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { Rifle } from '../web/js/weapons/Rifle.js';
import { Pistol } from '../web/js/weapons/Pistol.js';
import { WeaponHolder } from '../web/js/weapons/WeaponHolder.js';
import { WeaponTrigger } from '../web/js/weapons/WeaponTrigger.js';
import { EVENTS } from '../web/js/game/events.js';

test('Rifle uses prototype ammo, fire rate and reload with simulation deadlines', () => {
  const ctx = { time: 0, events: new EventBus() };
  let shots = 0;
  const rifle = new Rifle({ fire: shot => {
    assert.equal(shot.damage, 24);
    shots++;
    return null;
  } });
  assert.equal(rifle.automatic, true);
  assert.equal(rifle.magazine, 30);
  assert.equal(rifle.reserve, 210);
  assert.equal(rifle.reload(ctx), false);
  for (let index = 0; index < 30; index++) {
    ctx.time = index * 0.095;
    assert.equal(rifle.fire(ctx), true);
    assert.equal(rifle.fire(ctx), false);
    ctx.time += 0.094;
    assert.equal(rifle.fire(ctx), false);
  }
  ctx.time = 3;
  assert.equal(rifle.fire(ctx), false);
  assert.equal(shots, 30);
  assert.equal(rifle.reload(ctx), true);
  assert.equal(rifle.reload(ctx), false);
  ctx.time = 4.699;
  assert.equal(rifle.fire(ctx), false);
  ctx.time = 4.7;
  rifle.update(0, ctx);
  assert.equal(rifle.ammo, 30);
  assert.equal(rifle.reserve, 180);
  assert.equal(rifle.fire(ctx), true);
  rifle.ammo = 0;
  rifle.reserve = 2;
  assert.equal(rifle.reload(ctx), true);
  ctx.time += 1.7;
  rifle.update(0, ctx);
  assert.equal(rifle.ammo, 2);
  assert.equal(rifle.reserve, 0);
  assert.equal(rifle.reload(ctx), false);
});

test('WeaponTrigger repeats only automatic weapons while held and releases cleanly', () => {
  const ctx = { time: 0, events: new EventBus(), players: [] };
  const weapons = new WeaponHolder('player', ctx.events);
  weapons.add(new Pistol({ fire: () => null }));
  const rifle = weapons.add(new Rifle({ fire: () => null }));
  ctx.players.push({ id: 'player', weapons });
  let requests = 0;
  ctx.events.on(EVENTS.FIRE_REQUESTED, request => {
    assert.equal(request.ownerId, 'player');
    requests++;
    weapons.current.fire(ctx);
  });
  const trigger = new WeaponTrigger(ctx, 'player');
  trigger.update();
  assert.equal(requests, 0);
  trigger.press();
  trigger.press();
  ctx.time = 1;
  trigger.update();
  assert.equal(requests, 1);
  weapons.switchTo(1);
  trigger.update();
  assert.equal(rifle.ammo, 29);
  ctx.time += 0.094;
  trigger.update();
  assert.equal(rifle.ammo, 29);
  ctx.time += 0.001;
  trigger.update();
  assert.equal(rifle.ammo, 28);
  trigger.release();
  ctx.time++;
  trigger.update();
  assert.equal(rifle.ammo, 28);
  trigger.press();
  assert.equal(rifle.ammo, 27);
});
