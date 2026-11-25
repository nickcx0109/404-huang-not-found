import { CaptionView } from './CaptionView.js';

/**
 * Plays a CutsceneTimeline on a stage element: mounts each shot when its
 * time comes, moves it, and draws its typewriter captions with key clicks.
 * The player only talks to the Shot interface, never to a concrete type.
 */
export class CutscenePlayer {
  /**
   * @param {HTMLElement} stage
   * @param {import('./logic/CutsceneTimeline.js').CutsceneTimeline} timeline
   * @param {import('./ShotTypes.js').ShotTypes} shotTypes
   * @param {{ assetUrl: (file: string) => string, keyClick?: { play(): void } }} options
   */
  constructor(stage, timeline, shotTypes, { assetUrl, keyClick = null }) {
    this.stage = stage;
    this.timeline = timeline;
    this.keyClick = keyClick;
    this.shots = timeline.entries.map(entry => shotTypes.create(entry.spec, { assetUrl }));
    this.current = null; // { entry, shot, caption, keys }
    this.raf = 0;
    this.resolve = null;
  }

  /** Loads every picture first so no shot pops in half-drawn. */
  async preload() {
    const files = new Set(this.shots.flatMap(shot => shot.pictures));
    await Promise.all([...files].map(src => {
      const img = new Image();
      img.src = src;
      return img.decode().catch(() => {
        throw new Error(`Could not load cutscene picture ${src}`);
      });
    }));
  }

  /**
   * Plays from `from` seconds. Resolves with 'ended' or 'skipped'.
   * With `freeze`, draws that one moment and stays there (for screenshots).
   */
  play({ from = 0, freeze = false } = {}) {
    return new Promise(resolve => {
      this.resolve = resolve;
      if (freeze) {
        this.#render(from, false);
        return;
      }
      const startedAt = performance.now() - from * 1000;
      const frame = () => {
        const t = (performance.now() - startedAt) / 1000;
        if (!this.#render(t, true)) return this.#finish('ended');
        this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    });
  }

  skip() {
    this.#finish('skipped');
  }

  /** Draws time `t`; returns false once the cutscene is over. */
  #render(t, withSound) {
    const at = this.timeline.at(t);
    if (!at) return false;
    if (at.entry !== this.current?.entry) this.#show(at.entry);
    const { entry, shot, caption } = this.current;
    shot.update(at.local / entry.duration);
    if (caption) {
      const tw = entry.captions;
      caption.update(tw.at(at.local), tw.cursorOn(at.local));
      const keys = tw.keystrokes(at.local);
      if (withSound && keys > this.current.keys) this.keyClick?.play();
      this.current.keys = keys;
    }
    return true;
  }

  #show(entry) {
    this.#clear();
    const shot = this.shots[entry.index];
    shot.mount(this.stage);
    const caption = entry.captions ? new CaptionView(this.stage, { position: entry.spec.captions.position }) : null;
    this.current = { entry, shot, caption, keys: 0 };
  }

  #clear() {
    if (!this.current) return;
    this.current.shot.unmount();
    this.current.caption?.remove();
    this.current = null;
  }

  #finish(how) {
    if (!this.resolve) return;
    cancelAnimationFrame(this.raf);
    this.#clear();
    const resolve = this.resolve;
    this.resolve = null;
    resolve(how);
  }
}
