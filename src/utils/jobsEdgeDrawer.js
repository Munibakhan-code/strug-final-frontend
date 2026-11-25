import { getJob, getMyApplications, getJobSavedSearches, getMyCandidate } from "../api/jobs.js";
import { readSavedJobIds } from "./seekerJobs.js";
import { needsResumeAttention, profileCompleteness } from "./candidateProfileCompleteness.js";
import {
	hasResumeJsonContent,
	resumePreviewLines,
	formatExperienceLine,
	parseResumeJson,
} from "./resumeBuilder.js";
import { stackEdgeTabTop } from "./verticalEdgeDrawerConfig.js";

export const JOBS_DRAWER_TAB_IDS = ["applications", "saved", "alerts", "resume"];

const SEEN_PREFIX = "strug_jobs_drawer_seen_";

/** Same AI-fab clearance as the shared vertical edge drawer (never literal 50%). */
export function stackJobsEdgeTabTop(index, total = JOBS_DRAWER_TAB_IDS.length, opts = {}) {
	return stackEdgeTabTop(index, total, opts);
}

function seenKey(tabId, userId) {
	return `${SEEN_PREFIX}${userId ?? "guest"}_${tabId}`;
}

export function markJobsDrawerTabSeen(tabId, userId) {
	if (typeof sessionStorage === "undefined") return;
	sessionStorage.setItem(seenKey(tabId, userId), "1");
}

export function isJobsDrawerTabSeen(tabId, userId) {
	if (typeof sessionStorage === "undefined") return false;
	return sessionStorage.getItem(seenKey(tabId, userId)) === "1";
}

/** @param {object} app */
export function mapApplicationToDrawerItem(app) {
	const job = app?.jobs ?? app?.job;
	const appId = app?.job_application_id ?? app?.id;
	const jobId = job?.job_id;
	return {
		id: appId ?? jobId ?? "app",
		title: job?.job_name ?? "Application",
		sub: app?.status ? String(app.status) : undefined,
		target: jobId != null ? { jobId: Number(jobId) } : undefined,
	};
}

/** @param {object} alert */
export function mapJobAlertToDrawerItem(alert) {
	const id = alert?.saved_search_id ?? alert?.id;
	return {
		id,
		title: alert?.name ?? alert?.label ?? "Job alert",
		sub: alert?.keyword ?? alert?.location ?? undefined,
	};
}

function asArray(payload) {
	if (!payload) return [];
	if (Array.isArray(payload)) return payload;
	if (Array.isArray(payload?.data)) return payload.data;
	return [];
}

/**
 * @param {string} tabId
 * @param {{ limit?: number, userId?: string|number|null }} [opts]
 */
export async function loadJobsDrawerTab(tabId, opts = {}) {
	const limit = opts.limit ?? 20;

	if (tabId === "applications") {
		const data = await getMyApplications();
		return { items: asArray(data).slice(0, limit).map(mapApplicationToDrawerItem) };
	}

	if (tabId === "saved") {
		const ids = readSavedJobIds().slice(0, limit);
		const jobs = await Promise.all(ids.map((id) => getJob(id).catch(() => null)));
		return {
			items: jobs.filter(Boolean).map((j) => ({
				id: j.job_id,
				title: j.job_name ?? `Job #${j.job_id}`,
				sub: j.location,
				target: { jobId: j.job_id },
			})),
		};
	}

	if (tabId === "alerts") {
		const data = await getJobSavedSearches();
		return { items: asArray(data).slice(0, limit).map(mapJobAlertToDrawerItem) };
	}

	if (tabId === "resume") {
		const candidate = await getMyCandidate().catch(() => null);
		const completeness = profileCompleteness(candidate);
		const headline = String(candidate?.headline ?? "").trim();
		const resumeUrl = String(candidate?.resume_url ?? "").trim();
		const structured = hasResumeJsonContent(candidate?.resume_json);
		const previewLines = resumePreviewLines(candidate?.resume_json, { limit: 2 });
		const items = [];
		if (headline) {
			items.push({
				id: "headline",
				title: headline,
				sub: completeness.complete
					? "Profile complete"
					: `${completeness.percent}% complete`,
			});
		}
		if (structured) {
			items.push({
				id: "structured",
				title: "Structured résumé",
				sub: previewLines.join(" · ") || "Experience and education on file",
				action: "edit-profile",
			});
			const firstExp = parseResumeJson(candidate?.resume_json).experience[0];
			if (firstExp && formatExperienceLine(firstExp)) {
				items.push({
					id: "exp-preview",
					title: formatExperienceLine(firstExp),
					sub: firstExp.current ? "Current role" : firstExp.end ? `Until ${firstExp.end}` : undefined,
					action: "edit-profile",
				});
			}
		} else {
			items.push({
				id: "structured-missing",
				title: "Build structured résumé",
				sub: "Add roles and education employers see when you apply",
				action: "edit-profile",
			});
		}
		if (resumeUrl) {
			items.push({
				id: "resume",
				title: "Résumé on file",
				sub: resumeUrl.length > 48 ? `${resumeUrl.slice(0, 45)}…` : resumeUrl,
				href: resumeUrl,
			});
		} else {
			items.push({
				id: "resume-missing",
				title: "Add your résumé",
				sub: "Required for Easy Apply",
				action: "edit-profile",
			});
		}
		if (completeness.missing.length > 0 && headline) {
			items.push({
				id: "missing",
				title: "Still missing",
				sub: completeness.missing.slice(0, 4).join(", "),
				action: "edit-profile",
			});
		}
		return { items, meta: { candidate, completeness } };
	}

	return { items: [] };
}

/**
 * Activity hint for résumé tab when profile needs attention.
 * @param {object|null} candidate
 * @param {string|number|null} userId
 */
export function shouldGlowJobsResumeTab(candidate, userId) {
	if (needsResumeAttention(candidate)) return true;
	if (!isJobsDrawerTabSeen("resume", userId) && !profileCompleteness(candidate).complete) {
		return true;
	}
	return false;
}
