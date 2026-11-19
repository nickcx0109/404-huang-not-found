import { ThrowableView } from './ThrowableView.js';
import { ClipKit } from './ClipKit.js';

// MolotovView: the fire bottle (MolotovModel). Parts: flame, which never stops licking.
export class MolotovView extends ThrowableView {
  static id = 'molotov';
  static hold = { position: [0.15, -0.21, -0.44], rotation: [0.15, -0.3, 0.12] };
  static clips = {
    equip: ClipKit.raise({ seconds: 0.45 }),
    fire: ClipKit.toss({ seconds: 0.75 }),
  };

  /** The rag's flame flickers and leans back against the way the bottle moves. */
  addHandling(channels, dt, time, motion) {
    super.addHandling(channels, dt, time, motion);
    const add = (channel, value) => {
      channels[channel] = (channels[channel] || 0) + value;
    };
    add('flame.rot.x', Math.sin(time * 13) * 0.12 + Math.sin(time * 29) * 0.05);
    add('flame.rot.z', Math.sin(time * 17 + 0.7) * 0.14);
    add('flame.pos.y', Math.sin(time * 23) * 0.002);
  }
}
