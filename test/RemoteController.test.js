import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld, Aabb } from '../web/js/CollisionWorld.js';
import { PLAYER_BODY } from '../web/js/player/PlayerBody.js';
import { PLAYER_SPEED } from '../web/js/player/PlayerSpeed.js';
import { RemoteController, InputResult, MAX_INPUT_GAP_SECONDS } from '../server/game/RemoteController.js';

function fixture({ walls = [] } = {}) {
  const collision = new CollisionWorld();
  for (const wall of walls) collision.add(wall);
  const session = { canMove: true, rooted: false, context: { collision }, isRooted() { return this.rooted; } };
  const controller = new RemoteController({ x: 0, z: 0, yaw: 0.5 }, { now: 1000 }).attach(session, 'p1');
  return { session, controller };
}

const input = (seq, fields) => ({ t: 'input', seq, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, ...fields });

test('RemoteController starts as plain data at its spawn', () => {
  const { controller } = fixture();
  assert.deepEqual([controller.x, controller.y, controller.z, controller.yaw, controller.pitch], [0, 0, 0, 0.5, 0]);
  assert.equal(controller.speedMultiplier, 1);
  assert.equal(controller.ack, -1);
  assert.equal(controller.speed, PLAYER_SPEED.sprint);
});

test('a legal move is taken as is and advances ack; old or repeated seq is ignored', () => {
  const { controller } = fixture();
  assert.equal(controller.accept(input(1, { x: 0.1, z: -0.2, yaw: 1, pitch: 0.2 }), 1033), InputResult.MOVED);
  assert.deepEqual([controller.x, controller.z, controller.yaw, controller.pitch, controller.ack], [0.1, -0.2, 1, 0.2, 1]);
  assert.equal(controller.accept(input(1, { x: 5 }), 1066), InputResult.STALE);
  assert.equal(controller.accept(input(0, { x: 5 }), 1066), InputResult.STALE);
  assert.equal(controller.x, 0.1);
  assert.equal(controller.ack, 1);
});

test('a move longer than speed × time × 1.5 + 0.5 m is cut to that length', () => {
  const { controller } = fixture();
  const seconds = 0.1;
  const limit = PLAYER_SPEED.sprint * seconds * 1.5 + 0.5;
  assert.equal(controller.accept(input(1, { x: 20 }), 1000 + seconds * 1000), InputResult.CLAMPED);
  assert.ok(Math.abs(controller.x - limit) < 1e-9);
  assert.equal(controller.z, 0);
});

test('the allowance follows the speed multiplier and a long silence earns at most one second', () => {
  const { controller } = fixture();
  controller.speedMultiplier = 2;
  assert.ok(Math.abs(controller.allowance(0.1) - (PLAYER_SPEED.sprint * 2 * 0.1 * 1.5 + 0.5)) < 1e-9);
  controller.speedMultiplier = 1;
  controller.accept(input(1, { x: 100 }), 1000 + 60_000);
  assert.ok(Math.abs(controller.x - controller.allowance(MAX_INPUT_GAP_SECONDS)) < 1e-9);
});

test('walls stop the move: a reported position behind a wall is pulled back in front of it', () => {
  const wall = new Aabb(-5, 0, -1.5, 5, 3, -1);
  const { controller } = fixture({ walls: [wall] });
  assert.equal(controller.accept(input(1, { z: -2 }), 1500), InputResult.CLAMPED);
  assert.ok(controller.z > wall.maxZ + PLAYER_BODY.radius - 1e-6, `stays in front of the wall, z=${controller.z}`);
});

test('rooted or not-playing players only turn; feet height stays within a jump', () => {
  const { session, controller } = fixture();
  session.rooted = true;
  assert.equal(controller.accept(input(1, { x: 0.2, yaw: 2 }), 1033), InputResult.ROOTED);
  assert.deepEqual([controller.x, controller.yaw, controller.ack], [0, 2, 1]);
  session.rooted = false;
  session.canMove = false;
  assert.equal(controller.accept(input(2, { x: 0.2 }), 1066), InputResult.ROOTED);
  session.canMove = true;
  assert.equal(controller.accept(input(3, { y: 9, pitch: 3 }), 1100), InputResult.CLAMPED);
  assert.equal(controller.y, 1);
  assert.ok(controller.pitch < Math.PI / 2);
  const detached = new RemoteController({ x: 0, z: 0 });
  assert.equal(detached.accept(input(1, { x: 0.1 }), 0), InputResult.ROOTED);
});

test('aimInto casts from the eyes: yaw 0 looks toward −Z, positive yaw turns left, positive pitch up', () => {
  const { controller } = fixture();
  const aim = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 0 } };
  Object.assign(controller, { x: 1, y: 0.25, z: 2, yaw: 0, pitch: 0 });
  controller.aimInto(aim);
  assert.deepEqual(aim.origin, { x: 1, y: 0.25 + PLAYER_BODY.eyeHeight, z: 2 });
  assert.deepEqual(aim.direction, { x: -0, y: 0, z: -1 });
  Object.assign(controller, { yaw: Math.PI / 2, pitch: Math.PI / 6 });
  controller.aimInto(aim);
  assert.ok(Math.abs(aim.direction.x + Math.cos(Math.PI / 6)) < 1e-9, 'left is −X');
  assert.ok(Math.abs(aim.direction.y - 0.5) < 1e-9);
  assert.ok(Math.abs(aim.direction.z) < 1e-9);
});
