/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  buildRideAnalyticsPayload,
  getMatchingPhase,
  getPickupConfidence,
  getPickupRange,
  isDriverLocationStale,
  pickRecommendedVehicle,
  buildRideOptions,
  chooseRideOption,
  getNearbySupply,
  validateCustomRideOffer,
  validateRideSchedule,
} from './rideshareRiderExperience.js';

describe('getPickupConfidence', () => {
  it('reports unknown availability without blocking booking', () => {
    expect(getPickupConfidence({ routeResolved: false, availabilityKnown: false, nearbyCount: 0 }))
      .toEqual({ level: 'unknown', blocksBooking: false, reason: 'availability_unknown' });
  });

  it('blocks booking when the route is unresolved', () => {
    expect(getPickupConfidence({ routeResolved: false, availabilityKnown: true, nearbyCount: 3 }))
      .toEqual({ level: 'low', blocksBooking: true, reason: 'route_unresolved' });
  });

  it('blocks booking when no drivers are nearby', () => {
    expect(getPickupConfidence({ routeResolved: true, availabilityKnown: true, nearbyCount: 0 }))
      .toEqual({ level: 'low', blocksBooking: true, reason: 'no_nearby_drivers' });
  });

  it('reports limited supply for one nearby driver', () => {
    expect(getPickupConfidence({ routeResolved: true, availabilityKnown: true, nearbyCount: 1 }))
      .toEqual({ level: 'medium', blocksBooking: false, reason: 'limited_supply' });
  });

  it('reports good supply for two or more nearby drivers', () => {
    expect(getPickupConfidence({ routeResolved: true, availabilityKnown: true, nearbyCount: 2 }))
      .toEqual({ level: 'high', blocksBooking: false, reason: 'good_supply' });
    expect(getPickupConfidence({ routeResolved: true, availabilityKnown: true, nearbyCount: 20 }))
      .toEqual({ level: 'high', blocksBooking: false, reason: 'good_supply' });
  });
});

