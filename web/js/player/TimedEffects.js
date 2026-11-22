/** DOM-free timed stat modifiers. Equal keys refresh rather than stack. */
export class TimedEffects {
  constructor() { this.entries = new Map(); }
  refresh(key, seconds, modifiers, time) {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new RangeError('Invalid duration');
    for (const value of Object.values(modifiers)) {
      if (!Number.isFinite(value) || value <= 0) throw new RangeError('Invalid multiplier');
    }
    this.entries.set(key, { start: time, end: time + seconds, modifiers: { ...modifiers } });
  }
  multiplier(stat, time) {
    let value = 1;
    for (const effect of this.entries.values()) {
      if (time >= effect.start && time + 1e-9 < effect.end) value *= effect.modifiers[stat] ?? 1;
    }
    return value;
  }
  /** Integrate a rate across expiry boundaries, even on a large simulation step. */
  elapsed(stat, from, to) {
    const points = [from, to];
    for (const effect of this.entries.values()) {
      for (const point of [effect.start, effect.end]) if (point > from && point < to) points.push(point);
    }
    points.sort((a, b) => a - b);
    let total = 0;
    for (let i = 1; i < points.length; i++) total += (points[i] - points[i-1]) * this.multiplier(stat, (points[i] + points[i-1]) / 2);
    return total;
  }
  /**
   * Real seconds from `from` until the rate has accumulated `amount` (the inverse of `elapsed`),
   * so a view can play a buffed reload in the time it will really take, across the buff's expiry.
   */
  timeToAccumulate(stat, from, amount) {
    if (!(amount > 0)) return 0;
    const points = [];
    for (const effect of this.entries.values()) {
      for (const point of [effect.start, effect.end]) if (point > from) points.push(point);
    }
    points.sort((a, b) => a - b);
    let time = from, left = amount;
    for (const point of points) {
      const rate = this.multiplier(stat, (time + point) / 2);
      if (rate * (point - time) >= left) return time + left / rate - from;
      left -= rate * (point - time);
      time = point;
    }
    return time + left / this.multiplier(stat, time) - from;
  }
  prune(time) {
    for (const [key, effect] of this.entries) if (time + 1e-9 >= effect.end) this.entries.delete(key);
  }
  clear() { this.entries.clear(); }
}
