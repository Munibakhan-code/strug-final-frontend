/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  amenitiesFromListing,
  clientFeePreview,
  galleryExtraPhotoCount,
  galleryGridImages,
  galleryHasExtraPhotos,
  isUnavailableNight,
  listingHasMapCoords,
  maxGuestsForListing,
  parseListingCoords,
  resolveTempStayCategory,
} from './tempstayListingHelpers.js';

describe('resolveTempStayCategory', () => {
  it('prefers explicit category chip match', () => {
    expect(resolveTempStayCategory({ category: 'Cabin', property_type: 'Apartment' })).toBe('Cabin');
  });

  it('maps common property_type aliases without inventing Entire Home for junk', () => {
    expect(resolveTempStayCategory({ property_type: 'Apartment' })).toBe('Entire Home');
    expect(resolveTempStayCategory({ property_type: 'Private Room' })).toBe('Private Room');
    expect(resolveTempStayCategory({ property_type: 'Weird loft loft' })).toBe(null);
  });

  it('returns null when category and property_type are empty', () => {
    expect(resolveTempStayCategory({})).toBe(null);
    expect(resolveTempStayCategory(null)).toBe(null);
  });
});

describe('maxGuestsForListing', () => {
  it('uses guests / max_guests when finite and >= 1', () => {
    expect(maxGuestsForListing({ guests: 4 })).toBe(4);
    expect(maxGuestsForListing({ max_guests: 6 })).toBe(6);
  });

  it('never returns null — Math.min-safe fallback', () => {
    expect(maxGuestsForListing({ guests: null })).toBe(16);
    expect(maxGuestsForListing({})).toBe(16);
    expect(maxGuestsForListing({ guests: 0 })).toBe(16);
  });
});

describe('parseListingCoords / map pins', () => {
  it('parses valid lat/lng from attributes or listing fields', () => {
    expect(parseListingCoords({ lat: '45.5', lng: '-75.7' })).toEqual({ lat: 45.5, lng: -75.7 });
    expect(parseListingCoords({}, { latitude: 43.6, longitude: -79.4 })).toEqual({ lat: 43.6, lng: -79.4 });
  });

  it('does not invent Toronto when coords are missing', () => {
    expect(parseListingCoords({})).toEqual({ lat: null, lng: null });
    expect(parseListingCoords({ lat: '', lng: '' })).toEqual({ lat: null, lng: null });
    expect(listingHasMapCoords({ lat: null, lng: null })).toBe(false);
    expect(listingHasMapCoords({ lat: 43.65, lng: -79.38 })).toBe(true);
  });
});

describe('amenitiesFromListing', () => {
  it('returns only stored amenities — empty when missing', () => {
    expect(amenitiesFromListing({ amenities: ['Wi-Fi', 'Kitchen'] })).toEqual(['Wi-Fi', 'Kitchen']);
    expect(amenitiesFromListing({})).toEqual([]);
    expect(amenitiesFromListing({ amenities: null })).toEqual([]);
  });
});

describe('clientFeePreview', () => {
  it('uses listing fee attrs when present', () => {
    expect(clientFeePreview(2, 100, { cleaning_fee: 40, service_fee_pct: 10 })).toEqual({
      subtotal: 200,
      cleaningFee: 40,
      serviceFee: 20,
      total: 260,
    });
  });

  it('does not invent $35 / 12% when fees are unset', () => {
    const preview = clientFeePreview(2, 100, {});
    expect(preview.cleaningFee).toBe(null);
    expect(preview.serviceFee).toBe(null);
    expect(preview.total).toBe(null);
  });
});

describe('isUnavailableNight', () => {
  it('matches YYYY-MM-DD against the unavailable set', () => {
    const set = new Set(['2026-09-01', '2026-09-02']);
    expect(isUnavailableNight('2026-09-01', set)).toBe(true);
    expect(isUnavailableNight('2026-09-03', set)).toBe(false);
    expect(isUnavailableNight('', set)).toBe(false);
  });
});

describe('galleryGridImages', () => {
  it('returns up to five images for the desktop grid', () => {
    const imgs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(galleryGridImages(imgs)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('returns empty for missing or empty input', () => {
    expect(galleryGridImages([])).toEqual([]);
    expect(galleryGridImages(null)).toEqual([]);
    expect(galleryGridImages(undefined)).toEqual([]);
  });

  it('respects a custom maxVisible cap', () => {
    expect(galleryGridImages(['1', '2', '3'], 2)).toEqual(['1', '2']);
  });
});

describe('galleryExtraPhotoCount / galleryHasExtraPhotos', () => {
  it('counts photos beyond the grid cap', () => {
    expect(galleryExtraPhotoCount(['a', 'b', 'c', 'd', 'e', 'f'])).toBe(1);
    expect(galleryHasExtraPhotos(['a', 'b', 'c', 'd', 'e', 'f'])).toBe(true);
  });

  it('returns zero when at or under the cap', () => {
    expect(galleryExtraPhotoCount(['a', 'b', 'c'])).toBe(0);
    expect(galleryHasExtraPhotos(['a', 'b', 'c'])).toBe(false);
  });

  it('treats non-array input as no extras', () => {
    expect(galleryExtraPhotoCount(null)).toBe(0);
    expect(galleryHasExtraPhotos(undefined)).toBe(false);
  });
});
