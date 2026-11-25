import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildChipSignals,
  watchSignalsFromHistory,
  signalsSignature,
  resolveStableChipOrder,
  clearStoredChipOrder,
  trendsForCountry,
  CHIP_ORDER_STORAGE_KEY,
  CHIP_ORDER_TTL_MS,
} from './videoChipSignals.js';
import { buildVideoChips, VIDEO_SECTION_DEFS } from './videoChips.js';
import { PROFILE_MUSIC_USER, PROFILE_NEW_USER, FIXTURE_NOW } from './videoChipProfiles.js';

const CATEGORIES = [
  { id: 'all', label: 'All', match: null },
  { id: 'general', label: 'General', match: 'General' },
  { id: 'music', label: 'Music', match: 'Music' },
  { id: 'gaming', label: 'Gaming', match: 'Gaming' },
  { id: 'news', label: 'News', match: 'News' },
  { id: 'entertainment', label: 'Entertainment', match: 'Entertainment' },
  { id: 'tech', label: 'Tech', match: 'Tech' },
  { id: 'comedy', label: 'Comedy', match: 'Comedy' },
  { id: 'travel', label: 'Travel', match: 'Travel' },
];
const CHIPS = buildVideoChips(VIDEO_SECTION_DEFS.map((d) => ({ ...d, label: d.id })), CATEGORIES);
const CATEGORY_CHIPS = CHIPS.filter((c) => !['all', 'trending', 'latest', 'mix', 'watched'].includes(c.id));

const signalsFor = (profile) =>
  buildChipSignals({
    country: profile.country,
    history: profile.history,
    searches: profile.searches,
    categoryChips: CATEGORY_CHIPS,
  });

/** Minimal in-memory Storage stand-in — jsdom's localStorage is replaced per test anyway. */
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get size() { return map.size; },
  };
}

const ids = (chips) => chips.map((c) => c.id);
let storage;
beforeEach(() => { storage = memoryStorage(); });

describe('watchSignalsFromHistory', () => {
  it('reads category and timestamp out of the API row shape', () => {
    const out = watchSignalsFromHistory([
      { watched_at: '2026-08-01T00:00:00Z', video: { category: 'Music' } },
    ]);
    expect(out).toEqual([{ category: 'Music', at: '2026-08-01T00:00:00Z' }]);
  });

  it('skips rows with no category rather than inventing one', () => {
    expect(watchSignalsFromHistory([{ video: {} }, { video: { category: null } }])).toEqual([]);
  });

  it('tolerates a missing or malformed payload', () => {
    expect(watchSignalsFromHistory(null)).toEqual([]);
    expect(watchSignalsFromHistory(undefined)).toEqual([]);
  });
});

describe('regional trends', () => {
  it('returns a country-specific list', () => {
    expect(trendsForCountry('Pakistan')).toContain('entertainment');
    expect(trendsForCountry('United States')).toContain('gaming');
  });

  it('returns nothing for an unknown or missing country', () => {
    expect(trendsForCountry('Atlantis')).toEqual([]);
    expect(trendsForCountry(null)).toEqual([]);
  });
});

