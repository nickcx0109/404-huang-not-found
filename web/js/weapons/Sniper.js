import { Weapon } from './Weapon.js';
import { HitscanFire } from './HitscanFire.js';

const SHOT = Object.freeze({ damage: 150, range: 120 });

export class Sniper extends Weapon {
  constructor(fireMode = new HitscanFire()) {
    super({ id: 'sniper', magazine: 5, reserve: 25, reloadSeconds: 2.8, cooldownSeconds: 1.2, fireMode });
  }

  createShot() {
    return SHOT;
  }
}
