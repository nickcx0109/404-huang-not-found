import { WaveDirector } from './WaveDirector.js';
import { WaveTable, ENEMY_TYPES } from './WaveTable.js';

/** WaveDirector subtype: round-robin types, simulation-time pacing and a live crowd cap. */
export class TimedWaveDirector extends WaveDirector {
  constructor(data) {
    super();
    this.table = new WaveTable(data);
    this._pending = new Float64Array(ENEMY_TYPES.length);
    this._wait = 0;
  }

  start(wave, ctx) {
    if (!ctx.level.spawns.zombies.length) throw new Error('Play mode needs zombie spawn areas');
    this.spec = this.table.get(wave);
    this.remaining = this.spec.total;
    this.breakSeconds = this.spec.breakSeconds;
    for (let index = 0; index < ENEMY_TYPES.length; index++) this._pending[index] = this.spec.counts[ENEMY_TYPES[index]];
    this._cursor = 0;
    this._wait = 0; // First spawn is immediately eligible; later spawns wait a full interval.
  }

  update(dt, ctx) {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Wave update dt must be non-negative and finite');
    this._wait = Math.max(0, this._wait - dt); // Never bank missed intervals while capped.
  }

  nextSpawn(ctx, result) {
    if (!this.spec || this.remaining === 0 || this._wait > 1e-9) return false;
    let alive = 0;
    for (const enemy of ctx.enemies) if (enemy.damageable.alive) alive++;
    if (alive >= this.spec.maxAlive) return false;
    const areas = ctx.level.spawns.zombies;
    const radius = ctx.pathFinder.radius;
    const bounds = ctx.collision.bounds;
    for (let attempt = 0; attempt < 32; attempt++) {
      const area = areas[Math.floor(ctx.rng() * areas.length)];
      const angle = ctx.rng() * Math.PI * 2;
      const offset = Math.sqrt(ctx.rng()) * area.r;
      const x = area.x + Math.cos(angle) * offset;
      const z = area.z + Math.sin(angle) * offset;
      if (x - radius < bounds.minX || x + radius > bounds.maxX ||
          z - radius < bounds.minZ || z + radius > bounds.maxZ ||
          ctx.collision.hit(x, z, radius, 0, ctx.pathFinder.height)) continue;
      while (this._pending[this._cursor] === 0) this._cursor = (this._cursor + 1) % ENEMY_TYPES.length;
      result.type = ENEMY_TYPES[this._cursor];
      result.x = x;
      result.y = 0;
      result.z = z;
      this._pending[this._cursor]--;
      this._cursor = (this._cursor + 1) % ENEMY_TYPES.length;
      this.remaining--;
      this._wait = this.spec.spawnInterval;
      return true;
    }
    throw new Error('No free point in zombie spawn areas');
  }
}
