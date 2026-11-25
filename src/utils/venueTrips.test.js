/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  canCancelVenueTrip,
  canRateVenueTrip,
  mapBookingToVenueTrip,
  mapGuestBookingsToVenueTrips,
  filterVenueTripsByBucket,
  venueTripBucket,
} from './venueTrips.js';

describe('venueTrips', () => {
  it('cancel eligibility matches active statuses', () => {
    expect(canCancelVenueTrip('confirmed')).toBe(true);
    expect(canCancelVenueTrip('awaiting_host')).toBe(true);
    expect(canCancelVenueTrip('requested')).toBe(true);
    expect(canCancelVenueTrip('in_progress')).toBe(true);
    expect(canCancelVenueTrip('cancelled')).toBe(false);
    expect(canCancelVenueTrip('completed')).toBe(false);
    expect(canCancelVenueTrip('declined')).toBe(false);
  });

  it('rate eligibility requires completed status without existing review', () => {
    expect(canRateVenueTrip('completed', null)).toBe(true);
    expect(canRateVenueTrip('completed', { rating: 5 })).toBe(false);
    expect(canRateVenueTrip('confirmed', null)).toBe(false);
    expect(canRateVenueTrip('cancelled', null)).toBe(false);
  });

  it('maps can_rate on completed bookings without review', () => {
    const trip = mapBookingToVenueTrip({
      booking_id: 7,
      status: 'completed',
      vertical: 'venue',
      booking_listing: { title: 'Hall' },
    });
    expect(trip.can_rate).toBe(true);
    expect(trip.review).toBeNull();
  });

  it('maps engine booking to venue trip card', () => {
    const trip = mapBookingToVenueTrip({
      booking_id: 42,
      status: 'confirmed',
      start_date: '2026-10-10',
      end_date: null,
      total: 1500,
      vertical: 'venue',
      booking_listing: { booking_listing_id: 9, title: 'Skyline Hall', location: 'Toronto' },
    });
    expect(trip).toMatchObject({
      booking_id: 42,
      listing_id: 9,
      title: 'Skyline Hall',
      location: 'Toronto',
      event_date: '2026-10-10',
      start_date: '2026-10-10',
      total: 1500,
      can_cancel: true,
      bucket: 'upcoming',
    });
  });

  it('drops non-venue rows when mapping guest list', () => {
    const trips = mapGuestBookingsToVenueTrips([
      { booking_id: 1, vertical: 'venue', status: 'confirmed', booking_listing: { title: 'Hall' } },
      { booking_id: 2, vertical: 'tempstay', status: 'confirmed', booking_listing: { title: 'Cabin' } },
      { booking_id: 3, vertical: 'vehicle', status: 'confirmed', booking_listing: { title: 'Camry' } },
    ]);
    expect(trips).toHaveLength(1);
    expect(trips[0].booking_id).toBe(1);
  });

  it('buckets cancelled, declined, completed, and past events correctly', () => {
    expect(venueTripBucket('cancelled')).toBe('cancelled');
    expect(venueTripBucket('declined')).toBe('cancelled');
    expect(venueTripBucket('completed')).toBe('past');
    expect(venueTripBucket('confirmed', { now: new Date('2026-10-01') }, '2026-09-01')).toBe('past');
    expect(venueTripBucket('confirmed', { now: new Date('2026-08-01') }, '2026-09-01')).toBe('upcoming');
    expect(filterVenueTripsByBucket([
      { booking_id: 1, bucket: 'upcoming' },
      { booking_id: 2, bucket: 'cancelled' },
    ], 'cancelled')).toHaveLength(1);
  });
});
