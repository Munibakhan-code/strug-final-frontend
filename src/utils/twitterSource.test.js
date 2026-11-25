/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { formatTownhallImportStatus, normalizeTwitterSourceUrl } from './twitterSource.js';

describe('normalizeTwitterSourceUrl', () => {
  it('maps handles and profiles', () => {
    expect(normalizeTwitterSourceUrl('@Creator')).toBe('https://x.com/Creator');
    expect(normalizeTwitterSourceUrl('https://twitter.com/Creator/with_replies')).toBe('https://x.com/Creator');
  });

  it('keeps status links', () => {
    expect(normalizeTwitterSourceUrl('https://x.com/Creator/status/1234567890')).toBe(
      'https://x.com/Creator/status/1234567890',
    );
  });

  it('rejects other hosts', () => {
    expect(() => normalizeTwitterSourceUrl('https://youtube.com/@x')).toThrow(/Only X/);
  });
});

describe('formatTownhallImportStatus', () => {
  it('formats busy and done states', () => {
    expect(formatTownhallImportStatus({ status: 'listing' })).toMatch(/Looking up/);
    expect(formatTownhallImportStatus({
      status: 'importing',
      imported_count: 2,
      skipped_count: 1,
      failed_count: 0,
      total_found: 10,
    })).toBe('Importing 3/10…');
    expect(formatTownhallImportStatus({
      status: 'done',
      imported_count: 5,
      skipped_count: 1,
      failed_count: 0,
    })).toMatch(/5 imported/);
  });
});
