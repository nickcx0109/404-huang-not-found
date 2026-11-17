import test from 'node:test';
import assert from 'node:assert/strict';
import { browserInput, PlayerCombat, PlayerController } from './helpers/playerInput.js';
import { CollisionWorld } from '../web/js/CollisionWorld.js';
import { EventBus } from '../web/js/core/EventBus.js';
import { GameContext } from '../web/js/game/GameContext.js';
import { GameSession } from '../web/js/game/GameSession.js';
import { CombatPlayer } from '../web/js/player/CombatPlayer.js';
import { Rifle } from '../web/js/weapons/Rifle.js';
import { Economy } from '../web/js/economy/Economy.js';
import { EVENTS } from '../web/js/game/events.js';

function fixture(t) {
  const input = browserInput(t);
  const events = new EventBus();
  const ctx = new GameContext({ events, level: { markers: [{ type: 'shop', x: 0, z: 0, r: 1 }] } });
  const camera = { position: { x: 0, y: 1.7, z: 0 },
    rotation: { set() {} },
    getWorldDirection(direction) { Object.assign(direction, { x: 0, y: 0, z: -1 }); } };
  camera.position.set = (x, y, z) => Object.assign(camera.position, { x, y, z });
  const dom = { requestPointerLock() {
    input.document.pointerLockElement = dom;
    input.document.dispatchEvent(new Event('pointerlockchange'));
  } };
  const collision = new CollisionWorld();
  collision.bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
  const controller = new PlayerController(camera, dom, collision);
  controller.requestLock();
  const player = new CombatPlayer('player', controller, events);
  player.weapons.add(new Rifle({ fire: () => null }));
  ctx.players.push(player);
  const session = new GameSession(ctx, { factory: { dispose() {} },
    director: { remaining: 1, start() {}, update() {}, nextSpawn: () => false }, economy: new Economy() });
  const combat = new PlayerCombat(controller, camera, ctx, player.id);
  input.cleanup.push(() => { combat.dispose(); session.dispose(); controller.dispose(); });
  return { ...input, ctx, controller, camera, player, session, combat };
}

test('rejected shop requests leave a held rifle firing without another mouse press', t => {
  const { send, window, ctx, player, session, combat } = fixture(t);
  session.changeState(session.states.playing);
  const changes = [];
  ctx.events.on(EVENTS.SHOP_CHANGED, change => changes.push(change));
  send(window, 'mousedown', { button: 0 });
  assert.equal(player.weapons.current.ammo, 29);
  send(window, 'keydown', { code: 'KeyE' });
  assert.equal(session.shopOpen, false);
  assert.deepEqual(changes, [], 'a denied request is not a state change');
  assert.equal(combat.trigger.held, true);
  session.update(.05);
  session.update(.05);
  combat.update();
  assert.equal(player.weapons.current.ammo, 28, 'held fire continues past the rifle cooldown');
});

test('combat releases the trigger only for an opening notification of its own shop', t => {
  const { ctx, combat } = fixture(t);
  combat.trigger.press();
  ctx.events.emit(EVENTS.SHOP_CHANGED, { ownerId: 'player', open: false });
  ctx.events.emit(EVENTS.SHOP_CHANGED, { ownerId: 'other', open: true });
  assert.equal(combat.trigger.held, true);
  ctx.events.emit(EVENTS.SHOP_CHANGED, { ownerId: 'player', open: true });
  assert.equal(combat.trigger.held, false);
});

test('an unlocked shop permits WASD movement until leaving range closes it and stops movement', t => {
  const { send, window, document, controller, player, session, combat } = fixture(t);
  session.changeState(session.states.waveBreak);
  const locks = [];
  controller.onLockChange = locked => locks.push(locked);
  send(window, 'keydown', { code: 'KeyE' });
  assert.equal(session.shopOpen, true);
  assert.equal(controller.locked, false);
  assert.equal(controller.enabled, true);
  assert.deepEqual(locks, [false], 'lock callback reports the mouse state, not movement permission');
  send(document, 'mousemove', { movementX: 100, movementY: 50 });
  assert.equal(controller.yaw, 0, 'shop mouse does not turn the camera');
  send(window, 'mousedown', { button: 0 });
  combat.update();
  assert.equal(player.weapons.current.ammo, 30, 'shop mouse cannot fire');
  send(window, 'keydown', { code: 'KeyW' });
  for (let step = 0; step < 20 && session.shopOpen; step++) {
    controller.update(.05);
    session.update(.05);
  }
  assert.ok(controller.z < -1.35, 'keyboard movement carries the player beyond shop radius plus body');
  assert.equal(session.shopOpen, false);
  assert.equal(controller.enabled, false);
  assert.equal(controller.locked, false, 'automatic close waits for a user gesture to relock');
  const stopped = controller.z;
  send(window, 'keydown', { code: 'KeyW' });
  controller.update(.05);
  assert.equal(controller.z, stopped, 'automatic close also removes residual velocity');
  controller.requestLock();
  send(window, 'keydown', { code: 'KeyW' });
  controller.update(.05);
  assert.ok(controller.z < stopped, 'click-to-continue lock resumes movement');
});

test('Escape pauses shop movement, while E closes and requests pointer lock again', t => {
  const { send, window, controller, session } = fixture(t);
  session.changeState(session.states.waveBreak);
  send(window, 'keydown', { code: 'KeyE' });
  send(window, 'keydown', { code: 'KeyW' });
  controller.update(.05);
  send(window, 'keydown', { code: 'Escape' });
  assert.equal(session.shopOpen, false);
  assert.equal(controller.enabled, false);
  const stopped = controller.z;
  controller.update(.05);
  assert.equal(controller.z, stopped);
  controller.requestLock();
  send(window, 'keydown', { code: 'KeyE' });
  assert.equal(session.shopOpen, true);
  send(window, 'keydown', { code: 'KeyE' });
  assert.equal(session.shopOpen, false);
  assert.equal(controller.locked, true);
  assert.equal(controller.enabled, true);
});

test('death closes the shop and revokes unlocked keyboard movement', t => {
  const { send, window, player, controller, session } = fixture(t);
  session.changeState(session.states.waveBreak);
  send(window, 'keydown', { code: 'KeyE' });
  player.damageable.health = 0;
  session.refreshShops();
  assert.equal(session.shopOpen, false);
  assert.equal(session.canMove, false);
  assert.equal(controller.enabled, false);
  send(window, 'keydown', { code: 'KeyW' });
  controller.update(.05);
  assert.equal(controller.z, 0);
});

test('walking mode still enables keyboard movement only while pointer locked', t => {
  const { window, document, send, cleanup } = browserInput(t);
  const camera = { position: { set() {} }, rotation: { set() {} } };
  const collision = new CollisionWorld();
  collision.bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
  const dom = {};
  const controller = new PlayerController(camera, dom, collision);
  cleanup.push(() => controller.dispose());
  send(window, 'keydown', { code: 'KeyW' });
  controller.update(.05);
  assert.equal(controller.z, 0);
  document.pointerLockElement = dom;
  document.dispatchEvent(new Event('pointerlockchange'));
  controller.update(.05);
  assert.ok(controller.z < 0);
  document.exitPointerLock();
  assert.equal(controller.enabled, false);
  assert.equal(controller._keys.forward, false);
});
