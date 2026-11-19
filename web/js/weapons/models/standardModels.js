import { ModelKit } from './ModelKit.js';
import { WeaponModel } from '../WeaponModel.js';
import { buildRifle, buildSmg, buildShotgun, buildRevolver } from './gunModels.js';
import { buildBat, buildKatana, buildChainsaw } from './meleeModels.js';
import { buildGrenade, buildMolotov, buildBandage } from './itemModels.js';

const built = build => context => build(new ModelKit(context.colors));

/**
 * Model factory of every weapon, by weapon id. The pistol is the GLB from the asset pipeline
 * (art/blender/pistol.py); the rest are built from simple shapes in the browser.
 */
export const STANDARD_MODELS = Object.freeze({
  pistol: context => WeaponModel.load(context.modelsUrl, 'pistol', context.surface),
  revolver: built(buildRevolver),
  rifle: built(buildRifle),
  smg: built(buildSmg),
  shotgun: built(buildShotgun),
  bat: built(buildBat),
  katana: built(buildKatana),
  chainsaw: built(buildChainsaw),
  grenade: built(buildGrenade),
  molotov: built(buildMolotov),
  bandage: built(buildBandage),
});
