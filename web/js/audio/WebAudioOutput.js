import { Synth } from './Synth.js';
import { SampleSound } from './Sound.js';
import { SynthSounds } from './SynthSounds.js';

/**
 * The SoundBoard's output in the browser. Browsers only allow sound after the player clicks or presses a
 * key, so nothing is created until `unlock()`; until then every cue is quietly skipped. On unlock it
 * builds the synthesized cues, then loads the files listed in the manifest and swaps them in as they
 * arrive. A file that fails to load leaves the synthesized cue in place.
 */
export class WebAudioOutput {
  constructor({ manifestUrl, volume = 0.45 } = {}) {
    this.manifestUrl = manifestUrl;
    this.volume = volume;
    this.synth = null;
    this.library = new Map();
    this.loops = new Map();
  }

  get ready() {
    return this.synth !== null;
  }

  unlock() {
    if (this.synth) {
      if (this.synth.context.state === 'suspended') this.synth.context.resume();
      return;
    }
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.value = this.volume;
    master.connect(context.destination);
    this.synth = new Synth(context, master);
    SynthSounds.registerInto(this.library);
    if (this.manifestUrl) this._loadFiles().catch(error => console.warn('[audio] sound files not loaded:', error));
  }

  play(cue, mix) {
    if (!this.synth) return;
    this.library.get(cue)?.play(this.synth, mix);
  }

  setLoop(key, cue, mix = { pan: 0, gain: 1 }) {
    this.loops.get(key)?.stop?.();
    this.loops.delete(key);
    if (cue === null) return;
    const stop = this.synth ? this.library.get(cue)?.startLoop(this.synth, mix) ?? null : null;
    // Remember the cue even if it could not start yet, so the loop starts once its file arrives.
    this.loops.set(key, { cue, mix, stop });
  }

  async _loadFiles() {
    const response = await fetch(this.manifestUrl);
    if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + this.manifestUrl);
    const manifest = await response.json();
    const base = new URL('.', new URL(this.manifestUrl, location.href));
    await Promise.all(Object.entries(manifest).map(async ([cue, files]) => {
      const list = Array.isArray(files) ? files : [files];
      const buffers = (await Promise.all(list.map(file => this._decode(new URL(file, base))))).filter(Boolean);
      if (buffers.length === 0) return;
      this.library.set(cue, new SampleSound(buffers));
      this._restartLoopsOf(cue);
    }));
  }

  async _decode(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      return await this.synth.context.decodeAudioData(await response.arrayBuffer());
    } catch (error) {
      console.warn('[audio] could not load', url.href, error);
      return null;
    }
  }

  _restartLoopsOf(cue) {
    for (const [key, loop] of this.loops) if (loop.cue === cue) this.setLoop(key, cue, loop.mix);
  }

  dispose() {
    for (const key of [...this.loops.keys()]) this.setLoop(key, null);
    this.synth?.context.close();
    this.synth = null;
  }
}
