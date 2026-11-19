import { EVENTS } from '../game/events.js';
import { DamageInfo } from './DamageInfo.js';

export class Damageable {
  constructor(owner, maxHealth, events) {
    if (!Number.isFinite(maxHealth) || maxHealth <= 0) throw new RangeError('Health must be positive');
    this.owner = owner;
    this.maxHealth = maxHealth;
    this.events = events;
    this.reset();
  }

  get alive() {
    return this.health > 0;
  }

  reset() {
    this.health = this.maxHealth;
  }

  /**
   * Restores health up to the maximum. A dead body cannot be healed.
   * @returns {number} how much health was actually added
   */
  heal(amount, sourceId = null) {
    if (!Number.isFinite(amount) || amount < 0) throw new RangeError('Healing must be finite and nonnegative');
    if (!this.alive) return 0;
    const added = Math.min(this.maxHealth - this.health, amount);
    if (added <= 0) return 0;
    this.health += added;
    this.events.emit(EVENTS.ENTITY_HEALED, { entity: this.owner, sourceId, amount: added, health: this.health });
    return added;
  }

  takeDamage(info) {
    if (!(info instanceof DamageInfo)) throw new TypeError('Expected DamageInfo');
    if (!this.alive || info.targetId !== this.owner.id || info.amount === 0) return 0;
    const amount = Math.min(this.health, info.amount);
    this.health -= amount;
    const died = !this.alive;
    const detail = { entity: this.owner, info, amount, health: this.health };
    this.events.emit(EVENTS.ENTITY_DAMAGED, detail);
    if (died) this.events.emit(EVENTS.ENTITY_DIED, detail);
    return amount;
  }
}
