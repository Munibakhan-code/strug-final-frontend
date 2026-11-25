/**
 * Jobs Phase 6 — company profile helpers (pure).
 */

export const COMPANY_SIZE_OPTIONS = [
	"",
	"1-10",
	"11-50",
	"51-200",
	"201-500",
	"501-1000",
	"1000+",
];

export const COMPANY_INDUSTRY_OPTIONS = [
	"",
	"Technology",
	"Healthcare",
	"Finance",
	"Education",
	"Retail",
	"Construction",
	"Hospitality",
	"Manufacturing",
	"Other",
];

export function companySharePath(agentId) {
	const id = Number(agentId);
	return Number.isFinite(id) && id > 0 ? `/company/${id}` : null;
}

export function parseAgentIdFromPath(pathname = "") {
	const m = String(pathname).match(/^\/company\/(\d+)\/?$/);
	return m ? Number(m[1]) : null;
}

export function pushCompanyUrl(agentId) {
	const path = companySharePath(agentId);
	if (!path) return;
	try {
		if (window.location.pathname !== path) {
			window.history.pushState({ nav: "jobs", companyId: Number(agentId) }, "", path);
		}
	} catch { /* ignore */ }
}

/** Normalize public company API row for UI. */
export function normalizeCompanyProfile(raw) {
	if (!raw || typeof raw !== "object") return null;
	const agent_id = Number(raw.agent_id);
	if (!Number.isFinite(agent_id) || agent_id <= 0) return null;
	const jobs = Array.isArray(raw.jobs) ? raw.jobs : [];
	return {
		agent_id,
		company_name: raw.company_name || "Company",
		company_logo_url: raw.company_logo_url || null,
		company_description: raw.company_description || null,
		company_size: raw.company_size || null,
		industry: raw.industry || null,
		company_country: raw.company_country || null,
		company_web_url: raw.company_web_url || null,
		open_count: raw.open_count != null ? Number(raw.open_count) : jobs.length,
		jobs,
	};
}

export function canLinkCompany(jobOrAgent) {
	const id = Number(jobOrAgent?.agents?.agent_id ?? jobOrAgent?.agent_id);
	return Number.isFinite(id) && id > 0;
}

export function companyIdFromJob(job) {
	const id = Number(job?.agents?.agent_id ?? job?.agent_id);
	return Number.isFinite(id) && id > 0 ? id : null;
}
