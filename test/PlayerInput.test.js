import test from 'node:test';
import assert from 'node:assert/strict';
import { browserInput, PlayerCombat } from './helpers/playerInput.js';
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
  const controller = { x: 0, z: 0, locked: true, requestLock() {} };
  const camera = { position: { x: 0, y: 1.7, z: 0 },
    getWorldDirection(direction) { Object.assign(direction, { x: 0, y: 0, z: -1 }); } };
  const player = new CombatPlayer('player', controller, events);
  player.weapons.add(new Rifle({ fire: () => null }));
  ctx.players.push(player);
  const session = new GameSession(ctx, { factory: { dispose() {} },
    director: { remaining: 1, start() {}, nextSpawn: () => false }, economy: new Economy() });
  const combat = new PlayerCombat(controller, camera, ctx, player.id);
  input.cleanup.push(() => { combat.dispose(); session.dispose(); });
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
