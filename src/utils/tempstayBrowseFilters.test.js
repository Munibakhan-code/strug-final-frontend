/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  buildTempStayListingsQuery,
  filterTempStayListings,
  listingMatchesGuests,
  listingMatchesPrice,
  browseFiltersActive,
} from './tempstayBrowseFilters.js';

describe('tempstayBrowseFilters', () => {
  it('builds listing query with optional filters', () => {
    expect(buildTempStayListingsQuery({ q: 'cabin', minPrice: 80, maxPrice: 200, minGuests: 3 })).toEqual({
      vertical: 'tempstay',
      limit: 100,
      q: 'cabin',
      min_price: 80,
      max_price: 200,
      min_guests: 3,
    });
    expect(buildTempStayListingsQuery({})).toEqual({ vertical: 'tempstay', limit: 100 });
  });

  it('does not send min_guests for default guests=1', () => {
    expect(buildTempStayListingsQuery({ minGuests: 1 })).toEqual({ vertical: 'tempstay', limit: 100 });
    expect(buildTempStayListingsQuery({ minGuests: 2 }).min_guests).toBe(2);
  });

  it('filters by price and guests', () => {
    const rows = [
      { id: 1, name: 'A', location: 'Toronto', category: 'Cabin', priceNum: 100, guests: 2 },
      { id: 2, name: 'B', location: 'Muskoka', category: 'Entire Home', priceNum: 250, guests: 6 },
      { id: 3, name: 'Cabin Lake', location: 'Banff', category: 'Cabin', priceNum: 150, guests: 4 },
    ];
    const out = filterTempStayListings(rows, {
      category: 'Cabin',
      query: 'cabin',
      minPrice: 120,
      maxPrice: 180,
      minGuests: 3,
      matchesCategoryFn: (cat, listingCat) => cat === 'all' || listingCat === 'Cabin',
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(3);
  });

  it('price/guest match helpers tolerate missing data', () => {
    expect(listingMatchesPrice({ priceNum: 50 }, 100, null)).toBe(false);
    expect(listingMatchesPrice({}, 100, null)).toBe(true);
    expect(listingMatchesGuests({ guests: 2 }, 4)).toBe(false);
    expect(listingMatchesGuests({}, 4)).toBe(true);
    expect(listingMatchesGuests({ guests: 2 }, 1)).toBe(true);
    // capacity is concurrent bookable units (pinned to 1 for stays), never a guest count —
    // reading it here would hide every listing as soon as the guest filter was raised.
    expect(listingMatchesGuests({ capacity: 1, max_guests: 6 }, 4)).toBe(true);
    expect(listingMatchesGuests({ capacity: 1 }, 4)).toBe(true);
  });

  it('detects active browse filters', () => {
    expect(browseFiltersActive({ category: 'all' })).toBe(false);
    expect(browseFiltersActive({ minGuests: 1 })).toBe(false);
    expect(browseFiltersActive({ minGuests: 2 })).toBe(true);
    expect(browseFiltersActive({ checkIn: '2026-08-01' })).toBe(true);
  });
});
