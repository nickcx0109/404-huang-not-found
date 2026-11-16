export class WaveDirector {
  start(wave, ctx) { throw new Error('Implement WaveDirector.start'); }
  nextSpawn(ctx, result) { throw new Error('Implement WaveDirector.nextSpawn'); }
}

export const EXAMPLE_WAVES = Object.freeze({ type: 'walker', initialCount: 2, maxCount: 4, breakSeconds: 8 });

export class ExampleWaveDirector extends WaveDirector {
  constructor(config = EXAMPLE_WAVES) {
    super();
    this.config = config;
    this.remaining = 0;
  }

  start(wave, ctx) {
    this.remaining = Math.min(this.config.maxCount, this.config.initialCount + wave - 1);
    if (ctx.level.spawns.zombies.length === 0) throw new Error('Play mode needs zombie spawn areas');
  }

  nextSpawn(ctx, result) {
    if (this.remaining <= 0) return false;
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
      result.type = this.config.type;
      result.x = x;
      result.y = 0;
      result.z = z;
      this.remaining--;
      return true;
    }
    throw new Error('No free point in zombie spawn areas');
  }
}
