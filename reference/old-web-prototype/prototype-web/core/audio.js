'use strict';
/* =========================================================
   音效：WebAudio 合成，不需要素材檔
   ========================================================= */
class Sfx {
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      this.ctx = new AC();
      this.out = this.ctx.createGain(); this.out.gain.value = 0.42; this.out.connect(this.ctx.destination);
      const len = this.ctx.sampleRate, b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = b;
    } catch (e) { this.ctx = null; }
  }
  spatial(pos) {
    if (!pos || !game.player) return { pan: 0, gain: 1 };
    const p = game.player.pos, dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz) || 1;
    const rx = Math.cos(game.player.yaw), rz = -Math.sin(game.player.yaw);
    return { pan: clamp((dx * rx + dz * rz) / d, -1, 1) * 0.85, gain: clamp(1 - d / 40, 0.05, 1) };
  }
  chain(node, vol, pos, t, dur) {
    const c = this.ctx, g = c.createGain(), sp = this.spatial(pos);
    const peak = Math.max(0.0002, vol * sp.gain);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g);
    if (c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = sp.pan; g.connect(pn); pn.connect(this.out); } else g.connect(this.out);
  }
  noise({ dur = 0.2, f = 1000, f2 = 0, q = 0.8, type = 'lowpass', vol = 0.5, pos = null, delay = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay, s = c.createBufferSource(), fl = c.createBiquadFilter();
    s.buffer = this.noiseBuf; fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    s.connect(fl); this.chain(fl, vol, pos, t, dur); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  tone({ f = 440, f2 = 0, dur = 0.15, type = 'square', vol = 0.2, pos = null, delay = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    this.chain(o, vol, pos, t, dur); o.start(t); o.stop(t + dur + 0.05);
  }
  shot(kind) {
    if (kind === 'shotgun') { this.noise({ dur: 0.38, f: 2000, f2: 180, vol: 0.95 }); this.tone({ f: 95, f2: 38, dur: 0.22, type: 'sine', vol: 0.7 }); this.tone({ f: 420, dur: 0.05, type: 'square', vol: 0.05, delay: 0.42 }); this.noise({ dur: 0.08, f: 3000, type: 'bandpass', q: 3, vol: 0.15, delay: 0.5 }); }
    else if (kind === 'rifle') { this.noise({ dur: 0.13, f: 2800, f2: 500, vol: 0.6 }); this.tone({ f: 150, f2: 60, dur: 0.08, type: 'sine', vol: 0.5 }); }
    else { this.noise({ dur: 0.17, f: 2300, f2: 380, vol: 0.7 }); this.tone({ f: 190, f2: 70, dur: 0.1, type: 'sine', vol: 0.55 }); }
  }
  hit() { this.tone({ f: 820, dur: 0.035, type: 'triangle', vol: 0.12 }); }
  headshot() { this.tone({ f: 1500, f2: 1900, dur: 0.1, type: 'sine', vol: 0.28 }); this.tone({ f: 2600, dur: 0.07, type: 'sine', vol: 0.1, delay: 0.03 }); }
  kill() { this.tone({ f: 520, f2: 260, dur: 0.12, type: 'triangle', vol: 0.12 }); }
  empty() { this.tone({ f: 1300, dur: 0.02, type: 'square', vol: 0.06 }); }
  reload() { this.tone({ f: 320, dur: 0.03, type: 'square', vol: 0.07 }); this.noise({ dur: 0.06, f: 2500, type: 'bandpass', q: 4, vol: 0.18, delay: 0.25 }); }
  reloaded() { this.tone({ f: 260, dur: 0.03, type: 'square', vol: 0.08 }); this.noise({ dur: 0.05, f: 3000, type: 'bandpass', q: 4, vol: 0.2 }); }
  scream(pos) { this.tone({ f: 480, f2: 1500, dur: 0.65, type: 'sawtooth', vol: 0.22, pos }); this.noise({ dur: 0.6, f: 1700, type: 'bandpass', q: 2, vol: 0.25, pos }); }
  hiss(pos) { this.noise({ dur: 0.9, f: 5000, f2: 2000, type: 'highpass', vol: 0.18, pos }); this.tone({ f: 220, f2: 660, dur: 0.9, type: 'square', vol: 0.05, pos }); }
  boom(pos) { this.noise({ dur: 1.0, f: 700, f2: 50, vol: 1.0, pos }); this.tone({ f: 70, f2: 28, dur: 0.7, type: 'sine', vol: 0.9, pos }); }
  slam(pos) { this.noise({ dur: 0.45, f: 380, f2: 60, vol: 0.85, pos }); this.tone({ f: 62, f2: 30, dur: 0.35, type: 'sine', vol: 0.8, pos }); }
  windup(pos) { this.tone({ f: 90, f2: 160, dur: 0.9, type: 'sawtooth', vol: 0.09, pos }); }
  hurt() { this.tone({ f: 210, f2: 90, dur: 0.2, type: 'sawtooth', vol: 0.14 }); this.noise({ dur: 0.12, f: 600, vol: 0.3 }); }
  groan(pos) { this.tone({ f: rand(95, 130), f2: rand(70, 90), dur: rand(0.5, 0.9), type: 'sawtooth', vol: 0.05, pos }); }
  pick() { this.tone({ f: 660, dur: 0.07, type: 'triangle', vol: 0.15 }); this.tone({ f: 990, dur: 0.1, type: 'triangle', vol: 0.15, delay: 0.07 }); }
  coin() { this.tone({ f: 1320, dur: 0.06, type: 'square', vol: 0.08 }); this.tone({ f: 1980, dur: 0.12, type: 'square', vol: 0.08, delay: 0.06 }); }
  buy() { this.tone({ f: 880, dur: 0.05, type: 'triangle', vol: 0.15 }); this.tone({ f: 1320, dur: 0.08, type: 'triangle', vol: 0.12, delay: 0.05 }); this.noise({ dur: 0.08, f: 4000, type: 'bandpass', q: 5, vol: 0.12 }); }
  deny() { this.tone({ f: 180, dur: 0.12, type: 'square', vol: 0.08 }); }
  tick(i) { this.tone({ f: 700 + (i % 4) * 140, dur: 0.04, type: 'square', vol: 0.06 }); }
  jackpot(r) { const base = r === 'legendary' ? 660 : r === 'rare' ? 523 : 440; [0, 0.08, 0.16].forEach((d, i) => this.tone({ f: base * [1, 1.25, 1.5][i], dur: 0.18, type: 'triangle', vol: 0.16, delay: d })); }
  wave() { this.tone({ f: 110, f2: 55, dur: 1.1, type: 'sawtooth', vol: 0.12 }); this.tone({ f: 165, f2: 82, dur: 1.1, type: 'sawtooth', vol: 0.08 }); }
  bell() { this.tone({ f: 988, dur: 0.6, type: 'sine', vol: 0.18 }); this.tone({ f: 1319, dur: 0.6, type: 'sine', vol: 0.1, delay: 0.12 }); }
}
const sfx = new Sfx();

