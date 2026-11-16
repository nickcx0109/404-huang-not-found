import test from 'node:test';
import assert from 'node:assert/strict';
import { Aabb, CollisionWorld } from '../web/js/CollisionWorld.js';
import { LevelFlow } from '../web/js/level/LevelFlow.js';

function setup({ markers, blocks = [], player = { x: 0, z: 0 }, store = new Set(), name = 'floor1' } = {}) {
  const level = { name, markersOfType: (type) => markers.filter((marker) => marker.type === type) };
  const collision = new CollisionWorld();
  collision.add(new Aabb(-20, 0, -20, -19, 3, -19, 'wall'));
  blocks.forEach((box) => collision.add(box));
  const calls = [];
  const body = { ...player, spawnAt(spawn) { Object.assign(this, { x: spawn.x, z: spawn.z, yaw: spawn.yaw }); } };
  const flow = new LevelFlow({
    level, collision, player: body, store, clearSeconds: 2, reach: 1.5,
    navigate: (target, from) => calls.push([target, from]),
  });
  return { flow, collision, calls, body, store };
}

const exit = (id, x, z, r = 0.8, yaw = 0) => ({ id, type: 'exit', x, z, r, yaw });

test('LevelFlow loads the target level once when the player walks into an exit', () => {
  const { flow, calls, body } = setup({ markers: [exit('to_floor2', 5, 0)] });
  assert.equal(flow.update(0.1, false), null);
  assert.deepEqual(calls, []);
  body.x = 4.6;
  flow.update(0.1, false);
  flow.update(0.1, false);
  assert.deepEqual(calls, [['floor2', 'floor1']]);
});

test('LevelFlow ignores markers that are not exits or do not name a target', () => {
  const markers = [{ id: 'fuel_01', type: 'fuel', x: 0, z: 0, r: 2, yaw: 0 }, exit('somewhere', 0, 0, 2)];
  const { flow, calls } = setup({ markers });
  flow.update(0.1, false);
  assert.equal(flow.exits.length, 0);
  assert.deepEqual(calls, []);
});

test('LevelFlow does not fire an exit the player starts in until they have stepped out of it', () => {
  const { flow, calls, body } = setup({ markers: [exit('to_floor2', 0, 0)] });
  flow.update(0.1, false);
  assert.deepEqual(calls, []);
  body.x = 3;
  flow.update(0.1, false);
  body.x = 0.2;
  flow.update(0.1, false);
  assert.deepEqual(calls, [['floor2', 'floor1']]);
});

test('LevelFlow.arriveFrom puts the player on the exit that leads back, facing its yaw', () => {
  const markers = [exit('to_floor1', -3, 4, 0.8, 90), exit('to_roof', 6, 4)];
  const { flow, calls, body } = setup({ markers, name: 'floor2' });
  assert.equal(flow.arriveFrom('floor1'), true);
  assert.deepEqual([body.x, body.z, body.yaw], [-3, 4, 90]);
  flow.update(0.1, false);
  assert.deepEqual(calls, []);
  assert.equal(flow.arriveFrom('basement'), false);
});

test('LevelFlow keeps a blocked exit shut and clears the block after the key is held long enough', () => {
  const box = new Aabb(4, 0, -1, 6, 1.5, 1, 'block_to_floor2');
  const { flow, collision, calls, body, store } = setup({ markers: [exit('to_floor2', 3.4, 0)], blocks: [box] });
  let cleared = null;
  flow.onCleared = (removed) => { cleared = removed; };

  body.x = 3.2;
  assert.deepEqual(flow.update(0.5, false), { exitId: 'to_floor2', progress: 0 });
  assert.deepEqual(calls, []);
  assert.equal(flow.isBlocked('to_floor2'), true);

  assert.equal(flow.update(1, true).progress, 0.5);
  assert.equal(flow.update(0.5, false).progress, 0, 'letting go starts over');
  flow.update(1.2, true);
  assert.equal(flow.update(1, true), null);
  assert.equal(cleared, box);
  assert.equal(collision.boxes.includes(box), false);
  assert.equal(collision.boxes.length, 1, 'other boxes are untouched');
  assert.equal(store.has('floor1:to_floor2'), true);

  flow.update(0.1, false);
  assert.deepEqual(calls, [], 'the player must step into the opened exit again');
  body.x = 0;
  flow.update(0.1, false);
  body.x = 3.2;
  flow.update(0.1, false);
  assert.deepEqual(calls, [['floor2', 'floor1']]);
});

test('LevelFlow only offers to clear a block that is within reach', () => {
  const box = new Aabb(4, 0, -1, 6, 1.5, 1, 'block_to_floor2');
  const { flow, body } = setup({ markers: [exit('to_floor2', 3.4, 0)], blocks: [box] });
  body.x = 0;
  assert.equal(flow.update(5, true), null);
  assert.equal(flow.isBlocked('to_floor2'), true);
});

test('LevelFlow leaves a block cleared on an earlier visit open and reports it', () => {
  const box = new Aabb(4, 0, -1, 6, 1.5, 1, 'block_to_floor2');
  const store = new Set(['floor1:to_floor2']);
  const { flow, collision } = setup({ markers: [exit('to_floor2', 3.4, 0)], blocks: [box], store });
  assert.equal(flow.isBlocked('to_floor2'), false);
  assert.equal(collision.boxes.includes(box), false);
  assert.deepEqual(flow.remembered, [box]);
});
