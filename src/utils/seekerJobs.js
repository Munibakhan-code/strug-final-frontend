/**
 * Seeker job-board helpers (Phase 2).
 * Pure browse/apply helpers — unit-tested without mounting React.
 */

export const PAGE_SIZE = 20;

export const EMPTY_SEEKER_FILTERS = {
	keyword: "",
	category: "",
	location: "",
	employment_type: "",
	is_remote: false,
	salary_min: "",
	salary_max: "",
	sort: "newest", // newest | salary_desc | salary_asc
	page: 1,
};

/** Build GET /job query params from UI filters. */
export function buildSeekerListQuery(filters = {}) {
	const f = { ...EMPTY_SEEKER_FILTERS, ...filters };
	const page = Math.max(1, Number(f.page) || 1);
	const limit = PAGE_SIZE;
	const offset = (page - 1) * limit;
	const params = {
		limit,
		offset,
		sort: f.sort || "newest",
	};
	if (f.keyword?.trim()) params.keyword = f.keyword.trim();
	if (f.category) params.category = f.category;
	if (f.location?.trim()) params.location = f.location.trim();
	if (f.employment_type) params.employment_type = f.employment_type;
	if (f.is_remote) params.is_remote = "true";
	if (f.salary_min !== "" && f.salary_min != null) params.salary_min = Number(f.salary_min);
	if (f.salary_max !== "" && f.salary_max != null) params.salary_max = Number(f.salary_max);
	return params;
}

/** Client-side sort fallback when API returns an unsorted array. */
export function sortJobsClient(jobs, sort = "newest") {
	const list = Array.isArray(jobs) ? [...jobs] : [];
	const sponsored = list.filter((j) => j.sponsored || j.is_ad);
	const organic = list.filter((j) => !(j.sponsored || j.is_ad));
	const byId = (a, b) => (Number(b.job_id) || 0) - (Number(a.job_id) || 0);
	const sal = (j) => {
		const hi = j.salary_max != null ? Number(j.salary_max) : null;
		const lo = j.salary_min != null ? Number(j.salary_min) : null;
		if (hi != null && Number.isFinite(hi)) return hi;
		if (lo != null && Number.isFinite(lo)) return lo;
		return -1;
	};
	if (sort === "salary_desc") organic.sort((a, b) => sal(b) - sal(a) || byId(a, b));
	else if (sort === "salary_asc") {
		organic.sort((a, b) => {
			const sa = sal(a);
			const sb = sal(b);
			if (sa < 0 && sb < 0) return byId(a, b);
			if (sa < 0) return 1;
			if (sb < 0) return -1;
			return sa - sb || byId(a, b);
		});
	} else {
		organic.sort((a, b) => {
			const da = a.posted_date ? new Date(a.posted_date).getTime() : 0;
			const db = b.posted_date ? new Date(b.posted_date).getTime() : 0;
			return db - da || byId(a, b);
		});
	}
	return [...sponsored, ...organic];
}

export function canApplyToJob(job, now = new Date()) {
	if (!job || job.is_ad || typeof job.job_id !== "number") {
		return { ok: false, reason: "This listing can't be applied to here." };
	}
	if ((job.status || "open") !== "open") {
		return { ok: false, reason: "This job is no longer accepting applications." };
	}
	if (job.deadline) {
		const d = new Date(job.deadline);
		if (!Number.isNaN(d.getTime()) && d.getTime() < now.getTime()) {
			return { ok: false, reason: "The application deadline has passed." };
		}
	}
	return { ok: true, reason: null };
}

export function canEasyApply(candidate) {
	return Boolean(candidate?.resume_url?.trim());
}

/** localStorage-backed saved job ids (Phase 2 until job_saved table ships). */
const SAVED_KEY = "strug_saved_job_ids";

export function readSavedJobIds() {
	try {
		const raw = localStorage.getItem(SAVED_KEY);
		const arr = raw ? JSON.parse(raw) : [];
		return Array.isArray(arr) ? arr.map(Number).filter((n) => Number.isFinite(n)) : [];
	} catch {
		return [];
	}
}

export function writeSavedJobIds(ids) {
	const uniq = [...new Set((ids || []).map(Number).filter((n) => Number.isFinite(n)))];
	try {
		localStorage.setItem(SAVED_KEY, JSON.stringify(uniq));
	} catch { /* ignore quota */ }
	return uniq;
}

export function toggleSavedJobId(jobId, ids = readSavedJobIds()) {
	const id = Number(jobId);
	if (!Number.isFinite(id)) return ids;
	const has = ids.includes(id);
	return writeSavedJobIds(has ? ids.filter((x) => x !== id) : [...ids, id]);
}

export function jobSharePath(jobId) {
	return `/jobs/${Number(jobId)}`;
}

export function parseJobIdFromPath(pathname = "") {
	const m = String(pathname).match(/^\/jobs\/(\d+)\/?$/);
	return m ? Number(m[1]) : null;
}
