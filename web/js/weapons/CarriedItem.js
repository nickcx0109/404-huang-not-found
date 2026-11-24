import { Weapon, wholeIn } from './Weapon.js';

/** Fire mode for items that do their own thing in fire(); it is never asked to shoot. */
const NO_FIRE = Object.freeze({ fire: () => null });

/**
 * Base for things carried as a small stack instead of loaded with rounds: throwables, bandages.
 * Uses no ammo and never reloads. `count` goes down as the item is used; at 0 the item is `depleted`
 * and the LoadoutHolder takes it out of its slot. Picking up the same item adds to the stack up to
 * `maxCount`; a different item in the same slot is swapped like a gun.
 */
export class CarriedItem extends Weapon {
  constructor({ id, count = 1, maxCount, cooldownSeconds = 0.5, fireMode = NO_FIRE }) {
    if (new.target === CarriedItem) throw new TypeError('CarriedItem is abstract');
    if (!Number.isInteger(maxCount) || maxCount < 1 || !Number.isInteger(count) || count < 1 || count > maxCount) {
      throw new TypeError('Invalid item stack');
    }
    super({ id, magazine: 1, reserve: 0, reloadSeconds: 1, cooldownSeconds, fireMode });
    this.count = count;
    this.maxCount = maxCount;
  }

  get usesAmmo() {
    return false;
  }

  ammoSnapshot() {
    return { ...super.ammoSnapshot(), count: this.count };
  }

  get depleted() {
    return this.count <= 0;
  }

  canAbsorb(other) {
    return other?.id === this.id && other !== this && this.count < this.maxCount && other.count > 0;
  }

  refuses(other) {
    return other?.id === this.id && !this.canAbsorb(other);
  }

  absorb(other) {
    if (!this.canAbsorb(other)) return false;
    const moved = Math.min(this.maxCount - this.count, other.count);
    this.count += moved;
    other.count -= moved;
    return other.count === 0;
  }

  carryState() {
    return { count: this.count };
  }

  restoreCarry(state) {
    this.count = wholeIn(state?.count, 1, this.maxCount, this.count);
  }

  /** Spends one from the stack. */
  consume() {
    if (this.count > 0) this.count--;
  }
}
