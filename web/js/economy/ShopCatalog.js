import { ShopItem } from './ShopItem.js';

/** Registry of polymorphic items and their presentation metadata. No product switches. */
export class ShopCatalog {
  constructor() { this.entries = new Map(); }

  register(item, { name = item.id, description = '', unavailableReason = 'Conditions not met' } = {}) {
    if (!(item instanceof ShopItem) || this.entries.has(item.id)) throw new TypeError('Invalid or duplicate shop item');
    this.entries.set(item.id, { item, name, description, unavailableReason });
    return this;
  }

  get(id) { return this.entries.get(id)?.item; }

  /** Reuse caller-owned plain records; widgets never receive player/item references. */
  readInto(rows, player, ctx) {
    let index = 0;
    for (const entry of this.entries.values()) {
      const { item } = entry;
      const row = rows[index] ?? (rows[index] = {});
      row.id = item.id;
      row.name = entry.name;
      row.description = entry.description;
      row.cost = item.cost;
      row.available = item.canBuy(player, ctx);
      row.reason = row.available ? 'BUY' : !player.wallet.canAfford(item.cost) ? 'Not enough money' : entry.unavailableReason;
      index++;
    }
    rows.length = index;
    return rows;
  }
}
