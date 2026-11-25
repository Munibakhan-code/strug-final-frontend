/** Session-scoped play queue for Videos — survives in-tab navigation, clears on tab close. */

const STORAGE_KEY = "strug_video_play_queue";

export function videoQueueId(video) {
	if (video == null) return null;
	const id = video.video_id ?? video.videoId ?? video.id;
	return id == null ? null : String(id);
}

export function readPlayQueue() {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export function writePlayQueue(queue) {
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(queue) ? queue : []));
	} catch { /* quota / private mode */ }
}

/** Append if missing; re-append moves to end (YouTube-style). Returns new queue. */
export function addToPlayQueue(queue, video) {
	const id = videoQueueId(video);
	if (!id) return queue ?? [];
	const base = Array.isArray(queue) ? queue : [];
	const rest = base.filter((v) => videoQueueId(v) !== id);
	return [...rest, video];
}

export function removeFromPlayQueue(queue, videoId) {
	const id = videoId == null ? null : String(videoId);
	if (!id) return queue ?? [];
	return (Array.isArray(queue) ? queue : []).filter((v) => videoQueueId(v) !== id);
}

export function shiftPlayQueue(queue) {
	const list = Array.isArray(queue) ? queue : [];
	if (!list.length) return { next: null, rest: list };
	const [next, ...rest] = list;
	return { next, rest };
}
