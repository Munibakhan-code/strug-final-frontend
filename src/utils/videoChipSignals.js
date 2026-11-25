// Signal collection + order stability for the personalised Videos chips.
//
// Two jobs:
//  1. Turn the read-only data the client can actually see into the shape videoChipRanking wants.
//  2. Hold the computed order still. Ranking is already deterministic, but the *inputs* drift with
//     every play, so recomputing on each render would still shuffle the row under the user. The
//     order is therefore frozen until activity is meaningful (counts cross a bucket) or the TTL
//     lapses.

import { rankVideoChips, mapSearchesToCategories, hasPersonalSignal } from './videoChipRanking.js';

export const CHIP_ORDER_STORAGE_KEY = 'strug_video_chip_order';

/** How long a frozen order survives without any meaningful activity. */
export const CHIP_ORDER_TTL_MS = 6 * 60 * 60 * 1000; // 6h

/**
 * Activity needed before the row is allowed to move. Counts are bucketed rather than compared
 * exactly, so a single extra play doesn't rearrange everything mid-session.
 */
const ACTIVITY_BUCKETS = { watched: 5, liked: 5, subscribed: 2, searched: 3 };

/**
 * PLACEHOLDER regional / global trends.
 *
 * Real trends have to come from the backend — the feed endpoint does not return `category` at all,
 * so the client genuinely cannot compute "what is popular in this country". These hints keep the
 * new-user experience sensible in the meantime and are the single thing to delete once the
 * personalisation endpoint lands (see the Phase 2 backend requirements).
 */
export const PLACEHOLDER_GLOBAL_TRENDS = ['music', 'entertainment', 'gaming', 'comedy', 'tech'];
export const PLACEHOLDER_REGIONAL_TRENDS = {
	Pakistan: ['entertainment', 'music', 'news', 'comedy'],
	India: ['music', 'entertainment', 'comedy', 'sports'],
	'United States': ['gaming', 'sports', 'tech', 'news'],
	'United Kingdom': ['news', 'sports', 'comedy', 'music'],
	Canada: ['gaming', 'news', 'sports', 'tech'],
};

export function trendsForCountry(country) {
	if (!country) return [];
	return PLACEHOLDER_REGIONAL_TRENDS[country] ?? [];
}

/**
 * Map GET /video-engagement/history into watch signals. That endpoint embeds the full video row,
 * so it is the one client-visible source that carries `category` — likes return bare ids and
 * subscriptions return channels, neither of which say anything about topic.
 */
export function watchSignalsFromHistory(rows) {
	if (!Array.isArray(rows)) return [];
	return rows
		.map((row) => {
			const video = row?.video ?? row;
			const category = video?.category;
			if (!category) return null;
			return { category, at: row?.watched_at ?? video?.created_at ?? null };
		})
		.filter(Boolean);
}

/**
 * Build the full signal set. `searches` are raw user text and are resolved to known category ids
 * here — the raw strings never travel further, so they can never surface as a chip.
 */
export function buildChipSignals({ country = null, history = [], searches = [], categoryChips = [], likedCategories = [], subscribedCategories = [], serverSignals = null } = {}) {
	// The server knows what a country and the platform as a whole actually watch; the client can
	// only guess, because /video/feed does not return `category`. Prefer the real thing whenever
	// GET /video-discovery/chip-signals answers, and fall back to the placeholders otherwise so an
	// older backend, a signed-out viewer, or a failed request still renders a sensible row.
	const resolvedCountry = serverSignals?.country ?? country;
	const regional = serverSignals?.regional?.length
		? toChipIds(serverSignals.regional, categoryChips)
		: trendsForCountry(resolvedCountry);
	const global = serverSignals?.global?.length
		? toChipIds(serverSignals.global, categoryChips)
		: PLACEHOLDER_GLOBAL_TRENDS;
	// Server-side affinity already carries recency weighting, so it arrives undated and is used at
	// full weight — the client's own decay would double-count it.
	const serverWatched = asArray(serverSignals?.personal).map((p) => ({ category: p?.category, at: null }));

	return {
		country: resolvedCountry,
		watched: [...serverWatched, ...watchSignalsFromHistory(history)],
		likedCategories,
		subscribedCategories,
		searchCategories: mapSearchesToCategories(searches, categoryChips),
		regionalTrends: regional,
		globalTrends: global,
	};
}

