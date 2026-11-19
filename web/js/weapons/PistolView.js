import { Clip } from './Clip.js';
import { WeaponView } from './WeaponView.js';

// PistolView: the semi-automatic pistol (art/blender/pistol.py). Parts: slide, magazine,
// trigger, hammer. Offsets are metres and radians in game axes: the muzzle points toward
// -Z, so the slide runs back along +Z and a positive gun.rot.x lifts the muzzle.

const SLIDE_TRAVEL = 0.034;
// The magazine leaves along the lean of the grip: down, and a little back.
const MAGAZINE_OUT = [0, -0.958, 0.287];

const equip = new Clip('equip', 0.5, {
  'gun.pos.y': [[0, -0.26], [0.36, 0.006, 'out'], [0.5, 0, 'inOut']],
  'gun.rot.x': [[0, -0.95], [0.34, 0.07, 'out'], [0.5, 0, 'inOut']],
  'gun.rot.z': [[0, 0.3], [0.4, 0, 'out']],
}, [[0, 'raise']]);

const fire = new Clip('fire', 0.28, {
  // the slide slams back, then the spring returns it
  'slide.pos.z': [[0, 0], [0.035, SLIDE_TRAVEL, 'out'], [0.1, 0, 'in']],
  'hammer.rot.x': [[0, -0.6], [0.035, 0, 'out']],
  'trigger.rot.x': [[0, -0.35], [0.09, -0.35], [0.19, 0, 'out']],
  // recoil: back into the hand, the muzzle flips up and settles
  'gun.pos.z': [[0, 0], [0.04, 0.03, 'out'], [0.26, 0, 'inOut']],
  'gun.pos.y': [[0, 0], [0.05, 0.008, 'out'], [0.28, 0, 'inOut']],
  'gun.rot.x': [[0, 0], [0.05, 0.17, 'out'], [0.28, 0, 'inOut']],
  'gun.rot.z': [[0, 0], [0.05, -0.045, 'out'], [0.22, 0, 'inOut']],
}, [[0, 'shot'], [0.04, 'eject']]);

const reload = new Clip('reload', 2.0, {
  // turn the pistol up and over so the magazine well shows
  'gun.rot.x': [[0, 0], [0.26, 0.5, 'inOut'], [1.3, 0.5], [1.52, 0.06, 'inOut'], [1.62, 0.12, 'out'], [1.95, 0, 'inOut']],
  'gun.rot.z': [[0, 0], [0.26, -0.5, 'inOut'], [1.3, -0.5], [1.55, 0, 'inOut']],
  'gun.rot.y': [[0, 0], [0.26, 0.3, 'inOut'], [1.3, 0.3], [1.55, 0, 'inOut']],
  'gun.pos.x': [[0, 0], [0.26, -0.03, 'inOut'], [1.3, -0.03], [1.55, 0, 'inOut']],
  'gun.pos.y': [[0, 0], [0.26, 0.05, 'inOut'], [1.14, 0.05], [1.19, 0.064, 'out'], [1.3, 0.05, 'inOut'], [1.55, 0, 'inOut']],
  'gun.pos.z': [[0, 0], [1.5, 0], [1.6, 0.014, 'out'], [1.7, -0.004, 'in'], [1.85, 0, 'out']],
  // the old magazine drops away; a fresh one comes up from below and is slapped home
  ...Clip.along('magazine.pos', MAGAZINE_OUT, [
    [0, 0], [0.3, 0], [0.34, 0.012, 'out'], [0.66, 0.5, 'in'],
    [0.84, 0.34, 'step'], [1.1, 0.02, 'out'], [1.14, 0.02], [1.18, 0, 'in'],
  ]),
  // rack the slide to chamber a round
  'slide.pos.z': [[0, 0], [1.5, 0], [1.6, SLIDE_TRAVEL, 'out'], [1.66, SLIDE_TRAVEL], [1.71, 0, 'in']],
  'hammer.rot.x': [[0, 0], [1.5, 0], [1.6, 0.25, 'out'], [1.71, 0, 'in']],
}, [[0.3, 'mag-out'], [1.18, 'mag-in'], [1.6, 'slide-back'], [1.71, 'slide-home']]);

export class PistolView extends WeaponView {
  static id = 'pistol';
  static hold = { position: [0.105, -0.205, -0.36], rotation: [0.02, 0.05, 0] };
  static clips = { equip, fire, reload };
  static fireInterval = 0.13;
  static handling = 1;
}
