import client from '../api/client.js';

/** Resolve chat media URLs. Private Azure blobs use signed URLs for playback. */
export function resolveChatMediaDisplayUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;


  return trimmed;
}

export function isAzureBlobUrl(url) {
  try {
    return new URL(url).hostname.includes('blob.core.windows.net');
  } catch {
    return false;
  }
}

const signedUrlCache = new Map();

function getCachedSignedUrl(url) {
  if (!url) return null;
  const cacheKey = url.split('?')[0];
  const cached = signedUrlCache.get(cacheKey);
  return cached && cached.expiresAt > Date.now() ? cached.url : null;
}

export function getChatMediaDisplayUrlSync(url) {
  if (!url || typeof url !== 'string') return url;
  if (!isAzureBlobUrl(url)) return resolveChatMediaDisplayUrl(url);
  return getCachedSignedUrl(url);
}

const inFlightSignRequests = new Map();

export async function resolveChatMediaDisplayUrlAsync(url) {
  const immediate = resolveChatMediaDisplayUrl(url);
  if (!url || !isAzureBlobUrl(url)) {
    return immediate;
  }

  const cacheKey = url.split('?')[0];
  const cached = getCachedSignedUrl(url);
  if (cached) {
    return cached;
  }

  const existing = inFlightSignRequests.get(cacheKey);
  if (existing) return existing;

  const request = client
    .get('/chat-media/sign', { params: { url: cacheKey } })
    .then(({ data }) => {
      const signed = data?.signed_url;
      if (signed) {
        signedUrlCache.set(cacheKey, {
          url: signed,
          expiresAt: Date.now() + (data?.expires_in_seconds ?? 3600) * 1000 * 0.9,
        });
        return signed;
      }
      return immediate;
    })
    .catch(() => immediate)
    .finally(() => {
      inFlightSignRequests.delete(cacheKey);
    });

  inFlightSignRequests.set(cacheKey, request);
  return request;
}
