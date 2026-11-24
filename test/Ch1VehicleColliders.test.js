import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LevelData } from '../web/js/LevelData.js';
import { CollisionWorld } from '../web/js/CollisionWorld.js';
import { PathFinder } from '../web/js/PathFinder.js';
import { PLAYER_BODY } from '../web/js/player/PlayerBody.js';

const load = async () => new LevelData(JSON.parse(await readFile(new URL('../web/levels/ch1.json', import.meta.url), 'utf8')));
const placed = (prop, x, z) => {
  const angle = prop.rotY * Math.PI / 180;
  return { x: prop.x + x * Math.cos(angle) + z * Math.sin(angle), z: prop.z - x * Math.sin(angle) + z * Math.cos(angle) };
};

test('ch1 vehicle doors, mirrors and tipped body sections block traversal', async () => {
  const level = await load();
  const world = CollisionWorld.fromLevel(level);
  // Independently measured solid points, in the builders' local space. These used to sit
  // outside the written colliders. Quarter-turned vehicles exercise the level transform too.
  const probes = [
    ['car_wreck_2', 0, -2.26], ['truck_wreck_8', 2.12, -2.7],
    ['car_flipped_10', -1.02, 0], ['car_wreck_16', -1.32, -0.5],
    ['van_wreck_18', 1.87, -0.5], ['car_flipped_23', 1, 0],
    ['car_wreck_27', -1.91, -0.5], ['car_wreck_27', 1.94, -0.5],
    ['truck_wreck_30', 1.52, -3.1], ['car_wreck_33', -0.97, 0],
    ['escape_car_38', 0, -2.17],
  ];
  for (const [id, x, z] of probes) {
    const prop = level.props.find(p => p.collider === id);
    const point = placed(prop, x, z);
    const old = level.collider(id);
    assert.ok(Math.abs(point.x - old.x) > old.w / 2 || Math.abs(point.z - old.z) > old.d / 2, id + ' regression probe');
    assert.ok(world.hit(point.x, point.z, 0.001, 0, PLAYER_BODY.height), id + ' solid point');
  }
  const open = level.props.find(p => p.collider === 'car_wreck_27');
  const moved = world.move(open.x + 3, open.z, -2, 0, PLAYER_BODY.radius, 0, PLAYER_BODY.height);
  assert.ok(moved.hitX);
  assert.ok(moved.x >= open.x + 1.953 + PLAYER_BODY.radius, 'movement stops outside the open door');
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
