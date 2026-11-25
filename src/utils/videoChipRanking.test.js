import { describe, it, expect } from 'vitest';
import {
  rankVideoChips,
  deriveCategoryScores,
  mapSearchesToCategories,
  hasPersonalSignal,
  PINNED_FIRST_ID,
} from './videoChipRanking.js';
import { buildVideoChips, VIDEO_SECTION_DEFS } from './videoChips.js';
import { buildChipSignals } from './videoChipSignals.js';
import {
  CHIP_DEMO_PROFILES,
  PROFILE_NEW_USER,
  PROFILE_MUSIC_USER,
  PROFILE_TECH_USER,
  PROFILE_LIGHT_USER,
  PROFILE_DELETED_HISTORY,
  FIXTURE_NOW,
} from './videoChipProfiles.js';

// Mirrors VIDEO_CATEGORY_DEFS in pages/Videos.jsx (ids + the backend `match` values).
const CATEGORIES = [
  { id: 'all', label: 'All', match: null },
  { id: 'general', label: 'General', match: 'General' },
  { id: 'music', label: 'Music', match: 'Music' },
  { id: 'gaming', label: 'Gaming', match: 'Gaming' },
  { id: 'sports', label: 'Sports', match: 'Sports' },
  { id: 'news', label: 'News', match: 'News' },
  { id: 'entertainment', label: 'Entertainment', match: 'Entertainment' },
  { id: 'education', label: 'Education', match: 'Education' },
  { id: 'tech', label: 'Tech', match: 'Tech' },
  { id: 'comedy', label: 'Comedy', match: 'Comedy' },
  { id: 'travel', label: 'Travel', match: 'Travel' },
  { id: 'food', label: 'Food', match: 'Food' },
  { id: 'fitness', label: 'Fitness', match: 'Fitness' },
];
const SECTIONS = VIDEO_SECTION_DEFS.map((d) => ({ ...d, label: d.id }));
const CHIPS = buildVideoChips(SECTIONS, CATEGORIES);

const CATEGORY_CHIPS = CHIPS.filter((c) => !['all', 'trending', 'latest', 'mix', 'watched'].includes(c.id));

const signalsFor = (profile) =>
  buildChipSignals({
    country: profile.country,
    history: profile.history,
    searches: profile.searches,
    categoryChips: CATEGORY_CHIPS,
  });

const rankFor = (profile) =>
  rankVideoChips({ chips: CHIPS, signals: signalsFor(profile), now: FIXTURE_NOW });

const ids = (chips) => chips.map((c) => c.id);
/** Position of a chip within the personalised category block only. */
const catRank = (order, id) => ids(order).filter((x) => CATEGORY_CHIPS.some((c) => c.id === x)).indexOf(id);

describe('fixed placement', () => {
  it('keeps "All" first for every profile', () => {
    CHIP_DEMO_PROFILES.forEach((p) => {
      expect(ids(rankFor(p))[0]).toBe(PINNED_FIRST_ID);
    });
  });

  it('keeps "All" first even when the catalogue does not lead with it', () => {
    const shuffledCatalogue = [...CHIPS.slice(3), ...CHIPS.slice(0, 3)];
    const out = rankVideoChips({ chips: shuffledCatalogue, signals: signalsFor(PROFILE_MUSIC_USER), now: FIXTURE_NOW });
    expect(ids(out)[0]).toBe('all');
  });

  it('keeps the section filters ahead of the personalised categories', () => {
    const order = ids(rankFor(PROFILE_MUSIC_USER));
    ['trending', 'latest', 'mix'].forEach((id) => {
      expect(order.indexOf(id)).toBeLessThan(order.indexOf('music'));
    });
  });
});

describe('"Watched" stays a default chip', () => {
  it('is present for every profile — including brand new viewers', () => {
    CHIP_DEMO_PROFILES.forEach((p) => {
      expect(ids(rankFor(p))).toContain('watched');
    });
  });

  it('keeps its Phase 1 position at the end of the row', () => {
    CHIP_DEMO_PROFILES.forEach((p) => {
      const order = ids(rankFor(p));
      expect(order[order.length - 1]).toBe('watched');
    });
  });

  it('is never re-ranked by interest signals', () => {
    const heavy = { ...PROFILE_MUSIC_USER, searches: ['watched', 'watch history'] };
    const order = ids(rankFor(heavy));
    expect(order[order.length - 1]).toBe('watched');
  });
});

