import { LOADOUT_SLOTS } from '../weapons/LoadoutHolder.js';

/**
 * What the local player owns when they walk to another level of the chapter: health, the weapon in
 * each loadout slot with its own state (rounds, reserve, stack count, battery) and which slot is in
 * hand. Changing level loads a new page and a new GameSession; this is written to sessionStorage
 * before the page goes and put back on the new session's player (see CarryOverStore).
 *
 * Pure data: no DOM. `toJSON` / `fromJSON` round-trip through JSON.stringify; each weapon decides
 * what it carries (`Weapon.carryState` / `restoreCarry`), so there is no switch over weapon types.
 */
export class CarryOverState {
  static VERSION = 1;

  /**
   * @param {object} parts
   * @param {number} parts.health  above 0 (a downed player cannot change level)
   * @param {number} parts.slot  index of the slot in hand, -1 for none
   * @param {({id: string, state: object}|null)[]} parts.slots  one entry per loadout slot
   */
  constructor({ health, slot = -1, slots = [] }) {
    if (!Number.isFinite(health) || health <= 0) throw new TypeError('Carried health must be a positive number');
    if (!Number.isInteger(slot) || slot < -1) throw new TypeError('Invalid carried slot');
    if (!Array.isArray(slots) || slots.length > LOADOUT_SLOTS.length) throw new TypeError('Invalid carried slots');
    this.health = health;
    this.slot = slot;
    this.slots = Object.freeze(slots.map(CarryOverState._slot));
    Object.freeze(this);
  }

  static _slot(entry) {
    if (entry === null || entry === undefined) return null;
    if (typeof entry.id !== 'string' || entry.id === '') throw new TypeError('Carried weapon needs an id');
    const state = entry.state ?? {};
    if (typeof state !== 'object' || Array.isArray(state) ||
        Object.values(state).some(value => !Number.isFinite(value))) {
      throw new TypeError('Carried weapon state must hold finite numbers');
    }
    return Object.freeze({ id: entry.id, state: Object.freeze({ ...state }) });
  }

  /** Reads a CombatPlayer (with a LoadoutHolder). */
  static capture(player) {
    const holder = player.weapons;
    return new CarryOverState({
      health: player.damageable.health,
      slot: holder.index,
      slots: holder.weapons.map(weapon => weapon ? { id: weapon.id, state: weapon.carryState() } : null),
    });
  }

  /** @throws {TypeError} when `data` is not something toJSON wrote */
  static fromJSON(data) {
    if (data?.version !== CarryOverState.VERSION) throw new TypeError('Unknown carry-over version');
    return new CarryOverState(data);
  }

  toJSON() {
    return { version: CarryOverState.VERSION, health: this.health, slot: this.slot, slots: this.slots };
  }

  /**
   * Puts this state on a fresh player of the new session. Slots it already fills (the pistol and the
   * bat every player starts with) are restored in place; the others are built with `createWeapon(id)`.
   * Weapons that cannot be built any more, or that would land in another slot, are left out.
   * @param {CombatPlayer} player  with a LoadoutHolder
   * @param {(id: string) => Weapon} createWeapon  e.g. a WeaponCatalog's create; may throw
   */
  applyTo(player, createWeapon) {
    const damageable = player.damageable;
    damageable.health = Math.min(damageable.maxHealth, this.health);
    const holder = player.weapons;
    this.slots.forEach((entry, index) => {
      if (!entry) return;
      const weapon = holder.weapons[index] ?? CarryOverState._build(entry.id, index, createWeapon, holder);
      if (weapon?.id !== entry.id) return;
      weapon.restoreCarry(entry.state);
    });
    holder.switchTo(this.slot);
    return player;
  }

  static _build(id, index, createWeapon, holder) {
    let weapon;
    try {
      weapon = createWeapon(id);
    } catch (error) {
      return null;
    }
    if (LOADOUT_SLOTS.indexOf(weapon?.slot) !== index) return null;
    return holder.add(weapon);
  }
}
