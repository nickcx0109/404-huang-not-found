/**
 * Where every enemy stood over the last second or so, one frame per simulation step
 * (docs/tech/NETWORK.md, 手感 3). Frames are keyed by enemy id, so a pooled enemy that comes
 * back under a new id never inherits the old one's past.
 */
export class EnemyHistory {
  /** @param {{seconds?: number}} [options] how much history to keep */
  constructor({ seconds = 1 } = {}) {
    this.keepMs = seconds * 1000;
    /** Oldest first: { time (server ms), positions: Map<id, {x, y, z}> }. */
    this.frames = [];
  }

  get newest() {
    return this.frames.at(-1) ?? null;
  }

  /** Stores the live enemies' positions at server time `time` (ms) and forgets frames older than the window. */
  record(time, enemies) {
    const frame = { time, positions: new Map() };
    for (const enemy of enemies) {
      if (!enemy.active || !enemy.damageable.alive) continue;
      const { x, y, z } = enemy.position;
      frame.positions.set(enemy.id, { x, y, z });
    }
    this.frames.push(frame);
    while (this.frames.length > 1 && this.frames[0].time < time - this.keepMs) this.frames.shift();
    return frame;
  }

  /**
   * Where enemy `id` was at server time `time`, linearly between the two frames around it,
   * or null when no recorded frame knows it (e.g. it spawned later). Times outside the window
   * use the nearest frame.
   */
  positionAt(id, time, out = { x: 0, y: 0, z: 0 }) {
    const frames = this.frames;
    if (frames.length === 0) return null;
    let after = frames.findIndex(frame => frame.time >= time);
    if (after === -1) after = frames.length - 1;
    const later = frames[after];
    const earlier = after > 0 ? frames[after - 1] : later;
    const a = earlier.positions.get(id);
    const b = later.positions.get(id);
    if (!a && !b) return null;
    if (!a || !b || later.time === earlier.time) return Object.assign(out, a ?? b);
    const mix = Math.min(Math.max((time - earlier.time) / (later.time - earlier.time), 0), 1);
    out.x = a.x + (b.x - a.x) * mix;
    out.y = a.y + (b.y - a.y) * mix;
    out.z = a.z + (b.z - a.z) * mix;
    return out;
  }

  clear() {
    this.frames.length = 0;
  }
}
