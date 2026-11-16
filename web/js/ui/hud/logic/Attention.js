/**
 * Decides whether a HUD element stands out or sinks back into the picture.
 * No DOM: the widget asks `awake` and switches a CSS class when the answer changes.
 */
export class Attention {
  /** @param {{holdSeconds?: number}} options  how long a change keeps the element standing out */
  constructor({ holdSeconds = 3 } = {}) {
    if (!Number.isFinite(holdSeconds) || holdSeconds < 0) throw new RangeError('Invalid hold time');
    this.holdSeconds = holdSeconds;
    this._left = 0;
    this._pinned = false;
  }

  /** Something changed: stand out now, sink back after `holdSeconds`. */
  poke() {
    this._left = this.holdSeconds;
  }

  /** While pinned the element never sinks back (low health, empty magazine). */
  pin(pinned) {
    this._pinned = Boolean(pinned);
  }

  update(dt) {
    if (this._left > 0) this._left = Math.max(0, this._left - dt);
  }

  get awake() {
    return this._pinned || this._left > 0;
  }
}
