/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  buildUnavailableNightSet,
  expandDateRangeNights,
  stayRangeConflicts,
  hostBookingStatusLabel,
} from './tempstayAvailability.js';

describe('tempstayAvailability', () => {
  it('expands overnight range as half-open nights', () => {
    const nights = expandDateRangeNights('2026-08-01', '2026-08-04');
    expect([...nights].sort()).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
  });

  it('builds unavailable set from blocked + booked payload', () => {
    const set = buildUnavailableNightSet({
      blocked: [{ is_blocked: true, date: '2026-08-10' }],
      booked: [{ start_date: '2026-08-01', end_date: '2026-08-03' }],
    });
    expect(set.has('2026-08-10')).toBe(true);
    expect(set.has('2026-08-01')).toBe(true);
    expect(set.has('2026-08-02')).toBe(true);
    expect(set.has('2026-08-03')).toBe(false);
  });

  it('detects stay conflicts', () => {
    const set = buildUnavailableNightSet({
      blocked: [{ is_blocked: true, date: '2026-08-02' }],
      booked: [],
    });
    expect(stayRangeConflicts('2026-08-01', '2026-08-03', set)).toBe(true);
    expect(stayRangeConflicts('2026-08-03', '2026-08-05', set)).toBe(false);
  });

  it('maps host status labels', () => {
    expect(hostBookingStatusLabel('awaiting_host')).toBe('Pending');
    expect(hostBookingStatusLabel('in_progress')).toBe('In progress');
    expect(hostBookingStatusLabel('confirmed')).toBe('Confirmed');
  });
});
