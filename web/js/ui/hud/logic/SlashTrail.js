/**
 * Timing of one blade slash on the screen, as plain numbers. No DOM.
 *
 * A slash has two phases: the head of the arc sweeps from one end to the other (`sweepSeconds`),
 * then the whole trail fades out (`fadeSeconds`). The tail follows the head at `trail` behind it,
 * so the light is a crescent that runs across, not a full arc that pops in.
 * Every new slash comes from the other side, like a cut back and forth.
 */
export class SlashTrail {
  /** @param {SlashStyle} style  timing and look, see SlashStyles */
  constructor(style) {
    this.style = style;
    this.elapsed = Infinity;
    this.side = -1;
    this.hit = false;
    this.sweepSeconds = style.sweepSeconds;
  }

  /** Starts a new slash. `hit`: the blade touched something, so it is drawn brighter. */
  start(hit = false, side = -this.side, sweepSeconds = this.style.sweepSeconds) {
    this.elapsed = 0;
    this.side = side;
    this.hit = Boolean(hit);
    this.sweepSeconds = sweepSeconds;
  }

  update(dt) {
    if (this.active) this.elapsed += Math.max(0, dt);
  }

  get duration() {
    return this.sweepSeconds + this.style.fadeSeconds;
  }

  get active() {
    return this.elapsed < this.duration;
  }

  /** Where the leading end of the arc is, 0 (start) to 1 (other side); eased so it starts fast. */
  get head() {
    if (!this.active) return 1;
    const t = Math.min(1, this.elapsed / this.sweepSeconds);
    return 1 - (1 - t) * (1 - t) * (1 - t);
  }

  /** Where the trailing end is, 0..1, never past the head. */
  get tail() {
    if (!this.active) return 1;
    const fading = Math.max(0, this.elapsed - this.sweepSeconds) / this.style.fadeSeconds;
    // While fading the tail also catches up a little, so the crescent shrinks as it dies.
    return Math.min(this.head, Math.max(0, this.head - this.style.trail * (1 - 0.6 * fading)));
  }

  /** How visible the whole trail is, 1 while sweeping, then down to 0. */
  get alpha() {
    if (!this.active) return 0;
    const fading = Math.max(0, this.elapsed - this.sweepSeconds) / this.style.fadeSeconds;
    return (1 - fading) * (1 - fading);
  }

  /** Brightness multiplier: a hit glows more. */
  get strength() {
    return this.hit ? this.style.hitStrength : 1;
  }
}
