import { Clip } from '../Clip.js';
import { MeleeView } from './MeleeView.js';
import { ClipKit } from './ClipKit.js';

// ChainsawView: the chainsaw (ChainsawModel), held low on the right. The engine shakes it all the
// time; while the button is held every cut pushes it forward and runs the chain.
export class ChainsawView extends MeleeView {
  static id = 'chainsaw';
  static hold = { position: [0.22, -0.32, -0.6], rotation: [0.1, 0.14, 0.05] };
  static clips = {
    equip: ClipKit.raise({ seconds: 0.55 }),
    fire: new Clip('fire', 0.1, {
      'gun.pos.z': [[0, -0.02], [0.05, -0.028, 'out'], [0.1, -0.02, 'in']],
      'gun.pos.y': [[0, 0.004], [0.03, -0.002], [0.07, 0.005], [0.1, 0.004]],
      'gun.rot.z': [[0, 0.01], [0.04, -0.012], [0.08, 0.01], [0.1, 0.01]],
      'chain.pos.z': [[0, 0], [0.1, -0.03]],
    }, [[0, 'cut']]),
  };
  static handling = 0.6;

  /** The idling engine: a fast, small shake on top of the usual sway. */
  addHandling(channels, dt, time, motion) {
    super.addHandling(channels, dt, time, motion);
    channels['gun.pos.y'] = (channels['gun.pos.y'] || 0) + Math.sin(time * 61) * 0.0012;
    channels['gun.rot.z'] = (channels['gun.rot.z'] || 0) + Math.sin(time * 47 + 1.3) * 0.003;
  }
}
