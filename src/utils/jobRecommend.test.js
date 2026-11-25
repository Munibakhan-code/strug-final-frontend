/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { normalizeRecommendedJobs, RECOMMENDED_JOBS_LIMIT } from "./jobRecommend.js";

describe("jobRecommend helpers", () => {
	it("filters ads and keeps real job ids", () => {
		expect(RECOMMENDED_JOBS_LIMIT).toBe(8);
		expect(normalizeRecommendedJobs([
			{ job_id: 1, job_name: "A" },
			{ job_id: 2, is_ad: true },
			{ sponsored: true, job_name: "Ad" },
			null,
		])).toEqual([{ job_id: 1, job_name: "A" }]);
	});
});
