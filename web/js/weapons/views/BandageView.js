import { Clip } from '../Clip.js';
import { WeaponView } from '../WeaponView.js';
import { ClipKit } from './ClipKit.js';

// BandageView: the bandage roll (BandageModel). Parts: roll. Nothing is fired; while the game
// applies it (Bandage.progress) the "use" clip is shown at that point: brought to the middle,
// the roll turning as it unwinds.
const SPINS = 6;
const use = new Clip('use', 1, {
  'gun.pos.x': [[0, 0], [0.08, -0.07, 'inOut'], [0.92, -0.07], [1, 0, 'inOut']],
  'gun.pos.y': [[0, 0], [0.08, 0.03, 'inOut'], [0.5, 0.01, 'inOut'], [0.92, 0.03, 'inOut'], [1, 0, 'inOut']],
  'gun.rot.y': [[0, 0], [0.08, 0.5, 'inOut'], [0.92, 0.5], [1, 0, 'inOut']],
  'roll.rot.x': [[0, 0], [0.08, 0], [0.92, Math.PI * 2 * SPINS], [1, Math.PI * 2 * SPINS]],
});

export class BandageView extends WeaponView {
  static id = 'bandage';
  static hold = { position: [0.11, -0.09, -0.34], rotation: [0.35, -0.35, 0.1] };
  static clips = { equip: ClipKit.raise({ seconds: 0.4 }), use };
  static fireInterval = 0;
  static handling = 1;
}
