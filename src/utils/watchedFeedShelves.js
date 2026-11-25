/**
 * Mobile home-feed watched rails. Empty history means no rails at all — never an empty
 * "Watched" row for a new viewer. `recent` keeps API order (newest first). `more` is a
 * shuffled copy so the lower rail is not the same sequence again. One watched video is
 * not enough for a second rail.
 */

export const WATCHED_SHELF_LIMIT = 12;

function fisherYates(arr) {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

export function watchedFeedShelves(videos, { shuffle = fisherYates, limit = WATCHED_SHELF_LIMIT } = {}) {
	const list = Array.isArray(videos)
		? videos.filter((v) => v != null && (v.id ?? v.videoId ?? v.video_id) != null)
		: [];
	if (list.length === 0) return { recent: [], more: [] };
	const recent = list.slice(0, limit);
	// The lower rail draws from what the upper rail did NOT show. Shuffling the whole list
	// instead meant that with 12 or fewer watched videos both rails held the same cards in a
	// different order, which reads as a rendering bug rather than as two shelves.
	const rest = list.slice(limit);
	if (rest.length === 0) return { recent, more: [] };
	return { recent, more: shuffle(rest).slice(0, limit) };
}
