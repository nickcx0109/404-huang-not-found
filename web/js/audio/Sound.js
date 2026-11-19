/**
 * How one cue sounds. `WebAudioOutput` asks a Sound to play once (`play`) or to keep playing
 * (`startLoop`, returns a stop function). Two kinds: recorded files (SampleSound) and sounds built from
 * oscillators and noise (SynthSound), so a cue without a file still makes a noise.
 */
export class Sound {
  constructor() {
    if (new.target === Sound) throw new TypeError('Sound is abstract');
  }

  /** @param {import('./Synth.js').Synth} synth  @param {{pan: number, gain: number}} mix */
  play(synth, mix) {
    throw new Error('Implement Sound.play');
  }

  /** @returns {(() => void) | null} stops the loop; null if this sound cannot loop */
  startLoop(synth, mix) {
    return null;
  }
}

/** A recorded file (or several, one picked at random each time), played a little faster or slower each time. */
export class SampleSound extends Sound {
  constructor(buffers, { volume = 1, rng = Math.random } = {}) {
    super();
    if (!buffers.length) throw new RangeError('A sample sound needs at least one buffer');
    this.buffers = buffers;
    this.volume = volume;
    this.rng = rng;
  }

  _source(synth, loop) {
    const source = synth.context.createBufferSource();
    source.buffer = this.buffers[Math.floor(this.rng() * this.buffers.length) % this.buffers.length];
    source.loop = loop;
    if (!loop) source.playbackRate.value = 0.93 + this.rng() * 0.14;
    return source;
  }

  play(synth, mix) {
    const source = this._source(synth, false);
    source.connect(synth.mixer(mix.gain * this.volume, mix.pan));
    source.start();
  }

  startLoop(synth, mix) {
    const source = this._source(synth, true);
    const gain = synth.mixer(mix.gain * this.volume, mix.pan);
    source.connect(gain);
    source.start();
    return () => {
      // A short fade, or the cut clicks.
      const now = synth.context.currentTime;
      gain.gain.setTargetAtTime(0, now, 0.03);
      source.stop(now + 0.15);
    };
  }
}

/** A sound made in code from a recipe: `recipe(synth, mix)` schedules tones and noise bursts. */
export class SynthSound extends Sound {
  constructor(recipe) {
    super();
    if (typeof recipe !== 'function') throw new TypeError('A synth sound needs a recipe');
    this.recipe = recipe;
  }

  play(synth, mix) {
    this.recipe(synth, mix);
  }
}
