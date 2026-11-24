import { GameMode } from './GameMode.js';

/**
 * Holds the one GameMode the page plays in and swaps it: the old mode is disposed before the
 * new one is built, so two modes never own the HUD, the camera or the event bus at once.
 * Switching from inside the current mode (an online team leaving) is safe: the switch that
 * runs later wins and a mode disposed during the switch is never handed out.
 */
export class ModeSwitch {
  constructor() {
    this.current = null;
    this.disposed = false;
    this._switching = false;
  }

  /**
   * Disposes the current mode and makes `create()` the new one.
   * @param {() => GameMode} create
   * @returns {GameMode|null} the new mode (null after dispose())
   */
  use(create) {
    if (this.disposed) return null;
    if (this._switching) throw new Error('ModeSwitch.use called while a mode is being built');
    const previous = this.current;
    this.current = null;
    previous?.dispose();
    this._switching = true;
    let mode;
    try {
      mode = create();
    } finally {
      this._switching = false;
    }
    if (!(mode instanceof GameMode)) throw new TypeError('ModeSwitch needs a GameMode');
    this.current = mode;
    return mode;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const previous = this.current;
    this.current = null;
    previous?.dispose();
  }
}
