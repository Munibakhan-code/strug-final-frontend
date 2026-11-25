/**
 * Shop browse isolation — exclude listings tagged for other commerce verticals.
 * Shop sellers may use custom categories (Clothing, etc.); we exclude known vertical types.
 */
export const SHOP_BROWSE_EXCLUDED_PRODUCT_TYPES =
  /^(secondhand|wedding|decor|digitalproducts|books|discounts)$/i;

export function normalizeProductTypeName(name) {
  return String(name ?? '').replace(/\s+/g, '').toLowerCase();
}

export function isShopBrowseListing(listing) {
  const typeName = listing?.product_type?.product_type_name ?? '';
  return !SHOP_BROWSE_EXCLUDED_PRODUCT_TYPES.test(normalizeProductTypeName(typeName));
}

export function filterListingsForShopBrowse(listings) {
  return (Array.isArray(listings) ? listings : []).filter(isShopBrowseListing);
}

/** Public product-listing query params for the Shop buyer page. */
export function shopBrowseListingParams({ userLat, userLng } = {}) {
  return {
    public: 'true',
    ...(Number.isFinite(userLat) && Number.isFinite(userLng) ? { lat: userLat, lng: userLng } : {}),
  };
}
