/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  buildUnavailableNightSet,
  eventDateConflicts,
  todayISODate,
  toISODate,
} from './venueAvailability.js';

describe('venueAvailability', () => {
  it('builds unavailable days from blocked + single-day booked events', () => {
    const set = buildUnavailableNightSet({
      blocked: [{ is_blocked: true, date: '2026-09-10' }],
      booked: [{ start_date: '2026-09-12', end_date: null }],
    });
    expect(set.has('2026-09-10')).toBe(true);
    expect(set.has('2026-09-12')).toBe(true);
    expect(set.has('2026-09-11')).toBe(false);
  });

  it('detects event-day conflicts and ignores empty selection', () => {
    const set = buildUnavailableNightSet({
      blocked: [{ is_blocked: true, date: '2026-09-10' }],
      booked: [{ start_date: '2026-09-15', end_date: '2026-09-15' }],
    });
    expect(eventDateConflicts('2026-09-10', set)).toBe(true);
    expect(eventDateConflicts('2026-09-15', set)).toBe(true);
    expect(eventDateConflicts('2026-09-11', set)).toBe(false);
    expect(eventDateConflicts('', set)).toBe(false);
    expect(eventDateConflicts('2026-09-10', new Set())).toBe(false);
  });

  it('formats today as YYYY-MM-DD', () => {
    expect(todayISODate(new Date('2026-07-25T15:00:00'))).toBe('2026-07-25');
    expect(toISODate('2026-07-25T00:00:00.000Z')).toBe('2026-07-25');
  });
});
