import { describe, it, expect, vi } from 'vitest';

// rideshare.js imports the axios client at module load. These are pure-mapper tests, so
// stub the client to keep the unit isolated (no axios, no network).
vi.mock('./client', () => ({ default: {} }));

import {
  mapDriverActiveTrip,
  pickDriverOpenTrip,
  normalizeTodayEarnings,
  mapDriverTripHistoryRow,
  normalizeTripHistory,
  normalizeNearbyDrivers,
} from './rideshare.js';

describe('normalizeNearbyDrivers', () => {
  const drivers = [{ driver_profile_id: 3 }];

  it('accepts current, bare, and legacy nearby-driver response shapes', () => {
    expect(normalizeNearbyDrivers({ successful: true, data: drivers })).toBe(drivers);
    expect(normalizeNearbyDrivers(drivers)).toBe(drivers);
    expect(normalizeNearbyDrivers({ drivers })).toBe(drivers);
  });

  it('returns an empty list for malformed responses', () => {
    expect(normalizeNearbyDrivers(null)).toEqual([]);
    expect(normalizeNearbyDrivers({ data: null })).toEqual([]);
  });
});

const acceptedTrip = (over = {}) => ({
  trip_id: 10,
  request_id: 99,
  ended_at: null,
  otp_code: '1234',
  driver_payout: '12.5',
  driver_arrived_at: null,
  started_at: null,
  ride_request: {
    ride_request_id: 99,
    status: 'accepted',
    pickup_address: '1 Pickup Rd',
    drop_address: '2 Drop Ave',
    user: { name: 'Riya' },
  },
  ...over,
});

describe('mapDriverActiveTrip', () => {
  it('returns null for missing / ended / ride-less / non-active trips', () => {
    expect(mapDriverActiveTrip(null)).toBeNull();
    expect(mapDriverActiveTrip(acceptedTrip({ ended_at: new Date().toISOString() }))).toBeNull();
    expect(mapDriverActiveTrip(acceptedTrip({ ride_request: null }))).toBeNull();
    expect(mapDriverActiveTrip(acceptedTrip({ ride_request: { status: 'pending' } }))).toBeNull();
  });

  it('maps an accepted trip into driver dashboard state', () => {
    expect(mapDriverActiveTrip(acceptedTrip())).toEqual({
      type: 'ride',
      requestId: 99,
      tripId: 10,
      otp: '1234',
      stage: 'accepted',
      passenger: 'Riya',
      pickup: '1 Pickup Rd',
      dropoff: '2 Drop Ave',
      fare: '$12.50',
      driverArrivedAt: null,
      startedAt: null,
    });
  });

  it('derives stage: ongoing > arrived > accepted', () => {
    expect(mapDriverActiveTrip(acceptedTrip({ ride_request: { status: 'ongoing', pickup_address: 'p', drop_address: 'd' } })).stage).toBe('ongoing');
    expect(mapDriverActiveTrip(acceptedTrip({ driver_arrived_at: '2026-06-15T10:00:00Z' })).stage).toBe('arrived');
    expect(mapDriverActiveTrip(acceptedTrip()).stage).toBe('accepted');
  });

  it('falls back for missing payout and passenger/address fields', () => {
    const r = mapDriverActiveTrip(acceptedTrip({
      driver_payout: null,
      ride_request: { status: 'accepted' },
    }));
    expect(r.fare).toBe('—');
    expect(r.passenger).toBe('Customer');
    expect(r.pickup).toBe('Pickup');
    expect(r.dropoff).toBe('Dropoff');
  });
});

describe('pickDriverOpenTrip', () => {
  it('picks the highest trip_id among open accepted/ongoing trips', () => {
    const raw = [
      acceptedTrip({ trip_id: 1 }),
      acceptedTrip({ trip_id: 7, ride_request: { status: 'ongoing' } }),
      acceptedTrip({ trip_id: 5 }),
    ];
    expect(pickDriverOpenTrip(raw).trip_id).toBe(7);
  });
  it('accepts a { data: [...] } envelope', () => {
    expect(pickDriverOpenTrip({ data: [acceptedTrip({ trip_id: 3 })] }).trip_id).toBe(3);
  });
  it('ignores ended and non-active trips', () => {
    const raw = [
      acceptedTrip({ trip_id: 2, ended_at: '2026-06-15T00:00:00Z' }),
      acceptedTrip({ trip_id: 4, ride_request: { status: 'completed' } }),
    ];
    expect(pickDriverOpenTrip(raw)).toBeNull();
  });
  it('returns null for an empty / malformed input', () => {
    expect(pickDriverOpenTrip([])).toBeNull();
    expect(pickDriverOpenTrip(null)).toBeNull();
  });
});

describe('normalizeTodayEarnings', () => {
  it('returns null when no stats are present', () => {
    expect(normalizeTodayEarnings(null)).toBeNull();
    expect(normalizeTodayEarnings({})).toBeNull();
  });
  it('normalizes stats from either res.stats or res.data.stats', () => {
    const out = normalizeTodayEarnings({ stats: { driver_earnings: '42.5', total_trips: '3', total_distance_km: '18.4' } });
    expect(out).toMatchObject({ net_earnings: 42.5, total_trips: 3, total_distance_km: 18.4 });
    const nested = normalizeTodayEarnings({ data: { stats: { driver_earnings: '7' } } });
    expect(nested.net_earnings).toBe(7);
    expect(nested.total_trips).toBe(0);
  });
});

describe('mapDriverTripHistoryRow', () => {
  it('maps a completed trip row, formatting payout and distance', () => {
    const row = mapDriverTripHistoryRow({
      trip_id: 22,
      driver_payout: '15.5',
      actual_distance_km: '8.123',
      ended_at: null,
      ride_request: { pickup_address: 'A', drop_address: 'B', user: { name: 'Sam' } },
    });
    expect(row).toMatchObject({
      id: '#22',
      tripId: 22,
      from: 'A',
      to: 'B',
      fare: '$15.50',
      netFare: 15.5,
      status: 'Completed',
      passengerName: 'Sam',
      distanceKm: 8.12,
      time: '—', // no ended_at
    });
  });
  it('applies fallbacks for an empty row', () => {
    const row = mapDriverTripHistoryRow({});
    expect(row).toMatchObject({
      id: '—', tripId: null, from: 'Pickup', to: 'Dropoff',
      fare: '—', netFare: null, passengerName: 'Rider', distanceKm: null,
    });
  });
});

describe('normalizeTripHistory', () => {
  it('maps rows and reports total records', () => {
    const out = normalizeTripHistory({
      data: [{ trip_id: 1, ride_request: {} }, { trip_id: 2, ride_request: {} }],
      pagination: { total_records: 42 },
    });
    expect(out.trips).toHaveLength(2);
    expect(out.totalRecords).toBe(42);
  });
  it('handles a bare array and defaults totalRecords to the row count', () => {
    const out = normalizeTripHistory([{ trip_id: 1, ride_request: {} }]);
    expect(out.trips).toHaveLength(1);
    expect(out.totalRecords).toBe(1);
  });
  it('returns no trips for an unexpected shape', () => {
    expect(normalizeTripHistory(null)).toEqual({ trips: [], totalRecords: 0 });
  });
});
