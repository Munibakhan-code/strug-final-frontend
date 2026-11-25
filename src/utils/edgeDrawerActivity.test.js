import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	isEdgeDrawerTabSeen,
	markEdgeDrawerTabSeen,
	shouldGlowEdgeTab,
} from "./edgeDrawerActivity.js";

vi.mock("../store/auth.js", () => ({
	getAuthUserId: vi.fn(() => 7),
	isAuthenticated: vi.fn(() => true),
}));

describe("edgeDrawerActivity", () => {
	beforeEach(() => {
		sessionStorage.clear();
	});

	it("shouldGlowEdgeTab is false when tab has no content", () => {
		expect(shouldGlowEdgeTab("food", "orders", false, 7)).toBe(false);
	});

	it("shouldGlowEdgeTab is true for unseen tabs with content", () => {
		expect(shouldGlowEdgeTab("food", "orders", true, 7)).toBe(true);
	});

	it("shouldGlowEdgeTab is false after tab was opened this session", () => {
		markEdgeDrawerTabSeen("food", "orders", 7);
		expect(shouldGlowEdgeTab("food", "orders", true, 7)).toBe(false);
	});

	it("food:active stays lit while content exists even after seen", () => {
		markEdgeDrawerTabSeen("food", "active", 7);
		expect(shouldGlowEdgeTab("food", "active", true, 7)).toBe(true);
	});

	it("rideshare:active stays lit while content exists even after seen", () => {
		markEdgeDrawerTabSeen("rideshare", "active", 7);
		expect(shouldGlowEdgeTab("rideshare", "active", true, 7)).toBe(true);
	});

	it("markEdgeDrawerTabSeen persists in sessionStorage", () => {
		expect(isEdgeDrawerTabSeen("jobs", "saved", 7)).toBe(false);
		markEdgeDrawerTabSeen("jobs", "saved", 7);
		expect(isEdgeDrawerTabSeen("jobs", "saved", 7)).toBe(true);
	});
});
