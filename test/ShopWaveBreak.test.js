import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld } from '../web/js/CollisionWorld.js';
import { PathFinder } from '../web/js/PathFinder.js';
import { EventBus } from '../web/js/core/EventBus.js';
import { GameContext } from '../web/js/game/GameContext.js';
import { GameSession } from '../web/js/game/GameSession.js';
import { TimedWaveDirector } from '../web/js/game/TimedWaveDirector.js';
import { SURVIVAL_WAVES } from '../web/js/game/waves/survival.js';
import { EVENTS } from '../web/js/game/events.js';
import { EnemyFactory } from '../web/js/enemies/EnemyFactory.js';
import { Walker } from '../web/js/enemies/Walker.js';
import { CombatPlayer } from '../web/js/player/CombatPlayer.js';
import { Wallet } from '../web/js/economy/Wallet.js';
import { Economy } from '../web/js/economy/Economy.js';
import { ShopCatalog } from '../web/js/economy/ShopCatalog.js';
import { HealthItem } from '../web/js/economy/HealthItem.js';

// G3 + G4 together: the shop window is the wave table's break, not a fixed 8 s.
test('the first wave-break follows the wave table (6 s) and closes the shop when it ends', () => {
  const collision = new CollisionWorld();
  collision.bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
  const ctx = new GameContext({ collision, pathFinder: new PathFinder(collision), events: new EventBus(),
    level: { spawns: { zombies: [{ x: 15, z: 15, r: 1 }] }, markers: [{ type: 'shop', x: 0, z: 0, r: 2 }] },
    rng: () => 0.5 });
  const player = new CombatPlayer('p1', { x: 0, z: 0 }, ctx.events);
  player.wallet = new Wallet(player.id, ctx.events);
  ctx.players.push(player);
  const factory = new EnemyFactory(ctx).register('walker', Walker).register('runner', Walker)
    .register('tank', Walker).register('exploder', Walker);
  const catalog = new ShopCatalog().register(new HealthItem(), { name: 'First aid' });
  const session = new GameSession(ctx, { factory, director: new TimedWaveDirector(SURVIVAL_WAVES),
    economy: new Economy(), catalog });
  const changes = [];
  ctx.events.on(EVENTS.SHOP_CHANGED, detail => changes.push(detail.open));

  session.start();
  for (let tick = 0; tick < 400 && session.state !== 'wave-break'; tick++) {
    session.update(0.05);
    for (const enemy of ctx.enemies) enemy.damageable.health = 0; // clear the wave without combat
  }
  assert.equal(session.state, 'wave-break');
  assert.equal(session.breakSeconds, 6);

  ctx.events.emit(EVENTS.SHOP_TOGGLE_REQUESTED, { ownerId: player.id });
  assert.equal(session.isShopOpen(player.id), true);
  for (let step = 0; step < 119; step++) session.update(0.05); // 5.95 s
  assert.equal(session.state, 'wave-break');
  assert.equal(session.isShopOpen(player.id), true);

  for (let step = 0; step < 2 && session.state === 'wave-break'; step++) session.update(0.05);
  assert.equal(session.state, 'playing');
  assert.equal(session.shopOpen, false);
  assert.deepEqual(changes, [true, false]);
  player.wallet.credit(100);
  player.damageable.health = 10;
  assert.equal(session.buy(player.id, 'health'), false, 'no purchases once the wave is running');
  session.dispose();
});
