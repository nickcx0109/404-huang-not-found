import { EVENTS } from '../../../web/js/game/events.js';

/**
 * Turns one validated `action` message into the session's own input command
 * (docs/tech/NETWORK.md, Client → Server). Each `kind` has one small handler class;
 * ActionRegistry picks it by name, so adding a kind never touches the others.
 *
 * `seat` is what a handler may use: { session, playerId, controller, message, now, rewind }.
 */
export class ActionHandler {
  constructor(kind) {
    if (new.target === ActionHandler) throw new TypeError('ActionHandler is abstract');
    this.kind = kind;
  }

  handle(seat) {
    throw new Error('Implement ActionHandler.handle');
  }
}

/** Emits one `*_REQUESTED` command carrying the owner and the fields `detail(message)` adds. */
export class RequestAction extends ActionHandler {
  constructor(kind, eventName) {
    super(kind);
    this.eventName = eventName;
  }

  detail(message) {
    return {};
  }

  handle({ session, playerId, message }) {
    session.context.events.emit(this.eventName, { ownerId: playerId, ...this.detail(message) });
  }
}

/**
 * A command that depends on where the player stands (picking up, reaching a teammate): the player's
 * position gets the last accepted input first, as the next simulation step would copy it anyway.
 */
export class PositionedAction extends RequestAction {
  handle(seat) {
    const player = seat.session.playerById(seat.playerId);
    if (player) {
      player.position.x = seat.controller.x;
      player.position.y = seat.controller.y;
      player.position.z = seat.controller.z;
    }
    super.handle(seat);
  }
}

/** A command that needs the player's view: the shared aim gets this player's last accepted pose first. */
export class AimedAction extends PositionedAction {
  handle(seat) {
    seat.controller.aimInto(seat.session.context.aim);
    super.handle(seat);
  }
}

/** `fire`: aims, then judges the shot with the enemies where the shooter saw them (ShotRewind). */
export class FireAction extends AimedAction {
  constructor() {
    super('fire', EVENTS.FIRE_REQUESTED);
  }

  handle(seat) {
    seat.rewind.run(seat.session.context.enemies, seat.message.at, seat.now, () => super.handle(seat));
  }
}

/** `switch`: slot `index`. */
export class SwitchAction extends RequestAction {
  constructor() {
    super('switch', EVENTS.SWITCH_REQUESTED);
  }

  detail({ index }) {
    return { index };
  }
}

/** `cycle`: one slot forward or back (`step` ±1). */
export class CycleAction extends RequestAction {
  constructor() {
    super('cycle', EVENTS.CYCLE_REQUESTED);
  }

  detail({ step }) {
    return { step };
  }
}

/** `revive`: holding or letting go of the revive key; the session's ReviveInteraction does the rest. */
export class ReviveAction extends ActionHandler {
  constructor() {
    super('revive');
  }

  handle({ session, playerId, message }) {
    session.revives.hold(playerId, message.holding);
  }
}
