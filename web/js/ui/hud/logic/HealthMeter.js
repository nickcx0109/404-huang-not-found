/** Health as the HUD sees it: how full the bar is, whether it counts as low, what just changed. No DOM. */
export class HealthMeter {
  /** @param {{lowRatio?: number}} options  below this share of full health the display turns red */
  constructor({ lowRatio = 0.3 } = {}) {
    if (!Number.isFinite(lowRatio) || lowRatio < 0 || lowRatio > 1) throw new RangeError('Invalid low-health ratio');
    this.lowRatio = lowRatio;
    this.health = null;
    this.max = 1;
  }

  /**
   * Stores new numbers.
   * @returns {'first'|'hurt'|'healed'|'same'}  what happened compared with the previous numbers
   */
  set(health, max) {
    if (!Number.isFinite(health) || !Number.isFinite(max) || max <= 0) throw new RangeError('Invalid health');
    const value = Math.min(max, Math.max(0, health));
    const before = this.health;
    const sameMax = max === this.max;
    this.health = value;
    this.max = max;
    if (before === null) return 'first';
    if (value < before) return 'hurt';
    if (value > before) return 'healed';
    return sameMax ? 'same' : 'healed';
  }

  /** 0 (dead) to 1 (full). */
  get ratio() {
    return this.health === null ? 0 : this.health / this.max;
  }

  get low() {
    return this.health !== null && this.ratio < this.lowRatio;
  }

  /** Whole number shown to the player; never 0 while still alive. */
  get shown() {
    return this.health === null ? 0 : Math.ceil(this.health);
  }
}
