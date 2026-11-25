/**
 * Parse `/video/home-feed` (getForYou engine) for the Videos editorial landing.
 * Items may mix posts and videos — the browse grid only renders videos.
 */

export function isHomeFeedVideo(item) {
	if (!item || typeof item !== "object") return false;
	if (item.content_type && item.content_type !== "video") return false;
	const id = item.video_id ?? item.id;
	return id != null && !Number.isNaN(Number(id));
}

export function unwrapHomeFeedResponse(resp) {
	const root = resp?.data ?? resp ?? {};
	const items = Array.isArray(root.items) ? root.items : [];
	const rawCursor = root.next_cursor ?? root.nextCursor ?? null;
	const nextCursor = rawCursor == null || rawCursor === "" ? null : Number(rawCursor);
	return {
		items: items.filter(isHomeFeedVideo),
		nextCursor: Number.isFinite(nextCursor) ? nextCursor : null,
		coldStart: !!(root.cold_start ?? root.cold),
	};
}
