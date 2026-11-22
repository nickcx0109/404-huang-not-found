import { WeaponView } from '../WeaponView.js';
import { ClipKit } from './ClipKit.js';

/** A compact injector held in the ordinary item view. Use is instantaneous. */
export class AdrenalineView extends WeaponView {
  static id = 'adrenaline';
  static hold = { position: [0.11, -0.09, -0.34], rotation: [0.35, -0.35, 0.1] };
  static clips = { equip: ClipKit.raise({ seconds: 0.3 }) };
  static fireInterval = 0;
  static handling = 1;
}
