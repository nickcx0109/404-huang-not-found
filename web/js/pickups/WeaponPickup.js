import { Entity } from '../entities/Entity.js';

/**
 * A weapon lying on the ground. It holds a real Weapon instance, so a gun that was dropped
 * keeps the rounds it had. `weapon` is null once someone took it and left nothing behind.
 */
export class WeaponPickup extends Entity {
  constructor(id, position, weapon, radius = 1.2) {
    super(id, position);
    if (!Number.isFinite(radius) || radius < 0) throw new RangeError('Invalid pickup radius');
    this.weapon = weapon;
    this.radius = radius;
  }

  get empty() {
    return this.weapon === null;
  }

  /** Ground distance from the player's edge to the pickup, or Infinity when there is nothing to take. */
  distanceTo(player) {
    if (this.empty) return Infinity;
    return Math.hypot(this.position.x - player.position.x, this.position.z - player.position.z) - player.body.radius;
  }

  reachableBy(player) {
    return this.distanceTo(player) <= this.radius;
  }

  /** Leaves `weapon` (or nothing) where this one was and returns the one that was here. */
  swap(weapon) {
    const taken = this.weapon;
    this.weapon = weapon ?? null;
    return taken;
  }
}
