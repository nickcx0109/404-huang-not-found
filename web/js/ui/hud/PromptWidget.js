import { EVENTS } from '../../game/events.js';
import { HudWidget } from './HudWidget.js';

const PICKUP_PROMPT = 'weapon-pickup';
const ACTION_PROMPT = 'timed-action';

/**
 * Prompt, bottom centre: one small line of text ("HOLD E ...") and, when the action takes time,
 * a thin line that fills up. Anyone can show one by emitting EVENTS.PROMPT_CHANGED:
 *   { id, text, progress }   show or update; progress is 0..1, leave it out for no line
 *   { id, text: null }       take the prompt of that id away
 */
export class PromptWidget extends HudWidget {
  constructor(doc) {
    super(doc, 'prompt');
    this.text = this.part('div', 'hud-prompt__text');
    const line = this.part('div', 'hud-prompt__line');
    this.fill = this.part('i', 'hud-prompt__fill', line);
    this._id = null;
    this._text = null;
    this._progress = null;
    this._pickupText = null;
  }

  bind(events) {
    this.listen(events, EVENTS.PROMPT_CHANGED, detail => this.show(detail));
  }

  /**
   * Two prompts come from PlayerStatus instead of events: a timed action in progress (bandaging, with its
   * line filling up) and, when there is none, the weapon on the ground the player stands at.
   */
  sync(status) {
    if (status.action !== null) {
      this._pickupText = null;
      this.show({ id: ACTION_PROMPT, text: status.action, progress: status.actionProgress });
      return;
    }
    if (this._id === ACTION_PROMPT) this.show({ id: ACTION_PROMPT, text: null });
    const text = status.pickup === null ? null : status.pickupFull ? status.pickup + '  FULL' :
      (status.pickupSwap ? 'E  SWAP FOR ' : 'E  PICK UP ') + status.pickup;
    if (text === this._pickupText) return;
    this._pickupText = text;
    this.show({ id: PICKUP_PROMPT, text });
  }

  show({ id, text = null, progress = null }) {
    if (text === null) {
      // Only the one who put the prompt up can take it down.
      if (id !== this._id) return;
      this._id = null;
      this.el.classList.remove('is-on');
      return;
    }
    if (id !== this._id) {
      this._id = id;
      this.el.classList.add('is-on');
    }
    if (text !== this._text) {
      this._text = text;
      this.text.textContent = text;
    }
    const share = progress === null ? null : Math.min(1, Math.max(0, progress));
    if (share !== this._progress) {
      if ((share === null) !== (this._progress === null)) this.el.classList.toggle('has-line', share !== null);
      this._progress = share;
      if (share !== null) this.fill.style.transform = 'scaleX(' + share.toFixed(4) + ')';
    }
  }
}
