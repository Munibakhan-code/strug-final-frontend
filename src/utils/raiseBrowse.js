import { slugify } from './slugify.js';

export const RAISE_CATEGORY_DEFS = [
  { id: 'all', labelKey: 'common.all', color: '#2563eb', match: null },
  { id: 'technology', labelKey: 'learn.categories.technology', color: '#7c3aed', match: 'Technology' },
  { id: 'art', labelKey: 'pinboard.categories.art', color: '#db2777', match: 'Art' },
  { id: 'community', labelKey: 'community.title', color: '#65a30d', match: 'Community' },
  { id: 'food', labelKey: 'discounts.categories.food', color: '#d97706', match: 'Food' },
  { id: 'medical', labelKey: 'medical.title', color: '#dc2626', match: 'Medical' },
];

export function mapRaiseCampaign(p, i = 0, thumbs = []) {
  const goal = Number(p?.expected_amount) || 0;
  const raised = Number(p?.current_amount) || 0;
  let daysLeft = 30;
  if (p?.deadline) {
    const ms = new Date(p.deadline).getTime() - Date.now();
    daysLeft = Math.max(0, Math.round(ms / 86400000));
  }
  return {
    id: p?.project_id,
    isReal: true,
    title: p?.title || p?.project_name || 'Untitled Campaign',
    creator: p?.user?.name || 'Strug Creator',
    category: p?.category || 'Community',
    goal,
    raised,
    backers: Array.isArray(p?.donations) ? p.donations.length : 0,
    daysLeft,
    coverUrl: p?.cover_url || null,
    thumb: thumbs.length ? thumbs[i % thumbs.length] : null,
    type: p?.campaign_type === 'campaign' ? 'kickstarter' : 'gofundme',
    status: p?.status || 'live',
    slug: p?.slug || (p?.project_id != null ? `${p.project_id}-${slugify(p?.title || p?.project_name || 'campaign')}` : null),
    tagline: p?.description || 'Back this campaign you believe in.',
  };
}

export function filterRaiseCampaigns(campaigns, { activeCategory = 'all', categories = [], query = '' } = {}, matchesCategoryFn) {
  const q = String(query || '').trim().toLowerCase();
  const list = Array.isArray(campaigns) ? campaigns : [];
  return list.filter((item) => {
    const categoryOk = typeof matchesCategoryFn === 'function'
      ? matchesCategoryFn(activeCategory, item.category, categories)
      : !activeCategory || activeCategory === 'all' || item.category === activeCategory;
    const queryOk = !q
      || String(item.title || '').toLowerCase().includes(q)
      || String(item.creator || '').toLowerCase().includes(q)
      || String(item.category || '').toLowerCase().includes(q)
      || String(item.tagline || '').toLowerCase().includes(q);
    return categoryOk && queryOk;
  });
}

export function raisePathForView(view, project) {
  if (view === 'create') return '/raise/create';
  if (view === 'backed') return '/raise/backed';
  if ((view === 'project' || view === 'confirm') && project?.id != null) {
    return `/raise/${project.id}-${slugify(project.title || 'campaign')}`;
  }
  if (view === 'manage' && project?.id != null) return `/raise/manage/${project.id}`;
  return '/raise';
}

export function parseRaisePath(pathname) {
  const p = String(pathname || '');
  if (/^\/raise\/create\/?$/.test(p)) return { view: 'create' };
  if (/^\/raise\/backed\/?$/.test(p)) return { view: 'backed' };
  const manage = p.match(/^\/raise\/manage\/([^/]+)\/?$/);
  if (manage) return { view: 'manage', id: manage[1].split('-')[0] };
  const project = p.match(/^\/raise\/([^/]+)\/?$/);
  if (project && project[1] !== 'create' && project[1] !== 'backed' && project[1] !== 'manage') {
    return { view: 'project', id: project[1].split('-')[0] };
  }
  return { view: 'grid' };
}
