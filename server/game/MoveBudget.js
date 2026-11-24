/**
 * How far a remote player may still walk, as a token bucket of metres (docs/tech/NETWORK.md, 手感 1).
 *
 * Two pools fill with server time, not with messages, so sending more inputs earns nothing:
 * - `walk` grows by speed × elapsed × factor and holds at most `bankSeconds` of that, so a legit
 *   client whose inputs arrive bunched (network jitter) spends what the quiet gap earned;
 * - `slack` is the extra `slack` metres for rounding and a late first input; it refills from
 *   empty in `slackRefillSeconds` and never holds more than `slack`.
 * A move spends `walk` first, then `slack`. Over any stretch of time a client can move at most
 * speed × time × factor plus the two caps, however many messages it sends.
 */
export class MoveBudget {
  /**
   * @param {{factor?: number, slack?: number, slackRefillSeconds?: number, bankSeconds?: number}} [options]
   */
  constructor({ factor = 1.5, slack = 0.5, slackRefillSeconds = 1, bankSeconds = 1 } = {}) {
    this.factor = factor;
    this.slackCap = slack;
    this.slackRate = slack / slackRefillSeconds;
    this.bankSeconds = bankSeconds;
    /** Metres earned by time and not walked yet. */
    this.walk = 0;
    /** Metres of slack left; starts full. */
    this.slack = slack;
  }

  /** Metres the `walk` pool may hold at `speed` m/s. */
  walkCap(speed) {
    return speed * this.factor * this.bankSeconds;
  }

  /** What may be walked after `seconds` more at `speed` m/s, without changing the pools. */
  peek(speed, seconds) {
    return Math.min(this.walk + speed * this.factor * seconds, this.walkCap(speed))
      + Math.min(this.slack + this.slackRate * seconds, this.slackCap);
  }

  /** Lets `seconds` of server time pass at `speed` m/s; returns the metres now available. */
  refill(speed, seconds) {
    this.walk = Math.min(this.walk + speed * this.factor * seconds, this.walkCap(speed));
    this.slack = Math.min(this.slack + this.slackRate * seconds, this.slackCap);
    return this.available;
  }

  get available() {
    return this.walk + this.slack;
  }

  /** Takes `metres` out: from `walk` first, the rest from `slack` (never below zero). */
  spend(metres) {
    const distance = Math.max(metres, 0);
    const fromWalk = Math.min(distance, this.walk);
    this.walk -= fromWalk;
    this.slack = Math.max(this.slack - (distance - fromWalk), 0);
  }
}
