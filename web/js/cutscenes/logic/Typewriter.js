/**
 * Typewriter captions: lines appear one character at a time, stay for a
 * moment, then clear for the next line. The last line stays on screen.
 *
 * Pure timing logic: give it a time in seconds and it says what to show.
 * A line is a string, or `{ text, charSeconds, holdSeconds }` to override
 * the defaults for that line (for example a slower final line).
 */
export class Typewriter {
  constructor(lines, { charSeconds = 0.045, holdSeconds = 1.2, gapSeconds = 0.25, delaySeconds = 0 } = {}) {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new RangeError('Typewriter needs at least one line');
    }
    for (const value of [charSeconds, holdSeconds, gapSeconds, delaySeconds]) {
      if (!(Number.isFinite(value) && value >= 0)) throw new RangeError('Typewriter timings must be >= 0');
    }
    if (!(charSeconds > 0)) throw new RangeError('charSeconds must be > 0');

    let start = delaySeconds;
    this.lines = lines.map((line, index) => {
      const spec = typeof line === 'string' ? { text: line } : { ...line };
      if (typeof spec.text !== 'string' || spec.text.length === 0) {
        throw new RangeError(`Typewriter line ${index} has no text`);
      }
      const perChar = spec.charSeconds ?? charSeconds;
      const hold = spec.holdSeconds ?? holdSeconds;
      if (!(perChar > 0) || !(hold >= 0)) throw new RangeError(`Typewriter line ${index} has bad timings`);
      const typedAt = start + spec.text.length * perChar;
      const entry = { text: spec.text, start, perChar, typedAt, end: typedAt + hold };
      start = entry.end + gapSeconds;
      return entry;
    });
  }

  /** Builds one from the `captions` block of a shot: `{ lines, charSeconds?, holdSeconds?, ... }`. */
  static fromSpec({ lines, ...options }) {
    return new Typewriter(lines, options);
  }

  /** Seconds until the last line has been typed and held. */
  get duration() {
    return this.lines[this.lines.length - 1].end;
  }

  /**
   * What to show at time `t`:
   * `index` is the line on screen (-1 before the first line and in the gaps),
   * `text` the typed part, `typing` whether characters are still coming,
   * `fresh` how many seconds the line has been up (for the intro glitch),
   * `clearsIn` seconds until the line is wiped (Infinity for the last line),
   * `done` whether everything has been shown.
   */
  at(t) {
    const last = this.lines.length - 1;
    for (let index = last; index >= 0; index--) {
      const line = this.lines[index];
      if (t < line.start) continue;
      if (t >= line.end && index !== last) break;
      const count = Math.min(line.text.length, Math.floor((t - line.start) / line.perChar) + 1);
      return {
        index,
        text: line.text.slice(0, count),
        typing: count < line.text.length,
        fresh: t - line.start,
        clearsIn: index === last ? Infinity : line.end - t,
        done: index === last && t >= line.end,
      };
    }
    return { index: -1, text: '', typing: false, fresh: 0, clearsIn: Infinity, done: false };
  }

  /** Non-space characters typed so far over all lines; never goes down. Drives the key clicks. */
  keystrokes(t) {
    let total = 0;
    for (const line of this.lines) {
      if (t < line.start) break;
      const count = Math.min(line.text.length, Math.floor((t - line.start) / line.perChar) + 1);
      total += line.text.slice(0, count).replace(/\s/g, '').length;
    }
    return total;
  }

  /** Whether a block cursor is lit: solid while typing, blinking otherwise. */
  cursorOn(t, blinkSeconds = 0.5) {
    const state = this.at(t);
    if (state.index < 0) return false;
    if (state.typing) return true;
    return Math.floor(t / blinkSeconds) % 2 === 0;
  }
}
