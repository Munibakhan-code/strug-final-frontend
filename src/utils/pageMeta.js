// Lightweight client-side document head manager for deep-linked pages (videos, live).
// Updates <title>, description, Open Graph, Twitter Card, and the canonical link so
// in-app titles and JS-rendering crawlers (e.g. Googlebot) reflect the current item.
//
// NOTE: non-JS social crawlers (Facebook/iMessage/WhatsApp/Slack/Twitter) do NOT run
// this — true link unfurls need server-side OG tags, which is a separate follow-up
// (an Azure Static Web Apps prerender function). This still fixes the in-app title,
// the canonical URL, and search-engine rendering.

const DEFAULTS = {
  title: 'Strug',
  description: 'Your Time. Your Work. Your Money.',
  image: '',
};

function upsertMeta(attr, key, content) {
  if (content == null) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href) {
  if (!href) return;
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Set page metadata for a deep-linked item.
 * @param {{title?:string, description?:string, image?:string, canonical?:string, ogType?:string}} meta
 */
export function setPageMeta({ title, description, image, canonical, ogType } = {}) {
  const t = title ? `${title} · Strug` : DEFAULTS.title;
  const d = description || DEFAULTS.description;
  const url = canonical || (typeof window !== 'undefined' ? window.location.href : '');

  document.title = t;
  upsertMeta('name', 'description', d);
  upsertMeta('property', 'og:title', title || DEFAULTS.title);
  upsertMeta('property', 'og:description', d);
  upsertMeta('property', 'og:type', ogType || 'website');
  if (url) upsertMeta('property', 'og:url', url);
  if (image) upsertMeta('property', 'og:image', image);
  upsertMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
  upsertMeta('name', 'twitter:title', title || DEFAULTS.title);
  upsertMeta('name', 'twitter:description', d);
  if (image) upsertMeta('name', 'twitter:image', image);
  upsertCanonical(url);
}

/** Restore the site defaults (call when leaving a deep-linked item). */
export function resetPageMeta() {
  document.title = DEFAULTS.title;
  upsertMeta('name', 'description', DEFAULTS.description);
  upsertMeta('property', 'og:title', DEFAULTS.title);
  upsertMeta('property', 'og:description', DEFAULTS.description);
  upsertMeta('property', 'og:type', 'website');
  upsertMeta('name', 'twitter:card', 'summary');
  upsertMeta('name', 'twitter:title', DEFAULTS.title);
  upsertMeta('name', 'twitter:description', DEFAULTS.description);
  const canonical = document.head.querySelector('link[rel="canonical"]');
  if (canonical) canonical.remove();
}
