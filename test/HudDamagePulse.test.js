import test from 'node:test';
import assert from 'node:assert/strict';
import { DamagePulse } from '../web/js/ui/hud/logic/DamagePulse.js';

test('DamagePulse makes small hits visible, big hits full, and fades to nothing', () => {
  const pulse = new DamagePulse({ fadeSeconds: 2, floor: 0.4, gain: 2 });
  assert.equal(pulse.active, false);
  pulse.hit(0.05);
  assert.equal(pulse.level, 0.5);
  pulse.update(0.5);
  assert.equal(pulse.level, 0.25);
  pulse.hit(0.6);
  assert.equal(pulse.level, 1);
  pulse.update(1);
  assert.equal(pulse.level, 0.5);
  pulse.update(5);
  assert.equal(pulse.level, 0);
  assert.equal(pulse.active, false);
});

test('DamagePulse never gets weaker from a second hit', () => {
  const pulse = new DamagePulse({ fadeSeconds: 2, floor: 0.4, gain: 2 });
  pulse.hit(0.3);
  pulse.hit(0.01);
  assert.equal(pulse.level, 1);
  pulse.hit(-1);
  assert.equal(pulse.level, 1);
  assert.throws(() => new DamagePulse({ fadeSeconds: 0 }), RangeError);
});
