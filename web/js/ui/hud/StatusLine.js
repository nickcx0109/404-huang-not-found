import { HudWidget } from './HudWidget.js';

/**
 * One quiet line at the top: what the game is waiting for
 * (the facts the player looks up now and then; moments are announced by EventCard).
 */
export class StatusLine extends HudWidget {
  constructor(doc) {
    super(doc, 'status', { holdSeconds: 4 });
    this._text = '';
  }

  sync(status) {
    const text = StatusLine.describe(status);
    if (text === this._text) return;
    this._text = text;
    this.el.textContent = text;
    this.attention.poke();
  }

  /** The line for a status, as plain text. */
  static describe(status) {
    if (status.state === 'game-over') return 'REFRESH TO RETRY';
    if (status.state === 'lobby') return 'CLICK TO START';
    if (status.state === 'wave-break') return 'NEXT WAVE IN ' + status.breakSeconds;
    return status.enemies + ' LEFT';
  }
}
