import test from 'node:test';
import assert from 'node:assert/strict';
import { Aabb, CollisionWorld } from '../web/js/CollisionWorld.js';
import { PathFinder } from '../web/js/PathFinder.js';

function worldWithBounds() {
  const world = new CollisionWorld();
  world.bounds = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
  return world;
}

test('PathFinder finds a repeatable walkable route around an obstacle', () => {
  const world = worldWithBounds();
  world.add(new Aabb(4.5, 0, 3, 5.5, 3, 7));
  const finder = new PathFinder(world);
  const path = finder.findPath(1.25, 5.25, 8.25, 5.25);
  assert.ok(path.length > 2);
  assert.deepEqual(path[0], { x: 1.25, z: 5.25 });
  assert.deepEqual(path.at(-1), { x: 8.25, z: 5.25 });
  assert.deepEqual(finder.findPath(1.25, 5.25, 8.25, 5.25), path);
  for (const point of path) assert.equal(world.hit(point.x, point.z, 0.35, 0, 1.8), null);
  for (let index = 1; index < path.length; index++) {
    assert.ok(Math.hypot(path[index].x - path[index - 1].x, path[index].z - path[index - 1].z) <= Math.SQRT2 * 0.5 + 1e-9);
  }
});

test('PathFinder returns null for disconnected or wholly blocked regions', () => {
  const world = worldWithBounds();
  world.add(new Aabb(4.5, 0, 0, 5.5, 3, 10));
  assert.equal(new PathFinder(world).findPath(1.25, 5.25, 8.25, 5.25), null);
  assert.equal(new PathFinder(world).findPath(-100, -100, 8.25, 5.25), null);
  world.add(new Aabb(0, 0, 0, 10, 3, 10));
  assert.equal(new PathFinder(world).findPath(1, 1, 8, 8), null);
});

test('PathFinder does not cut diagonally between two blocked neighbours', () => {
  const world = worldWithBounds();
  world.bounds = { minX: 0, maxX: 3, minZ: 0, maxZ: 3 };
  world.add(new Aabb(1, 0, 0, 2, 3, 1));
  world.add(new Aabb(0, 0, 1, 1, 3, 2));
  const finder = new PathFinder(world, { cell: 1, radius: 0.1 });
  assert.equal(finder.findPath(0.5, 0.5, 1.5, 1.5), null);
  assert.deepEqual(finder.findPath(0.5, 0.5, 0.5, 0.5), [{ x: 0.5, z: 0.5 }]);
});

test('PathFinder path helpers measure distances and clamp interpolation fractions', () => {
  const path = [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 4 }];
  assert.equal(PathFinder.pathLength(path), 7);
  assert.deepEqual(PathFinder.pointAlong(path, 0.5), { x: 3, z: 0.5, dx: 0, dz: 4 });
  assert.deepEqual(PathFinder.pointAlong(path, -1), { x: 0, z: 0, dx: 3, dz: 0 });
  assert.deepEqual(PathFinder.pointAlong(path, 2), { x: 3, z: 4, dx: 0, dz: 4 });
  assert.deepEqual(PathFinder.pointAlong([{ x: 2, z: 3 }], 0.5), { x: 2, z: 3, dx: 0, dz: 1 });
});
