/**
 * Venue guest booking helpers (Phase 2).
 * Maps booking-engine rows -> venue booking cards; cancel rules mirror the BE status machine.
 */

export const VENUE_VERTICAL = 'venue';

const CANCELABLE = new Set(['requested', 'awaiting_host', 'confirmed', 'in_progress']);

export function canCancelVenueTrip(status) {
  return CANCELABLE.has(String(status || '').toLowerCase());
}

export function canRateVenueTrip(status, review) {
  return String(status || '').toLowerCase() === 'completed' && !review;
}

/** Bucket by status; for single-day events use endDate or startDate for past detection. */
export function venueTripBucket(status, { now = new Date() } = {}, eventDate) {
  const s = String(status || '').toLowerCase();
  if (s === 'cancelled' || s === 'declined') return 'cancelled';
  if (s === 'completed') return 'past';
  if (eventDate) {
    const end = new Date(eventDate);
    // end parses to midnight of the event date itself, so it stays "upcoming" through
    // its whole day — only past once we're at/after the day after it.
    if (!Number.isNaN(end.getTime()) && end.getTime() + 86400000 <= now.getTime()) return 'past';
  }
  return 'upcoming';
}

export function mapBookingToVenueTrip(b) {
  if (!b) return null;
  const listing = b.booking_listing || {};
  const status = b.status || 'requested';
  const review = b.booking_review ?? b.review ?? null;
  const startDate = b.start_date ? String(b.start_date).slice(0, 10) : null;
  const endDate = b.end_date ? String(b.end_date).slice(0, 10) : null;
  return {
    booking_id: b.booking_id,
    listing_id: listing.booking_listing_id ?? b.booking_listing_id ?? null,
    title: listing.title || b.title || 'Venue',
    location: listing.location || null,
    start_date: startDate,
    end_date: endDate,
    event_date: startDate,
    total: b.total != null ? Number(b.total) : null,
    status,
    review,
    can_cancel: canCancelVenueTrip(status),
    can_rate: canRateVenueTrip(status, review),
    // Event venues are typically one day — prefer end_date, else start_date for past bucketing.
    bucket: venueTripBucket(status, {}, b.end_date || b.start_date),
  };
}

export function mapGuestBookingsToVenueTrips(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .filter((b) => !b.vertical || b.vertical === VENUE_VERTICAL)
    .map(mapBookingToVenueTrip)
    .filter(Boolean);
}

export function filterVenueTripsByBucket(trips, bucket) {
  const list = Array.isArray(trips) ? trips : [];
  if (!bucket || bucket === 'all') return list;
  return list.filter((trip) => trip.bucket === bucket);
}
