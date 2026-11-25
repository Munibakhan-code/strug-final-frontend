import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRideScheduleValidation } from './useRideScheduleValidation.js';

describe('useRideScheduleValidation', () => {
  afterEach(() => vi.useRealTimers());

  it('automatically expires a future schedule without changing inputs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 22, 12, 0, 0));
    const { result } = renderHook(() => useRideScheduleValidation('schedule', '2026-07-22', '12:01'));
    expect(result.current).toEqual({ valid: true, scheduledAt: '2026-07-22T12:01', reason: null });
    act(() => vi.advanceTimersByTime(60_001));
    expect(result.current).toEqual({ valid: false, scheduledAt: null, reason: 'schedule_past' });
  });

  it('does not schedule timers for immediate or already-invalid rides', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 22, 12, 0, 0));
    const nowRide = renderHook(() => useRideScheduleValidation('now', '', ''));
    expect(vi.getTimerCount()).toBe(0);
    nowRide.unmount();
    const invalidRide = renderHook(() => useRideScheduleValidation('schedule', '', ''));
    expect(invalidRide.result.current.reason).toBe('schedule_incomplete');
    expect(vi.getTimerCount()).toBe(0);
  });
});
