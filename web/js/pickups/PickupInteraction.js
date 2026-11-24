import { InteractionList } from './InteractionList.js';

/** Ground pickups take priority over ammo crates. Views can read each field by name. */
export class PickupInteraction extends InteractionList {
  #weaponPickups;
  #ammoCrates;

  constructor({ weaponPickups, ammoCrates }) {
    super([weaponPickups, ammoCrates]);
    this.#weaponPickups = weaponPickups;
    this.#ammoCrates = ammoCrates;
  }

  get weaponPickups() { return this.#weaponPickups; }

  get ammoCrates() { return this.#ammoCrates; }
}
