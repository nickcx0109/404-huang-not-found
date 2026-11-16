import { Weapon } from './Weapon.js';
import { HitscanFire } from './HitscanFire.js';

const SHOT = Object.freeze({ damage: 34, range: 60 });

export class Pistol extends Weapon {
  constructor(fireMode = new HitscanFire()) {
    super({ id: 'pistol', magazine: 12, reserve: 60, reloadSeconds: 1.1, cooldownSeconds: 0.25, fireMode });
  }

  createShot() {
    return SHOT;
  }
}
