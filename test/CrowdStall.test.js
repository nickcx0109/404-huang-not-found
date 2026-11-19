import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventBus } from '../web/js/core/EventBus.js';
import { CollisionWorld } from '../web/js/CollisionWorld.js';
import { PathFinder } from '../web/js/PathFinder.js';
import { LevelData } from '../web/js/LevelData.js';
import { GameContext } from '../web/js/game/GameContext.js';
import { CrowdSeparation } from '../web/js/game/CrowdSeparation.js';
import { EnemyFactory } from '../web/js/enemies/EnemyFactory.js';
import { Walker } from '../web/js/enemies/Walker.js';
import { Runner } from '../web/js/enemies/Runner.js';

const SCENES = ['ch1', 'ch2', 'ch3', 'ch3_2f', 'ch3_roof'];
const DT = 1 / 30;

function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/**
 * A crowd of 40 zombies, twice their normal speed as in the game, chases a player standing at the
 * player spawn for 30 seconds. A zombie still far from the player that has not moved 0.3 m in
 * 3 seconds while it has a route is stalled.
 */
async function stalledZombies(scene, seed) {
  const level = new LevelData(JSON.parse(await readFile(new URL('../web/levels/' + scene + '.json', import.meta.url), 'utf8')));
  const collision = CollisionWorld.fromLevel(level);
  const ctx = new GameContext({ collision, pathFinder: new PathFinder(collision, { clearance: 0.002 }), events: new EventBus(), level });
  const home = level.spawns.players[0];
  const player = { position: { x: home.x, y: 0, z: home.z }, body: { radius: 0.35 }, damageable: { alive: true } };
  ctx.players.push(player);
  const rng = seeded(seed);
  const factory = new EnemyFactory(ctx, () => null, { prepare: enemy => { enemy.speed *= 2; } })
    .register('walker', Walker).register('runner', Runner);
  const spawns = level.spawns.zombies;
  for (let i = 0; i < 40; i++) {
    const spawn = spawns[Math.floor(rng() * spawns.length)];
    ctx.enemies.push(factory.create(rng() < 0.7 ? 'walker' : 'runner',
      { x: spawn.x + rng() - 0.5, z: spawn.z + rng() - 0.5 }));
  }
  const separation = new CrowdSeparation();
  const since = new Map(ctx.enemies.map(zombie => [zombie, { x: zombie.position.x, z: zombie.position.z, time: 0 }]));
  const stalled = new Set();
  const away = zombie => Math.hypot(zombie.position.x - player.position.x, zombie.position.z - player.position.z);
  for (let frame = 0; frame < 900; frame++) {
    ctx.time += DT;
    for (const zombie of ctx.enemies) if (away(zombie) > 1.2) zombie.moveToward(player, DT, ctx);
    separation.apply(ctx);
    for (const zombie of ctx.enemies) {
      const mark = since.get(zombie);
      if (Math.hypot(zombie.position.x - mark.x, zombie.position.z - mark.z) > 0.3) {
        since.set(zombie, { x: zombie.position.x, z: zombie.position.z, time: ctx.time });
      } else if (ctx.time - mark.time > 3 && away(zombie) > 4 && zombie.route.length > 0) {
        stalled.add(zombie.id + ' at ' + zombie.position.x.toFixed(1) + ',' + zombie.position.z.toFixed(1));
      }
    }
  }
  factory.dispose();
  return [...stalled];
}

for (const scene of SCENES) {
  test(`a crowd of zombies in ${scene} never stalls pressed against each other`, async () => {
    for (const seed of [3, 7]) assert.deepEqual(await stalledZombies(scene, seed), [], scene + ' seed ' + seed);
  });
}
