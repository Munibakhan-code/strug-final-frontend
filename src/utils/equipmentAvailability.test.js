/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  buildEquipmentUnavailableNightSet,
  stayRangeConflicts,
} from './equipmentAvailability.js';

describe('equipmentAvailability', () => {
  it('capacity 1 treats any booking like vehicles', () => {
    const set = buildEquipmentUnavailableNightSet({
      blocked: [{ is_blocked: true, date: '2026-08-10' }],
      booked: [{ start_date: '2026-08-01', end_date: '2026-08-03' }],
    }, { capacity: 1 });
    expect(set.has('2026-08-10')).toBe(true);
    expect(set.has('2026-08-01')).toBe(true);
    expect(set.has('2026-08-02')).toBe(true);
    expect(set.has('2026-08-03')).toBe(false);
  });

  it('multi-unit leaves nights free until used >= capacity', () => {
    const set = buildEquipmentUnavailableNightSet({
      blocked: [],
      booked: [
        { start_date: '2026-08-01', end_date: '2026-08-03', quantity: 1 },
        { start_date: '2026-08-01', end_date: '2026-08-02', quantity: 1 },
      ],
    }, { capacity: 3 });
    expect(set.has('2026-08-01')).toBe(false);
    expect(set.has('2026-08-02')).toBe(false);
  });

  it('multi-unit marks night unavailable when used reaches capacity', () => {
    const set = buildEquipmentUnavailableNightSet({
      blocked: [],
      booked: [
        { start_date: '2026-08-01', end_date: '2026-08-03', quantity: 2 },
        { start_date: '2026-08-01', end_date: '2026-08-02', quantity: 1 },
      ],
    }, { capacity: 3 });
    expect(set.has('2026-08-01')).toBe(true);
    expect(set.has('2026-08-02')).toBe(false);
  });

  it('missing booking quantity counts as 1 for multi-unit', () => {
    const set = buildEquipmentUnavailableNightSet({
      blocked: [],
      booked: [
        { start_date: '2026-08-01', end_date: '2026-08-02' },
        { start_date: '2026-08-01', end_date: '2026-08-02' },
      ],
    }, { capacity: 2 });
    expect(set.has('2026-08-01')).toBe(true);
  });

  it('host blocks always unavailable regardless of capacity', () => {
    const set = buildEquipmentUnavailableNightSet({
      blocked: [{ is_blocked: true, date: '2026-08-05' }],
      booked: [],
    }, { capacity: 5 });
    expect(set.has('2026-08-05')).toBe(true);
    expect(stayRangeConflicts('2026-08-05', '2026-08-06', set)).toBe(true);
  });
});
