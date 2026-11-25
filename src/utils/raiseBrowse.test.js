/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { filterRaiseCampaigns, mapRaiseCampaign, parseRaisePath, raisePathForView } from './raiseBrowse.js';

describe('raiseBrowse', () => {
  it('maps API rows into campaign cards', () => {
    const out = mapRaiseCampaign({
      project_id: 7,
      title: 'Solar Village',
      category: 'Technology',
      campaign_type: 'campaign',
      expected_amount: 5000,
      current_amount: 2500,
      donations: [{}, {}],
      user: { name: 'Amina' },
    }, 0, ['thumb']);
    expect(out).toMatchObject({
      id: 7,
      title: 'Solar Village',
      category: 'Technology',
      creator: 'Amina',
      thumb: 'thumb',
      type: 'kickstarter',
      backers: 2,
    });
  });

  it('filters by stable category id and query', () => {
    const rows = [
      { id: 1, title: 'Solar Village', creator: 'Amina', category: 'Technology', tagline: 'Lanterns' },
      { id: 2, title: 'Community Garden', creator: 'Luis', category: 'Community', tagline: 'Food access' },
    ];
    const categories = [{ id: 'technology', match: 'Technology' }];
    const out = filterRaiseCampaigns(rows, { activeCategory: 'technology', categories, query: 'solar' }, (activeId, itemValue, cats) => {
      const cat = cats.find((c) => c.id === activeId);
      return !cat || itemValue === cat.match;
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(1);
  });

  it('builds and parses raise paths', () => {
    expect(raisePathForView('create')).toBe('/raise/create');
    expect(raisePathForView('project', { id: 42, title: 'Solar Village' })).toBe('/raise/42-solar-village');
    expect(parseRaisePath('/raise/manage/42-solar-village')).toEqual({ view: 'manage', id: '42' });
    expect(parseRaisePath('/raise/backed')).toEqual({ view: 'backed' });
  });
});
