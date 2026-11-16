// Clip: one weapon animation as plain data. No Three.js, so it can be tested in Node.
//
// A clip is a set of tracks. A track drives one channel, named "<node>.<pos|rot>.<x|y|z>":
// the node is a moving part of the weapon model ("slide", "magazine", ...) or "gun" for the
// whole weapon. Values are offsets from the rest pose, in metres or radians, in game axes
// (+Y up, the muzzle points toward -Z).
//
//   new Clip('fire', 0.26, {
//     'slide.pos.z': [[0, 0], [0.035, 0.034, 'out'], [0.10, 0, 'in']],
//   }, [[0, 'shot']]);
//
// A key is [time, value, ease]. The ease shapes the way INTO that key from the one before:
// 'linear' (default), 'in' (starts slow), 'out' (ends slow), 'inOut', or 'step' (holds the
// previous value, then jumps). Before the first key a track holds the first value, after the
// last key the last value.
const EASES = Object.freeze({
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
  step: () => 0,
});

const CHANNEL = /^[a-z0-9_]+\.(pos|rot)\.[xyz]$/;

export class Clip {
  /**
   * @param {string} name
   * @param {number} duration seconds
   * @param {Object<string, Array>} tracks  channel -> keys, sorted by time
   * @param {Array} [events]  [time, name] pairs, e.g. where a sound belongs
   */
  constructor(name, duration, tracks, events = []) {
    if (!(duration > 0)) throw new RangeError('Clip "' + name + '": duration must be positive');
    this.name = name;
    this.duration = duration;
    this.tracks = new Map();
    for (const [channel, keys] of Object.entries(tracks)) {
      if (!CHANNEL.test(channel)) {
        throw new Error('Clip "' + name + '": channel "' + channel + '" must look like slide.pos.z');
      }
      this.tracks.set(channel, Clip._checkKeys(name, channel, keys));
    }
    this.events = events.map(([time, eventName]) => ({ time, name: eventName }))
      .sort((a, b) => a.time - b.time);
  }

  /**
   * Adds every track's value at `time` onto `out[channel]` (so several sources can share
   * one pose) and returns `out`.
   */
  sample(time, out = {}) {
    for (const [channel, keys] of this.tracks) {
      out[channel] = (out[channel] || 0) + Clip.valueAt(keys, time);
    }
    return out;
  }

  /** Names of the events with start < time <= end, in order. */
  eventsBetween(start, end) {
    return this.events.filter((e) => e.time > start && e.time <= end).map((e) => e.name);
  }

  /** Value of one track at a time. */
  static valueAt(keys, time) {
    if (time <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, ease] = keys[i];
      if (time > t1) continue;
      const [t0, v0] = keys[i - 1];
      const span = t1 - t0;
      const local = span > 0 ? (time - t0) / span : 1;
      if (local >= 1) return v1;
      return v0 + (v1 - v0) * EASES[ease || 'linear'](local);
    }
    return keys[keys.length - 1][1];
  }

  /**
   * Tracks that move a node along one direction: keys give the distance, the result holds a
   * track per axis. Clip.along('magazine.pos', [0, -0.96, 0.29], [[0, 0], [0.3, 0.2, 'in']])
   */
  static along(prefix, direction, keys) {
    const tracks = {};
    ['x', 'y', 'z'].forEach((axis, i) => {
      if (direction[i] === 0) return;
      tracks[prefix + '.' + axis] = keys.map(([t, d, ease]) => [t, d * direction[i], ease]);
    });
    return tracks;
  }

  static _checkKeys(name, channel, keys) {
    const where = 'Clip "' + name + '", ' + channel;
    if (!Array.isArray(keys) || keys.length === 0) throw new Error(where + ': needs at least one key');
    keys.forEach((key, i) => {
      if (!Number.isFinite(key[0]) || !Number.isFinite(key[1])) throw new Error(where + ': key ' + i + ' needs a time and a value');
      if (key[2] !== undefined && !EASES[key[2]]) throw new Error(where + ': unknown ease "' + key[2] + '"');
      if (i > 0 && key[0] < keys[i - 1][0]) throw new Error(where + ': keys must be sorted by time');
    });
    return keys;
  }
}
