import { ActionHandler } from './ActionHandlers.js';

/** A held E heartbeat contains no target or position: the server chooses both. */
export class InteractAction extends ActionHandler {
  constructor() { super('interact'); }
  handle({ levelFlow, playerId, message }) { levelFlow?.hold(playerId, message.holding); }
}
