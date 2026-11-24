/**
 * Collects ping/pong samples for tools/net-latency.mjs and sums them up.
 *
 * The clock offset (server time minus client time) is taken from the lowest-RTT sample, as
 * ServerClock does: `s + rtt / 2 - receivedAt` is least distorted when the round trip was fastest.
 */
export class LatencyStats {
  constructor() {
    this.samples = [];
  }

  /**
   * @param {number} rtt  round-trip time in ms
   * @param {number} serverTime  the pong's `s`
   * @param {number} receivedAt  client wall-clock time (ms) when the pong arrived
   */
  add(rtt, serverTime, receivedAt) {
    if (!Number.isFinite(rtt) || rtt < 0) throw new RangeError(`bad RTT: ${rtt}`);
    this.samples.push({ rtt, offset: serverTime + rtt / 2 - receivedAt });
  }

  get count() {
    return this.samples.length;
  }

  /** Nearest-rank percentile (0 < p <= 100) of sorted numbers. */
  static percentile(sorted, p) {
    if (!sorted.length) return null;
    const rank = Math.ceil((p / 100) * sorted.length);
    return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
  }

  /** Median of sorted numbers (mean of the middle two for an even count). */
  static median(sorted) {
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  /** `{ count, min, median, p95, max, offset }` in ms; every value is null without samples. */
  summary() {
    const rtts = this.samples.map((sample) => sample.rtt).sort((a, b) => a - b);
    const best = this.samples.reduce((low, sample) => (!low || sample.rtt < low.rtt ? sample : low), null);
    return {
      count: rtts.length,
      min: rtts.length ? rtts[0] : null,
      median: LatencyStats.median(rtts),
      p95: LatencyStats.percentile(rtts, 95),
      max: rtts.length ? rtts[rtts.length - 1] : null,
      offset: best ? best.offset : null,
    };
  }
}
