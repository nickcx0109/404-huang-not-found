import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { ColliderFootprint } from '../web/js/level/ColliderFootprint.js';
import { LevelData } from '../web/js/LevelData.js';
import { CollisionWorld } from '../web/js/CollisionWorld.js';
import { PLAYER_BODY } from '../web/js/player/PlayerBody.js';
import { PathFinder } from '../web/js/PathFinder.js';

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

const centred = (w, d) => ({ minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 });

test('placedExtent keeps 0° and quarter turns exact and grows a 45° turn by its diagonal', () => {
  const box = centred(2, 4);
  assert.deepEqual(ColliderFootprint.placedExtent(box, 1, 2, 0), { minX: 0, maxX: 2, minZ: 0, maxZ: 4 });
  assert.deepEqual(ColliderFootprint.placedExtent(box, 1, 2, 90), { minX: -1, maxX: 3, minZ: 1, maxZ: 3 });
  assert.deepEqual(ColliderFootprint.placedExtent(box, 1, 2, -90), { minX: -1, maxX: 3, minZ: 1, maxZ: 3 });
  assert.deepEqual(ColliderFootprint.placedExtent(box, 1, 2, 180), { minX: 0, maxX: 2, minZ: 0, maxZ: 4 });
  const half = (2 + 4) * Math.SQRT1_2 / 2;
  const e = ColliderFootprint.placedExtent(box, 0, 0, 45);
  close(e.maxX, half, 'maxX');
  close(e.minX, -half, 'minX');
  close(e.maxZ, half, 'maxZ');
  close(e.minZ, -half, 'minZ');
});

test('placedExtent turns an off-centre box about the prop origin the way three.js does', () => {
  // Local box x 0..2, z 0..1 (all on the +x, +z side of the origin).
  const box = { minX: 0, maxX: 2, minZ: 0, maxZ: 1 };
  // three.js rotation.y = +90°: local +x points to level -z, local +z to level +x.
  assert.deepEqual(ColliderFootprint.placedExtent(box, 10, 20, 90), { minX: 10, maxX: 11, minZ: 18, maxZ: 20 });
  assert.deepEqual(ColliderFootprint.placedExtent(box, 10, 20, -90), { minX: 9, maxX: 10, minZ: 20, maxZ: 22 });
  assert.deepEqual(ColliderFootprint.placedExtent(box, 10, 20, 180), { minX: 8, maxX: 10, minZ: 19, maxZ: 20 });
  // Scale grows the box away from the origin, not from its own centre.
  assert.deepEqual(ColliderFootprint.placedExtent(box, 0, 0, 0, 2), { minX: 0, maxX: 4, minZ: 0, maxZ: 2 });
});

