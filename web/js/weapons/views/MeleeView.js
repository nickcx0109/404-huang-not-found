import { WeaponView } from '../WeaponView.js';

/**
 * Base for weapons that are swung instead of loaded: no reload clip, and the next swing may
 * start as soon as the game allows it. Subclasses give the swing ("fire") and the hold.
 */
export class MeleeView extends WeaponView {
  static fireInterval = 0;
  static handling = 0.8;
}
