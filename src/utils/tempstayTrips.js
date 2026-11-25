/**
 * Guest trips helpers for booking-engine stays (tempstay, hotel, …).
 * Maps booking-engine rows → UI trip cards; cancel eligibility mirrors BE status machine.
 */

export const TEMPSTAY_VERTICAL = 'tempstay';
export const HOTEL_VERTICAL = 'hotel';

const CANCELABLE = new Set(['requested', 'awaiting_host', 'confirmed', 'in_progress']);

export function canCancelTempStayTrip(status) {
  return CANCELABLE.has(String(status || '').toLowerCase());
}

export function canRateBookingTrip(status, review) {
  return String(status || '').toLowerCase() === 'completed' && !review;
}

export function tripBucket(status, { now = new Date() } = {}, endDate) {
  const s = String(status || '').toLowerCase();
  if (s === 'cancelled' || s === 'declined') return 'cancelled';
  if (s === 'completed') return 'past';
  if (endDate) {
    const end = new Date(endDate);
    // end parses to midnight of the end date itself, so a trip stays "upcoming" through
    // its whole last day — only past once we're at/after the day after it ends.
    if (!Number.isNaN(end.getTime()) && end.getTime() + 86400000 <= now.getTime()) return 'past';
  }
  return 'upcoming';
}

/**
 * Normalize one engine booking into a trip card.
 */
export function mapBookingToTempStayTrip(b) {
  if (!b) return null;
  const listing = b.booking_listing || {};
  const status = b.status || 'requested';
  const review = b.booking_review ?? b.review ?? null;
  return {
    booking_id: b.booking_id,
    listing_id: listing.booking_listing_id ?? b.booking_listing_id ?? null,
    title: listing.title || b.title || 'Stay',
    location: listing.location || null,
    start_date: b.start_date ? String(b.start_date).slice(0, 10) : null,
    end_date: b.end_date ? String(b.end_date).slice(0, 10) : null,
    guests: b.guests ?? null,
    total: b.total != null ? Number(b.total) : null,
    status,
    review,
    can_cancel: canCancelTempStayTrip(status),
    can_rate: canRateBookingTrip(status, review),
    bucket: tripBucket(status, {}, b.end_date),
  };
}

/** Filter guest bookings to a vertical and map to trip cards. */
export function mapGuestBookingsToTempStayTrips(rows, { vertical = TEMPSTAY_VERTICAL } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .filter((b) => !b.vertical || b.vertical === vertical)
    .map(mapBookingToTempStayTrip)
    .filter(Boolean);
}

export function filterTripsByBucket(trips, bucket) {
  const list = Array.isArray(trips) ? trips : [];
  if (!bucket || bucket === 'all') return list;
  return list.filter((t) => t.bucket === bucket);
}
