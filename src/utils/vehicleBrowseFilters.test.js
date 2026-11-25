/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  buildVehicleListingsQuery,
  filterVehicleListings,
  vehicleMatchesPrice,
  vehicleMatchesSeats,
  vehicleBrowseFiltersActive,
} from './vehicleBrowseFilters.js';

describe('vehicleBrowseFilters', () => {
  it('builds listing query with price/q only — never min_guests for seats', () => {
    expect(buildVehicleListingsQuery({ q: 'tesla', minPrice: 90, maxPrice: 200, minSeats: 5 })).toEqual({
      vertical: 'vehicle',
      limit: 100,
      q: 'tesla',
      min_price: 90,
      max_price: 200,
    });
    expect(buildVehicleListingsQuery({})).toEqual({ vertical: 'vehicle', limit: 100 });
    expect(buildVehicleListingsQuery({ minSeats: 2 }).min_guests).toBeUndefined();
  });

  it('filters by price, seats, query, and category client-side', () => {
    const rows = [
      { id: 1, name: 'Compact', location: 'Toronto', category: 'Car', priceDay: 80, seats: 4 },
      { id: 2, name: 'Family SUV', location: 'Mississauga', category: 'SUV', priceDay: 140, seats: 7 },
      { id: 3, name: 'Tesla Model 3', location: 'Toronto', category: 'Car', priceDay: 160, seats: 5, make: 'Tesla', model: 'Model 3' },
    ];
    const out = filterVehicleListings(rows, {
      category: 'Car',
      query: 'tesla',
      minPrice: 120,
      maxPrice: 180,
      minSeats: 5,
      matchesCategoryFn: (cat, listingCat) => cat === 'all' || listingCat === cat,
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(3);
  });

  it('match helpers tolerate missing data', () => {
    expect(vehicleMatchesPrice({ priceDay: 50 }, 100, null)).toBe(false);
    expect(vehicleMatchesPrice({}, 100, null)).toBe(true);
    expect(vehicleMatchesSeats({ seats: 2 }, 4)).toBe(false);
    expect(vehicleMatchesSeats({}, 4)).toBe(true);
    expect(vehicleMatchesSeats({ seats: 2 }, 1)).toBe(true);
  });

  it('detects active browse filters without decorative date intent', () => {
    expect(vehicleBrowseFiltersActive({ category: 'all' })).toBe(false);
    expect(vehicleBrowseFiltersActive({ minSeats: 1 })).toBe(false);
    expect(vehicleBrowseFiltersActive({ minSeats: 2 })).toBe(true);
    expect(vehicleBrowseFiltersActive({ startDate: '2026-08-01', endDate: '2026-08-04' })).toBe(false);
  });
});
