import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotBuffer, lerpAngle, wrapAngle } from '../web/js/net/SnapshotBuffer.js';

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} ${actual} != ${expected}`);

function snap(time, { tick = time / 50, players = [], enemies = [], ...rest } = {}) {
  return { t: 'snapshot', tick, time, ack: 0, state: 'playing', wave: 1, kills: 0, players, enemies, ...rest };
}

const player = (id, x, z, yaw = 0, extra = {}) => ({ id, x, y: 0, z, yaw, pitch: 0, health: 100, downed: false, alive: true, weapon: 'pistol', ammo: 12, reserve: 48, ...extra });
const zombie = (id, x, z, yaw = 0, extra = {}) => ({ id, type: 'walker', x, z, yaw, health: 50, state: 'chase', ...extra });

test('wrapAngle and lerpAngle take the shortest way around', () => {
  close(wrapAngle(Math.PI * 3), -Math.PI);
  close(wrapAngle(-Math.PI * 1.5), Math.PI / 2);
  close(wrapAngle(0.5), 0.5);
  // From just below +PI to just above -PI is a small step through PI, not a full turn back.
  close(lerpAngle(3.0, -3.0, 0.5), Math.PI);
  close(lerpAngle(-3.0, 3.0, 0.5), -Math.PI);
  close(lerpAngle(0, 1, 0.25), 0.25);
});

test('SnapshotBuffer is empty until a snapshot arrives', () => {
  const buffer = new SnapshotBuffer();
  assert.equal(buffer.size, 0);
  assert.equal(buffer.latest, null);
  assert.equal(buffer.oldest, null);
  assert.equal(buffer.sample(0), null);
  assert.equal(buffer.delay, 100);
  assert.equal(buffer.renderTime(1000), 900);
  assert.equal(new SnapshotBuffer({ delay: 60 }).renderTime(1000), 940);
});

test('SnapshotBuffer orders snapshots by server time and drops duplicates and malformed ones', () => {
  const buffer = new SnapshotBuffer();
  assert.equal(buffer.push(snap(100)), true);
  assert.equal(buffer.push(snap(200)), true);
  assert.equal(buffer.push(snap(150)), true, 'late but within history');
  assert.deepEqual(buffer._snapshots.map((s) => s.time), [100, 150, 200]);
  assert.equal(buffer.push(snap(150)), false, 'same time');
  assert.equal(buffer.push(snap(175, { tick: 4 })), false, 'same tick as time 200');
  assert.equal(buffer.push(null), false);
  assert.equal(buffer.push({ time: 'x', players: [], enemies: [] }), false);
  assert.equal(buffer.push({ time: 300, players: [] }), false);
  assert.equal(buffer.size, 3);
});

test('SnapshotBuffer keeps about one second of history and rejects older snapshots', () => {
  const buffer = new SnapshotBuffer({ duration: 1000 });
  for (let time = 0; time <= 2000; time += 50) buffer.push(snap(time));
  // One snapshot at or before the cutoff stays so render times near it still interpolate.
  assert.equal(buffer.oldest.time, 1000);
  assert.equal(buffer.latest.time, 2000);
  assert.equal(buffer.size, 21);
  assert.equal(buffer.push(snap(900, { tick: 999 })), false, 'stale');
  assert.equal(buffer.push(snap(1025, { tick: 998 })), true, 'still inside history');
  buffer.clear();
  assert.equal(buffer.size, 0);
});

test('SnapshotBuffer interpolates positions linearly and angles the short way', () => {
  const buffer = new SnapshotBuffer();
  buffer.push(snap(1000, { players: [player('p1', 0, 0, 3.0)], enemies: [zombie(7, 10, 10, -3.0)] }));
  buffer.push(snap(1050, { players: [player('p1', 2, -4, -3.0, { health: 80 })], enemies: [zombie(7, 12, 10, 3.0)], wave: 2 }));
  const world = buffer.sample(1025);
  assert.equal(world.alpha, 0.5);
  assert.equal(world.extrapolated, false);
  assert.equal(world.wave, 2, 'non-motion fields come from the newer snapshot');
  assert.equal(world.tick, 21);
  const [p] = world.players;
  close(p.x, 1);
  close(p.z, -2);
  close(p.yaw, Math.PI);
  assert.equal(p.health, 80);
  const [z] = world.enemies;
  close(z.x, 11);
  close(z.yaw, -Math.PI);
  assert.equal(z.y, undefined, 'enemies have no y and none is invented');
  assert.equal(world.snapshot, buffer.latest);
});

test('SnapshotBuffer picks the right pair among several snapshots', () => {
  const buffer = new SnapshotBuffer();
  for (const [time, x] of [[0, 0], [50, 5], [100, 5], [150, 20]]) buffer.push(snap(time, { enemies: [zombie(1, x, 0)] }));
  close(buffer.sample(25).enemies[0].x, 2.5);
  close(buffer.sample(75).enemies[0].x, 5);
  close(buffer.sample(140).enemies[0].x, 17);
  close(buffer.sample(100).enemies[0].x, 5);
});

test('SnapshotBuffer shows new entities as-is and lets removed ones vanish', () => {
  const buffer = new SnapshotBuffer();
  buffer.push(snap(0, { enemies: [zombie(1, 0, 0), zombie(2, 5, 5)] }));
  buffer.push(snap(50, { enemies: [zombie(1, 10, 0), zombie(3, 7, 7, 1.5)] }));
  const { enemies } = buffer.sample(25);
  assert.deepEqual(enemies.map((e) => e.id), [1, 3]);
  close(enemies[0].x, 5);
  assert.deepEqual(enemies[1], zombie(3, 7, 7, 1.5));
});

test('SnapshotBuffer returns copies and never mutates buffered snapshots', () => {
  const buffer = new SnapshotBuffer();
  const first = snap(0, { players: [player('p1', 0, 0)] });
  const second = snap(50, { players: [player('p1', 10, 0)] });
  buffer.push(first);
  buffer.push(second);
  const world = buffer.sample(25);
  world.players[0].x = 999;
  assert.equal(second.players[0].x, 10);
  assert.equal(first.players[0].x, 0);
  assert.notEqual(buffer.sample(60).players[0], second.players[0]);
});

test('SnapshotBuffer holds the oldest snapshot before history starts', () => {
  const buffer = new SnapshotBuffer();
  buffer.push(snap(100, { players: [player('p1', 1, 1)] }));
  buffer.push(snap(150, { players: [player('p1', 3, 1)] }));
  const world = buffer.sample(20);
  assert.equal(world.players[0].x, 1);
  assert.equal(world.extrapolated, false);
});

test('SnapshotBuffer extrapolates at most 250 ms past the newest snapshot, then holds', () => {
  const buffer = new SnapshotBuffer();
  buffer.push(snap(0, { players: [player('p1', 0, 0, 0)], enemies: [zombie(1, 0, 0)] }));
  buffer.push(snap(50, { players: [player('p1', 1, 0, 0.1)], enemies: [zombie(1, 0, 2), zombie(2, 4, 4)] }));
  const exact = buffer.sample(50);
  assert.equal(exact.extrapolated, false);
  assert.equal(exact.players[0].x, 1);
  const ahead = buffer.sample(150);
  assert.equal(ahead.extrapolated, true);
  close(ahead.players[0].x, 3);
  close(ahead.players[0].yaw, 0.3);
  close(ahead.enemies[0].z, 6);
  assert.deepEqual(ahead.enemies[1], zombie(2, 4, 4), 'no velocity known for a new entity');
  const capped = buffer.sample(300);
  close(capped.players[0].x, 6);
  close(buffer.sample(5000).players[0].x, 6, 'held after the cap');
  close(buffer.sample(5000).enemies[0].z, 12);
});

test('SnapshotBuffer extrapolation limit is configurable and a single snapshot just holds', () => {
  const single = new SnapshotBuffer();
  single.push(snap(0, { players: [player('p1', 4, 4)] }));
  const held = single.sample(100);
  assert.equal(held.players[0].x, 4);
  assert.equal(held.extrapolated, true);

  const none = new SnapshotBuffer({ maxExtrapolation: 0 });
  none.push(snap(0, { players: [player('p1', 0, 0)] }));
  none.push(snap(50, { players: [player('p1', 1, 0)] }));
  assert.equal(none.sample(200).players[0].x, 1);
});

test('SnapshotBuffer extrapolates angles along the short way round', () => {
  const buffer = new SnapshotBuffer();
  buffer.push(snap(0, { enemies: [zombie(1, 0, 0, 3.0)] }));
  buffer.push(snap(50, { enemies: [zombie(1, 0, 0, -3.1)] }));
  // Turning +0.183 rad per 50 ms through PI, not -6.1 rad backwards.
  close(wrapAngle(buffer.sample(100).enemies[0].yaw), wrapAngle(-3.1 + (2 * Math.PI - 6.1)));
});

test('SnapshotBuffer ignores non-finite render times and validates options', () => {
  const buffer = new SnapshotBuffer();
  buffer.push(snap(0));
  assert.equal(buffer.sample(Number.NaN), null);
  assert.throws(() => new SnapshotBuffer({ delay: -1 }), RangeError);
  assert.throws(() => new SnapshotBuffer({ maxExtrapolation: -1 }), RangeError);
  assert.throws(() => new SnapshotBuffer({ duration: 0 }), RangeError);
});
