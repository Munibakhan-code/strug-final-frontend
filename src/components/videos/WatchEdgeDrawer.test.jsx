import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WatchEdgeDrawer from "./WatchEdgeDrawer.jsx";
import CircleSharingToggle from "./CircleSharingToggle.jsx";
import { getFriendActivityPrefs, updateFriendActivityPrefs } from "../../api/videos";

vi.mock("../../api/videos", () => ({
	getFriendActivityPrefs: vi.fn(),
	updateFriendActivityPrefs: vi.fn(),
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key, options) => options?.defaultValue ?? key }),
}));

describe("Circle sharing preference", () => {
	it("requires a confirmed setting and lets the user retry a failed load", async () => {
		getFriendActivityPrefs.mockRejectedValueOnce(new Error("Offline"))
			.mockResolvedValueOnce({ successful: true, has_profile: true, share_video_activity: false });
		render(<CircleSharingToggle />);
		await screen.findByRole("alert");
		expect(screen.getByRole("switch")).toBeDisabled();
		await userEvent.click(screen.getByRole("button", { name: "common.retry" }));
		await vi.waitFor(() => expect(screen.getByRole("switch")).toBeEnabled());
		expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
	});

	it("saves an explicit opt-in from the default off state", async () => {
		getFriendActivityPrefs.mockResolvedValue({ successful: true, has_profile: true, share_video_activity: false });
		updateFriendActivityPrefs.mockResolvedValue({ successful: true, share_video_activity: true });
		render(<CircleSharingToggle />);
		await vi.waitFor(() => expect(screen.getByRole("switch")).toBeEnabled());
		await userEvent.click(screen.getByRole("switch"));
		await vi.waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true"));
		expect(updateFriendActivityPrefs).toHaveBeenLastCalledWith({ share_video_activity: true });
	});

	it("loads the saved opt-in and persists opt-out without altering other preferences", async () => {
		getFriendActivityPrefs.mockResolvedValue({ successful: true, has_profile: true, share_video_activity: true });
		updateFriendActivityPrefs.mockResolvedValue({ successful: true, share_video_activity: false });
		render(<CircleSharingToggle />);
		const control = await screen.findByRole("switch", { name: "Share my video activity" });
		await vi.waitFor(() => expect(control).toBeEnabled());
		expect(control).toHaveAttribute("aria-checked", "true");
		await userEvent.click(control);
		await vi.waitFor(() => expect(control).toHaveAttribute("aria-checked", "false"));
		expect(updateFriendActivityPrefs).toHaveBeenLastCalledWith({ share_video_activity: false });
	});

	it("keeps the confirmed state and reports a failed save", async () => {
		getFriendActivityPrefs.mockResolvedValue({ successful: true, has_profile: true, share_video_activity: true });
		updateFriendActivityPrefs.mockRejectedValue(new Error("Offline"));
		render(<CircleSharingToggle />);
		const control = screen.getByRole("switch");
		await vi.waitFor(() => expect(control).toBeEnabled());
		await userEvent.click(control);
		expect(await screen.findByRole("alert")).toBeInTheDocument();
		expect(control).toHaveAttribute("aria-checked", "true");
	});

	it("does not offer sharing when no social profile exists", async () => {
		getFriendActivityPrefs.mockResolvedValue({ successful: true, has_profile: false, share_video_activity: false });
		render(<CircleSharingToggle />);
		await screen.findByText("Create a social profile to enable sharing.");
		expect(screen.getByRole("switch")).toBeDisabled();
	});
});

vi.mock("../../i18n/index.js", () => ({
	default: {
			t: (key, opts) => {
			const map = {
				"common.loadMore": "Load more",
				"common.loading": "Loading…",
				"videos.edgeDrawer.emptyHistory": "No watch history yet.",
				"videos.edgeDrawer.emptyCircle": "No friend activity.",
				"videos.edgeDrawer.emptySubs": "No new uploads.",
				"videos.edgeDrawer.newBadge": "New",
				"videos.edgeDrawer.newFromChannel": `New from ${opts?.channel ?? ""}`,
				"videos.edgeDrawer.watchingNow": "Watching now",
				"videos.edgeDrawer.liked": "Liked",
				"videos.edgeDrawer.watched": "Watched",
			};
			return map[key] ?? key;
		},
	},
}));

const subVideo = {
	id: 101,
	title: "Fresh Upload",
	channel: "Tech Channel",
	thumb: "https://cdn.example/t.jpg",
	views: "1.2K views",
	ago: "1 hour ago",
	isNewUpload: true,
};

describe("WatchEdgeDrawer — Subs tab", () => {
	it("shows loading then empty state", () => {
		const { rerender } = render(
			<WatchEdgeDrawer activeTab="subs" subsLoading subsItems={[]} onPickVideo={() => {}} />
		);
		expect(screen.getByText("Loading…")).toBeInTheDocument();
		rerender(<WatchEdgeDrawer activeTab="subs" subsLoading={false} subsItems={[]} onPickVideo={() => {}} />);
		expect(screen.getByText("No new uploads.")).toBeInTheDocument();
	});

	it("renders NEW badge for isNewUpload rows and calls onPick", async () => {
		const user = userEvent.setup();
		const onPick = vi.fn();
		render(
			<WatchEdgeDrawer
				activeTab="subs"
				subsLoading={false}
				subsItems={[subVideo]}
				onPickVideo={onPick}
			/>
		);
		expect(screen.getByText("New")).toBeInTheDocument();
		expect(screen.getByText("New from Tech Channel")).toBeInTheDocument();
		await user.click(screen.getByText("Fresh Upload"));
		expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 101 }));
	});

	it("keeps loaded pages visible and requests the next page", async () => {
		const user = userEvent.setup();
		const onLoadMore = vi.fn();
		const items = Array.from({ length: 13 }, (_, index) => ({
			...subVideo,
			id: index + 1,
			title: `Upload ${index + 1}`,
		}));
		render(
			<WatchEdgeDrawer
				activeTab="subs"
				subsLoading={false}
				subsItems={items}
				hasMore
				onLoadMore={onLoadMore}
				onPickVideo={() => {}}
			/>
		);
		expect(screen.getByText("Upload 13")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Load more" }));
		expect(onLoadMore).toHaveBeenCalledOnce();
	});
});
