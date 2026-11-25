/** Local calendar YYYY-MM-DD for chart day buckets (browser timezone by default). */
export function calendarDayKey(input = new Date(), timeZone) {
  const zone = timeZone || browserTimeZone();
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    return y && m && day ? `${y}-${m}-${day}` : '';
  } catch {
    // Fallback: UTC date only if Intl rejects the zone.
    return d.toISOString().slice(0, 10);
  }
}

/** Seller browser IANA timezone for analytics day alignment with the API. */
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
