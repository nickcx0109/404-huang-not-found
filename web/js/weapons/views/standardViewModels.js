import { ViewModelRegistry } from './ViewModelRegistry.js';
import { PistolView } from '../PistolView.js';
import { RevolverView } from './RevolverView.js';
import { SniperView } from './SniperView.js';
import { RifleView } from './RifleView.js';
import { SmgView } from './SmgView.js';
import { ShotgunView } from './ShotgunView.js';
import { BatView } from './BatView.js';
import { KatanaView } from './KatanaView.js';
import { ChainsawView } from './ChainsawView.js';
import { GrenadeView } from './GrenadeView.js';
import { MolotovView } from './MolotovView.js';
import { BandageView } from './BandageView.js';

/**
 * The look of every weapon the game has. Model factories are passed in (`models`, weapon id ->
 * factory) so this file stays free of Three.js and can be checked in Node: every weapon in the
 * game must have a view here. The browser gets the factories from models/standardModels.js.
 */
export const VIEWS = Object.freeze({
  pistol: PistolView,
  revolver: RevolverView,
  rifle: RifleView,
  sniper: SniperView,
  smg: SmgView,
  shotgun: ShotgunView,
  bat: BatView,
  katana: KatanaView,
  chainsaw: ChainsawView,
  grenade: GrenadeView,
  molotov: MolotovView,
  bandage: BandageView,
});

/** @param {Object<string, function(object): object>} models  weapon id -> model factory */
export function standardViewModels(models) {
  const registry = new ViewModelRegistry();
  for (const [id, View] of Object.entries(VIEWS)) {
    if (!models[id]) throw new Error('No model for the ' + id + ' view');
    registry.register(id, View, models[id]);
  }
  return registry;
}
