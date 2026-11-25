/**
 * The short electronic tick for each typed character, made with WebAudio
 * so it needs no sound file. Silent until `unlock()` is called from a click.
 */
export class KeyClick {
  constructor({ volume = 0.05 } = {}) {
    this.volume = volume;
    this.ctx = null;
  }

  /** Browsers only allow sound after the user clicks; call this from that click. */
  unlock() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext ?? window.webkitAudioContext;
    if (AudioCtx) this.ctx = new AudioCtx();
  }

  play() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1500 + Math.random() * 400, now);
    gain.gain.setValueAtTime(this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  close() {
    this.ctx?.close();
    this.ctx = null;
  }
}
