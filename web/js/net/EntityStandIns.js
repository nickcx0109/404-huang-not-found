import { Enemy } from '../enemies/Enemy.js';
import { Walker } from '../enemies/Walker.js';
import { Runner } from '../enemies/Runner.js';
import { Tank } from '../enemies/Tank.js';
import { Exploder } from '../enemies/Exploder.js';
import { ENEMY_ID_PREFIX } from '../enemies/EnemyFactory.js';
import { PLAYER_BODY } from '../player/PlayerBody.js';

/**
 * Lightweight objects that stand in for the server's entities in local event payloads.
 *
 * Sounds and HUD widgets subscribe to events whose payloads hold entities (`detail.entity`)
 * and some ask what kind of entity it is (`instanceof Enemy`, `enemy.constructor` for the
 * zombie's voice). An online client has no Enemy objects, so each zombie gets a stand-in
 * created from its class's prototype (no constructor runs: no path finder, no brain) carrying
 * only plain data: id, type, position, `active` and a `damageable` with alive and health.
 * Those listeners then work online without knowing about the network.
 */
export class EntityStandIns {
  constructor() {
    this.types = new Map();
    this.enemies = new Map();
    this.players = new Map();
  }

  static standard() {
    return new EntityStandIns()
      .register('walker', Walker)
      .register('runner', Runner)
      .register('tank', Tank)
      .register('exploder', Exploder);
  }

  register(type, enemyClass) {
    this.types.set(type, enemyClass);
    return this;
  }

  /** Brings the zombies up to the sampled snapshot; ones no longer sent are dropped. */
  updateEnemies(records) {
    const seen = new Set();
    for (const record of records) {
      seen.add(record.id);
      this.enemy(record.id, record).damageable.alive = record.state !== 'dead' && record.health > 0;
    }
    for (const id of this.enemies.keys()) if (!seen.has(id)) this.enemies.delete(id);
  }

  updatePlayers(records) {
    for (const record of records) {
      const player = this.player(record.id);
      player.position.x = record.x;
      player.position.y = record.y ?? 0;
      player.position.z = record.z;
      player.downed = Boolean(record.downed);
      player.damageable.alive = Boolean(record.alive);
      player.damageable.health = record.health;
      if (record.maxHealth > 0) player.damageable.maxHealth = record.maxHealth;
    }
  }

  /** The zombie stand-in for `id`, made (and moved) from `record` when one is given. */
  enemy(id, record = null) {
    let enemy = this.enemies.get(id);
    if (!enemy) {
      const enemyClass = this.types.get(record?.type) ?? Enemy;
      enemy = Object.create(enemyClass.prototype);
      Object.assign(enemy, {
        id, type: record?.type ?? 'enemy', active: true,
        radius: PLAYER_BODY.radius, height: PLAYER_BODY.height, headHeight: PLAYER_BODY.height - 0.4,
        position: { x: 0, y: 0, z: 0 }, damageable: { alive: true, health: 1, maxHealth: 1 },
      });
      this.enemies.set(id, enemy);
    }
    if (record) {
      enemy.position.x = record.x;
      enemy.position.z = record.z;
      if (Number.isFinite(record.health)) enemy.damageable.health = record.health;
    }
    return enemy;
  }

  player(id) {
    let player = this.players.get(id);
    if (!player) {
      player = { id, downed: false, position: { x: 0, y: 0, z: 0 }, damageable: { alive: true, health: 100, maxHealth: 100 } };
      this.players.set(id, player);
    }
    return player;
  }

  /** Whatever `id` names: a zombie (ids start with ENEMY_ID_PREFIX) or a player. */
  entity(id) {
    return String(id).startsWith(ENEMY_ID_PREFIX) ? this.enemy(id) : this.player(id);
  }

  /** Zombies that are still standing, for the groan timer (ZombieSounds' `enemies()`). */
  get living() {
    return [...this.enemies.values()].filter(enemy => enemy.damageable.alive);
  }
}
