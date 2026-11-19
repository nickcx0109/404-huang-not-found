import { WeaponView } from '../WeaponView.js';

/** Base for things thrown from the hand: no reload; "fire" is the throw. */
export class ThrowableView extends WeaponView {
  static fireInterval = 0;
  static handling = 1;
}
