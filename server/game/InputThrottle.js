/** Inputs closer together than this are coalesced (browsers send 30 a second; this allows 60). */
export const MIN_INPUT_INTERVAL_MS = 1000 / 60;

/** What InputThrottle#offer did with a message. */
export const ThrottleResult = Object.freeze({
  /** Kept as the pending input; it (or a newer one) is applied by the next flush or offer. */
  DEFERRED: 'deferred',
});

/**
 * Keeps a flooding client from making the server run one CollisionWorld.move per message
 * (docs/tech/NETWORK.md, G8n). An `input` arriving at least `minIntervalMs` after the last one
 * applied goes straight to the target; one that comes sooner becomes the pending input,
 * replacing any older pending one, and `flush()` (every server tick, and before an action)
 * applies it. The newest input is therefore never lost, only delayed by at most one tick, and the
 * target sees at most 1000 / minIntervalMs inputs a second plus one per flush.
 *
 * Positions in `input` are absolute, so skipping the ones in between loses nothing but their
 * `seq`, which the next accepted input's `ack` covers anyway.
 */
export class InputThrottle {
  /**
   * @param {{accept(message: object, now: number): string}} target  usually a RemoteController
   * @param {{minIntervalMs?: number}} [options]
   */
  constructor(target, { minIntervalMs = MIN_INPUT_INTERVAL_MS } = {}) {
    this.target = target;
    this.minIntervalMs = minIntervalMs;
    this.pending = null;
    this.lastAppliedAt = -Infinity;
    /** Inputs dropped because a newer one replaced them before they were applied. */
    this.dropped = 0;
  }

  /**
   * Takes one validated `input` received at server time `now` (ms).
   * @returns {string} the target's result when applied now, else ThrottleResult.DEFERRED
   */
  offer(message, now) {
    if (now - this.lastAppliedAt >= this.minIntervalMs) {
      if (this.pending) this.dropped++;
      this.pending = null;
      return this._apply(message, now);
    }
    if (this.pending && message.seq <= this.pending.seq) {
      this.dropped++;
      return ThrottleResult.DEFERRED;
    }
    if (this.pending) this.dropped++;
    this.pending = message;
    return ThrottleResult.DEFERRED;
  }

  /** Applies the pending input, if any; returns the target's result or null when nothing waited. */
  flush(now) {
    const message = this.pending;
    if (!message) return null;
    this.pending = null;
    return this._apply(message, now);
  }

  /** Forgets the pending input and the rate history (a new connection for the same player). */
  reset() {
    this.pending = null;
    this.lastAppliedAt = -Infinity;
  }

  _apply(message, now) {
    this.lastAppliedAt = now;
    return this.target.accept(message, now);
  }
}
