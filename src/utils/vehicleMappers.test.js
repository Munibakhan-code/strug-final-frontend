/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { mapBookingListingToVehicle, mapBookingListingsToVehicles } from './vehicleMappers.js';

describe('vehicleMappers', () => {
  it('maps attribute seats and keeps owner id', () => {
    const v = mapBookingListingToVehicle({
      booking_listing_id: 42,
      title: 'Camry',
      price: 65,
      location: 'Toronto',
      owner_id: 9,
      attributes: { year: 2022, transmission: 'Automatic', category: 'Sedan', seats: 5 },
      capacity: 1,
      images: [],
    });
    expect(v).toMatchObject({
      id: 42,
      name: 'Camry',
      priceDay: 65,
      seats: 5,
      seatsKnown: true,
      transmission: 'Automatic',
      transmissionKnown: true,
      hostId: 9,
      category: 'Sedan',
      year: 2022,
    });
  });

  it('does not invent a default rating or trips', () => {
    const v = mapBookingListingToVehicle({
      booking_listing_id: 1,
      title: 'Civic',
      price: 50,
      attributes: {},
      images: [],
    });
    expect(v.rating).toBeNull();
    expect(v.trips).toBeNull();
    expect(v.distance).toBeNull();
    expect(v.host).toBeNull();
    expect(v.seats).toBeNull();
    expect(v.seatsKnown).toBe(false);
    expect(v.transmission).toBeNull();
    expect(v.transmissionKnown).toBe(false);
    expect(v.reviews).toBeNull();
  });

  it('does not treat capacity as seats after migration', () => {
    const v = mapBookingListingToVehicle({
      booking_listing_id: 4,
      title: 'Van',
      price: 80,
      capacity: 7,
      attributes: {},
      images: [],
    });
    expect(v.seats).toBeNull();
    expect(v.seatsKnown).toBe(false);
  });

  it('uses attribute seats over capacity when both present', () => {
    const v = mapBookingListingToVehicle({
      booking_listing_id: 2,
      title: 'SUV',
      price: 90,
      capacity: 7,
      attributes: { seats: 8, rating: 4.6, trips: 12 },
      images: [],
    });
    expect(v.seats).toBe(8);
    expect(v.rating).toBe(4.6);
    expect(v.trips).toBe(12);
  });

  it('maps arrays and filters nulls', () => {
    expect(mapBookingListingsToVehicles([null, { booking_listing_id: 3, title: 'A', price: 1, attributes: {}, images: [] }])).toHaveLength(1);
  });
});
