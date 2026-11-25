/**
 * Venue listing mappers (Phase 0).
 * Honest API → UI mapping: no fake rating / capacity / host when attributes are missing.
 */
import { mediaUrls } from './mediaUrl.js';

const AVATAR_COLORS = ['#0891b2', '#2563eb', '#f97316', '#7c3aed', '#059669', '#db2777'];

export function avatarColorForId(id) {
  const n = Number(id) || 0;
  return AVATAR_COLORS[Math.abs(n) % AVATAR_COLORS.length];
}

/**
 * People-count for a venue (attendees), not concurrent bookable units.
 * After Phase 0b, listing.capacity is always 1 — read attributes only.
 * Never invent a default like 100.
 */
export function resolveVenueCapacity(_l, a = {}) {
  const raw = a.max_attendees ?? a.capacity;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Map one booking_listing row (vertical=venue) to the Venues card/detail shape.
 */
export function mapBookingListingToVenue(l) {
  if (!l) return null;
  const a = l.attributes ?? {};
  const imgs = mediaUrls(l.images);
  const price = Number(l.price) || 0;
  const capacity = resolveVenueCapacity(l, a);
  const ratingRaw = a.rating;
  const rating = ratingRaw != null && Number.isFinite(Number(ratingRaw)) ? Number(ratingRaw) : null;
  const reviewsRaw = a.reviews ?? a.review_count;
  const reviews = reviewsRaw != null && Number.isFinite(Number(reviewsRaw)) ? Number(reviewsRaw) : null;
  const hostName = a.host ?? a.host_name ?? l.host_name ?? null;
  const hostId = l.owner_id ?? l.user_id ?? null;
  const initial = (hostName || 'V').toString().trim().charAt(0).toUpperCase() || 'V';
  // Guest chips match category; host form historically wrote venue_type.
  const categoryRaw = a.category ?? a.venue_type;
  const category = typeof categoryRaw === 'string' && categoryRaw.trim()
    ? categoryRaw.trim()
    : 'Venue';
  const squareFeetRaw = a.square_feet;
  const squareFeet = squareFeetRaw != null && Number.isFinite(Number(squareFeetRaw))
    ? Number(squareFeetRaw)
    : null;

  return {
    id: l.booking_listing_id ?? l.listing_id ?? l.id,
    name: l.title || 'Venue',
    category,
    capacity,
    capacityKnown: capacity != null,
    price,
    priceUnit: l.price_unit === 'hour' ? '/ hr' : '/ event',
    location: l.location || '',
    rating,
    reviews,
    amenities: (() => {
      if (Array.isArray(a.amenities)) return a.amenities;
      if (typeof a.amenities === 'string' && a.amenities.trim()) {
        return a.amenities.split(',').map((s) => s.trim()).filter(Boolean);
      }
      return [];
    })(),
    description: l.description ?? null,
    rules: a.rules ?? null,
    image: imgs[0] ?? null,
    images: imgs,
    color: '#001a1c',
    accent: '#0891b2',
    hostId,
    host: hostName,
    avatar: initial,
    avatarColor: avatarColorForId(hostId),
    featured: Boolean(a.featured),
    squareFeet,
    venueType: typeof a.venue_type === 'string' && a.venue_type.trim() ? a.venue_type.trim() : null,
    instantBook: Boolean(l.instant_book),
  };
}

export function mapBookingListingsToVenues(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list.map(mapBookingListingToVenue).filter(Boolean);
}
