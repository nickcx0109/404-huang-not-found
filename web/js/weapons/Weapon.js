import { EVENTS } from '../game/events.js';

export class Weapon {
  constructor({ id, magazine, reserve, reloadSeconds, cooldownSeconds, fireMode }) {
    if (new.target === Weapon) throw new TypeError('Weapon is abstract');
    if (!Number.isInteger(magazine) || magazine <= 0 || !Number.isInteger(reserve) || reserve < 0 ||
        !Number.isFinite(reloadSeconds) || reloadSeconds <= 0 ||
        !Number.isFinite(cooldownSeconds) || cooldownSeconds <= 0 || typeof fireMode?.fire !== 'function') {
      throw new TypeError('Invalid weapon configuration');
    }
    this.id = id;
    this.magazine = magazine;
    this.ammo = magazine;
    this.reserve = reserve;
    this.maxReserve = reserve;
    this.reloadSeconds = reloadSeconds;
    this.cooldownSeconds = cooldownSeconds;
    this.fireMode = fireMode;
    this.ownerId = null;
    this.nextFireAt = 0;
    this.reloadEndsAt = null;
  }

  get reloading() {
    return this.reloadEndsAt !== null;
  }

  get canRefill() {
    return this.ammo < this.magazine || this.reserve < this.maxReserve;
  }

  fire(ctx) {
    this.update(0, ctx);
    if (this.reloading || this.ammo === 0 || ctx.time + 1e-9 < this.nextFireAt) return false;
    const shot = this.createShot(ctx);
    this.ammo--;
    this.nextFireAt = ctx.time + this.cooldownSeconds;
    const hit = this.fireMode.fire(shot, ctx, this.ownerId);
    this.onFired(ctx, hit);
    ctx.events.emit(EVENTS.WEAPON_FIRED, { ownerId: this.ownerId, weaponId: this.id, hit });
    return true;
  }

  createShot(ctx) {
    throw new Error('Implement Weapon.createShot');
  }

  onFired(ctx, hit) {}

  reload(ctx) {
    this.update(0, ctx);
    if (this.reloading || this.ammo === this.magazine || this.reserve === 0) return false;
    this.reloadEndsAt = ctx.time + this.reloadSeconds;
    return true;
  }

  update(dt, ctx) {
    if (!this.reloading || ctx.time + 1e-9 < this.reloadEndsAt) return;
    const amount = Math.min(this.magazine - this.ammo, this.reserve);
    this.ammo += amount;
    this.reserve -= amount;
    this.reloadEndsAt = null;
    ctx.events.emit(EVENTS.WEAPON_RELOADED, { ownerId: this.ownerId, weaponId: this.id });
  }

  refill() {
    this.ammo = this.magazine;
    this.reserve = this.maxReserve;
    this.reloadEndsAt = null;
  }
}
