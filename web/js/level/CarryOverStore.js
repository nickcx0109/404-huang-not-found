import { CarryOverState } from '../game/CarryOverState.js';

/** The page's sessionStorage, or null where reading it throws (blocked storage, sandboxed frames). */
function pageStorage() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch (error) {
    return null;
  }
}

/**
 * Keeps one CarryOverState in sessionStorage across the page load that changes level. `save` names
 * the level it is meant for; `take` hands it out once, only on that level, and forgets it, so a
 * restart or a later reload starts fresh. Storage that is missing, full or broken only means the
 * state is not carried: nothing here throws.
 */
export class CarryOverStore {
  static KEY = 'level-flow:carry-over';

  /** @param {Storage|null} [storage]  getItem / setItem / removeItem; defaults to sessionStorage */
  constructor(storage = pageStorage()) {
    this.storage = storage;
  }

  /** @returns {boolean} whether it was written */
  save(level, state) {
    try {
      this.storage.setItem(CarryOverStore.KEY, JSON.stringify({ level, state }));
      return true;
    } catch (error) {
      return false;
    }
  }

  /** @returns {CarryOverState|null} the state saved for `level`, removed from storage either way */
  take(level) {
    let text = null;
    try {
      text = this.storage.getItem(CarryOverStore.KEY);
      this.storage.removeItem(CarryOverStore.KEY);
    } catch (error) {
      return null;
    }
    try {
      const saved = JSON.parse(text);
      return saved?.level === level ? CarryOverState.fromJSON(saved.state) : null;
    } catch (error) {
      return null;
    }
  }
}
