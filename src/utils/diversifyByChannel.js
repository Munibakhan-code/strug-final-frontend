/**
 * Spread videos across channels so one prolific uploader cannot own the home feed.
 * Round-robins channel queues (keeps each channel's relative order).
 */
export function diversifyByChannel(videos) {
	if (!Array.isArray(videos) || videos.length <= 1) return videos ? [...videos] : [];

	const groups = new Map();
	for (const v of videos) {
		const raw = v?.channel_id ?? v?.channelId ?? null;
		const fallback = v?.channel != null && v.channel !== "" ? `name:${v.channel}` : null;
		const id = v?.id ?? v?.videoId ?? v?.video_id;
		const key = raw != null ? `id:${raw}` : (fallback || `solo:${id}`);
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(v);
	}

	if (groups.size <= 1) return [...videos];

	const queues = [...groups.values()].map((list) => list.slice());
	const out = [];
	let added = true;
	while (added) {
		added = false;
		for (const q of queues) {
			if (q.length) {
				out.push(q.shift());
				added = true;
			}
		}
	}
	return out;
}
