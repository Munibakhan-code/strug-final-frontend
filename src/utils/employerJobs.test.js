/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
	EMPTY_JOB_FORM,
	jobToForm,
	validateJobForm,
	buildJobPayload,
	nextListingStatus,
	filterPostings,
	summarizePostings,
	validateCompanyForm,
	buildCompanyPayload,
} from "./employerJobs.js";

describe("employerJobs helpers", () => {
	it("jobToForm maps API row without inventing salary", () => {
		const form = jobToForm({
			job_name: "Backend Engineer",
			description: "Ship APIs",
			job_category_id: 3,
			location: "Remote",
			is_remote: true,
			employment_type: "full_time",
			salary_min: 90000,
			salary_max: null,
			salary_period: "year",
			experience_level: "mid",
			deadline: "2026-09-01T00:00:00.000Z",
			status: "draft",
		});
		expect(form.job_name).toBe("Backend Engineer");
		expect(form.job_category_id).toBe("3");
		expect(form.salary_min).toBe("90000");
		expect(form.salary_max).toBe("");
		expect(form.deadline).toBe("2026-09-01");
		expect(form.is_remote).toBe(true);
	});

	it("jobToForm returns empty defaults for null", () => {
		expect(jobToForm(null)).toEqual(EMPTY_JOB_FORM);
	});

	it("validateJobForm requires title and salary range order", () => {
		expect(validateJobForm({ ...EMPTY_JOB_FORM })).toMatch(/title/i);
		expect(validateJobForm({ ...EMPTY_JOB_FORM, job_name: "X", salary_min: "100", salary_max: "50" })).toMatch(/Salary min/);
		expect(validateJobForm({ ...EMPTY_JOB_FORM, job_name: "X" })).toBeNull();
	});

	it("buildJobPayload publishes open by default and drafts when asked", () => {
		const base = {
			...EMPTY_JOB_FORM,
			job_name: "  Designer  ",
			description: " UI ",
			job_category_id: "7",
			salary_min: "50",
			is_remote: true,
		};
		expect(buildJobPayload(base)).toMatchObject({
			job_name: "Designer",
			description: "UI",
			job_category_id: 7,
			salary_min: 50,
			is_remote: true,
			status: "open",
		});
		expect(buildJobPayload(base, { status: "draft" }).status).toBe("draft");
	});

	it("nextListingStatus cycles draft→open→closed→open", () => {
		expect(nextListingStatus("draft")).toBe("open");
		expect(nextListingStatus("open")).toBe("closed");
		expect(nextListingStatus("closed")).toBe("open");
	});

	it("filterPostings and summarizePostings count honestly", () => {
		const jobs = [
			{ job_id: 1, status: "open", _count: { job_application: 2 } },
			{ job_id: 2, status: "draft", _count: { job_application: 0 } },
			{ job_id: 3, status: "closed", _count: { job_application: 5 } },
			{ job_id: 4, _count: { job_application: 1 } },
		];
		expect(filterPostings(jobs, "draft")).toHaveLength(1);
		expect(filterPostings(jobs, "all")).toHaveLength(4);
		expect(summarizePostings(jobs)).toEqual({
			open: 2,
			closed: 1,
			draft: 1,
			total: 4,
			applicants: 8,
		});
	});

	it("company helpers require name and pass logo url", () => {
		expect(validateCompanyForm({})).toMatch(/Company name/);
		expect(
			buildCompanyPayload({
				company_name: " Acme ",
				company_logo_url: "https://cdn.example/logo.png",
				industry: "Tech",
			}),
		).toEqual({
			company_name: "Acme",
			industry: "Tech",
			company_size: undefined,
			company_country: undefined,
			company_web_url: undefined,
			company_description: undefined,
			company_logo_url: "https://cdn.example/logo.png",
		});
	});
});
