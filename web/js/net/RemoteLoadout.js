/**
 * The weapon in the local player's hand as the server last described it, shaped like the
 * small part of a LoadoutHolder that WeaponTrigger and HeldWeaponDriver read: `current` with
 * its `id`, `automatic`, `reloading` and `reloadSecondsLeft(time)`. `current` is a new object
 * whenever another weapon (or another slot) comes into the hand, which is how the first-person
 * view knows to draw the new one.
 *
 * Reloads are timed from the server's weapon.reload-started (`duration`) on the client clock,
 * so the animation starts when the event arrives instead of a snapshot later.
 */
export class RemoteLoadout {
  /** @param {WeaponSpecs} specs */
  constructor(specs) {
    this.specs = specs;
    this.current = null;
    this.index = -1;
    this._key = null;
  }

  /**
   * Follows one snapshot player record (the newest, not the delayed one).
   * @param {{weapon: string, slot?: number, reloading?: boolean}} record
   * @param {number} now  client seconds
   * @returns {boolean} true when the weapon in hand changed
   */
  apply(record, now) {
    const id = record?.weapon || null;
    const index = Number.isInteger(record?.slot) ? record.slot : -1;
    const key = id === null ? null : index + ':' + id;
    let changed = false;
    if (key !== this._key) {
      this._key = key;
      this.index = index;
      this.current = id === null ? null : new HeldWeapon(this.specs.get(id));
      changed = true;
    }
    const weapon = this.current;
    if (weapon) {
      if (record.reloading && weapon.reloadEndsAt === null) weapon.reloadEndsAt = now + weapon.reloadSeconds;
      else if (!record.reloading && weapon.reloadEndsAt !== null && now >= weapon.reloadEndsAt) weapon.reloadEndsAt = null;
    }
    return changed;
  }

  /** The server started a reload of the weapon in hand that lasts `duration` seconds. */
  startReload(weaponId, duration, now) {
    if (this.current?.id !== weaponId) return;
    this.current.reloadEndsAt = now + (Number.isFinite(duration) ? duration : this.current.reloadSeconds);
  }

  finishReload(weaponId) {
    if (this.current?.id === weaponId) this.current.reloadEndsAt = null;
  }
}

/** One weapon in the hand: its fixed spec plus the reload clock. */
class HeldWeapon {
  constructor(spec) {
    this.id = spec.id;
    this.spec = spec;
    this.automatic = spec.automatic;
    this.cooldownSeconds = spec.cooldownSeconds;
    this.usesAmmo = spec.usesAmmo;
    this.magazine = spec.magazine;
    this.reloadSeconds = spec.reloadSeconds;
    this.reloadEndsAt = null;
  }

  get reloading() {
    return this.reloadEndsAt !== null;
  }

  reloadSecondsLeft(time) {
    return this.reloadEndsAt === null ? 0 : Math.max(0, this.reloadEndsAt - time);
  }
}
