export function mapTownHallPoll(p) {
	if (!p) return null;
	const src = p.poll && typeof p.poll === "object" ? p.poll : null;
	const optionsRaw = src?.options ?? p.poll_options;
	if (!Array.isArray(optionsRaw) || optionsRaw.length === 0) return src;
	const options = optionsRaw.map((o) => ({
		option_id: o.option_id,
		text: o.option_text || o.text,
		votes_count: o._count?.votes ?? o.votes_count ?? 0,
	}));
	const total = src?.total_votes ?? options.reduce((s, o) => s + (o.votes_count ?? 0), 0);
	const voted = src?.voted_option_id ?? p.voted_option_id;
	return {
		...src,
		options,
		total_votes: total,
		voted_option_id: voted == null ? null : voted,
	};
}

export function quotedPostApiId(quoted) {
	if (!quoted || quoted._fromText) return null;
	const id = quoted.id ?? quoted.post_id;
	if (id == null || id === "") return null;
	return id;
}

export function townHallFollowLabel(state, t) {
	if (state === "requested") return t("social.requested", "Requested");
	if (state) return t("common.following");
	return t("common.follow");
}
