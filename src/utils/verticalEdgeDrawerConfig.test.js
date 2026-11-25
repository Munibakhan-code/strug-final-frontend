/** @vitest-environment node */
import { describe, it, expect } from "vitest";
import {
	EDGE_DRAWER_VERTICALS,
	getEdgeDrawerTabs,
	shouldShowVerticalEdgeDrawer,
	stackEdgeTabTop,
	AI_FAB_CENTER_OFFSET_PX,
	AI_FAB_HEIGHT_PX,
	EDGE_TAB_CLEARANCE_PX,
	aiFabTranslateY,
} from "./verticalEdgeDrawerConfig.js";

/** Parse `calc(50% + Npx)` or `calc(50% - Npx)` to offset px from centre. */
function parseStackOffset(top) {
	const m = String(top).match(/calc\(50%\s*([+-])\s*(\d+(?:\.\d+)?)px\)/);
	if (!m) return null;
	const n = Number(m[2]);
	return m[1] === "-" ? -n : n;
}

describe("verticalEdgeDrawerConfig", () => {
	it("shows drawer on supported verticals including mobile", () => {
		expect(shouldShowVerticalEdgeDrawer("home", { isMobile: false, is404: false })).toBe(true);
		expect(shouldShowVerticalEdgeDrawer("videos", { isMobile: false, is404: false })).toBe(false);
		expect(shouldShowVerticalEdgeDrawer("jobs", { isMobile: false, is404: false })).toBe(false);
		expect(shouldShowVerticalEdgeDrawer("home", { isMobile: true, is404: false })).toBe(true);
		expect(shouldShowVerticalEdgeDrawer("food", { isMobile: false, is404: true })).toBe(false);
	});

	it("returns home dashboard and provider tabs", () => {
		const tabs = getEdgeDrawerTabs("home");
		expect(tabs.map((t) => t.id)).toEqual(["dashboard", "provider"]);
	});

	it("returns three tabs for tempstay, food, rideshare, social, feed", () => {
		for (const nav of ["tempstay", "food", "rideshare", "social", "feed"]) {
			expect(getEdgeDrawerTabs(nav)).toHaveLength(3);
		}
	});

	it("leaves jobs tabs to JobsEdgeDrawer", () => {
		expect(getEdgeDrawerTabs("jobs")).toEqual([]);
	});

	it("returns social edge tabs with vault, closeFriends, bookmarks", () => {
		expect(getEdgeDrawerTabs("social").map((t) => t.id)).toEqual(["vault", "closeFriends", "bookmarks"]);
		expect(getEdgeDrawerTabs("feed").map((t) => t.id)).toEqual(["vault", "closeFriends", "bookmarks"]);
	});

	it("returns two tabs for shop and venues (no empty recent tabs in v1)", () => {
		expect(getEdgeDrawerTabs("shop").map((t) => t.id)).toEqual(["orders", "wishlist"]);
		expect(getEdgeDrawerTabs("venues").map((t) => t.id)).toEqual(["bookings", "saved"]);
	});

	it("marks food tabs as auth-gated", () => {
		const tabs = getEdgeDrawerTabs("food");
		expect(tabs.every((t) => t.auth === true)).toBe(true);
	});

	it("stackEdgeTabTop keeps tabs clear of the Strug AI fab band", () => {
		const deadTop = AI_FAB_CENTER_OFFSET_PX - AI_FAB_HEIGHT_PX / 2 - EDGE_TAB_CLEARANCE_PX;
		const deadBottom = AI_FAB_CENTER_OFFSET_PX + AI_FAB_HEIGHT_PX / 2 + EDGE_TAB_CLEARANCE_PX;
		const tabHeight = 86;

		expect(stackEdgeTabTop(0, 2)).toBe("calc(50% - 130px)");
		expect(stackEdgeTabTop(1, 2)).toBe("calc(50% + 84px)");
		expect(stackEdgeTabTop(0, 3)).toBe("calc(50% - 232px)");
		expect(stackEdgeTabTop(1, 3)).toBe("calc(50% - 130px)");
		expect(stackEdgeTabTop(2, 3)).toBe("calc(50% + 84px)");

		for (const total of [2, 3]) {
			for (let i = 0; i < total; i += 1) {
				const top = parseStackOffset(stackEdgeTabTop(i, total));
				const bottom = top + tabHeight;
				expect(top).not.toBe(0);
				expect(bottom <= deadTop || top >= deadBottom).toBe(true);
				expect(stackEdgeTabTop(i, total)).not.toBe("50%");
			}
		}
	});

	it("keeps adjacent tabs from overlapping for stacks of 2–5", () => {
		const tabHeight = 86;
		const gap = 16;
		for (const total of [2, 3, 4, 5]) {
			const tops = [];
			for (let i = 0; i < total; i += 1) {
				tops.push(parseStackOffset(stackEdgeTabTop(i, total)));
			}
			for (let i = 0; i < total - 1; i += 1) {
				expect(tops[i + 1]).toBeGreaterThanOrEqual(tops[i] + tabHeight + gap);
			}
		}
	});

	it("aiFabTranslateY keeps the +20px nudge at every scale (edge)", () => {
		expect(aiFabTranslateY()).toContain("+ 20px");
		expect(aiFabTranslateY(1.08)).toContain("+ 20px");
		expect(aiFabTranslateY(1.08)).toContain("scale(1.08)");
		expect(aiFabTranslateY(0.93)).not.toBe("translateY(-50%) scale(0.93)");
	});

	it("uses tighter mobile spacing", () => {
		expect(stackEdgeTabTop(1, 2, { isMobile: true })).toBe("calc(50% + 84px)");
		expect(parseStackOffset(stackEdgeTabTop(0, 2, { isMobile: true })))
			.toBeGreaterThan(parseStackOffset(stackEdgeTabTop(0, 2)));
	});

	it("covers epic verticals except videos and jobs (JobsEdgeDrawer owns jobs)", () => {
		expect([...EDGE_DRAWER_VERTICALS].sort()).toEqual(
			["feed", "food", "home", "rideshare", "shop", "social", "tempstay", "venues"].sort(),
		);
	});

	it("marks social tabs as auth-gated", () => {
		expect(getEdgeDrawerTabs("social").every((t) => t.auth === true)).toBe(true);
	});

	it("returns empty tabs for unknown nav", () => {
		expect(getEdgeDrawerTabs("dating")).toEqual([]);
	});
});
