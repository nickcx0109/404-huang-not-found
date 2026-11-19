import { EVENTS } from '../../game/events.js';
import { HudWidget } from './HudWidget.js';
import { CardQueue } from './logic/CardQueue.js';

/**
 * Event card, upper middle: a few words scrawled across the picture ("CLEAR"), held for two seconds,
 * then faded out. Cleared waves and game over are announced here; anything else can emit EVENTS.ANNOUNCED { text }.
 */
export class EventCard extends HudWidget {
  constructor(doc, { queue = new CardQueue() } = {}) {
    super(doc, 'card');
    this.queue = queue;
    this.text = this.part('div', 'hud-card__text');
    this._text = null;
    this._phase = null;
  }

  bind(events) {
    this.listen(events, EVENTS.WAVE_CLEARED, () => this.queue.push('CLEAR'));
    this.listen(events, EVENTS.GAME_OVER, () => this.queue.push('YOU DIED', { sticky: true }));
    this.listen(events, EVENTS.ANNOUNCED, detail => this.queue.push(String(detail.text)));
  }

  advance(dt) {
    this.queue.update(dt);
    const { text, phase } = this.queue;
    if (text !== this._text) {
      this._text = text;
      if (text !== null) this.text.textContent = text;
    }
    if (phase !== this._phase) {
      this._phase = phase;
      this.el.classList.toggle('is-on', phase === 'hold');
      this.el.classList.toggle('is-fading', phase === 'fade');
    }
  }
}
