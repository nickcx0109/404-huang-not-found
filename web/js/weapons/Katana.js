import { MeleeWeapon } from './MeleeWeapon.js';
import { MeleeSweep } from './MeleeSweep.js';

/**
 * Katana, found on the ground, slot 4 (the bat is kept). One cut hits every zombie within 2.6 m in a
 * 150 degree arc in front: 70 damage each, a cut every 0.5 seconds.
 */
export class Katana extends MeleeWeapon {
  constructor(fireMode = new MeleeSweep()) {
    super({ id: 'katana', damage: 70, range: 2.6, arcDegrees: 150, cooldownSeconds: 0.5, fireMode });
  }

  get slot() {
    return 'special';
  }
}
