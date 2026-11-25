import { describe, it, expect } from "vitest";
import {
	eachDateISOInclusive,
	rangeOverlapsUnavailable,
	inclusiveEventDays,
	weddingItemAllowsTryOn,
	resolveVendorRating,
	formatWeddingDate,
	weddingCardGrid,
	weddingPageInset,
	weddingCategoryRow,
} from "./weddingUtils.js";

describe("weddingUtils", () => {
	it("lists inclusive dates", () => {
		expect(eachDateISOInclusive("2026-08-01", "2026-08-03")).toEqual([
			"2026-08-01",
			"2026-08-02",
			"2026-08-03",
		]);
		expect(eachDateISOInclusive("2026-08-01")).toEqual(["2026-08-01"]);
	});

	it("detects middle-day conflicts in a range", () => {
		const unavailable = new Set(["2026-08-02"]);
		expect(rangeOverlapsUnavailable("2026-08-01", "2026-08-03", unavailable)).toBe(true);
		expect(rangeOverlapsUnavailable("2026-08-01", "2026-08-01", unavailable)).toBe(false);
	});

	it("counts inclusive event days", () => {
		expect(inclusiveEventDays("2026-08-01", "2026-08-03")).toBe(3);
		expect(inclusiveEventDays("2026-08-01")).toBe(1);
	});

	it("allows try-on for dresses, rings, accessories", () => {
		expect(weddingItemAllowsTryOn("Dresses")).toBe(true);
		expect(weddingItemAllowsTryOn("Rings")).toBe(true);
		expect(weddingItemAllowsTryOn("Accessories")).toBe(true);
		expect(weddingItemAllowsTryOn("Stationery")).toBe(false);
		expect(weddingItemAllowsTryOn("Decor")).toBe(false);
	});

	it("prefers listing avg_rating columns when reviews exist", () => {
		expect(resolveVendorRating({ avg_rating: 4.5, review_count: 3 }, { rating: 2, reviews: 1 })).toEqual({
			rating: 4.5,
			reviews: 3,
		});
		expect(resolveVendorRating({ avg_rating: 0, review_count: 0 }, { rating: 4, reviews: 2 })).toEqual({
			rating: 4,
			reviews: 2,
		});
	});

	it("formats dates with locale", () => {
		const d = new Date(2026, 7, 6, 12);
		const en = formatWeddingDate(d, { year: "numeric", month: "short", day: "numeric" }, "en-US");
		expect(en).toMatch(/2026/);
		expect(en).toMatch(/Aug|8/);
	});

	it("builds responsive card grids that fit narrow phones", () => {
		const grid = weddingCardGrid(260, 16);
		expect(grid.gridTemplateColumns).toContain("min(100%, 260px)");
		expect(weddingPageInset(true).paddingLeft).toBe(14);
		expect(weddingPageInset(false, true).paddingLeft).toBe(28);
		expect(weddingPageInset(false, false).paddingLeft).toBe(108);
		expect(weddingCategoryRow(true).justifyContent).toBe("flex-start");
	});
});
