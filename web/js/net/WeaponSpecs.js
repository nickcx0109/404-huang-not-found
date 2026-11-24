import { createWeaponCatalog } from '../game/createSession.js';
import { StarterPistol } from '../weapons/StarterPistol.js';
import { Bat } from '../weapons/Bat.js';
import { CarriedItem } from '../weapons/CarriedItem.js';

/**
 * What an online client needs to know about each weapon id without running it: how fast it
 * fires, whether holding the trigger keeps firing, its magazine and reload time, and whether
 * the client plays its shot at once (guns and melee) or waits for the server (thrown and
 * healing items, whose use depends on the server's world).
 * Read from real weapon objects, so a new weapon registered in createWeaponCatalog is known here too.
 */
export class WeaponSpecs {
  constructor() {
    this.specs = new Map();
  }

  static standard() {
    const specs = new WeaponSpecs().add(new StarterPistol()).add(new Bat());
    const catalog = createWeaponCatalog();
    for (const id of catalog.entries.keys()) specs.add(catalog.create(id));
    return specs;
  }

  /** @param {import('../weapons/Weapon.js').Weapon} weapon */
  add(weapon) {
    this.specs.set(weapon.id, Object.freeze({
      id: weapon.id,
      slot: weapon.slot,
      automatic: Boolean(weapon.automatic),
      cooldownSeconds: weapon.cooldownSeconds,
      usesAmmo: weapon.usesAmmo !== false,
      magazine: weapon.magazine,
      reloadSeconds: weapon.reloadSeconds,
      predicted: !(weapon instanceof CarriedItem),
    }));
    return this;
  }

  /** The spec for `id`; an unknown id gets a cautious one (not predicted, not automatic). */
  get(id) {
    return this.specs.get(id) ?? Object.freeze({ id, slot: null, automatic: false, cooldownSeconds: 0.25,
      usesAmmo: false, magazine: 0, reloadSeconds: 1, predicted: false });
  }
}
