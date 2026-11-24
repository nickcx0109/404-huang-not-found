import { InteractAction } from './InteractAction.js';
import { EVENTS } from '../../../web/js/game/events.js';
import {
  ActionHandler, RequestAction, PositionedAction, AimedAction, FireAction, SwitchAction, CycleAction, ReviveAction,
} from './ActionHandlers.js';

/** Action handlers by `kind`; an unknown kind is ignored (the message schema already rejects them). */
export class ActionRegistry {
  constructor(handlers = []) {
    this.handlers = new Map();
    for (const handler of handlers) this.register(handler);
  }

  /** Every kind in docs/tech/NETWORK.md. */
  static standard() {
    return new ActionRegistry([
      new FireAction(),
      new RequestAction('reload', EVENTS.RELOAD_REQUESTED),
      new AimedAction('secondary', EVENTS.SECONDARY_REQUESTED),
      new SwitchAction(),
      new CycleAction(),
      new PositionedAction('pickup', EVENTS.PICKUP_REQUESTED),
      new ReviveAction(),
      new InteractAction(),
    ]);
  }

  register(handler) {
    if (!(handler instanceof ActionHandler)) throw new TypeError('Register an ActionHandler');
    if (this.handlers.has(handler.kind)) throw new Error('Duplicate action kind: ' + handler.kind);
    this.handlers.set(handler.kind, handler);
    return this;
  }

  has(kind) {
    return this.handlers.has(kind);
  }

  /** Runs the handler for `seat.message.kind`; false when there is none. */
  dispatch(seat) {
    const handler = this.handlers.get(seat.message.kind);
    if (!handler) return false;
    handler.handle(seat);
    return true;
  }
}
