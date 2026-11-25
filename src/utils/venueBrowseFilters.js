/**
 * Venue browse filter helpers (Phase 4).
 * Server receives q, min_price, max_price.
 * Attendees stay client-only: booking_listing.capacity is concurrent units
 * (always 1 for venues after Phase 0b); people live in attributes.max_attendees
 * (mapped as venue.capacity).
 */

export function parseOptionalNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function buildVenueListingsQuery({
  vertical = 'venue',
  q = '',
  minPrice,
  maxPrice,
  limit = 100,
} = {}) {
  const params = { vertical, limit };
  const query = String(q || '').trim();
  if (query) params.q = query;
  const minP = parseOptionalNumber(minPrice);
  const maxP = parseOptionalNumber(maxPrice);
  if (minP != null && minP >= 0) params.min_price = minP;
  if (maxP != null && maxP >= 0) params.max_price = maxP;
  // Do NOT map attendees → min_guests / capacity. Capacity is concurrent units
  // for venues (always 1); attendees filtering is client-side on mapped capacity.
  return params;
}

export function venueMatchesPrice(venue, minPrice, maxPrice) {
  const price = Number(venue?.price ?? NaN);
  if (!Number.isFinite(price)) return true;
  const minP = parseOptionalNumber(minPrice);
  const maxP = parseOptionalNumber(maxPrice);
  if (minP != null && price < minP) return false;
  if (maxP != null && price > maxP) return false;
  return true;
}

/** Match on mapped attendees (attributes.max_attendees → venue.capacity). */
export function venueMatchesAttendees(venue, minAttendees) {
  const need = parseOptionalNumber(minAttendees);
  if (need == null || need <= 1) return true;
  const cap = Number(venue?.capacity ?? NaN);
  if (!Number.isFinite(cap)) return true;
  return cap >= need;
}

/** Soft event date is availability intent only — does not narrow the grid. */
export function venueBrowseFiltersActive({
  query,
  category,
  minPrice,
  maxPrice,
  minAttendees,
} = {}) {
  return Boolean(
    (query && String(query).trim())
    || (category && category !== 'all')
    || parseOptionalNumber(minPrice) != null
    || parseOptionalNumber(maxPrice) != null
    || (parseOptionalNumber(minAttendees) != null && parseOptionalNumber(minAttendees) > 1)
  );
}

export function filterVenueListings(listings, {
  category = 'all',
  categories = [],
  query = '',
  minPrice,
  maxPrice,
  minAttendees,
  matchesCategoryFn,
} = {}) {
  const list = Array.isArray(listings) ? listings : [];
  const q = String(query || '').trim().toLowerCase();
  return list.filter((venue) => {
    const matchCat = typeof matchesCategoryFn === 'function'
      ? matchesCategoryFn(category, venue.category, categories)
      : !category || category === 'all' || venue.category === category;
    const matchQ = !q
      || String(venue.name || '').toLowerCase().includes(q)
      || String(venue.location || '').toLowerCase().includes(q);
    return matchCat
      && matchQ
      && venueMatchesPrice(venue, minPrice, maxPrice)
      && venueMatchesAttendees(venue, minAttendees);
  });
}