describe('no chips are invented, dropped, or duplicated', () => {
  it('returns exactly the catalogue, reordered', () => {
    CHIP_DEMO_PROFILES.forEach((p) => {
      const order = ids(rankFor(p));
      expect(order.slice().sort()).toEqual(ids(CHIPS).slice().sort());
      expect(new Set(order).size).toBe(order.length);
    });
  });

  it('keeps "General" as a real category chip, not a "For You" bucket', () => {
    const order = ids(rankFor(PROFILE_NEW_USER));
    expect(order).toContain('general');
    const general = CHIPS.find((c) => c.id === 'general');
    expect(general.match).toBe('General');
  });
});

describe('new-user fallback', () => {
  it('leads with the viewer\'s regional trends', () => {
    const order = rankFor(PROFILE_NEW_USER);
    // Pakistan → entertainment, music, news, comedy
    expect(catRank(order, 'entertainment')).toBe(0);
    expect(catRank(order, 'music')).toBe(1);
  });

  it('gives a different lead-in for a different country', () => {
    const us = { ...PROFILE_NEW_USER, country: 'United States' };
    expect(catRank(rankFor(us), 'gaming')).toBe(0);
    expect(catRank(rankFor(PROFILE_NEW_USER), 'gaming')).not.toBe(0);
  });

  it('falls back to global trends when the country is unknown', () => {
    const nowhere = { ...PROFILE_NEW_USER, country: null };
    expect(catRank(rankFor(nowhere), 'music')).toBe(0);
  });

  it('still lists every remaining category after the trends', () => {
    expect(ids(rankFor(PROFILE_NEW_USER))).toEqual(expect.arrayContaining(['fitness', 'food', 'travel']));
  });
});

describe('personalisation', () => {
  it('lifts the music watcher\'s main interest to the front of the categories', () => {
    expect(catRank(rankFor(PROFILE_MUSIC_USER), 'music')).toBe(0);
  });

  it('lifts the technology watcher\'s main interest instead', () => {
    expect(catRank(rankFor(PROFILE_TECH_USER), 'tech')).toBe(0);
  });

  it('produces genuinely different rows for the two returning viewers', () => {
    expect(ids(rankFor(PROFILE_MUSIC_USER))).not.toEqual(ids(rankFor(PROFILE_TECH_USER)));
  });

  it('weights recent watches above older ones', () => {
    const scores = deriveCategoryScores(
      { watched: [{ category: 'Music', at: new Date(FIXTURE_NOW).toISOString() }, { category: 'Comedy', at: new Date(FIXTURE_NOW - 60 * 86400000).toISOString() }] },
      FIXTURE_NOW,
    );
    expect(scores.get('Music')).toBeGreaterThan(scores.get('Comedy'));
  });

  it('personalises from a single watch, without collapsing the rest of the row', () => {
    const order = rankFor(PROFILE_LIGHT_USER);
    expect(catRank(order, 'travel')).toBe(0);
    expect(ids(order)).toHaveLength(CHIPS.length);
  });
});

describe('diversity — no single interest takes the row', () => {
  it('reserves early slots for discovery even for a heavy single-topic watcher', () => {
    const order = rankFor(PROFILE_MUSIC_USER);
    const firstFive = ids(order).filter((x) => CATEGORY_CHIPS.some((c) => c.id === x)).slice(0, 5);
    const personal = ['music', 'entertainment', 'comedy'];
    const discovery = firstFive.filter((id) => !personal.includes(id));
    expect(discovery.length).toBeGreaterThanOrEqual(1);
  });

  it('never runs more than two personalised chips back to back', () => {
    const obsessive = {
      ...PROFILE_MUSIC_USER,
      history: Array.from({ length: 40 }, (_, i) => ({
        watched_at: new Date(FIXTURE_NOW - i * 3600000).toISOString(),
        video: { category: ['Music', 'Comedy', 'Entertainment'][i % 3] },
      })),
    };
    const cats = ids(rankFor(obsessive)).filter((x) => CATEGORY_CHIPS.some((c) => c.id === x));
    const personal = new Set(['music', 'comedy', 'entertainment']);
    let run = 0;
    for (const id of cats) {
      run = personal.has(id) ? run + 1 : 0;
      expect(run).toBeLessThanOrEqual(2);
    }
  });
});

