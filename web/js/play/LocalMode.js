import { GameMode } from '../game/modes/GameMode.js';
import { GameplayLifecycle } from '../game/GameplayLifecycle.js';
import { createGameplayRun } from '../game/installGameplay.js';
import { CarryOverState } from '../game/CarryOverState.js';

/**
 * Single player: the GameSession runs in this page, exactly as before online play existed.
 * The run (session, HUD, views, audio, first-person weapon) is built by createGameplayRun and
 * rebuilt in place on RESTART by GameplayLifecycle; `app.game` stays the running session.
 */
export class LocalMode extends GameMode {
  /**
   * @param {App} app
   * @param {object} [runOptions]  passed to createGameplayRun (e.g. the lobby screen to use)
   * @param {CarryOverState|null} [arrival]  what the player brought from the previous level; only the
   *   first run gets it, a restart starts fresh
   */
  constructor(app, runOptions = {}, arrival = null) {
    super();
    this.app = app;
    let carryOver = arrival;
    this.lifecycle = new GameplayLifecycle(app.events, () => {
      const run = createGameplayRun(app, { ...runOptions, carryOver });
      carryOver = null;
      return run;
    });
  }

  get session() {
    return this.app.game;
  }

  get canMove() {
    return this.app.game.canMove;
  }

  get canRestart() {
    return this.app.game.canRestart;
  }

  start() {
    this.app.game.start();
  }

  /** Restarts at once, whatever the state (debug only; the result screen goes through RESTART). */
  restart() {
    return this.lifecycle.restart();
  }

  frame(dt, locked) {
    if (!locked) return; // Esc pauses the game clock
    const app = this.app;
    app.combat.update(dt);
    app.game.update(dt);
    app.hud.updateGame(dt, app.game);
    // Views that move every frame (thrown objects, fire, ammo boxes); set up by createGameplayRun.
    for (const view of app.gameViews ?? []) view.update(dt);
  }

  blocksLevelFlow() {
    const game = this.app.game;
    const local = game.context.players[0];
    return !game.canMove || !local?.damageable.alive || Boolean(game.revives.targetFor(local));
  }

  carryOver() {
    return CarryOverState.capture(this.app.game.context.players[0]);
  }

  dispose() {
    this.lifecycle.dispose();
    this.app.game = null;
  }
}
