/**
 * Estimates the server clock from ping/pong samples.
 *
 * Each sample gives an offset guess `s + rtt / 2 - receivedAt`. The guess from the
 * lowest-RTT sample in the recent window is the most trustworthy (least queueing), so the
 * estimate eases toward that one instead of jumping with every noisy pong.
 */
export class ServerClock {
  /**
   * @param {object} [options]
   * @param {() => number} [options.now] client time source in ms
   * @param {number} [options.window] how many recent samples are considered
   * @param {number} [options.smoothing] 0..1 share of the gap closed per sample
   * @param {number} [options.snapThreshold] gaps larger than this (ms) are taken at once
   */
  constructor({ now = () => Date.now(), window = 8, smoothing = 0.25, snapThreshold = 1000 } = {}) {
    if (!(window >= 1)) throw new RangeError('ServerClock window must be at least 1');
    if (!(smoothing > 0 && smoothing <= 1)) throw new RangeError('ServerClock smoothing must be in (0, 1]');
    this._now = now;
    this._window = Math.floor(window);
    this._smoothing = smoothing;
    this._snapThreshold = snapThreshold;
    this.reset();
  }

  /** Forgets every sample (for example after reconnecting to a different server process). */
  reset() {
    this._samples = [];
    this._offset = 0;
    this._rtt = null;
    this._synced = false;
  }

  /** True once at least one valid sample has arrived. */
  get synced() {
    return this._synced;
  }

  /** Current estimate of server time minus client time, in ms. */
  get offset() {
    return this._offset;
  }

  /** Smoothed round-trip time in ms, or null before the first sample. */
  get rtt() {
    return this._rtt;
  }

  /** Lowest round-trip time in the recent window, or null before the first sample. */
  get bestRtt() {
    return this._samples.length ? this._best().rtt : null;
  }

  /** Estimated current server time in ms. */
  now() {
    return this._now() + this._offset;
  }

  /** Client time in ms from the injected source. */
  clientNow() {
    return this._now();
  }

  /**
   * Feeds one pong. `clientSent` is the ping's `c`, `serverTime` the pong's `s`.
   * Returns false for samples that cannot be right (non-finite or negative RTT).
   */
  addSample(clientSent, serverTime, receivedAt = this._now()) {
    if (![clientSent, serverTime, receivedAt].every(Number.isFinite)) return false;
    const rtt = receivedAt - clientSent;
    if (rtt < 0) return false;
    const offset = serverTime + rtt / 2 - receivedAt;
    this._samples.push({ rtt, offset });
    if (this._samples.length > this._window) this._samples.shift();
    this._rtt = this._rtt === null ? rtt : this._rtt + (rtt - this._rtt) * this._smoothing;
    const target = this._best().offset;
    if (!this._synced || Math.abs(target - this._offset) > this._snapThreshold) {
      this._offset = target;
    } else {
      this._offset += (target - this._offset) * this._smoothing;
    }
    this._synced = true;
    return true;
  }

  _best() {
    let best = this._samples[0];
    for (const sample of this._samples) if (sample.rtt <= best.rtt) best = sample; // ties go to the newer sample
    return best;
  }
}
