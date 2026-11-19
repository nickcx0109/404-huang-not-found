/**
 * What a level asks of the players before they win (Strategy, one per level).
 * The session calls update() every simulation step while players can move; the objective
 * calls session.win() when it is met. Losing stays the session's job (everyone down).
 */
export class Objective {
  constructor() {
    if (new.target === Objective) throw new TypeError('Objective is abstract');
  }

  /** One line for the start screen, e.g. 'HOLD THE GATE UNTIL IT OPENS'. */
  get goal() { return 'SURVIVE THE WAVES'; }

  /** Plain HUD record { label, seconds } while there is something to show, otherwise null. */
  get status() { return null; }

  /** @param {number} dt  @param {import('../GameSession.js').GameSession} session */
  update(dt, session) {}
}
