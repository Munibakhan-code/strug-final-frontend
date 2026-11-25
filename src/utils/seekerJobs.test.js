/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	buildSeekerListQuery,
	sortJobsClient,
	canApplyToJob,
	canEasyApply,
	readSavedJobIds,
	writeSavedJobIds,
	toggleSavedJobId,
	jobSharePath,
	parseJobIdFromPath,
	PAGE_SIZE,
} from "./seekerJobs.js";

function makeMemoryStorage() {
	const data = Object.create(null);
	return {
		getItem(k) {
			return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;
		},
		setItem(k, v) {
			data[k] = String(v);
		},
		removeItem(k) {
			delete data[k];
		},
		clear() {
			for (const k of Object.keys(data)) delete data[k];
		},
	};
}

describe("seekerJobs helpers", () => {
	beforeEach(() => {
		// Node env has no DOM storage; globalThis.localStorage is also non-writable on CI runners.
		vi.stubGlobal("localStorage", makeMemoryStorage());
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("buildSeekerListQuery maps filters + pagination", () => {
		expect(buildSeekerListQuery({
			keyword: "  node  ",
			location: "Toronto",
			is_remote: true,
			salary_min: "80000",
			salary_max: "120000",
			category: "3",
			employment_type: "full_time",
			sort: "salary_desc",
			page: 2,
		})).toEqual({
			limit: PAGE_SIZE,
			offset: PAGE_SIZE,
			sort: "salary_desc",
			keyword: "node",
			location: "Toronto",
			is_remote: "true",
			salary_min: 80000,
			salary_max: 120000,
			category: "3",
			employment_type: "full_time",
		});
	});

	it("sortJobsClient keeps sponsored first and sorts organic", () => {
		const jobs = [
			{ job_id: 1, salary_min: 50, posted_date: "2026-01-01" },
			{ job_id: 2, salary_min: 90, posted_date: "2026-02-01" },
			{ job_id: 9, sponsored: true, salary_min: 10 },
		];
		const bySal = sortJobsClient(jobs, "salary_desc");
		expect(bySal[0].job_id).toBe(9);
		expect(bySal[1].job_id).toBe(2);
		expect(bySal[2].job_id).toBe(1);
	});

	it("canApplyToJob rejects closed, expired, and ads", () => {
		expect(canApplyToJob({ job_id: 1, status: "open" }).ok).toBe(true);
		expect(canApplyToJob({ job_id: 1, status: "closed" }).ok).toBe(false);
		expect(canApplyToJob({ job_id: 1, status: "open", deadline: "2020-01-01" }).ok).toBe(false);
		expect(canApplyToJob({ job_id: "ad_1", is_ad: true }).ok).toBe(false);
	});

	it("canEasyApply requires resume_url", () => {
		expect(canEasyApply({})).toBe(false);
		expect(canEasyApply({ resume_url: "https://x/r.pdf" })).toBe(true);
	});

	it("saved job ids toggle in localStorage", () => {
		expect(readSavedJobIds()).toEqual([]);
		expect(toggleSavedJobId(5)).toEqual([5]);
		expect(toggleSavedJobId(5)).toEqual([]);
		writeSavedJobIds([1, 2, 2]);
		expect(readSavedJobIds()).toEqual([1, 2]);
	});

	it("share path helpers", () => {
		expect(jobSharePath(42)).toBe("/jobs/42");
		expect(parseJobIdFromPath("/jobs/99")).toBe(99);
		expect(parseJobIdFromPath("/jobs")).toBeNull();
	});
});
