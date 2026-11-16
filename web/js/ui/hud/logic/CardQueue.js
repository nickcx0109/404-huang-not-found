/**
 * Which announcement is on screen: one card at a time, each held for a while and then faded out.
 * Cards that arrive meanwhile wait their turn. No DOM.
 */
export class CardQueue {
  /** @param {{holdSeconds?: number, fadeSeconds?: number}} options */
  constructor({ holdSeconds = 2, fadeSeconds = 0.9 } = {}) {
    if (!(holdSeconds > 0) || !(fadeSeconds > 0)) throw new RangeError('Invalid card time');
    this.holdSeconds = holdSeconds;
    this.fadeSeconds = fadeSeconds;
    this._waiting = [];
    this._text = null;
    this._sticky = false;
    this._age = 0;
  }

  /**
   * @param {string} text
   * @param {{sticky?: boolean}} options  a sticky card pushes everything else aside and never fades (game over)
   */
  push(text, { sticky = false } = {}) {
    if (this._sticky) return;
    if (sticky) {
      this._waiting.length = 0;
      this._show(text, true);
    } else if (this._text === null) this._show(text, false);
    else this._waiting.push(text);
  }

  update(dt) {
    if (this._text === null || this._sticky) return;
    this._age += dt;
    if (this._age < this.holdSeconds + this.fadeSeconds) return;
    if (this._waiting.length > 0) this._show(this._waiting.shift(), false);
    else this._text = null;
  }

  /** Text of the card on screen, or null. */
  get text() {
    return this._text;
  }

  /** @returns {'hold'|'fade'|null}  fully visible, fading out, or nothing on screen */
  get phase() {
    if (this._text === null) return null;
    return this._sticky || this._age < this.holdSeconds ? 'hold' : 'fade';
  }

  _show(text, sticky) {
    this._text = text;
    this._sticky = sticky;
    this._age = 0;
  }
}
