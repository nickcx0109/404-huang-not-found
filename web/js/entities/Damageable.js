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
