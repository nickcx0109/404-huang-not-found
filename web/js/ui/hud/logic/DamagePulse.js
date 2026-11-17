/**
 * How strongly the screen edge shows a hit, from 0 (nothing) to 1, fading by itself. No DOM.
 * A small hit is still visible; a second hit while the first one fades never makes it weaker.
 */
export class DamagePulse {
  /**
   * @param {{fadeSeconds?: number, floor?: number, gain?: number}} options
   *   fadeSeconds: time for a full-strength mark to disappear
   *   floor: strength of the smallest hit; gain: extra strength per share of full health lost
   */
  constructor({ fadeSeconds = 1.6, floor = 0.45, gain = 1.6 } = {}) {
    if (!(fadeSeconds > 0) || floor < 0 || floor > 1 || gain < 0) throw new RangeError('Invalid damage pulse');
    this.fadeSeconds = fadeSeconds;
    this.floor = floor;
    this.gain = gain;
    this.level = 0;
  }

  /** @param {number} share  health lost by this hit as a share of full health, 0..1 */
  hit(share) {
    const strength = Math.min(1, this.floor + Math.max(0, share) * this.gain);
    this.level = Math.max(this.level, strength);
  }

  update(dt) {
    if (this.level > 0) this.level = Math.max(0, this.level - dt / this.fadeSeconds);
  }

  get active() {
    return this.level > 0;
  }
}
