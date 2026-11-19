import { Clip } from '../Clip.js';
import { WeaponView } from '../WeaponView.js';
import { ClipKit } from './ClipKit.js';

// ShotgunView: the pump shotgun (ShotgunModel). Parts: pump. Every shot is followed by a pump;
// the reload pushes shells in one at a time and racks the pump at the end.
const PUMP = 0.075;

const fire = ClipKit.shot({ seconds: 0.8, kick: 0.06, rise: 0.2, roll: -0.05, parts: {
  'pump.pos.z': [[0, 0], [0.32, 0], [0.42, PUMP, 'out'], [0.47, PUMP], [0.57, 0, 'in']],
  'gun.rot.y': [[0, 0], [0.3, 0], [0.42, 0.06, 'inOut'], [0.62, 0, 'inOut']],
} });

const SHELLS = 4;
const reloadTracks = {
  'gun.rot.z': [[0, 0], [0.2, -0.55, 'inOut'], [1.55, -0.55], [1.75, 0, 'inOut']],
  'gun.rot.x': [[0, 0], [0.2, 0.18, 'inOut'], [1.55, 0.18], [1.75, 0, 'inOut']],
  'gun.pos.y': [[0, 0], [0.2, 0.03, 'inOut'], [1.55, 0.03], [1.75, 0, 'inOut']],
  'pump.pos.z': [[0, 0], [1.78, 0], [1.86, PUMP, 'out'], [1.9, PUMP], [1.98, 0, 'in']],
};
// a small push up into the loading port for every shell
const push = [[0, 0], [0.25, 0]];
for (let i = 0; i < SHELLS; i++) {
  const start = 0.3 + i * 0.3;
  push.push([start + 0.08, 0.012, 'out'], [start + 0.16, -0.004, 'in'], [start + 0.28, 0, 'out']);
}
reloadTracks['gun.pos.x'] = push;
const reload = new Clip('reload', 2.05, reloadTracks,
  [...Array.from({ length: SHELLS }, (_, i) => [0.46 + i * 0.3, 'shell']), [1.86, 'pump']]);

export class ShotgunView extends WeaponView {
  static id = 'shotgun';
  static hold = { position: [0.12, -0.2, -0.46], rotation: [0.02, 0.03, 0] };
  static clips = { equip: ClipKit.raise({ seconds: 0.55 }), fire, reload };
  static fireInterval = 0;
  static handling = 0.7;
}
