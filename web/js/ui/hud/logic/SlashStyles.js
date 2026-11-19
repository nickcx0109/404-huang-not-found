/**
 * Which weapon leaves which slash on the screen. No DOM.
 *
 * A registry instead of a check on the weapon id: a new blade only calls `register(id, style)`.
 * A weapon with no style leaves no slash (guns, the bat).
 *
 * @typedef {object} SlashStyle
 * @property {number} sweepSeconds  time for the head to cross from one end to the other
 * @property {number} fadeSeconds   time for the trail to disappear after that
 * @property {number} trail         length of the visible crescent, as a share of the whole arc (0..1)
 * @property {number} width         thickest part of the crescent, as a share of the screen height
 * @property {number} spanDegrees   how much of a circle the arc covers
 * @property {number} tiltDegrees   how far the arc leans; the return cut leans the other way
 * @property {string} core          colour of the sharp centre line (CSS rgb triple, e.g. "255,255,255")
 * @property {string} glow          colour of the soft light around it
 * @property {number} hitStrength   brightness multiplier when the cut hits something (>= 1)
 */

const DEFAULTS = Object.freeze({
  sweepSeconds: 0.08, fadeSeconds: 0.14, trail: 0.7, width: 0.05,
  spanDegrees: 120, tiltDegrees: 14, core: '255,255,255', glow: '150,200,255', hitStrength: 1.6,
});

export class SlashStyles {
  constructor() {
    this._styles = new Map();
  }

  /** Adds or replaces the slash of one weapon. Missing fields take the defaults. */
  register(weaponId, style = {}) {
    if (typeof weaponId !== 'string' || !weaponId) throw new TypeError('A slash needs a weapon id');
    const full = Object.freeze({ ...DEFAULTS, ...style });
    if (!(full.sweepSeconds > 0) || !(full.fadeSeconds > 0) || !(full.trail > 0) || full.trail > 1 ||
        !(full.width > 0) || !(full.spanDegrees > 0) || !(full.hitStrength >= 1)) {
      throw new RangeError('Invalid slash style for ' + weaponId);
    }
    this._styles.set(weaponId, full);
    return this;
  }

  /** The style of a weapon, or null when it leaves no slash. */
  get(weaponId) {
    return this._styles.get(weaponId) ?? null;
  }

  has(weaponId) {
    return this._styles.has(weaponId);
  }

  /** The slashes of the finished weapons. */
  static standard() {
    // Katana: a long, thin, cold-white cut, about 0.22 seconds in all.
    return new SlashStyles().register('katana', {
      sweepSeconds: 0.08, fadeSeconds: 0.14, trail: 0.75, width: 0.055,
      spanDegrees: 125, tiltDegrees: 22, core: '255,255,255', glow: '160,205,255', hitStrength: 1.7,
    });
  }
}
