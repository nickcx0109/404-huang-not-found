/**
 * Registry of the weapons that can lie on the ground, keyed by the `item` name used in level markers.
 * Each entry knows how to build a fresh weapon, what to call it on screen and how big its ground model is,
 * so neither pickups nor their views need a switch over weapon types.
 */
export class WeaponCatalog {
  constructor() {
    this.entries = new Map();
  }

  /**
   * @param {string} id   marker `item` name and weapon id, e.g. 'rifle'
   * @param {{create: () => import('../weapons/Weapon.js').Weapon, name?: string,
   *          look?: {length: number, height: number, width: number}}} entry
   */
  register(id, { create, name = id.toUpperCase(), look = { length: 0.8, height: 0.12, width: 0.2 } }) {
    if (typeof id !== 'string' || id === '' || this.entries.has(id)) throw new TypeError('Invalid or duplicate weapon id: ' + id);
    if (typeof create !== 'function') throw new TypeError('Weapon entry needs create()');
    this.entries.set(id, Object.freeze({ id, create, name, look: Object.freeze({ ...look }) }));
    return this;
  }

  has(id) {
    return this.entries.has(id);
  }

  entry(id) {
    const entry = this.entries.get(id);
    if (!entry) throw new RangeError('Unknown weapon: ' + id);
    return entry;
  }

  create(id) {
    const weapon = this.entry(id).create();
    if (weapon?.id !== id) throw new TypeError('Weapon entry ' + id + ' built a weapon with id ' + weapon?.id);
    return weapon;
  }

  /** Screen name for a weapon id; ids that are not registered (e.g. the pistol) fall back to upper case. */
  nameOf(id) {
    return this.entries.get(id)?.name ?? String(id).toUpperCase();
  }
}
