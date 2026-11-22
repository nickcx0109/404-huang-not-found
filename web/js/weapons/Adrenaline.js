import { CarriedItem } from './CarriedItem.js';

/** Slot 7; instant use, refreshes ten seconds of player-owned stat modifiers. */
export class Adrenaline extends CarriedItem {
  constructor({ count = 1 } = {}) { super({ id: 'adrenaline', count, maxCount: 1 }); }
  get slot() { return 'booster'; }
  fire(ctx) {
    const owner = ctx.players.find(player => player.id === this.ownerId);
    if (this.depleted || !owner?.damageable.alive || owner.disposed) return false;
    // Settle elapsed reload work before replacing an active interval.
    owner.weapons.update(0, ctx);
    owner.effects.refresh(this.id, 10, { reloadRate: 2, movementSpeed: 1.3 }, ctx.time);
    owner.syncStats(ctx.time);
    this.consume();
    return true;
  }
}
