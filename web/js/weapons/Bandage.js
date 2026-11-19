import { CarriedItem } from './CarriedItem.js';

/**
 * Bandage, slot 6, up to 2 carried. Left click bandages yourself, right click the teammate in front of you.
 * It takes 3 seconds and adds 40 health when it finishes; putting it away, dying, or the patient dying
 * cancels it and nothing is spent. While it is in hand the player cannot shoot.
 */
export class Bandage extends CarriedItem {
  constructor({ count = 1, healAmount = 40, seconds = 3, reach = 2.5, arcDegrees = 70 } = {}) {
    super({ id: 'bandage', count, maxCount: 2 });
    this.healAmount = healAmount;
    this.seconds = seconds;
    this.reach = reach;
    this.minDot = Math.cos(arcDegrees / 2 * Math.PI / 180);
    this.task = null;
    this._progress = { fraction: 0, ownerId: null, targetId: null };
  }

  get slot() {
    return 'healing';
  }

  /** Bandage yourself. */
  fire(ctx) {
    const owner = ctx.players.find(player => player.id === this.ownerId);
    return this._begin(owner, owner, ctx);
  }

  /** Bandage the closest living teammate within reach in front of you. */
  secondary(ctx) {
    const owner = ctx.players.find(player => player.id === this.ownerId);
    return this._begin(owner, this._mateInFront(owner, ctx), ctx);
  }

  _begin(owner, target, ctx) {
    if (this.task || this.depleted || !owner?.damageable.alive || !target?.damageable.alive) return false;
    if (target.damageable.health >= target.damageable.maxHealth) return false;
    this.task = { targetId: target.id, startedAt: ctx.time, endsAt: ctx.time + this.seconds };
    return true;
  }

  _mateInFront(owner, ctx) {
    if (!owner) return null;
    const { direction } = ctx.aim;
    const facing = Math.hypot(direction.x, direction.z);
    if (facing < 1e-6) return null;
    let best = null;
    let bestDistance = Infinity;
    for (const mate of ctx.players) {
      if (mate === owner || !mate.damageable.alive) continue;
      const dx = mate.position.x - owner.position.x;
      const dz = mate.position.z - owner.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > this.reach || distance >= bestDistance) continue;
      if (distance > 1e-6 && (dx * direction.x + dz * direction.z) / (distance * facing) < this.minDot) continue;
      best = mate;
      bestDistance = distance;
    }
    return best;
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    if (!this.task) return;
    const owner = ctx.players.find(player => player.id === this.ownerId);
    const target = ctx.players.find(player => player.id === this.task.targetId);
    if (!owner?.damageable.alive || !target?.damageable.alive) {
      this.task = null;
      return;
    }
    if (ctx.time + 1e-9 < this.task.endsAt) return;
    this.task = null;
    target.damageable.heal(this.healAmount, this.ownerId);
    this.consume();
  }

  holster() {
    this.task = null;
  }

  drop() {
    super.drop();
    this.task = null;
  }

  progress(time) {
    if (!this.task) return null;
    const out = this._progress;
    out.fraction = Math.min(1, Math.max(0, (time - this.task.startedAt) / this.seconds));
    out.ownerId = this.ownerId;
    out.targetId = this.task.targetId;
    return out;
  }
}
