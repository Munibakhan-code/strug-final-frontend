/**
 * Temp Stay browse filter helpers (Phase 4).
 * Client-side narrowing for category / guests / price / dates intent.
 * Server may also receive q, min_price, max_price, min_guests via listing query.
 */

export function parseOptionalNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Build query params for GET /booking/listings (tempstay browse). */
export function buildTempStayListingsQuery({
  vertical = 'tempstay',
  q = '',
  minPrice,
  maxPrice,
  minGuests,
  limit = 100,
} = {}) {
  const params = { vertical, limit };
  const query = String(q || '').trim();
  if (query) params.q = query;
  const minP = parseOptionalNumber(minPrice);
  const maxP = parseOptionalNumber(maxPrice);
  const guests = parseOptionalNumber(minGuests);
  if (minP != null && minP >= 0) params.min_price = minP;
  if (maxP != null && maxP >= 0) params.max_price = maxP;
  // Default browse uses guests=1; only send min_guests when the user actually
  // raised the filter. Prisma capacity: { gte: 1 } excludes NULL capacity rows.
  if (guests != null && guests > 1) params.min_guests = Math.floor(guests);
  return params;
}

export function listingMatchesPrice(listing, minPrice, maxPrice) {
  const price = Number(listing?.priceNum ?? listing?.price ?? NaN);
  if (!Number.isFinite(price)) return true; // keep unknown-priced listings
  const minP = parseOptionalNumber(minPrice);
  const maxP = parseOptionalNumber(maxPrice);
  if (minP != null && price < minP) return false;
  if (maxP != null && price > maxP) return false;
  return true;
}

export function listingMatchesGuests(listing, minGuests) {
  const need = parseOptionalNumber(minGuests);
  // Align with browseFiltersActive / buildTempStayListingsQuery: guests=1 is default, not a filter.
  if (need == null || need <= 1) return true;
  // NOT listing.capacity — that column means concurrent bookable units to the booking engine
  // and is pinned to 1 for stays, so reading it here would hide every listing the moment the
  // user raised the guest filter. The guest count lives in attributes.max_guests.
  const cap = Number(listing?.guests ?? listing?.max_guests ?? NaN);
  if (!Number.isFinite(cap)) return true; // keep unknown-capacity listings visible
  return cap >= need;
}

/**
 * Date filters on browse are soft: listings stay visible; detail enforces availability.
 * Kept for saved-search payload + future BE date narrowing.
 */
export function browseFiltersActive({ query, category, minPrice, maxPrice, minGuests, checkIn, checkOut } = {}) {
  return Boolean(
    (query && String(query).trim())
    || (category && category !== 'all')
    || parseOptionalNumber(minPrice) != null
    || parseOptionalNumber(maxPrice) != null
    || (parseOptionalNumber(minGuests) != null && parseOptionalNumber(minGuests) > 1)
    || (checkIn && String(checkIn).trim())
    || (checkOut && String(checkOut).trim()),
  );
}

export function filterTempStayListings(listings, {
  category = 'all',
  categories = [],
  query = '',
  minPrice,
  maxPrice,
  minGuests,
  matchesCategoryFn,
} = {}) {
  const list = Array.isArray(listings) ? listings : [];
  const q = String(query || '').trim().toLowerCase();
  return list.filter((l) => {
    const matchCat = typeof matchesCategoryFn === 'function'
      ? matchesCategoryFn(category, l.category, categories)
      : !category || category === 'all' || l.category === category;
    const matchQ = !q
      || String(l.name || '').toLowerCase().includes(q)
      || String(l.location || '').toLowerCase().includes(q);
    return matchCat && matchQ && listingMatchesPrice(l, minPrice, maxPrice) && listingMatchesGuests(l, minGuests);
  });
}
