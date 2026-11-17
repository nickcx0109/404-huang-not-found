import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBloomLevels } from '../web/js/core/bloomLevels.js';

test('bloom defaults only missing/invalid values and preserves explicit zero', () => {
  for (const value of [undefined, null, NaN, Infinity, 'invalid']) {
    assert.equal(resolveBloomLevels(value), 3);
  }
  assert.equal(resolveBloomLevels(0), 0);
});

test('positive bloom levels are rounded and bounded, negative values use minimum', () => {
  for (const [input, expected] of [[0.1, 1], [-2, 1], [1, 1], [2.6, 3], [4, 4], [20, 4]]) {
    assert.equal(resolveBloomLevels(input), expected);
  }
});
