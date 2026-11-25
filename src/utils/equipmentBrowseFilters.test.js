/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  buildEquipmentListingsQuery,
  filterEquipmentListings,
  equipmentMatchesPrice,
  equipmentBrowseFiltersActive,
} from './equipmentBrowseFilters.js';

describe('equipmentBrowseFilters', () => {
  it('builds listing query with q and price bounds', () => {
    expect(buildEquipmentListingsQuery({ q: 'drone', minPrice: 40, maxPrice: 120 })).toEqual({
      vertical: 'equipment',
      limit: 100,
      q: 'drone',
      min_price: 40,
      max_price: 120,
    });
    expect(buildEquipmentListingsQuery({})).toEqual({ vertical: 'equipment', limit: 100 });
  });

  it('filters by category, query, and price client-side', () => {
    const rows = [
      { id: 1, name: 'DSLR Kit', category: 'Photography', priceDay: 55, brand: 'Canon' },
      { id: 2, name: 'PA System', category: 'AV & Sound', priceDay: 90, location: 'Toronto' },
      { id: 3, name: 'Tent 20x20', category: 'Party', priceDay: 120 },
    ];
    const out = filterEquipmentListings(rows, {
      category: 'photography',
      categories: [{ id: 'photography', match: 'Photography' }],
      query: 'dslr',
      minPrice: 50,
      maxPrice: 80,
      matchesCategoryFn: (activeId, itemValue, cats) => {
        if (!activeId || activeId === 'all') return true;
        const cat = cats.find((c) => c.id === activeId);
        if (!cat || cat.match == null) return true;
        return itemValue === cat.match;
      },
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(1);
  });

  it('match helpers tolerate missing data', () => {
    expect(equipmentMatchesPrice({ priceDay: 50 }, 100, null)).toBe(false);
    expect(equipmentMatchesPrice({}, 100, null)).toBe(true);
  });

  it('detects active browse filters without decorative date intent', () => {
    expect(equipmentBrowseFiltersActive({ category: 'all' })).toBe(false);
    expect(equipmentBrowseFiltersActive({ minPrice: '25' })).toBe(true);
    expect(equipmentBrowseFiltersActive({ startDate: '2026-08-01', endDate: '2026-08-04' })).toBe(false);
  });
});
