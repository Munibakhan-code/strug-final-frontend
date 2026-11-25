/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
	canSaveJobSearch,
	labelJobSavedSearch,
	filtersForJobSavedSearch,
	jobSavedSearchFiltersEqual,
	normalizeJobSavedSearchFrequency,
} from "./jobSavedSearch.js";

describe("jobSavedSearch helpers", () => {
	it("requires at least one meaningful filter to save", () => {
		expect(canSaveJobSearch({})).toBe(false);
		expect(canSaveJobSearch({ keyword: "  " })).toBe(false);
		expect(canSaveJobSearch({ keyword: "react" })).toBe(true);
		expect(canSaveJobSearch({ is_remote: true })).toBe(true);
	});

	it("labels and strips paging keys", () => {
		expect(labelJobSavedSearch({ keyword: "Node", location: "Toronto", is_remote: true })).toMatch(/Node/);
		expect(filtersForJobSavedSearch({ keyword: "x", page: 3, sort: "newest" })).toEqual({ keyword: "x" });
		expect(jobSavedSearchFiltersEqual(
			{ keyword: "x", page: 1 },
			{ keyword: "x", page: 9 },
		)).toBe(true);
	});

	it("matches a saved search after a jsonb round-trip", () => {
		// Postgres jsonb does not preserve key order, so the same search comes back with its keys
		// shuffled. Comparing raw JSON.stringify said "different" and the UI kept letting people
		// re-save a search they already had.
		const asTyped = { keyword: "node", location: "Toronto", employment_type: "full_time" };
		const asStored = { employment_type: "full_time", keyword: "node", location: "Toronto" };
		expect(jobSavedSearchFiltersEqual(asTyped, asStored)).toBe(true);

		// Empty and unset mean the same thing, as does an unchecked remote box.
		expect(jobSavedSearchFiltersEqual({ keyword: "node" }, { keyword: "node", location: "" })).toBe(true);
		expect(jobSavedSearchFiltersEqual({ keyword: "node" }, { keyword: "node", is_remote: false })).toBe(true);

		// A salary typed into an input arrives as a string and comes back as a number.
		expect(jobSavedSearchFiltersEqual({ salary_min: "80000" }, { salary_min: 80000 })).toBe(true);

		// ...but a minimum of 0 is a real filter and must not be treated as unset.
		expect(jobSavedSearchFiltersEqual({ salary_min: 0 }, {})).toBe(false);

		// Genuinely different searches still differ.
		expect(jobSavedSearchFiltersEqual({ keyword: "node" }, { keyword: "react" })).toBe(false);
		expect(jobSavedSearchFiltersEqual({ keyword: "node" }, { keyword: "node", is_remote: true })).toBe(false);
	});

	it("normalizes frequency", () => {
		expect(normalizeJobSavedSearchFrequency("daily")).toBe("daily");
		expect(normalizeJobSavedSearchFrequency("nope")).toBe("immediate");
	});
});
