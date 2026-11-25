/**
 * Buyer-facing shop availability helpers (Phase 3).
 * Aligns with Food restaurant.open semantics on store_profile.is_open.
 */

/** Store is visible and can accept orders. */
export function shopCanAcceptOrders(shop) {
  if (!shop) return false;
  if (shop.isActive === false) return false;
  if (shop.isOpen === false) return false;
  return true;
}

/** Product can be added to cart for the given shop. */
export function productCanAddToCart(product, shop) {
  if (!shopCanAcceptOrders(shop)) return false;
  if (product?.isInStock === false) return false;
  return true;
}

/** Resolve is_open from store profile with Food-style default (open unless explicitly false). */
export function storeIsOpenFromProfile(storeProfile) {
  return storeProfile?.is_open !== false;
}