describe('server signals (GET /video-discovery/chip-signals)', () => {
  const serverSignals = {
    country: 'Pakistan',
    personalised: true,
    personal: [{ category: 'Tech', score: 9.5 }],
    regional: ['News', 'Comedy'],
    global: ['Gaming', 'Music'],
  };

  it('prefers the server\'s regional and global lists over the placeholders', () => {
    const s = buildChipSignals({ categoryChips: CATEGORY_CHIPS, serverSignals });
    expect(s.regionalTrends).toEqual(['news', 'comedy']);
    expect(s.globalTrends).toEqual(['gaming', 'music']);
  });

  it('maps backend category values onto chip ids and drops unknown ones', () => {
    const s = buildChipSignals({
      categoryChips: CATEGORY_CHIPS,
      serverSignals: { ...serverSignals, regional: ['Music', 'Astrophysics'] },
    });
    expect(s.regionalTrends).toEqual(['music']);
  });

  it('takes the country from the server rather than the caller', () => {
    const s = buildChipSignals({ country: null, categoryChips: CATEGORY_CHIPS, serverSignals });
    expect(s.country).toBe('Pakistan');
  });

  it('folds server-side affinity into the watch signals', () => {
    const s = buildChipSignals({ categoryChips: CATEGORY_CHIPS, serverSignals });
    expect(s.watched).toContainEqual({ category: 'Tech', at: null });
  });

  it('falls back to the placeholders when the endpoint is unavailable', () => {
    const s = buildChipSignals({ country: 'Pakistan', categoryChips: CATEGORY_CHIPS, serverSignals: null });
    expect(s.regionalTrends).toEqual(trendsForCountry('Pakistan'));
    expect(s.globalTrends.length).toBeGreaterThan(0);
  });

  it('falls back when the endpoint answers with empty lists', () => {
    const s = buildChipSignals({
      country: 'Pakistan',
      categoryChips: CATEGORY_CHIPS,
      serverSignals: { country: 'Pakistan', personal: [], regional: [], global: [] },
    });
    expect(s.regionalTrends).toEqual(trendsForCountry('Pakistan'));
  });
});

describe('order stability', () => {
  it('freezes the order across repeated resolves', () => {
    const signals = signalsFor(PROFILE_MUSIC_USER);
    const first = resolveStableChipOrder({ chips: CHIPS, signals, storage, now: FIXTURE_NOW });
    expect(first.recomputed).toBe(true);

    for (let i = 1; i <= 5; i++) {
      const again = resolveStableChipOrder({ chips: CHIPS, signals, storage, now: FIXTURE_NOW + i * 60000 });
      expect(again.recomputed).toBe(false);
      expect(ids(again.chips)).toEqual(ids(first.chips));
    }
  });

  it('does not move the row for a single extra watch', () => {
    const signals = signalsFor(PROFILE_MUSIC_USER);
    const first = resolveStableChipOrder({ chips: CHIPS, signals, storage, now: FIXTURE_NOW });

    const nudged = { ...signals, watched: [...signals.watched, { category: 'Gaming', at: new Date(FIXTURE_NOW).toISOString() }] };
    const after = resolveStableChipOrder({ chips: CHIPS, signals: nudged, storage, now: FIXTURE_NOW + 1000 });

    expect(after.recomputed).toBe(false);
    expect(ids(after.chips)).toEqual(ids(first.chips));
  });

  it('re-ranks once activity crosses a meaningful bucket', () => {
    const signals = signalsFor(PROFILE_MUSIC_USER);
    resolveStableChipOrder({ chips: CHIPS, signals, storage, now: FIXTURE_NOW });

    const busy = {
      ...signals,
      watched: [
        ...signals.watched,
        ...Array.from({ length: 6 }, () => ({ category: 'Gaming', at: new Date(FIXTURE_NOW).toISOString() })),
      ],
    };
    const after = resolveStableChipOrder({ chips: CHIPS, signals: busy, storage, now: FIXTURE_NOW + 1000 });
    expect(after.recomputed).toBe(true);
  });

  it('re-ranks once the interval lapses, even with identical signals', () => {
    const signals = signalsFor(PROFILE_MUSIC_USER);
    resolveStableChipOrder({ chips: CHIPS, signals, storage, now: FIXTURE_NOW });
    const later = resolveStableChipOrder({ chips: CHIPS, signals, storage, now: FIXTURE_NOW + CHIP_ORDER_TTL_MS + 1 });
    expect(later.recomputed).toBe(true);
  });

  it('surfaces a newly shipped chip even while an order is frozen', () => {
    const signals = signalsFor(PROFILE_MUSIC_USER);
    resolveStableChipOrder({ chips: CHIPS, signals, storage, now: FIXTURE_NOW });

    const withNewChip = [...CHIPS, { id: 'science', label: 'Science', match: 'Science' }];
    const after = resolveStableChipOrder({ chips: withNewChip, signals, storage, now: FIXTURE_NOW + 1000 });

    expect(after.recomputed).toBe(false);
    expect(ids(after.chips)).toContain('science');
    expect(ids(after.chips)).toHaveLength(withNewChip.length);
  });

  it('keeps "All" first and "Watched" last through a frozen order', () => {
    const signals = signalsFor(PROFILE_MUSIC_USER);
    resolveStableChipOrder({ chips: CHIPS, signals, storage, now: FIXTURE_NOW });
    const again = resolveStableChipOrder({ chips: CHIPS, signals, storage, now: FIXTURE_NOW + 1000 });
    const order = ids(again.chips);
    expect(order[0]).toBe('all');
    expect(order[order.length - 1]).toBe('watched');
  });

  it('survives unusable storage without throwing', () => {
    const broken = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    const signals = signalsFor(PROFILE_MUSIC_USER);
    expect(() => resolveStableChipOrder({ chips: CHIPS, signals, storage: broken, now: FIXTURE_NOW })).not.toThrow();
    expect(() => clearStoredChipOrder(broken)).not.toThrow();
  });
});

