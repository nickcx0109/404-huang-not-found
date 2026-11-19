import { MeleeWeapon } from './MeleeWeapon.js';

/** Baseball bat: the starting melee weapon. Hits the closest enemy within 2.2 m in a 90 degree arc in front. */
export class Bat extends MeleeWeapon {
  constructor(fireMode) {
    super({ id: 'bat', damage: 45, range: 2.2, arcDegrees: 90, cooldownSeconds: 0.6, fireMode });
  }
}
