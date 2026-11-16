import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { CollisionWorld } from '../web/js/CollisionWorld.js';
import { PathFinder } from '../web/js/PathFinder.js';
import { DamageInfo } from '../web/js/entities/DamageInfo.js';
import { GameContext } from '../web/js/game/GameContext.js';
import { GameSession } from '../web/js/game/GameSession.js';
import { ExampleWaveDirector, WaveDirector } from '../web/js/game/WaveDirector.js';
import { EnemyFactory } from '../web/js/enemies/EnemyFactory.js';
import { Walker } from '../web/js/enemies/Walker.js';
import { CombatPlayer } from '../web/js/player/CombatPlayer.js';
import { Pistol } from '../web/js/weapons/Pistol.js';
import { Wallet } from '../web/js/economy/Wallet.js';
import { Economy } from '../web/js/economy/Economy.js';
import { AmmoRefillItem } from '../web/js/economy/AmmoRefillItem.js';
import { EVENTS } from '../web/js/game/events.js';

function fixture() {
  const collision = new CollisionWorld();
  collision.bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
  const events = new EventBus();
  const ctx = new GameContext({ collision, pathFinder: new PathFinder(collision), events, rng: () => 0.5,
    level: { spawns: { zombies: [{ x: 5, z: 5, r: 1 }] }, markers: [{ type: 'shop', x: 0, z: 0, r: 1 }] } });
  const player = new CombatPlayer('player', { x: 0, z: 0 }, events);
  player.wallet = new Wallet(player.id, events);
  player.weapons.add(new Pistol());
  ctx.players.push(player);
  const factory = new EnemyFactory(ctx).register('walker', Walker);
  const director = new ExampleWaveDirector({ type: 'walker', initialCount: 1, maxCount: 2 });
  const session = new GameSession(ctx, { factory, director, economy: new Economy(), items: [new AmmoRefillItem()], breakSeconds: 0.1 });
  return { ctx, player, session };
}

test('GameSession transitions Lobby -> Playing -> WaveBreak -> Playing and rewards a death once', () => {
  const { ctx, player, session } = fixture();
  assert.equal(session.state, 'lobby');
  session.update(0.05);
  assert.equal(session.wave, 0);
  session.start();
  session.update(0.05);
  assert.equal(session.state, 'playing');
  assert.equal(ctx.enemies.length, 1);
  const enemy = ctx.enemies[0];
  const oldId = enemy.id;
  const info = new DamageInfo({ amount: 34, targetId: enemy.id, sourceId: player.id, hitPart: 'head' });
  ctx.events.emit(EVENTS.DAMAGE_REQUESTED, info);
  ctx.events.emit(EVENTS.DAMAGE_REQUESTED, info);
  assert.equal(player.wallet.balance, 25);
  assert.equal(session.kills, 1);
  session.update(0.05);
  assert.equal(session.state, 'wave-break');
  assert.equal(ctx.enemies.length, 0);
  assert.equal(session.buy(player.id, 'ammo-refill'), false);
  player.weapons.current.ammo--;
  assert.equal(session.buy(player.id, 'ammo-refill'), true);
  assert.equal(player.wallet.balance, 0);
  session.update(0.05);
  session.update(0.05);
  assert.equal(session.state, 'playing');
  assert.equal(session.wave, 2);
  assert.equal(ctx.enemies.length, 2);
  assert.notEqual(ctx.enemies[0].id, oldId);
  assert.equal(session.resolveDamage(info), 0);
  session.dispose();
  assert.equal(ctx.pools.size, 0);
});

test('GameSession owns game over, rejects friendly or unknown damage and disables commands after death', () => {
  const { ctx, player, session } = fixture();
  let gameOvers = 0;
  ctx.events.on(EVENTS.GAME_OVER, () => gameOvers++);
  session.start();
  session.update(0.05);
  const enemy = ctx.enemies[0];
  for (const sourceId of ['unknown', player.id]) {
    ctx.events.emit(EVENTS.DAMAGE_REQUESTED, new DamageInfo({ amount: 100, sourceId, targetId: player.id }));
  }
  assert.equal(player.damageable.health, 100);
  assert.equal(session.buy(player.id, 'ammo-refill'), false);
  ctx.events.emit(EVENTS.DAMAGE_REQUESTED, new DamageInfo({ amount: 100, sourceId: enemy.id, targetId: player.id, kind: 'melee' }));
  session.update(0.05);
  assert.equal(session.state, 'game-over');
  assert.equal(session.canMove, false);
  ctx.events.emit(EVENTS.FIRE_REQUESTED, { ownerId: player.id });
  assert.equal(player.weapons.current.ammo, 12);
  session.update(0.05);
  assert.equal(gameOvers, 1);
  assert.throws(() => session.update(-1));
  assert.throws(() => session.update(1));
  session.dispose();
  session.dispose();
  session.start();
  session.update(0.05);
  assert.equal(session.state, null);
});

test('WaveDirector defines an extension contract and empty spawn areas fail explicitly', () => {
  assert.throws(() => new WaveDirector().start());
  assert.throws(() => new WaveDirector().nextSpawn());
  const { ctx } = fixture();
  ctx.level.spawns.zombies.length = 0;
  assert.throws(() => new ExampleWaveDirector().start(1, ctx), /spawn areas/);
});
