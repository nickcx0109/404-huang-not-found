import { ClipState } from '../WeaponView.js';

/** Plays alternating cuts and reads the screen trail's timing from the active clip. */
export class SwingClipState extends ClipState {
  constructor(view, swings) {
    super(view, swings[0].clip);
    this.swings = swings.map(({ clip, side }) => {
      const start = clip.events.find(event => event.name === 'swing').time;
      const end = clip.events.find(event => event.name === 'cut').time;
      return { clip, side, start, sweepSeconds: end - start };
    });
    this.reset();
  }

  reset() {
    this.next = 0;
    this.hit = false;
  }

  restart() {
    this.swing = this.swings[this.next];
    this.clip = this.swing.clip;
    super.restart();
  }

  update(dt) {
    const before = this.time;
    super.update(dt);
    if (before < this.swing.start && this.time >= this.swing.start) {
      this.next = (this.next + 1) % this.swings.length;
    }
  }

  get cue() {
    const { side, start, sweepSeconds } = this.swing;
    if (this.time < start) return null;
    return { weaponId: this.view.id, side, sweepSeconds, elapsed: this.time - start, hit: this.hit };
  }
}
