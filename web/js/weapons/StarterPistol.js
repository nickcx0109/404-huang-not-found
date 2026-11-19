import { Pistol } from './Pistol.js';

/**
 * The pistol every player starts with: same handling as the Pistol example, but the reserve never runs out
 * (the magazine still has to be reloaded) and it sits in the sidearm slot, so it is never dropped.
 */
export class StarterPistol extends Pistol {
  constructor(fireMode) {
    super(fireMode);
    this.reserve = Infinity;
    this.maxReserve = Infinity;
  }

  get slot() {
    return 'sidearm';
  }
}
