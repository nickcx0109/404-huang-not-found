/**
 * Small WebAudio toolkit the synthesized sounds are written with: a tone (oscillator with a pitch slide)
 * and a burst of filtered noise, each with a quick attack and an exponential fade. Ported from the old
 * prototype's `core/audio.js`.
 */
export class Synth {
  constructor(context, output) {
    this.context = context;
    this.output = output;
    const length = context.sampleRate;
    this.noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let index = 0; index < length; index++) data[index] = Math.random() * 2 - 1;
  }

  /** A gain node at `gain`, panned, connected to the output. */
  mixer(gain, pan = 0) {
    const node = this.context.createGain();
    node.gain.value = gain;
    if (pan !== 0 && this.context.createStereoPanner) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = pan;
      node.connect(panner);
      panner.connect(this.output);
    } else {
      node.connect(this.output);
    }
    return node;
  }

  _envelope(node, volume, mix, start, duration) {
    const gain = this.mixer(1, mix.pan);
    const peak = Math.max(0.0002, volume * mix.gain);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    node.connect(gain);
  }

  tone(mix, { f = 440, f2 = 0, dur = 0.15, type = 'square', vol = 0.2, delay = 0 }) {
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(f, start);
    if (f2) oscillator.frequency.exponentialRampToValueAtTime(f2, start + dur);
    this._envelope(oscillator, vol, mix, start, dur);
    oscillator.start(start);
    oscillator.stop(start + dur + 0.05);
  }

  noise(mix, { dur = 0.2, f = 1000, f2 = 0, q = 0.8, type = 'lowpass', vol = 0.5, delay = 0 }) {
    const start = this.context.currentTime + delay;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    source.buffer = this.noiseBuffer;
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f, start);
    if (f2) filter.frequency.exponentialRampToValueAtTime(f2, start + dur);
    source.connect(filter);
    this._envelope(filter, vol, mix, start, dur);
    source.start(start, Math.random() * 0.5);
    source.stop(start + dur + 0.05);
  }
}
