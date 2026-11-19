/**
 * One place to make the whole game harder or easier (G22): how many zombies each wave sends, how fast
 * every zombie moves and how hard it hits. `waves` turns a wave table into a scaled copy for
 * TimedWaveDirector; `tune` adjusts a zombie once, when EnemyFactory first builds it (pooled zombies
 * are reused, so tuning on every spawn would keep multiplying). Pure data, no DOM.
 */
export class Difficulty {
  /**
   * @param {{count?: number, speed?: number, damage?: number, maxAliveCap?: number, minSpawnInterval?: number}} options
   *   maxAliveCap: zombies alive at once never go above this (PERFORMANCE_PLAN allows 40)
   */
  constructor({ count = 1, speed = 1, damage = 1, maxAliveCap = 40, minSpawnInterval = 0.05 } = {}) {
    for (const [name, value] of Object.entries({ count, speed, damage, maxAliveCap, minSpawnInterval })) {
      if (!Number.isFinite(value) || value <= 0) throw new RangeError(`Difficulty ${name} must be positive and finite`);
    }
    this.count = count;
    this.speed = speed;
    this.damage = damage;
    this.maxAliveCap = Math.floor(maxAliveCap);
    this.minSpawnInterval = minSpawnInterval;
  }

  /**
   * A scaled copy of wave data: every count (and the per-wave overflow) times `count`, more zombies allowed
   * alive at once (up to the cap) and spawns that much closer together, so a bigger wave does not just
   * take ten times longer. Break times stay the same.
   */
  waves(data) {
    const scaleCounts = counts => Object.fromEntries(Object.entries(counts)
      .map(([type, value]) => [type, Math.round(value * this.count)]));
    return {
      ...data,
      waves: data.waves.map(row => ({
        ...row,
        counts: scaleCounts(row.counts),
        maxAlive: Math.max(1, Math.min(this.maxAliveCap, Math.round(row.maxAlive * this.count))),
        spawnInterval: Math.max(this.minSpawnInterval, row.spawnInterval / this.count),
      })),
      overflow: { ...data.overflow, addPerWave: scaleCounts(data.overflow.addPerWave) },
    };
  }

  /** Called once per newly built zombie. */
  tune(enemy) {
    enemy.speed *= this.speed;
    enemy.attackDamage *= this.damage;
    if (Number.isFinite(enemy.blastDamage)) enemy.blastDamage *= this.damage;
    return enemy;
  }
}
