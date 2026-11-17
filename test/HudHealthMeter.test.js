import test from 'node:test';
import assert from 'node:assert/strict';
import { HealthMeter } from '../web/js/ui/hud/logic/HealthMeter.js';

test('HealthMeter reports what changed and when health counts as low', () => {
  const meter = new HealthMeter();
  assert.equal(meter.set(100, 100), 'first');
  assert.equal(meter.set(100, 100), 'same');
  assert.equal(meter.set(66, 100), 'hurt');
  assert.equal(meter.ratio, 0.66);
  assert.equal(meter.low, false);
  assert.equal(meter.set(30, 100), 'hurt');
  assert.equal(meter.low, false, 'exactly 30% is not low yet');
  assert.equal(meter.set(29, 100), 'hurt');
  assert.equal(meter.low, true);
  assert.equal(meter.set(80, 100), 'healed');
  assert.equal(meter.low, false);
});

test('HealthMeter keeps numbers inside the bar and never shows 0 while alive', () => {
  const meter = new HealthMeter({ lowRatio: 0.5 });
  meter.set(250, 200);
  assert.equal(meter.ratio, 1);
  meter.set(0.4, 200);
  assert.equal(meter.shown, 1);
  assert.equal(meter.low, true);
  meter.set(-5, 200);
  assert.equal(meter.ratio, 0);
  assert.equal(meter.shown, 0);
  assert.throws(() => meter.set(10, 0), RangeError);
  assert.throws(() => meter.set(NaN, 100), RangeError);
});
