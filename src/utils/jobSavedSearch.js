/**
 * Jobs Phase 5 — saved search helpers (pure).
 */

export const JOB_SAVED_SEARCH_FREQUENCIES = ["immediate", "daily"];

export function canSaveJobSearch(filters = {}) {
	const f = filters && typeof filters === "object" ? filters : {};
	return Boolean(
		(f.keyword && String(f.keyword).trim())
		|| (f.location && String(f.location).trim())
		|| f.category
		|| f.employment_type
		|| f.is_remote === true
		|| (f.salary_min !== "" && f.salary_min != null)
		|| (f.salary_max !== "" && f.salary_max != null),
	);
}

export function labelJobSavedSearch(filters = {}, fallback = "Saved job search") {
	const f = filters && typeof filters === "object" ? filters : {};
	const bits = [];
	if (f.keyword?.trim()) bits.push(String(f.keyword).trim());
	if (f.location?.trim()) bits.push(String(f.location).trim());
	if (f.employment_type) bits.push(String(f.employment_type).replace(/_/g, " "));
	if (f.is_remote === true || f.is_remote === "true") bits.push("Remote");
	if (f.salary_min !== "" && f.salary_min != null) bits.push(`≥ $${Number(f.salary_min).toLocaleString()}`);
	if (f.salary_max !== "" && f.salary_max != null) bits.push(`≤ $${Number(f.salary_max).toLocaleString()}`);
	return bits.length ? bits.join(" · ") : fallback;
}

export function filtersForJobSavedSearch(filters = {}) {
	const {
		page: _page,
		sort: _sort,
		limit: _limit,
		offset: _offset,
		...rest
	} = filters && typeof filters === "object" ? filters : {};
	return rest;
}

/**
 * Reduce a filter blob to the things that actually narrow a search, as sorted `key=value` pairs.
 *
 * Saved filters round-trip through a Postgres `jsonb` column, which does not preserve key order,
 * so comparing raw JSON.stringify output almost never matched and the UI kept offering to save a
 * search the user already had. Three normalisations, all of them things that mean "not filtering":
 *   - null / undefined / "" are dropped
 *   - `false` is dropped — only `is_remote` is boolean, and false means "don't care" (the backend
 *     agrees: utils/job-filters.js only narrows on true)
 *   - values are compared as strings, so a salary typed as "80000" matches one stored as 80000
 * `0` is deliberately kept: a minimum salary of 0 is a real filter.
 */
export function canonicalJobSearchFilters(filters = {}) {
	const f = filtersForJobSavedSearch(filters);
	return Object.keys(f)
		.filter((k) => {
			const v = f[k];
			return v !== null && v !== undefined && v !== "" && v !== false;
		})
		.sort()
		.map((k) => `${k}=${String(f[k])}`)
		.join("&");
}

export function jobSavedSearchFiltersEqual(a, b) {
	try {
		return canonicalJobSearchFilters(a) === canonicalJobSearchFilters(b);
	} catch {
		return false;
	}
}

export function normalizeJobSavedSearchFrequency(raw) {
	const v = String(raw || "immediate").toLowerCase();
	return JOB_SAVED_SEARCH_FREQUENCIES.includes(v) ? v : "immediate";
}
