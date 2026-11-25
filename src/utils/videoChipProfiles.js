// Demo viewer profiles for the personalised chip row.
//
// These are FIXTURES, not production data. They exist because there is no isolated local backend
// to sign into, so the Phase 2 behaviour is demonstrated against hand-built viewers instead of
// live accounts. Nothing here talks to staging, and no activity is recorded anywhere.
//
// Shapes match what the real sources return:
//   `history`  → GET /video-engagement/history rows ({ watched_at, video: { category, … } })
//   `searches` → the raw strings in localStorage `strug_search_history`
//   `country`  → user.country, a full country name

const day = 86400000;
/** Fixed clock so the fixtures stay reproducible regardless of when the suite runs. */
export const FIXTURE_NOW = new Date('2026-08-10T12:00:00Z').getTime();

const watched = (category, daysAgo) => ({
	watched_at: new Date(FIXTURE_NOW - daysAgo * day).toISOString(),
	video: { video_id: Math.round(daysAgo * 1000 + category.length), category, status: 'safe' },
});

/** 1 — brand new viewer: no history at all, country known from their profile. */
export const PROFILE_NEW_USER = {
	key: 'new-user',
	label: 'New user (no history)',
	country: 'Pakistan',
	history: [],
	searches: [],
};

/** 2 — returning viewer who watches music almost exclusively. */
export const PROFILE_MUSIC_USER = {
	key: 'music-user',
	label: 'Returning — music focused',
	country: 'Pakistan',
	history: [
		watched('Music', 0), watched('Music', 1), watched('Music', 1),
		watched('Music', 2), watched('Music', 3), watched('Music', 5),
		watched('Music', 8), watched('Entertainment', 9), watched('Music', 12),
		watched('Comedy', 20),
	],
	searches: ['music', 'slowed reverb songs'],
};

/** 3 — returning viewer who watches technology. */
export const PROFILE_TECH_USER = {
	key: 'tech-user',
	label: 'Returning — technology focused',
	country: 'United States',
	history: [
		watched('Tech', 0), watched('Tech', 1), watched('Tech', 2),
		watched('Tech', 4), watched('Education', 5), watched('Tech', 6),
		watched('Gaming', 7), watched('Tech', 11), watched('Education', 15),
	],
	searches: ['tech review', 'education'],
};

/** 4 — barely any history: one old watch, nothing else. */
export const PROFILE_LIGHT_USER = {
	key: 'light-user',
	label: 'Limited history (single old watch)',
	country: 'Pakistan',
	history: [watched('Travel', 40)],
	searches: [],
};

/**
 * 5 — a viewer who HAD history and cleared it. Structurally identical to a new user, which is the
 * point: once the rows are gone there is nothing left to personalise from.
 */
export const PROFILE_DELETED_HISTORY = {
	key: 'deleted-history',
	label: 'History deleted',
	country: 'Pakistan',
	history: [],
	searches: [],
};

export const CHIP_DEMO_PROFILES = [
	PROFILE_NEW_USER,
	PROFILE_MUSIC_USER,
	PROFILE_TECH_USER,
	PROFILE_LIGHT_USER,
	PROFILE_DELETED_HISTORY,
];
