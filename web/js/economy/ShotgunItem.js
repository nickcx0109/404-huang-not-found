import { ShopItem } from './ShopItem.js';
import { Shotgun } from '../weapons/Shotgun.js';

export class ShotgunItem extends ShopItem {
  constructor() { super('shotgun', 100); }

  canBuy(player, ctx) {
    return super.canBuy(player, ctx) && !player.weapons.weapons.some(weapon => weapon.id === 'shotgun');
  }

  apply(player) {
    if (player.weapons.weapons.some(weapon => weapon.id === 'shotgun')) return false;
    player.weapons.add(new Shotgun());
    return true;
  }
}
