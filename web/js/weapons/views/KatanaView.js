import { MeleeView } from './MeleeView.js';
import { ClipKit } from './ClipKit.js';
import { SwingClipState } from './SwingClipState.js';

// The first cut starts on the right. Each clip supplies the timing for its screen trail.
const SWEEP = 0.08;

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
    const { fire, fireBack } = this.constructor.clips;
    states.fire = new SwingClipState(this, [{ clip: fire, side: 1 }, { clip: fireBack, side: -1 }]);
    return states;
  }

  get swingCue() { return this.state === this.states.fire ? this.state.cue : null; }

  equip() {
    this.states.fire.reset();
    return super.equip();
  }

  fire(force = false, { hit } = {}) {
    if (!super.fire(force)) return false;
    this.states.fire.hit = hit != null;
    return true;
  }
}
