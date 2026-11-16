import { Weapon } from './Weapon.js';
import { HitscanFire } from './HitscanFire.js';

const SHOT = Object.freeze({ damage: 24, range: 60 });

export class Rifle extends Weapon {
  constructor(fireMode = new HitscanFire()) {
    super({ id: 'rifle', magazine: 30, reserve: 210, reloadSeconds: 1.7, cooldownSeconds: 0.095, fireMode });
    this.automatic = true;
  }

  createShot() {
    return SHOT;
  }
}
