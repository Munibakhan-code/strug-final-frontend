/**
 * Shop catalog mappers — single source of truth for API → buyer/seller UI shapes.
 *
 * ─── Data contract (GET /product-listing?public=true&lat=&lng=) ───────────────
 *
 * product_listing
 *   listing_id          number   — cart/order id for the listing row
 *   name                string?
 *   description         string?
 *   image_url           string?  — PRIMARY product image (seller upload lands here)
 *   availability        number?  — stock count; null = not tracked
 *   product_type        { product_type_name }
 *   product_variation[] { variation_id, price, discount_pct, image_url? }
 *   seller              { user_id, name, username, storeProfile? }
 *
 * store_profile (seller.storeProfile)
 *   store_name          string?
 *   address             string?
 *   lat, lng            number?  — required for geo proximity filter
 *   cover_url           string?  — storefront hero (wide)
 *   banner_url          string?  — wide banner (preferred over cover on cards)
 *   profile_pic_url     string?  — store logo
 *   is_active           boolean  — false hides store from public shop browse
 *   is_open             boolean  — false shows store as temporarily closed (Food-style)
 *   bio                 string?  — store description shown on buyer store page
 *   prep_time           string?  — JSON { returnPolicy, shippingInfo } (≤255 chars)
 *
 * Mapped UI product fields: id, variation_id, thumb, price, seller_id, storeProfile, …
 * Mapped UI shop fields:    id, name, thumb, lat, lng, products[], isActive, bio, …
 */

import { mediaUrl } from './mediaUrl.js';
import { haversineKm, foodStyleEtaMinutes } from './geo.js';
import { storeIsOpenFromProfile } from './shopAvailabilityHelpers.js';
import { parseStorePrepTime } from './shopSellerHelpers.js';
import { shopMatchesBuyerQuery } from './shopBuyerHelpers.js';

export { shopMatchesBuyerQuery } from './shopBuyerHelpers.js';

export const SHOP_DEFAULT_GRADIENT = 'linear-gradient(135deg,#1e3a8a,#2563eb)';
export const SHOP_MAX_BROWSE_DISTANCE_KM = 50;
export const SHOP_TEST_NAME_PATTERN = /test|playwright|faker|seed|demo|roel|luettgen/i;

/** Server-side geo filter radius (must stay aligned with backend product-listing-routes). */
export const SHOP_API_GEO_RADIUS_KM = 20;

/** Buyer-facing store copy from store_profile (+ prep_time policies). */
export function storeBuyerCopyFromProfile(sp) {
  const policies = parseStorePrepTime(sp?.prep_time);
  return {
    bio: sp?.bio || policies.description || null,
    returnPolicy: policies.returnPolicy || null,
    shippingInfo: policies.shippingInfo || null,
  };
}

/**
 * CSS background for a product card/detail.
 * Prefers listing.image_url, then first variation image.
 */
export function productImageUrlFromListing(listing) {
  const variation = listing?.product_variation?.[0];
  const raw = listing?.image_url || variation?.image_url;
  return raw ? mediaUrl(raw) : null;
}

export function productThumbFromListing(listing) {
  const resolved = productImageUrlFromListing(listing);
  if (!resolved) return SHOP_DEFAULT_GRADIENT;
  return `url("${resolved}") center/cover no-repeat`;
}

/**
 * CSS background for a store card / store-page hero.
 * Mirrors Food vendor thumb: banner → cover → logo → fallback.
 */
export function storeThumbFromProfile(storeProfile, fallbackThumb = null) {
  const raw =
    storeProfile?.banner_url ||
    storeProfile?.cover_url ||
    storeProfile?.profile_pic_url;
  if (raw) return `url("${mediaUrl(raw)}") center/cover no-repeat`;
  return fallbackThumb || SHOP_DEFAULT_GRADIENT;
}

/** Resolved absolute URL for a store branding asset (non-CSS). */
export function storeImageUrl(storeProfile, kind = 'banner') {
  const key =
    kind === 'logo'
      ? 'profile_pic_url'
      : kind === 'cover'
        ? 'cover_url'
        : 'banner_url';
  const raw =
    kind === 'banner'
      ? storeProfile?.banner_url || storeProfile?.cover_url || storeProfile?.profile_pic_url
      : storeProfile?.[key];
  return raw ? mediaUrl(raw) : null;
}

