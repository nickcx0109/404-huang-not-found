import { EVENTS } from '../game/events.js';
import { SoundRule } from './SoundRule.js';

/**
 * What the local player's hands sound like taking things from the ground: each weapon id is registered
 * with its cue (a gun's metal clack, a bag rustling for supplies); anything not registered uses
 * `fallback`. Topping up at an ammo box has its own cue.
 */
export class PickupSounds extends SoundRule {
  constructor(events, playerId, { fallback = 'pickup_item', refill = 'ammo_refill' } = {}) {
    super(events);
    this.playerId = playerId;
    this.fallback = fallback;
    this.refill = refill;
    this.table = new Map();
  }

  register(weaponIds, cue) {
    for (const id of [].concat(weaponIds)) this.table.set(id, cue);
    return this;
  }

  subscribe() {
    this.listen(EVENTS.WEAPON_PICKED_UP, ({ ownerId, weaponId }) => {
      if (ownerId === this.playerId) this.board.play(this.table.get(weaponId) ?? this.fallback);
    });
    this.listen(EVENTS.AMMO_REFILLED, ({ ownerId }) => {
      if (ownerId === this.playerId) this.board.play(this.refill);
    });
  }
}
