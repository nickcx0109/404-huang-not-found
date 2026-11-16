// The weapons the game knows. A new weapon: write its view class (see PistolView), add its
// model through the asset pipeline (art/manifest/weapons.json), and register it here.
import { WeaponRig } from './WeaponRig.js';
import { PistolView } from './PistolView.js';

WeaponRig.register(PistolView);

export { WeaponRig };
export { WeaponView } from './WeaponView.js';
export { Clip } from './Clip.js';
