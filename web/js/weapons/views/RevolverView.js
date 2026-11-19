import { Clip } from '../Clip.js';
import { WeaponView } from '../WeaponView.js';
import { ClipKit } from './ClipKit.js';

// RevolverView: the revolver (RevolverModel). Parts: cylinder, hammer. The cylinder turns one
// chamber per shot; the reload swings it out, tips the gun up, then snaps it back.
const CHAMBER = Math.PI / 3;

const fire = ClipKit.shot({ seconds: 0.6, kick: 0.04, rise: 0.32, roll: -0.08, parts: {
  'hammer.rot.x': [[0, 0.5], [0.04, 0, 'out'], [0.35, 0], [0.5, 0.5, 'inOut']],
  'cylinder.rot.z': [[0, 0], [0.35, 0], [0.5, CHAMBER, 'inOut'], [0.6, CHAMBER]],
} });
// The clip ends a sixth of a turn on; back at idle the cylinder is at 0, which looks the same.

const reload = new Clip('reload', 2.2, {
  'cylinder.pos.x': [[0, 0], [0.25, 0], [0.35, -0.032, 'out'], [1.75, -0.032], [1.85, 0, 'in']],
  'cylinder.rot.z': [[0, 0], [0.35, 0], [1.4, CHAMBER * 4, 'inOut'], [1.75, CHAMBER * 6, 'out'], [1.8, 0, 'step']],
  'gun.rot.x': [[0, 0], [0.3, 0.2, 'inOut'], [0.55, 0.9, 'inOut'], [0.85, 0.9], [1.0, 0.05, 'inOut'], [1.85, 0.05], [2.05, 0, 'inOut']],
  'gun.rot.z': [[0, 0], [0.3, -0.55, 'inOut'], [1.85, -0.55], [2.05, 0, 'inOut']],
  'gun.pos.y': [[0, 0], [0.3, 0.04, 'inOut'], [0.6, 0.06, 'out'], [0.62, 0.04], [1.85, 0.04], [2.05, 0, 'inOut']],
}, [[0.35, 'swing-out'], [0.6, 'eject'], [1.85, 'swing-in']]);

export class RevolverView extends WeaponView {
  static id = 'revolver';
  static hold = { position: [0.11, -0.15, -0.4], rotation: [0.02, 0.05, 0] };
  static clips = { equip: ClipKit.raise({ seconds: 0.5 }), fire, reload };
  static fireInterval = 0;
  static handling = 1;
}
