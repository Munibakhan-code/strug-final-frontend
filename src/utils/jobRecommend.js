/**
 * Jobs Phase 7 — "Jobs for you" helpers (pure).
 */

export const RECOMMENDED_JOBS_LIMIT = 8;

/** Normalize GET /job/recommended response for the rail. */
export function normalizeRecommendedJobs(raw) {
	const list = Array.isArray(raw) ? raw : [];
	return list.filter((j) => j && typeof j.job_id === "number" && !j.is_ad && !j.sponsored);
}
