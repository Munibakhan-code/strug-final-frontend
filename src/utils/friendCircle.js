/** Group friend-activity feed rows into drawer lanes (watch page edge panel only). */

import i18n from "../i18n/index.js";

/** Caps for the watch-edge drawer lanes. */
export const DRAWER_CIRCLE_LANE_CAP = 8;
export const DRAWER_SUB_UPLOAD_CAP = 12;

function friendDisplayName(friend) {
	return friend?.display_name || friend?.name || "A friend";
}

/** Parse BE `friends[].at` (ms number or ISO) into a finite timestamp. */
export function friendActivityAtMs(friend) {
	const at = friend?.at ?? friend?.watched_at ?? friend?.liked_at ?? friend?.created_at;
	if (at == null || at === "") return null;
	const t = typeof at === "number" ? at : new Date(at).getTime();
	return Number.isFinite(t) && t > 0 ? t : null;
}

/**
 * Real relative time for Circle attribution — e.g. "3 hours ago", "2 days ago".
 * Uses the friend's activity timestamp from the API (like / watch).
 */
export function friendActivityAgo(friend) {
	const t = friendActivityAtMs(friend);
	if (t == null) return "";
	const diff = Date.now() - t;
	if (!Number.isFinite(diff) || diff < 0) return i18n.t("videos.edgeDrawer.agoJustNow", { defaultValue: "just now" });
	const m = Math.floor(diff / 60_000);
	if (m < 1) return i18n.t("videos.edgeDrawer.agoJustNow", { defaultValue: "just now" });
	if (m < 60) {
		return i18n.t("videos.edgeDrawer.agoMinutes", {
			count: m,
			defaultValue: m === 1 ? "1 minute ago" : "{{count}} minutes ago",
		});
	}
	const h = Math.floor(m / 60);
	if (h < 24) {
		return i18n.t("videos.edgeDrawer.agoHours", {
			count: h,
			defaultValue: h === 1 ? "1 hour ago" : "{{count}} hours ago",
		});
	}
	const d = Math.floor(h / 24);
	if (d < 7) {
		return i18n.t("videos.edgeDrawer.agoDays", {
			count: d,
			defaultValue: d === 1 ? "1 day ago" : "{{count}} days ago",
		});
	}
	const w = Math.floor(d / 7);
	if (w < 5) {
		return i18n.t("videos.edgeDrawer.agoWeeks", {
			count: w,
			defaultValue: w === 1 ? "1 week ago" : "{{count}} weeks ago",
		});
	}
	const mo = Math.floor(d / 30);
	return i18n.t("videos.edgeDrawer.agoMonths", {
		count: Math.max(1, mo),
		defaultValue: mo <= 1 ? "1 month ago" : "{{count}} months ago",
	});
}

function withAgo(line, ago) {
	return ago ? `${line} · ${ago}` : line;
}

/**
 * One-line attribution for a Circle drawer card.
 * Examples: "Maya liked this · 2 days ago", "Ana watched this · 5 hours ago".
 * Live "watching now" is private — never shown (BE also omits in-progress sessions).
 */
export function friendActivityAttribution(item) {
	const friends = item?.friends || [];
	const n = item?.friend_count || friends.length;
	if (n === 0) return "";
	const first = friends[0];
	const name = friendDisplayName(first);
	const others = Math.max(0, n - 1);
	const ago = friendActivityAgo(first);

	// Defensive: if an old payload still marks watching_now, treat it as watched (no live line).
	const action = (item.watching_now || first?.action === "watching") ? "watched" : first?.action;
	if (action === "liked") {
		const base = others === 0 ? `${name} liked this` : `${name} +${others} liked this`;
		return withAgo(base, ago);
	}
	if (action === "watched") {
		const base = others === 0 ? `${name} watched this` : `${name} +${others} watched this`;
		return withAgo(base, ago);
	}

	if (others === 0) return withAgo(`${name} engaged`, ago);
	return withAgo(`${name} +${others} friends`, ago);
}

export function friendActivityToVideo(item) {
	return {
		id: item.video_id,
		videoId: item.video_id,
		title: item.title,
		channel: item.channel?.display_name ?? "Creator",
		channel_name: item.channel?.display_name ?? "Creator",
		public_id: item.public_id,
		slug: item.slug,
		thumb: item.thumbnail_url,
		thumbnail_url: item.thumbnail_url,
		duration_sec: item.duration_sec,
		views_count: item.views_count,
	};
}

/** Newest friend action on a row, for ordering a lane. */
function rowActivityAtMs(item) {
	let newest = 0;
	for (const friend of Array.isArray(item?.friends) ? item.friends : []) {
		const t = friendActivityAtMs(friend);
		if (t != null && t > newest) newest = t;
	}
	return newest;
}

/**
 * Split feed into drawer lanes. Live watching is private — never a Watching-now lane.
 *
 * Each lane is ordered by the most recent friend action, newest first: the API ranks the feed by
 * how many friends engaged before it looks at time, which is right for a "friends are watching"
 * rail but reads as shuffled in a drawer, where a video three friends liked last week sat above
 * the one a friend watched this morning.
 */
export function groupFriendActivityLanes(items, laneCap = DRAWER_CIRCLE_LANE_CAP) {
	const liked = [];
	const watched = [];
	for (const item of Array.isArray(items) ? items : []) {
		const topAction = item.friends?.[0]?.action;
		// Skip in-progress live sessions (and legacy watching_now payloads).
		if (item.watching_now || topAction === "watching") continue;
		if (topAction === "liked") liked.push(item);
		else watched.push(item);
	}
	const cap = Number.isFinite(Number(laneCap)) && Number(laneCap) > 0
		? Math.floor(Number(laneCap))
		: DRAWER_CIRCLE_LANE_CAP;
	const byRecency = (a, b) => rowActivityAtMs(b) - rowActivityAtMs(a);
	return {
		watchingNow: [],
		liked: liked.sort(byRecency).slice(0, cap),
		watched: watched.sort(byRecency).slice(0, cap),
	};
}

export function formatFriendNameList(friends, max = 3) {
	const names = (friends || []).map((f) => f.display_name).filter(Boolean).slice(0, max);
	if (names.length === 0) return "";
	if (names.length === 1) return names[0];
	if (names.length === 2) return `${names[0]} and ${names[1]}`;
	return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
