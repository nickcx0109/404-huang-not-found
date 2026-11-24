import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatPlayer } from '../web/js/player/CombatPlayer.js';
import { EventBus } from '../web/js/core/EventBus.js';
import { DamageInfo } from '../web/js/entities/DamageInfo.js';
import { ReviveInteraction } from '../web/js/pickups/ReviveInteraction.js';
import { GameContext } from '../web/js/game/GameContext.js';
import { GameSession } from '../web/js/game/GameSession.js';
import { ChaseBrain } from '../web/js/enemies/Brain.js';
import { PlayerStatus } from '../web/js/ui/hud/PlayerStatus.js';
import { EVENTS } from '../web/js/game/events.js';

function fixture() {
  const events = new EventBus();
  const ctx = new GameContext({ events });
  const a = new CombatPlayer('a', { x: 0, z: 0 }, events);
  const b = new CombatPlayer('b', { x: 1, z: 0 }, events);
  ctx.players.push(a, b);
  const session = new GameSession(ctx, { factory: { dispose() {} }, director: {
    remaining: 1, start() {}, update() {}, nextSpawn() { return false; }
  }});
  session.start(); session.update(0);
  return { ctx, a, b, session, revive: session.revives };
}
function down(player) { player.damageable.takeDamage(new DamageInfo({ sourceId: 'test', targetId: player.id, amount: 100 })); }

test('zero health downs a player without publishing a death; normal healing cannot revive', () => {
  const { ctx, a, session } = fixture();
  let deaths = 0; ctx.events.on(EVENTS.ENTITY_DIED, () => deaths++);
  down(a);
  assert.equal(a.downed, true); assert.equal(a.damageable.alive, false);
  assert.equal(deaths, 0); assert.equal(a.damageable.heal(40), 0);
  assert.equal(session.isRooted(a.id), true); assert.equal(session.pickUp(a.id), false);
});

test('held rescue revives with configured health and uses existing HUD progress', () => {
  const { a, b, session, revive } = fixture(); down(b);
  revive.hold(a.id, true); revive.update(1.5);
  const status = new PlayerStatus().read(session, a.id);
  assert.equal(status.actionProgress, 0.5); assert.ok(status.action);
  revive.update(1.5);
  assert.equal(b.downed, false); assert.equal(b.damageable.health, 40);
  assert.equal(revive.progressFor(a), null);
});

test('release E or leave range cancels rescue and a fresh hold starts from zero', () => {
  const { a, b, revive } = fixture(); down(b);
  revive.hold(a.id, true); revive.update(2); revive.hold(a.id, false);
  assert.equal(revive.progressFor(a), null);
  revive.hold(a.id, true); revive.update(1);
  a.position.x = 10; revive.update(1); assert.equal(revive.progressFor(a), null);
  a.position.x = 0; revive.update(1); assert.equal(revive.progressFor(a).fraction, 1 / 3);
  down(a); revive.update(2); assert.equal(revive.progressFor(a), null);
  assert.equal(b.downed, true);
});

test('disposing a session mid-revive clears held input and releases the target', () => {
  const { ctx, a, b, session, revive } = fixture();
  down(b);
  revive.hold(a.id, true);
  session.update(0.05);
  assert.ok(revive.progressFor(a).fraction > 0);
  assert.equal(revive.tasks.get(a.id).target, b);

  session.dispose();
  assert.equal(revive.held.size, 0);
  assert.equal(revive.tasks.size, 0);
  assert.equal(revive.progressFor(a), null);
  assert.equal(ctx.players.length, 0);
  assert.equal(b.downed, true);
});

test('one downed player does not end a run; full wipe ends playing and wave break', () => {
  for (const phase of ['playing', 'waveBreak']) {
    const { a, b, session } = fixture();
    if (phase === 'waveBreak') session.changeState(session.states.waveBreak);
    down(a); session.update(0.05); assert.notEqual(session.state, 'game-over');
    down(b); session.update(0.05); assert.equal(session.state, 'game-over');
  }
});

test('revive consumes E before pickups and enemies target standing teammates only', () => {
  const { a, b, session, ctx } = fixture(); down(b);
  let takes = 0; session.pickups = { take() { takes++; return true; } };
  assert.equal(session.pickUp(a.id), true); assert.equal(takes, 0);
  const enemy = { position: { x: 0, z: 0 }, canAttack: () => false, moveToward(target) { this.target = target; } };
  new ChaseBrain().update(enemy, 0.05, ctx); assert.equal(enemy.target, a);
  down(a); new ChaseBrain().update(enemy, 0.05, ctx); assert.equal(enemy.target, null);
});

test('revive tuning rejects invalid values', () => {
  assert.throws(() => new ReviveInteraction([], { seconds: 0 }), RangeError);
});
