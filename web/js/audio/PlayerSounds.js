import { EVENTS } from '../game/events.js';
import { SoundRule } from './SoundRule.js';

/** What happens to the local player: getting hurt, healed, throwing. Pickups are PickupSounds. */
export class PlayerSounds extends SoundRule {
  constructor(events, playerId) {
    super(events);
    this.playerId = playerId;
  }

  subscribe() {
    this.listen(EVENTS.ENTITY_DAMAGED, ({ entity, amount }) => {
      if (entity.id === this.playerId && amount > 0) this.board.play('hurt');
    });
    this.listen(EVENTS.ENTITY_HEALED, ({ entity }) => {
      if (entity.id === this.playerId) this.board.play('heal');
    });
    this.listen(EVENTS.ITEM_THROWN, ({ ownerId }) => {
      if (ownerId === this.playerId) this.board.play('throw');
    });
  }
}
