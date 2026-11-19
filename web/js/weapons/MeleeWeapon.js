import { Weapon } from './Weapon.js';
import { MeleeSwing } from './MeleeSwing.js';

/**
 * Base for weapons that hit what is in front of the player instead of shooting.
 * Uses no ammo, never reloads and goes in the melee slot. Subclasses give the numbers.
 */
export class MeleeWeapon extends Weapon {
  constructor({ id, damage, range, arcDegrees, cooldownSeconds, fireMode = new MeleeSwing() }) {
    if (new.target === MeleeWeapon) throw new TypeError('MeleeWeapon is abstract');
    if (!Number.isFinite(damage) || damage <= 0 || !Number.isFinite(range) || range <= 0 ||
        !Number.isFinite(arcDegrees) || arcDegrees <= 0 || arcDegrees > 180) {
      throw new TypeError('Invalid melee configuration');
    }
    // The magazine and reload numbers only satisfy the Weapon contract; usesAmmo turns them off.
    super({ id, magazine: 1, reserve: 0, reloadSeconds: 1, cooldownSeconds, fireMode });
    this.shot = Object.freeze({ damage, range, minDot: Math.cos(arcDegrees / 2 * Math.PI / 180) });
  }

  get slot() {
    return 'melee';
  }

  get usesAmmo() {
    return false;
  }

  createShot() {
    return this.shot;
  }
}
