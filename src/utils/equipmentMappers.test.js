/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  mapBookingListingToEquipment,
  mapBookingListingsToEquipment,
  resolveEquipmentCapacity,
  clampEquipmentQuantity,
  equipmentShowsQuantityStepper,
  maxEquipmentQuantity,
} from './equipmentMappers.js';

describe('equipmentMappers', () => {
  it('maps core fields and keeps owner id', () => {
    const item = mapBookingListingToEquipment({
      booking_listing_id: 42,
      title: 'DSLR Kit',
      price: 45,
      deposit_amount: 200,
      capacity: 3,
      location: 'Toronto',
      owner_id: 9,
      is_active: true,
      instant_book: true,
      attributes: {
        category: 'Photography',
        brand: 'Canon',
        condition: 'Good',
        tags: ['tripod', 'bag'],
        rules: 'ID required',
      },
      images: [],
      description: 'Full kit with lens',
    });
    expect(item).toMatchObject({
      id: 42,
      name: 'DSLR Kit',
      priceDay: 45,
      deposit: 200,
      capacity: 3,
      capacityKnown: true,
      category: 'Photography',
      brand: 'Canon',
      condition: 'Good',
      hostId: 9,
      tags: ['tripod', 'bag'],
      description: 'Full kit with lens',
      rules: 'ID required',
      available: true,
      instant_booking: true,
      featured: false,
    });
  });

  it('does not invent rating, featured, or tags from description', () => {
    const item = mapBookingListingToEquipment({
      booking_listing_id: 1,
      title: 'Speaker',
      price: 80,
      attributes: {},
      images: [],
      description: 'Loud PA system for events',
    });
    expect(item.rating).toBeNull();
    expect(item.reviews).toBeNull();
    expect(item.host).toBeNull();
    expect(item.featured).toBe(false);
    expect(item.tags).toEqual([]);
    expect(item.capacity).toBeNull();
    expect(item.capacityKnown).toBe(false);
    expect(item.brand).toBeNull();
    expect(item.condition).toBeNull();
    expect(item.description).toBe('Loud PA system for events');
  });

  it('treats missing capacity as unknown (multi-unit, no default)', () => {
    expect(resolveEquipmentCapacity({ capacity: null })).toBeNull();
    expect(resolveEquipmentCapacity({ capacity: 0 })).toBeNull();
    expect(resolveEquipmentCapacity({ capacity: 5 })).toBe(5);
  });

  it('clamps guest quantity to capacity (engine default 1 when unknown)', () => {
    expect(maxEquipmentQuantity(null)).toBe(1);
    expect(maxEquipmentQuantity(5)).toBe(5);
    expect(clampEquipmentQuantity(2, 5)).toBe(2);
    expect(clampEquipmentQuantity(9, 3)).toBe(3);
    expect(clampEquipmentQuantity(0, 3)).toBe(1);
    expect(equipmentShowsQuantityStepper(1)).toBe(false);
    expect(equipmentShowsQuantityStepper(null)).toBe(false);
    expect(equipmentShowsQuantityStepper(4)).toBe(true);
  });

  it('maps featured only when attribute is truthy', () => {
    const featured = mapBookingListingToEquipment({
      booking_listing_id: 2,
      title: 'A',
      price: 1,
      attributes: { featured: true },
      images: [],
    });
    expect(featured.featured).toBe(true);
  });

  it('maps arrays and filters nulls', () => {
    expect(mapBookingListingsToEquipment([
      null,
      { booking_listing_id: 3, title: 'A', price: 1, attributes: {}, images: [] },
    ])).toHaveLength(1);
  });
});
