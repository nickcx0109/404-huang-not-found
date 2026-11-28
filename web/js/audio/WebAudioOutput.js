import { Synth } from './Synth.js';
import { SampleSound } from './Sound.js';
import { SynthSounds } from './SynthSounds.js';

/**
 * The SoundBoard's output in the browser. Browsers only allow sound after the player clicks or presses a
 * key, so nothing is created until `unlock()`; until then every cue is quietly skipped. On unlock it
 * builds the synthesized cues, then loads the files listed in the manifest and swaps them in as they
 * arrive. A file that fails to load leaves the synthesized cue in place.
 *
 * `pause()` suspends the AudioContext, so loops (the chainsaw) and sounds already playing stop where they
 * are; `resume()` lets them go on. While paused, a click or key press does not wake the sound up.
 */
export class WebAudioOutput {
  constructor({ manifestUrl, volume = 0.45 } = {}) {
    this.manifestUrl = manifestUrl;
    this.volume = volume;
    this.synth = null;
    this.library = new Map();
    this.loops = new Map();
    this.loopDisconnects = new Set();
    this.disposed = false;
    this.paused = false;
    this.loads = new AbortController();
  }

  get ready() {
    return this.synth !== null;
  }

  unlock() {
    if (this.disposed) return;
    if (this.synth) {
      if (!this.paused && this.synth.context.state === 'suspended') this.synth.context.resume();
      return;
    }
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.value = this.volume;
    master.connect(context.destination);
    this.synth = new Synth(context, master);
    if (this.paused) context.suspend();
    SynthSounds.registerInto(this.library);
    if (this.manifestUrl) this._loadFiles().catch(error => {
      if (!this.disposed) console.warn('[audio] sound files not loaded:', error);
    });
  }

  pause() {
    if (this.disposed || this.paused) return;
    this.paused = true;
    if (this.synth?.context.state === 'running') this.synth.context.suspend();
  }

  resume() {
    if (this.disposed || !this.paused) return;
    this.paused = false;
    if (this.synth?.context.state === 'suspended') this.synth.context.resume();
  }

  play(cue, mix) {
    if (!this.synth) return;
    this.library.get(cue)?.play(this.synth, mix);
  }

  setLoop(key, cue, mix = { pan: 0, gain: 1 }) {
    const current = this.loops.get(key);
    if (cue !== null && current?.cue === cue && current.update) {
      current.mix = mix;
      current.update(mix);
      return;
    }
    current?.stop?.();
    this.loops.delete(key);
    if (cue === null) return;
    let stop = null;
    let update = null;
    const sound = this.library.get(cue);
    if (this.synth && sound) {
      const context = this.synth.context;
      const gain = context.createGain();
      const pan = context.createStereoPanner?.();
      gain.connect(pan ?? this.synth.output);
      if (pan) pan.connect(this.synth.output);
      const voice = Object.create(this.synth);
      voice.output = gain;
      const disconnect = () => {
        if (!this.loopDisconnects.delete(disconnect)) return;
        gain.disconnect();
        pan?.disconnect();
      };
      this.loopDisconnects.add(disconnect);
      stop = sound.startLoop(voice, { pan: 0, gain: 1 }, disconnect);
      if (stop) {
        update = next => {
          gain.gain.value = next.gain;
          if (pan) pan.pan.value = next.pan ?? 0;
        };
        update(mix);
      } else {
        disconnect();
      }
    }
    // Remember the cue even if it could not start yet, so the loop starts once its file arrives.
    this.loops.set(key, { cue, mix, stop, update });
  }

  async _loadFiles() {
    const response = await fetch(this.manifestUrl, { signal: this.loads.signal });
    if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + this.manifestUrl);
    const manifest = await response.json();
    if (this.disposed) return;
    const base = new URL('.', new URL(this.manifestUrl, location.href));
    await Promise.all(Object.entries(manifest).map(async ([cue, files]) => {
      const list = Array.isArray(files) ? files : [files];
      const buffers = (await Promise.all(list.map(file => this._decode(new URL(file, base))))).filter(Boolean);
      if (this.disposed || buffers.length === 0) return;
      this.library.set(cue, new SampleSound(buffers));
      this._restartLoopsOf(cue);
    }));
  }

  async _decode(url) {
    const context = this.synth?.context;
    if (this.disposed || !context) return null;
    try {
      const response = await fetch(url, { signal: this.loads.signal });
      if (!response.ok) return null;
      const bytes = await response.arrayBuffer();
      if (this.disposed) return null;
      const buffer = await context.decodeAudioData(bytes);
      return this.disposed ? null : buffer;
    } catch (error) {
      if (!this.disposed) console.warn('[audio] could not load', url.href, error);
      return null;
    }
  }

  _restartLoopsOf(cue) {
    for (const [key, loop] of [...this.loops]) if (loop.cue === cue) {
      loop.update = null;
      this.setLoop(key, cue, loop.mix);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.loads.abort();
    for (const key of [...this.loops.keys()]) this.setLoop(key, null);
    for (const disconnect of this.loopDisconnects) disconnect();
    this.synth?.context.close();
    this.synth = null;
    this.library.clear();
  }
}
