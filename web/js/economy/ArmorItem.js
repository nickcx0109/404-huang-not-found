import { ShopItem } from './ShopItem.js';

export class ArmorItem extends ShopItem {
  constructor() { super('armor', 50); }

  canBuy(player, ctx) {
    return super.canBuy(player, ctx) && Boolean(player.armor?.canRefill);
  }

  apply(player) {
    if (!player.armor?.canRefill) return false;
    player.armor.refill();
    return true;
  }
}
