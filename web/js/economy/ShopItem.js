export class ShopItem {
  constructor(id, cost) {
    if (new.target === ShopItem) throw new TypeError('ShopItem is abstract');
    if (!id || !Number.isSafeInteger(cost) || cost < 0) throw new TypeError('Invalid shop item');
    this.id = id;
    this.cost = cost;
  }

  canBuy(player, ctx) {
    return player.wallet.canAfford(this.cost);
  }

  apply(player, ctx) {
    throw new Error('Implement ShopItem.apply');
  }
}
