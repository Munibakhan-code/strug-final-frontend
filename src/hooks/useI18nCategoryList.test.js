import { describe, it, expect } from 'vitest';
import { matchesCategory } from './useI18nCategoryList.js';

// The category-filter contract the Videos category bar drives. VideoCategoryBar only reports a
// category *id*; VideosPage turns that id into the API `category` param (server-side browse) and
// into this predicate (client-side search filtering). Locking it here so a future change to the
// category navigation can't silently alter which videos a chip resolves to.
const CATEGORIES = [
  { id: 'all', label: 'All', match: null },
  { id: 'music', label: 'Music', match: 'Music' },
  { id: 'entertainment', label: 'Entertainment', match: 'Entertainment' },
  { id: 'tech', label: 'Tech', match: 'Tech' },
];

describe('matchesCategory', () => {
  it('lets everything through on the "all" chip', () => {
    expect(matchesCategory('all', 'Music', CATEGORIES)).toBe(true);
    expect(matchesCategory('all', 'Tech', CATEGORIES)).toBe(true);
    expect(matchesCategory('all', '', CATEGORIES)).toBe(true);
  });

  it('keeps only exact matches on the API category value', () => {
    expect(matchesCategory('music', 'Music', CATEGORIES)).toBe(true);
    expect(matchesCategory('music', 'Tech', CATEGORIES)).toBe(false);
    expect(matchesCategory('entertainment', 'Entertainment', CATEGORIES)).toBe(true);
    expect(matchesCategory('entertainment', 'entertainment', CATEGORIES)).toBe(false);
  });

  it('falls back to letting everything through for an unknown id', () => {
    expect(matchesCategory('nope', 'Music', CATEGORIES)).toBe(true);
  });

  it('treats a missing/empty active id as unfiltered', () => {
    expect(matchesCategory('', 'Music', CATEGORIES)).toBe(true);
    expect(matchesCategory(null, 'Music', CATEGORIES)).toBe(true);
  });
});
