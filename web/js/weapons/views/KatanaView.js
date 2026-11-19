import { ClipState } from '../WeaponView.js';
import { MeleeView } from './MeleeView.js';
import { ClipKit } from './ClipKit.js';

// KatanaView: the katana (KatanaModel), held up and to the right. Cuts go back and forth: the
// first from right to left, the next from left to right, in step with the blade light on the
// screen (ui/hud/SlashWidget, whose SlashTrail also flips side every cut). The cut itself takes
// as long as the light's sweep (SlashStyles: 0.08 seconds).
const SWEEP = 0.08;

/** Plays the cut clips in turn, one per swing. */
export class AlternatingClipState extends ClipState {
  constructor(view, clips) {
    super(view, clips[clips.length - 1]);
    this.clips = clips;
    this.turn = -1;
  }

  restart() {
    this.turn = (this.turn + 1) % this.clips.length;
    this.clip = this.clips[this.turn];
    super.restart();
  }
}

export class KatanaView extends MeleeView {
  static id = 'katana';
  static hold = { position: [0.17, -0.2, -0.36], rotation: [0.55, 0.18, -0.5] };
  static clips = {
    equip: ClipKit.raise({ seconds: 0.5, tilt: 0.7 }),
    // right to left, falling a little
    fire: ClipKit.swing({ seconds: 0.4, windup: 0.06, sweep: SWEEP, from: [0.15, -0.5, -0.25], to: [-0.45, 1.15, 0.55] }),
    // left to right, the blade turned over
    fireBack: ClipKit.swing({ name: 'fireBack', seconds: 0.4, windup: 0.06, sweep: SWEEP, from: [-0.2, 0.95, 0.9], to: [-0.3, -0.6, 2.3] }),
  };
  static handling = 0.85;

  createStates() {
    const states = super.createStates();
    states.fire = new AlternatingClipState(this, [this.constructor.clips.fire, this.constructor.clips.fireBack]);
    return states;
  }
}
