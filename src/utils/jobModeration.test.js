/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { canReportJob, salaryDisclosureNudge, JOB_REPORT_REASONS } from "./jobModeration.js";

describe("jobModeration helpers", () => {
	it("allows reporting real jobs only", () => {
		expect(canReportJob({ job_id: 1 })).toBe(true);
		expect(canReportJob({ job_id: 1, is_ad: true })).toBe(false);
		expect(JOB_REPORT_REASONS.length).toBeGreaterThan(3);
	});

	it("nudges when salary is missing", () => {
		expect(salaryDisclosureNudge({})).toMatch(/Salary not listed/);
		expect(salaryDisclosureNudge({ salary_min: "90000" })).toBeNull();
	});
});
