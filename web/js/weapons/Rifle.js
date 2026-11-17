import { Weapon } from './Weapon.js';
import { SpreadFire } from './SpreadFire.js';

const SHOT = Object.freeze({ damage: 24, range: 60, pellets: 1, spread: 0.006 });

export class Rifle extends Weapon {
  constructor(fireMode = new SpreadFire()) {
    super({ id: 'rifle', magazine: 30, reserve: 210, reloadSeconds: 1.7, cooldownSeconds: 0.095, fireMode });
    this.automatic = true;
  }

  createShot() {
    return SHOT;
  }
}
