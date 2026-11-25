/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
	APPLICATION_STATUSES,
	PIPELINE_ACTIONS,
	EMPLOYER_NOTE_MAX,
	isValidApplicationStatus,
	validateEmployerNote,
	normalizeEmployerNote,
	validateInterviewInput,
	buildBulkStatusPayload,
	filterSelectableApps,
	toggleSelectedId,
	appendStatusEvent,
	buildTimelineFromEvents,
	summarizeApplicationFunnel,
	resumeViewerKind,
} from "./employerAts.js";

describe("employerAts helpers", () => {
	it("exposes a stable pipeline without applied as an action", () => {
		expect(APPLICATION_STATUSES).toContain("applied");
		expect(PIPELINE_ACTIONS).not.toContain("applied");
		expect(PIPELINE_ACTIONS).toEqual(["reviewed", "shortlisted", "rejected", "hired"]);
		expect(isValidApplicationStatus("hired")).toBe(true);
		expect(isValidApplicationStatus("ghost")).toBe(false);
	});

	it("validates and normalizes employer notes", () => {
		expect(validateEmployerNote("ok")).toBeNull();
		expect(validateEmployerNote("x".repeat(EMPLOYER_NOTE_MAX + 1))).toMatch(/4000/);
		expect(normalizeEmployerNote("  hello  ")).toBe("hello");
		expect(normalizeEmployerNote("   ")).toBeNull();
	});

	it("validates interview datetime + note length", () => {
		expect(validateInterviewInput({ interview_at: "2026-09-01T15:00:00.000Z" })).toBeNull();
		expect(validateInterviewInput({ interview_at: "not-a-date" })).toMatch(/invalid/i);
		expect(validateInterviewInput({ interview_notes: "x".repeat(2001) })).toMatch(/2000/);
	});

	it("builds bulk status payloads with caps and validation", () => {
		expect(buildBulkStatusPayload([], "shortlisted").ok).toBe(false);
		expect(buildBulkStatusPayload([1, 1, 2], "applied").ok).toBe(false);
		const ok = buildBulkStatusPayload([3, 1, 1], "rejected");
		expect(ok).toEqual({ ok: true, error: null, ids: [3, 1], status: "rejected" });
		expect(buildBulkStatusPayload(Array.from({ length: 51 }, (_, i) => i + 1), "hired").ok).toBe(false);
	});

	it("toggles selection and filters selectable apps", () => {
		expect(filterSelectableApps([{ job_application_id: 1 }, {}])).toHaveLength(1);
		expect(toggleSelectedId([], 5)).toEqual([5]);
		expect(toggleSelectedId([5, 7], 5)).toEqual([7]);
	});

	it("appends and sorts timeline events", () => {
		const events = appendStatusEvent([], { from: null, to: "applied", at: "2026-01-02T00:00:00.000Z" });
		const next = appendStatusEvent(events, { from: "applied", to: "reviewed", at: "2026-01-01T00:00:00.000Z", by: 9 });
		const timeline = buildTimelineFromEvents(next);
		expect(timeline[0].to_status).toBe("reviewed");
		expect(timeline[1].to_status).toBe("applied");
		expect(timeline[0].actor_user_id).toBe(9);
	});

	it("summarizes application funnel counts and rates", () => {
		const funnel = summarizeApplicationFunnel([
			{ status: "applied" },
			{ status: "applied" },
			{ status: "shortlisted" },
			{ status: "hired" },
			{ status: "rejected" },
			{ status: "weird" },
		]);
		expect(funnel.total).toBe(6);
		expect(funnel.by_status.applied).toBe(3); // weird → applied bucket
		expect(funnel.by_status.hired).toBe(1);
		expect(funnel.rates.hired).toBe(16.7);
		expect(funnel.rates.rejected).toBe(16.7);
	});

	it("classifies résumé viewer kinds", () => {
		expect(resumeViewerKind(null)).toBe("none");
		expect(resumeViewerKind("https://cdn/x/resume.pdf")).toBe("pdf");
		expect(resumeViewerKind("https://cdn/x/scan.PNG?token=1")).toBe("image");
		expect(resumeViewerKind("https://cdn/x/blob")).toBe("link");
		expect(resumeViewerKind("javascript:alert(1)")).toBe("none");
		expect(resumeViewerKind("data:text/html,<script>x</script>")).toBe("none");
	});
});
