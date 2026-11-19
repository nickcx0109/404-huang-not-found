import { Weapon } from './Weapon.js';
import { HitscanFire } from './HitscanFire.js';

// High damage per round (a body shot kills a walker), slow to fire and slow to reload six chambers.
const SHOT = Object.freeze({ damage: 90, range: 70 });

export class Revolver extends Weapon {
  constructor(fireMode = new HitscanFire()) {
    super({ id: 'revolver', magazine: 6, reserve: 36, reloadSeconds: 2.4, cooldownSeconds: 0.75, fireMode });
  }

  createShot() {
    return SHOT;
  }
}