const asArray = (v) => (Array.isArray(v) ? v : []);

/** Map backend category values ("Music") onto chip ids ("music"), dropping anything unknown. */
function toChipIds(categories, categoryChips) {
	const byMatch = new Map();
	for (const c of categoryChips) {
		if (c.match) byMatch.set(String(c.match).toLowerCase(), c.id);
		byMatch.set(String(c.id).toLowerCase(), c.id);
	}
	return asArray(categories)
		.map((c) => byMatch.get(String(c || '').toLowerCase()))
		.filter(Boolean);
}

const bucket = (n, size) => Math.floor((Number(n) || 0) / size);

/**
 * A fingerprint of "how much has meaningfully changed". Bucketed counts mean the row holds still
 * through ordinary browsing and only re-ranks once activity accumulates — or once it is wiped,
 * which drops every bucket to 0 and forces the new-user fallback.
 */
export function signalsSignature(signals = {}) {
	const s = signals || {};
	return [
		s.country || '-',
		bucket(s.watched?.length, ACTIVITY_BUCKETS.watched),
		bucket(s.likedCategories?.length, ACTIVITY_BUCKETS.liked),
		bucket(s.subscribedCategories?.length, ACTIVITY_BUCKETS.subscribed),
		bucket(s.searchCategories?.length, ACTIVITY_BUCKETS.searched),
		hasPersonalSignal(s) ? 'p' : 'n',
	].join('|');
}

function readStored(storage) {
	try {
		const raw = storage?.getItem?.(CHIP_ORDER_STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed?.order) ? parsed : null;
	} catch { return null; }
}

function writeStored(storage, value) {
	try { storage?.setItem?.(CHIP_ORDER_STORAGE_KEY, JSON.stringify(value)); } catch { /* quota / private mode */ }
}

/** Reorder `chips` to a stored id order, appending anything the stored order didn't know about. */
function applyStoredOrder(chips, order) {
	const byId = new Map(chips.map((c) => [c.id, c]));
	const out = [];
	for (const id of order) {
		const chip = byId.get(id);
		if (chip) { out.push(chip); byId.delete(id); }
	}
	// New chips shipped since the order was frozen still appear, rather than silently vanishing.
	for (const chip of chips) if (byId.has(chip.id)) out.push(chip);
	return out;
}

/**
 * The ordered chips to render, holding a previously computed order steady where appropriate.
 *
 * @returns {{ chips: Array, recomputed: boolean, signature: string }}
 */
export function resolveStableChipOrder({ chips, signals, storage, now = Date.now(), ttlMs = CHIP_ORDER_TTL_MS } = {}) {
	const list = Array.isArray(chips) ? chips : [];
	if (list.length === 0) return { chips: [], recomputed: false, signature: '' };

	const signature = signalsSignature(signals);
	const stored = readStored(storage);
	const fresh = stored && stored.signature === signature && now - (stored.computedAt || 0) < ttlMs;

	if (fresh) {
		return { chips: applyStoredOrder(list, stored.order), recomputed: false, signature };
	}

	const ranked = rankVideoChips({ chips: list, signals, now });
	writeStored(storage, { signature, computedAt: now, order: ranked.map((c) => c.id) });
	return { chips: ranked, recomputed: true, signature };
}

/** Drop any frozen order — used when a viewer clears their history or signs out. */
export function clearStoredChipOrder(storage) {
	try { storage?.removeItem?.(CHIP_ORDER_STORAGE_KEY); } catch { /* noop */ }
}
