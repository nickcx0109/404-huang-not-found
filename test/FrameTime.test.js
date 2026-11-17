import test from 'node:test';
import assert from 'node:assert/strict';
import { clampFrameTime } from '../web/js/core/frameTime.js';

test('frame intervals preserve normal timing and bound startup, pause and reversed clocks', () => {
  for (const [elapsed, expected] of [[1 / 60, 1 / 60], [0, 0], [-1, 0], [0.05, 0.05], [10, 0.05]]) {
    assert.equal(clampFrameTime(elapsed, 0.05), expected);
  }
  const intervals = [1 / 60, 30, -1, 1 / 60].map(value => clampFrameTime(value, 0.05));
  const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  assert.ok(average >= 0 && average <= 0.05);
});
