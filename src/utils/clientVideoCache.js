// sessionStorage: the first page of mapped Social posts, so a refresh paints instantly instead of
// waiting on the network.
export const FEED_CACHE_KEY = "strug_feed_cache_v1";

// Board #442: deleting a video left it visible elsewhere on the platform. The server side of that
// was stale Redis/HTTP caches (fixed in the backend); the client side is this cache. It outlives
// the Feed component — it's sessionStorage, not component state — so once a deleted video was in
// it, Social kept painting that video from cache on every remount for the rest of the session.
//
// Call this after any delete so the next Social render refetches instead of replaying the cache.
export function clearFeedCache() {
  try {
    sessionStorage.removeItem(FEED_CACHE_KEY);
  } catch {
    /* private mode / quota — nothing cached, nothing to clear */
  }
}
