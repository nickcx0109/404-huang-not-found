/** Ammunition as the HUD sees it: what to print, how many round icons are lit, which notice to show. No DOM. */
export class AmmoMeter {
  /**
   * @param {{maxIcons?: number, lowRatio?: number}} options
   *   maxIcons: big magazines share icons so the row never grows past this
   *   lowRatio: at or below this share of a magazine the display stays visible
   */
  constructor({ maxIcons = 40, lowRatio = 0.25 } = {}) {
    if (!Number.isInteger(maxIcons) || maxIcons <= 0) throw new RangeError('Invalid icon limit');
    if (!Number.isFinite(lowRatio) || lowRatio < 0 || lowRatio > 1) throw new RangeError('Invalid low-ammo ratio');
    this.maxIcons = maxIcons;
    this.lowRatio = lowRatio;
    this.armed = false;
    this.ammo = 0;
    this.magazine = 0;
    this.reserve = 0;
    this.reloading = false;
    /** Rounds that left the magazine in the last `set` (0 when it did not shrink). */
    this.spent = 0;
    /** True when the last `set` changed the magazine size, so the icon row must be rebuilt. */
    this.resized = false;
  }

  /**
   * Stores new numbers. `status.armed` false means no weapon in hand.
   * @returns {boolean} whether anything the HUD draws has changed
   */
  set(status) {
    const armed = Boolean(status.armed);
    const ammo = armed ? status.ammo : 0;
    const magazine = armed ? status.magazine : 0;
    const reserve = armed ? status.reserve : 0;
    const reloading = armed && Boolean(status.reloading);
    if (armed && (!Number.isInteger(ammo) || !Number.isInteger(magazine) || !Number.isInteger(reserve) ||
        ammo < 0 || magazine <= 0 || reserve < 0 || ammo > magazine)) {
      throw new RangeError('Invalid ammunition numbers');
    }
    const changed = armed !== this.armed || ammo !== this.ammo || magazine !== this.magazine ||
      reserve !== this.reserve || reloading !== this.reloading;
    this.resized = magazine !== this.magazine;
    this.spent = !this.resized && ammo < this.ammo ? this.ammo - ammo : 0;
    this.armed = armed;
    this.ammo = ammo;
    this.magazine = magazine;
    this.reserve = reserve;
    this.reloading = reloading;
    return changed;
  }

  get empty() {
    return this.armed && this.ammo === 0;
  }

  get low() {
    return this.armed && this.ammo > 0 && this.ammo <= Math.ceil(this.magazine * this.lowRatio);
  }

  /** Stay visible while the player has something to worry about. */
  get urgent() {
    return this.empty || this.low || this.reloading;
  }

  /** Icons in the row: one per round, or `maxIcons` when the magazine is bigger than that. */
  get icons() {
    return Math.min(this.magazine, this.maxIcons);
  }

  /** How many of those icons are still lit. Never 0 while a round is left. */
  get litIcons() {
    if (this.magazine === 0) return 0;
    return Math.ceil(this.ammo / this.magazine * this.icons);
  }

  /**
   * Which notice belongs under the counter.
   * @returns {'reloading'|'reload'|'out'|null}
   *   reloading: wait; reload: magazine empty, press R; out: nothing left at all
   */
  get notice() {
    if (!this.armed) return null;
    if (this.reloading) return 'reloading';
    if (this.ammo > 0) return null;
    return this.reserve > 0 ? 'reload' : 'out';
  }
}
