import { HudWidget } from './HudWidget.js';

/**
 * One quiet line at the top: wave, money and what the game is waiting for.
 * Temporary home for the text of the old GameplayHud panel until the event card and the prompt widgets exist.
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
    if (status.state === 'game-over') return 'YOU DIED   REFRESH TO RETRY';
    if (status.state === 'lobby') return 'CLICK TO START';
    const head = 'WAVE ' + status.wave + '   $' + status.money + '   ';
    if (status.state === 'wave-break') return head + 'NEXT WAVE IN ' + status.breakSeconds + '   E AT SHOP: AMMO $25';
    return head + status.enemies + ' LEFT';
  }
}
