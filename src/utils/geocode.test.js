/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { geocodeAddress } from './geocode.js';

describe('geocodeAddress', () => {
  it('returns null when geocoder is unavailable', async () => {
    await expect(geocodeAddress('Etobicoke', null)).resolves.toBeNull();
    await expect(geocodeAddress('', { maps: {} })).resolves.toBeNull();
  });

  it('returns lat/lng when google geocoding succeeds', async () => {
    const googleMock = {
      maps: {
        Geocoder: class {
          geocode(_query, cb) {
            cb(
              [
                {
                  geometry: {
                    location: {
                      lat: () => 43.6437,
                      lng: () => -79.5656,
                    },
                  },
                },
              ],
              'OK',
            );
          }
        },
      },
    };

    await expect(geocodeAddress('47 Moon Valley Etobicoke', googleMock)).resolves.toEqual({
      lat: 43.6437,
      lng: -79.5656,
    });
  });

  it('returns null when geocoder does not resolve an address', async () => {
    const googleMock = {
      maps: {
        Geocoder: class {
          geocode(_query, cb) {
            cb([], 'ZERO_RESULTS');
          }
        },
      },
    };

    await expect(geocodeAddress('unknown address', googleMock)).resolves.toBeNull();
  });
});
