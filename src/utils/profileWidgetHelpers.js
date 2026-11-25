/** Accounts created before this UTC instant count as Early Adopter (beta era). */
export const EARLY_ADOPTER_BEFORE = new Date("2025-12-01T00:00:00.000Z");

/**
 * Prefer the viewed profile's join timestamp; fall back to the signed-in user's
 * account created_at only when viewing your own profile.
 */
export function resolveProfileJoinedAt({ socialCreatedAt, userCreatedAt, isViewingOther }) {
	const raw = socialCreatedAt || (!isViewingOther ? userCreatedAt : null) || null;
	if (!raw) return null;
	const d = new Date(raw);
	return Number.isNaN(d.getTime()) ? null : d;
}

export function isEarlyAdopterFromJoinDate(joinedAt, cutoff = EARLY_ADOPTER_BEFORE) {
	if (!joinedAt) return false;
	const d = joinedAt instanceof Date ? joinedAt : new Date(joinedAt);
	return !Number.isNaN(d.getTime()) && d < cutoff;
}

/**
 * Only render Early Adopter when we know the viewed profile's join date.
 * Public by-handle / by-user responses omit created_at today, so treating
 * "unknown" as not-earned falsely locks beta users on other people's profiles.
 */
export function shouldShowEarlyAdopterBadge(joinedAt) {
	return joinedAt instanceof Date
		? !Number.isNaN(joinedAt.getTime())
		: Boolean(joinedAt) && !Number.isNaN(new Date(joinedAt).getTime());
}

export function formatTrendingTagLabel(tag) {
	const raw = String(tag?.name || tag?.tag_name || "").trim();
	if (!raw) return "#";
	return raw.startsWith("#") ? raw : `#${raw}`;
}
