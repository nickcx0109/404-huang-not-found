import { MeleeWeapon } from './MeleeWeapon.js';

/**
 * Chainsaw, found on the ground, slot 4. Hold the button: it cuts the closest zombie within 3 m in front
 * ten times a second for 20 each (200 a second). Every cut spends battery; a full battery (100) lasts
 * about 30 seconds of cutting and an empty one does nothing. Taking another chainsaw from the ground
 * swaps it, which is how the battery is renewed.
 */
export class Chainsaw extends MeleeWeapon {
  constructor({ battery = 100, secondsPerBattery = 30, fireMode } = {}) {
    const cooldownSeconds = 0.1;
    super({ id: 'chainsaw', damage: 20, range: 3, arcDegrees: 60, cooldownSeconds, fireMode });
    if (!(battery >= 0) || !(secondsPerBattery > 0)) throw new RangeError('Invalid chainsaw battery');
    this.maxBattery = 100;
    this.battery = Math.min(battery, this.maxBattery);
    this.drainPerCut = this.maxBattery * cooldownSeconds / secondsPerBattery;
  }

  get slot() {
    return 'special';
  }

  get charge() {
    return this.battery / this.maxBattery;
  }

  carryState() {
    return { battery: this.battery };
  }

  restoreCarry(state) {
    const battery = state?.battery;
    if (Number.isFinite(battery) && battery >= 0 && battery <= this.maxBattery) this.battery = battery;
  }

  /** Keeps cutting while the button is held. */
  get automatic() {
    return true;
  }

  fire(ctx) {
    if (this.battery <= 0) return false;
    return super.fire(ctx);
  }

  onFired() {
    // Rounding leaves crumbs like 1e-13 after the last cut; that is an empty battery.
    const left = this.battery - this.drainPerCut;
    this.battery = left < 1e-6 ? 0 : left;
  }
}