describe('history deletion', () => {
  it('changes the signature the moment history is emptied', () => {
    const before = signalsSignature(signalsFor(PROFILE_MUSIC_USER));
    const after = signalsSignature(signalsFor({ ...PROFILE_MUSIC_USER, history: [], searches: [] }));
    expect(after).not.toBe(before);
    expect(after.endsWith('|n')).toBe(true);
  });

  it('re-ranks to the new-user row instead of serving the frozen personalised one', () => {
    const personalised = resolveStableChipOrder({ chips: CHIPS, signals: signalsFor(PROFILE_MUSIC_USER), storage, now: FIXTURE_NOW });

    const wiped = resolveStableChipOrder({
      chips: CHIPS,
      signals: signalsFor({ ...PROFILE_MUSIC_USER, history: [], searches: [] }),
      storage,
      now: FIXTURE_NOW + 1000,
    });

    expect(wiped.recomputed).toBe(true);
    expect(ids(wiped.chips)).not.toEqual(ids(personalised.chips));

    const brandNew = resolveStableChipOrder({
      chips: CHIPS,
      signals: signalsFor(PROFILE_NEW_USER),
      storage: memoryStorage(),
      now: FIXTURE_NOW,
    });
    expect(ids(wiped.chips)).toEqual(ids(brandNew.chips));
  });

  it('clearStoredChipOrder removes the frozen order entirely', () => {
    resolveStableChipOrder({ chips: CHIPS, signals: signalsFor(PROFILE_MUSIC_USER), storage, now: FIXTURE_NOW });
    expect(storage.getItem(CHIP_ORDER_STORAGE_KEY)).toBeTruthy();
    clearStoredChipOrder(storage);
    expect(storage.getItem(CHIP_ORDER_STORAGE_KEY)).toBeNull();
  });
});

describe('privacy', () => {
  it('never stores raw search text in the signal set', () => {
    const signals = buildChipSignals({
      country: 'Pakistan',
      history: [],
      searches: ['private thing', 'music'],
      categoryChips: CATEGORY_CHIPS,
    });
    expect(signals.searchCategories).toEqual(['music']);
    expect(JSON.stringify(signals)).not.toContain('private thing');
  });

  it('never writes raw search text to storage', () => {
    const signals = buildChipSignals({
      country: 'Pakistan',
      history: [],
      searches: ['something sensitive'],
      categoryChips: CATEGORY_CHIPS,
    });
    resolveStableChipOrder({ chips: CHIPS, signals, storage, now: FIXTURE_NOW });
    expect(storage.getItem(CHIP_ORDER_STORAGE_KEY)).not.toContain('sensitive');
  });
});
