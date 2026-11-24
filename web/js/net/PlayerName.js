export const PLAYER_NAME_MAX = 24;
const STORE_KEY = 'net:player-name';

/**
 * The name shown to teammates, remembered between visits. The store is injected (localStorage
 * in the browser) and every access is guarded: private windows and blocked storage throw, and
 * then the name just is not remembered.
 */
export class PlayerName {
  /**
   * @param {{getItem(key: string): string|null, setItem(key: string, value: string): void}|null} storage
   * @param {{key?: string, fallback?: string}} [options]
   */
  constructor(storage, { key = STORE_KEY, fallback = 'PLAYER' } = {}) {
    this.storage = storage;
    this.key = key;
    this.fallback = fallback;
  }

  /** Trimmed and cut to what the server accepts (1-24 characters); '' when nothing is left. */
  static normalize(text) {
    return String(text ?? '').trim().slice(0, PLAYER_NAME_MAX).trim();
  }

  /** The remembered name, or '' when there is none or storage is unavailable. */
  load() {
    try {
      return PlayerName.normalize(this.storage?.getItem(this.key) ?? '');
    } catch {
      return '';
    }
  }

  /** What to send: the typed name, else the fallback. Remembers a typed name. */
  use(text) {
    const name = PlayerName.normalize(text);
    if (!name) return this.fallback;
    try {
      this.storage?.setItem(this.key, name);
    } catch {
      // storage blocked or full: the name still works for this visit
    }
    return name;
  }
}
