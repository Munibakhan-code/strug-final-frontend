/**
 * Vehicle rental listing mappers (Phases 0–1).
 * Honest API → UI mapping: no fake rating/distance/trips when attributes are missing.
 */
import { mediaUrls } from './mediaUrl.js';

const AVATAR_COLORS = ['#2563eb', '#f97316', '#7c3aed', '#059669', '#db2777'];

export function avatarColorForId(id) {
  const n = Number(id) || 0;
  return AVATAR_COLORS[Math.abs(n) % AVATAR_COLORS.length];
}

/**
 * Map one booking_listing row (vertical=vehicle) to the VehicleRental card/detail shape.
 */
export function mapBookingListingToVehicle(l) {
  if (!l) return null;
  const a = l.attributes ?? {};
  const imgs = mediaUrls(l.images);
  const price = Number(l.price) || 0;
  const seatsRaw = a.seats ?? a.max_guests;
  const seats = seatsRaw != null && Number.isFinite(Number(seatsRaw)) ? Number(seatsRaw) : null;
  const transmissionRaw = a.transmission;
  const transmission = typeof transmissionRaw === 'string' && transmissionRaw.trim()
    ? transmissionRaw.trim()
    : null;
  const ratingRaw = a.rating;
  const rating = ratingRaw != null && Number.isFinite(Number(ratingRaw)) ? Number(ratingRaw) : null;
  const tripsRaw = a.trips ?? a.trip_count ?? a.booking_count;
  const trips = tripsRaw != null && Number.isFinite(Number(tripsRaw)) ? Number(tripsRaw) : null;
  const distance = typeof a.distance === 'string' && a.distance.trim()
    ? a.distance.trim()
    : (a.distance_km != null && Number.isFinite(Number(a.distance_km))
      ? `${Number(a.distance_km).toFixed(1)} km`
      : null);
  const hostName = a.host ?? a.host_name ?? l.host_name ?? null;
  const hostId = l.owner_id ?? l.user_id ?? null;
  const initial = (hostName || 'H').toString().trim().charAt(0).toUpperCase() || 'H';

  return {
    id: l.booking_listing_id ?? l.listing_id ?? l.id,
    name: l.title || 'Vehicle',
    category: a.category || a.type || 'Car',
    priceDay: price,
    pricePerDay: price,
    year: a.year ?? '',
    location: l.location || '',
    rating,
    reviews: (() => {
      const raw = a.reviews ?? a.review_count;
      return raw != null && Number.isFinite(Number(raw)) ? Number(raw) : null;
    })(),
    featured: Boolean(a.featured),
    gradient: 'linear-gradient(135deg,#0c1a2e,#2563eb)',
    image: imgs[0] ?? null,
    images: imgs,
    features: Array.isArray(a.features) ? a.features : [],
    tags: Array.isArray(a.tags) ? a.tags : [],
    seats,
    seatsKnown: seats != null,
    transmission,
    transmissionKnown: transmission != null,
    make: a.make ?? null,
    model: a.model ?? null,
    description: l.description ?? null,
    rules: a.rules ?? null,
    hostId,
    host: hostName,
    avatar: initial,
    avatarColor: avatarColorForId(hostId),
    distance,
    trips,
  };
}

export function mapBookingListingsToVehicles(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list.map(mapBookingListingToVehicle).filter(Boolean);
}
