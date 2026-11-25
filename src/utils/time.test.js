/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../i18n/index.js', () => ({
  default: {
    t: (key, opts = {}) => {
      const map = {
        'common.justNow': 'just now',
        'common.timeAgoMinutes': `${opts.count}m`,
        'common.timeAgoHours': `${opts.count}h`,
        'common.timeAgoDays': `${opts.count}d`,
      };
      return map[key] ?? key;
    },
  },
}));

import { timeAgo } from './time.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('"just now" under a minute', () => {
    expect(timeAgo(ago(0))).toBe('just now');
    expect(timeAgo(ago(30_000))).toBe('just now');
  });

  it('minutes under an hour', () => {
    expect(timeAgo(ago(1 * 60_000))).toBe('1m');
    expect(timeAgo(ago(5 * 60_000))).toBe('5m');
    expect(timeAgo(ago(59 * 60_000))).toBe('59m');
  });

  it('hours under a day', () => {
    expect(timeAgo(ago(60 * 60_000))).toBe('1h');
    expect(timeAgo(ago(90 * 60_000))).toBe('1h');
    expect(timeAgo(ago(23 * 3_600_000))).toBe('23h');
  });

  it('days beyond 24 hours', () => {
    expect(timeAgo(ago(24 * 3_600_000))).toBe('1d');
    expect(timeAgo(ago(3 * 24 * 3_600_000))).toBe('3d');
  });

  it('treats missing or invalid dates as just now, not NaN ago', () => {
    expect(timeAgo(null)).toBe('just now');
    expect(timeAgo('')).toBe('just now');
    expect(timeAgo('not-a-date')).toBe('just now');
  });
});
