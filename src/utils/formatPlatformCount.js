/**
 * Format platform count for profile sidebar display.
 */
export function formatPlatformCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(v));
}
