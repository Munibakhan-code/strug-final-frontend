/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  hostPortalProfileVertical,
  TEMPSTAY_PROFILE_VERTICAL,
  VEHICLE_PROFILE_VERTICAL,
  VENUE_PROFILE_VERTICAL,
  EQUIPMENT_PROFILE_VERTICAL,
  EVENT_PROFILE_VERTICAL,
  LEGACY_HOSTING_PROFILE_VERTICAL,
  filterRowsByVertical,
} from './bookingIsolation.js';

describe('bookingIsolation', () => {
  it('maps hosting-mode dashboard vertical to a scoped profile key', () => {
    expect(hostPortalProfileVertical('tempstay')).toBe('tempstay');
    expect(hostPortalProfileVertical('hotel')).toBe('hotel');
    expect(hostPortalProfileVertical('vehicle')).toBe('vehicle');
    expect(hostPortalProfileVertical('venue')).toBe('venue');
    expect(hostPortalProfileVertical('equipment')).toBe('equipment');
    expect(hostPortalProfileVertical('event')).toBe('event');
    expect(hostPortalProfileVertical('hosting')).toBe('tempstay');
    expect(hostPortalProfileVertical('')).toBe('tempstay');
  });

  it('exposes tempstay, vehicle, venue, and equipment profile keys distinct from legacy hosting', () => {
    expect(TEMPSTAY_PROFILE_VERTICAL).toBe('tempstay');
    expect(VEHICLE_PROFILE_VERTICAL).toBe('vehicle');
    expect(VENUE_PROFILE_VERTICAL).toBe('venue');
    expect(EQUIPMENT_PROFILE_VERTICAL).toBe('equipment');
    expect(EVENT_PROFILE_VERTICAL).toBe('event');
    expect(LEGACY_HOSTING_PROFILE_VERTICAL).toBe('hosting');
    expect(TEMPSTAY_PROFILE_VERTICAL).not.toBe(LEGACY_HOSTING_PROFILE_VERTICAL);
    expect(VEHICLE_PROFILE_VERTICAL).not.toBe(LEGACY_HOSTING_PROFILE_VERTICAL);
    expect(VENUE_PROFILE_VERTICAL).not.toBe(LEGACY_HOSTING_PROFILE_VERTICAL);
    expect(EQUIPMENT_PROFILE_VERTICAL).not.toBe(LEGACY_HOSTING_PROFILE_VERTICAL);
    expect(EVENT_PROFILE_VERTICAL).not.toBe(LEGACY_HOSTING_PROFILE_VERTICAL);
  });

  it('filters listings/bookings by vertical without mixing scopes', () => {
    const rows = [
      { booking_listing_id: 1, vertical: 'tempstay', title: 'Cabin' },
      { booking_listing_id: 2, vertical: 'hotel', title: 'Suite' },
      { booking_listing_id: 3, vertical: 'tempstay', title: 'Loft' },
      { booking_listing_id: 4, vertical: 'vehicle', title: 'Camry' },
      { booking_listing_id: 5, vertical: 'venue', title: 'Hall' },
      { booking_listing_id: 6, vertical: 'equipment', title: 'DSLR Kit' },
      { booking_listing_id: 7, vertical: 'equipment', title: 'PA System' },
      { booking_listing_id: 8, vertical: 'event', title: 'Jazz Night' },
    ];
    expect(filterRowsByVertical(rows, 'tempstay').map((r) => r.booking_listing_id)).toEqual([1, 3]);
    expect(filterRowsByVertical(rows, 'hotel')).toHaveLength(1);
    expect(filterRowsByVertical(rows, 'vehicle')).toHaveLength(1);
    expect(filterRowsByVertical(rows, 'venue')).toHaveLength(1);
    expect(filterRowsByVertical(rows, 'venue')[0].title).toBe('Hall');
    expect(filterRowsByVertical(rows, 'equipment').map((r) => r.booking_listing_id)).toEqual([6, 7]);
    expect(filterRowsByVertical(rows, 'equipment').every((r) => r.vertical === 'equipment')).toBe(true);
    expect(filterRowsByVertical(rows, 'event')).toHaveLength(1);
    expect(filterRowsByVertical(rows, 'event')[0].title).toBe('Jazz Night');
    expect(filterRowsByVertical(rows, null)).toHaveLength(8);
  });
});
