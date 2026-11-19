import { EVENTS } from '../game/events.js';

const DEGREES = Math.PI / 180;

/**
 * Gun recoil: each shot of the player's gun kicks the view up (and a little to one side). The kick lands
 * almost at once and most of it comes back down over a quarter second, so holding the trigger walks the
 * aim upward and the player has to pull down. How hard each weapon kicks comes from `register`, so a new
 * gun only adds one line and weapons without an entry (melee, throwables) do not kick.
 * Pure numbers: whoever owns the camera applies `update`'s result to it.
 */
export class RecoilKick {
  constructor(events, ownerId, { rng = Math.random, settleRate = 40, recoverRate = 8, recoverShare = 0.6 } = {}) {
    this.ownerId = ownerId;
    this.rng = rng;
    this.settleRate = settleRate;
    this.recoverRate = recoverRate;
    this.recoverShare = recoverShare;
    this.table = new Map();
    this.pending = { pitch: 0, yaw: 0 };
    this.recovering = { pitch: 0, yaw: 0 };
    this._out = { pitch: 0, yaw: 0 };
    this._unsubscribe = events.on(EVENTS.WEAPON_FIRED, detail => {
      if (detail.ownerId === this.ownerId) this.kick(detail.weaponId);
    });
  }

  /** @param {{pitch: number, yaw?: number}} degrees  upward kick and the most it can swing sideways */
  register(weaponId, { pitch, yaw = 0 }) {
    if (!(pitch >= 0) || !(yaw >= 0)) throw new RangeError('Invalid recoil for ' + weaponId);
    this.table.set(weaponId, Object.freeze({ pitch: pitch * DEGREES, yaw: yaw * DEGREES }));
    return this;
  }

  kick(weaponId) {
    const strength = this.table.get(weaponId);
    if (!strength) return false;
    const yaw = (this.rng() * 2 - 1) * strength.yaw;
    this.pending.pitch += strength.pitch;
    this.pending.yaw += yaw;
    this.recovering.pitch += strength.pitch * this.recoverShare;
    this.recovering.yaw += yaw * this.recoverShare;
    return true;
  }

  /** @returns {{pitch: number, yaw: number}} radians to add to the view this frame (reused object) */
  update(dt) {
    const settle = 1 - Math.exp(-this.settleRate * dt);
    const recover = 1 - Math.exp(-this.recoverRate * dt);
    const out = this._out;
    out.pitch = this.pending.pitch * settle - this.recovering.pitch * recover;
    out.yaw = this.pending.yaw * settle - this.recovering.yaw * recover;
    this.pending.pitch -= this.pending.pitch * settle;
    this.pending.yaw -= this.pending.yaw * settle;
    this.recovering.pitch -= this.recovering.pitch * recover;
    this.recovering.yaw -= this.recovering.yaw * recover;
    return out;
  }

  dispose() {
    this._unsubscribe();
  }
}
