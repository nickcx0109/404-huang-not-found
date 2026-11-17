import { ShopItem } from './ShopItem.js';
import { Rifle } from '../weapons/Rifle.js';

export class RifleItem extends ShopItem {
  constructor() { super('rifle', 75); }

  canBuy(player, ctx) {
    return super.canBuy(player, ctx) && !player.weapons.weapons.some(weapon => weapon.id === 'rifle');
  }

  apply(player) {
    if (player.weapons.weapons.some(weapon => weapon.id === 'rifle')) return false;
    player.weapons.add(new Rifle());
    return true;
  }
}
