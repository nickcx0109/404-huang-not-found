import { LevelData } from '../LevelData.js';
import { CollisionWorld } from '../CollisionWorld.js';
import { EventBus } from '../core/EventBus.js';
import { GameContext } from './GameContext.js';
import { GameSession } from './GameSession.js';
import { Objectives } from './objectives/Objectives.js';
import { TimedWaveDirector } from './TimedWaveDirector.js';
import { CrowdSeparation } from './CrowdSeparation.js';
import { SURVIVAL_WAVES } from './waves/survival.js';
import { Difficulty } from './Difficulty.js';
import { PathFinder } from '../PathFinder.js';
import { EnemyFactory, ENEMY_ID_PREFIX } from '../enemies/EnemyFactory.js';
import { Walker } from '../enemies/Walker.js';
import { Runner } from '../enemies/Runner.js';
import { Tank } from '../enemies/Tank.js';
import { Exploder } from '../enemies/Exploder.js';
import { CombatPlayer } from '../player/CombatPlayer.js';
import { StarterPistol } from '../weapons/StarterPistol.js';
import { Bat } from '../weapons/Bat.js';
import { Rifle } from '../weapons/Rifle.js';
import { Shotgun } from '../weapons/Shotgun.js';
import { SubmachineGun } from '../weapons/SubmachineGun.js';
import { Sniper } from '../weapons/Sniper.js';
import { Revolver } from '../weapons/Revolver.js';
import { Grenade } from '../weapons/Grenade.js';
import { Molotov } from '../weapons/Molotov.js';
import { Katana } from '../weapons/Katana.js';
import { Chainsaw } from '../weapons/Chainsaw.js';
import { AmmoCrateField } from '../pickups/AmmoCrateField.js';
import { PickupInteraction } from '../pickups/PickupInteraction.js';
import { LoadoutHolder } from '../weapons/LoadoutHolder.js';
import { WeaponCatalog } from '../pickups/WeaponCatalog.js';
import { PickupField } from '../pickups/PickupField.js';
import { registerHealingItems } from '../pickups/healingItems.js';
import { ItemDeck } from '../pickups/ItemDeck.js';

/**
 * Assembles one run from parsed level JSON or a LevelData already loaded by the host.
 * @param {object|LevelData} levelRaw
 * @param {object} options
 * @param {{id: string, name?: string, controller: {x: number, z: number, y?: number, speedMultiplier?: number}}[]} options.players
 *   IDs must be unique, non-blank strings outside the enemy ID namespace.
 *   Each host supplies an already positioned controller. CombatPlayer writes speedMultiplier.
 * @param {Difficulty} [options.difficulty]
 * @param {CollisionWorld} [options.collision] World to share with the browser's movement and level flow.
 * @param {EventBus} [options.events]
 * @param {() => number} [options.rng]
 * @param {Function} [options.createEnemyView] Optional (type, context) => view adapter.
 * @returns {GameSession}
 */
export function createSession(levelRaw, {
  players, difficulty = new Difficulty({ count: 10, speed: 2 }), collision,
  events = new EventBus(), rng = Math.random, createEnemyView = () => null,
}) {
  const playerIds = new Set();
  for (const player of players) {
    const id = player?.id;
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('Player ID must be a non-empty string');
    if (id.startsWith(ENEMY_ID_PREFIX)) throw new RangeError('Reserved player ID: ' + id);
    if (playerIds.has(id)) throw new RangeError('Duplicate player ID: ' + id);
    playerIds.add(id);
  }

  const level = levelRaw instanceof LevelData ? levelRaw : new LevelData(levelRaw);
  const world = collision ?? CollisionWorld.fromLevel(level);
  const ctx = new GameContext({
    collision: world, pathFinder: new PathFinder(world, { clearance: 0.002 }), events, level, rng,
  });
  const director = new TimedWaveDirector(difficulty.waves(SURVIVAL_WAVES));
  const objective = Objectives.standard().create(level.objective);

  const catalog = new WeaponCatalog()
    .register('rifle', { create: () => new Rifle(), name: 'RIFLE', look: { length: 0.95, height: 0.14, width: 0.12 } })
    .register('sniper', { create: () => new Sniper(), name: 'SNIPER', look: { length: 1.2, height: 0.14, width: 0.1 } })
    .register('shotgun', { create: () => new Shotgun(), name: 'SHOTGUN', look: { length: 0.85, height: 0.12, width: 0.14 } })
    .register('smg', { create: () => new SubmachineGun(), name: 'SMG', look: { length: 0.55, height: 0.16, width: 0.1 } })
    .register('revolver', { create: () => new Revolver(), name: 'REVOLVER', look: { length: 0.34, height: 0.14, width: 0.07 } })
    // Melee weapons lie at any weapon spot and also at the spots kept for them (at least two per scene).
    .register('katana', { create: () => new Katana(), name: 'KATANA', pool: ['weapon', 'melee'],
      look: { length: 1.0, height: 0.05, width: 0.07 } })
    .register('chainsaw', { create: () => new Chainsaw(), name: 'CHAINSAW', pool: ['weapon', 'melee'],
      look: { length: 0.85, height: 0.26, width: 0.22 } })
    // Healing and throwable spots draw from their own pools, never from the guns.
    .register('grenade', { create: () => new Grenade(), name: 'GRENADE', pool: 'throwable',
      look: { length: 0.12, height: 0.12, width: 0.1 } })
    .register('molotov', { create: () => new Molotov(), name: 'MOLOTOV', pool: 'throwable',
      look: { length: 0.28, height: 0.1, width: 0.1 } });
  registerHealingItems(catalog);
  // Dealt like cards, so every weapon lies somewhere before any lies twice.
  const deck = new ItemDeck(catalog, ctx.rng);
  const pickups = PickupField.fromLevel(level, catalog, ctx.rng, pool => deck.next(pool));
  const crates = AmmoCrateField.fromLevel(level);
  const factory = new EnemyFactory(ctx, type => createEnemyView(type, ctx), {
    prepare: enemy => difficulty.tune(enemy),
  }).register('walker', Walker)
    .register('runner', Runner)
    .register('tank', Tank)
    .register('exploder', Exploder);

  for (const { id, name, controller } of players) {
    const weapons = new LoadoutHolder(id, events);
    const player = new CombatPlayer(id, controller, events, weapons);
    player.name = name;
    // The pistol starts in hand and the bat stays in its own slot.
    weapons.add(new StarterPistol());
    weapons.add(new Bat());
    ctx.players.push(player);
  }

  return new GameSession(ctx, {
    factory, director, separation: new CrowdSeparation(),
    pickups: new PickupInteraction({ weaponPickups: pickups, ammoCrates: crates }), objective,
  });
}
