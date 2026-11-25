/**
 * Temp Stay / booking-engine availability helpers (Phase 3).
 * Expands host-blocked dates + active bookings into a Set of YYYY-MM-DD nights.
 * Nightly stays use half-open ranges [start, end) so checkout day stays free.
 */

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toISODate(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Inclusive start → exclusive end (overnight nights). */
export function expandDateRangeNights(startDate, endDate, into = new Set()) {
  const start = toISODate(startDate);
  const end = toISODate(endDate) || start;
  if (!start) return into;
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return into;
  for (let d = new Date(s); d < e; d.setDate(d.getDate() + 1)) {
    into.add(toISODate(d));
  }
  // Same-day / missing end: still mark start night.
  if (e.getTime() <= s.getTime()) into.add(start);
  return into;
}

/**
 * Build unavailable night set from GET /booking/listings/:id/availability payload.
 * @param {{ blocked?: Array, booked?: Array }} data
 */
export function buildUnavailableNightSet(data) {
  const set = new Set();
  const payload = data?.data ?? data ?? {};
  for (const row of payload.blocked || []) {
    if (row?.is_blocked && row.date) set.add(toISODate(row.date));
  }
  for (const b of payload.booked || []) {
    expandDateRangeNights(b.start_date, b.end_date, set);
  }
  for (const d of payload.sold_out_nights || []) {
    const iso = toISODate(d);
    if (iso) set.add(iso);
  }
  return set;
}

/** True if any night in [checkIn, checkOut) is unavailable. */
export function stayRangeConflicts(checkIn, checkOut, unavailable) {
  if (!checkIn || !checkOut || !unavailable?.size) return false;
  const nights = expandDateRangeNights(checkIn, checkOut);
  for (const n of nights) {
    if (unavailable.has(n)) return true;
  }
  return false;
}

export function hostBookingStatusLabel(rawStatus) {
  const s = String(rawStatus || '').toLowerCase();
  if (s === 'awaiting_host' || s === 'requested') return 'Pending';
  if (s === 'confirmed') return 'Confirmed';
  if (s === 'in_progress') return 'In progress';
  if (s === 'completed') return 'Completed';
  if (s === 'cancelled') return 'Cancelled';
  if (s === 'declined') return 'Declined';
  if (!s) return 'Pending';
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}
