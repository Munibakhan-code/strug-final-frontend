/**
 * Vehicle guest trip helpers (Phase 2).
 * Maps booking-engine rows -> vehicle trip cards; cancel rules mirror the BE status machine.
 */

export const VEHICLE_VERTICAL = 'vehicle';

const CANCELABLE = new Set(['requested', 'awaiting_host', 'confirmed', 'in_progress']);

export function canCancelVehicleTrip(status) {
  return CANCELABLE.has(String(status || '').toLowerCase());
}

export function vehicleTripBucket(status, { now = new Date() } = {}, endDate) {
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

export function mapBookingToVehicleTrip(b) {
  if (!b) return null;
  const listing = b.booking_listing || {};
  const status = b.status || 'requested';
  const startDate = b.start_date ? String(b.start_date).slice(0, 10) : null;
  const endDate = b.end_date ? String(b.end_date).slice(0, 10) : null;
  const dayCount = startDate && endDate
    ? Math.max(0, Math.round((new Date(endDate) - new Date(startDate)) / 86400000))
    : null;
  return {
    booking_id: b.booking_id,
    listing_id: listing.booking_listing_id ?? b.booking_listing_id ?? null,
    title: listing.title || b.title || 'Vehicle',
    location: listing.location || null,
    start_date: startDate,
    end_date: endDate,
    days: dayCount,
    total: b.total != null ? Number(b.total) : null,
    status,
    can_cancel: canCancelVehicleTrip(status),
    bucket: vehicleTripBucket(status, {}, b.end_date),
  };
}

export function mapGuestBookingsToVehicleTrips(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .filter((b) => !b.vertical || b.vertical === VEHICLE_VERTICAL)
    .map(mapBookingToVehicleTrip)
    .filter(Boolean);
}

export function filterVehicleTripsByBucket(trips, bucket) {
  const list = Array.isArray(trips) ? trips : [];
  if (!bucket || bucket === 'all') return list;
  return list.filter((trip) => trip.bucket === bucket);
}
