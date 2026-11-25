/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  haversineKm,
  etaMinutesFromDistanceKm,
  formatEtaLabel,
  coordsPair,
  liveEtaLabel,
  foodStyleEtaMinutes,
  distanceLabel,
  isWithinFoodBrowseRadius,
  FOOD_BROWSE_RADIUS_KM,
} from './geo.js';

describe('haversineKm', () => {
  it('≈ 0 for the same point', () => {
    expect(haversineKm(6.9, 79.86, 6.9, 79.86)).toBeCloseTo(0, 5);
  });
  it('returns null when any input is non-finite', () => {
    expect(haversineKm('x', 1, 2, 3)).toBeNull();
    expect(haversineKm(6.9, 79.8, undefined, 80)).toBeNull();
  });
  it('coerces numeric strings', () => {
    expect(haversineKm('6.9271', '79.8612', '7.2906', '80.6337')).toBeGreaterThan(89);
  });
});

describe('etaMinutesFromDistanceKm', () => {
  it('10 km @ 30 km/h = 20 min', () => {
    expect(etaMinutesFromDistanceKm(10, 30)).toBe(20);
  });
  it('uses 30 km/h by default', () => {
    expect(etaMinutesFromDistanceKm(10)).toBe(20);
  });
  it('floors at 1 minute', () => {
    expect(etaMinutesFromDistanceKm(0)).toBe(1);
    expect(etaMinutesFromDistanceKm(0.1)).toBe(1);
  });
  it('rejects negative / non-finite distance', () => {
    expect(etaMinutesFromDistanceKm(-5)).toBeNull();
    expect(etaMinutesFromDistanceKm('x')).toBeNull();
  });
  it('falls back to the default speed when given a non-positive speed', () => {
    expect(etaMinutesFromDistanceKm(10, 0)).toBe(20);
    expect(etaMinutesFromDistanceKm(10, -5)).toBe(20);
  });
});

describe('formatEtaLabel', () => {
  it('formats the ETA', () => {
    expect(formatEtaLabel(10)).toBe('~20 min');
  });
  it('em-dashes an invalid distance', () => {
    expect(formatEtaLabel('x')).toBe('—');
    expect(formatEtaLabel(-1)).toBe('—');
  });
});

describe('coordsPair', () => {
  it('parses a numeric pair', () => {
    expect(coordsPair('6.9', '79.8')).toEqual([6.9, 79.8]);
    expect(coordsPair(6.9, 79.8)).toEqual([6.9, 79.8]);
  });
  it('returns null when either value is non-finite', () => {
    expect(coordsPair('a', 1)).toBeNull();
    expect(coordsPair(1, undefined)).toBeNull();
  });
});

describe('liveEtaLabel', () => {
  it('returns null when either coordinate set is missing', () => {
    expect(liveEtaLabel(null, [6.9, 79.8])).toBeNull();
    expect(liveEtaLabel([6.9, 79.8], null)).toBeNull();
  });
  it('returns an ETA label for two valid points', () => {
    const label = liveEtaLabel([6.9271, 79.8612], [7.2906, 80.6337]);
    expect(label).toMatch(/^~\d+ min$/);
  });
});

describe('foodStyleEtaMinutes', () => {
  it('matches Food browse formula (15 + 6 min per km)', () => {
    expect(foodStyleEtaMinutes(0)).toBe(15);
    expect(foodStyleEtaMinutes(2.4)).toBe(29);
    expect(foodStyleEtaMinutes(10)).toBe(75);
  });
  it('returns null for invalid distance', () => {
    expect(foodStyleEtaMinutes(-1)).toBeNull();
    expect(foodStyleEtaMinutes('x')).toBeNull();
  });
});

describe('distanceLabel', () => {
  it('formats Food-style card label with km', () => {
    const label = distanceLabel(43.6532, -79.3832, 43.65, -79.38);
    expect(label).toMatch(/^\d+–\d+ min \(\d+\.\d km\)$/);
  });
  it('returns null when coords are invalid', () => {
    expect(distanceLabel('x', 1, 2, 3)).toBeNull();
  });
});

describe('isWithinFoodBrowseRadius', () => {
  it(`hides vendors farther than ${FOOD_BROWSE_RADIUS_KM} km`, () => {
    expect(isWithinFoodBrowseRadius(49.9)).toBe(true);
    expect(isWithinFoodBrowseRadius(FOOD_BROWSE_RADIUS_KM)).toBe(true);
    expect(isWithinFoodBrowseRadius(50.1)).toBe(false);
    expect(isWithinFoodBrowseRadius(200)).toBe(false);
  });

  it('keeps vendors with unknown distance so pre-geocode rows still appear', () => {
    expect(isWithinFoodBrowseRadius(null)).toBe(true);
    expect(isWithinFoodBrowseRadius(undefined)).toBe(true);
    expect(isWithinFoodBrowseRadius('x')).toBe(true);
  });
});
