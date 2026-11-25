/**
 * Jobs Phase 8 — report / moderation helpers (pure).
 */

export const JOB_REPORT_REASONS = [
	{ v: "scam", l: "Scam or fraud" },
	{ v: "misleading_pay", l: "Misleading pay" },
	{ v: "fake_employer", l: "Fake employer" },
	{ v: "inappropriate", l: "Inappropriate content" },
	{ v: "spam", l: "Spam" },
	{ v: "other", l: "Other" },
];

export function canReportJob(job) {
	return Boolean(job && typeof job.job_id === "number" && !job.is_ad && !job.sponsored);
}

export function salaryDisclosureNudge(form = {}) {
	const hasPay = (form.salary_min !== "" && form.salary_min != null)
		|| (form.salary_max !== "" && form.salary_max != null);
	if (hasPay) return null;
	return "Salary not listed is allowed, but roles with a pay range usually get more applicants.";
}
