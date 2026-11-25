/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  VERTICAL_PRODUCT_TYPE,
  verticalBrowseListingParams,
  mapListingsToVerticalCatalog,
  mapVerticalProductToCartLine,
  createVerticalPlaceOrderHandler,
  filterListingsByVerticalType,
  listingMatchesVerticalType,
  avatarColorForId,
  resolveProductTypeIdByName,
  pickCheckoutProductTypeId,
} from './shopVerticalHelpers.js';

const listing = {
  listing_id: 101,
  name: 'Vintage Lamp',
  description: 'Brass',
  image_url: '/uploads/photos/lamp.jpg',
  availability: 3,
  product_type_id: 42,
  product_type: { product_type_id: 42, product_type_name: 'Decor' },
  product_variation: [{ variation_id: 501, price: 80, discount_pct: 0 }],
  seller: {
    user_id: 42,
    name: 'DecorHaus',
    username: 'decorhaus',
    storeProfile: {
      store_name: 'DecorHaus Studio',
      banner_url: 'https://cdn.example.com/banner.jpg',
      cover_url: 'https://cdn.example.com/cover.jpg',
      profile_pic_url: 'https://cdn.example.com/logo.jpg',
      lat: 43.65,
      lng: -79.38,
      is_active: true,
      is_open: true,
    },
  },
};

describe('VERTICAL_PRODUCT_TYPE / verticalBrowseListingParams', () => {
  it('exposes known vertical type names', () => {
    expect(VERTICAL_PRODUCT_TYPE.secondhand).toBe('SecondHand');
    expect(VERTICAL_PRODUCT_TYPE.decor).toBe('Decor');
    expect(VERTICAL_PRODUCT_TYPE.wedding).toBe('Wedding');
  });

  it('builds public browse params with type + geo', () => {
    expect(verticalBrowseListingParams('Decor', { userLat: 43.65, userLng: -79.38 })).toEqual({
      public: 'true',
      type: 'Decor',
      lat: 43.65,
      lng: -79.38,
    });
  });
});

describe('mapListingsToVerticalCatalog', () => {
  it('maps listings into products and shops with seller id', () => {
    const { products, shops } = mapListingsToVerticalCatalog([listing]);
    expect(products).toHaveLength(1);
    expect(products[0].variation_id).toBe(501);
    expect(products[0].seller_id).toBe(42);
    expect(products[0].title).toBe('Vintage Lamp');
    expect(products[0].cover).toBeTruthy();
    expect(shops).toHaveLength(1);
    expect(shops[0].id).toBe(42);
    expect(shops[0].name).toBe('DecorHaus Studio');
    expect(shops[0].owner_id).toBe(42);
    expect(products[0].product_type_id).toBe(42);
  });

  it('overrides Decor product_type category with variation vname', () => {
    const withVname = {
      ...listing,
      product_variation: [{ variation_id: 501, price: 80, discount_pct: 0, vname: 'Furniture' }],
    };
    const { products } = mapListingsToVerticalCatalog([withVname]);
    expect(products[0].category).toBe('Furniture');
  });
});

describe('resolveProductTypeIdByName / pickCheckoutProductTypeId', () => {
  it('resolves type id by name case-insensitively', () => {
    const types = [
      { product_type_id: 7, product_type_name: 'SecondHand' },
      { product_type_id: 9, product_type_name: 'Decor' },
    ];
    expect(resolveProductTypeIdByName(types, 'decor')).toBe(9);
    expect(resolveProductTypeIdByName(types, 'Missing')).toBeNull();
  });

  it('prefers cart line product_type_id over fallback', () => {
    expect(pickCheckoutProductTypeId([{ product_type_id: 42 }], 9)).toBe(42);
    expect(pickCheckoutProductTypeId([], 9)).toBe(9);
    expect(pickCheckoutProductTypeId([], null)).toBeNull();
  });
});

describe('mapVerticalProductToCartLine / place-order handler', () => {
  it('builds FoodCheckout cart line', () => {
    const { products } = mapListingsToVerticalCatalog([listing]);
    expect(mapVerticalProductToCartLine(products[0], 2)).toMatchObject({
      lineId: 101,
      variation_id: 501,
      seller_id: 42,
      qty: 2,
      price: 80,
    });
  });

  it('captures order id and advances view', () => {
    let oid = null;
    let view = 'checkout';
    let mode = null;
    const handler = createVerticalPlaceOrderHandler({
      setOrderId: (v) => { oid = v; },
      setDeliveryMode: (v) => { mode = v; },
      setView: (v) => { view = v; },
    });
    handler(99, 'pickup');
    expect(oid).toBe(99);
    expect(mode).toBe('pickup');
    expect(view).toBe('tracking');
  });

  it('supports digital confirm view for dg-content verticals', () => {
    let view = 'checkout';
    const handler = createVerticalPlaceOrderHandler({
      setOrderId: () => {},
      setView: (v) => { view = v; },
      trackingView: 'confirm',
    });
    handler(42, 'digital');
    expect(view).toBe('confirm');
  });
});

describe('filterListingsByVerticalType', () => {
  it('matches product_type case-insensitively', () => {
    expect(listingMatchesVerticalType(listing, 'decor')).toBe(true);
    expect(listingMatchesVerticalType(listing, 'Wedding')).toBe(false);
    expect(filterListingsByVerticalType([listing], 'Decor')).toHaveLength(1);
  });
});

describe('avatarColorForId', () => {
  it('returns a stable color', () => {
    expect(avatarColorForId(42)).toBe(avatarColorForId(42));
    expect(typeof avatarColorForId(42)).toBe('string');
  });
});
