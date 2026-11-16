import test from 'node:test';
import assert from 'node:assert/strict';
import { Aabb, CollisionWorld } from '../web/js/CollisionWorld.js';

test('CollisionWorld depenetrates the nearest face before moving away or standing still', () => {
  const world = new CollisionWorld();
  world.add(new Aabb(-1, 0, -1, 1, 3, 1));
  for (const [startX, startZ, dx, dz, axis, sign] of [
    [-1.2, 0, -0.1, 0, 'x', -1], [1.2, 0, 0.1, 0, 'x', 1],
    [0, -1.2, 0, -0.1, 'z', -1], [0, 1.2, 0, 0.1, 'z', 1],
    [-1.2, 0, 0, 0, 'x', -1], [0.9, 0, -0.05, 0, 'x', 1],
  ]) {
    const moved = world.move(startX, startZ, dx, dz, 0.35, 0, 1.8);
    assert.ok(moved[axis] * sign > 1.35);
    assert.equal(world.hit(moved.x, moved.z, 0.35, 0, 1.8), null);
  }
});

test('CollisionWorld resolves shallow corner penetration without losing wall sliding', () => {
  const world = new CollisionWorld();
  world.add(new Aabb(-1, 0, -4, 1, 3, 4));
  const moved = world.move(-1.2, 0, 0, 2, 0.35, 0, 1.8);
  assert.ok(moved.x < -1.35);
  assert.ok(Math.abs(moved.z - 2) < 1e-9);
  assert.equal(moved.hitX, true);
  assert.equal(moved.hitZ, false);
});

test('Aabb maps base-centred colliders and uses strict column overlap on every axis', () => {
  const box = Aabb.fromCollider({ id: 'raised', x: 2, y: 2, z: 3, w: 4, h: 3, d: 6 });
  assert.deepEqual([box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ], [0, 2, 0, 4, 5, 6]);
  assert.equal(box.id, 'raised');
  assert.equal(box.overlapsColumn(2, 3, 0.35, 0, 1.8), false);
  assert.equal(box.overlapsColumn(2, 3, 0.35, 2, 3), true);
  assert.equal(box.overlapsColumn(-0.5, 3, 0.5, 2, 3), false);
});

test('CollisionWorld uses level colliders, including invisible ones, but never visual props', () => {
  const world = CollisionWorld.fromLevel({
    bounds: { x: 0, z: 0, w: 10, d: 8 },
    colliders: [{ id: 'wall', x: 0, y: 0, z: 0, w: 1, h: 3, d: 6, visible: false }],
    props: [{ name: 'visual_only', x: 3, z: 3 }],
  });
  assert.deepEqual(world.bounds, { minX: -5, maxX: 5, minZ: -4, maxZ: 4 });
  assert.equal(world.hit(0, 0, 0.35, 0, 1.8).id, 'wall');
  assert.equal(world.hit(3, 3, 0.35, 0, 1.8), null);
});

test('CollisionWorld subdivides long moves so thin walls cannot be skipped', () => {
  const world = new CollisionWorld();
  world.add(new Aabb(-0.1, 0, -5, 0.1, 3, 5, 'thin'));
  const right = world.move(-3, 0, 6, 0, 0.35, 0, 1.8);
  assert.ok(Math.abs(right.x + 0.451) < 1e-9);
  assert.equal(right.hitX, true);
  assert.equal(right.hitZ, false);
  const left = world.move(3, 0, -6, 0, 0.35, 0, 1.8);
  assert.ok(Math.abs(left.x - 0.451) < 1e-9);
});

test('CollisionWorld slides along walls, permits walking below beams, and clamps bounds', () => {
  const world = new CollisionWorld();
  world.add(new Aabb(-0.5, 0, -10, 0.5, 3, 10));
  const slide = world.move(-2, -2, 4, 4, 0.35, 0, 1.8);
  assert.ok(slide.x < -0.85);
  assert.ok(Math.abs(slide.z - 2) < 1e-9);
  assert.equal(slide.hitX, true);
  const overhead = new CollisionWorld();
  overhead.add(new Aabb(-1, 2.4, -1, 1, 2.8, 1));
  const underBeam = overhead.move(-2, 0, 4, 0, 0.35, 0, 1.8);
  assert.ok(Math.abs(underBeam.x - 2) < 1e-9);
  assert.equal(underBeam.z, 0);
  assert.equal(underBeam.hitX, false);
  assert.equal(underBeam.hitZ, false);
  overhead.bounds = { minX: -3, maxX: 3, minZ: -3, maxZ: 3 };
  const bounded = overhead.move(0, 0, 10, -10, 0.35, 0, 1.8);
  assert.deepEqual(bounded, { x: 2.65, z: -2.65, hitX: true, hitZ: true });
});
