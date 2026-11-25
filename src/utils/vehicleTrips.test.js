/**
 * @vitest-environment node
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  canCancelVehicleTrip,
  mapBookingToVehicleTrip,
  mapGuestBookingsToVehicleTrips,
  filterVehicleTripsByBucket,
  vehicleTripBucket,
} from './vehicleTrips.js';

describe('vehicleTrips', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancel eligibility matches active statuses', () => {
    expect(canCancelVehicleTrip('confirmed')).toBe(true);
    expect(canCancelVehicleTrip('awaiting_host')).toBe(true);
    expect(canCancelVehicleTrip('cancelled')).toBe(false);
    expect(canCancelVehicleTrip('completed')).toBe(false);
  });

  it('maps engine booking to vehicle trip card', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T12:00:00Z'));

    const trip = mapBookingToVehicleTrip({
      booking_id: 77,
      status: 'confirmed',
      start_date: '2026-08-01',
      end_date: '2026-08-04',
      total: 285,
      vertical: 'vehicle',
      booking_listing: { booking_listing_id: 8, title: 'Model 3', location: 'Toronto' },
    });
    expect(trip).toMatchObject({
      booking_id: 77,
      title: 'Model 3',
      location: 'Toronto',
      days: 3,
      can_cancel: true,
      bucket: 'upcoming',
    });
  });

  it('drops non-vehicle rows when mapping guest list', () => {
    const trips = mapGuestBookingsToVehicleTrips([
      { booking_id: 1, vertical: 'vehicle', status: 'confirmed', booking_listing: { title: 'A' } },
      { booking_id: 2, vertical: 'tempstay', status: 'confirmed', booking_listing: { title: 'B' } },
    ]);
    expect(trips).toHaveLength(1);
    expect(trips[0].booking_id).toBe(1);
  });

  it('buckets cancelled and past trips correctly', () => {
    expect(vehicleTripBucket('cancelled')).toBe('cancelled');
    expect(vehicleTripBucket('completed')).toBe('past');
    expect(filterVehicleTripsByBucket([
      { booking_id: 1, bucket: 'upcoming' },
      { booking_id: 2, bucket: 'cancelled' },
    ], 'cancelled')).toHaveLength(1);
  });
});
