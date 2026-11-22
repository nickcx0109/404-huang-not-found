import { WeaponView } from '../WeaponView.js';
import { ClipKit } from './ClipKit.js';

export class SniperView extends WeaponView {
  static id = 'sniper';
  static hold = { position: [0.12, -0.2, -0.46], rotation: [0.015, 0.035, 0] };
  static clips = {
    equip: ClipKit.raise({ seconds: 0.65 }),
    fire: ClipKit.shot({ seconds: 0.5, kick: 0.055, rise: 0.06, roll: -0.015 }),
    reload: ClipKit.magazineSwap({ seconds: 2.8, magazine: [0, -0.98, 0.18], depth: 0.24 }),
  };
  static fireInterval = 0;
  static handling = 0.6;
}
