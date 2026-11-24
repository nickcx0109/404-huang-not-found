// Model footprints (TODO B17): a level prop drawn with a GLB model must not stick out of its
// collision box. The manifest records each model's real box ("footprint", measured from the
// GLB); a level prop copies it into its own "footprint", which LevelData.collisionBoxes reads.
// These tests tie the three together: GLB -> manifest -> level -> collision box.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { LevelData } from '../web/js/LevelData.js';
import { ColliderFootprint } from '../web/js/level/ColliderFootprint.js';
import { CollisionWorld } from '../web/js/CollisionWorld.js';
import { PathFinder } from '../web/js/PathFinder.js';
import { PLAYER_BODY } from '../web/js/player/PlayerBody.js';

const ROOT = new URL('../', import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, ROOT), 'utf8'));
const MM = 0.001;

/** Box of every vertex of a GLB, from the POSITION accessors' min / max (no node transforms: check_assets forbids them). */
async function glbBounds(id) {
  const data = await readFile(new URL('web/assets/models/' + id + '.glb', ROOT));
  const gltf = JSON.parse(data.toString('utf8', 20, 20 + data.readUInt32LE(12)));
  assert.ok(gltf.nodes.every((n) => !n.matrix && !n.rotation && !n.scale && !n.translation), id + ' has node transforms');
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of gltf.meshes) {
    for (const primitive of mesh.primitives) {
      const a = gltf.accessors[primitive.attributes.POSITION];
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], a.min[k]);
        max[k] = Math.max(max[k], a.max[k]);
      }
    }
  }
  return { min, max };
}

/** Ready assets with a recorded footprint, by id, from every manifest. */
async function manifestFootprints() {
  const out = new Map();
  for (const file of await readdir(new URL('art/manifest/', ROOT))) {
    if (!file.endsWith('.json')) continue;
    const manifest = await json('art/manifest/' + file);
    for (const asset of manifest.assets) {
      if (asset.footprint) out.set(asset.id, { ...asset, manifest: file.slice(0, -5) });
    }
  }
  return out;
}

const toLocal = (f) => ({ minX: f.min[0], minY: f.min[1], minZ: f.min[2], maxX: f.max[0], maxY: f.max[1], maxZ: f.max[2] });

test('every vehicle model records a footprint in its manifest', async () => {
  const footprints = await manifestFootprints();
  for (const id of ['car_wreck', 'car_parked', 'truck_wreck', 'van_wreck']) {
    assert.ok(footprints.has(id), id + ' has no footprint');
  }
});

test('each manifest footprint covers its GLB and is at most 2 mm larger', async () => {
  for (const [id, asset] of await manifestFootprints()) {
    if (asset.status !== 'ready') continue;
    const glb = await glbBounds(id);
    for (let k = 0; k < 3; k++) {
      assert.ok(asset.footprint.min[k] <= glb.min[k] + 1e-6, id + ' min[' + k + '] ' + asset.footprint.min[k] + ' > model ' + glb.min[k]);
      assert.ok(asset.footprint.max[k] >= glb.max[k] - 1e-6, id + ' max[' + k + '] ' + asset.footprint.max[k] + ' < model ' + glb.max[k]);
      assert.ok(glb.min[k] - asset.footprint.min[k] <= 2 * MM, id + ' min[' + k + '] is loose');
      assert.ok(asset.footprint.max[k] - glb.max[k] <= 2 * MM, id + ' max[' + k + '] is loose');
    }
  }
});

test('every shipped prop drawn with a model has its turned and scaled model inside its collision box', async () => {
  const footprints = await manifestFootprints();
  let checked = 0;
  for (const file of await readdir(new URL('web/levels/', ROOT))) {
    if (!file.endsWith('.json')) continue;
    const name = file.slice(0, -5);
    const raw = await json('web/levels/' + file);
    const level = new LevelData(raw, name);
    for (const prop of level.props) {
      const asset = footprints.get(prop.name);
      if (!asset || asset.status !== 'ready' || !level.manifests.includes(asset.manifest) || !prop.collider) continue;
      const model = ColliderFootprint.ofProp({ ...prop, footprint: toLocal(asset.footprint) }, level.collider(prop.collider));
      const box = level.collisionBox(prop.collider);
      const label = name + ' ' + prop.name + ' on ' + prop.collider;
      assert.ok(model.minX >= box.x - box.w / 2 - 1e-9 && model.maxX <= box.x + box.w / 2 + 1e-9, label + ': sticks out on x');
      assert.ok(model.minZ >= box.z - box.d / 2 - 1e-9 && model.maxZ <= box.z + box.d / 2 + 1e-9, label + ': sticks out on z');
      assert.ok(model.minY >= box.y - 1e-9 && model.maxY <= box.y + box.h + 1e-9, label + ': sticks out on y');
      checked++;
    }
  }
  assert.ok(checked >= 18, 'ch2 alone has 18 model vehicles, checked ' + checked);
});

test('ch2 trucks and vans: the collision box is as wide as the model, not the old size', async () => {
  const ch2 = new LevelData(await json('web/levels/ch2.json'), 'ch2');
  // truck_wreck is 3.216 m wide (size said 2.6, collider 3); turned 0 / 180 it stays along x.
  for (const id of ['truck_w', 'truck_e']) {
    assert.ok(Math.abs(ch2.collisionBox(id).w - 3.218) < 1e-9, id + ' w ' + ch2.collisionBox(id).w);
    assert.ok(ch2.collisionBox(id).h >= 3.286 - 1e-9);
  }
  // van_wreck is 2.573 m wide (size said 2.2, collider 2.3); turned +-90 its width runs along z.
  for (const id of ['van_w', 'van_e']) {
    assert.ok(Math.abs(ch2.collisionBox(id).d - 2.574) < 1e-9, id + ' d ' + ch2.collisionBox(id).d);
  }
});

test('a model footprint follows a prop turned 90 degrees and scaled', () => {
  const footprint = { min: [-1.609, 0, -3.5], max: [1.609, 3.286, 3.5] };
  const level = new LevelData({
    name: 'turned',
    colliders: [{ id: 'truck', x: 10, z: 0, w: 7, d: 3, h: 3.2 }],
    props: [{ name: 'truck_wreck', collider: 'truck', rotY: 90, scale: 1.5, footprint }],
    spawns: { players: [{ x: 0, z: 0 }], zombies: [{ x: 20, z: 0, r: 0 }] },
    bookmarks: [{ name: 'view', pos: [0, 2, -5], lookAt: [0, 0, 5] }],
  });
  const box = level.collisionBox('truck');
  assert.ok(Math.abs(box.w - 7 * 1.5) < 1e-9);
  assert.ok(Math.abs(box.d - 3.218 * 1.5) < 1e-9);
  assert.ok(Math.abs(box.h - 3.286 * 1.5) < 1e-9);
});

test('ch2 zombies still find paths between every zombie spawn and every player spawn', async () => {
  const ch2 = new LevelData(await json('web/levels/ch2.json'), 'ch2');
  const world = CollisionWorld.fromLevel(ch2);
  const finder = new PathFinder(world);
  for (const z of ch2.spawns.zombies) {
    for (const p of ch2.spawns.players) {
      const path = finder.findPath(z.x, z.z, p.x, p.z);
      assert.ok(path && path.length > 0, 'no path from zombie spawn ' + z.x + ',' + z.z + ' to ' + p.x + ',' + p.z);
      assert.ok(path.every((q) => !world.hit(q.x, q.z, PLAYER_BODY.radius, 0, PLAYER_BODY.height)));
    }
  }
});
