/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  productThumbFromListing,
  productImageUrlFromListing,
  storeThumbFromProfile,
  storeImageUrl,
  effectiveUnitPrice,
  mapListingToProduct,
  mapListingsToProducts,
  mapListingsToLocalShops,
  mapListingPayloadToLocalShops,
  mapProductToSelectedShop,
  enrichProductsWithDistance,
  SHOP_DEFAULT_GRADIENT,
  SHOP_MAX_BROWSE_DISTANCE_KM,
} from './shopMappers.js';

const baseListing = {
  listing_id: 101,
  name: 'Blue Hoodie',
  description: 'Cozy cotton',
  image_url: '/uploads/photos/hoodie.jpg',
  availability: 5,
  product_type: { product_type_name: 'Clothing' },
  product_variation: [{ variation_id: 501, price: 100, discount_pct: 10 }],
  seller: {
    user_id: 42,
    name: 'StyleHaus',
    username: 'stylehaus',
    storeProfile: {
      store_name: 'StyleHaus Shop',
      banner_url: 'https://cdn.example.com/banner.jpg',
      cover_url: 'https://cdn.example.com/cover.jpg',
      profile_pic_url: 'https://cdn.example.com/logo.jpg',
      lat: 43.65,
      lng: -79.38,
      is_active: true,
    },
  },
};

describe('productImageUrlFromListing', () => {
  it('returns resolved URL preferring listing.image_url', () => {
    expect(productImageUrlFromListing(baseListing)).toContain('hoodie.jpg');
  });

  it('falls back to variation image', () => {
    expect(
      productImageUrlFromListing({
        ...baseListing,
        image_url: null,
        product_variation: [{ image_url: '/uploads/photos/var.jpg', price: 10 }],
      }),
    ).toContain('/api/uploads/photos/var.jpg');
  });
});

describe('productThumbFromListing', () => {
  it('prefers listing.image_url over variation.image_url', () => {
    const thumb = productThumbFromListing({
      ...baseListing,
      image_url: '/uploads/photos/listing.jpg',
      product_variation: [{ image_url: '/uploads/photos/var.jpg', price: 10 }],
    });
    expect(thumb).toContain('/api/uploads/photos/listing.jpg');
  });

  it('falls back to variation image when listing has none', () => {
    const thumb = productThumbFromListing({
      ...baseListing,
      image_url: null,
      product_variation: [{ image_url: '/uploads/photos/var.jpg', price: 10 }],
    });
    expect(thumb).toContain('/api/uploads/photos/var.jpg');
  });

  it('returns gradient when no images', () => {
    expect(
      productThumbFromListing({
        ...baseListing,
        image_url: null,
        product_variation: [{ price: 10 }],
      }),
    ).toBe(SHOP_DEFAULT_GRADIENT);
  });
});

describe('storeThumbFromProfile', () => {
  it('prefers banner over cover over logo', () => {
    const thumb = storeThumbFromProfile(baseListing.seller.storeProfile);
    expect(thumb).toContain('banner.jpg');
  });

  it('falls back to product thumb then gradient', () => {
    expect(storeThumbFromProfile(null, 'url("x") center/cover no-repeat')).toContain('x');
    expect(storeThumbFromProfile(null)).toBe(SHOP_DEFAULT_GRADIENT);
  });
});

describe('storeImageUrl', () => {
  it('resolves banner chain for banner kind', () => {
    expect(storeImageUrl(baseListing.seller.storeProfile, 'banner')).toBe(
      'https://cdn.example.com/banner.jpg',
    );
  });
});

describe('effectiveUnitPrice', () => {
  it('applies discount percentage', () => {
    expect(effectiveUnitPrice(100, 10)).toBe(90);
  });
  it('returns original when no discount', () => {
    expect(effectiveUnitPrice(49.99, 0)).toBe(49.99);
  });
});

