import { HudWidget } from './HudWidget.js';

/** The level's countdown under the status line, e.g. "GATE OPENS IN 2:35". Hidden when the level has none. */
export class ObjectiveWidget extends HudWidget {
  constructor(doc) {
    super(doc, 'objective');
    this.attention.pin(true);
    this.el.hidden = true;
    this._text = null;
  }

  sync(status) {
    const text = ObjectiveWidget.describe(status);
    if (text === this._text) return;
    this._text = text;
    this.el.hidden = text === null;
    this.el.textContent = text ?? '';
  }

  /** The line for a status, or null when nothing is shown (no objective, or not in a run). */
  static describe(status) {
    const objective = status.objective;
    if (!objective || (status.state !== 'playing' && status.state !== 'wave-break')) return null;
    return objective.label + ' ' + ObjectiveWidget.clock(objective.seconds);
  }

  /** 155 -> "2:35". */
  static clock(seconds) {
    const whole = Math.max(0, Math.ceil(seconds));
    return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
  }
}
