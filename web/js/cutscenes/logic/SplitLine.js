/**
 * A slanted line that splits the screen in two comic panels.
 * `top` and `bottom` are where the line meets the top and bottom edge,
 * as a fraction of the width (0 = left edge, 1 = right edge).
 */
export class SplitLine {
  constructor({ top = 0.57, bottom = 0.37 } = {}) {
    for (const value of [top, bottom]) {
      if (!(Number.isFinite(value) && value > 0 && value < 1)) {
        throw new RangeError('SplitLine top and bottom must be between 0 and 1');
      }
    }
    this.top = top;
    this.bottom = bottom;
  }

  /** Where the line is at height `y` (0 = top, 1 = bottom), as a fraction of the width. */
  xAt(y) {
    return this.top + (this.bottom - this.top) * y;
  }

  /** Middle of the left panel at half height, as a fraction of the width. */
  get leftCentre() {
    return this.xAt(0.5) / 2;
  }

  /** Middle of the right panel at half height, as a fraction of the width. */
  get rightCentre() {
    return (this.xAt(0.5) + 1) / 2;
  }

  /** CSS `clip-path` for the panel on `side` ('left' or 'right'). */
  clipPath(side) {
    const top = pct(this.top);
    const bottom = pct(this.bottom);
    if (side === 'left') return `polygon(0% 0%, ${top} 0%, ${bottom} 100%, 0% 100%)`;
    if (side === 'right') return `polygon(${top} 0%, 100% 0%, 100% 100%, ${bottom} 100%)`;
    throw new RangeError(`SplitLine side must be 'left' or 'right', got ${side}`);
  }
}

function pct(fraction) {
  return `${Math.round(fraction * 10000) / 100}%`;
}
