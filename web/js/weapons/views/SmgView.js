import { WeaponView } from '../WeaponView.js';
import { ClipKit } from './ClipKit.js';

// SmgView: the submachine gun (SmgModel). Fires very fast, so each shot is a short twitch.
export class SmgView extends WeaponView {
  static id = 'smg';
  static hold = { position: [0.12, -0.2, -0.42], rotation: [0.02, 0.04, 0] };
  static clips = {
    equip: ClipKit.raise({ seconds: 0.45 }),
    fire: ClipKit.shot({ seconds: 0.07, kick: 0.012, rise: 0.022, roll: 0.01, parts: {
      'bolt.pos.z': [[0, 0], [0.015, 0.025, 'out'], [0.05, 0, 'in']],
    } }),
    reload: ClipKit.magazineSwap({ seconds: 1.6, magazine: [0, -1, 0.05], depth: 0.2, tilt: 0.3, roll: -0.5 }),
  };
  static fireInterval = 0;
  static handling = 0.85;
}
