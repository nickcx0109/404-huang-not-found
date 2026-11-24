const TAU = Math.PI * 2;

/** Wraps an angle difference into [-PI, PI). */
export function wrapAngle(angle) {
  return ((((angle + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

/** Interpolates from a to b along the shorter way around the circle. */
export function lerpAngle(a, b, alpha) {
  return a + wrapAngle(b - a) * alpha;
}

const POSITION_KEYS = Object.freeze(['x', 'y', 'z']);
const ANGLE_KEYS = Object.freeze(['yaw', 'pitch']);
const ENTITY_LISTS = Object.freeze(['players', 'enemies']);

/**
 * Keeps about one second of server snapshots ordered by server time and answers
 * "what did the world look like at render time t" (docs/tech/NETWORK.md, 手感 2).
 *
 * Between two snapshots, positions are linear and angles take the shortest way round;
 * every other field comes from the newer snapshot. An entity only in the newer snapshot
 * appears as-is; one missing from it has been removed and vanishes. Past the newest
 * snapshot, motion is extrapolated for at most `maxExtrapolation` ms and then held.
 */
export class SnapshotBuffer {
  /**
   * @param {object} [options]
   * @param {number} [options.delay] interpolation delay behind estimated server time (ms)
   * @param {number} [options.maxExtrapolation] longest extrapolation past the newest snapshot (ms)
   * @param {number} [options.duration] how much history to keep, measured from the newest snapshot (ms)
   */
  constructor({ delay = 100, maxExtrapolation = 250, duration = 1000 } = {}) {
    if (!(delay >= 0)) throw new RangeError('SnapshotBuffer delay must be non-negative');
    if (!(maxExtrapolation >= 0)) throw new RangeError('SnapshotBuffer maxExtrapolation must be non-negative');
    if (!(duration > 0)) throw new RangeError('SnapshotBuffer duration must be positive');
    this.delay = delay;
    this.maxExtrapolation = maxExtrapolation;
    this.duration = duration;
    this._snapshots = [];
  }

  /** Number of buffered snapshots. */
  get size() {
    return this._snapshots.length;
  }

  /** Newest buffered snapshot, or null. */
  get latest() {
    return this._snapshots.at(-1) ?? null;
  }

  /** Oldest buffered snapshot, or null. */
  get oldest() {
    return this._snapshots[0] ?? null;
  }

  /** Render time for an estimated server time: serverNow minus the interpolation delay. */
  renderTime(serverNow) {
    return serverNow - this.delay;
  }

  /** Drops every snapshot (for example after leaving a room). */
  clear() {
    this._snapshots.length = 0;
  }

  /**
   * Adds one `snapshot` message. Returns false when it is malformed, a duplicate
   * (same server time or tick as a buffered one), or older than the kept history.
   */
  push(snapshot) {
    if (!snapshot || !Number.isFinite(snapshot.time)) return false;
    if (!Array.isArray(snapshot.players) || !Array.isArray(snapshot.enemies)) return false;
    const list = this._snapshots;
    const duplicate = list.some((s) => s.time === snapshot.time
      || (snapshot.tick !== undefined && s.tick === snapshot.tick));
    if (duplicate) return false;
    let index = list.length;
    while (index > 0 && list[index - 1].time > snapshot.time) index--;
    list.splice(index, 0, snapshot);
    this._prune();
    // A late snapshot before the cutoff survives only if it is now the closest predecessor.
    return list.includes(snapshot);
  }

  /**
   * Returns the interpolated world at `renderTime`, or null when empty:
   * `{ time, tick, state, wave, kills, ack, players, enemies, alpha, extrapolated, snapshot }`.
   * `snapshot` is the newer of the two bracketing snapshots (the source of non-motion fields).
   */
  sample(renderTime) {
    const list = this._snapshots;
    if (list.length === 0 || !Number.isFinite(renderTime)) return null;
    const first = list[0];
    const last = list.at(-1);
    if (renderTime <= first.time) return this._result(renderTime, null, first, 1, false);
    if (renderTime >= last.time) {
      const previous = list.length > 1 ? list.at(-2) : null;
      const ahead = Math.min(renderTime - last.time, this.maxExtrapolation);
      if (!previous || ahead === 0) return this._result(renderTime, null, last, 1, ahead > 0);
      const alpha = 1 + ahead / (last.time - previous.time);
      return this._result(renderTime, previous, last, alpha, true);
    }
    let index = 1;
    while (list[index].time < renderTime) index++;
    const older = list[index - 1];
    const newer = list[index];
    const alpha = (renderTime - older.time) / (newer.time - older.time);
    return this._result(renderTime, older, newer, alpha, false);
  }

  _prune() {
    const cutoff = this._snapshots.at(-1).time - this.duration;
    // Keep one snapshot at or before the cutoff so a render time near it can still interpolate.
    while (this._snapshots.length > 2 && this._snapshots[1].time <= cutoff) this._snapshots.shift();
  }

  _result(time, older, newer, alpha, extrapolated) {
    const result = {
      time,
      tick: newer.tick,
      state: newer.state,
      wave: newer.wave,
      kills: newer.kills,
      ack: newer.ack,
      alpha,
      extrapolated,
      snapshot: newer,
    };
    for (const key of ENTITY_LISTS) result[key] = SnapshotBuffer._blendList(older?.[key], newer[key], alpha);
    return result;
  }

  static _blendList(olderList, newerList, alpha) {
    const byId = new Map();
    if (Array.isArray(olderList)) for (const entity of olderList) byId.set(entity?.id, entity);
    return newerList.map((entity) => {
      const before = byId.get(entity?.id);
      return before ? SnapshotBuffer._blendEntity(before, entity, alpha) : { ...entity };
    });
  }

  static _blendEntity(before, after, alpha) {
    const blended = { ...after };
    for (const key of POSITION_KEYS) {
      if (Number.isFinite(before[key]) && Number.isFinite(after[key])) {
        blended[key] = before[key] + (after[key] - before[key]) * alpha;
      }
    }
    for (const key of ANGLE_KEYS) {
      if (Number.isFinite(before[key]) && Number.isFinite(after[key])) {
        blended[key] = lerpAngle(before[key], after[key], alpha);
      }
    }
    return blended;
  }
}
