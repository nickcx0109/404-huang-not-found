import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { CollisionWorld } from '../web/js/CollisionWorld.js';
import { PathFinder } from '../web/js/PathFinder.js';
import { DamageInfo } from '../web/js/entities/DamageInfo.js';
import { GameContext } from '../web/js/game/GameContext.js';
import { GameSession } from '../web/js/game/GameSession.js';
import { ExampleWaveDirector } from '../web/js/game/WaveDirector.js';
import { EnemyFactory } from '../web/js/enemies/EnemyFactory.js';
import { Walker } from '../web/js/enemies/Walker.js';
import { CombatPlayer } from '../web/js/player/CombatPlayer.js';
import { Pistol } from '../web/js/weapons/Pistol.js';
import { HoldOutObjective } from '../web/js/game/objectives/HoldOutObjective.js';
import { EVENTS } from '../web/js/game/events.js';

function fixture(seconds) {
  const collision = new CollisionWorld();
  collision.bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
  const events = new EventBus();
  const ctx = new GameContext({ collision, pathFinder: new PathFinder(collision), events, rng: () => 0.5,
    level: { spawns: { zombies: [{ x: 9, z: 9, r: 1 }] }, markers: [] } });
  const player = new CombatPlayer('player', { x: -9, z: -9 }, events);
  player.weapons.add(new Pistol());
  ctx.players.push(player);
  const factory = new EnemyFactory(ctx).register('walker', Walker);
  const director = new ExampleWaveDirector({ type: 'walker', initialCount: 1, maxCount: 2 });
  const objective = new HoldOutObjective({ seconds, label: 'GATE OPENS IN' });
  const session = new GameSession(ctx, { factory, director, breakSeconds: 0.5, objective });
  return { ctx, player, session, objective };
}

function run(session, seconds) {
  for (let step = 0; step < Math.round(seconds / 0.05); step++) session.update(0.05);
}

test('holding out for the level time ends the run in Victory with the results', () => {
  const { ctx, session } = fixture(2);
  const victories = [];
  ctx.events.on(EVENTS.VICTORY, detail => victories.push(detail));
  run(session, 1);
  assert.equal(session.objective.elapsed, 0, 'the lobby does not run the clock');
  session.start();
  run(session, 1.95);
  assert.equal(session.state, 'playing');
  run(session, 0.1);
  assert.equal(session.state, 'victory');
  assert.equal(session.canRestart, true);
  assert.deepEqual(victories, [{ wave: 1, kills: 0 }]);
  run(session, 1);
  assert.equal(victories.length, 1, 'Victory is announced once');
});

test('the clock keeps running through the break between waves', () => {
  const { ctx, player, session, objective } = fixture(1);
  session.start();
  session.update(0.05);
  const enemy = ctx.enemies[0];
  enemy.damageable.takeDamage(new DamageInfo({ amount: 999, targetId: enemy.id, sourceId: player.id }));
  session.update(0.05);
  assert.equal(session.state, 'wave-break');
  const before = objective.elapsed;
  run(session, 0.2);
  assert.equal(session.state, 'wave-break');
  assert.ok(objective.elapsed > before + 0.19);
  run(session, 1);
  assert.equal(session.state, 'victory');
});

test('everyone down before the lock opens is still a loss, and the clock stops', () => {
  const { player, session, objective } = fixture(1);
  session.start();
  run(session, 0.5);
  player.damageable.takeDamage(new DamageInfo({ amount: 999, targetId: player.id, sourceId: 'zombie' }));
  run(session, 1);
  assert.equal(session.state, 'game-over');
  assert.ok(objective.remaining > 0.4);
  assert.equal(session.win(), false);
});
