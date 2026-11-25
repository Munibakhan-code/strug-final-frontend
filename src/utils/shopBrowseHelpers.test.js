/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  filterListingsForShopBrowse,
  isShopBrowseListing,
  shopBrowseListingParams,
} from './shopBrowseHelpers.js';

describe('isShopBrowseListing', () => {
  it('allows shop and custom shop categories', () => {
    expect(isShopBrowseListing({ product_type: { product_type_name: 'Shop' } })).toBe(true);
    expect(isShopBrowseListing({ product_type: { product_type_name: 'Clothing' } })).toBe(true);
  });

  it('excludes other vertical product types', () => {
    expect(isShopBrowseListing({ product_type: { product_type_name: 'SecondHand' } })).toBe(false);
    expect(isShopBrowseListing({ product_type: { product_type_name: 'Wedding' } })).toBe(false);
    expect(isShopBrowseListing({ product_type: { product_type_name: 'Decor' } })).toBe(false);
  });
});

describe('filterListingsForShopBrowse', () => {
  it('filters mixed API payloads', () => {
    const listings = [
      { listing_id: 1, product_type: { product_type_name: 'Shop' } },
      { listing_id: 2, product_type: { product_type_name: 'SecondHand' } },
      { listing_id: 3, product_type: { product_type_name: 'Electronics' } },
    ];
    const filtered = filterListingsForShopBrowse(listings);
    expect(filtered.map((l) => l.listing_id)).toEqual([1, 3]);
  });
});

describe('shopBrowseListingParams', () => {
  it('includes geo when buyer coords are known', () => {
    expect(shopBrowseListingParams({ userLat: 43.65, userLng: -79.38 })).toEqual({
      public: 'true',
      lat: 43.65,
      lng: -79.38,
    });
  });

  it('omits geo when coords are missing', () => {
    expect(shopBrowseListingParams({})).toEqual({ public: 'true' });
  });
});