describe('mapListingToProduct', () => {
  it('maps API listing to UI product shape', () => {
    const p = mapListingToProduct(baseListing);
    expect(p.id).toBe(101);
    expect(p.variation_id).toBe(501);
    expect(p.seller_id).toBe(42);
    expect(p.price).toBe(90);
    expect(p.origPrice).toBe(100);
    expect(p.isInStock).toBe(true);
    expect(p.storeIsActive).toBe(true);
    expect(p.lat).toBe(43.65);
    expect(p.thumb).toContain('hoodie.jpg');
    expect(p.imageUrl).toContain('hoodie.jpg');
  });

  it('marks out-of-stock when availability is zero', () => {
    const p = mapListingToProduct({ ...baseListing, availability: 0 });
    expect(p.isInStock).toBe(false);
  });
});

describe('enrichProductsWithDistance', () => {
  const product = mapListingToProduct(baseListing);

  it('adds distance and delivery label near Toronto', () => {
    const [enriched] = enrichProductsWithDistance([product], 43.6532, -79.3832);
    expect(enriched.dist).toBeGreaterThan(0);
    expect(enriched.dist).toBeLessThan(5);
    expect(enriched.delivery).toMatch(/min \(\d+\.\d km\)/);
  });

  it('filters out stores beyond maxKm', () => {
    const far = mapListingToProduct({
      ...baseListing,
      seller: {
        ...baseListing.seller,
        storeProfile: { ...baseListing.seller.storeProfile, lat: 19.076, lng: 72.877 },
      },
    });
    const result = enrichProductsWithDistance(
      [product, far],
      43.6532,
      -79.3832,
      { maxKm: SHOP_MAX_BROWSE_DISTANCE_KM },
    );
    expect(result).toHaveLength(1);
    expect(result[0].seller_id).toBe(42);
  });
});

describe('mapListingsToProducts — geo ranking', () => {
  // The regression this guards: Phase 7 HID sellers without store coords from any located buyer.
  // A seller who skipped the location field would have vanished from the storefront entirely, while
  // their own dashboard still showed the store as healthy and nothing was logged. Rank them last
  // instead — findable, just never ahead of a shop that is actually nearby.
  const withCoords = (id, lat, lng) => ({
    ...baseListing,
    listing_id: id,
    seller: { ...baseListing.seller, user_id: id, storeProfile: { ...baseListing.seller.storeProfile, lat, lng } },
  });
  const withoutCoords = (id) => ({
    ...baseListing,
    listing_id: id,
    seller: { ...baseListing.seller, user_id: id, storeProfile: { ...baseListing.seller.storeProfile, lat: null, lng: null } },
  });
  const BUYER = { userLat: 43.6532, userLng: -79.3832 };

  it('keeps coord-less sellers, ranked after nearby ones', () => {
    const out = mapListingsToProducts([withoutCoords(1), withCoords(2, 43.66, -79.39)], BUYER);
    expect(out.map((p) => p.seller_id)).toEqual([2, 1]);
  });

  it('orders located stores nearest-first, unlocated last', () => {
    const out = mapListingsToProducts(
      [withoutCoords(1), withCoords(2, 43.70, -79.45), withCoords(3, 43.655, -79.385)],
      BUYER,
    );
    expect(out.map((p) => p.seller_id)).toEqual([3, 2, 1]); // nearest, next, then unlocated
  });

  it('still drops located stores that are genuinely far away', () => {
    // "We don't know where you are" and "we know, and you're far" are different things.
    const out = mapListingsToProducts(
      [withCoords(1, 19.076, 72.877), withoutCoords(2), withCoords(3, 43.66, -79.39)],
      BUYER,
    );
    expect(out.map((p) => p.seller_id)).toEqual([3, 2]); // Mumbai dropped; unlocated kept
  });

  it('does not reorder anything when the buyer has no location', () => {
    const out = mapListingsToProducts([withoutCoords(1), withCoords(2, 43.66, -79.39)], {});
    expect(out.map((p) => p.seller_id)).toEqual([1, 2]);
  });
});

describe('mapListingToProduct', () => {
  it('maps stock and store availability flags', () => {
    const product = mapListingToProduct({
      ...baseListing,
      availability: 0,
      seller: {
        ...baseListing.seller,
        storeProfile: {
          ...baseListing.seller.storeProfile,
          is_open: false,
        },
      },
    });
    expect(product.isInStock).toBe(false);
    expect(product.storeIsOpen).toBe(false);
    expect(product.storeIsActive).toBe(true);
  });
});

