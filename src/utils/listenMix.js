/**
 * Session listen tracker → category Mix playlists.
 *
 * After a viewer watches MIX_THRESHOLD distinct videos of the same category
 * in one sitting, we upsert a Mix for that category ("Mix · Education",
 * "Mix · Music", or plain "Mix" when the category is missing/General).
 * Different types never land on the same auto-playlist.
 */
export const MIX_NAME = "Mix";
/** Legacy auto-playlist name from the single-mix era. Still treated as a Mix in the UI. */
export const YOUR_MIX_NAME = "Your Mix";
export const MIX_THRESHOLD = 4;
const MIX_SEP = " · ";
const SESSION_KEY = "strug_listen_session";
const SESSION_MS = 4 * 60 * 60 * 1000;

export function videoIdOf(v) {
	if (v == null) return null;
	for (const raw of [v.video_id, v.videoId, v.id]) {
		if (raw == null || raw === "") continue;
		const n = Number(raw);
		if (Number.isFinite(n) && n > 0) return n;
	}
	return null;
}

/** Strip "General"/blank so those watches share the unnamed Mix. */
export function normalizeCategory(category) {
	const c = (category ?? "").toString().trim();
	if (!c || /^general$/i.test(c)) return "";
	return c;
}

/** Auto / unnamed playlist title for a video's category. */
export function mixNameForCategory(category) {
	const c = normalizeCategory(category);
	return c ? `${MIX_NAME}${MIX_SEP}${c}` : MIX_NAME;
}

export function isMixPlaylist(name) {
	if (!name) return false;
	if (name === MIX_NAME || name === YOUR_MIX_NAME) return true;
	return name.startsWith(`${MIX_NAME}${MIX_SEP}`);
}

/** Mixes first in the save sheet, then the rest by name. */
export function sortPlaylistsForPicker(playlists) {
	return [...(playlists || [])].sort((a, b) => {
		const am = isMixPlaylist(a?.name) ? 0 : 1;
		const bm = isMixPlaylist(b?.name) ? 0 : 1;
		if (am !== bm) return am - bm;
		return String(a?.name || "").localeCompare(String(b?.name || ""));
	});
}

function readSession() {
	try {
		const raw = localStorage.getItem(SESSION_KEY);
		if (!raw) return null;
		const session = JSON.parse(raw);
		if (!session || !Array.isArray(session.items)) return null;
		if (Date.now() - (session.updatedAt || 0) > SESSION_MS) return null;
		return session;
	} catch {
		return null;
	}
}

function writeSession(session) {
	try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* quota */ }
}

function uniqueIdsOf(items) {
	return [...new Set((items || []).map((x) => x.id).filter((id) => id != null))];
}

/** Mixes that have enough distinct watches and at least one video not yet on the list. */
export function pendingMixesOf(session) {
	const items = session?.items || [];
	const synced = new Set((session?.syncedIds || []).map(String));
	const groups = new Map();
	for (const item of items) {
		const name = mixNameForCategory(item.category);
		if (!groups.has(name)) groups.set(name, []);
		groups.get(name).push(item.id);
	}
	const pending = [];
	for (const [name, ids] of groups) {
		const unique = [...new Set(ids.filter((id) => id != null))];
		const unsynced = unique.filter((uid) => !synced.has(String(uid)));
		if (unique.length >= MIX_THRESHOLD && unsynced.length > 0) {
			pending.push({ name, ids: unique, unsynced });
		}
	}
	return pending;
}

/** Record a watch. Returns the session plus whether any category mix should sync. */
export function recordListen(video) {
	const id = videoIdOf(video);
	if (id == null) return { items: [], uniqueIds: [], pendingMixes: [], shouldSync: false };
	const now = Date.now();
	const session = readSession() || { items: [], syncedIds: [], updatedAt: now };
	const existing = session.items.find((x) => String(x.id) === String(id));
	const category = video.category ?? "";
	if (existing) {
		existing.count = (existing.count || 1) + 1;
		if (category) existing.category = category;
	} else {
		session.items.push({ id, title: video.title ?? "", category, count: 1, at: now });
	}
	session.updatedAt = now;
	const uniqueIds = uniqueIdsOf(session.items);
	const pendingMixes = pendingMixesOf(session);
	const unsynced = pendingMixes.flatMap((g) => g.unsynced);
	const shouldSync = pendingMixes.length > 0;
	writeSession(session);
	return { ...session, uniqueIds, unsynced, pendingMixes, shouldSync };
}

export function markMixSynced(session, ids) {
	const next = {
		...session,
		syncedIds: [...new Set([...(session.syncedIds || []), ...ids])],
		updatedAt: Date.now(),
	};
	writeSession(next);
	return next;
}

async function upsertMix({ name, ids }, playlists, createPlaylist, addVideoToPlaylist, mapPlaylist) {
	if (!ids.length) return null;
	let mix = (playlists || []).find((p) => p.name === name) || null;
	if (!mix) {
		const r = await createPlaylist(name, ids[0]);
		const raw = r?.data ?? r;
		if (!raw) return null;
		mix = mapPlaylist(raw);
	}
	const have = new Set((mix.videos || []).map((v) => String(videoIdOf(v))));
	for (const id of ids) {
		if (have.has(String(id))) continue;
		try {
			const r = await addVideoToPlaylist(mix.id, id);
			const raw = r?.data ?? r;
			if (raw) {
				mix = mapPlaylist(raw);
				have.add(String(id));
			}
		} catch { /* already on list / unauthenticated */ }
	}
	return mix;
}

/**
 * Find-or-create a Mix per category and add any session videos that are not on it yet.
 * Uses the existing playlist API — no schema change.
 * Returns the mixes that were created or updated (possibly several).
 */
export async function syncYourMix({ session, playlists, createPlaylist, addVideoToPlaylist, mapPlaylist }) {
	const pending = session.pendingMixes || pendingMixesOf(session);
	if (!pending.length) return [];
	const updated = [];
	let list = [...(playlists || [])];
	for (const group of pending) {
		const mix = await upsertMix(group, list, createPlaylist, addVideoToPlaylist, mapPlaylist);
		if (!mix) continue;
		updated.push(mix);
		list = [mix, ...list.filter((p) => p.id !== mix.id)];
	}
	return updated;
}
