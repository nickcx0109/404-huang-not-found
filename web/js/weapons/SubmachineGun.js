import { Weapon } from './Weapon.js';
import { SpreadFire } from './SpreadFire.js';

// Low damage per round, very high rate of fire (about 1000 rounds a minute), loose spread.
const SHOT = Object.freeze({ damage: 13, range: 45, pellets: 1, spread: 0.02 });

export class SubmachineGun extends Weapon {
  constructor(fireMode = new SpreadFire()) {
    super({ id: 'smg', magazine: 40, reserve: 240, reloadSeconds: 1.6, cooldownSeconds: 0.06, fireMode });
    this.automatic = true;
  }

  createShot() {
    return SHOT;
  }
}
