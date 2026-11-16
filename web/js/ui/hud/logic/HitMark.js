/**
 * The small cross that confirms a hit, and its red version for a kill. No DOM.
 * A kill is not replaced by an ordinary hit while it is still showing.
 */
export class HitMark {
  constructor({ hitSeconds = 0.16, killSeconds = 0.45 } = {}) {
    if (!(hitSeconds > 0) || !(killSeconds > 0)) throw new RangeError('Invalid mark time');
    this.hitSeconds = hitSeconds;
    this.killSeconds = killSeconds;
    this._kind = null;
    this._left = 0;
  }

  hit() {
    if (this._kind === 'kill') return;
    this._kind = 'hit';
    this._left = this.hitSeconds;
  }

  kill() {
    this._kind = 'kill';
    this._left = this.killSeconds;
  }

  update(dt) {
    if (this._kind === null) return;
    this._left -= dt;
    if (this._left <= 0) this._kind = null;
  }

  /** @returns {'hit'|'kill'|null} */
  get kind() {
    return this._kind;
  }
}
