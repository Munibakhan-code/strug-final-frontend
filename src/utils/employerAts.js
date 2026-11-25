/**
 * Employer ATS helpers (Phase 3).
 * Pure pipeline / notes / bulk / funnel / resume helpers — unit-tested without React.
 */

import { isSafeHttpUrl } from "./safeUrl.js";

export { isSafeHttpUrl };

export const APPLICATION_STATUSES = ["applied", "reviewed", "shortlisted", "rejected", "hired"];

/** Statuses employers can set from the pipeline UI (not the initial apply state). */
export const PIPELINE_ACTIONS = APPLICATION_STATUSES.filter((s) => s !== "applied");

export const EMPLOYER_NOTE_MAX = 4000;
export const INTERVIEW_NOTE_MAX = 2000;
export const BULK_STATUS_MAX = 50;

export function isValidApplicationStatus(status) {
	return APPLICATION_STATUSES.includes(status);
}

export function validateEmployerNote(text) {
	const raw = text == null ? "" : String(text);
	if (raw.length > EMPLOYER_NOTE_MAX) {
		return `Notes must be ${EMPLOYER_NOTE_MAX} characters or fewer.`;
	}
	return null;
}

export function normalizeEmployerNote(text) {
	const trimmed = String(text ?? "").trim();
	return trimmed || null;
}

export function validateInterviewInput({ interview_at, interview_notes } = {}) {
	if (interview_at) {
		const d = new Date(interview_at);
		if (Number.isNaN(d.getTime())) return "Interview time is invalid.";
	}
	if (interview_notes != null && String(interview_notes).length > INTERVIEW_NOTE_MAX) {
		return `Interview notes must be ${INTERVIEW_NOTE_MAX} characters or fewer.`;
	}
	return null;
}

export function buildBulkStatusPayload(ids, status) {
	const uniq = [...new Set((ids || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
	if (!uniq.length) return { ok: false, error: "Select at least one applicant.", ids: [], status: null };
	if (uniq.length > BULK_STATUS_MAX) {
		return { ok: false, error: `You can update at most ${BULK_STATUS_MAX} applicants at once.`, ids: uniq, status: null };
	}
	if (!PIPELINE_ACTIONS.includes(status)) {
		return { ok: false, error: "Choose a valid pipeline status.", ids: uniq, status: null };
	}
	return { ok: true, error: null, ids: uniq, status };
}

export function filterSelectableApps(apps) {
	return (Array.isArray(apps) ? apps : []).filter((a) => a?.job_application_id != null);
}

export function toggleSelectedId(selected, id) {
	const n = Number(id);
	if (!Number.isFinite(n)) return selected;
	const set = new Set(selected || []);
	if (set.has(n)) set.delete(n);
	else set.add(n);
	return [...set];
}

/** Append a status-change event (immutable). */
export function appendStatusEvent(events, { from, to, at, by, note } = {}) {
	const list = Array.isArray(events) ? [...events] : [];
	if (!to) return list;
	list.push({
		event_type: "status",
		from_status: from ?? null,
		to_status: to,
		created_at: at || new Date().toISOString(),
		actor_user_id: by ?? null,
		note: note ?? null,
	});
	return list;
}

export function buildTimelineFromEvents(events) {
	const list = Array.isArray(events) ? [...events] : [];
	return list.sort((a, b) => {
		const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
		const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
		return ta - tb || (Number(a.event_id) || 0) - (Number(b.event_id) || 0);
	});
}

export function summarizeApplicationFunnel(apps) {
	const list = Array.isArray(apps) ? apps : [];
	const by_status = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0]));
	for (const a of list) {
		const s = APPLICATION_STATUSES.includes(a?.status) ? a.status : "applied";
		by_status[s] += 1;
	}
	const total = list.length;
	const rate = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);
	return {
		total,
		by_status,
		rates: {
			reviewed: rate(by_status.reviewed + by_status.shortlisted + by_status.rejected + by_status.hired),
			shortlisted: rate(by_status.shortlisted + by_status.hired),
			hired: rate(by_status.hired),
			rejected: rate(by_status.rejected),
		},
	};
}

/** Detect how to preview a résumé URL in-dashboard. Unsafe protocols are "none". */
export function resumeViewerKind(url) {
	if (!isSafeHttpUrl(url)) return "none";
	const clean = url.split("?")[0].split("#")[0].toLowerCase();
	if (/\.pdf$/i.test(clean) || clean.includes("/pdf")) return "pdf";
	if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(clean)) return "image";
	return "link";
}
