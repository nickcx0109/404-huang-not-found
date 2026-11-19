/**
 * How bright the muzzle flash lights the world, over time: full at the shot, then gone after
 * `seconds`, falling fast at first like a real flash. A new shot starts it again, so automatic
 * fire flickers. Pure timing: MuzzleLight turns it into a light.
 */
export class MuzzleGlow {
  /**
   * @param {object} options
   * @param {number} options.peak  light intensity at the moment of the shot
   * @param {number} options.seconds  how long the light lasts
   */
  constructor({ peak, seconds }) {
    if (!(peak >= 0) || !(seconds > 0)) throw new RangeError('MuzzleGlow needs peak >= 0 and seconds > 0');
    this.peak = peak;
    this.seconds = seconds;
    this.age = Infinity;
  }

  flash() {
    this.age = 0;
  }

  /** Light intensity right now. */
  get intensity() {
    if (this.age >= this.seconds) return 0;
    const left = 1 - this.age / this.seconds;
    return this.peak * left * left;
  }

  /** @param {number} dt seconds  @returns {number} the intensity after it */
  update(dt) {
    if (this.age !== Infinity) this.age += dt;
    return this.intensity;
  }
}
