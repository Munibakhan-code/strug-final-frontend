/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { fmtPayoutCad } from './regionConfig.js';

describe('fmtPayoutCad', () => {
  it('formats settlement amounts in CAD without converting to local FX', () => {
    expect(fmtPayoutCad(12.34)).toBe('CAD 12.34');
    expect(fmtPayoutCad(100)).toBe('CAD 100.00');
    expect(fmtPayoutCad(null)).toBe('CAD 0.00');
  });
});
