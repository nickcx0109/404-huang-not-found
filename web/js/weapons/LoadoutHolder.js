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

  /**
   * Whether `weapon` can be taken from the ground: only into a slot that is not kept for good, and not
   * when the same item is already carried as a full stack.
   */
  canEquip(weapon) {
    const index = LOADOUT_SLOTS.indexOf(weapon?.slot);
    if (index < 0 || KEPT.has(weapon.slot) || this.weapons.includes(weapon)) return false;
    return !this.weapons[index]?.refuses(weapon);
  }

  /** Whether `weapon` cannot be taken because the same item is already carried as a full stack. */
  isFull(weapon) {
    return Boolean(this.inSlot(weapon?.slot)?.refuses(weapon));
  }

  /** Whether taking `weapon` would replace what is in its slot (false when the slot is empty or the item stacks). */
  wouldSwap(weapon) {
    const previous = this.inSlot(weapon?.slot);
    return previous !== null && !previous.canAbsorb(weapon);
  }

  /**
   * Takes `weapon` into its slot and into the player's hand.
   * @returns {Weapon|null} the weapon that was in that slot (now dropped), or null if the slot was empty
   */
  equip(weapon) {
    if (!this.canEquip(weapon)) throw new Error('Cannot equip ' + weapon?.id);
    const index = LoadoutHolder.slotIndex(weapon);
    const previous = this.weapons[index];
    // The same item tops up the stack in the slot; whatever does not fit stays on the ground.
    if (previous?.canAbsorb(weapon)) {
      const usedUp = previous.absorb(weapon);
      this.events.emit(EVENTS.WEAPON_CHANGED, { ownerId: this.ownerId, weaponId: previous.id });
      return usedUp ? null : weapon;
    }
    if (this.index !== index) this.current?.holster();
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

  /** Updates every slot; an item stack that ran out leaves its slot, and if it was in hand the next slot is taken. */
  update(dt, ctx) {
    for (let index = 0; index < this.weapons.length; index++) {
      const weapon = this.weapons[index];
      if (!weapon) continue;
      weapon.update(dt, ctx);
      if (!weapon.depleted) continue;
      weapon.drop();
      this.weapons[index] = null;
      if (index === this.index && !this.cycle(1)) this.index = -1;
    }
  }
}
