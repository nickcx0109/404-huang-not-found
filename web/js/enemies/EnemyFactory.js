import { ObjectPool } from '../core/ObjectPool.js';
import { Enemy } from './Enemy.js';

export const ENEMY_ID_PREFIX = 'enemy-';

export class EnemyFactory {
  /**
   * @param {(enemy: Enemy) => void} [prepare]  runs once on each newly built enemy, before it enters the
   *   pool (e.g. Difficulty.tune). Pooled enemies keep what it set across spawns.
   */
  constructor(ctx, createView = () => null, { prepare = null } = {}) {
    this.ctx = ctx;
    this.createView = createView;
    this.prepare = prepare;
    this.registry = new Map();
    this.active = new Map();
    this.created = new Set();
    this.nextId = 1;
  }

  register(type, EnemyType) {
    if (!type || this.registry.has(type)) throw new Error('Duplicate or empty enemy type: ' + type);
    if (!(EnemyType?.prototype instanceof Enemy)) throw new TypeError('Register an Enemy subclass');
    const pool = new ObjectPool(() => {
      const enemy = new EnemyType({ events: this.ctx.events, pathFinder: this.ctx.pathFinder, view: this.createView(type) });
      /** The registered type name, e.g. 'walker'; network snapshots send it so clients pick the right model. */
      enemy.type = type;
      this.prepare?.(enemy);
      this.created.add(enemy);
      return enemy;
    }, enemy => enemy.deactivate());
    this.registry.set(type, pool);
    this.ctx.pools.set('enemy:' + type, pool);
    return this;
  }

  create(type, spawn) {
    const pool = this.registry.get(type);
    if (!pool) throw new Error('Unknown enemy type: ' + type);
    const enemy = pool.acquire();
    enemy.activate(ENEMY_ID_PREFIX + this.nextId++, spawn, this.ctx);
    this.active.set(enemy, pool);
    return enemy;
  }

  release(enemy) {
    const pool = this.active.get(enemy);
    if (!pool) throw new Error('Enemy is not acquired from this factory');
    pool.release(enemy);
    this.active.delete(enemy);
  }

  dispose() {
    for (const enemy of this.active.keys()) this.release(enemy);
    for (const enemy of this.created) enemy.dispose();
    for (const type of this.registry.keys()) this.ctx.pools.delete('enemy:' + type);
    this.created.clear();
    this.registry.clear();
  }
}
