/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
	EARLY_ADOPTER_BEFORE,
	formatTrendingTagLabel,
	isEarlyAdopterFromJoinDate,
	resolveProfileJoinedAt,
	shouldShowEarlyAdopterBadge,
} from "./profileWidgetHelpers.js";

describe("formatTrendingTagLabel", () => {
	it("prefixes a bare tag name with #", () => {
		expect(formatTrendingTagLabel({ name: "StrugCreator" })).toBe("#StrugCreator");
	});

	it("returns # for empty or missing names", () => {
		expect(formatTrendingTagLabel({})).toBe("#");
		expect(formatTrendingTagLabel({ name: "   " })).toBe("#");
		expect(formatTrendingTagLabel(null)).toBe("#");
	});

	it("does not double-prefix an existing hash", () => {
		expect(formatTrendingTagLabel({ name: "#LiveNow" })).toBe("#LiveNow");
	});
});

describe("resolveProfileJoinedAt", () => {
	it("uses social profile created_at when present", () => {
		const d = resolveProfileJoinedAt({
			socialCreatedAt: "2024-06-01T00:00:00.000Z",
			userCreatedAt: "2025-01-01T00:00:00.000Z",
			isViewingOther: true,
		});
		expect(d?.toISOString()).toBe("2024-06-01T00:00:00.000Z");
	});

	it("does not leak the viewer join date onto another profile", () => {
		expect(resolveProfileJoinedAt({
			socialCreatedAt: null,
			userCreatedAt: "2024-01-01T00:00:00.000Z",
			isViewingOther: true,
		})).toBeNull();
	});

	it("rejects malformed dates", () => {
		expect(resolveProfileJoinedAt({
			socialCreatedAt: "not-a-date",
			userCreatedAt: null,
			isViewingOther: false,
		})).toBeNull();
	});
});

describe("isEarlyAdopterFromJoinDate", () => {
	it("is true for accounts created before the cutoff", () => {
		expect(isEarlyAdopterFromJoinDate(new Date("2025-01-01T00:00:00.000Z"))).toBe(true);
	});

	it("is false on or after the cutoff", () => {
		expect(isEarlyAdopterFromJoinDate(EARLY_ADOPTER_BEFORE)).toBe(false);
		expect(isEarlyAdopterFromJoinDate(new Date("2026-01-01T00:00:00.000Z"))).toBe(false);
	});

	it("is false for missing join dates", () => {
		expect(isEarlyAdopterFromJoinDate(null)).toBe(false);
		expect(isEarlyAdopterFromJoinDate(undefined)).toBe(false);
	});
});

describe("shouldShowEarlyAdopterBadge", () => {
	it("hides the badge when join date is unknown", () => {
		expect(shouldShowEarlyAdopterBadge(null)).toBe(false);
		expect(shouldShowEarlyAdopterBadge(undefined)).toBe(false);
		expect(shouldShowEarlyAdopterBadge("not-a-date")).toBe(false);
	});

	it("shows the badge when join date is known", () => {
		expect(shouldShowEarlyAdopterBadge(new Date("2024-06-01T00:00:00.000Z"))).toBe(true);
		expect(shouldShowEarlyAdopterBadge("2024-06-01T00:00:00.000Z")).toBe(true);
	});
});
