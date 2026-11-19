import { EVENTS } from '../game/events.js';

export class WeaponHolder {
  constructor(ownerId, events) {
    this.ownerId = ownerId;
    this.events = events;
    this.weapons = [];
    this.index = -1;
  }

  get current() {
    return this.weapons[this.index] ?? null;
  }

  add(weapon) {
    if (this.weapons.includes(weapon)) throw new Error('Weapon already held');
    weapon.ownerId = this.ownerId;
    this.weapons.push(weapon);
    if (this.index < 0) this.switchTo(0);
    return weapon;
  }

  switchTo(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.weapons.length) return false;
    if (index === this.index) return true;
    this.current?.holster();
    this.index = index;
    this.events.emit(EVENTS.WEAPON_CHANGED, { ownerId: this.ownerId, weaponId: this.current.id });
    return true;
  }

  update(dt, ctx) {
    for (const weapon of this.weapons) weapon.update(dt, ctx);
  }
}
