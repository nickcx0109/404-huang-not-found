import { Damageable } from '../entities/Damageable.js';
import { DamageInfo } from '../entities/DamageInfo.js';
import { EVENTS } from '../game/events.js';

/** Player health: zero means incapacitated, recoverable only by a revive. */
export class DownedHealth extends Damageable {
  reset() {
    super.reset();
    this.owner.downed = false;
  }

  takeDamage(info) {
    if (!(info instanceof DamageInfo)) throw new TypeError('Expected DamageInfo');
    // Damageable publishes ENTITY_DIED for enemies; players publish damage only.
    if (!this.alive || info.targetId !== this.owner.id) return 0;
    const amount = Math.min(this.health, info.amount);
    if (amount <= 0) return 0;
    this.health -= amount;
    this.owner.downed = !this.alive;
    if (this.owner.downed) this.owner.clearEffects?.();
    this.events.emit(EVENTS.ENTITY_DAMAGED, { entity: this.owner, info, amount, health: this.health });
    return amount;
  }

  revive(health) {
    if (!Number.isFinite(health) || health <= 0) throw new RangeError('Invalid revive health');
    if (!this.owner.downed) return false;
    this.health = Math.min(this.maxHealth, health);
    this.owner.downed = false;
    this.events.emit(EVENTS.ENTITY_HEALED, { entity: this.owner, amount: this.health, health: this.health });
    return true;
  }
}
