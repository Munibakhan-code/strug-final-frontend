import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { cachedPlayback, rememberPlayback, clearPlaybackCache } from "./videoPlaybackCache.js";

describe("videoPlaybackCache", () => {
	beforeEach(() => clearPlaybackCache());
	afterEach(() => vi.useRealTimers());

	it("replays a remembered URL for any id the video is known by", () => {
		rememberPlayback({ id: 12, public_id: "abc", processed_video_url: "https://cdn/12/master.m3u8" });
		expect(cachedPlayback(12).processed_video_url).toBe("https://cdn/12/master.m3u8");
		expect(cachedPlayback("abc").processed_video_url).toBe("https://cdn/12/master.m3u8");
	});

	it("keeps only playback fields, so counts can never go stale", () => {
		rememberPlayback({
			id: 5,
			processed_video_url: "https://cdn/5/master.m3u8",
			thumbnail_url: "https://cdn/5/thumb.jpg",
			duration_sec: 90,
			views: "9",
			likes_count: 3,
		});
		expect(cachedPlayback(5)).toEqual({
			processed_video_url: "https://cdn/5/master.m3u8",
			thumbnail_url: "https://cdn/5/thumb.jpg",
			duration_sec: 90,
		});
	});

	it("ignores a video with no playable URL yet", () => {
		rememberPlayback({ id: 7, processed_video_url: null });
		expect(cachedPlayback(7)).toBeNull();
	});

	it("returns nothing for unknown or empty tokens", () => {
		expect(cachedPlayback(undefined)).toBeNull();
		expect(cachedPlayback("")).toBeNull();
		expect(cachedPlayback(404)).toBeNull();
	});

	it("expires after ten minutes rather than serving a very old URL", () => {
		vi.useFakeTimers();
		rememberPlayback({ id: 9, processed_video_url: "https://cdn/9/master.m3u8" });
		vi.advanceTimersByTime(9 * 60 * 1000);
		expect(cachedPlayback(9)).not.toBeNull();
		vi.advanceTimersByTime(2 * 60 * 1000);
		expect(cachedPlayback(9)).toBeNull();
	});

	it("drops everything on sign-out", () => {
		rememberPlayback({ id: 3, processed_video_url: "https://cdn/3/master.m3u8" });
		clearPlaybackCache();
		expect(cachedPlayback(3)).toBeNull();
	});
});
