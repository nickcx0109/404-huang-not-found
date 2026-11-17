/** Shared simulation/statistics interval in seconds, including clock reversals. */
export function clampFrameTime(elapsed, maximum) {
  return Math.min(maximum, Math.max(0, elapsed));
}