/** Apply listing-level sale discount to a variation unit price. */
export function effectiveUnitPrice(price, discountPct) {
  const orig = parseFloat(price) || 0;
  const pct = Math.max(0, Math.min(95, Math.round(Number(discountPct) || 0)));
  if (pct > 0) return Math.round(orig * (1 - pct / 100) * 100) / 100;
  return orig;
}

/** Map one API product_listing row → buyer UI product. */
export function mapListingToProduct(listing) {
  const variation = listing?.product_variation?.[0];
  const orig = parseFloat(variation?.price) || 0;
  const discountPct = Math.max(
    0,
    Math.min(95, Math.round(Number(variation?.discount_pct) || 0)),
  );
  const sp = listing?.seller?.storeProfile ?? null;

  return {
    id: listing?.listing_id,
    variation_id: variation?.variation_id ?? null,
    name: listing?.name ?? 'Product',
    description: listing?.description ?? '',
    seller: listing?.seller?.name ?? listing?.seller?.username ?? 'Seller',
    seller_id: listing?.seller?.user_id ?? listing?.seller_id ?? null,
    category: listing?.product_type?.product_type_name ?? 'General',
    product_type_id: listing?.product_type_id
      ?? listing?.product_type?.product_type_id
      ?? variation?.product_type_id
      ?? null,
    price: effectiveUnitPrice(orig, discountPct),
    origPrice: orig,
    discountPct,
    availability: listing?.availability ?? null,
    isInStock: listing?.availability == null || Number(listing.availability) > 0,
    storeIsActive: sp?.is_active !== false,
    storeIsOpen: storeIsOpenFromProfile(sp),
    rating: null,
    reviews: 0,
    thumb: productThumbFromListing(listing),
    imageUrl: productImageUrlFromListing(listing),
    lat: sp?.lat ?? null,
    lng: sp?.lng ?? null,
    storeProfile: sp,
    delivery: null,
    dist: null,
  };
}

/**
 * Map many listings; when the buyer's coords are known, enrich with distance and put nearby stores
 * first — with sellers who have NO store coords ranked last rather than hidden.
 *
 * `hideStoresWithoutCoords` is retained (default false) but should stay off for the storefront.
 * Turning it on erases any seller who never set their store location: their products disappear for
 * every located buyer while their own dashboard still looks healthy and nothing is logged anywhere.
 * Rank them last instead — findable, just never ahead of a shop that is genuinely nearby. A seller
 * who IS located but far away is still dropped by enrichProductsWithDistance; that is the point of
 * a geo filter. "We don't know where you are" and "we know, and you're far" are different things.
 */
export function mapListingsToProducts(listings, options = {}) {
  const { userLat, userLng, maxKm = SHOP_MAX_BROWSE_DISTANCE_KM, hideStoresWithoutCoords = false } =
    options;

  let products = (Array.isArray(listings) ? listings : []).map(mapListingToProduct);

  if (Number.isFinite(userLat) && Number.isFinite(userLng)) {
    products = enrichProductsWithDistance(products, userLat, userLng, { maxKm });
    if (hideStoresWithoutCoords) {
      products = products.filter(
        (p) => p.lat != null && p.lng != null,
      );
    } else {
      // Located stores (nearest first), then the unlocated ones. Array.prototype.sort is stable, so
      // each group keeps the relevance order the backend sent.
      products = [...products].sort((a, b) => {
        const da = a.dist == null ? Infinity : a.dist;
        const db = b.dist == null ? Infinity : b.dist;
        return da - db;
      });
    }
  }

  return products;
}

/**
 * Attach distance + Food-style delivery label to products that have store coords.
 * Drops products farther than maxKm when distance is known.
 */
