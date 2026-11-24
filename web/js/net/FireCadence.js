/**
 * Paces the `fire` actions an online client sends and predicts the rounds left meanwhile.
 *
 * One `fire` is one trigger pull; for automatic weapons the client sends another whenever its
 * own trigger would fire again (NETWORK.md), never faster than the weapon's cooldown, never more
 * than 30 per second, plus a small margin so the server's fixed 30 Hz step does not see a shot
 * as early and drop it. Every shot sent is "pending" until the server's own weapon.fired comes
 * back (confirm) or it is too old to still be coming (the server refused it).
 *
 * Times are in seconds on any steadily increasing clock.
 */
export class FireCadence {
  constructor({ maxRate = 30, margin = 0.008, pendingSeconds = 0.5 } = {}) {
    this.minInterval = 1 / maxRate;
    this.margin = margin;
    this.pendingSeconds = pendingSeconds;
    this.nextAt = -Infinity;
    this.pending = [];
  }

  /** Seconds between two shots of a weapon with this cooldown. */
  interval(cooldownSeconds) {
    return Math.max(Number.isFinite(cooldownSeconds) ? cooldownSeconds : 0, this.minInterval) + this.margin;
  }

  /**
   * Whether a shot goes out now; records it when it does.
   * @param {number} now
   * @param {{cooldownSeconds: number, usesAmmo: boolean}} weapon
   * @param {{ammo?: number|null, reloading?: boolean}} [state]  the server's last word on the weapon in hand
   */
  tryFire(now, weapon, { ammo = null, reloading = false } = {}) {
    if (!weapon || reloading || now + 1e-9 < this.nextAt) return false;
    if (weapon.usesAmmo && ammo !== null && this.predictedAmmo(ammo, now) <= 0) return false;
    this.nextAt = now + this.interval(weapon.cooldownSeconds);
    this.pending.push(now);
    return true;
  }

  /** The server reported one of our shots (its weapon.fired). */
  confirm(now) {
    this._expire(now);
    this.pending.shift();
  }

  /** Shots sent and not yet answered. */
  pendingCount(now) {
    this._expire(now);
    return this.pending.length;
  }

  /** Rounds to show: the server's count minus our shots still on their way; null stays null. */
  predictedAmmo(serverAmmo, now) {
    if (serverAmmo === null || serverAmmo === undefined) return null;
    return Math.max(0, serverAmmo - this.pendingCount(now));
  }

  /** A different weapon came into the hand: its own cooldown starts fresh. */
  reset() {
    this.nextAt = -Infinity;
    this.pending.length = 0;
  }

  _expire(now) {
    while (this.pending.length > 0 && now - this.pending[0] > this.pendingSeconds) this.pending.shift();
  }
}
