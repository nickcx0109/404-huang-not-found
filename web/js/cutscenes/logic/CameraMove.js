/**
 * A slow pan and zoom over a still picture ("Ken Burns").
 * A framing is `{ x, y, scale }`: `x` and `y` shift the picture as a
 * percentage of its own size, `scale` zooms it (1 = fills the frame).
 */
export class CameraMove {
  constructor({ from = {}, to = {} } = {}) {
    this.from = framing(from);
    this.to = framing({ ...this.from, ...to });
  }

  /** Framing at `progress` from 0 to 1, eased so the move starts and stops softly. */
  at(progress) {
    const p = Math.min(1, Math.max(0, progress));
    const k = p * p * (3 - 2 * p);
    return {
      x: lerp(this.from.x, this.to.x, k),
      y: lerp(this.from.y, this.to.y, k),
      scale: lerp(this.from.scale, this.to.scale, k),
    };
  }

  /** CSS `transform` for `progress`. */
  transform(progress) {
    const { x, y, scale } = this.at(progress);
    return `translate(${round(x)}%, ${round(y)}%) scale(${round(scale, 4)})`;
  }
}

function framing({ x = 0, y = 0, scale = 1 }) {
  for (const value of [x, y, scale]) {
    if (!Number.isFinite(value)) throw new RangeError('CameraMove values must be numbers');
  }
  if (!(scale > 0)) throw new RangeError('CameraMove scale must be > 0');
  return { x, y, scale };
}

function lerp(a, b, k) {
  return a + (b - a) * k;
}

function round(value, places = 3) {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}
