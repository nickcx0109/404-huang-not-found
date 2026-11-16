import { EVENTS } from '../game/events.js';

export class Economy {
  reward(player, amount) {
    player.wallet.credit(amount);
  }

  purchase(item, player, ctx) {
    if (!item.canBuy(player, ctx) || !player.wallet.spend(item.cost)) return false;
    let applied;
    try {
      applied = item.apply(player, ctx);
    } catch (error) {
      player.wallet.credit(item.cost);
      throw error;
    }
    if (applied !== true) {
      player.wallet.credit(item.cost);
      return false;
    }
    ctx.events.emit(EVENTS.ITEM_PURCHASED, { ownerId: player.id, itemId: item.id, cost: item.cost });
    return true;
  }
}
