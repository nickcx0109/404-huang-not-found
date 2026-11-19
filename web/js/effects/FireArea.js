import { Effect } from './Effect.js';
import { damageEnemiesInRadius } from './AreaDamage.js';

/** Burning ground: every `tickSeconds` it hurts the enemies standing in it, for `seconds` in total. */
export class FireArea extends Effect {
  constructor(position, startedAt, ownerId = null,
    { radius = 3, seconds = 6, damagePerSecond = 25, tickSeconds = 0.5 } = {}) {
    super('fire', position);
    this.ownerId = ownerId;
    this.radius = radius;
    this.endsAt = startedAt + seconds;
    this.tickSeconds = tickSeconds;
    this.tickDamage = damagePerSecond * tickSeconds;
    this.nextTickAt = startedAt + tickSeconds;
    this.startedAt = startedAt;
    this.seconds = seconds;
  }

  update(dt, ctx) {
    const tickDamage = this.tickDamage;
    while (ctx.time + 1e-9 >= this.nextTickAt && this.nextTickAt <= this.endsAt + 1e-9) {
      damageEnemiesInRadius(ctx, { centre: this.position, radius: this.radius, sourceId: this.ownerId,
        kind: 'fire', damageAt: () => tickDamage });
      this.nextTickAt += this.tickSeconds;
    }
    return ctx.time + 1e-9 < this.endsAt;
  }
}
