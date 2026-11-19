import { EVENTS } from '../game/events.js';
import { WeaponHolder } from './WeaponHolder.js';

/**
 * Slot order is also the number key order: 1 primary gun, 2 pistol, 3 bat, 4 picked-up melee
 * (katana, chainsaw), 5 throwable, 6 healing item, 7 adrenaline.
 */
export const LOADOUT_SLOTS = Object.freeze(['primary', 'sidearm', 'melee', 'special', 'throwable', 'healing', 'booster']);
const KEPT = new Set(['sidearm', 'melee']);

/**
 * A WeaponHolder with one fixed place per slot (see LOADOUT_SLOTS) instead of a growing list.
 * `weapons[i]` is the weapon in slot i or null. Sidearm and melee are kept for good; the primary
 * slot is changed by `equip`, which hands back the weapon it replaced so it can be left on the ground.
 */
export class LoadoutHolder extends WeaponHolder {
  constructor(ownerId, events) {
    super(ownerId, events);
    this.weapons = LOADOUT_SLOTS.map(() => null);
  }

  static slotIndex(weapon) {
    const index = LOADOUT_SLOTS.indexOf(weapon?.slot);
    if (index < 0) throw new TypeError('Unknown weapon slot: ' + weapon?.slot);
    return index;
  }

  inSlot(slot) {
    return this.weapons[LOADOUT_SLOTS.indexOf(slot)] ?? null;
  }

  /** Puts a weapon into its empty slot (the starting loadout). The first one added is taken in hand. */
  add(weapon) {
    if (this.weapons.includes(weapon)) throw new Error('Weapon already held');
    const index = LoadoutHolder.slotIndex(weapon);
    if (this.weapons[index]) throw new Error('Slot ' + weapon.slot + ' is taken; use equip()');
    weapon.ownerId = this.ownerId;
    this.weapons[index] = weapon;
    if (this.index < 0) this.switchTo(index);
    return weapon;
  }

  /** Whether `weapon` can be taken from the ground: only into a slot that is not kept for good. */
  canEquip(weapon) {
    const index = LOADOUT_SLOTS.indexOf(weapon?.slot);
    return index >= 0 && !KEPT.has(weapon.slot) && !this.weapons.includes(weapon);
  }

  /**
   * Takes `weapon` into its slot and into the player's hand.
   * @returns {Weapon|null} the weapon that was in that slot (now dropped), or null if the slot was empty
   */
  equip(weapon) {
    if (!this.canEquip(weapon)) throw new Error('Cannot equip ' + weapon?.id);
    const index = LoadoutHolder.slotIndex(weapon);
    const previous = this.weapons[index];
    previous?.drop();
    weapon.ownerId = this.ownerId;
    this.weapons[index] = weapon;
    this.index = index;
    this.events.emit(EVENTS.WEAPON_CHANGED, { ownerId: this.ownerId, weaponId: weapon.id });
    return previous;
  }

  switchTo(index) {
    if (!Number.isInteger(index) || !this.weapons[index]) return false;
    return super.switchTo(index);
  }

  /**
   * Moves to the next (`step` > 0) or previous (`step` < 0) slot that holds something, wrapping
   * around; empty slots are skipped. This is what the mouse wheel does.
   */
  cycle(step) {
    if (!Number.isInteger(step) || step === 0) return false;
    const direction = Math.sign(step);
    const count = this.weapons.length;
    let index = this.index;
    for (let tried = 1; tried < count; tried++) {
      index = ((index + direction) % count + count) % count;
      if (this.weapons[index]) return this.switchTo(index);
    }
    return false;
  }

  update(dt, ctx) {
    for (const weapon of this.weapons) weapon?.update(dt, ctx);
  }
}
