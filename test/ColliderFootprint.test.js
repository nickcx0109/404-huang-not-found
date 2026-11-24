import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { ColliderFootprint } from '../web/js/level/ColliderFootprint.js';
import { LevelData } from '../web/js/LevelData.js';
import { CollisionWorld } from '../web/js/CollisionWorld.js';
import { PLAYER_BODY } from '../web/js/player/PlayerBody.js';

const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, (message || '') + ' expected ' + expected + ', got ' + actual);

function level(prop, collider) {
  return new LevelData({
    name: 'footprint',
    bounds: { w: 40, d: 40 },
    colliders: [{ id: 'car', x: 0, z: 0, w: 2, d: 4, h: 1.5, ...collider }],
    props: [{ name: 'car_wreck', collider: 'car', ...prop }],
    spawns: { players: [{ x: -15, z: -15 }], zombies: [] },
    bookmarks: [{ name: 'view', pos: [0, 2, 10], lookAt: [0, 0, 0] }],
  });
}

test('rotatedExtent keeps 0° and quarter turns exact and grows a 45° turn by its diagonal', () => {
  assert.deepEqual(ColliderFootprint.rotatedExtent(1, 2, 2, 4, 0), { minX: 0, maxX: 2, minZ: 0, maxZ: 4 });
  assert.deepEqual(ColliderFootprint.rotatedExtent(1, 2, 2, 4, 90), { minX: -1, maxX: 3, minZ: 1, maxZ: 3 });
  assert.deepEqual(ColliderFootprint.rotatedExtent(1, 2, 2, 4, -90), { minX: -1, maxX: 3, minZ: 1, maxZ: 3 });
  assert.deepEqual(ColliderFootprint.rotatedExtent(1, 2, 2, 4, 180), { minX: 0, maxX: 2, minZ: 0, maxZ: 4 });
  const half = (2 + 4) * Math.SQRT1_2 / 2;
  const e = ColliderFootprint.rotatedExtent(0, 0, 2, 4, 45);
  close(e.maxX, half, 'maxX');
  close(e.minX, -half, 'minX');
  close(e.maxZ, half, 'maxZ');
  close(e.minZ, -half, 'minZ');
});

test('a prop at 0° that fits its collider leaves the collision box as written', () => {
  const data = level({ size: [2, 1.5, 4] });
  assert.equal(data.collisionBoxes[0], data.collider('car'));
  const raw = level({});
  assert.equal(raw.collisionBoxes[0], raw.collider('car'));
});

test('a prop turned 45° gets a collision box around its turned footprint', () => {
  const data = level({ rotY: 45, size: [2, 1.5, 4] });
  const box = data.collisionBoxes[0];
  const side = (2 + 4) * Math.SQRT1_2;
  close(box.w, side, 'w');
  close(box.d, side, 'd');
  close(box.x, 0, 'x');
  close(box.z, 0, 'z');
  assert.equal(box.id, 'car');
  assert.equal(box.h, 1.5);
  // The written collider (what the stand-in and the fallback box are drawn from) is unchanged.
  assert.deepEqual([data.collider('car').w, data.collider('car').d], [2, 4]);
});

test('a prop turned 90° covers the swapped footprint and never shrinks the written collider', () => {
  // Collider written for the unturned prop: a quarter turn swaps the footprint, the box holds both.
  const turned = level({ rotY: 90 });
  assert.deepEqual([turned.collisionBoxes[0].w, turned.collisionBoxes[0].d], [4, 4]);
  // Collider already written in level space for the turned prop (how ch1/ch2 do it): unchanged.
  const authored = level({ rotY: 90, size: [2, 1.5, 4] }, { w: 4, d: 2 });
  assert.equal(authored.collisionBoxes[0], authored.collider('car'));
});

