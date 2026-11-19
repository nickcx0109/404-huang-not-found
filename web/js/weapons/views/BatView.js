import { MeleeView } from './MeleeView.js';
import { ClipKit } from './ClipKit.js';

// BatView: the baseball bat (BatModel), carried up on the right shoulder and swung across to
// the lower left.
export class BatView extends MeleeView {
  static id = 'bat';
  static hold = { position: [0.12, -0.27, -0.45], rotation: [0.95, -0.55, 0] };
  static clips = {
    equip: ClipKit.raise({ seconds: 0.45, tilt: 0.6 }),
    fire: ClipKit.swing({ seconds: 0.6, windup: 0.12, sweep: 0.12, from: [0.25, -0.35, -0.3], to: [-0.95, 1.25, 0.6], reach: 0.1 }),
  };
  static handling = 0.8;
}
