/**
 * How the page plays once gameplay is on (`?play=1`): a Strategy the App asks every frame.
 * `LocalMode` runs a GameSession in the browser (single player, the behaviour before G8e);
 * `OnlineMode` draws what a server's GameSession sends and only predicts the local player's
 * movement. App, the level flow and the restart key talk to this interface only.
 *
 * DOM-free: subclasses that touch the page live in web/js/play/.
 */
export class GameMode {
  constructor() {
    if (new.target === GameMode) throw new TypeError('GameMode is abstract');
  }

  /** Whether the local PlayerController may walk this frame. */
  get canMove() {
    return false;
  }

  /** Whether the result screen is up and RESTART / Enter would do something. */
  get canRestart() {
    return false;
  }

  /** The pointer was locked: begin playing if this mode starts on a click. */
  start() {}

  /**
   * Once per animation frame, after the local player moved.
   * @param {number} dt  seconds, already clamped by App
   * @param {boolean} locked  whether the pointer is locked (the player is at the controls)
   */
  frame(dt, locked) {}

  /** True while level exits and obstacles must not react to the E key. */
  blocksLevelFlow() {
    return false;
  }

  dispose() {}
}