test('scale grows the collision box with the drawn prop; a smaller prop keeps the written box', () => {
  const big = level({ scale: 2 });
  const box = big.collisionBoxes[0];
  assert.deepEqual([box.w, box.d, box.h, box.y], [4, 8, 3, 0]);
  const both = level({ scale: 1.5, rotY: 90, size: [2, 1, 4] });
  assert.deepEqual([both.collisionBoxes[0].w, both.collisionBoxes[0].d], [6, 4]);
  const small = level({ scale: 0.5 });
  assert.equal(small.collisionBoxes[0], small.collider('car'));
});

test('the footprint follows the prop position and height when they differ from the collider', () => {
  const data = level({ x: 1, z: 0, y: 0.5, size: [2, 2, 4] });
  const box = data.collisionBoxes[0];
  assert.deepEqual([box.x - box.w / 2, box.x + box.w / 2], [-1, 2]);
  assert.deepEqual([box.y, box.y + box.h], [0, 2.5]);
});

test('footprint replaces size for stand-ins that tip their size over, and is validated', () => {
  // A desk built at 1.6 × 0.74 × 0.8 and then tipped onto its side is drawn about 1 × 1.5 × 0.9.
  const flat = level({ size: [1.6, 0.74, 0.8], footprint: [1, 1.5, 0.9] }, { w: 1, d: 0.9, h: 1.5 });
  assert.equal(flat.collisionBoxes[0], flat.collider('car'));
  assert.deepEqual(flat.props[0].footprint, { w: 1, h: 1.5, d: 0.9 });
  assert.deepEqual(flat.props[0].size, { w: 1.6, h: 0.74, d: 0.8 });
  const turned = level({ size: [1.6, 0.74, 0.8], footprint: [1, 1.5, 0.9], rotY: 90 }, { w: 1, d: 0.9, h: 1.5 });
  assert.deepEqual([turned.collisionBoxes[0].w, turned.collisionBoxes[0].d], [1, 1]);
  assert.throws(() => level({ footprint: [1, 0, 1] }), (err) =>
    err.problems.some((p) => p.startsWith('props[0].footprint')));
});

test('CollisionWorld blocks the corner of a turned prop that the written collider missed', () => {
  // mood.json's car: written 3.2 × 4.2, drawn 1.8 × 4.2 turned 28°.
  const data = level({ rotY: 28, size: [1.8, 1.4, 4.2] }, { w: 3.2, d: 4.2, h: 1.4 });
  const world = CollisionWorld.fromLevel(data);
  const corner = ColliderFootprint.rotatedExtent(0, 0, 1.8, 4.2, 28);
  const r = PLAYER_BODY.radius;
  // A body just outside the written box but touching the drawn car is stopped.
  const probeX = 1.6 + r + 0.05;
  assert.ok(probeX - r < corner.maxX);
  assert.ok(world.hit(probeX, 0, r, 0, PLAYER_BODY.height));
  const moved = world.move(5, 0, -5, 0, r, 0, PLAYER_BODY.height);
  assert.ok(moved.hitX);
  assert.ok(moved.x - r >= corner.maxX);
});

test('every shipped level loads with free spawns against the grown collision boxes', async () => {
  const names = (await readdir(new URL('../web/levels/', import.meta.url)))
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.slice(0, -5));
  assert.ok(names.includes('ch1') && names.includes('ch2') && names.includes('ch3'));
  for (const name of names) {
    const raw = JSON.parse(await readFile(new URL('../web/levels/' + name + '.json', import.meta.url), 'utf8'));
    const data = new LevelData(raw, name);
    assert.equal(data.collisionBoxes.length, data.colliders.length, name);
    data.collisionBoxes.forEach((box, i) => {
      const written = data.colliders[i];
      assert.equal(box.id, written.id);
      assert.ok(box.w >= written.w - 1e-9 && box.d >= written.d - 1e-9 && box.h >= written.h - 1e-9);
    });
    const inside = data.warnings.filter((w) => w.includes('is inside collider'));
    assert.deepEqual(inside, [], name);
  }
});
