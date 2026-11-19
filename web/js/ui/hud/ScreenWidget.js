import { HudWidget } from './HudWidget.js';

export class ScreenWidget extends HudWidget {
  constructor(doc, name, command = null) {
    super(doc, name);
    this.el.className += ' hud-screen';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.command = command;
    this.panel = this.part('div', 'hud-screen-panel');
    this.title = this.part('h1', 'hud-screen-title', this.panel);
    this.summary = this.part('p', 'hud-screen-summary', this.panel);
    this.hint = this.part('p', 'hud-screen-hint', this.panel);
    this.button = this.part('button', 'hud-screen-action', this.panel);
    this.button.type = 'button';
    this.attention.pin(true);
    this._description = '';
  }

  bind(events) {
    if (this.command) this.button.onclick = () => events.emit(this.command);
  }

  get blocksStart() { return !this.el.hidden; }

  static describe(status) { return null; }

  sync(status) {
    const description = this.constructor.describe(status);
    const wasHidden = this.el.hidden;
    this.el.hidden = description === null;
    if (!description) return;
    const text = JSON.stringify(description);
    if (text !== this._description) {
      this._description = text;
      this.title.textContent = description.title;
      this.summary.textContent = description.summary;
      this.hint.textContent = description.hint;
      this.button.textContent = description.action;
      this.el.setAttribute('aria-label', description.title);
    }
    if (wasHidden) this.button.focus?.({ preventScroll: true });
  }

  dispose() {
    this.button.onclick = null;
    super.dispose();
  }
}
