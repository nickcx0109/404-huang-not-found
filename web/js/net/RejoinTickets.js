const STORE_KEY = 'net:rejoin';

/**
 * Remembers this tab's seat in a team (code and rejoin token from the server's `room` message)
 * so a reloaded page can take the same seat back while the server still holds it
 * (docs/tech/NETWORK.md, 斷線重連). The store is injected (sessionStorage in the browser: one
 * ticket per tab, gone when the tab closes) and every access is guarded, because private
 * windows and blocked site data throw; then a reload just cannot rejoin.
 */
export class RejoinTickets {
  /**
   * @param {{getItem(key: string): string|null, setItem(key: string, value: string): void,
   *   removeItem(key: string): void}|null} storage
   * @param {{key?: string}} [options]
   */
  constructor(storage, { key = STORE_KEY } = {}) {
    this.storage = storage;
    this.key = key;
  }

  /** Keeps the seat a `room` message describes; a room without a token clears the ticket. */
  save(room) {
    const code = room?.code;
    const token = room?.token;
    if (typeof code !== 'string' || typeof token !== 'string' || token.length === 0) return this.clear();
    try {
      this.storage?.setItem(this.key, JSON.stringify({ code, token }));
      return true;
    } catch {
      return false;
    }
  }

  /** The kept `{code, token}`, or null when there is none, it is unreadable or storage is blocked. */
  load() {
    let ticket;
    try {
      ticket = JSON.parse(this.storage?.getItem(this.key) ?? 'null');
    } catch {
      return null;
    }
    if (ticket === null || typeof ticket !== 'object') return null;
    const { code, token } = ticket;
    return typeof code === 'string' && typeof token === 'string' && token.length > 0 ? { code, token } : null;
  }

  /** The token kept for team `code`, or null. */
  tokenFor(code) {
    const ticket = this.load();
    return ticket && ticket.code === code ? ticket.token : null;
  }

  /** Forgets the seat (the player left, or the server refused it). */
  clear() {
    try {
      this.storage?.removeItem(this.key);
    } catch {
      // storage blocked: nothing was kept anyway
    }
    return false;
  }
}
