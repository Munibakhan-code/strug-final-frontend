/** Town Hall Saved tab filters (#1582). Photos are posts with media, not "no media_url". */

export function filterSavedTownHallPosts(posts, filter) {
	const list = Array.isArray(posts) ? posts : [];
	const f = filter || "all";
	if (f === "all") return list;
	if (f === "video") return list.filter((p) => p?.media_type === "video");
	if (f === "photo") return list.filter((p) => p?.media_url && p?.media_type !== "video");
	if (f === "post") return list.filter((p) => p?.media_type !== "video");
	return list;
}
