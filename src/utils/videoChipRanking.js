// Personalised ordering for the Videos browse chips.
//
// Pure and deterministic: the same signals always produce the same row. There is no randomness
// anywhere in this file — a row that reshuffles on every refresh is disorienting, and the brief
// calls it out explicitly.
//
// What it does NOT do: invent chips. Every chip it returns came from the caller's catalogue, which
// is built from VIDEO_CATEGORY_DEFS. In particular a user's raw search text is never surfaced as a
// chip — searches are only ever resolved to an existing category id (see mapSearchesToCategories),
// so a private query can't leak into the UI.

/** Always the first chip, whatever the signals say. */
export const PINNED_FIRST_ID = 'all';

/** Always the last chip — the Phase 1 position for the personal "Watched" shortcut. */
export const PINNED_LAST_ID = 'watched';

/**
 * Chips that keep their catalogue position instead of being ranked: "All" plus the section
 * filters, which are navigation rather than topics, and "Watched", which is a fixed personal
 * shortcut parked at the end. Only the category block between them is personalised.
 */
export const FIXED_CHIP_IDS = new Set(['all', 'trending', 'latest', 'mix', 'watched']);

/** Half-life for watch recency, in days: a watch this old counts for half of a watch today. */
const RECENCY_HALF_LIFE_DAYS = 14;

const WEIGHTS = {
	watch: 3,
	like: 2,
	subscription: 2,
	search: 1,
	regional: 1.5,
	global: 1,
};

/**
 * How much of the category block is reserved for non-personal picks (regional + global), so a
 * heavy watcher still sees outside their own bubble. 0.4 → at least 2 of the first 5.
 */
const DISCOVERY_SHARE = 0.4;

/** Personal picks allowed to run back-to-back before a discovery pick is forced in. */
const MAX_PERSONAL_RUN = 2;

/**
 * Interest signals, all optional. Anything missing simply contributes nothing, which is what makes
 * the new-user and deleted-history paths fall out naturally rather than needing a special case.
 *
 * @typedef  {object} ChipSignals
 * @property {string|null} [country]            viewer's country, for regional trends
 * @property {Array<{category: string, at?: string|number|Date}>} [watched]
 * @property {string[]} [likedCategories]       category values behind the user's likes
 * @property {string[]} [subscribedCategories]  category values behind subscribed channels
 * @property {string[]} [searchCategories]      ALREADY resolved to category ids — never raw text
 * @property {string[]} [regionalTrends]        category ids trending in `country`
 * @property {string[]} [globalTrends]          category ids trending everywhere
 */

const asArray = (v) => (Array.isArray(v) ? v : []);

/** Exponential recency decay in [0,1]. Undated entries are treated as "now" (full weight). */
function recencyWeight(at, now) {
	if (at == null) return 1;
	const ts = at instanceof Date ? at.getTime() : new Date(at).getTime();
	if (!Number.isFinite(ts)) return 1;
	const days = Math.max(0, (now - ts) / 86400000);
	return Math.pow(0.5, days / RECENCY_HALF_LIFE_DAYS);
}

/**
 * Resolve free-text searches to category ids by matching against each category's own id and label.
 * Anything that doesn't match a known category is dropped — which is precisely what keeps private
 * or sensitive queries from ever reaching the UI.
 */
export function mapSearchesToCategories(queries, categoryChips) {
	const out = [];
	for (const raw of asArray(queries)) {
		const q = String(raw || '').trim().toLowerCase();
		if (!q) continue;
		for (const c of categoryChips) {
			const id = String(c.id || '').toLowerCase();
			const label = String(c.label || '').toLowerCase();
			const match = id && label
				? q === id || q === label || q.includes(id) || q.includes(label)
				: false;
			if (match) out.push(c.id);
		}
	}
	return out;
}

/**
 * Interest score per category id. Exported so tests — and a future "why am I seeing this?" —
 * can inspect the reasoning rather than only the final order.
 */
export function deriveCategoryScores(signals = {}, now = Date.now()) {
	const scores = new Map();
	const bump = (key, amount) => {
		if (!key || !(amount > 0)) return;
		scores.set(key, (scores.get(key) || 0) + amount);
	};

	for (const w of asArray(signals.watched)) {
		bump(w?.category, WEIGHTS.watch * recencyWeight(w?.at, now));
	}
	for (const c of asArray(signals.likedCategories)) bump(c, WEIGHTS.like);
	for (const c of asArray(signals.subscribedCategories)) bump(c, WEIGHTS.subscription);
	for (const c of asArray(signals.searchCategories)) bump(c, WEIGHTS.search);

	return scores;
}

/** True when there is enough signal to personalise at all. */
export function hasPersonalSignal(signals = {}) {
	return (
		asArray(signals.watched).length > 0 ||
		asArray(signals.likedCategories).length > 0 ||
		asArray(signals.subscribedCategories).length > 0 ||
		asArray(signals.searchCategories).length > 0
	);
}

