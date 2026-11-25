/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
	companySharePath,
	parseAgentIdFromPath,
	normalizeCompanyProfile,
	canLinkCompany,
	companyIdFromJob,
	COMPANY_SIZE_OPTIONS,
} from "./companyJobs.js";

describe("companyJobs helpers", () => {
	it("builds and parses company paths", () => {
		expect(companySharePath(42)).toBe("/company/42");
		expect(companySharePath(0)).toBeNull();
		expect(parseAgentIdFromPath("/company/9")).toBe(9);
		expect(parseAgentIdFromPath("/jobs/9")).toBeNull();
	});

	it("normalizes public company payloads", () => {
		expect(normalizeCompanyProfile(null)).toBeNull();
		const co = normalizeCompanyProfile({
			agent_id: 3,
			company_name: "Acme",
			jobs: [{ job_id: 1 }],
			open_count: 1,
		});
		expect(co.company_name).toBe("Acme");
		expect(co.jobs).toHaveLength(1);
		expect(COMPANY_SIZE_OPTIONS).toContain("11-50");
	});

	it("detects linkable agent ids on jobs", () => {
		expect(canLinkCompany({ agents: { agent_id: 7 } })).toBe(true);
		expect(companyIdFromJob({ agent_id: 7 })).toBe(7);
		expect(canLinkCompany({})).toBe(false);
	});
});
