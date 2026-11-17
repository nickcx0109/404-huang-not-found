/** Zero disables bloom; positive values select one to four downsample levels. */
export function resolveBloomLevels(value) {
  const levels = value ?? 3;
  if (!Number.isFinite(levels)) return 3;
  if (levels === 0) return 0;
  return Math.min(4, Math.max(1, Math.round(levels)));
}
