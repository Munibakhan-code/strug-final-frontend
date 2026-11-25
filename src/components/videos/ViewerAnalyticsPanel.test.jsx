import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = vi.hoisted(() => ({ getWatchHistory: vi.fn(), getFriendVideoActivity: vi.fn() }));
vi.mock("../../api/videos", () => api);
vi.mock("../creatorAnalytics.jsx", () => ({
	TrendChart: ({ data }) => <div data-testid="viewer-trend">{data.reduce((sum, item) => sum + item.videos, 0)}</div>,
	DonutChart: ({ segments }) => <div data-testid="viewer-donut">{segments.map((item) => item.label).join(",")}</div>,
}));

import ViewerAnalyticsPanel from "./ViewerAnalyticsPanel.jsx";

function historyRow(id, daysAgo, category, channel, position, duration = 100) {
	return {
		video_id: id,
		watched_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
		last_position: position,
		video: { video_id: id, category, duration_sec: duration, channel: { display_name: channel } },
	};
}

describe("ViewerAnalyticsPanel", () => {
	beforeEach(() => {
		api.getWatchHistory.mockReset();
		api.getFriendVideoActivity.mockReset();
		api.getWatchHistory.mockResolvedValue({ data: [
			historyRow(1, 1, "Tech", "Creator One", 100),
			historyRow(2, 10, "Music", "Creator Two", 50),
		] });
		api.getFriendVideoActivity.mockResolvedValue([]);
	});

	it("loads history once and renders the insight sections", async () => {
		render(<ViewerAnalyticsPanel />);
		expect(await screen.findByTestId("viewer-analytics")).toBeInTheDocument();
		expect(screen.getByText("Videos watched over time")).toBeInTheDocument();
		expect(screen.getByText("What you watch")).toBeInTheDocument();
		expect(screen.getByText("Most watched channels")).toBeInTheDocument();
		expect(screen.getByTestId("viewer-donut")).toHaveTextContent("Music,Tech");
		expect(api.getWatchHistory).toHaveBeenCalledTimes(1);
	});

	it("changes range locally without refetching history", async () => {
		const user = userEvent.setup();
		render(<ViewerAnalyticsPanel isMobile />);
		await screen.findByTestId("viewer-analytics");
		await user.click(screen.getByRole("button", { name: "7D" }));
		await waitFor(() => expect(screen.getByTestId("viewer-trend")).toHaveTextContent("1"));
		expect(api.getWatchHistory).toHaveBeenCalledTimes(1);
	});

	it("offers a 24-hour range", async () => {
		render(<ViewerAnalyticsPanel />);
		await screen.findByTestId("viewer-analytics");
		expect(screen.getByRole("button", { name: "24H" })).toBeInTheDocument();
	});

	it("shows privacy-approved Circle channels and ignores live watching", async () => {
		const user = userEvent.setup();
		api.getFriendVideoActivity.mockResolvedValueOnce({ data: [
			{ video_id: 8, title: "Private live", watching_now: true, category: "Live", channel: { display_name: "Hidden" }, friends: [{ display_name: "A", action: "watching", at: Date.now() }] },
			{ video_id: 9, title: "Shared watch", category: "Tech", channel: { display_name: "Nova" }, friends: [{ display_name: "Maya", action: "watched", at: Date.now() }] },
		] });
		render(<ViewerAnalyticsPanel />);
		await user.click(await screen.findByRole("tab", { name: "Circle Pulse" }));
		expect(screen.getByText("Nova")).toBeInTheDocument();
		expect(screen.getByText("Tech · 1")).toBeInTheDocument();
		expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
		expect(screen.queryByText("Videos watched over time")).not.toBeInTheDocument();
	});

	it("shows a safe error state when history cannot load", async () => {
		api.getWatchHistory.mockRejectedValueOnce(new Error("offline"));
		render(<ViewerAnalyticsPanel />);
		expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load viewing insights");
	});
});
