/**
 * @vitest-environment node
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  canCancelEquipmentTrip,
  mapBookingToEquipmentTrip,
  mapGuestBookingsToEquipmentTrips,
  filterEquipmentTripsByBucket,
  equipmentTripBucket,
} from './equipmentTrips.js';

describe('equipmentTrips', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancel eligibility matches active statuses', () => {
    expect(canCancelEquipmentTrip('confirmed')).toBe(true);
    expect(canCancelEquipmentTrip('awaiting_host')).toBe(true);
    expect(canCancelEquipmentTrip('cancelled')).toBe(false);
    expect(canCancelEquipmentTrip('completed')).toBe(false);
  });

  it('maps engine booking to equipment rental card with quantity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T12:00:00Z'));

    const trip = mapBookingToEquipmentTrip({
      booking_id: 77,
      status: 'confirmed',
      start_date: '2026-08-01',
      end_date: '2026-08-04',
      total: 285,
      quantity: 2,
      vertical: 'equipment',
      booking_listing: { booking_listing_id: 8, title: 'DSLR Kit', location: 'Toronto' },
    });
    expect(trip).toMatchObject({
      booking_id: 77,
      title: 'DSLR Kit',
      location: 'Toronto',
      days: 3,
      quantity: 2,
      can_cancel: true,
      bucket: 'upcoming',
    });
  });

  it('drops non-equipment rows when mapping guest list', () => {
    const trips = mapGuestBookingsToEquipmentTrips([
      { booking_id: 1, vertical: 'equipment', status: 'confirmed', booking_listing: { title: 'A' } },
      { booking_id: 2, vertical: 'vehicle', status: 'confirmed', booking_listing: { title: 'B' } },
    ]);
    expect(trips).toHaveLength(1);
    expect(trips[0].booking_id).toBe(1);
  });

  it('buckets cancelled and past trips correctly', () => {
    expect(equipmentTripBucket('cancelled')).toBe('cancelled');
    expect(equipmentTripBucket('completed')).toBe('past');
    expect(filterEquipmentTripsByBucket([
      { booking_id: 1, bucket: 'upcoming' },
      { booking_id: 2, bucket: 'cancelled' },
    ], 'cancelled')).toHaveLength(1);
  });
});
