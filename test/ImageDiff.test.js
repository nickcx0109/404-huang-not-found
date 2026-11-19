import test from 'node:test';
import assert from 'node:assert/strict';
import { NOISE_LIMITS, classify, diffPixels } from '../tools/art/imageDiff.mjs';

function image(width, height, value = 100) {
  return new Uint8ClampedArray(width * height * 4).fill(value);
}

test('diffPixels counts differing pixels, the largest channel step and their box', () => {
  const a = image(4, 3);
  const b = image(4, 3);
  assert.deepEqual(diffPixels(a, b, 4, 3), { pixels: 0, total: 12, maxDelta: 0, box: null });
  b[(1 * 4 + 2) * 4 + 1] = 103; // x 2, y 1: green +3
  b[(2 * 4 + 0) * 4 + 0] = 99; // x 0, y 2: red -1
  b[(0 * 4 + 3) * 4 + 3] = 0; // alpha only: ignored
  assert.deepEqual(diffPixels(a, b, 4, 3), { pixels: 2, total: 12, maxDelta: 3, box: { x0: 0, y0: 1, x1: 2, y1: 2 } });
  assert.throws(() => diffPixels(a, image(3, 3), 4, 3), RangeError);
});

test('classify calls a few pixels a step or two off noise and anything larger a difference', () => {
  const total = 1280 * 720;
  assert.equal(classify({ pixels: 0, total, maxDelta: 0 }), 'same');
  assert.equal(classify({ pixels: 33, total, maxDelta: 3 }), 'noise'); // what B16 saw
  assert.equal(classify({ pixels: 33, total, maxDelta: 40 }), 'different'); // a real change in a small spot
  assert.equal(classify({ pixels: Math.ceil(total * NOISE_LIMITS.maxShare) + 1, total, maxDelta: 1 }), 'different');
  assert.equal(classify({ pixels: 10, total, maxDelta: 2 }, { maxDelta: 1, maxShare: 1 }), 'different');
});
