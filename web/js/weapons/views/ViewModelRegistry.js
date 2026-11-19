/**
 * Which weapon is drawn how in the player's hands. No Three.js, no DOM.
 *
 * A registry instead of a check on the weapon id: a new weapon only calls
 * `register(weaponId, View, createModel)`. `View` is a WeaponView subclass (its clips and where it
 * is held); `createModel(context)` builds the posable model (a WeaponModel), or a promise of one.
 * A weapon with no entry is simply not drawn.
 */
export class ViewModelRegistry {
  constructor() {
    this._entries = new Map();
  }

  /** Adds or replaces the look of one weapon. */
  register(weaponId, View, createModel) {
    if (typeof weaponId !== 'string' || !weaponId) throw new TypeError('A weapon view needs a weapon id');
    if (typeof View !== 'function' || !View.clips || !View.hold) {
      throw new TypeError('The view of ' + weaponId + ' must be a WeaponView class');
    }
    if (typeof createModel !== 'function') throw new TypeError('The view of ' + weaponId + ' needs a model factory');
    this._entries.set(weaponId, Object.freeze({ weaponId, View, createModel }));
    return this;
  }

  /** @returns {{weaponId: string, View: Function, createModel: Function}|null} */
  get(weaponId) {
    return this._entries.get(weaponId) ?? null;
  }

  has(weaponId) {
    return this._entries.has(weaponId);
  }

  get ids() {
    return Array.from(this._entries.keys());
  }
}
