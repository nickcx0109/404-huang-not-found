import { SpatialMix } from './SpatialMix.js';

/**
 * Decides which sound plays and how loud, never how it sounds. Rules (subclasses of SoundRule) listen to
 * game events and call `play`; the board turns a world position into left/right pan and distance volume,
 * keeps a cue from stacking up (a cue with a cooldown is skipped if it played too recently) and runs
 * loops that stop by themselves once nobody keeps them going (`hold`).
 *
 * The output is anything with `play(cue, { pan, gain })` and `setLoop(key, cue | null, { gain })`:
 * `WebAudioOutput` in the browser, a recorder in the tests. No DOM here.
 */
export class SoundBoard {
  /**
   * @param {{play: Function, setLoop: Function}} output
   * @param {() => ({x: number, z: number, yaw: number} | null)} listener  where the ears are right now
   */
  constructor(output, listener, { range = 30 } = {}) {
    if (typeof output?.play !== 'function' || typeof output?.setLoop !== 'function') {
      throw new TypeError('A sound board needs an output with play and setLoop');
    }
    this.output = output;
    this.listener = listener;
    this.range = range;
    this.time = 0;
    this.rules = [];
    this.cooldowns = new Map();
    this.lastPlayed = new Map();
    this.holds = new Map();
  }

  /** A cue played again within `seconds` of the last time is dropped (forty zombies dying at once). */
  cooldown(cue, seconds) {
    if (!(seconds >= 0)) throw new RangeError('Invalid cooldown for ' + cue);
    this.cooldowns.set(cue, seconds);
    return this;
  }

  /** Adds a rule and lets it subscribe. */
  install(rule) {
    rule.attach(this);
    this.rules.push(rule);
    return this;
  }

  /**
   * @param {string} cue
   * @param {{position?: {x: number, z: number}, volume?: number}} [options]  no position = in your head
   * @returns {boolean} whether it was sent to the output
   */
  play(cue, { position = null, volume = 1 } = {}) {
    const wait = this.cooldowns.get(cue);
    const last = this.lastPlayed.get(cue);
    if (wait !== undefined && last !== undefined && this.time - last < wait - 1e-9) return false;
    const mix = SpatialMix.of(position ? this.listener() : null, position, this.range);
    if (mix.gain <= 0) return false;
    this.lastPlayed.set(cue, this.time);
    this.output.play(cue, { pan: mix.pan, gain: mix.gain * volume });
    return true;
  }

  /**
   * Keeps loop `key` playing `cue` for another `seconds`. When no call renews it, the loop goes back to
   * `then` (the chainsaw idling again after a cut) or stops.
   */
  hold(key, cue, seconds, { then = null } = {}) {
    const current = this.holds.get(key);
    if (!current || current.cue !== cue) this.output.setLoop(key, cue, { gain: 1 });
    this.holds.set(key, { cue, until: this.time + seconds, then });
  }

  /** Starts (or with `cue` null stops) loop `key` until told otherwise. */
  loop(key, cue) {
    const current = this.holds.get(key);
    if (cue === null) {
      if (current) this.output.setLoop(key, null);
      this.holds.delete(key);
      return;
    }
    if (!current || current.cue !== cue) this.output.setLoop(key, cue, { gain: 1 });
    this.holds.set(key, { cue, until: Infinity, then: null });
  }

  update(dt) {
    this.time += dt;
    for (const [key, hold] of this.holds) {
      if (this.time < hold.until - 1e-9) continue;
      if (hold.then) {
        this.output.setLoop(key, hold.then, { gain: 1 });
        this.holds.set(key, { cue: hold.then, until: Infinity, then: null });
      } else {
        this.output.setLoop(key, null);
        this.holds.delete(key);
      }
    }
    for (const rule of this.rules) rule.update(dt);
  }

  dispose() {
    for (const rule of this.rules) rule.dispose();
    for (const key of this.holds.keys()) this.output.setLoop(key, null);
    this.holds.clear();
    this.rules.length = 0;
  }
}
