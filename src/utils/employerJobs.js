/**
 * Employer job-board helpers (Phase 1).
 * Pure functions so posting lifecycle logic is unit-tested without mounting React.
 */

export const JOB_STATUSES = ["open", "closed", "draft"];

export const EMPTY_JOB_FORM = {
	job_name: "",
	description: "",
	job_category_id: "",
	location: "",
	is_remote: false,
	employment_type: "full_time",
	salary_min: "",
	salary_max: "",
	salary_period: "year",
	experience_level: "",
	deadline: "",
};

/** Map an API job row into the employer form shape. */
export function jobToForm(job) {
	if (!job) return { ...EMPTY_JOB_FORM };
	const deadlineRaw = job.deadline;
	let deadline = "";
	if (deadlineRaw) {
		const d = new Date(deadlineRaw);
		deadline = Number.isNaN(d.getTime())
			? String(deadlineRaw).slice(0, 10)
			: d.toISOString().slice(0, 10);
	}
	return {
		job_name: job.job_name || "",
		description: job.description || "",
		job_category_id: job.job_category_id != null ? String(job.job_category_id) : "",
		location: job.location || "",
		is_remote: Boolean(job.is_remote),
		employment_type: job.employment_type || "full_time",
		salary_min: job.salary_min != null && job.salary_min !== "" ? String(job.salary_min) : "",
		salary_max: job.salary_max != null && job.salary_max !== "" ? String(job.salary_max) : "",
		salary_period: job.salary_period || "year",
		experience_level: job.experience_level || "",
		deadline,
	};
}

export function validateJobForm(form) {
	if (!form?.job_name?.trim()) return "Job title is required.";
	const lo = form.salary_min !== "" && form.salary_min != null ? Number(form.salary_min) : null;
	const hi = form.salary_max !== "" && form.salary_max != null ? Number(form.salary_max) : null;
	if (lo != null && Number.isFinite(lo) && hi != null && Number.isFinite(hi) && lo > hi) {
		return "Salary min cannot exceed salary max.";
	}
	return null;
}

/**
 * Build create/update payload. `status` defaults to open for publish; pass "draft" to save draft.
 */
export function buildJobPayload(form, { status = "open" } = {}) {
	const nextStatus = JOB_STATUSES.includes(status) ? status : "open";
	return {
		job_name: String(form.job_name || "").trim(),
		description: form.description?.trim() ? form.description.trim() : undefined,
		job_category_id: form.job_category_id ? Number(form.job_category_id) : undefined,
		location: form.location?.trim() ? form.location.trim() : undefined,
		is_remote: Boolean(form.is_remote),
		employment_type: form.employment_type || undefined,
		salary_min: form.salary_min !== "" && form.salary_min != null ? Number(form.salary_min) : undefined,
		salary_max: form.salary_max !== "" && form.salary_max != null ? Number(form.salary_max) : undefined,
		salary_period: form.salary_period || undefined,
		experience_level: form.experience_level?.trim() ? form.experience_level.trim() : undefined,
		deadline: form.deadline || undefined,
		status: nextStatus,
	};
}

/** Close ↔ open toggle; drafts publish to open. */
export function nextListingStatus(status) {
	if (status === "draft") return "open";
	if (status === "open") return "closed";
	return "open";
}

export function filterPostings(jobs, statusFilter = "all") {
	const list = Array.isArray(jobs) ? jobs : [];
	if (!statusFilter || statusFilter === "all") return list;
	return list.filter((j) => (j.status || "open") === statusFilter);
}

export function summarizePostings(jobs) {
	const list = Array.isArray(jobs) ? jobs : [];
	const summary = { open: 0, closed: 0, draft: 0, total: list.length, applicants: 0 };
	for (const j of list) {
		const s = j.status || "open";
		if (s === "closed") summary.closed += 1;
		else if (s === "draft") summary.draft += 1;
		else summary.open += 1;
		summary.applicants += Number(j._count?.job_application) || 0;
	}
	return summary;
}

/** Company profile: require a non-empty company name before create/update. */
export function validateCompanyForm(form) {
	if (!form?.company_name?.trim()) return "Company name is required.";
	return null;
}

export function buildCompanyPayload(form) {
	return {
		company_name: String(form.company_name || "").trim(),
		industry: form.industry?.trim() || undefined,
		company_size: form.company_size?.trim() || undefined,
		company_country: form.company_country?.trim() || undefined,
		company_web_url: form.company_web_url?.trim() || undefined,
		company_description: form.company_description?.trim() || undefined,
		company_logo_url: form.company_logo_url?.trim() || undefined,
	};
}
