import { describe, it, expect } from 'vitest';
import { emergencyNumberForIso2, EMERGENCY_BY_ISO2, FALLBACK_EMERGENCY_NUMBER } from './emergencyNumber.js';
import { COUNTRY_ISO2 } from './regionConfig.js';

describe('emergencyNumberForIso2', () => {
  it('returns the local number for countries we know', () => {
    expect(emergencyNumberForIso2('CA')).toEqual({ number: '911', known: true });
    expect(emergencyNumberForIso2('DE')).toEqual({ number: '112', known: true });
    expect(emergencyNumberForIso2('GB')).toEqual({ number: '999', known: true });
    expect(emergencyNumberForIso2('AU')).toEqual({ number: '000', known: true });
  });

  it('is case and whitespace tolerant', () => {
    expect(emergencyNumberForIso2(' de ')).toEqual({ number: '112', known: true });
  });

  // The bug this replaces: a hardcoded tel:911 shown to every driver regardless of country.
  it('never answers 911 for a country that does not use it', () => {
    for (const iso2 of ['DE', 'GB', 'FR', 'AU', 'IN', 'JP', 'ZA', 'PK']) {
      expect(emergencyNumberForIso2(iso2).number).not.toBe('911');
    }
  });

  it('falls back to 112 and says so when the country is unknown or missing', () => {
    for (const input of [undefined, null, '', 'ZZ', 42]) {
      expect(emergencyNumberForIso2(input)).toEqual({
        number: FALLBACK_EMERGENCY_NUMBER, known: false,
      });
    }
  });

  it('covers every country the platform lists', () => {
    const missing = Object.entries(COUNTRY_ISO2)
      .filter(([, iso2]) => !EMERGENCY_BY_ISO2[iso2])
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('has no obviously malformed entries', () => {
    for (const [iso2, number] of Object.entries(EMERGENCY_BY_ISO2)) {
      expect(iso2).toMatch(/^[A-Z]{2}$/);
      expect(number).toMatch(/^\d{2,5}$/);
    }
  });
});
