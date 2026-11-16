/**
 * Draws one dry brush stroke as SVG text: loaded and blunt on the left, thin and broken on the right.
 * The health bar uses it as a mask, so the bar has ragged edges instead of a rectangle.
 * No DOM and no randomness from outside: the same seed always gives the same stroke.
 */
export class BrushStroke {
  /** @param {{width?: number, height?: number, seed?: number, steps?: number}} options  size in SVG units */
  constructor({ width = 300, height = 20, seed = 1, steps = 36 } = {}) {
    if (!(width > 0) || !(height > 0) || !Number.isInteger(steps) || steps < 4) throw new RangeError('Invalid stroke size');
    this.width = width;
    this.height = height;
    this.seed = seed >>> 0;
    this.steps = steps;
  }

  /** Closed outline of the stroke: along the top edge to the right, back along the bottom edge. */
  outline() {
    const random = BrushStroke.random(this.seed);
    const { width, height, steps } = this;
    const pad = height * 0.25;
    const middle = height / 2;
    const top = [];
    const bottom = [];
    for (let index = 0; index <= steps; index++) {
      const t = index / steps;
      const x = pad + t * (width - pad * 2);
      // Thick where the brush first lands, even in the middle, running out towards the end.
      const body = t < 0.08 ? 0.62 + t * 3.2 : t < 0.6 ? 0.88 - (t - 0.08) * 0.2 : 0.776 - (t - 0.6) * 0.75;
      const half = middle * body;
      const drift = Math.sin(t * 5.3 + this.seed) * height * 0.03;
      top.push([x, middle + drift - half + (random() - 0.5) * height * 0.14]);
      bottom.push([x, middle + drift + half + (random() - 0.5) * height * 0.14]);
    }
    const points = top.concat(bottom.reverse());
    return 'M' + points.map(([x, y]) => BrushStroke.clamp(x, 0, width).toFixed(1) + ' ' +
      BrushStroke.clamp(y, 0, height).toFixed(1)).join('L') + 'Z';
  }

  /** Thin horizontal gaps where the bristles ran dry; more of them towards the right end. */
  gaps() {
    const random = BrushStroke.random(this.seed ^ 0x9e3779b9);
    const { width, height } = this;
    const gaps = [];
    for (let index = 0; index < 9; index++) {
      const start = width * (0.3 + random() * 0.55);
      gaps.push({
        x1: start,
        x2: Math.min(width, start + width * (0.12 + random() * 0.35)),
        y: height * (0.22 + random() * 0.56),
        width: height * (0.03 + random() * 0.05),
      });
    }
    return gaps;
  }

  /** Complete SVG image: opaque where there is paint, transparent elsewhere. */
  toSvg() {
    const { width, height } = this;
    const gaps = this.gaps().map(gap => '<path d="M' + gap.x1.toFixed(1) + ' ' + gap.y.toFixed(1) + 'H' + gap.x2.toFixed(1) +
      '" stroke="#000" stroke-width="' + gap.width.toFixed(2) + '" stroke-linecap="round"/>').join('');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none">' +
      '<defs>' +
      // Ragged edge: push the outline around with noise that is stretched along the stroke.
      '<filter id="edge" x="-3%" y="-30%" width="106%" height="160%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.06 0.45" numOctaves="2" seed="' + (this.seed % 97) + '"/>' +
      '<feDisplacementMap in="SourceGraphic" scale="' + (height * 0.3).toFixed(1) + '" xChannelSelector="R" yChannelSelector="G"/>' +
      '</filter>' +
      // Uneven paint: long streaks that thin the stroke without cutting it.
      '<filter id="streak" x="0" y="0" width="100%" height="100%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.012 0.7" numOctaves="2" seed="' + (this.seed % 89 + 3) + '"/>' +
      '<feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 4 -1.9"/>' +
      '</filter>' +
      '<mask id="paint" maskUnits="userSpaceOnUse" x="0" y="0" width="' + width + '" height="' + height + '">' +
      '<g filter="url(#edge)"><path d="' + this.outline() + '" fill="#fff"/>' + gaps + '</g>' +
      '<rect width="' + width + '" height="' + height + '" fill="#000" opacity="0.4" filter="url(#streak)"/>' +
      '</mask>' +
      '</defs>' +
      '<rect width="' + width + '" height="' + height + '" fill="#fff" mask="url(#paint)"/>' +
      '</svg>';
  }

  /** The image as a CSS `url(...)` value, ready for `mask-image`. */
  toCssUrl() {
    return 'url("data:image/svg+xml,' + encodeURIComponent(this.toSvg()) + '")';
  }

  static clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /** Small repeatable random generator (mulberry32): returns a function giving numbers in [0, 1). */
  static random(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }
}
