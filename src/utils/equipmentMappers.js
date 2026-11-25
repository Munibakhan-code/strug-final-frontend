/**
 * Equipment rental listing mappers (Phase 0).
 * Honest API → UI mapping: no fake ratings / featured / tags when attributes are missing.
 * capacity = concurrent bookable copies (multi-unit); do not invent a default.
 */
import { mediaUrls } from './mediaUrl.js';

const AVATAR_COLORS = ['#2563eb', '#f97316', '#7c3aed', '#059669', '#db2777'];

export function avatarColorForId(id) {
  const n = Number(id) || 0;
  return AVATAR_COLORS[Math.abs(n) % AVATAR_COLORS.length];
}

/** Concurrent bookable copies from listing.capacity — null when unknown. */
export function resolveEquipmentCapacity(l) {
  if (!l || l.capacity == null || l.capacity === '') return null;
  const n = Number(l.capacity);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Max copies a guest may request (engine treats missing capacity as 1). */
export function maxEquipmentQuantity(capacity) {
  if (capacity == null || capacity === '') return 1;
  const n = Number(capacity);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

export function clampEquipmentQuantity(qty, capacity) {
  const max = maxEquipmentQuantity(capacity);
  const q = Math.floor(Number(qty));
  if (!Number.isFinite(q) || q < 1) return 1;
  return Math.min(q, max);
}

export function equipmentShowsQuantityStepper(capacity) {
  return maxEquipmentQuantity(capacity) > 1;
}

/**
 * Map one booking_listing row (vertical=equipment) to the Equipment card/detail shape.
 */
export function mapBookingListingToEquipment(l) {
  if (!l) return null;
  const a = l.attributes ?? {};
  const imgs = mediaUrls(l.images);
  const price = Number(l.price) || 0;
  const depositRaw = l.deposit_amount;
  const deposit = depositRaw != null && Number.isFinite(Number(depositRaw)) ? Number(depositRaw) : 0;
  const capacity = resolveEquipmentCapacity(l);
  const ratingRaw = a.rating;
  const rating = ratingRaw != null && Number.isFinite(Number(ratingRaw)) ? Number(ratingRaw) : null;
  const reviewsRaw = a.reviews ?? a.review_count;
  const reviews = reviewsRaw != null && Number.isFinite(Number(reviewsRaw)) ? Number(reviewsRaw) : null;
  const hostName = a.host ?? a.host_name ?? l.host_name ?? null;
  const hostId = l.owner_id ?? l.user_id ?? null;
  const initial = (hostName || 'E').toString().trim().charAt(0).toUpperCase() || 'E';
  const categoryRaw = a.category;
  const category = typeof categoryRaw === 'string' && categoryRaw.trim()
    ? categoryRaw.trim()
    : 'General';
  const brand = typeof a.brand === 'string' && a.brand.trim() ? a.brand.trim() : null;
  const condition = typeof a.condition === 'string' && a.condition.trim() ? a.condition.trim() : null;
  const rules = typeof a.rules === 'string' && a.rules.trim() ? a.rules.trim() : null;

  return {
    id: l.booking_listing_id ?? l.listing_id ?? l.id,
    name: l.title || 'Equipment',
    category,
    priceDay: price,
    deposit,
    capacity,
    capacityKnown: capacity != null,
    available: l.is_active !== false,
    featured: Boolean(a.featured),
    gradient: 'linear-gradient(135deg,#1e3a5f,#2563eb)',
    tags: Array.isArray(a.tags) ? a.tags : [],
    description: l.description ?? null,
    rules,
    brand,
    condition,
    location: l.location || '',
    rating,
    reviews,
    hostId,
    host: hostName,
    avatar: initial,
    avatarColor: avatarColorForId(hostId),
    image: imgs[0] ?? null,
    images: imgs,
    instant_booking: Boolean(l.instant_book),
  };
}

export function mapBookingListingsToEquipment(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list.map(mapBookingListingToEquipment).filter(Boolean);
}
