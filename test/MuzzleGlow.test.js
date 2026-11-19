import test from 'node:test';
import assert from 'node:assert/strict';
import { MuzzleGlow } from '../web/js/weapons/MuzzleGlow.js';

test('MuzzleGlow is dark until a shot, brightest at the shot, then fades out', () => {
  const glow = new MuzzleGlow({ peak: 6, seconds: 0.1 });
  assert.equal(glow.update(0.016), 0);
  glow.flash();
  assert.equal(glow.intensity, 6);
  const early = glow.update(0.02);
  const later = glow.update(0.04);
  assert.ok(early < 6 && later < early && later > 0);
  assert.equal(glow.update(0.05), 0, 'gone after its seconds');
  glow.flash();
  assert.equal(glow.intensity, 6, 'the next shot lights it again');
});

test('MuzzleGlow rejects nonsense', () => {
  assert.throws(() => new MuzzleGlow({ peak: -1, seconds: 0.1 }), RangeError);
  assert.throws(() => new MuzzleGlow({ peak: 1, seconds: 0 }), RangeError);
});
