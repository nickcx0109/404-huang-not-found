import { ShopItem } from './ShopItem.js';

export class HealthItem extends ShopItem {
  constructor() { super('health', 25); }

  canBuy(player, ctx) {
    const health = player.damageable;
    return super.canBuy(player, ctx) && health.alive && health.health < health.maxHealth;
  }

  apply(player) {
    const health = player.damageable;
    if (!health.alive || health.health >= health.maxHealth) return false;
    health.health = Math.min(health.maxHealth, health.health + 50);
    return true;
  }
}
