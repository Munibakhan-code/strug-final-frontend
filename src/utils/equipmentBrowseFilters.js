/**
 * Equipment browse filter helpers (Phase 4).
 * Server: q, min_price, max_price. Client: category + price guard on fetched rows.
 */

export function parseOptionalNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function buildEquipmentListingsQuery({
  vertical = 'equipment',
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
  return params;
}

export function equipmentMatchesPrice(item, minPrice, maxPrice) {
  const price = Number(item?.priceDay ?? item?.price ?? NaN);
  if (!Number.isFinite(price)) return true;
  const minP = parseOptionalNumber(minPrice);
  const maxP = parseOptionalNumber(maxPrice);
  if (minP != null && price < minP) return false;
  if (maxP != null && price > maxP) return false;
  return true;
}

/** Soft browse dates are availability intent only — they do not narrow the grid. */
export function equipmentBrowseFiltersActive({ query, category, minPrice, maxPrice } = {}) {
  return Boolean(
    (query && String(query).trim())
    || (category && category !== 'all')
    || parseOptionalNumber(minPrice) != null
    || parseOptionalNumber(maxPrice) != null,
  );
}

export function filterEquipmentListings(listings, {
  category = 'all',
  categories = [],
  query = '',
  minPrice,
  maxPrice,
  matchesCategoryFn,
} = {}) {
  const list = Array.isArray(listings) ? listings : [];
  const q = String(query || '').trim().toLowerCase();
  return list.filter((item) => {
    const matchCat = typeof matchesCategoryFn === 'function'
      ? matchesCategoryFn(category, item.category, categories)
      : !category || category === 'all' || item.category === category;
    const matchQ = !q
      || String(item.name || '').toLowerCase().includes(q)
      || String(item.category || '').toLowerCase().includes(q)
      || String(item.location || '').toLowerCase().includes(q)
      || String(item.brand || '').toLowerCase().includes(q);
    return matchCat && matchQ && equipmentMatchesPrice(item, minPrice, maxPrice);
  });
}