describe('getPickupRange', () => {
  it('returns null for missing, blank, or non-finite distances', () => {
    expect(getPickupRange({ nearestDistanceKm: null })).toBeNull();
    expect(getPickupRange({ nearestDistanceKm: undefined })).toBeNull();
    expect(getPickupRange({ nearestDistanceKm: '' })).toBeNull();
    expect(getPickupRange({ nearestDistanceKm: '   ' })).toBeNull();
    expect(getPickupRange({ nearestDistanceKm: Number.NaN })).toBeNull();
    expect(getPickupRange({ nearestDistanceKm: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it('rejects coercible and negative values that are not valid distances', () => {
    expect(getPickupRange({ nearestDistanceKm: true })).toBeNull();
    expect(getPickupRange({ nearestDistanceKm: false })).toBeNull();
    expect(getPickupRange({ nearestDistanceKm: [] })).toBeNull();
    expect(getPickupRange({ nearestDistanceKm: [2] })).toBeNull();
    expect(getPickupRange({ nearestDistanceKm: { valueOf: () => 2 } })).toBeNull();
    expect(getPickupRange({ nearestDistanceKm: -1 })).toBeNull();
    expect(getPickupRange({ nearestDistanceKm: '-1' })).toBeNull();
    expect(getPickupRange({ nearestDistanceKm: '2km' })).toBeNull();
  });

  it('uses a two-minute floor and a three-minute window for numeric distances', () => {
    expect(getPickupRange({ nearestDistanceKm: 0 })).toEqual({ min: 2, max: 5 });
    expect(getPickupRange({ nearestDistanceKm: 1.1 })).toEqual({ min: 3, max: 6 });
    expect(getPickupRange({ nearestDistanceKm: '2' })).toEqual({ min: 5, max: 8 });
  });
});

describe('getMatchingPhase', () => {
  it('moves from contacting to expanding to delayed at the boundaries', () => {
    expect(getMatchingPhase(19_999)).toBe('contacting');
    expect(getMatchingPhase(20_000)).toBe('expanding');
    expect(getMatchingPhase(44_999)).toBe('expanding');
    expect(getMatchingPhase(45_000)).toBe('delayed');
  });

  it('sanitizes negative and non-finite elapsed values to contacting', () => {
    expect(getMatchingPhase(-1)).toBe('contacting');
    expect(getMatchingPhase(Number.NaN)).toBe('contacting');
    expect(getMatchingPhase(Number.POSITIVE_INFINITY)).toBe('contacting');
  });
});

describe('isDriverLocationStale', () => {
  const now = Date.parse('2026-07-22T12:00:00.000Z');

  it('treats invalid and missing timestamps as stale', () => {
    expect(isDriverLocationStale(null, now)).toBe(true);
    expect(isDriverLocationStale(undefined, now)).toBe(true);
    expect(isDriverLocationStale('not-a-date', now)).toBe(true);
  });

  it('becomes stale only when older than fifteen seconds', () => {
    expect(isDriverLocationStale(now - 15_001, now)).toBe(true);
    expect(isDriverLocationStale(now - 15_000, now)).toBe(false);
    expect(isDriverLocationStale(now + 1_000, now)).toBe(false);
  });
});

describe('pickRecommendedVehicle', () => {
  it('returns the cheapest option with a finite numeric total', () => {
    const options = [
      { id: 'premium', total: 25 },
      { id: 'economy', total: 12 },
      { id: 'invalid', total: Number.NaN },
    ];
    expect(pickRecommendedVehicle(options)).toBe(options[1]);
  });

  it('preserves input order for tied totals and never upsells', () => {
    const options = [
      { id: 'first-cheapest', total: 10 },
      { id: 'second-cheapest', total: 10 },
      { id: 'luxury', total: 40, recommended: true },
    ];
    expect(pickRecommendedVehicle(options)).toBe(options[0]);
  });

  it('returns null for malformed input or when no finite total exists', () => {
    expect(pickRecommendedVehicle(null)).toBeNull();
    expect(pickRecommendedVehicle({})).toBeNull();
    expect(pickRecommendedVehicle([null, { total: Infinity }, { total: '10' }])).toBeNull();
  });
});

describe('ride option coordination', () => {
  const catalog = [
    { id: 'economy', label: 'Economy' },
    { id: 'comfort', label: 'Comfort' },
    { id: 'premium', label: 'Premium' },
  ];

  it('builds live-only fares and recommends the cheapest non-economy option', () => {
    const options = buildRideOptions(catalog, {
      economy: { total: 21 }, comfort: { total: 14 }, premium: { total: 30 },
    }, { min: 3, max: 6 });
    expect(options.map(({ id, total, recommended }) => ({ id, total, recommended }))).toEqual([
      { id: 'economy', total: 21, recommended: false },
      { id: 'comfort', total: 14, recommended: true },
      { id: 'premium', total: 30, recommended: false },
    ]);
    expect(chooseRideOption(options, 'economy', false)).toBe('comfort');
  });

  it('preserves a deliberate valid selection across estimate refreshes', () => {
    const refreshed = buildRideOptions(catalog, {
      economy: { total: 10 }, comfort: { total: 12 }, premium: { total: 35 },
    }, null);
    expect(chooseRideOption(refreshed, 'premium', true)).toBe('premium');
  });

  it('falls back to the cheapest valid option when selection becomes unavailable', () => {
    const refreshed = buildRideOptions(catalog, {
      economy: { total: 16 }, comfort: { total: 11 }, premium: { total: null },
    }, null);
    expect(chooseRideOption(refreshed, 'premium', true)).toBe('comfort');
  });
});

describe('getNearbySupply', () => {
  it('clears stale supply on failure and recovers on a later success', () => {
    const success = getNearbySupply([{ distance_km: 2.3 }, { distance_km: 0.8 }], true);
    expect(success).toEqual({ nearbyCount: 2, nearestDistanceKm: 0.8, availabilityKnown: true });
    expect(getNearbySupply([], false)).toEqual({ nearbyCount: 0, nearestDistanceKm: null, availabilityKnown: false });
    expect(getNearbySupply([{ distance_km: 1.2 }], true)).toEqual({ nearbyCount: 1, nearestDistanceKm: 1.2, availabilityKnown: true });
  });
});

describe('validateCustomRideOffer', () => {
  it.each(['1.234', '1e2', 'Infinity', '-1', '.99'])(
    'rejects non-canonical offer %s',
    (value) => expect(validateCustomRideOffer(value)).toEqual({ valid: false, amount: null, reason: 'syntax' }),
  );

  it('accepts a canonical offer with at most two decimal places', () => {
    expect(validateCustomRideOffer('1.23')).toEqual({ valid: true, amount: 1.23, reason: null });
  });
});

describe('validateRideSchedule', () => {
  const now = new Date(2026, 6, 22, 12, 0).getTime();

  it('accepts immediate rides without a scheduled timestamp', () => {
    expect(validateRideSchedule({ timing: 'now', now })).toEqual({ valid: true, scheduledAt: null, reason: null });
  });

  it('requires complete strict date and time fields', () => {
    expect(validateRideSchedule({ timing: 'schedule', scheduleDate: '', scheduleTime: '', now }).reason).toBe('schedule_incomplete');
    expect(validateRideSchedule({ timing: 'schedule', scheduleDate: '2026-07-23', scheduleTime: '', now }).reason).toBe('schedule_incomplete');
    expect(validateRideSchedule({ timing: 'schedule', scheduleDate: '07/23/2026', scheduleTime: '13:00', now }).reason).toBe('schedule_invalid');
  });

  it('rejects rollover dates, invalid times, and past or equal timestamps', () => {
    expect(validateRideSchedule({ timing: 'schedule', scheduleDate: '2026-02-31', scheduleTime: '13:00', now }).reason).toBe('schedule_invalid');
    expect(validateRideSchedule({ timing: 'schedule', scheduleDate: '2026-07-23', scheduleTime: '24:00', now }).reason).toBe('schedule_invalid');
    expect(validateRideSchedule({ timing: 'schedule', scheduleDate: '2026-07-22', scheduleTime: '11:59', now }).reason).toBe('schedule_past');
    expect(validateRideSchedule({ timing: 'schedule', scheduleDate: '2026-07-22', scheduleTime: '12:00', now }).reason).toBe('schedule_past');
  });

  it('accepts a strict future local datetime', () => {
    expect(validateRideSchedule({ timing: 'schedule', scheduleDate: '2026-07-22', scheduleTime: '12:01', now }))
      .toEqual({ valid: true, scheduledAt: '2026-07-22T12:01', reason: null });
  });
});

describe('buildRideAnalyticsPayload', () => {
  it('keeps only non-null allowlisted metadata alongside the event', () => {
    expect(buildRideAnalyticsPayload('matching_started', {
      ride_request_id: '17',
      vehicle_type: 'economy',
      confidence: 'high',
      matching_phase: 'contacting',
      payment_method: 'card',
      price_mode: 'standard',
      route_resolved: false,
      elapsed_ms: 0,
      pickup: { lat: 1, lng: 2 },
      dropoff: { lat: 3, lng: 4 },
      pickup_address: 'Private pickup',
      unexpected: 'discard me',
      nullable: null,
    })).toEqual({
      event: 'matching_started',
      ride_request_id: 17,
      vehicle_type: 'economy',
      confidence: 'high',
      matching_phase: 'contacting',
      payment_method: 'card',
      price_mode: 'standard',
      route_resolved: false,
      elapsed_ms: 0,
    });
  });

  it('omits nullish safe fields and handles malformed metadata', () => {
    expect(buildRideAnalyticsPayload('page_viewed', {
      ride_request_id: null,
      vehicle_type: undefined,
    })).toEqual({ event: 'page_viewed' });
    expect(buildRideAnalyticsPayload('page_viewed', null)).toEqual({ event: 'page_viewed' });
    expect(buildRideAnalyticsPayload('page_viewed', 'metadata')).toEqual({ event: 'page_viewed' });
  });

  it('drops nested values and invalid analytics field primitives', () => {
    expect(buildRideAnalyticsPayload('matching_started', {
      ride_request_id: 'ride-1',
      vehicle_type: { location: { address: 'private' } },
      confidence: '',
      matching_phase: 'x'.repeat(65),
      payment_method: [{ card_number: '4111111111111111' }],
      price_mode: 42,
      route_resolved: 'true',
      elapsed_ms: -1,
    })).toEqual({ event: 'matching_started' });
  });

  it('accepts valid primitive values and rejects malformed identifiers and elapsed time', () => {
    expect(buildRideAnalyticsPayload('matched', {
      ride_request_id: 9,
      vehicle_type: 'economy',
      route_resolved: true,
      elapsed_ms: 12.5,
    })).toEqual({
      event: 'matched',
      ride_request_id: 9,
      vehicle_type: 'economy',
      route_resolved: true,
      elapsed_ms: 12.5,
    });

    expect(buildRideAnalyticsPayload({ private: 'event' }, {
      ride_request_id: 0,
      elapsed_ms: 86_400_001,
    })).toEqual({});
    expect(buildRideAnalyticsPayload('matched', {
      ride_request_id: Number.MAX_SAFE_INTEGER + 1,
      elapsed_ms: Number.POSITIVE_INFINITY,
    })).toEqual({ event: 'matched' });
  });

  it('normalizes valid categorical values with trim and lowercase', () => {
    expect(buildRideAnalyticsPayload('  ROUTE_RESOLVED ', {
      vehicle_type: ' Comfort ',
      confidence: ' HIGH ',
      matching_phase: ' Expanding ',
      payment_method: ' PayPal ',
      price_mode: ' SetPrice ',
    })).toEqual({
      event: 'route_resolved',
      vehicle_type: 'comfort',
      confidence: 'high',
      matching_phase: 'expanding',
      payment_method: 'paypal',
      price_mode: 'setprice',
    });
  });

  it('drops sensitive, arbitrary, object, and unknown categorical values', () => {
    expect(buildRideAnalyticsPayload('4111111111111111', {
      vehicle_type: '123 Main Street',
      confidence: 'certain',
      matching_phase: { location: 'private' },
      payment_method: '4111111111111111',
      price_mode: 'surge',
    })).toEqual({});
  });
});
