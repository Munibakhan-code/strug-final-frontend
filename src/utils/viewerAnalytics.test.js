import { describe, expect, it } from "vitest";
import { buildCirclePulse, buildViewerAnalytics, formatViewerWatchTime } from "./viewerAnalytics.js";

const now = new Date(2026, 8, 2, 12);
const row = (id, daysAgo, category, channel, position, duration = 100) => ({
	video_id: id,
	watched_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
	last_position: position,
	video: { video_id: id, duration_sec: duration, category, channel: { display_name: channel } },
});

describe("circle pulse", () => {
	it("aggregates shared channels and excludes in-progress watching", () => {
		const pulse = buildCirclePulse({ data: [
			{ video_id: 1, watching_now: true, channel: { display_name: "Private" }, friends: [{ display_name: "A", action: "watching" }] },
			{ video_id: 2, category: "Tech", channel: { display_name: "Nova" }, friends: [{ display_name: "Maya", action: "watched", at: now.toISOString() }, { display_name: "Sam", action: "liked", at: now.toISOString() }] },
		] });
		expect(pulse.activeFriends).toBe(2);
		expect(pulse.watched).toBe(1);
		expect(pulse.liked).toBe(1);
		expect(pulse.channels).toEqual([{ label: "Nova", value: 2 }]);
		expect(pulse.categories).toEqual([{ label: "Tech", value: 2 }]);
	});
});

describe("viewer analytics", () => {
	it("builds watch, completion, category, channel, and trend metrics", () => {
		const result = buildViewerAnalytics({ data: [
			row(1, 0, "Tech", "Ada", 100),
			row(2, 0, "Tech", "Ada", 50),
			row(3, 2, "Comedy", "Lin", 20),
		] }, "7d", now);

		expect(result.totalVideos).toBe(3);
		expect(result.watchSeconds).toBe(170);
		expect(result.averageCompletion).toBeCloseTo(0.5667, 3);
		expect(result.completed).toBe(1);
		expect(result.categories[0]).toEqual({ label: "Tech", value: 2 });
		expect(result.channels[0]).toEqual({ label: "Ada", value: 2 });
		expect(result.trend).toHaveLength(7);
		expect(result.peak.videos).toBe(2);
	});

	it("filters ranges and does not invent missing playback progress", () => {
		const withoutProgress = row(2, 1, "Music", "Sam", 0);
		delete withoutProgress.last_position;
		const result = buildViewerAnalytics({ data: [row(1, 8, "Tech", "Ada", 90), withoutProgress] }, "7d", now);

		expect(result.totalVideos).toBe(1);
		expect(result.watchSeconds).toBe(0);
		expect(result.averageCompletion).toBeNull();
		expect(result.measurableCount).toBe(0);
	});

	it("builds a true 24-hour graph with one bucket per local hour", () => {
		const recent = row(1, 0, "Tech", "Ada", 90);
		recent.watched_at = new Date(now.getTime() - 2 * 3_600_000).toISOString();
		const old = row(2, 2, "Music", "Sam", 40);
		const result = buildViewerAnalytics({ data: [recent, old] }, "24h", now);

		expect(result.totalVideos).toBe(1);
		expect(result.trend).toHaveLength(24);
		expect(result.trend.reduce((sum, point) => sum + point.videos, 0)).toBe(1);
		expect(result.trend.every((point) => point.label)).toBe(true);
	});

	it("formats saved watch time compactly", () => {
		expect(formatViewerWatchTime(0)).toBe("0m");
		expect(formatViewerWatchTime(3_900)).toBe("1h 5m");
	});
});
