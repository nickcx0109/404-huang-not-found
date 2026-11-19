import { SynthSound } from './Sound.js';

/**
 * Cues made in code, mostly the old prototype's recipes. A cue that also has a file in
 * `web/assets/sfx/manifest.json` uses the file once it loads; these are what you hear before that,
 * or if loading fails.
 */
const RECIPES = {
  shot_pistol: (s, m) => { s.noise(m, { dur: 0.17, f: 2300, f2: 380, vol: 0.7 }); s.tone(m, { f: 190, f2: 70, dur: 0.1, type: 'sine', vol: 0.55 }); },
  shot_revolver: (s, m) => { s.noise(m, { dur: 0.3, f: 1900, f2: 220, vol: 0.9 }); s.tone(m, { f: 120, f2: 45, dur: 0.18, type: 'sine', vol: 0.7 }); },
  shot_rifle: (s, m) => { s.noise(m, { dur: 0.13, f: 2800, f2: 500, vol: 0.6 }); s.tone(m, { f: 150, f2: 60, dur: 0.08, type: 'sine', vol: 0.5 }); },
  shot_smg: (s, m) => { s.noise(m, { dur: 0.08, f: 3200, f2: 700, vol: 0.45 }); s.tone(m, { f: 210, f2: 90, dur: 0.05, type: 'sine', vol: 0.35 }); },
  shot_shotgun: (s, m) => {
    s.noise(m, { dur: 0.38, f: 2000, f2: 180, vol: 0.95 });
    s.tone(m, { f: 95, f2: 38, dur: 0.22, type: 'sine', vol: 0.7 });
    // The pump: a click and a slide.
    s.tone(m, { f: 420, dur: 0.05, type: 'square', vol: 0.05, delay: 0.42 });
    s.noise(m, { dur: 0.08, f: 3000, type: 'bandpass', q: 3, vol: 0.15, delay: 0.5 });
  },
  swing: (s, m) => s.noise(m, { dur: 0.16, f: 700, f2: 2400, type: 'bandpass', q: 1.5, vol: 0.3 }),
  bat_hit: (s, m) => { s.noise(m, { dur: 0.1, f: 900, f2: 200, vol: 0.5 }); s.tone(m, { f: 130, f2: 70, dur: 0.08, type: 'sine', vol: 0.4 }); },
  katana_swing: (s, m) => s.noise(m, { dur: 0.2, f: 1200, f2: 4000, type: 'bandpass', q: 2, vol: 0.3 }),
  katana_hit: (s, m) => { s.tone(m, { f: 1800, f2: 1400, dur: 0.12, type: 'triangle', vol: 0.15 }); s.noise(m, { dur: 0.08, f: 1500, vol: 0.35 }); },
  reload_pistol: (s, m) => { s.noise(m, { dur: 0.05, f: 2500, type: 'bandpass', q: 4, vol: 0.2 }); s.noise(m, { dur: 0.05, f: 3000, type: 'bandpass', q: 4, vol: 0.22, delay: 0.6 }); },
  reload_rifle: (s, m) => { s.noise(m, { dur: 0.06, f: 2200, type: 'bandpass', q: 4, vol: 0.2 }); s.noise(m, { dur: 0.06, f: 2800, type: 'bandpass', q: 4, vol: 0.24, delay: 0.8 }); },
  shotgun_pump: (s, m) => { s.tone(m, { f: 420, dur: 0.05, type: 'square', vol: 0.05 }); s.noise(m, { dur: 0.08, f: 3000, type: 'bandpass', q: 3, vol: 0.2, delay: 0.1 }); },
  hit: (s, m) => s.tone(m, { f: 820, dur: 0.035, type: 'triangle', vol: 0.12 }),
  headshot: (s, m) => { s.tone(m, { f: 1500, f2: 1900, dur: 0.1, type: 'sine', vol: 0.28 }); s.tone(m, { f: 2600, dur: 0.07, type: 'sine', vol: 0.1, delay: 0.03 }); },
  kill: (s, m) => s.tone(m, { f: 520, f2: 260, dur: 0.12, type: 'triangle', vol: 0.12 }),
  hurt: (s, m) => { s.tone(m, { f: 210, f2: 90, dur: 0.2, type: 'sawtooth', vol: 0.14 }); s.noise(m, { dur: 0.12, f: 600, vol: 0.3 }); },
  heal: (s, m) => { s.tone(m, { f: 520, dur: 0.12, type: 'sine', vol: 0.12 }); s.tone(m, { f: 780, dur: 0.18, type: 'sine', vol: 0.1, delay: 0.1 }); },
  // Pickups are hands and objects, not chimes: a grip, then whatever the thing does.
  pickup_gun: (s, m) => {
    s.noise(m, { dur: 0.07, f: 1200, vol: 0.14 });                                  // hand on the grip
    s.noise(m, { dur: 0.04, f: 3200, type: 'bandpass', q: 6, vol: 0.4, delay: 0.06 }); // metal clack
    s.tone(m, { f: 1700, f2: 900, dur: 0.025, type: 'square', vol: 0.04, delay: 0.06 });
    s.noise(m, { dur: 0.06, f: 2300, type: 'bandpass', q: 5, vol: 0.32, delay: 0.17 }); // slide back
  },
  pickup_melee: (s, m) => {
    s.noise(m, { dur: 0.08, f: 1000, vol: 0.14 });
    s.noise(m, { dur: 0.12, f: 420, f2: 160, vol: 0.4, delay: 0.05 });                 // heavy thing lifted
    s.tone(m, { f: 140, f2: 80, dur: 0.09, type: 'sine', vol: 0.25, delay: 0.05 });
  },
  pickup_item: (s, m) => {
    s.noise(m, { dur: 0.12, f: 1600, type: 'bandpass', q: 0.7, vol: 0.2 });           // into the bag
    s.noise(m, { dur: 0.14, f: 2300, type: 'bandpass', q: 0.7, vol: 0.16, delay: 0.09 });
  },
  ammo_refill: (s, m) => {
    for (const [delay, f] of [[0, 2600], [0.11, 2900], [0.22, 2500]]) {               // rounds pressed in
      s.noise(m, { dur: 0.04, f, type: 'bandpass', q: 6, vol: 0.28, delay });
    }
    s.noise(m, { dur: 0.06, f: 1800, type: 'bandpass', q: 4, vol: 0.32, delay: 0.36 }); // magazine seated
  },
  throw: (s, m) => s.noise(m, { dur: 0.25, f: 500, f2: 1600, type: 'bandpass', q: 1.2, vol: 0.25 }),
  explosion: (s, m) => { s.noise(m, { dur: 1.0, f: 700, f2: 50, vol: 1.0 }); s.tone(m, { f: 70, f2: 28, dur: 0.7, type: 'sine', vol: 0.9 }); },
  zombie_groan: (s, m) => s.tone(m, { f: 95 + Math.random() * 35, f2: 70 + Math.random() * 20, dur: 0.5 + Math.random() * 0.4, type: 'sawtooth', vol: 0.05 }),
  zombie_death: (s, m) => s.tone(m, { f: 160, f2: 60, dur: 0.5, type: 'sawtooth', vol: 0.08 }),
  zombie_scream: (s, m) => { s.tone(m, { f: 480, f2: 1500, dur: 0.65, type: 'sawtooth', vol: 0.22 }); s.noise(m, { dur: 0.6, f: 1700, type: 'bandpass', q: 2, vol: 0.25 }); },
  zombie_hiss: (s, m) => { s.noise(m, { dur: 0.9, f: 5000, f2: 2000, type: 'highpass', vol: 0.18 }); s.tone(m, { f: 220, f2: 660, dur: 0.9, type: 'square', vol: 0.05 }); },
  zombie_windup: (s, m) => s.tone(m, { f: 90, f2: 160, dur: 0.9, type: 'sawtooth', vol: 0.09 }),
  wave_start: (s, m) => { s.tone(m, { f: 110, f2: 55, dur: 1.1, type: 'sawtooth', vol: 0.12 }); s.tone(m, { f: 165, f2: 82, dur: 1.1, type: 'sawtooth', vol: 0.08 }); },
  wave_clear: (s, m) => { s.tone(m, { f: 988, dur: 0.6, type: 'sine', vol: 0.18 }); s.tone(m, { f: 1319, dur: 0.6, type: 'sine', vol: 0.1, delay: 0.12 }); },
  game_over: (s, m) => { s.tone(m, { f: 220, f2: 110, dur: 1.4, type: 'sawtooth', vol: 0.12 }); s.tone(m, { f: 147, f2: 73, dur: 1.6, type: 'sawtooth', vol: 0.1, delay: 0.2 }); },
};

export class SynthSounds {
  /** @param {Map<string, import('./Sound.js').Sound>} library */
  static registerInto(library) {
    for (const [cue, recipe] of Object.entries(RECIPES)) library.set(cue, new SynthSound(recipe));
    return library;
  }
}
