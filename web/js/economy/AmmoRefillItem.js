import { ShopItem } from './ShopItem.js';

export class AmmoRefillItem extends ShopItem {
  constructor() {
    super('ammo-refill', 25);
  }

  canBuy(player, ctx) {
    return super.canBuy(player, ctx) && Boolean(player.weapons.current?.canRefill);
  }

  apply(player, ctx) {
    if (!player.weapons.current?.canRefill) return false;
    player.weapons.current.refill();
    return true;
  }
}
