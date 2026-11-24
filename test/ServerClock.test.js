import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerClock } from '../web/js/net/ServerClock.js';

test('ServerClock starts unsynced and follows the client clock', () => {
  let time = 500;
  const clock = new ServerClock({ now: () => time });
  assert.equal(clock.synced, false);
  assert.equal(clock.rtt, null);
  assert.equal(clock.bestRtt, null);
  assert.equal(clock.offset, 0);
  assert.equal(clock.now(), 500);
  time = 700;
  assert.equal(clock.clientNow(), 700);
});

test('ServerClock takes the first sample as-is, assuming a symmetric path', () => {
  let time = 1100;
  const clock = new ServerClock({ now: () => time });
  // Ping sent at 1000, server stamped 5050, pong back at 1100: rtt 100, offset 5050 + 50 - 1100.
  assert.equal(clock.addSample(1000, 5050), true);
  assert.equal(clock.synced, true);
  assert.equal(clock.rtt, 100);
  assert.equal(clock.offset, 4000);
  assert.equal(clock.now(), 5100);
  time = 1200;
  assert.equal(clock.now(), 5200);
});

test('ServerClock prefers the lowest-RTT sample over noisy slow ones', () => {
  const clock = new ServerClock({ now: () => 0, smoothing: 1 });
  clock.addSample(0, 4020, 40); // rtt 40, offset 4000
  // A slow pong whose request was queued: its offset guess is 100 ms off.
  clock.addSample(1000, 5300, 1400); // rtt 400, offset 4100
  assert.equal(clock.offset, 4000);
  assert.equal(clock.bestRtt, 40);
  // A new, better sample wins.
  clock.addSample(2000, 6020, 2020); // rtt 20, offset 4010
  assert.equal(clock.offset, 4010);
  assert.equal(clock.bestRtt, 20);
});

test('ServerClock smooths small corrections and snaps large ones', () => {
  const clock = new ServerClock({ now: () => 0, smoothing: 0.5, snapThreshold: 500 });
  clock.addSample(0, 1010, 20); // offset 1000
  clock.addSample(100, 1118, 116); // rtt 16, offset 1010
  assert.equal(clock.offset, 1005);
  clock.addSample(200, 1215, 214); // rtt 14, offset 1008
  assert.equal(clock.offset, 1006.5);
  // Server restarted with a different clock: jump instead of crawling for seconds.
  clock.addSample(300, 90310, 310); // rtt 10, offset 90005
  assert.equal(clock.offset, 90005);
});

test('ServerClock smooths RTT across every sample', () => {
  const clock = new ServerClock({ now: () => 0, smoothing: 0.5 });
  clock.addSample(0, 0, 100);
  clock.addSample(0, 0, 200);
  assert.equal(clock.rtt, 150);
});

test('ServerClock forgets samples that fall out of the window', () => {
  const clock = new ServerClock({ now: () => 0, window: 2, smoothing: 1 });
  clock.addSample(0, 1005, 10); // rtt 10, offset 1000
  clock.addSample(0, 1100, 200); // rtt 200, offset 1000
  clock.addSample(0, 1300, 200); // rtt 200, offset 1200; the rtt-10 sample is gone
  assert.equal(clock.bestRtt, 200);
  assert.equal(clock.offset, 1200);
});

test('ServerClock rejects impossible samples and can be reset', () => {
  const clock = new ServerClock({ now: () => 0 });
  assert.equal(clock.addSample(100, 500, 50), false);
  assert.equal(clock.addSample(Number.NaN, 500, 50), false);
  assert.equal(clock.addSample(0, Infinity, 50), false);
  assert.equal(clock.synced, false);
  clock.addSample(0, 500, 10);
  clock.reset();
  assert.equal(clock.synced, false);
  assert.equal(clock.offset, 0);
  assert.equal(clock.rtt, null);
});

test('ServerClock beginSession keeps the offset until a new sample, which then replaces it', () => {
  const clock = new ServerClock({ now: () => 0, smoothing: 0.25 });
  clock.addSample(0, 100_005, 10); // rtt 10, offset 100 000
  clock.beginSession();
  assert.equal(clock.offset, 100_000, 'still usable before the first new pong');
  assert.equal(clock.synced, true);
  assert.equal(clock.rtt, null);
  assert.equal(clock.bestRtt, null);
  // The restarted server's clock is only 500 ms off: under snapThreshold, but it must not be smoothed
  // against or lose to the old rtt-10 sample.
  clock.addSample(1000, 100_525, 1050); // rtt 50, offset 99 500
  assert.equal(clock.offset, 99_500);
  assert.equal(clock.bestRtt, 50);
  clock.addSample(2000, 101_530, 2060); // rtt 60, offset 99 500; normal smoothing resumes
  assert.equal(clock.offset, 99_500);
});

test('ServerClock validates its options', () => {
  assert.throws(() => new ServerClock({ window: 0 }), RangeError);
  assert.throws(() => new ServerClock({ smoothing: 0 }), RangeError);
  assert.throws(() => new ServerClock({ smoothing: 1.5 }), RangeError);
});
