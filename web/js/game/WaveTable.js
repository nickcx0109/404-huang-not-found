export const ENEMY_TYPES = Object.freeze(['walker', 'runner', 'tank', 'exploder']);

function countsFrom(counts, path) {
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) throw new TypeError(`${path} must be a counts object`);
  for (const type of Object.keys(counts)) {
    if (!ENEMY_TYPES.includes(type)) throw new TypeError(`${path}.${type}: unknown enemy type`);
  }
  const copy = {};
  for (const type of ENEMY_TYPES) {
    if (!Number.isSafeInteger(counts[type]) || counts[type] < 0) throw new RangeError(`${path}.${type} must be a non-negative safe integer`);
    copy[type] = counts[type];
  }
  return Object.freeze(copy);
}

function totalOf(counts) {
  let total = 0;
  for (const type of ENEMY_TYPES) total += counts[type];
  return total;
}

/** Validated, owned snapshot of balancing data; resolves the explicit linear overflow rule. */
export class WaveTable {
  constructor(data) {
    if (!Array.isArray(data?.waves) || data.waves.length === 0) throw new TypeError('waves must be a non-empty array');
    this.waves = Object.freeze(data.waves.map((row, index) => {
      const path = `waves[${index}]`;
      const counts = countsFrom(row?.counts, `${path}.counts`);
      const total = totalOf(counts);
      if (!Number.isSafeInteger(total) || total === 0) throw new RangeError(`${path}.counts must have a positive safe total`);
      if (!Number.isFinite(row.spawnInterval) || row.spawnInterval <= 0) throw new RangeError(`${path}.spawnInterval must be positive and finite`);
      if (!Number.isSafeInteger(row.maxAlive) || row.maxAlive < 1 || row.maxAlive > 40) throw new RangeError(`${path}.maxAlive must be an integer from 1 to 40`);
      if (!Number.isFinite(row.breakSeconds) || row.breakSeconds < 0) throw new RangeError(`${path}.breakSeconds must be non-negative and finite`);
      return Object.freeze({ counts, total, spawnInterval: row.spawnInterval, maxAlive: row.maxAlive, breakSeconds: row.breakSeconds });
    }));
    this.addPerWave = countsFrom(data.overflow?.addPerWave, 'overflow.addPerWave');
  }

  get(wave) {
    if (!Number.isSafeInteger(wave) || wave < 1) throw new RangeError('wave must be a positive safe integer');
    if (wave <= this.waves.length) return this.waves[wave - 1];
    const last = this.waves[this.waves.length - 1];
    const extra = wave - this.waves.length;
    const counts = {};
    for (const type of ENEMY_TYPES) counts[type] = last.counts[type] + extra * this.addPerWave[type];
    const total = totalOf(counts);
    if (!Number.isSafeInteger(total)) throw new RangeError('wave overflow counts exceed the safe integer range');
    return Object.freeze({ ...last, counts: Object.freeze(counts), total });
  }
}
