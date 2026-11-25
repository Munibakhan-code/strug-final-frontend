/**
 * Phase 8 — shared helpers for Shop-family commerce verticals
 * (Second Hand, Decor, Wedding, Discounts; Digital Products + Books stay on dg-content
 * until a deliberate product_listing migration lands).
 */

import {
  mapListingsToProducts,
  mapListingsToLocalShops,
  storeThumbFromProfile,
} from './shopMappers.js';
import { normalizeProductTypeName } from './shopBrowseHelpers.js';
import { getLocationItem } from './userLocation.js';

// Reads default through the per-account (guest → per-tab) location namespacing helper so buyer
// coords never bleed across accounts. Tests may inject a plain `{ getItem }` to bypass it.
const namespacedLocationStore = { getItem: (base) => getLocationItem(base) };

/** Canonical product_type_name values for each vertical (API `type=` filter). */
export const VERTICAL_PRODUCT_TYPE = Object.freeze({
  shop: 'Shop',
  secondhand: 'SecondHand',
  wedding: 'Wedding',
  decor: 'Decor',
  books: 'Books',
  digitalproducts: 'DigitalProducts',
  discounts: 'Discounts',
});

/** Public listing query for a typed vertical (+ optional buyer geo). */
export function verticalBrowseListingParams(productTypeName, { userLat, userLng } = {}) {
  return {
    public: 'true',
    ...(productTypeName ? { type: productTypeName } : {}),
    ...(Number.isFinite(userLat) && Number.isFinite(userLng)
      ? { lat: userLat, lng: userLng }
      : {}),
  };
}

/** Read buyer coords (same keys Shop checkout uses), namespaced per account / guest tab. */
export function readBuyerBrowseCoords(storage = namespacedLocationStore) {
  const lat = parseFloat(storage?.getItem?.('strug_user_lat'));
  const lng = parseFloat(storage?.getItem?.('strug_user_lng'));
  return {
    userLat: Number.isFinite(lat) ? lat : null,
    userLng: Number.isFinite(lng) ? lng : null,
  };
}

/**
 * Resolve product_type_id by name (ids are not stable across envs).
 * Expects rows shaped like `{ product_type_id, product_type_name }`.
 */
export function resolveProductTypeIdByName(types, name) {
  const want = normalizeProductTypeName(name);
  if (!want) return null;
  const list = Array.isArray(types) ? types : [];
  const row = list.find(
    (t) => normalizeProductTypeName(t?.product_type_name) === want,
  );
  const id = row?.product_type_id;
  return Number.isFinite(Number(id)) ? Number(id) : null;
}

/**
 * Map product_listing rows → { products, shops } using Shop mappers.
 * Shops keep seller_id as id so FoodCheckoutPage sellerId works.
 */
export function mapListingsToVerticalCatalog(listings, options = {}) {
  const {
    userLat,
    userLng,
    query = '',
    hideStoresWithoutCoords = false,
    excludeTestNames = true,
    defaultCondition = null,
  } = options;

  const list = Array.isArray(listings) ? listings : [];
  const byListingId = new Map(list.map((l) => [l?.listing_id, l]));
  const products = mapListingsToProducts(list, {
    userLat,
    userLng,
    hideStoresWithoutCoords,
  }).map((p) => {
    const listing = byListingId.get(p.id);
    // Typed verticals lock product_type_name (Decor/Wedding/…); browse chips use
    // variation.vname as the subcategory when set.
    const browseCat = String(listing?.product_variation?.[0]?.vname || '').trim();
    const typeName = String(listing?.product_type?.product_type_name || '').toLowerCase();
    const useVname =
      browseCat &&
      ['decor', 'wedding', 'secondhand', 'discounts'].includes(typeName);
    return {
      ...p,
      ...(useVname ? { category: browseCat } : {}),
      product_type_id:
        listing?.product_type_id ?? listing?.product_type?.product_type_id ?? null,
      // Vertical UIs historically used originalPrice / condition / avatar helpers.
      title: p.name,
      cover: p.thumb,
      originalPrice: p.discountPct > 0 ? p.origPrice : null,
      condition: defaultCondition,
      avatar: String(p.seller || 'S').charAt(0).toUpperCase(),
      avatarColor: avatarColorForId(p.seller_id),
    };
  });

  const shops = mapListingsToLocalShops(products, {
    query,
    excludeTestNames,
  }).map((shop) => {
    const sp = shop.products?.[0]?.storeProfile;
    return {
      ...shop,
      owner_id: shop.id,
      avatar: String(shop.name || 'S').charAt(0).toUpperCase(),
      avatarColor: avatarColorForId(shop.id),
      accent: '#2563eb',
      fee: shop.fee && shop.fee !== 'Free' ? shop.fee : (shop.fee ?? '—'),
      eta: shop.delivery ?? '—',
      color: '#13131f',
      reviews: null,
      productCount: shop.products?.length ?? 0,
      thumb: storeThumbFromProfile(sp, shop.thumb),
    };
  });

  return { products, shops };
}

const AVATAR_COLORS = ['#db2877', '#7c3aed', '#d97706', '#0891b2', '#059669', '#dc2626', '#2563eb'];

export function avatarColorForId(id) {
  const n = Math.abs(Number(id) || String(id || '').length || 0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

/** Cart line shape expected by FoodCartPage / FoodCheckoutPage. */
export function mapVerticalProductToCartLine(product, qty = 1) {
  return {
    lineId: product.id,
    id: product.id,
    variation_id: product.variation_id ?? null,
    seller_id: product.seller_id ?? null,
    name: product.name || product.title,
    title: product.title || product.name,
    price: product.price,
    qty,
    gradient: product.thumb || product.cover || product.gradient,
    thumb: product.thumb,
    extras: [],
    product_type_id: product.product_type_id ?? null,
  };
}

/**
 * Prefer product_type_id already on cart lines (from product_listing), then a
 * name-resolved fallback. Never invent Clothing/type 1.
 */
export function pickCheckoutProductTypeId(cart, fallbackTypeId = null) {
  for (const line of Array.isArray(cart) ? cart : []) {
    const id = Number(line?.product_type_id);
    if (Number.isFinite(id) && id > 0) return id;
  }
  const fb = Number(fallbackTypeId);
  return Number.isFinite(fb) && fb > 0 ? fb : null;
}

/**
 * onPlaceOrder handler — capture real product order id + optional delivery mode,
 * then advance view (typically to "tracking").
 */
export function createVerticalPlaceOrderHandler({ setOrderId, setDeliveryMode, setView, trackingView = 'tracking' }) {
  return (orderId, deliveryMode) => {
    if (orderId != null && typeof setOrderId === 'function') setOrderId(orderId);
    if (deliveryMode != null && typeof setDeliveryMode === 'function') setDeliveryMode(deliveryMode);
    if (typeof setView === 'function') setView(trackingView);
  };
}

/** True when a listing's product_type matches a vertical type name (case-insensitive). */
export function listingMatchesVerticalType(listing, productTypeName) {
  const want = normalizeProductTypeName(productTypeName);
  if (!want) return true;
  const got = normalizeProductTypeName(listing?.product_type?.product_type_name);
  return got === want;
}

export function filterListingsByVerticalType(listings, productTypeName) {
  return (Array.isArray(listings) ? listings : []).filter((l) =>
    listingMatchesVerticalType(l, productTypeName),
  );
}
