/**
 * Event listing mappers.
 * Honest API → UI mapping: no fake attending counts or organiser names.
 */
import { mediaUrls } from './mediaUrl.js';

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#059669', '#db2777', '#d97706', '#0891b2'];

export function avatarColorForId(id) {
  const n = Number(id) || 0;
  return AVATAR_COLORS[Math.abs(n) % AVATAR_COLORS.length];
}

export function resolveEventAttending(a = {}) {
  const raw = a.attending ?? a.attendee_count;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const MAX_TICKETS = 10;

/** Guest-facing ticket cap from listing capacity or explicit ticket limits. */
export function maxEventQuantity(a = {}, listingCapacity) {
  const fromAttr = a.tickets_left ?? a.max_tickets;
  const fromListing = listingCapacity;
  const raw = fromAttr != null && fromAttr !== '' ? fromAttr : fromListing;
  if (raw == null || raw === '') return MAX_TICKETS;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return MAX_TICKETS;
  return Math.min(n, MAX_TICKETS);
}

/** Booking engine start_date must be YYYY-MM-DD in local calendar time. */
export function eventStartDateISO(date) {
  if (!date) return undefined;
  const s = String(date).trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Map one booking_listing row (vertical=event) to the Events card/detail shape.
 */
export function mapBookingListingToEvent(l) {
  if (!l) return null;
  const a = l.attributes ?? {};
  const imgs = mediaUrls(l.images);
  const categoryRaw = a.category || a.event_type;
  const category = typeof categoryRaw === 'string' && categoryRaw.trim()
    ? categoryRaw.trim()
    : 'Event';
  const organiser = a.organiser ?? a.organizer ?? a.host ?? a.host_name ?? null;
  const hostId = l.owner_id ?? l.user_id ?? null;
  const initial = (organiser || 'E').toString().trim().charAt(0).toUpperCase() || 'E';
  const date = eventStartDateISO(a.date) || a.date || '';

  return {
    id: l.booking_listing_id ?? l.listing_id ?? l.id,
    title: l.title || 'Event',
    category,
    eventType: a.event_type ?? null,
    venue: a.venue_name || '',
    date,
    time: a.time || '',
    price: Number(l.price) || 0,
    featured: Boolean(a.featured),
    images: imgs,
    image: imgs[0] ?? null,
    location: l.location || '',
    description: l.description ?? null,
    attending: resolveEventAttending(a),
    organiser: organiser || '',
    hostId,
    avatar: initial,
    avatarColor: avatarColorForId(hostId),
    maxQty: maxEventQuantity(a, l.capacity),
    color: '#0b1224',
    accent: '#2563eb',
  };
}

export function mapBookingListingsToEvents(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list.map(mapBookingListingToEvent).filter(Boolean);
}
