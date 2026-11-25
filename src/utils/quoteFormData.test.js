import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  RENEWAL_MS,
  isRenewable,
  normalizeFormData,
  decodeHtmlEntities,
  fieldEmpty,
} from './quoteFormData.js';

describe('decodeHtmlEntities', () => {
  it('returns non-strings and strings without & unchanged', () => {
    expect(decodeHtmlEntities(12)).toBe(12);
    expect(decodeHtmlEntities(null)).toBe(null);
    expect(decodeHtmlEntities('<100k')).toBe('<100k');
  });

  it('decodes only &lt; and &gt; (what xss escapes)', () => {
    expect(decodeHtmlEntities('&lt;100k')).toBe('<100k');
    expect(decodeHtmlEntities('&gt;500k')).toBe('>500k');
  });

  it('does not touch entities xss never writes', () => {
    expect(decodeHtmlEntities('a &amp; b &lt; c')).toBe('a &amp; b < c');
    expect(decodeHtmlEntities('&quot;hi&quot; &#39;x&#039;')).toBe('&quot;hi&quot; &#39;x&#039;');
    expect(decodeHtmlEntities('AT&T')).toBe('AT&T');
  });
});

describe('fieldEmpty', () => {
  it('treats only undefined/null/"" as empty (matches backend validateForm)', () => {
    expect(fieldEmpty(undefined)).toBe(true);
    expect(fieldEmpty(null)).toBe(true);
    expect(fieldEmpty('')).toBe(true);
    expect(fieldEmpty(0)).toBe(false);
    expect(fieldEmpty('0')).toBe(false);
    expect(fieldEmpty(false)).toBe(false);
  });
});

describe('normalizeFormData', () => {
  const schema = [
    { key: 'coverage', type: 'select' },
    { key: 'age', type: 'number' },
  ];

  it('coerces selects to decoded strings and keeps numbers', () => {
    expect(normalizeFormData({ coverage: '&lt;100k', age: 0 }, schema)).toEqual({
      coverage: '<100k',
      age: 0,
    });
  });

  it('keeps keys no longer in the schema (decoded)', () => {
    expect(normalizeFormData(
      { coverage: 'basic', age: 30, legacy_field: '&gt;old' },
      schema,
    )).toEqual({
      coverage: 'basic',
      age: 30,
      legacy_field: '>old',
    });
  });

  it('decodes all string values when schema is empty and keeps non-strings', () => {
    expect(normalizeFormData({ a: '&lt;x', b: 1 }, [])).toEqual({ a: '<x', b: 1 });
  });
});

describe('isRenewable', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('requires deal_closed and age ≥ RENEWAL_MS', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-06-01T00:00:00Z'));
    const old = new Date(Date.now() - RENEWAL_MS - 1000).toISOString();
    const recent = new Date(Date.now() - RENEWAL_MS + 60_000).toISOString();
    expect(isRenewable({ status: 'deal_closed', updated_at: old })).toBe(true);
    expect(isRenewable({ status: 'deal_closed', updated_at: recent })).toBe(false);
    expect(isRenewable({ status: 'cancelled', updated_at: old })).toBe(false);
  });

  it('is not renewable when both timestamps are missing', () => {
    expect(isRenewable({ status: 'deal_closed' })).toBe(false);
    expect(isRenewable({ status: 'deal_closed', updated_at: null, created_at: null })).toBe(false);
  });

  it('falls back to created_at when updated_at is missing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-06-01T00:00:00Z'));
    const old = new Date(Date.now() - RENEWAL_MS - 1000).toISOString();
    expect(isRenewable({ status: 'deal_closed', created_at: old })).toBe(true);
  });
});
