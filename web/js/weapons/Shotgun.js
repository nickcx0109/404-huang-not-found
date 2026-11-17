import { Weapon } from './Weapon.js';
import { SpreadFire } from './SpreadFire.js';

const SHOT = Object.freeze({ damage: 15, range: 60, pellets: 9, spread: 0.065 });

export class Shotgun extends Weapon {
  constructor(fireMode = new SpreadFire()) {
    super({ id: 'shotgun', magazine: 6, reserve: 36, reloadSeconds: 2.1, cooldownSeconds: 0.85, fireMode });
  }

  createShot() {
    return SHOT;
  }
}
