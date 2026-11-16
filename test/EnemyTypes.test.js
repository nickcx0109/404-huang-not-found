import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { CollisionWorld, Aabb } from '../web/js/CollisionWorld.js';
import { PathFinder } from '../web/js/PathFinder.js';
import { DamageInfo } from '../web/js/entities/DamageInfo.js';
import { GameContext } from '../web/js/game/GameContext.js';
import { GameSession } from '../web/js/game/GameSession.js';
import { ExampleWaveDirector } from '../web/js/game/WaveDirector.js';
import { EVENTS } from '../web/js/game/events.js';
import { EnemyFactory } from '../web/js/enemies/EnemyFactory.js';
import { Walker } from '../web/js/enemies/Walker.js';
import { Runner } from '../web/js/enemies/Runner.js';
import { Tank } from '../web/js/enemies/Tank.js';
import { Exploder } from '../web/js/enemies/Exploder.js';
import { CombatPlayer } from '../web/js/player/CombatPlayer.js';
import { Wallet } from '../web/js/economy/Wallet.js';
import { Economy } from '../web/js/economy/Economy.js';

function addPlayer(ctx, id, x, z, y = 0) {
  const player = new CombatPlayer(id, { x, y, z }, ctx.events);
  player.wallet = new Wallet(id, ctx.events);
  ctx.players.push(player);
  return player;
}

function fixture(type, options = {}) {
  const collision = new CollisionWorld();
  collision.bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
  const ctx = new GameContext({ collision, events: new EventBus(), rng: () => 0.5,
    pathFinder: new PathFinder(collision, { clearance: 0.002 }),
    level: { spawns: { zombies: [{ x: 5, z: 5, r: 0 }] }, markers: [] } });
  const player = addPlayer(ctx, 'player', 0, 0);
  const factory = new EnemyFactory(ctx).register('walker', Walker).register('runner', Runner)
    .register('tank', Tank).register('exploder', Exploder);
  const director = new ExampleWaveDirector({ type, initialCount: 1, maxCount: 1 });
  const session = new GameSession(ctx, { factory, director, economy: new Economy(), breakSeconds: 0, ...options });
  session.start();
  session.update(0.05);
  return { ctx, player, factory, session, enemy: ctx.enemies[0] };
}

function place(enemy, x, z) {
  enemy.position.x = x;
  enemy.position.z = z;
  enemy.syncView();
}

test('Runner and Tank have distinct speed, health and attack profiles relative to Walker', () => {
  const { ctx, factory, session } = fixture('walker');
  const walker = ctx.enemies[0];
  const runner = factory.create('runner', { x: 3, z: 3 });
  const tank = factory.create('tank', { x: 4, z: 4 });
  assert.ok(runner.speed > walker.speed);
  assert.ok(runner.damageable.maxHealth < walker.damageable.maxHealth);
  assert.ok(tank.speed < walker.speed);
  assert.ok(tank.damageable.maxHealth > walker.damageable.maxHealth);
  assert.ok(tank.attackDamage > walker.attackDamage);
  session.dispose();
});

