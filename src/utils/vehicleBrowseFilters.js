/**
 * Vehicle browse filter helpers (Phase 4).
 * Client-side narrowing for category / seats / price.
 * Server receives q, min_price, max_price — seats stay client-only because
 * booking_listing.capacity is concurrent units (always 1 for vehicles), while
 * passenger seats live in attributes.seats.
 */

export function parseOptionalNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function buildVehicleListingsQuery({
  vertical = 'vehicle',
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
  // Do NOT map seats → min_guests / capacity. Capacity is concurrent units for
  // vehicles (always 1); seats filtering is client-side on attributes.seats.
  return params;
}

export function vehicleMatchesPrice(vehicle, minPrice, maxPrice) {
  const price = Number(vehicle?.priceDay ?? vehicle?.pricePerDay ?? vehicle?.price ?? NaN);
  if (!Number.isFinite(price)) return true;
  const minP = parseOptionalNumber(minPrice);
  const maxP = parseOptionalNumber(maxPrice);
  if (minP != null && price < minP) return false;
  if (maxP != null && price > maxP) return false;
  return true;
}

export function vehicleMatchesSeats(vehicle, minSeats) {
  const need = parseOptionalNumber(minSeats);
  if (need == null || need <= 1) return true;
  const seats = Number(vehicle?.seats ?? NaN);
  if (!Number.isFinite(seats)) return true;
  return seats >= need;
}

/** Soft browse dates are availability intent only — they do not narrow the grid. */
export function vehicleBrowseFiltersActive({ query, category, minPrice, maxPrice, minSeats } = {}) {
  return Boolean(
    (query && String(query).trim())
    || (category && category !== 'all')
    || parseOptionalNumber(minPrice) != null
    || parseOptionalNumber(maxPrice) != null
    || (parseOptionalNumber(minSeats) != null && parseOptionalNumber(minSeats) > 1)
  );
}

export function filterVehicleListings(listings, {
  category = 'all',
  categories = [],
  query = '',
  minPrice,
  maxPrice,
  minSeats,
  matchesCategoryFn,
} = {}) {
  const list = Array.isArray(listings) ? listings : [];
  const q = String(query || '').trim().toLowerCase();
  return list.filter((vehicle) => {
    const matchCat = typeof matchesCategoryFn === 'function'
      ? matchesCategoryFn(category, vehicle.category, categories)
      : !category || category === 'all' || vehicle.category === category;
    // make/model are also searchable on the server for vertical=vehicle; keep
    // client arms so already-fetched rows still match after local re-filter.
    const matchQ = !q
      || String(vehicle.name || '').toLowerCase().includes(q)
      || String(vehicle.location || '').toLowerCase().includes(q)
      || String(vehicle.make || '').toLowerCase().includes(q)
      || String(vehicle.model || '').toLowerCase().includes(q);
    return matchCat && matchQ && vehicleMatchesPrice(vehicle, minPrice, maxPrice) && vehicleMatchesSeats(vehicle, minSeats);
  });
}
