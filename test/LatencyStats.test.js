import test from 'node:test';
import assert from 'node:assert/strict';
import { LatencyStats } from '../tools/net/LatencyStats.js';

test('LatencyStats sums up round trips with nearest-rank p95', () => {
  const stats = new LatencyStats();
  for (let rtt = 1; rtt <= 20; rtt++) stats.add(rtt, 1000, 1000);
  const summary = stats.summary();
  assert.equal(summary.count, 20);
  assert.equal(summary.min, 1);
  assert.equal(summary.median, 10.5);
  assert.equal(summary.p95, 19);
  assert.equal(summary.max, 20);
});

test('the clock offset comes from the fastest round trip', () => {
  const stats = new LatencyStats();
  stats.add(100, 5000, 1000); // offset 5000 + 50 - 1000 = 4050
  stats.add(10, 5000, 1040); // offset 5000 + 5 - 1040 = 3965
  stats.add(60, 5000, 1000);
  assert.equal(stats.summary().offset, 3965);
  assert.equal(stats.summary().median, 60);
});

test('no samples give nulls; bad RTTs are refused', () => {
  assert.deepEqual(new LatencyStats().summary(), { count: 0, min: null, median: null, p95: null, max: null, offset: null });
  assert.throws(() => new LatencyStats().add(-1, 0, 0), RangeError);
  assert.throws(() => new LatencyStats().add(Number.NaN, 0, 0), RangeError);
  assert.equal(LatencyStats.percentile([7], 95), 7);
});
