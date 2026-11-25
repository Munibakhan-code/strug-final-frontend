/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { venueAvailableOnDate, indexVenueAvailability, venuePassesBrowseDateFilter } from './venueBrowseAvailability.js';

describe('venueBrowseAvailability', () => {
  it('treats missing event date as available', () => {
    expect(venueAvailableOnDate(new Set(['2026-09-10']), '')).toBe(true);
  });

  it('blocks dates in unavailable set', () => {
    const blocked = new Set(['2026-09-10']);
    expect(venueAvailableOnDate(blocked, '2026-09-10')).toBe(false);
    expect(venueAvailableOnDate(blocked, '2026-09-11')).toBe(true);
  });

  it('indexes availability payloads by venue id', () => {
    const map = indexVenueAvailability([
      { id: 1, ok: true, payload: { booked: [{ start_date: '2026-09-10', end_date: '2026-09-10' }] } },
      { id: 2, ok: true, payload: { blocked: [{ date: '2026-09-12', is_blocked: true }] } },
    ]);
    expect(map.get('1')?.ok).toBe(true);
    expect(map.get('1')?.blocked?.has('2026-09-10')).toBe(true);
    expect(map.get('2')?.blocked?.has('2026-09-12')).toBe(true);
  });

  it('marks failed fetches as not ok instead of empty availability', () => {
    const map = indexVenueAvailability([{ id: 3, ok: false }]);
    expect(map.get('3')).toEqual({ ok: false });
    expect(venuePassesBrowseDateFilter(map.get('3'), '2026-09-10')).toBe(true);
  });

  it('excludes venues only when availability loaded and date is blocked', () => {
    const entry = { ok: true, blocked: new Set(['2026-09-10']) };
    expect(venuePassesBrowseDateFilter(entry, '2026-09-10')).toBe(false);
    expect(venuePassesBrowseDateFilter(entry, '2026-09-11')).toBe(true);
    expect(venuePassesBrowseDateFilter(undefined, '2026-09-10')).toBe(true);
  });
});
