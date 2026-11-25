import { describe, it, expect } from 'vitest';
import {
  VIDEO_SECTION_DEFS,
  isSectionFilterId,
  buildVideoChips,
  chipIdFromState,
  chipSelectionToState,
} from './videoChips.js';

// Shapes match what useI18nCategoryList() hands back (defs + a resolved `label`).
const SECTIONS = VIDEO_SECTION_DEFS.map((d) => ({ ...d, label: d.id }));
const CATEGORIES = [
  { id: 'all', label: 'All', match: null },
  { id: 'music', label: 'Music', match: 'Music' },
  { id: 'gaming', label: 'Gaming', match: 'Gaming' },
  { id: 'general', label: 'General', match: 'General' },
];

describe('buildVideoChips', () => {
  it('orders the row: catalogue sorts, then categories, then personal lists', () => {
    const chips = buildVideoChips(SECTIONS, CATEGORIES);
    expect(chips.map((c) => c.id)).toEqual([
      'all', 'trending', 'latest', 'mix',
      'music', 'gaming', 'general',
      'watched',
    ]);
  });

  it('parks the personal "watched" list last, after every category', () => {
    const chips = buildVideoChips(SECTIONS, CATEGORIES);
    expect(chips[chips.length - 1].id).toBe('watched');
  });

  it('keeps short-form out of the chip row — it is a section, not a filter', () => {
    const chips = buildVideoChips(SECTIONS, CATEGORIES);
    expect(chips.map((c) => c.id)).not.toContain('shorts');
    expect(isSectionFilterId('shorts')).toBe(false);
  });

  it('renders exactly one "All" chip', () => {
    const chips = buildVideoChips(SECTIONS, CATEGORIES);
    expect(chips.filter((c) => c.id === 'all')).toHaveLength(1);
  });

  it('never collides a section id with a category id', () => {
    const chips = buildVideoChips(SECTIONS, CATEGORIES);
    expect(new Set(chips.map((c) => c.id)).size).toBe(chips.length);
  });

  it('keeps each category\'s `match` intact for the API contract', () => {
    const chips = buildVideoChips(SECTIONS, CATEGORIES);
    expect(chips.find((c) => c.id === 'general')).toMatchObject({ match: 'General' });
    expect(chips.find((c) => c.id === 'music')).toMatchObject({ match: 'Music' });
  });
});

describe('isSectionFilterId', () => {
  it('recognises the section filters', () => {
    ['all', 'trending', 'latest', 'mix', 'watched'].forEach((id) => {
      expect(isSectionFilterId(id)).toBe(true);
    });
  });

  it('rejects category ids', () => {
    ['music', 'gaming', 'general', 'entertainment'].forEach((id) => {
      expect(isSectionFilterId(id)).toBe(false);
    });
  });
});

describe('chipSelectionToState', () => {
  it('narrows the section and clears any category', () => {
    expect(chipSelectionToState('trending')).toEqual({ activeFilter: 'trending', activeCategory: 'all' });
    expect(chipSelectionToState('mix')).toEqual({ activeFilter: 'mix', activeCategory: 'all' });
  });

  it('treats the personal "watched" list as a section, never as a category', () => {
    expect(chipSelectionToState('watched')).toEqual({ activeFilter: 'watched', activeCategory: 'all' });
  });

  it('narrows the category and resets the section to neutral', () => {
    expect(chipSelectionToState('music')).toEqual({ activeFilter: 'all', activeCategory: 'music' });
    expect(chipSelectionToState('general')).toEqual({ activeFilter: 'all', activeCategory: 'general' });
  });

  it('restores the fully unfiltered editorial view on "all"', () => {
    expect(chipSelectionToState('all')).toEqual({ activeFilter: 'all', activeCategory: 'all' });
  });

  it('is single-select — the pair is never narrowed on both axes at once', () => {
    buildVideoChips(SECTIONS, CATEGORIES).forEach(({ id }) => {
      const { activeFilter, activeCategory } = chipSelectionToState(id);
      expect(activeFilter === 'all' || activeCategory === 'all').toBe(true);
    });
  });
});

describe('chipIdFromState', () => {
  it('reports the category when one is selected', () => {
    expect(chipIdFromState('all', 'music')).toBe('music');
  });

  it('reports the section filter when no category is narrowed', () => {
    expect(chipIdFromState('trending', 'all')).toBe('trending');
    expect(chipIdFromState('all', 'all')).toBe('all');
  });

  it('round-trips every chip back to itself', () => {
    buildVideoChips(SECTIONS, CATEGORIES).forEach(({ id }) => {
      const s = chipSelectionToState(id);
      expect(chipIdFromState(s.activeFilter, s.activeCategory)).toBe(id);
    });
  });
});
