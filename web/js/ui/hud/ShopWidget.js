import { HudWidget } from './HudWidget.js';
import { EVENTS } from '../../game/events.js';

/** Shop reads only plain status records and sends purchase commands to the authority. */
export class ShopWidget extends HudWidget {
  constructor(doc) {
    super(doc, 'shop');
    this.el.hidden = true;
    this.el.setAttribute('role', 'region');
    this.el.setAttribute('aria-label', 'Shop');
    this.title = this.part('div', 'hud-shop__title');
    this.title.textContent = 'SUPPLY CACHE';
    this.balance = this.part('div', 'hud-shop__balance');
    this.list = this.part('div', 'hud-shop__list');
    this.notice = this.part('div', 'hud-shop__notice');
    this.notice.setAttribute('aria-live', 'polite');
    this.help = this.part('div', 'hud-shop__help');
    this.help.textContent = '1-5 / CLICK TO BUY   E / ESC TO CLOSE';
    this.rows = [];
    this._open = false;
  }

  bind(events, playerId) {
    this.events = events;
    this.playerId = playerId;
    this.listen(events, EVENTS.ITEM_PURCHASED, ({ ownerId, itemId }) => {
      if (ownerId === playerId) this.notice.textContent = 'PURCHASED: ' + itemId.toUpperCase();
    });
  }

  sync(status) {
    const open = Boolean(status.shopOpen);
    if (open !== this._open) {
      this._open = open;
      this.el.hidden = !open;
      this.attention.pin(open);
      this.notice.textContent = '';
      this.events.emit(EVENTS.PROMPT_CHANGED, { id: 'shop', text: null });
    }
    const prompt = !open && status.shopAvailable;
    if (prompt !== this._prompt) {
      this._prompt = prompt;
      this.events.emit(EVENTS.PROMPT_CHANGED, { id: 'shop', text: prompt ? 'E   OPEN SHOP' : null });
    }
    if (!open) return;
    const summary = '$' + status.money + '   ARMOR ' + status.armor + '   NEXT WAVE IN ' + status.breakSeconds;
    if (this.balance.textContent !== summary) this.balance.textContent = summary;
    for (let index = 0; index < status.shopItems.length; index++) {
      const item = status.shopItems[index];
      let row = this.rows[index];
      if (!row) {
        const button = this.part('button', 'hud-shop__item', this.list);
        button.type = 'button';
        row = { button, itemId: item.id, label: this.part('span', 'hud-shop__label', button),
          detail: this.part('span', 'hud-shop__detail', button) };
        button.onclick = () => this.events.emit(EVENTS.PURCHASE_REQUESTED, { ownerId: this.playerId, itemId: row.itemId });
        this.rows.push(row);
      }
      row.itemId = item.id;
      const label = (index + 1) + '   ' + item.name.toUpperCase() + '   $' + item.cost;
      const detail = item.description + ' / ' + item.reason;
      if (row.label.textContent !== label) row.label.textContent = label;
      if (row.detail.textContent !== detail) row.detail.textContent = detail;
      if (row.button.disabled !== !item.available) row.button.disabled = !item.available;
    }
    while (this.rows.length > status.shopItems.length) this.rows.pop().button.remove();
  }

  dispose() {
    for (const row of this.rows) row.button.onclick = null;
    this.events.emit(EVENTS.PROMPT_CHANGED, { id: 'shop', text: null });
    super.dispose();
  }
}
