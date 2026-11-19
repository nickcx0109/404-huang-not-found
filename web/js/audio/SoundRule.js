/**
 * One group of sounds that follows the game through events. Subclasses subscribe in `subscribe` with
 * `this.listen(...)` and call `this.board.play(...)`; nothing in weapons, enemies or the session knows
 * that sound exists. Adding a new group of sounds is a new subclass installed on the board.
 */
export class SoundRule {
  constructor(events) {
    if (new.target === SoundRule) throw new TypeError('SoundRule is abstract');
    this.events = events;
    this.board = null;
    this._unsubscribers = [];
  }

  attach(board) {
    if (this.board) throw new Error('A sound rule can only be installed once');
    this.board = board;
    this.subscribe();
  }

  /** Subclasses add their listeners here. */
  subscribe() {
    throw new Error('Implement SoundRule.subscribe');
  }

  listen(event, listener) {
    this._unsubscribers.push(this.events.on(event, listener));
  }

  /** Called every frame with the board's clock already advanced. */
  update(dt) {}

  dispose() {
    for (const unsubscribe of this._unsubscribers) unsubscribe();
    this._unsubscribers.length = 0;
  }
}
