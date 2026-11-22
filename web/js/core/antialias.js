// Only aa=0 disables the default; an explicit constructor option takes precedence.
export function resolveAntialias(enabled, search = '') {
  return enabled === undefined ? new URLSearchParams(search).get('aa') !== '0' : Boolean(enabled);
}

// Inputs are drawing-buffer pixels, already including the renderer's pixel ratio.
export function antialiasTexelSize(width, height) {
  return [1 / Math.max(1, width), 1 / Math.max(1, height)];
}
