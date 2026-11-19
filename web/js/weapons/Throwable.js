import { CarriedItem } from './CarriedItem.js';
import { ThrowFire } from './ThrowFire.js';

/**
 * Base for things thrown by hand, slot 5: only one kind is carried at a time, up to 2 of it; picking
 * up the other kind swaps the whole stack. Subclasses say what flies out (`launch`).
 */
export class Throwable extends CarriedItem {
  constructor({ id, count = 1, speed = 13, lift = 3, cooldownSeconds = 0.8, fireMode = new ThrowFire() }) {
    if (new.target === Throwable) throw new TypeError('Throwable is abstract');
    super({ id, count, maxCount: 2, cooldownSeconds, fireMode });
    this.shot = Object.freeze({ itemId: id, speed, lift, launch: options => this.launch(options) });
  }

  get slot() {
    return 'throwable';
  }

  /** @returns {import('../effects/Effect.js').Effect} the object that flies away */
  launch({ position, velocity, ownerId, time }) {
    throw new Error('Implement Throwable.launch');
  }

  fire(ctx) {
    if (this.depleted) return false;
    return super.fire(ctx);
  }

  createShot() {
    return this.shot;
  }

  onFired() {
    this.consume();
  }
}
