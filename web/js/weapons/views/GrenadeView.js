import { ThrowableView } from './ThrowableView.js';
import { ClipKit } from './ClipKit.js';

// GrenadeView: the hand grenade (GrenadeModel). Parts: pin (the ring is pulled before the throw).
export class GrenadeView extends ThrowableView {
  static id = 'grenade';
  static hold = { position: [0.12, -0.1, -0.34], rotation: [0.25, -0.4, 0.1] };
  static clips = {
    equip: ClipKit.raise({ seconds: 0.4 }),
    // the pin is pulled out to the left and falls away before the arm comes forward
    fire: ClipKit.toss({ seconds: 0.75, parts: {
      'pin.pos.x': [[0, 0], [0.08, 0], [0.2, -0.06, 'out'], [0.6, -0.06], [0.61, 0, 'step']],
      'pin.pos.y': [[0, 0], [0.08, 0], [0.2, -0.04, 'in'], [0.6, -0.2, 'in'], [0.61, 0, 'step']],
    } }),
  };
}
