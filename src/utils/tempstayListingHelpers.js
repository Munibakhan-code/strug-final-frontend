/**
 * Temp Stay listing mapping / booking UI helpers (#1597–1613).
 * Pure functions — keep guest surfaces aligned with booking-engine attributes.
 */

/** Browse chip match strings (must stay in sync with TEMPSTAY_CATEGORY_DEFS in TempStay.jsx). */
export const TEMPSTAY_CATEGORY_MATCHES = Object.freeze([
  'Entire Home',
  'Private Room',
  'Shared Room',
  'Cabin',
  'Beachfront',
  'Luxury',
  'Unique',
]);

const CATEGORY_SET = new Set(TEMPSTAY_CATEGORY_MATCHES.map((c) => c.toLowerCase()));

/** Map free-text / legacy property_type into a browse chip when possible. */
const PROPERTY_TYPE_ALIASES = Object.freeze({
  apartment: 'Entire Home',
  house: 'Entire Home',
  condo: 'Entire Home',
  condominium: 'Entire Home',
  loft: 'Entire Home',
  townhouse: 'Entire Home',
  'entire home': 'Entire Home',
  'entire place': 'Entire Home',
  'private room': 'Private Room',
  'shared room': 'Shared Room',
  cabin: 'Cabin',
  cottage: 'Cabin',
  beachfront: 'Beachfront',
  luxury: 'Luxury',
  unique: 'Unique',
});

/**
 * Resolve browse category from attributes. Never invent "Entire Home" for unknown types.
 * Prefer explicit `category`; fall back to aliased `property_type` only when it maps cleanly.
 */
export function resolveTempStayCategory(attributes = {}) {
  const a = attributes && typeof attributes === 'object' ? attributes : {};
  const rawCat = a.category != null ? String(a.category).trim() : '';
  if (rawCat) {
    if (CATEGORY_SET.has(rawCat.toLowerCase())) {
      return TEMPSTAY_CATEGORY_MATCHES.find((c) => c.toLowerCase() === rawCat.toLowerCase()) || rawCat;
    }
    const aliased = PROPERTY_TYPE_ALIASES[rawCat.toLowerCase()];
    if (aliased) return aliased;
    return rawCat;
  }
  const prop = a.property_type != null ? String(a.property_type).trim() : '';
  if (!prop) return null;
  if (CATEGORY_SET.has(prop.toLowerCase())) {
    return TEMPSTAY_CATEGORY_MATCHES.find((c) => c.toLowerCase() === prop.toLowerCase()) || prop;
  }
  return PROPERTY_TYPE_ALIASES[prop.toLowerCase()] || null;
}

/** Party-size max for the guest stepper. Never returns null (avoids Math.min(null) → 0). */
export function maxGuestsForListing(listing, fallback = 16) {
  const n = Number(listing?.guests ?? listing?.max_guests);
  if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  return fallback;
}

/** Lat/lng for map pins — omit when missing/invalid (do not invent Toronto). */
export function parseListingCoords(attrsOrListing = {}, listing = null) {
  // Accept either a flat attributes bag, or a listing row that nests `attributes`.
  const nested = attrsOrListing?.attributes && typeof attrsOrListing.attributes === 'object'
    ? attrsOrListing.attributes
    : null;
  const a = nested || (attrsOrListing && typeof attrsOrListing === 'object' ? attrsOrListing : {});
  const l = listing || (nested ? attrsOrListing : {}) || {};
  const latRaw = a.lat ?? l.latitude ?? l.lat;
  const lngRaw = a.lng ?? l.longitude ?? l.lng;
  const lat = latRaw != null && latRaw !== '' ? Number(latRaw) : NaN;
  const lng = lngRaw != null && lngRaw !== '' ? Number(lngRaw) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { lat: null, lng: null };
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { lat: null, lng: null };
  return { lat, lng };
}

export function listingHasMapCoords(listing) {
  return Number.isFinite(listing?.lat) && Number.isFinite(listing?.lng);
}

/** Amenities: only what the host stored — never a hardcoded default set. */
export function amenitiesFromListing(listing) {
  const raw = listing?.amenities;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x).trim()).filter(Boolean);
}

/** Estimate breakdown from listing fee attrs when quote is not yet loaded (preview only). */
export function clientFeePreview(nights, pricePerNight, listing = {}) {
  const nightsN = Math.max(0, Number(nights) || 0);
  const price = Number(pricePerNight) || 0;
  const subtotal = nightsN * price;
  const cleaning = Number(listing.cleaning_fee);
  const pct = Number(listing.service_fee_pct);
  const cleaningFee = Number.isFinite(cleaning) && cleaning >= 0 ? cleaning : null;
  const serviceFee = Number.isFinite(pct) && pct >= 0 ? Math.round(subtotal * (pct / 100)) : null;
  const total = cleaningFee != null && serviceFee != null
    ? subtotal + cleaningFee + serviceFee
    : null;
  return { subtotal, cleaningFee, serviceFee, total };
}

/** True when an ISO date (YYYY-MM-DD) is a blocked night. */
export function isUnavailableNight(isoDate, unavailableSet) {
  if (!isoDate || !unavailableSet) return false;
  return unavailableSet.has(String(isoDate).slice(0, 10));
}

/** First N images for the Airbnb-style 5-up hero grid. */
export function galleryGridImages(images, maxVisible = 5) {
  if (!Array.isArray(images) || !images.length) return [];
  const n = Math.max(1, Math.floor(Number(maxVisible)) || 5);
  return images.slice(0, n);
}

/** Count of gallery images beyond the visible grid (for \"Show all\" overlay). */
export function galleryExtraPhotoCount(images, maxVisible = 5) {
  if (!Array.isArray(images)) return 0;
  const n = Math.max(1, Math.floor(Number(maxVisible)) || 5);
  return Math.max(0, images.length - n);
}

export function galleryHasExtraPhotos(images, maxVisible = 5) {
  return galleryExtraPhotoCount(images, maxVisible) > 0;
}
