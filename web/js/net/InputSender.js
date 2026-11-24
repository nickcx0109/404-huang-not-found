/**
 * Throttles `input` messages to a fixed rate (30 per second by default, NETWORK.md 手感 5).
 * Call update(pose) every frame; it forwards to `client.sendInput` only when a slot is due.
 * Slots are kept on a fixed grid so a 60 fps loop sends every other frame instead of drifting.
 */
export class InputSender {
  /**
   * @param {object} options
   * @param {{ sendInput(pose: object): boolean }} options.client usually a NetClient
   * @param {number} [options.rate] messages per second
   * @param {() => number} [options.now] time source in ms
   */
  constructor({ client, rate = 30, now = () => Date.now() } = {}) {
    if (!client || typeof client.sendInput !== 'function') throw new TypeError('InputSender needs a client with sendInput');
    if (!(rate > 0)) throw new RangeError('InputSender rate must be positive');
    this._client = client;
    this._now = now;
    this.interval = 1000 / rate;
    this._nextAt = -Infinity;
    this.sent = 0;
  }

  /** Sends `pose` if a slot is due; returns true when a message went out. */
  update(pose) {
    const now = this._now();
    if (now < this._nextAt) return false;
    if (!this._client.sendInput(pose)) return false;
    this.sent++;
    // Stay on the grid while keeping up; restart it after a stall (tab in background, disconnect).
    const next = this._nextAt + this.interval;
    this._nextAt = next > now ? next : now + this.interval;
    return true;
  }

  /** Lets the next update() send immediately (for example right after a reconnect). */
  reset() {
    this._nextAt = -Infinity;
  }
}
