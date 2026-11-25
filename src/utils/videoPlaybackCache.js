// Reopening a video used to blank the player until GET /video/play/:id came back, because a feed
// row carries no playable URL. On a phone that round trip is the whole gap between the tap and the
// first frame. The playback URL the route returns is a stable, unsigned blob path, so it is safe to
// replay a recent one immediately and let the fresh response correct the rest of the payload.
//
// Only playback-critical fields are remembered. Counts, subscription state and comments still come
// from the live response, so nothing user-visible can go stale beyond the poster.
const TTL_MS = 10 * 60 * 1000;
const entries = new Map();

function keysOf(video) {
	if (!video) return [];
	return [video.id, video.videoId, video.video_id, video.public_id]
		.filter((k) => k != null && k !== "")
		.map(String);
}

export function rememberPlayback(video) {
	const url = video?.processed_video_url;
	if (!url) return;
	const entry = {
		at: Date.now(),
		processed_video_url: url,
		thumbnail_url: video.thumbnail_url ?? null,
		duration_sec: video.duration_sec ?? null,
	};
	keysOf(video).forEach((k) => entries.set(k, entry));
}

// Returns the playback fields to merge into a feed row, or null when nothing usable is cached.
export function cachedPlayback(token) {
	if (token == null || token === "") return null;
	const entry = entries.get(String(token));
	if (!entry) return null;
	if (Date.now() - entry.at > TTL_MS) {
		entries.delete(String(token));
		return null;
	}
	const fields = { processed_video_url: entry.processed_video_url };
	if (entry.thumbnail_url) fields.thumbnail_url = entry.thumbnail_url;
	if (entry.duration_sec) fields.duration_sec = entry.duration_sec;
	return fields;
}

// Signing out must not leave one account's playback URLs readable by the next one.
export function clearPlaybackCache() {
	entries.clear();
}
