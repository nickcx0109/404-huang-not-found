/** A finite damage buffer, composed with an entity rather than inherited by Damageable. */
export class Armor {
  constructor(capacity = 50) {
    if (!Number.isFinite(capacity) || capacity <= 0) throw new RangeError('Invalid armor capacity');
    this.capacity = capacity;
    this.points = 0;
  }

  get canRefill() { return this.points < this.capacity; }

  refill() { this.points = this.capacity; }

  absorb(amount) {
    if (!Number.isFinite(amount) || amount < 0) throw new RangeError('Invalid damage');
    const absorbed = Math.min(this.points, amount);
    this.points -= absorbed;
    return amount - absorbed;
  }
}
