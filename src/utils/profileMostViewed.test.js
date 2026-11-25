/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { openMostViewedFromProfile } from "./profileMostViewed.js";

describe("openMostViewedFromProfile", () => {
	beforeEach(() => {
		globalThis.window = {
			__videosOpenVideoId: undefined,
			__townHallOpenPostId: undefined,
			__feedOpenPostId: undefined,
			dispatchEvent: vi.fn(),
		};
	});

	it("opens a video via the Videos handoff, not a document navigation", () => {
		const onNavigate = vi.fn();
		expect(openMostViewedFromProfile({ type: "video", id: 44 }, onNavigate)).toBe(true);
		expect(window.__videosOpenVideoId).toBe(44);
		expect(onNavigate).toHaveBeenCalledWith("videos");
	});

	it("rejects missing id or item", () => {
		const onNavigate = vi.fn();
		expect(openMostViewedFromProfile(null, onNavigate)).toBe(false);
		expect(openMostViewedFromProfile({ type: "video" }, onNavigate)).toBe(false);
		expect(openMostViewedFromProfile({ type: "townhall", id: "" }, onNavigate)).toBe(false);
		expect(onNavigate).not.toHaveBeenCalled();
	});

	it("opens Town Hall and social posts in-app instead of /post/ hard load", () => {
		const onNavigate = vi.fn();
		expect(openMostViewedFromProfile({ type: "townhall", id: "99" }, onNavigate)).toBe(true);
		expect(window.__townHallOpenPostId).toBe("99");
		expect(onNavigate).toHaveBeenCalledWith("social");
		onNavigate.mockClear();
		expect(openMostViewedFromProfile({ type: "social", id: 7 }, onNavigate)).toBe(true);
		expect(window.__feedOpenPostId).toBe(7);
		expect(onNavigate).toHaveBeenCalledWith("feed");
	});
});
