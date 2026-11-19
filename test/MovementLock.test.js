import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { CombatPlayer } from '../web/js/player/CombatPlayer.js';
import { MovementLock } from '../web/js/player/MovementLock.js';
import { StarterPistol } from '../web/js/weapons/StarterPistol.js';
import { LoadoutHolder } from '../web/js/weapons/LoadoutHolder.js';
import { Bandage } from '../web/js/weapons/Bandage.js';
import { GameSession } from '../web/js/game/GameSession.js';

function setup() {
  const events = new EventBus();
  const ctx = { events, time: 0, players: [], enemies: [], effects: [],
    aim: { origin: { x: 0, y: 1.7, z: 0 }, direction: { x: 0, y: 0, z: -1 } } };
  for (const [id, x] of [['p1', 0], ['p2', 0], ['p3', 9]]) {
    const body = new CombatPlayer(id, { x, z: id === 'p2' ? -1.5 : 0 }, events, new LoadoutHolder(id, events));
    body.weapons.add(new StarterPistol());
    ctx.players.push(body);
  }
  return ctx;
}

function advance(ctx, seconds) {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) {
    ctx.time = Math.round((ctx.time + 0.05) * 100) / 100;
    for (const player of ctx.players) player.update(0.05, ctx);
  }
}

// GameSession.isRooted only reads the players, so a bare object with the context stands in for a session.
const sessionOf = ctx => ({ context: ctx, playerById: GameSession.prototype.playerById, isRooted: GameSession.prototype.isRooted });

test('Only an item being used can hold its owner still; guns never do', () => {
  assert.equal(new StarterPistol().holdsOwnerStill, false);
  const bandage = new Bandage();
  assert.equal(bandage.holdsOwnerStill, false, 'not while just held');
});

test('Bandaging yourself keeps you still until it is done, then frees you', () => {
  const ctx = setup();
  const session = sessionOf(ctx);
  const [me] = ctx.players;
  const controller = { rooted: false };
  const lock = new MovementLock(controller, session, 'p1');
  me.weapons.equip(new Bandage());
  me.damageable.health = 30;
  lock.update();
  assert.equal(controller.rooted, false, 'holding a bandage is fine');
  me.weapons.current.fire(ctx);
  lock.update();
  assert.equal(controller.rooted, true, 'applying it is not');
  advance(ctx, 3);
  lock.update();
  assert.equal(me.damageable.health, 70);
  assert.equal(controller.rooted, false, 'free again once it is done');
});

test('Healing a teammate keeps only the healer still, and putting it away frees them', () => {
  const ctx = setup();
  const session = sessionOf(ctx);
  const [healer, patient] = ctx.players;
  healer.weapons.equip(new Bandage());
  patient.damageable.health = 50;
  assert.equal(healer.weapons.current.secondary(ctx), true);
  assert.equal(session.isRooted('p1'), true);
  assert.equal(session.isRooted('p2'), false, 'the patient may still move');
  assert.equal(session.isRooted('nobody'), false);
  healer.weapons.switchTo(1);
  assert.equal(healer.weapons.current.id, 'pistol');
  assert.equal(session.isRooted('p1'), false, 'putting it away cancels it');
});

test('MovementLock lets go when it is disposed', () => {
  const controller = { rooted: true };
  new MovementLock(controller, { isRooted: () => true }, 'p1').dispose();
  assert.equal(controller.rooted, false);
});