test('a { min, max } footprint off the origin grows the collider on that side only', () => {
  const data = level({ footprint: { min: [-1, 0, -2], max: [1, 1.5, 3] } });
  const box = data.collisionBoxes[0];
  assert.deepEqual([box.x - box.w / 2, box.x + box.w / 2], [-1, 1]);
  assert.deepEqual([box.z - box.d / 2, box.z + box.d / 2], [-2, 3]);
  const turned = level({ footprint: { min: [-1, 0, -2], max: [1, 1.5, 3] }, rotY: 90 });
  const t = turned.collisionBoxes[0];
  // local z 3 -> level x +3; local z -2 -> level x -2
  assert.deepEqual([t.x - t.w / 2, t.x + t.w / 2], [-2, 3]);
  assert.throws(() => level({ footprint: { min: [0, 0, 0], max: [1, 0, 1] } }), (err) =>
    err.problems.some((p) => p.startsWith('props[0].footprint')));
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
  assert.deepEqual(flat.props[0].footprint, { minX: -0.5, minY: 0, minZ: -0.45, maxX: 0.5, maxY: 1.5, maxZ: 0.45 });
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
  const corner = ColliderFootprint.placedExtent(centred(1.8, 4.2), 0, 0, 28);
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

// ---- the shipped props the review measured ---------------------------------------------------
// Expected corners below are worked out by hand from the stand-in builders (Ch1Props.barrierFallen,
// Ch3Props.deskFlipped, CommonProps.carWreck) and three.js's rotation matrices, not with
// ColliderFootprint, so they check the level data and the helper together.

const DEG = Math.PI / 180;
/** Same as hash01 in Ch1Props.js / Ch3Props.js. */
const hash01 = (prop, salt) => {
  const s = Math.sin(prop.x * 127.1 + prop.z * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
/** A point of a prop's own space in level space: three.js rotation.y = rotY about the prop origin. */
const toLevel = (prop, x, z) => {
  const a = prop.rotY * DEG;
  return { x: prop.x + Math.cos(a) * x + Math.sin(a) * z, z: prop.z - Math.sin(a) * x + Math.cos(a) * z };
};
const MM = 0.001; // footprints are written rounded to the centimetre, at most 0.5 mm inward
const assertInside = (box, p, label) => {
  assert.ok(p.x >= box.x - box.w / 2 - MM && p.x <= box.x + box.w / 2 + MM, label + ' x ' + p.x + ' outside box');
  assert.ok(p.z >= box.z - box.d / 2 - MM && p.z <= box.z + box.d / 2 + MM, label + ' z ' + p.z + ' outside box');
};
const outside = (c, p) => Math.abs(p.x - c.x) > c.w / 2 || Math.abs(p.z - c.z) > c.d / 2;
const shipped = async (name) =>
  new LevelData(JSON.parse(await readFile(new URL('../web/levels/' + name + '.json', import.meta.url), 'utf8')), name);

test('ch1 fallen barrier: its top, tipped forward about its base, is inside the collision box', async () => {
  const ch1 = await shipped('ch1');
  const prop = ch1.props.find((p) => p.collider === 'barrier_fallen_3');
  // barrier(): 2.2 wide, 0.9 tall; the part above 0.27 m is 0.25 deep (z +-0.125).
  // barrierFallen(): rotation.x = 88..94 degrees about the barrier's base: z' = y sin + z cos.
  const t = (88 + 6 * hash01(prop, 1)) * DEG;
  const topZ = 0.9 * Math.sin(t) + 0.125 * Math.cos(t); // about 0.90 m in front of the origin
  assert.ok(topZ > 0.89 && topZ < 0.91);
  const box = ch1.collisionBox('barrier_fallen_3');
  for (const x of [-1.1, 1.1]) {
    const p = toLevel(prop, x, topZ);
    assert.ok(outside(ch1.collider('barrier_fallen_3'), p), 'the written collider missed it');
    assertInside(box, p, 'barrier top');
  }
  // The review's probe: a player standing against the fallen barrier's top edge.
  const world = CollisionWorld.fromLevel(ch1);
  assert.ok(world.hit(2.3, -23.65, PLAYER_BODY.radius, 0, PLAYER_BODY.height));
});

test('ch3 flipped desks: every corner of the tipped desk top is inside the collision box', async () => {
  for (const name of ['ch3', 'ch3_2f']) {
    const level = await shipped(name);
    const desks = level.props.filter((p) => p.name === 'ch3_desk_flipped');
    assert.ok(desks.length > 0);
    let missedBefore = 0;
    for (const prop of desks) {
      const { w, h, d } = prop.size;
      // desk(): top slab 0.05 thick at y = h - 0.05 .. h, w x d centred. deskFlipped(): turned
      // about z by +-(80..96) degrees, then lifted by w / 2: x' = x cos - y sin.
      const f = (hash01(prop, 7) < 0.5 ? 1 : -1) * (80 + 16 * hash01(prop, 8)) * DEG;
      const box = level.collisionBox(prop.collider);
      for (const x of [-w / 2, w / 2]) {
        for (const y of [h - 0.05, h]) {
          for (const z of [-d / 2, d / 2]) {
            const p = toLevel(prop, x * Math.cos(f) - y * Math.sin(f), z);
            if (outside(level.collider(prop.collider), p)) missedBefore++;
            assertInside(box, p, name + ' ' + prop.collider);
          }
        }
      }
    }
    assert.ok(missedBefore > 0, name + ': the written colliders missed some corners');
  }
});

test('mood car wreck: the corners of the car rolled 2.5 and turned 28 degrees are inside the collision box', async () => {
  const mood = await shipped('mood');
  const prop = mood.props.find((p) => p.collider === 'car_wreck');
  const { w, h, d } = prop.size;
  // carBody(): body w wide, from y = 0.2 h up to 0.62 h, d long; tyres 0.14 w wide centred at
  // +-0.44 w, 0.44 h tall, at +-0.3 d (0.16 d long). carWreck(): rotation.z = 2.5 degrees.
  const r = 2.5 * DEG;
  const roll = (x, y) => x * Math.cos(r) - y * Math.sin(r);
  const points = [];
  for (const z of [-d / 2, d / 2]) {
    points.push([roll(-w / 2, 0.62 * h), z], [roll(w / 2, 0.2 * h), z]);
  }
  const tyreX = 0.44 * w + 0.07 * w;
  for (const end of [-1, 1]) {
    for (const z of [end * 0.3 * d - 0.08 * d, end * 0.3 * d + 0.08 * d]) {
      points.push([roll(-tyreX, 0.44 * h), z], [roll(tyreX, 0), z]);
    }
  }
  assert.ok(Math.abs(roll(-tyreX, 0.44 * h) + 0.944) < 0.001); // the low side sticks out 4.4 cm
  const box = mood.collisionBox('car_wreck');
  points.forEach(([x, z]) => assertInside(box, toLevel(prop, x, z), 'car'));
});

test('implicit bounds come from the collision boxes, so a route around a grown obstacle exists', () => {
  const data = new LevelData({
    name: 'nobounds',
    colliders: [{ id: 'post', x: 0, z: 5, w: 0.4, d: 0.4, h: 1 }],
    // The prop is an 8 m wall bound to a thin post: bounds from the written post would be 4.4 m wide.
    props: [{ name: 'low_wall', collider: 'post', size: [8, 1, 0.4] }],
    spawns: { players: [{ x: 0, z: 0 }], zombies: [{ x: 0, z: 10, r: 0 }] },
    bookmarks: [{ name: 'view', pos: [0, 2, -5], lookAt: [0, 0, 5] }],
  });
  // collision box x -4..4, plus the 2 m margin
  assert.deepEqual([data.bounds.x - data.bounds.w / 2, data.bounds.x + data.bounds.w / 2], [-6, 6]);
  const world = CollisionWorld.fromLevel(data);
  const path = new PathFinder(world).findPath(0, 0, 0, 10);
  assert.ok(path, 'the zombies can walk around the wall');
  assert.ok(path.some((p) => Math.abs(p.x) > 4), 'the route goes around the end of the wall');
  assert.ok(path.every((p) => !world.hit(p.x, p.z, PLAYER_BODY.radius, 0, PLAYER_BODY.height)));
});

test('LevelData.collisionBox looks a collision box up by collider id', () => {
  const data = level({ rotY: 90 });
  assert.equal(data.collisionBox('car'), data.collisionBoxes[0]);
  assert.equal(data.collisionBox('missing'), null);
});
