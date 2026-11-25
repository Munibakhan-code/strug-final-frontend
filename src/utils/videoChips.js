// Merged Videos browse chips.
//
// The Videos landing used to carry two separate selector rows: a category row (Music, Gaming, …)
// and, under it, a section-filter row (All, Clips, Trending, Latest, Discover). They composed —
// "Trending × Gaming" was reachable. The merged bar is single-select instead (the model YouTube's
// own chip row uses), so exactly one chip is active at a time.
//
// Nothing about the underlying fetch contract changed: VideosPage still holds `activeFilter` and
// `activeCategory` and the browse effect still reads both. These helpers just translate one chip
// id into that pair, and back, so only one of the two is ever narrowed at a time.

/**
 * Section filters — these drive the `sort`, not `category`.
 *
 * Short-form is deliberately NOT here: it is a content mode, not a way of sorting long-form, so it
 * lives in the Home/Shorts section tabs above (VideoSectionTabs). "watched" is a personal list
 * rather than a sort, but it belongs on this row for the same reason YouTube puts it there — it
 * answers "what do I want to see", exactly like the sorts beside it.
 */
export const VIDEO_SECTION_DEFS = [
	{ id: 'all', labelKey: 'events.categories.all' },
	{ id: 'trending', labelKey: 'videos.trending' },
	{ id: 'latest', labelKey: 'videos.latest' },
	{ id: 'mix', labelKey: 'videos.mix' },
	{ id: 'watched', labelKey: 'videos.watched' },
];

/**
 * Section filters that resolve to a personal list rather than a sort over the public catalogue.
 * They render at the very END of the row, after the categories: the chips before them all answer
 * "show me more of the catalogue", so a personal list reads as a different kind of thing and is
 * easier to find parked on its own at the tail.
 */
export const VIDEO_PERSONAL_FILTER_IDS = ['watched'];

const PERSONAL_IDS = new Set(VIDEO_PERSONAL_FILTER_IDS);

const SECTION_IDS = new Set(VIDEO_SECTION_DEFS.map((d) => d.id));

/** True when a chip id addresses a section filter rather than a video category. */
export function isSectionFilterId(id) {
	return SECTION_IDS.has(id);
}

/**
 * One ordered chip list: catalogue sorts, then the real categories, then the personal lists.
 * The category list's own "all" entry is dropped — the section "All" chip already means
 * "no narrowing at all", and two chips labelled All would be nonsense.
 */
export function buildVideoChips(sectionFilters, categories) {
	return [
		...sectionFilters.filter((f) => !PERSONAL_IDS.has(f.id)),
		...categories.filter((c) => c.id !== 'all'),
		...sectionFilters.filter((f) => PERSONAL_IDS.has(f.id)),
	];
}

/** Which chip should read as selected, given the page's two-part filter state. */
export function chipIdFromState(activeFilter, activeCategory) {
	return activeCategory && activeCategory !== 'all' ? activeCategory : activeFilter;
}

/**
 * The filter state a chip selection produces. Single-select: picking a section clears any
 * category narrowing, and picking a category resets the section back to its neutral "all".
 * Picking a category leaves `activeFilter: 'all'`, which the browse effect already treats as
 * "category-only → newest first" — the exact request the old two-row UI sent for that pair.
 */
export function chipSelectionToState(chipId) {
	return isSectionFilterId(chipId)
		? { activeFilter: chipId, activeCategory: 'all' }
		: { activeFilter: 'all', activeCategory: chipId };
}