for (const type of ['runner', 'tank', 'exploder']) {
  test(`${type} recycles on death and respawns with fresh identity, health and navigation state`, () => {
    const { ctx, player, session, enemy } = fixture(type);
    const oldId = enemy.id;
    const position = enemy.position;
    const route = enemy.route;
    const hitVolume = enemy.hitVolume;
    enemy.nextAttackAt = 100;
    enemy.nextPathAt = 100;
    enemy.route.length = 2;
    enemy.routeIndex = 1;
    ctx.events.emit(EVENTS.DAMAGE_REQUESTED, new DamageInfo({
      amount: 1000, sourceId: player.id, targetId: oldId,
    }));
    assert.equal(player.wallet.balance, enemy.reward);
    assert.equal(player.damageable.health, 100);
    session.update(0.05);
    assert.equal(enemy.active, false);
    assert.equal(ctx.pools.get('enemy:' + type).activeCount, 0);
    session.update(0.05);
    const reused = ctx.enemies[0];
    assert.equal(reused, enemy);
    assert.notEqual(reused.id, oldId);
    assert.equal(reused.position, position);
    assert.equal(reused.route, route);
    assert.equal(reused.hitVolume, hitVolume);
    assert.equal(reused.damageable.health, reused.damageable.maxHealth);
    assert.equal(reused.active, true);
    assert.equal(reused.rewarded, false);
    assert.equal(reused.route.length, 0);
    assert.equal(reused.routeIndex, 0);
    assert.equal(reused.nextAttackAt, ctx.time);
    assert.equal(reused.nextPathAt, ctx.time);
    assert.deepEqual(reused.position, { x: 5, y: 0, z: 5 });
    assert.equal(ctx.pools.get('enemy:' + type).activeCount, 1);
    assert.equal(session.resolveDamage(new DamageInfo({ amount: 1000,
      sourceId: player.id, targetId: oldId })), 0);
    session.dispose();
    assert.equal(enemy.disposed, true);
    assert.equal(ctx.pools.size, 0);
  });

  test(`${type} follows buffered paths around cover and cannot attack through a wall`, () => {
    const { ctx, player, enemy, session } = fixture(type);
    place(enemy, -3, 0);
    ctx.collision.add(new Aabb(-1.6, 0, -0.7, -1.4, 3, 0.7));
    for (let frame = 0; frame < 400; frame++) {
      ctx.time += 0.05;
      enemy.moveToward(player, 0.05, ctx);
    }
    assert.ok(Math.hypot(enemy.position.x, enemy.position.z) < 0.2);
    place(enemy, -0.8, 0);
    assert.equal(enemy.canAttack(player, ctx), true);
    ctx.collision.add(new Aabb(-0.5, 0, -1, -0.4, 3, 1));
    enemy.update(0.05, ctx);
    assert.equal(enemy.canAttack(player, ctx), false);
    assert.equal(player.damageable.health, 100);
    assert.equal(enemy.damageable.alive, true);
    session.dispose();
  });
}

for (const [type, damage] of [['runner', 10], ['tank', 30]]) {
  test(`${type} attacks via Session damage, respects cooldown, and attacks immediately after respawn`, () => {
    const { ctx, player, enemy, session } = fixture(type);
    place(enemy, -0.8, 0);
    enemy.update(0.05, ctx);
    assert.equal(player.damageable.health, 100 - damage);
    enemy.update(0.05, ctx);
    assert.equal(player.damageable.health, 100 - damage);
    ctx.time += 1;
    enemy.update(0.05, ctx);
    assert.equal(player.damageable.health, 100 - damage * 2);
    ctx.events.emit(EVENTS.DAMAGE_REQUESTED, new DamageInfo({
      amount: 1000, sourceId: player.id, targetId: enemy.id,
    }));
    session.update(0.05);
    session.update(0.05);
    place(enemy, -0.8, 0);
    enemy.update(0.05, ctx);
    assert.equal(player.damageable.health, 100 - damage * 3);
    session.dispose();
  });
}

test('Exploder damages every exposed player in its blast, then dies once without awarding a kill', () => {
  const { ctx, player, enemy, session } = fixture('exploder');
  place(enemy, -0.8, 0);
  player.damageable.health = 20;
  const nearby = addPlayer(ctx, 'nearby', -0.8, 2.5);
  const boundary = addPlayer(ctx, 'boundary', -0.8, enemy.blastRadius + nearby.body.radius);
  const outside = addPlayer(ctx, 'outside', -0.8, enemy.blastRadius + nearby.body.radius + 0.01);
  const above = addPlayer(ctx, 'above', -0.8, 0, 5);
  const covered = addPlayer(ctx, 'covered', -2.8, 0);
  const dead = addPlayer(ctx, 'dead', -0.8, -1);
  dead.damageable.health = 0;
  ctx.collision.add(new Aabb(-2, 0, -0.5, -1.9, 3, 0.5));
  const requests = [];
  const deaths = [];
  ctx.events.on(EVENTS.DAMAGE_REQUESTED, info => requests.push(info));
  ctx.events.on(EVENTS.ENTITY_DIED, detail => deaths.push(detail.entity.id));
  enemy.update(0.05, ctx);
  assert.equal(player.damageable.health, 0);
  assert.equal(nearby.damageable.health, 60);
  assert.equal(boundary.damageable.health, 60);
  for (const safe of [outside, above, covered]) assert.equal(safe.damageable.health, 100);
  assert.equal(dead.damageable.health, 0);
  assert.equal(enemy.damageable.alive, false);
  assert.equal(enemy.detonated, true);
  assert.equal(requests.length, 4);
  assert.ok(requests.every(info => info instanceof DamageInfo && info.kind === 'explosion' && info.sourceId === enemy.id));
  assert.deepEqual(deaths, [player.id, enemy.id]);
  assert.equal(session.kills, 0);
  assert.equal(player.wallet.balance, 0);
  enemy.update(0.05, ctx);
  enemy.attack(nearby, ctx);
  assert.equal(requests.length, 4);
  session.update(0.05);
  assert.equal(ctx.enemies.length, 0);
  assert.equal(enemy.active, false);
  assert.equal(session.state, 'wave-break');
  session.dispose();
});

