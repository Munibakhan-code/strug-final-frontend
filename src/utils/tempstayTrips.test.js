/**
 * @vitest-environment node
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  canCancelTempStayTrip,
  mapBookingToTempStayTrip,
  mapGuestBookingsToTempStayTrips,
  filterTripsByBucket,
  tripBucket,
} from './tempstayTrips.js';

describe('tempstayTrips', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancel eligibility matches active statuses', () => {
    expect(canCancelTempStayTrip('confirmed')).toBe(true);
    expect(canCancelTempStayTrip('awaiting_host')).toBe(true);
    expect(canCancelTempStayTrip('cancelled')).toBe(false);
    expect(canCancelTempStayTrip('completed')).toBe(false);
  });

  it('maps engine booking to trip card', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T12:00:00Z'));

    const trip = mapBookingToTempStayTrip({
      booking_id: 99,
      status: 'confirmed',
      start_date: '2026-08-01',
      end_date: '2026-08-05',
      guests: 2,
      total: 400,
      vertical: 'tempstay',
      booking_listing: { booking_listing_id: 7, title: 'Lakefront Cabin', location: 'Muskoka' },
    });
    expect(trip).toMatchObject({
      booking_id: 99,
      title: 'Lakefront Cabin',
      location: 'Muskoka',
      can_cancel: true,
      can_rate: false,
      bucket: 'upcoming',
    });
  });

  it('allows rating only on completed bookings without a review', () => {
    const trip = mapBookingToTempStayTrip({
      booking_id: 12,
      status: 'completed',
      end_date: '2026-08-01',
      booking_listing: { booking_listing_id: 1, title: 'Hotel' },
    });
    expect(trip.can_rate).toBe(true);
    expect(trip.bucket).toBe('past');
    const rated = mapBookingToTempStayTrip({
      booking_id: 13,
      status: 'completed',
      booking_review: { rating: 5 },
      booking_listing: { booking_listing_id: 1, title: 'Hotel' },
    });
    expect(rated.can_rate).toBe(false);
  });

  it('filters hotel vertical when requested', () => {
    const trips = mapGuestBookingsToTempStayTrips(
      [
        { booking_id: 1, vertical: 'hotel', status: 'completed', booking_listing: { title: 'A' } },
        { booking_id: 2, vertical: 'tempstay', status: 'completed', booking_listing: { title: 'B' } },
      ],
      { vertical: 'hotel' },
    );
    expect(trips).toHaveLength(1);
    expect(trips[0].booking_id).toBe(1);
  });

  it('drops non-tempstay rows when mapping guest list', () => {
    const trips = mapGuestBookingsToTempStayTrips([
      { booking_id: 1, vertical: 'tempstay', status: 'confirmed', booking_listing: { title: 'A' } },
      { booking_id: 2, vertical: 'hotel', status: 'confirmed', booking_listing: { title: 'B' } },
    ]);
    expect(trips).toHaveLength(1);
    expect(trips[0].booking_id).toBe(1);
  });

  it('buckets cancelled separately', () => {
    expect(tripBucket('cancelled')).toBe('cancelled');
    expect(tripBucket('completed')).toBe('past');
    expect(filterTripsByBucket([
      { booking_id: 1, bucket: 'upcoming' },
      { booking_id: 2, bucket: 'cancelled' },
    ], 'cancelled')).toHaveLength(1);
  });
});
