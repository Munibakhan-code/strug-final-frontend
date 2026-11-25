import { describe, it, expect } from 'vitest';
import { fmtVideoDuration } from './videoDuration.js';

describe('fmtVideoDuration', () => {
  it('formats sub-hour lengths as m:ss', () => {
    expect(fmtVideoDuration(90)).toBe('1:30');
    expect(fmtVideoDuration(5)).toBe('0:05');
  });

  it('rolls past an hour instead of showing 75:30', () => {
    expect(fmtVideoDuration(4530)).toBe('1:15:30');
  });

  it('returns empty for missing or invalid input', () => {
    expect(fmtVideoDuration(0)).toBe('');
    expect(fmtVideoDuration(null)).toBe('');
    expect(fmtVideoDuration('nope')).toBe('');
  });
});
