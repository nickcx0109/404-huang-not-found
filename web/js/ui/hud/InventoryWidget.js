import { EVENTS } from '../../game/events.js';
import { HudWidget } from './HudWidget.js';

/**
 * Inventory, down the right edge: one row per slot with its number key and the outline of what is in it.
 * The slot in hand is bright and marked with brush corners; empty slots are dim; stackable items show
 * how many are left. Icons are CSS masks chosen by item id (`hud-inventory__icon--<id>` in hud.css),
 * so a new item only needs a mask there; an id without one falls back to its name in type.
 */
export class InventoryWidget extends HudWidget {
  constructor(doc) {
    super(doc, 'inventory', { holdSeconds: 2.5 });
    this.rows = [];
    this._selected = -2;
  }

  bind(events, playerId) {
    const mine = detail => { if (detail.ownerId === playerId) this.attention.poke(); };
    this.listen(events, EVENTS.WEAPON_CHANGED, mine);
    this.listen(events, EVENTS.WEAPON_PICKED_UP, mine);
  }

  sync(status) {
    const slots = status.slots;
    if (slots.length !== this.rows.length) this._build(slots.length);
    let changed = false;
    for (let index = 0; index < slots.length; index++) {
      const { id, count, charge = null } = slots[index];
      const row = this.rows[index];
      if (id !== row.id) {
        if (row.id !== null) row.icon.classList.remove('hud-inventory__icon--' + row.id);
        row.id = id;
        if (id !== null) row.icon.classList.add('hud-inventory__icon--' + id);
        row.icon.textContent = id === null ? '' : id.toUpperCase();
        row.el.classList.toggle('is-empty', id === null);
        changed = true;
      }
      if (count !== row.count || charge !== row.charge) {
        row.count = count;
        row.charge = charge;
        row.amount.textContent = count !== null ? '×' + count : charge !== null ? charge + '%' : '';
        changed = true;
      }
    }
    if (status.selected !== this._selected) {
      this.rows[this._selected]?.el.classList.remove('is-selected');
      this._selected = status.selected;
      this.rows[this._selected]?.el.classList.add('is-selected');
      changed = true;
    }
    if (changed) this.attention.poke();
  }

  _build(count) {
    for (const row of this.rows) row.el.remove();
    this.rows = [];
    for (let index = 0; index < count; index++) {
      const el = this.part('div', 'hud-inventory__row');
      el.classList.add('is-empty');
      this.part('span', 'hud-inventory__key', el).textContent = String(index + 1);
      const icon = this.part('i', 'hud-inventory__icon', el);
      const amount = this.part('span', 'hud-inventory__count', el);
      this.rows.push({ el, icon, amount, id: null, count: null, charge: null });
    }
    this._selected = -2;
  }
}
