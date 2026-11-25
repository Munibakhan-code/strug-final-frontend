// OG-tag prerender for social crawlers.
// For bots: fetch listing/post data from backend, return enriched HTML.
// For browsers: fetch root index.html and return the SPA with OG tags injected.
const BACKEND = process.env.VITE_API_URL || 'https://backend.strug.ca';
const BOT_UA = /Twitterbot|facebookexternalhit|Slackbot-LinkExpanding|Discordbot|Googlebot|WhatsApp|TelegramBot|LinkedInBot|iMessage|Applebot|Bingbot/i;

module.exports = async function (context, req) {
  const ua = req.headers['user-agent'] || '';
  // The original path is passed by Azure SWA as x-original-url or x-ms-original-url
  const origUrl =
    req.headers['x-original-url'] ||
    req.headers['x-ms-original-url'] ||
    req.headers['x-forwarded-uri'] ||
    req.url ||
    '/';
  const path = origUrl.split('?')[0];

  const host = req.headers['x-forwarded-host'] || req.headers['host'] || 'app.strug.ca';
  const scheme = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${scheme}://${host}`;

  let title = 'Strug — Your Time. Your Work. Your Money.';
  let description = 'Discover local services, food, events, hosting, and more on Strug.';
  let image = `${origin}/strug.svg`;
  let ogType = 'website';

  // Fetch content-specific data for enriched OG tags
  try {
    const listingMatch = path.match(/^\/listing\/(food|shop|host)\/(\d+)/);
    const townhallMatch = path.match(/^\/townhall\/(\d+)/);
    const communityMatch = path.match(/^\/community\/(?!post\/)([^/]+)/);
    const communityPostMatch = path.match(/^\/community\/post\/(\d+)/);
    const profileMatch = path.match(/^\/@([^/]+)/);

    if (listingMatch) {
      const [, vertical, id] = listingMatch;
      const ep = { food: `/vendor/${id}`, shop: `/product-listing/${id}`, host: `/booking/listings/${id}` };
      const r = await fetch(`${BACKEND}${ep[vertical]}`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        const d = await r.json();
        title = d.name || d.title || title;
        description = (d.description || `${vertical === 'food' ? 'Order from' : vertical === 'host' ? 'Book' : 'Shop'} ${title} on Strug.`).slice(0, 200);
        const img = d.images?.[0] || d.image_url || (d.product_variation?.[0]?.image_url);
        if (img) image = img;
        ogType = vertical === 'host' ? 'website' : 'product';
      }
    } else if (townhallMatch) {
      const r = await fetch(`${BACKEND}/town-hall/public/${townhallMatch[1]}`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        const d = await r.json();
        const sp = d.user?.social_profiles?.[0];
        const name = sp?.display_name || d.user?.name || d.user?.username || 'Someone';
        title = `${name} on Strug`;
        description = (d.content || '').slice(0, 200) || 'See this post on Strug.';
        if (d.media_url) image = d.media_url;
        ogType = 'article';
      }
    } else if (communityPostMatch) {
      const r = await fetch(`${BACKEND}/community/posts/${communityPostMatch[1]}`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        const d = await r.json();
        const post = d.data ?? d;
        title = `Post in ${post.community?.name || 'a community'} on Strug`;
        description = (post.content || '').slice(0, 200) || 'See this community post on Strug.';
        ogType = 'article';
      }
    } else if (communityMatch) {
      title = `${decodeURIComponent(communityMatch[1]).replace(/-/g, ' ')} Community on Strug`;
      description = 'Join this community on Strug.';
    } else if (profileMatch) {
      title = `@${profileMatch[1]} on Strug`;
      description = `See ${profileMatch[1]}'s profile on Strug.`;
    }
  } catch { /* best-effort — fall through to defaults */ }

  const canonicalUrl = `${origin}${path}`;

  const ogTags = `
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${esc(image)}">
  <meta property="og:url" content="${esc(canonicalUrl)}">
  <meta property="og:site_name" content="Strug">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(image)}">`.trim();

  const isBot = BOT_UA.test(ua);

  if (isBot) {
    // Minimal HTML with OG tags only — crawlers don't execute JS
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
      body: `<!DOCTYPE html><html><head><meta charset="utf-8">\n${ogTags}\n</head><body></body></html>`,
    };
    return;
  }

  // Browser: fetch SPA index.html and inject OG tags so the SPA boots normally
  try {
    const spaRes = await fetch(`${origin}/`, { signal: AbortSignal.timeout(5000) });
    if (spaRes.ok) {
      const html = await spaRes.text();
      const enriched = html.replace('<head>', `<head>\n${ogTags}`);
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
        body: enriched,
      };
      return;
    }
  } catch { /* fall through to bare redirect */ }

  // Last resort: redirect to root (SPA deep-link won't work but at least the app loads)
  context.res = { status: 302, headers: { Location: '/' } };
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
