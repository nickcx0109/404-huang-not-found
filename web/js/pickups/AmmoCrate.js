import { Entity } from '../entities/Entity.js';
import { EVENTS } from '../game/events.js';

/**
 * An ammunition box standing in the level. Using it fills every gun the player carries (magazine and
 * reserve); then the box needs `cooldownSeconds` before it can be used again, by anyone.
 * The box stays in the level and can be reused after its cooldown.
 */
export class AmmoCrate extends Entity {
  constructor(id, position, { radius = 1.2, cooldownSeconds = 60 } = {}) {
    super(id, position);
    if (!(radius >= 0) || !(cooldownSeconds >= 0)) throw new RangeError('Invalid ammo crate');
    this.radius = radius;
    this.cooldownSeconds = cooldownSeconds;
    this.readyAt = 0;
  }

  /** Ground distance from the player's edge to the box. */
  distanceTo(player) {
    return Math.hypot(this.position.x - player.position.x, this.position.z - player.position.z) - player.body.radius;
  }

  reachableBy(player) {
    return this.distanceTo(player) <= this.radius;
  }

  ready(time) {
    return time + 1e-9 >= this.readyAt;
  }

  /** Seconds until the box can be used again (0 when ready). */
  secondsLeft(time) {
    return Math.max(0, this.readyAt - time);
  }

  /** Whether the player has a gun that is not full. */
  static needs(player) {
    return player.weapons.weapons.some(weapon => weapon?.canRefill);
  }

  /** Fills the player's guns. @returns {boolean} whether anything was filled */
  use(player, ctx) {
    if (!this.ready(ctx.time) || !AmmoCrate.needs(player)) return false;
    for (const weapon of player.weapons.weapons) if (weapon?.canRefill) weapon.refill();
    this.readyAt = ctx.time + this.cooldownSeconds;
    ctx.events.emit(EVENTS.AMMO_REFILLED, { ownerId: player.id, crateId: this.id });
    return true;
  }
}
