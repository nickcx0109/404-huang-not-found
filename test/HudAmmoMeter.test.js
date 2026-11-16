import test from 'node:test';
import assert from 'node:assert/strict';
import { AmmoMeter } from '../web/js/ui/hud/logic/AmmoMeter.js';

test('AmmoMeter tracks spent rounds, lit icons and the notice under the counter', () => {
  const meter = new AmmoMeter();
  assert.equal(meter.set({ armed: true, ammo: 12, magazine: 12, reserve: 60, reloading: false }), true);
  assert.equal(meter.resized, true);
  assert.equal(meter.icons, 12);
  assert.equal(meter.litIcons, 12);
  assert.equal(meter.notice, null);
  assert.equal(meter.urgent, false);
  assert.equal(meter.set({ armed: true, ammo: 12, magazine: 12, reserve: 60, reloading: false }), false);

  assert.equal(meter.set({ armed: true, ammo: 11, magazine: 12, reserve: 60, reloading: false }), true);
  assert.equal(meter.spent, 1);
  assert.equal(meter.resized, false);
  assert.equal(meter.litIcons, 11);

  meter.set({ armed: true, ammo: 3, magazine: 12, reserve: 60, reloading: false });
  assert.equal(meter.low, true);
  assert.equal(meter.urgent, true);

  meter.set({ armed: true, ammo: 0, magazine: 12, reserve: 60, reloading: false });
  assert.equal(meter.empty, true);
  assert.equal(meter.notice, 'reload');

  meter.set({ armed: true, ammo: 0, magazine: 12, reserve: 60, reloading: true });
  assert.equal(meter.notice, 'reloading');

  meter.set({ armed: true, ammo: 12, magazine: 12, reserve: 48, reloading: false });
  assert.equal(meter.spent, 0, 'loading a magazine is not spending');
  assert.equal(meter.notice, null);

  meter.set({ armed: true, ammo: 0, magazine: 12, reserve: 0, reloading: false });
  assert.equal(meter.notice, 'out');
});

test('AmmoMeter shares icons for big magazines and handles empty hands', () => {
  const meter = new AmmoMeter({ maxIcons: 40 });
  meter.set({ armed: true, ammo: 100, magazine: 100, reserve: 200, reloading: false });
  assert.equal(meter.icons, 40);
  assert.equal(meter.litIcons, 40);
  meter.set({ armed: true, ammo: 1, magazine: 100, reserve: 200, reloading: false });
  assert.equal(meter.litIcons, 1, 'the last round still lights one icon');
  meter.set({ armed: true, ammo: 0, magazine: 100, reserve: 200, reloading: false });
  assert.equal(meter.litIcons, 0);

  assert.equal(meter.set({ armed: false }), true);
  assert.equal(meter.icons, 0);
  assert.equal(meter.litIcons, 0);
  assert.equal(meter.notice, null);
  assert.equal(meter.urgent, false);
  assert.throws(() => meter.set({ armed: true, ammo: 13, magazine: 12, reserve: 0 }), RangeError);
});
