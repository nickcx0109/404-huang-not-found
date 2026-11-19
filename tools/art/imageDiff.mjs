// Pure pixel comparison for tools/art/compare.mjs (no DOM, no browser; tested in test/ImageDiff.test.js).
//
// The software renderer used for screenshots (SwiftShader) sometimes rounds a handful of pixels one or two
// steps differently from run to run (TODO B16). Those runs show the same picture, so a check for
// "did my change alter the screen" has to tell that noise apart from a real difference.

/** Default limits for renderer noise: every channel within 4 steps and at most 0.05 % of the pixels. */
export const NOISE_LIMITS = Object.freeze({ maxDelta: 4, maxShare: 0.0005 });

/**
 * Compares two RGBA buffers of the same size. Alpha is ignored (screenshots are opaque).
 * @returns {{pixels: number, total: number, maxDelta: number, box: null|{x0:number,y0:number,x1:number,y1:number}}}
 */
export function diffPixels(a, b, width, height) {
  if (a.length !== b.length || a.length !== width * height * 4) throw new RangeError('Images must have the same size');
  let pixels = 0;
  let maxDelta = 0;
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let index = 0; index < a.length; index += 4) {
    let delta = 0;
    for (let channel = 0; channel < 3; channel++) {
      const d = Math.abs(a[index + channel] - b[index + channel]);
      if (d > delta) delta = d;
    }
    if (delta === 0) continue;
    pixels++;
    if (delta > maxDelta) maxDelta = delta;
    const pixel = index / 4;
    const x = pixel % width;
    const y = (pixel - x) / width;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { pixels, total: width * height, maxDelta, box: pixels === 0 ? null : { x0, y0, x1, y1 } };
}

/** 'same' (no pixel differs), 'noise' (within the limits) or 'different'. */
export function classify(diff, limits = NOISE_LIMITS) {
  if (diff.pixels === 0) return 'same';
  if (diff.maxDelta <= limits.maxDelta && diff.pixels <= diff.total * limits.maxShare) return 'noise';
  return 'different';
}