describe('mapListingsToLocalShops', () => {
  it('groups products by seller and uses store branding for thumb', () => {
    const products = [
      mapListingToProduct(baseListing),
      mapListingToProduct({
        ...baseListing,
        listing_id: 102,
        name: 'Red Hoodie',
      }),
    ];
    const shops = mapListingsToLocalShops(products);
    expect(shops).toHaveLength(1);
    expect(shops[0].name).toBe('StyleHaus Shop');
    expect(shops[0].thumb).toContain('banner.jpg');
    expect(shops[0].products).toHaveLength(2);
    expect(shops[0].bannerUrl).toBe('https://cdn.example.com/banner.jpg');
    expect(shops[0].heroUrl).toBe('https://cdn.example.com/banner.jpg');
    expect(shops[0].logoUrl).toBe('https://cdn.example.com/logo.jpg');
    expect(shops[0].img).toBe('https://cdn.example.com/logo.jpg');
  });

  it('excludes test-named stores by default', () => {
    const products = [
      mapListingToProduct({
        ...baseListing,
        seller: { ...baseListing.seller, name: 'Playwright Test Shop', storeProfile: null },
      }),
    ];
    expect(mapListingsToLocalShops(products)).toHaveLength(0);
  });

  it('filters by query on shop name or product name', () => {
    const products = [mapListingToProduct(baseListing)];
    expect(mapListingsToLocalShops(products, { query: 'stylehaus' })).toHaveLength(1);
    expect(mapListingsToLocalShops(products, { query: 'hoodie' })).toHaveLength(1);
    expect(mapListingsToLocalShops(products, { query: 'nomatch' })).toHaveLength(0);
  });
});

describe('mapProductToSelectedShop', () => {
  it('builds a shop shell from one mapped product with branding URLs', () => {
    const product = mapListingToProduct(baseListing);
    const shop = mapProductToSelectedShop(product);
    expect(shop.id).toBe(42);
    expect(shop.name).toBe('StyleHaus Shop');
    expect(shop.heroUrl).toContain('banner.jpg');
    expect(shop.logoUrl).toContain('logo.jpg');
    expect(shop.products).toHaveLength(1);
  });

  it('surfaces bio and return policy from store profile', () => {
    const listing = {
      ...baseListing,
      seller: {
        ...baseListing.seller,
        storeProfile: {
          ...baseListing.seller.storeProfile,
          bio: 'Local streetwear',
          prep_time: JSON.stringify({ returnPolicy: '14 days', shippingInfo: '2-day local' }),
        },
      },
    };
    const shop = mapProductToSelectedShop(mapListingToProduct(listing));
    expect(shop.bio).toBe('Local streetwear');
    expect(shop.returnPolicy).toBe('14 days');
    expect(shop.shippingInfo).toBe('2-day local');
  });
});

describe('mapListingsToProducts geo filter', () => {
  it('keeps sellers without coords when hideStoresWithoutCoords is false', () => {
    const noCoords = mapListingToProduct({
      ...baseListing,
      seller: {
        ...baseListing.seller,
        storeProfile: { ...baseListing.seller.storeProfile, lat: null, lng: null },
      },
    });
    const result = mapListingsToProducts([noCoords], {
      userLat: 43.65,
      userLng: -79.38,
      hideStoresWithoutCoords: false,
    });
    expect(result).toHaveLength(1);
  });

  it('can hide sellers without coords when explicitly requested', () => {
    const noCoords = mapListingToProduct({
      ...baseListing,
      seller: {
        ...baseListing.seller,
        storeProfile: { ...baseListing.seller.storeProfile, lat: null, lng: null },
      },
    });
    const result = mapListingsToProducts([noCoords], {
      userLat: 43.65,
      userLng: -79.38,
      hideStoresWithoutCoords: true,
    });
    expect(result).toHaveLength(0);
  });
});

describe('mapListingPayloadToLocalShops', () => {
  it('maps raw API payload end-to-end', () => {
    const shops = mapListingPayloadToLocalShops([baseListing], {
      userLat: 43.6532,
      userLng: -79.3832,
    });
    expect(shops).toHaveLength(1);
    expect(shops[0].products[0].name).toBe('Blue Hoodie');
  });
});