/**
 * Score a category id against a chip's `match` value too — the signals carry backend category
 * values ("Music"), while chips carry ids ("music"). Matching on both keeps the caller from
 * having to normalise either side.
 */
function scoreForChip(chip, scores) {
	const byId = scores.get(chip.id) || 0;
	const byMatch = chip.match ? scores.get(chip.match) || 0 : 0;
	const byLowerMatch = chip.match ? scores.get(String(chip.match).toLowerCase()) || 0 : 0;
	return Math.max(byId, byMatch, byLowerMatch);
}

/** Discovery order for a new user (or anyone with no signal): region first, then global, then the
 *  catalogue's own order. Deterministic, and deliberately not alphabetical or random. */
function discoveryOrder(categoryChips, signals) {
	const regional = asArray(signals.regionalTrends);
	const global = asArray(signals.globalTrends);
	const rank = (chip) => {
		const r = regional.indexOf(chip.id);
		if (r !== -1) return [0, r];
		const g = global.indexOf(chip.id);
		if (g !== -1) return [1, g];
		return [2, 0];
	};
	return categoryChips
		.map((chip, i) => ({ chip, i, key: rank(chip) }))
		.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.i - b.i)
		.map((e) => e.chip);
}

/**
 * Weave the two lists so one interest can't take the row.
 *
 * `personal` and `discovery` are disjoint — discovery holds only chips the viewer has shown NO
 * interest in. That matters: an earlier version drew discovery from the whole catalogue, so a
 * category that was both a regional trend and a personal interest counted as "discovery" and let
 * three personal chips run together. The guarantee is about the chips themselves, not where in
 * the code they came from.
 *
 * At most MAX_PERSONAL_RUN personal chips sit back-to-back while any discovery chip remains, and
 * the opening slots reserve DISCOVERY_SHARE for discovery.
 */
function weave(personal, discovery) {
	const out = [];
	let pi = 0;
	let di = 0;
	let run = 0;
	const total = personal.length + discovery.length;
	const minDiscovery = Math.round(total * DISCOVERY_SHARE);
	let discoveryUsed = 0;

	while (out.length < total) {
		const discoveryLeft = di < discovery.length;
		const personalLeft = pi < personal.length;
		if (!discoveryLeft && !personalLeft) break;

		// Force a discovery pick when the personal run is too long, when personal is exhausted, or
		// when the reserved discovery slots would otherwise not be filled before the row ends.
		const takeDiscovery = discoveryLeft && (
			!personalLeft
			|| run >= MAX_PERSONAL_RUN
			|| (discoveryUsed < minDiscovery && out.length >= total - (minDiscovery - discoveryUsed))
		);

		if (takeDiscovery) {
			out.push(discovery[di++]);
			discoveryUsed++;
			run = 0;
		} else if (personalLeft) {
			out.push(personal[pi++]);
			run++;
		}
	}
	return out;
}

/**
 * Order the browse chips for one viewer.
 *
 * @param {object} params
 * @param {Array<{id: string, label?: string, match?: string|null}>} params.chips full catalogue
 * @param {ChipSignals} [params.signals]
 * @param {number} [params.now] injectable clock, for deterministic tests
 * @returns {Array} the same chip objects, reordered — never a new or filtered set
 */
export function rankVideoChips({ chips, signals = {}, now = Date.now() } = {}) {
	const all = asArray(chips);
	if (all.length === 0) return [];

	// Anchors are pulled out by id rather than by position, so a catalogue in any order still
	// yields "All" first and "Watched" last. Section filters keep their relative catalogue order
	// between them; only the category block is personalised.
	const pinnedFirst = all.find((c) => c.id === PINNED_FIRST_ID);
	const pinnedLast = all.find((c) => c.id === PINNED_LAST_ID);
	const sections = all.filter((c) => FIXED_CHIP_IDS.has(c.id) && c.id !== PINNED_FIRST_ID && c.id !== PINNED_LAST_ID);
	const categories = all.filter((c) => !FIXED_CHIP_IDS.has(c.id));

	const assemble = (middle) => [pinnedFirst, ...sections, ...middle, pinnedLast].filter(Boolean);

	if (!hasPersonalSignal(signals)) {
		// New user, or one whose history was deleted — the same stable discovery mix either way.
		return assemble(discoveryOrder(categories, signals));
	}

	const scores = deriveCategoryScores(signals, now);
	const scored = categories.map((chip, i) => ({ chip, i, score: scoreForChip(chip, scores) }));
	const personal = scored
		.filter((e) => e.score > 0)
		// Ties fall back to catalogue order, so the result never depends on sort stability.
		.sort((a, b) => b.score - a.score || a.i - b.i)
		.map((e) => e.chip);
	// Disjoint by construction: discovery is only what the viewer has shown no interest in.
	const uninterested = scored.filter((e) => e.score === 0).map((e) => e.chip);
	const discovery = discoveryOrder(uninterested, signals);

	return assemble(weave(personal, discovery));
}