test('Exploder waits for unobstructed contact and resets detonation on pooled respawn', () => {
  const { ctx, player, enemy, session } = fixture('exploder');
  const elevated = addPlayer(ctx, 'elevated', -0.8, 1, 1);
  place(enemy, -2, 0);
  enemy.attack(player, ctx);
  assert.equal(enemy.detonated, false);
  assert.equal(player.damageable.health, 100);
  place(enemy, -0.8, 0);
  enemy.update(0.05, ctx);
  assert.equal(player.damageable.health, 60);
  assert.equal(elevated.damageable.health, 60);
  assert.equal(enemy._rayDirection.y, 0);
  assert.equal(enemy.detonated, true);
  const oldId = enemy.id;
  session.update(0.05);
  enemy.attack(player, ctx);
  assert.equal(player.damageable.health, 60);
  session.update(0.05);
  assert.equal(ctx.enemies[0], enemy);
  assert.notEqual(enemy.id, oldId);
  assert.equal(enemy.detonated, false);
  assert.equal(enemy.damageable.health, 50);
  place(enemy, -0.8, 0);
  enemy.update(0.05, ctx);
  assert.equal(player.damageable.health, 20);
  assert.equal(enemy.damageable.alive, false);
  session.dispose();
});

test('A lethal Exploder blast enters GameOver through Session and cleans up on disposal', () => {
  const { ctx, player, enemy, session } = fixture('exploder');
  player.damageable.health = 40;
  place(enemy, -0.8, 0);
  let gameOvers = 0;
  ctx.events.on(EVENTS.GAME_OVER, () => gameOvers++);
  session.update(0.05);
  assert.equal(player.damageable.alive, false);
  assert.equal(enemy.damageable.alive, false);
  assert.equal(session.state, 'game-over');
  session.update(0.05);
  assert.equal(gameOvers, 1);
  assert.equal(enemy.active, true);
  session.dispose();
  assert.equal(enemy.active, false);
  assert.equal(enemy.disposed, true);
});

test('Exploder blast passes through the configured damage pipeline and rejects enemy friendly fire', () => {
  const applied = [];
  const damagePipeline = { apply(info) {
    applied.push(info);
    return info.targetId === info.sourceId ? info : info.withAmount(info.amount / 2);
  } };
  const { ctx, player, enemy, factory, session } = fixture('exploder', { damagePipeline });
  const other = factory.create('tank', { x: -1, z: 1 });
  ctx.enemies.push(other);
  place(enemy, -0.8, 0);
  assert.equal(session.resolveDamage(new DamageInfo({ amount: 100, sourceId: enemy.id, targetId: other.id })), 0);
  enemy.update(0.05, ctx);
  assert.equal(player.damageable.health, 80);
  assert.equal(other.damageable.health, other.damageable.maxHealth);
  assert.equal(enemy.damageable.alive, false);
  assert.equal(applied.length, 2);
  assert.equal(applied[0].targetId, player.id);
  assert.equal(applied[1].targetId, enemy.id);
  session.dispose();
});
