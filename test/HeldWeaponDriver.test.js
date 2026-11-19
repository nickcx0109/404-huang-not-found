import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { EVENTS } from '../web/js/game/events.js';
import { Clip } from '../web/js/weapons/Clip.js';
import { WeaponView } from '../web/js/weapons/WeaponView.js';
import { ViewModelRegistry } from '../web/js/weapons/views/ViewModelRegistry.js';
import { HeldWeaponDriver } from '../web/js/weapons/views/HeldWeaponDriver.js';
import { LoadoutHolder } from '../web/js/weapons/LoadoutHolder.js';
import { StarterPistol } from '../web/js/weapons/StarterPistol.js';
import { Bat } from '../web/js/weapons/Bat.js';
import { Rifle } from '../web/js/weapons/Rifle.js';
import { Bandage } from '../web/js/weapons/Bandage.js';

const silent = { fire: () => null };
const noModel = () => ({ applyPose() {} });

class BladeView extends WeaponView {
  static id = 'katana';
  static hold = { position: [0, 0, 0], rotation: [0, 0, 0] };
  static clips = { equip: new Clip('equip', 0.2, { 'gun.pos.y': [[0, -1], [0.2, 0]] }) };
}

test('ViewModelRegistry: register by weapon id, look up, refuse what is not a view', () => {
  const registry = new ViewModelRegistry().register('katana', BladeView, noModel);
  assert.equal(registry.get('katana').View, BladeView);
  assert.equal(registry.get('katana').createModel, noModel);
  assert.equal(registry.get('rocket'), null, 'unknown weapons are not drawn');
  assert.deepEqual(registry.ids, ['katana']);
  assert.throws(() => registry.register('', BladeView, noModel), TypeError);
  assert.throws(() => registry.register('x', class {}, noModel), TypeError);
  assert.throws(() => registry.register('x', BladeView, null), TypeError);
});

function recorder() {
  const calls = [];
  const target = {};
  for (const name of ['equip', 'fire', 'reload', 'finishReload', 'showProgress']) {
    target[name] = (...args) => calls.push([name, ...args]);
  }
  return { calls, target };
}

test('HeldWeaponDriver: equips what is in hand and follows switches, pickups of the same kind too', () => {
  const events = new EventBus();
  const holder = new LoadoutHolder('me', events);
  const { calls, target } = recorder();
  const driver = new HeldWeaponDriver(events, 'me', holder, target);
  assert.deepEqual(calls.shift(), ['equip', null], 'empty hands at first');
  holder.add(new StarterPistol(silent));
  holder.add(new Bat(silent));
  assert.deepEqual(calls.shift(), ['equip', 'pistol']);
  holder.switchTo(2);
  assert.deepEqual(calls.shift(), ['equip', 'bat']);
  holder.equip(new Rifle(silent));
  holder.switchTo(0);
  const rifleEquips = calls.filter(call => call[0] === 'equip');
  assert.deepEqual(rifleEquips.at(-1), ['equip', 'rifle']);
  calls.length = 0;
  holder.equip(new Rifle(silent));
  assert.deepEqual(calls.filter(call => call[0] === 'equip'), [['equip', 'rifle']], 'a new rifle is brought up again');
  driver.dispose();
});

test('HeldWeaponDriver: shots and reloads of the player\'s own weapon only', () => {
  const events = new EventBus();
  const holder = new LoadoutHolder('me', events);
  const rifle = holder.add(new Rifle(silent));
  const { calls, target } = recorder();
  const driver = new HeldWeaponDriver(events, 'me', holder, target);
  calls.length = 0;
  const ctx = { events, time: 0 };
  rifle.fire(ctx);
  assert.deepEqual(calls.shift(), ['fire', { hit: null }]);
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'someone-else', weaponId: 'rifle', hit: null });
  assert.equal(calls.length, 0, 'a teammate\'s shot is not ours');

  ctx.time = 1;
  assert.equal(rifle.reload(ctx), true);
  driver.update(ctx.time);
  assert.deepEqual(calls.shift(), ['reload', rifle.reloadSeconds], 'the reload is seen as it starts');
  assert.deepEqual(calls.shift(), ['showProgress', null]);
  driver.update(ctx.time + 0.1);
  assert.equal(calls.filter(call => call[0] === 'reload').length, 0, 'once');
  calls.length = 0;
  rifle.update(0, { events, time: ctx.time + rifle.reloadSeconds });
  assert.deepEqual(calls.shift(), ['finishReload'], 'WEAPON_RELOADED ends it');
  driver.dispose();
  rifle.fire({ events, time: 10 });
  assert.equal(calls.length, 0, 'nothing after dispose');
});

test('HeldWeaponDriver: a bandage being applied is shown by its progress', () => {
  const events = new EventBus();
  const holder = new LoadoutHolder('me', events);
  const bandage = holder.add(new Bandage());
  const { calls, target } = recorder();
  new HeldWeaponDriver(events, 'me', holder, target);
  bandage.task = { targetId: 'me', startedAt: 0, endsAt: 3 };
  calls.length = 0;
  new HeldWeaponDriver(events, 'me', holder, target).update(1.5);
  assert.deepEqual(calls.at(-1), ['showProgress', 0.5]);
});
