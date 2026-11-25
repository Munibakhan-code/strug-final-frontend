/**
 * Unseen counts for the Videos edge drawer tabs (Choice / Subs / Circle).
 *
 * The tabs used to give nothing away until they were opened, so a creator pick, a subscribed
 * channel's upload or a friend's watch went unnoticed. Each signal has its own idea of "newest":
 * picks and uploads carry increasing ids, Circle rows carry a timestamp. Every row is therefore
 * reduced to one comparable marker, and anything above the marker the viewer last saw is unseen.
 *
 * History is deliberately absent: the viewer's own watches are never news to them.
 */

/** Tabs that carry a badge. */
export const BADGE_TABS = ["creatorChoice", "subs", "circle"];

/** Anything above this shows as "9+" — the tab is 44px wide. */
export const BADGE_DISPLAY_CAP = 9;

const STORAGE_PREFIX = "strug_videos_drawer_seen_v1";

function numeric(value) {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * A seen marker, unlike a row marker, may legitimately be 0: "this tab has been seeded and there
 * was nothing in it". Only an absent marker means "never seeded". Without that distinction an empty
 * tab was re-seeded on every poll, so the first pick/upload/watch a new account ever received was
 * marked as seen and never badged.
 */
function seenValue(value) {
	// Number(null) and Number("") are both 0, and "seeded at 0" must not be confused with "absent".
	if (value == null || value === "" || typeof value === "boolean") return null;
	const n = Number(value);
	return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Pick id per row (mapCreatorChoiceShelf output). */
export function creatorChoiceRowMarkers(items) {
	return (Array.isArray(items) ? items : [])
		.map((item) => numeric(item?.pickId ?? item?.pick_id))
		.filter((id) => id != null);
}

/** Video id per subscription upload. */
export function subsRowMarkers(items) {
	return (Array.isArray(items) ? items : [])
		.map((item) => numeric(item?.id ?? item?.videoId ?? item?.video_id))
		.filter((id) => id != null);
}

/**
 * Newest friend timestamp per Circle row. Rows with no usable timestamp are skipped rather than
 * guessed at, so a payload without times simply never badges.
 */
export function circleRowMarkers(items, atMs) {
	return (Array.isArray(items) ? items : [])
		.map((item) => {
			let newest = 0;
			for (const friend of Array.isArray(item?.friends) ? item.friends : []) {
				const t = numeric(atMs(friend));
				if (t != null && t > newest) newest = t;
			}
			return newest > 0 ? newest : null;
		})
		.filter((t) => t != null);
}

export function maxMarker(markers) {
	let max = 0;
	for (const marker of Array.isArray(markers) ? markers : []) {
		const value = numeric(marker);
		if (value != null && value > max) max = value;
	}
	return max;
}

/**
 * How many rows sit above the marker the viewer last saw. Until the tab has been seeded at all it
 * stays quiet — a first visit is not a pile of news — but once seeded, a marker of 0 (the tab was
 * empty then) means everything that has arrived since is unseen.
 */
export function unseenCount(markers, seenMarker) {
	const seen = seenValue(seenMarker);
	if (seen == null) return 0;
	return (Array.isArray(markers) ? markers : []).filter((marker) => {
		const value = numeric(marker);
		return value != null && value > seen;
	}).length;
}

/**
 * Markers are stored per account: a shared browser must not show one viewer's unseen picks to
 * the next person who signs in.
 */
function storageKey(userId) {
	return userId == null || userId === "" ? STORAGE_PREFIX : `${STORAGE_PREFIX}:${userId}`;
}

export function readSeenMarkers(userId, storage = globalThis.localStorage) {
	try {
		const raw = storage?.getItem(storageKey(userId));
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return {};
		const out = {};
		for (const tab of BADGE_TABS) {
			const value = seenValue(parsed[tab]);
			if (value != null) out[tab] = value;
		}
		return out;
	} catch {
		return {};
	}
}

/**
 * Never moves a marker backwards — a stale poll must not resurrect a cleared badge.
 *
 * `known` is what the caller already holds (the hook's state). Storage is a mirror, not the source
 * of truth: where localStorage is blocked, reading it back would report "never seeded" forever and
 * the badge could never fire, so the merge starts from `known` and the write is best-effort.
 */
export function writeSeenMarker(userId, tab, marker, storage = globalThis.localStorage, known = null) {
	const current = { ...readSeenMarkers(userId, storage), ...(known ?? {}) };
	if (!BADGE_TABS.includes(tab)) return current;
	const value = seenValue(marker);
	if (value == null) return current;
	const held = current[tab];
	if (held != null && value <= held) return current;
	const next = { ...current, [tab]: value };
	try {
		storage?.setItem(storageKey(userId), JSON.stringify(next));
	} catch {
		// A full or blocked store only costs the badge its persistence; the session keeps counting.
	}
	return next;
}

/**
 * Video id behind a drawer row, whatever tab it came from: a mapped Creator's Choice video pick,
 * a raw subscription upload, or a Circle activity row. Channel picks carry no video and return
 * null — nothing to have watched.
 */
export function rowVideoId(row) {
	if (!row || typeof row !== "object") return null;
	const video = row.video ?? row;
	return numeric(video.id ?? video.videoId ?? video.video_id);
}

/**
 * Drop rows for videos the viewer has already watched. A video watched from the home feed is not
 * news in Subs, Choice or Circle any more, so it leaves the tab and stops counting — the same set
 * feeds the list and the badge, so the number always matches what is behind the tab.
 */
export function withoutWatched(rows, watchedIds) {
	if (!(watchedIds instanceof Set) || watchedIds.size === 0) return Array.isArray(rows) ? rows : [];
	return (Array.isArray(rows) ? rows : []).filter((row) => {
		const id = rowVideoId(row);
		return id == null || !watchedIds.has(id);
	});
}

/** Watched video ids from a mapped watch-history list, as a Set of numbers. */
export function watchedIdSet(historyRows, extraIds = []) {
	const out = new Set();
	for (const row of Array.isArray(historyRows) ? historyRows : []) {
		const id = rowVideoId(row);
		if (id != null) out.add(id);
	}
	for (const extra of extraIds instanceof Set ? extraIds : (Array.isArray(extraIds) ? extraIds : [])) {
		const id = numeric(extra);
		if (id != null) out.add(id);
	}
	return out;
}

/** "9+" past the cap, the raw number below it, "" for nothing to show. */
export function badgeLabel(count) {
	const n = Number(count);
	if (!Number.isFinite(n) || n <= 0) return "";
	return n > BADGE_DISPLAY_CAP ? `${BADGE_DISPLAY_CAP}+` : String(Math.floor(n));
}
