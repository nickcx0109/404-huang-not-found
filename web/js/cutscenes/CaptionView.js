/** Seconds of glitch when a caption line appears and before it is wiped. */
const GLITCH_SECONDS = 0.22;

/**
 * Draws Typewriter output: monospace caption at the bottom centre with a
 * block cursor, and an RGB-split glitch when a line appears or leaves.
 */
export class CaptionView {
  /** @param {{ position?: 'bottom' | 'center' }} options */
  constructor(stage, { position = 'bottom' } = {}) {
    this.root = document.createElement('div');
    this.root.className = `caption caption--${position === 'center' ? 'center' : 'bottom'}`;
    this.text = document.createElement('span');
    this.text.className = 'text';
    this.cursor = document.createElement('span');
    this.cursor.className = 'cursor';
    this.cursor.textContent = '▌';
    this.root.append(this.text, this.cursor);
    stage.append(this.root);
    this.shown = '';
  }

  /** @param {ReturnType<import('./logic/Typewriter.js').Typewriter['at']>} state */
  update(state, cursorOn) {
    if (state.text !== this.shown) {
      this.text.textContent = state.text;
      this.text.dataset.text = state.text; // for the colour-split copies in CSS
      this.shown = state.text;
    }
    const glitch = state.index >= 0 && (state.fresh < GLITCH_SECONDS || state.clearsIn < GLITCH_SECONDS);
    this.root.classList.toggle('glitch', glitch);
    this.root.classList.toggle('empty', state.index < 0);
    this.cursor.style.visibility = cursorOn ? 'visible' : 'hidden';
  }

  remove() {
    this.root.remove();
  }
}
