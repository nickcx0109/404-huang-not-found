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
  prune(time) {
    for (const [key, effect] of this.entries) if (time + 1e-9 >= effect.end) this.entries.delete(key);
  }
  clear() { this.entries.clear(); }
}
