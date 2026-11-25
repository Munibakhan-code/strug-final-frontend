/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { formatPlatformCount } from './formatPlatformCount.js';

describe('formatPlatformCount', () => {
  it('formats thousands compactly', () => {
    expect(formatPlatformCount(1240)).toBe('1.2k');
    expect(formatPlatformCount(18000)).toBe('18k');
  });

  it('returns dash for invalid input', () => {
    expect(formatPlatformCount(undefined)).toBe('—');
    expect(formatPlatformCount(NaN)).toBe('—');
  });

  it('keeps small integers as-is', () => {
    expect(formatPlatformCount(0)).toBe('0');
    expect(formatPlatformCount(12)).toBe('12');
  });
});