export function enrichProductsWithDistance(products, userLat, userLng, options = {}) {
  const { maxKm = SHOP_MAX_BROWSE_DISTANCE_KM } = options;
  if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) {
    return products.map((p) => ({ ...p, dist: null, delivery: p.delivery ?? '—' }));
  }

  return products
    .map((p) => {
      if (p.lat == null || p.lng == null) {
        return { ...p, dist: null, delivery: p.delivery ?? '—' };
      }
      const dist = haversineKm(userLat, userLng, p.lat, p.lng);
      if (dist == null) return { ...p, dist: null, delivery: '—' };
      const eta = foodStyleEtaMinutes(dist);
      const delivery =
        eta != null
          ? `${Math.max(eta - 3, 1)}–${eta + 5} min (${dist.toFixed(1)} km)`
          : '—';
      return { ...p, dist, delivery };
    })
    .filter((p) => p.dist == null || p.dist <= maxKm);
}

/** Build a buyer-facing shop object from one mapped product (deep-link / cold load). */
export function mapProductToSelectedShop(product, options = {}) {
  const sp = product?.storeProfile;
  const copy = storeBuyerCopyFromProfile(sp);
  const { rating = null, fee = null } = options;
  return {
    id: product.seller_id,
    name: sp?.store_name || product.seller,
    thumb: storeThumbFromProfile(sp, product.thumb),
    logoUrl: storeImageUrl(sp, 'logo'),
    coverUrl: storeImageUrl(sp, 'cover'),
    bannerUrl: storeImageUrl(sp, 'banner'),
    heroUrl: storeImageUrl(sp, 'banner'),
    img: storeImageUrl(sp, 'logo'),
    rating,
    delivery: product.delivery ?? '—',
    fee: fee ?? copy.shippingInfo ?? '—',
    lat: product.lat ?? null,
    lng: product.lng ?? null,
    isActive: product.storeIsActive !== false,
    isOpen: product.storeIsOpen !== false,
    dist: product.dist ?? null,
    bio: copy.bio,
    returnPolicy: copy.returnPolicy,
    shippingInfo: copy.shippingInfo,
    products: [product],
  };
}

/** Group mapped products into per-seller local shop objects. */
export function mapListingsToLocalShops(products, options = {}) {
  const {
    query = '',
    excludeTestNames = true,
    testPattern = SHOP_TEST_NAME_PATTERN,
  } = options;

  const bySeller = new Map();

  for (const p of products) {
    if (!p.seller_id) continue;

    if (!bySeller.has(p.seller_id)) {
      const sp = p.storeProfile;
      const copy = storeBuyerCopyFromProfile(sp);
      bySeller.set(p.seller_id, {
        id: p.seller_id,
        name: sp?.store_name || p.seller,
        thumb: storeThumbFromProfile(sp, p.thumb),
        logoUrl: storeImageUrl(sp, 'logo'),
        coverUrl: storeImageUrl(sp, 'cover'),
        bannerUrl: storeImageUrl(sp, 'banner'),
        heroUrl: storeImageUrl(sp, 'banner'),
        img: storeImageUrl(sp, 'logo'),
        rating: null,
        delivery: p.delivery ?? '—',
        fee: copy.shippingInfo || '—',
        lat: p.lat ?? null,
        lng: p.lng ?? null,
        isActive: p.storeIsActive !== false,
        isOpen: p.storeIsOpen !== false,
        dist: p.dist ?? null,
        bio: copy.bio,
        returnPolicy: copy.returnPolicy,
        shippingInfo: copy.shippingInfo,
        products: [],
      });
    }

    const shop = bySeller.get(p.seller_id);
    if (p.dist != null && (shop.dist == null || p.dist < shop.dist)) {
      shop.dist = p.dist;
      shop.delivery = p.delivery ?? shop.delivery;
    }
    shop.products.push(p);
  }

  let shops = Array.from(bySeller.values());

  if (excludeTestNames) {
    shops = shops.filter((s) => !testPattern.test(s.name));
  }

  if (query) {
    shops = shops.filter((s) => shopMatchesBuyerQuery(s, query));
  }

  return shops.sort((a, b) => {
    if (a.dist == null && b.dist == null) return 0;
    if (a.dist == null) return 1;
    if (b.dist == null) return -1;
    return a.dist - b.dist;
  });
}

/** Convenience: listings API payload → local shops in one pass. */
export function mapListingPayloadToLocalShops(listings, options = {}) {
  const products = mapListingsToProducts(listings, options);
  const { query, excludeTestNames, testPattern } = options;
  return mapListingsToLocalShops(products, { query, excludeTestNames, testPattern });
}
