import { ClipState } from '../WeaponView.js';

/** Plays alternating cuts and reads the screen trail's timing from the active clip. */
export class SwingClipState extends ClipState {
  constructor(view, swings) {
    super(view, swings[0].clip);
    this.swings = swings.map(({ clip, side }) => {
      const marker = name => {
        const event = clip.events.find(e => e.name === name);
        if (!event) throw new Error('Clip "' + clip.name + '" needs a "' + name + '" marker');
        return event.time;
      };
      const start = marker('swing');
      const end = marker('cut');
      if (!(end > start)) throw new RangeError('Clip "' + clip.name + '": "cut" must come after "swing"');
      return { clip, side, start, sweepSeconds: end - start };
    });
    this.swing = this.swings[0];
    this._advanced = false;
    this.reset();
  }

  reset() {
    this.next = 0;
    this.hit = false;
  }

  restart() {
    this.swing = this.swings[this.next];
    this.clip = this.swing.clip;
    this._advanced = false;
    super.restart();
  }

  update(dt) {
    super.update(dt);
    // The next cut alternates only once this one has started; a cancelled wind-up keeps its side.
    if (!this._advanced && this.time >= this.swing.start) {
      this._advanced = true;
      this.next = (this.next + 1) % this.swings.length;
    }
  }

  get cue() {
    const { side, start, sweepSeconds } = this.swing;
    if (this.time < start) return null;
    return { weaponId: this.view.id, side, sweepSeconds, elapsed: this.time - start, hit: this.hit };
  }
}
