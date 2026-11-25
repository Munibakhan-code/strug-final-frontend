// Resolves an uploaded-media path to a URL the browser can actually load.
//
// The backend `/photo` upload endpoint stores files on the API server's disk and
// returns a RELATIVE path like `/uploads/photos/123-pic.jpg`. Rendered directly in
// an <img src> that path resolves against the *frontend* origin (app.strug.ca),
// which has no such file -> broken image. Prepending the API base (the same value
// the axios client uses) points it back at the API server, which serves /uploads
// statically. Resolving at render time (rather than baking an absolute URL in at
// upload time) keeps stored data env-agnostic and fixes already-stored paths too.
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/+$/, '');

export function mediaUrl(url) {
  if (!url || typeof url !== 'string') return url;
  // Already absolute (http/https), a data/blob URI, or protocol-relative -> leave as-is.
  if (/^(https?:|data:|blob:)/i.test(url) || url.startsWith('//')) return url;
  // Server upload paths -> prefix with the API origin.
  if (url.startsWith('/uploads') || url.startsWith('uploads/')) {
    return `${API_BASE}/${url.replace(/^\/+/, '')}`;
  }
  return url;
}

/** Pull a usable string path/URL from a gallery entry (string or { url|src|path|… }). */
function coerceMediaEntry(item) {
  if (!item) return null;
  if (typeof item === 'string') {
    const s = item.trim();
    return s || null;
  }
  if (typeof item === 'object') {
    const u = item.url ?? item.src ?? item.path ?? item.image_url ?? item.imageUrl;
    return typeof u === 'string' && u.trim() ? u.trim() : null;
  }
  return null;
}

// Convenience: resolve an array (or JSON-string array) of media paths, dropping falsy entries.
export function mediaUrls(list) {
  if (typeof list === 'string') {
    const raw = list.trim();
    if (!raw) return [];
    if (raw.startsWith('[')) {
      try {
        return mediaUrls(JSON.parse(raw));
      } catch {
        return [mediaUrl(raw)].filter(Boolean);
      }
    }
    return [mediaUrl(raw)];
  }
  if (!Array.isArray(list)) return [];
  return list.map(coerceMediaEntry).filter(Boolean).map(mediaUrl);
}
