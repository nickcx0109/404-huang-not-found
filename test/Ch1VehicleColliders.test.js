import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LevelData } from '../web/js/LevelData.js';
import { CollisionWorld } from '../web/js/CollisionWorld.js';
import { ColliderFootprint } from '../web/js/level/ColliderFootprint.js';
import { PathFinder } from '../web/js/PathFinder.js';
import { PLAYER_BODY } from '../web/js/player/PlayerBody.js';

const load = async () => new LevelData(JSON.parse(await readFile(new URL('../web/levels/ch1.json', import.meta.url), 'utf8')));
const placed = (prop, x, z) => {
  const angle = prop.rotY * Math.PI / 180;
  return {
    x: prop.x + prop.scale * (x * Math.cos(angle) + z * Math.sin(angle)),
    z: prop.z + prop.scale * (-x * Math.sin(angle) + z * Math.cos(angle)),
  };
};

const cars = ['car_wreck_2', 'car_flipped_10', 'car_wreck_16', 'car_flipped_23', 'car_wreck_27', 'car_wreck_33', 'escape_car_38'];
const largerVehicles = ['truck_wreck_8', 'van_wreck_18', 'truck_wreck_30'];

test('ch1 collision boxes cover the measured vehicle body footprints', async () => {
  const level = await load();
  assert.deepEqual(level.warnings, []);
  const world = CollisionWorld.fromLevel(level);
  for (const id of [...cars, ...largerVehicles]) {
    const prop = level.props.find(p => p.collider === id);
    assert.ok(prop?.footprint, id + ' missing measured footprint');
    const extent = ColliderFootprint.ofProp(prop, level.collider(id));
    const box = world.boxes.find(b => b.id === id);
    for (const axis of ['X', 'Y', 'Z']) {
      assert.ok(box['min' + axis] <= extent['min' + axis] + 1e-9, id + ' min' + axis);
      assert.ok(box['max' + axis] >= extent['max' + axis] - 1e-9, id + ' max' + axis);
    }
    assert.equal(world.hit(prop.x, prop.z, PLAYER_BODY.radius, 0, PLAYER_BODY.height)?.id, id);
  }
});

test('ch1 cars block rays through the body and let eye-height rays pass over the roof', async () => {
  const level = await load();
  const world = CollisionWorld.fromLevel(level);
  const direction = { x: 1, y: 0, z: 0 };
  for (const id of cars) {
    const prop = level.props.find(p => p.collider === id);
    const box = world.boxes.find(b => b.id === id);
    const bodyTop = prop.y + prop.footprint.maxY * prop.scale;
    assert.ok(bodyTop < PLAYER_BODY.eyeHeight, id + ' measured body is below eye height');
    const written = level.collider(id);
    assert.ok(box.maxY <= Math.max(bodyTop, written.y + written.h) + 1e-9, id + ' collision top');

    const origin = { x: box.minX - 0.1, y: bodyTop / 2, z: (box.minZ + box.maxZ) / 2 };
    const distance = box.maxX - box.minX + 0.2;
    assert.ok(Math.abs(world.raycast(origin, direction, distance) - 0.1) < 1e-9, id + ' body blocks ray');
    origin.y = PLAYER_BODY.eyeHeight;
    assert.equal(world.raycast(origin, direction, distance), Infinity, id + ' eye-height shot');
    assert.equal(world.raycastFace(origin, direction, distance), null, id + ' eye-height throw');
  }
});

test('ch1 open side doors and mirrors leave room to walk beside the vehicles', async () => {
  const level = await load();
  const world = CollisionWorld.fromLevel(level);
  for (const id of ['car_wreck_16', 'van_wreck_18', 'car_wreck_27', 'truck_wreck_30']) {
    const prop = level.props.find(p => p.collider === id);
    const collider = level.collider(id);
    const halfWidth = (prop.rotY === 90 ? collider.d : collider.w) / 2;
    // Leave 10 cm beyond the original width for the truck's running boards.
    const offset = halfWidth + PLAYER_BODY.radius + 0.1;
    for (const side of [-1, 1]) {
      const p = placed(prop, side * offset, 0);
      assert.equal(world.hit(p.x, p.z, PLAYER_BODY.radius, 0, PLAYER_BODY.height), null, id + ' side ' + side);
    }
  }
});

test('ch1 loose luggage, cartons, skid marks and light pools stay walkable', async () => {
  const level = await load();
  const world = CollisionWorld.fromLevel(level);
  for (const [id, x, z] of [
    ['car_wreck_2', 0.2, 5], ['car_wreck_27', 0, 5],
    ['truck_wreck_30', 0, 5], ['van_wreck_18', 0, -6],
    ['car_wreck_33', -2.3, 0], ['escape_car_38', 0, 4],
  ]) {
    const prop = level.props.find(p => p.collider === id);
    const p = placed(prop, x, z);
    assert.equal(world.hit(p.x, p.z, PLAYER_BODY.radius, 0, PLAYER_BODY.height), null, id);
  }
});

test('ch1 players can traverse the chapter and zombies can still reach every player spawn', async () => {
  const level = await load();
  const world = CollisionWorld.fromLevel(level);
  const finder = new PathFinder(world);
  const home = level.spawns.players[0];
  const escape = level.props.find(p => p.name === 'escape_car');
  const goals = [...level.spawns.players, ...level.spawns.zombies, ...level.markers, { x: escape.x, z: escape.z + 3 }];
  for (const goal of goals) {
    const path = finder.findPath(home.x, home.z, goal.x, goal.z);
    assert.ok(path?.length, 'route to ' + JSON.stringify(goal));
    assert.ok(path.every(p => !world.hit(p.x, p.z, PLAYER_BODY.radius, 0, PLAYER_BODY.height)));
  }
  for (const zombie of level.spawns.zombies) for (const player of level.spawns.players) {
    assert.ok(finder.findPath(zombie.x, zombie.z, player.x, player.z)?.length);
  }
});
