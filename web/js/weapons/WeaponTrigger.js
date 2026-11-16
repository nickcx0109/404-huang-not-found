import { EVENTS } from '../game/events.js';

export class WeaponTrigger {
  constructor(ctx, ownerId) {
    this.context = ctx;
    this.ownerId = ownerId;
    this.held = false;
    this.request = Object.freeze({ ownerId });
  }

  press() {
    if (this.held) return;
    this.held = true;
    this.context.events.emit(EVENTS.FIRE_REQUESTED, this.request);
  }

  release() {
    this.held = false;
  }

  update() {
    if (!this.held) return;
    const player = this.context.players.find(player => player.id === this.ownerId);
    if (player?.weapons.current?.automatic) {
      this.context.events.emit(EVENTS.FIRE_REQUESTED, this.request);
    }
  }
}
