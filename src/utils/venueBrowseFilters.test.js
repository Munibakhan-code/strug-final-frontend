/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  buildVenueListingsQuery,
  filterVenueListings,
  venueMatchesPrice,
  venueMatchesAttendees,
  venueBrowseFiltersActive,
} from './venueBrowseFilters.js';

describe('venueBrowseFilters', () => {
  it('builds listing query with price/q only — never min_guests for attendees', () => {
    expect(buildVenueListingsQuery({
      q: 'rooftop',
      minPrice: 500,
      maxPrice: 2000,
      minAttendees: 80,
    })).toEqual({
      vertical: 'venue',
      limit: 100,
      q: 'rooftop',
      min_price: 500,
      max_price: 2000,
    });
    expect(buildVenueListingsQuery({})).toEqual({ vertical: 'venue', limit: 100 });
    expect(buildVenueListingsQuery({ minAttendees: 50 }).min_guests).toBeUndefined();
  });

  it('filters by price, attendees, query, and category client-side', () => {
    const rows = [
      { id: 1, name: 'Small Studio', location: 'Toronto', category: 'Gallery', price: 400, capacity: 40 },
      { id: 2, name: 'Skyline Hall', location: 'Mississauga', category: 'Rooftop', price: 1500, capacity: 120 },
      { id: 3, name: 'Rooftop Loft', location: 'Toronto', category: 'Rooftop', price: 900, capacity: 80 },
    ];
    const out = filterVenueListings(rows, {
      category: 'Rooftop',
      query: 'toronto',
      minPrice: 800,
      maxPrice: 1600,
      minAttendees: 70,
      matchesCategoryFn: (cat, listingCat) => cat === 'all' || listingCat === cat,
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(3);
  });

  it('match helpers tolerate missing data', () => {
    expect(venueMatchesPrice({ price: 50 }, 100, null)).toBe(false);
    expect(venueMatchesPrice({}, 100, null)).toBe(true);
    expect(venueMatchesAttendees({ capacity: 20 }, 50)).toBe(false);
    expect(venueMatchesAttendees({}, 50)).toBe(true);
    expect(venueMatchesAttendees({ capacity: 20 }, 1)).toBe(true);
  });

  it('detects active browse filters without decorative date intent', () => {
    expect(venueBrowseFiltersActive({ category: 'all' })).toBe(false);
    expect(venueBrowseFiltersActive({ minAttendees: 1 })).toBe(false);
    expect(venueBrowseFiltersActive({ minAttendees: 20 })).toBe(true);
    expect(venueBrowseFiltersActive({ eventDate: '2026-09-10' })).toBe(false);
  });
});
