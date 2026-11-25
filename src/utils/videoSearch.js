/** True when a creator row should appear for this search query. */
export function channelMatchesQuery(query, { display_name, handle } = {}) {
	const ql = String(query ?? '').trim().toLowerCase();
	if (!ql) return false;
	const name = String(display_name ?? '').toLowerCase();
	const h = String(handle ?? '').replace(/^@/, '').toLowerCase();
	return name.includes(ql) || h.includes(ql) || (h.length > 0 && ql.includes(h));
}

/**
 * Creator rows on the search results page — from /video/suggest channels + video hits.
 * Each row carries channel_id (or handle) so opening it loads the real channel feed.
 */
export function buildMatchedChannels(query, { searchResults = [], searchChannels = [], fallbackItems = [] } = {}) {
	const ql = query.trim().toLowerCase();
	if (!ql) return [];
	const seen = new Set();
	const out = [];
	const countVideos = (cid, name, pool) => pool.filter((x) => (
		cid != null ? x.channel_id === cid : (typeof x.channel === 'string' && x.channel === name)
	)).length;
	const push = ({ channel_id, display_name, handle, profile_pic_url, videoCount, avatar, thumb, description, subscriber_count }) => {
		if (!display_name) return;
		const cid = channel_id ?? null;
		const h = handle ? String(handle).replace(/^@/, '') : null;
		if (cid == null && !h) return;
		if (!channelMatchesQuery(ql, { display_name, handle: h })) return;
		const key = cid != null ? `id:${cid}` : `handle:${h}`;
		if (seen.has(key)) return;
		seen.add(key);
		out.push({
			name: display_name,
			avatar: avatar ?? (display_name || '?')[0].toUpperCase(),
			videoCount: videoCount ?? 0,
			channelObj: {
				channel_id: cid,
				channelId: cid,
				id: cid,
				name: display_name,
				display_name,
				handle: h,
				avatar: avatar ?? (display_name || '?')[0].toUpperCase(),
				profile_pic_url: profile_pic_url ?? null,
				description: description ?? null,
				subscriber_count: subscriber_count ?? 0,
				thumb: thumb ?? null,
			},
		});
	};
	const videoPool = searchResults.length > 0 ? searchResults : fallbackItems;
	for (const ch of searchChannels) {
		push({
			channel_id: ch.channel_id,
			display_name: ch.display_name,
			handle: ch.handle,
			profile_pic_url: ch.profile_pic_url,
			videoCount: countVideos(ch.channel_id, ch.display_name, videoPool),
		});
	}
	const source = videoPool;
	for (const v of source) {
		const name = typeof v.channel === 'string' ? v.channel : '';
		if (!channelMatchesQuery(ql, { display_name: name, handle: v.handle })) continue;
		const cid = v.channel_id ?? null;
		push({
			channel_id: cid,
			display_name: name,
			handle: v.handle ?? null,
			profile_pic_url: v.profile_pic_url,
			videoCount: countVideos(cid, name, source),
			avatar: v.avatar,
			thumb: v.thumb,
			description: v.channel_description,
			subscriber_count: v.subscriber_count,
		});
	}
	return out;
}
