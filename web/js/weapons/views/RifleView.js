import { WeaponView } from '../WeaponView.js';
import { ClipKit } from './ClipKit.js';

// RifleView: the assault rifle (RifleModel). Parts: magazine, charge (charging handle), bolt.
export class RifleView extends WeaponView {
  static id = 'rifle';
  static hold = { position: [0.12, -0.2, -0.46], rotation: [0.015, 0.035, 0] };
  static clips = {
    equip: ClipKit.raise({ seconds: 0.55 }),
    fire: ClipKit.shot({ seconds: 0.11, kick: 0.018, rise: 0.035, roll: -0.012, parts: {
      'bolt.pos.z': [[0, 0], [0.02, 0.03, 'out'], [0.07, 0, 'in']],
    } }),
    reload: ClipKit.magazineSwap({ seconds: 1.7, magazine: [0, -0.98, 0.18], depth: 0.24 }),
  };
  static fireInterval = 0;
  static handling = 0.75;
}
