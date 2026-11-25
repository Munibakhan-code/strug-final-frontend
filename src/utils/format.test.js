import { describe, it, expect } from 'vitest';
import { formatCount } from './format.js';

describe('formatCount', () => {
  it('renders 0 for falsy values', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(null)).toBe('0');
    expect(formatCount(undefined)).toBe('0');
    expect(formatCount(NaN)).toBe('0');
  });

  it('passes through values under 1000 as plain strings', () => {
    expect(formatCount(1)).toBe('1');
    expect(formatCount(999)).toBe('999');
  });

  it('formats thousands with a K suffix (1 decimal)', () => {
    expect(formatCount(1000)).toBe('1.0K');
    expect(formatCount(1234)).toBe('1.2K');
    expect(formatCount(12345)).toBe('12.3K');
    expect(formatCount(999000)).toBe('999.0K');
  });

  it('formats millions with an M suffix (1 decimal)', () => {
    expect(formatCount(1e6)).toBe('1.0M');
    expect(formatCount(1234567)).toBe('1.2M');
    expect(formatCount(5e6)).toBe('5.0M');
  });
});
