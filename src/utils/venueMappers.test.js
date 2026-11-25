/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  mapBookingListingToVenue,
  mapBookingListingsToVenues,
  resolveVenueCapacity,
} from './venueMappers.js';

describe('venueMappers', () => {
  it('maps owner id, category from attrs, and known capacity', () => {
    const v = mapBookingListingToVenue({
      booking_listing_id: 42,
      title: 'Skyline Hall',
      price: 1200,
      price_unit: 'event',
      location: 'Toronto',
      owner_id: 9,
      capacity: 1,
      attributes: {
        category: 'Rooftop',
        max_attendees: 120,
        rating: 4.7,
        reviews: 18,
        host: 'Alex',
        amenities: ['AV', 'Bar'],
        featured: true,
      },
      images: [],
    });
    expect(v).toMatchObject({
      id: 42,
      name: 'Skyline Hall',
      category: 'Rooftop',
      price: 1200,
      priceUnit: '/ event',
      capacity: 120,
      capacityKnown: true,
      rating: 4.7,
      reviews: 18,
      host: 'Alex',
      hostId: 9,
      featured: true,
    });
    expect(v.amenities).toEqual(['AV', 'Bar']);
    expect(v.avatar).toBe('A');
  });

  it('prefers max_attendees over attributes.capacity', () => {
    expect(resolveVenueCapacity(
      { capacity: 1 },
      { max_attendees: 80, capacity: 200 },
    )).toBe(80);
  });

  it('does not treat listing.capacity as attendees after Phase 0b', () => {
    expect(resolveVenueCapacity({ capacity: 200 }, {})).toBeNull();
    expect(resolveVenueCapacity({ capacity: 1 }, {})).toBeNull();
  });

  it('falls back to venue_type when category is missing', () => {
    const v = mapBookingListingToVenue({
      booking_listing_id: 1,
      title: 'Ballroom',
      price: 900,
      attributes: { venue_type: 'Wedding' },
      images: [],
    });
    expect(v.category).toBe('Wedding');
    expect(v.venueType).toBe('Wedding');
  });

  it('does not invent rating, reviews, capacity, or host', () => {
    const v = mapBookingListingToVenue({
      booking_listing_id: 2,
      title: 'Studio',
      price: 400,
      attributes: {},
      images: [],
    });
    expect(v.rating).toBeNull();
    expect(v.reviews).toBeNull();
    expect(v.capacity).toBeNull();
    expect(v.capacityKnown).toBe(false);
    expect(v.host).toBeNull();
    expect(v.hostId).toBeNull();
    expect(v.amenities).toEqual([]);
    expect(v.description).toBeNull();
    expect(v.rules).toBeNull();
  });

  it('does not treat missing capacity as 100', () => {
    const v = mapBookingListingToVenue({
      booking_listing_id: 3,
      title: 'Hall',
      price: 500,
      capacity: null,
      attributes: {},
      images: [],
    });
    expect(v.capacity).toBeNull();
    expect(v.capacityKnown).toBe(false);
  });

  it('maps hour price unit label', () => {
    const v = mapBookingListingToVenue({
      booking_listing_id: 4,
      title: 'Studio Hour',
      price: 80,
      price_unit: 'hour',
      attributes: { max_attendees: 20 },
      images: [],
    });
    expect(v.priceUnit).toBe('/ hr');
    expect(v.capacity).toBe(20);
  });

  it('parses comma-separated amenities strings', () => {
    const v = mapBookingListingToVenue({
      booking_listing_id: 6,
      title: 'Loft',
      price: 300,
      attributes: { amenities: 'AV, Bar, Kitchen' },
      images: [],
    });
    expect(v.amenities).toEqual(['AV', 'Bar', 'Kitchen']);
  });

  it('maps arrays and filters nulls', () => {
    expect(mapBookingListingsToVenues([
      null,
      { booking_listing_id: 5, title: 'A', price: 1, attributes: {}, images: [] },
    ])).toHaveLength(1);
  });
});
