/**
 * Event guest ticket helpers.
 * Maps booking-engine rows -> ticket cards; cancel rules mirror the BE status machine.
 */

export const EVENT_VERTICAL = 'event';

const CANCELABLE = new Set(['requested', 'awaiting_host', 'confirmed', 'in_progress']);

export function canCancelEventTicket(status) {
  return CANCELABLE.has(String(status || '').toLowerCase());
}

/** Bucket by status; event date stays upcoming through that calendar day. */
export function eventTicketBucket(status, { now = new Date() } = {}, eventDate) {
  const s = String(status || '').toLowerCase();
  if (s === 'cancelled' || s === 'declined') return 'cancelled';
  if (s === 'completed') return 'past';
  if (eventDate) {
    const end = new Date(eventDate);
    if (!Number.isNaN(end.getTime()) && end.getTime() + 86400000 <= now.getTime()) return 'past';
  }
  return 'upcoming';
}

export function mapBookingToEventTicket(b) {
  if (!b) return null;
  const listing = b.booking_listing || {};
  const status = b.status || 'requested';
  const startDate = b.start_date ? String(b.start_date).slice(0, 10) : null;
  const qtyRaw = b.quantity ?? b.guests;
  const quantity = qtyRaw != null && Number.isFinite(Number(qtyRaw)) ? Number(qtyRaw) : 1;
  const attrs = listing.attributes ?? {};
  return {
    booking_id: b.booking_id,
    listing_id: listing.booking_listing_id ?? b.booking_listing_id ?? null,
    title: listing.title || b.title || 'Event',
    location: listing.location || attrs.venue_name || null,
    start_date: startDate,
    event_date: startDate || attrs.date || null,
    quantity,
    total: b.total != null ? Number(b.total) : null,
    status,
    can_cancel: canCancelEventTicket(status),
    bucket: eventTicketBucket(status, {}, b.end_date || b.start_date || attrs.date),
  };
}

export function mapGuestBookingsToEventTickets(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .filter((b) => !b.vertical || b.vertical === EVENT_VERTICAL)
    .map(mapBookingToEventTicket)
    .filter(Boolean);
}

export function filterEventTicketsByBucket(tickets, bucket) {
  const list = Array.isArray(tickets) ? tickets : [];
  if (!bucket || bucket === 'all') return list;
  return list.filter((ticket) => ticket.bucket === bucket);
}