describe('history deletion', () => {
  it('produces the same row as a brand new user once history is gone', () => {
    expect(ids(rankFor(PROFILE_DELETED_HISTORY))).toEqual(ids(rankFor(PROFILE_NEW_USER)));
  });

  it('stops the deleted interests from influencing anything', () => {
    const before = rankFor(PROFILE_MUSIC_USER);
    const after = rankFor({ ...PROFILE_MUSIC_USER, history: [], searches: [] });
    expect(catRank(before, 'music')).toBe(0);
    expect(catRank(after, 'music')).not.toBe(0);
    expect(hasPersonalSignal(signalsFor({ ...PROFILE_MUSIC_USER, history: [], searches: [] }))).toBe(false);
  });
});

describe('determinism — the row never shuffles on its own', () => {
  it('returns an identical order for repeated calls with identical signals', () => {
    CHIP_DEMO_PROFILES.forEach((p) => {
      const a = ids(rankFor(p));
      for (let i = 0; i < 5; i++) expect(ids(rankFor(p))).toEqual(a);
    });
  });

  it('does not depend on the order signals arrived in', () => {
    const forward = rankVideoChips({ chips: CHIPS, signals: signalsFor(PROFILE_TECH_USER), now: FIXTURE_NOW });
    const reversed = rankVideoChips({
      chips: CHIPS,
      signals: signalsFor({ ...PROFILE_TECH_USER, history: [...PROFILE_TECH_USER.history].reverse() }),
      now: FIXTURE_NOW,
    });
    expect(ids(forward)).toEqual(ids(reversed));
  });
});

// Pins the exact row each demo profile produces. These are the orders reported back for review,
// so a change in ranking behaviour has to be an explicit, visible edit here.
describe('demo profiles — exact chip rows', () => {
  it('1. new user (Pakistan) — regional trends lead, then global, then the rest', () => {
    expect(ids(rankFor(PROFILE_NEW_USER))).toEqual([
      'all', 'trending', 'latest', 'mix',
      'entertainment', 'music', 'news', 'comedy', // Pakistan trends
      'gaming', 'tech',                            // global trends not already used
      'general', 'sports', 'education', 'travel', 'food', 'fitness',
      'watched',
    ]);
  });

  it('2. returning music-focused user — music leads, discovery still breaks the run', () => {
    expect(ids(rankFor(PROFILE_MUSIC_USER))).toEqual([
      'all', 'trending', 'latest', 'mix',
      'music', 'entertainment',  // personal
      'news',                    // forced in after two personal picks
      'comedy',                  // personal
      'gaming', 'tech', 'general', 'sports', 'education', 'travel', 'food', 'fitness',
      'watched',
    ]);
  });

  it('3. returning technology-focused user — a different country and a different row', () => {
    expect(ids(rankFor(PROFILE_TECH_USER))).toEqual([
      'all', 'trending', 'latest', 'mix',
      'tech', 'education',       // personal
      'sports',                  // forced discovery (a US trend)
      'gaming',                  // personal
      'news', 'music', 'entertainment', 'comedy', 'general', 'travel', 'food', 'fitness',
      'watched',
    ]);
  });

  it('4. limited history — the single interest still leads, the rest is discovery', () => {
    const order = ids(rankFor(PROFILE_LIGHT_USER));
    expect(order[0]).toBe('all');
    expect(catRank(rankFor(PROFILE_LIGHT_USER), 'travel')).toBe(0);
    expect(order[order.length - 1]).toBe('watched');
  });

  it('5. deleted history — identical to a brand new user', () => {
    expect(ids(rankFor(PROFILE_DELETED_HISTORY))).toEqual(ids(rankFor(PROFILE_NEW_USER)));
  });
});

describe('privacy — searches never become chips', () => {
  it('resolves a search only to an existing category', () => {
    expect(mapSearchesToCategories(['music'], CATEGORY_CHIPS)).toEqual(['music']);
  });

  it('drops anything that is not a known category', () => {
    const sensitive = ['my medical results', 'divorce lawyer near me', 'arijit singh'];
    expect(mapSearchesToCategories(sensitive, CATEGORY_CHIPS)).toEqual([]);
  });

  it('never surfaces raw query text in the rendered row', () => {
    const order = ids(rankVideoChips({
      chips: CHIPS,
      signals: buildChipSignals({
        country: 'Pakistan',
        history: [],
        searches: ['something private', 'another private thing'],
        categoryChips: CATEGORY_CHIPS,
      }),
      now: FIXTURE_NOW,
    }));
    expect(order.slice().sort()).toEqual(ids(CHIPS).slice().sort());
  });
});
