import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../i18n/index.js", () => ({
	default: {
		t: (key, opts) => (key === "videos.edgeDrawer.tabUnseenLabel"
			? `${opts.label}, ${opts.count} new`
			: opts?.defaultValue
			?? ({
				"nav.home": "Home",
				"videos.shorts": "Clips",
				"common.upload": "Upload",
				"videos.mobileNav.explore": "Explore",
				"videos.mobileNav.profile": "Profile",
				"videos.mobileNav.myChannel": "My channel",
				"videos.creatorStudio": "Creator Studio",
				"videos.edgeDrawer.history": "History",
				"videos.edgeDrawer.subs": "Subs",
				"videos.edgeDrawer.circle": "Your Circle",
				"videos.creatorsChoice": "Creator's Choice",
				"videos.brandTitle": "Strug Videos",
				"common.close": "Close",
			}[key] ?? key)),
	},
}));

import VideosMobileBottomNav from "./VideosMobileBottomNav.jsx";

vi.setConfig({ testTimeout: 15000 });

describe("VideosMobileBottomNav", () => {
	const setup = (overrides = {}) => {
		const props = {
			active: "home",
			onHome: vi.fn(),
			onClips: vi.fn(),
			onUpload: vi.fn(),
			onExploreOpen: vi.fn(),
			onExploreClose: vi.fn(),
			onExplorePick: vi.fn(),
			onProfileOpen: vi.fn(),
			onProfileClose: vi.fn(),
			onMyChannel: vi.fn(),
			onCreatorStudio: vi.fn(),
			...overrides,
		};
		render(<VideosMobileBottomNav {...props} />);
		return props;
	};

	it("renders Home, Clips, Upload, Explore, Profile", () => {
		setup();
		const nav = screen.getByTestId("videos-mobile-bottom-nav");
		expect(nav).toBeInTheDocument();
		expect(nav.parentElement).toBe(document.body);
		expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Clips" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Explore" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Profile" })).toBeInTheDocument();
	});

	it("wires Home / Clips / Upload taps", async () => {
		const user = userEvent.setup();
		const props = setup();
		await user.click(screen.getByRole("button", { name: "Home" }));
		await user.click(screen.getByRole("button", { name: "Clips" }));
		await user.click(screen.getByRole("button", { name: "Upload" }));
		expect(props.onHome).toHaveBeenCalled();
		expect(props.onClips).toHaveBeenCalled();
		expect(props.onUpload).toHaveBeenCalled();
	});

	it("Explore sheet lists History, Choice, Subs, Circle — not Library", async () => {
		const user = userEvent.setup();
		const props = setup({ exploreOpen: true });
		expect(screen.getByTestId("videos-explore-sheet")).toBeInTheDocument();
		expect(screen.getByTestId("videos-explore-history")).toBeInTheDocument();
		expect(screen.getByTestId("videos-explore-choice")).toBeInTheDocument();
		expect(screen.getByTestId("videos-explore-subs")).toBeInTheDocument();
		expect(screen.getByTestId("videos-explore-circle")).toBeInTheDocument();
		expect(screen.getByTestId("videos-explore-analytics")).toHaveTextContent("Viewing Insights");
		expect(screen.queryByText(/Watch Later/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/Liked/i)).not.toBeInTheDocument();
		await user.click(screen.getByTestId("videos-explore-circle"));
		expect(props.onExplorePick).toHaveBeenCalledWith("circle");
	});

	it("opens Viewing Insights from Explore", async () => {
		const user = userEvent.setup();
		const props = setup({ exploreOpen: true });
		await user.click(screen.getByTestId("videos-explore-analytics"));
		expect(props.onExplorePick).toHaveBeenCalledWith("analytics");
	});

	it("carries the drawer's unseen counts: one total on the tab, the split in the sheet", () => {
		setup({ exploreOpen: true, exploreCounts: { creatorChoice: 2, subs: 3, circle: 1 } });
		// The destinations are hidden behind the tab, so the closed tab can only say how many.
		expect(screen.getByTestId("videos-mobile-nav-explore-count")).toHaveTextContent("6");
		expect(screen.getByRole("button", { name: "Explore, 6 new" })).toBeInTheDocument();
		expect(screen.getByTestId("videos-explore-choice-count")).toHaveTextContent("2");
		expect(screen.getByTestId("videos-explore-subs-count")).toHaveTextContent("3");
		expect(screen.getByTestId("videos-explore-circle-count")).toHaveTextContent("1");
		expect(screen.getByRole("button", { name: "Subs, 3 new" })).toBeInTheDocument();
		// The viewer's own watches are never news, so History stays plain.
		expect(screen.queryByTestId("videos-explore-history-count")).not.toBeInTheDocument();
	});

	it("stays quiet with nothing unseen", () => {
		setup({ exploreOpen: true, exploreCounts: { creatorChoice: 0, subs: 0, circle: 0 } });
		expect(screen.queryByTestId("videos-mobile-nav-explore-count")).not.toBeInTheDocument();
		expect(screen.queryByTestId("videos-explore-subs-count")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Explore" })).toBeInTheDocument();
	});

	it("caps a crowded tab at 9+", () => {
		setup({ exploreOpen: true, exploreCounts: { subs: 12 } });
		expect(screen.getByTestId("videos-mobile-nav-explore-count")).toHaveTextContent("9+");
		expect(screen.getByTestId("videos-explore-subs-count")).toHaveTextContent("9+");
	});

	it("Profile sheet offers My channel and Creator Studio", async () => {
		const user = userEvent.setup();
		const props = setup({ profileOpen: true });
		expect(screen.getByTestId("videos-profile-sheet")).toBeInTheDocument();
		await user.click(screen.getByTestId("videos-profile-channel"));
		expect(props.onMyChannel).toHaveBeenCalled();
		await user.click(screen.getByTestId("videos-profile-studio"));
		expect(props.onCreatorStudio).toHaveBeenCalled();
	});

	it("closes Explore via X, backdrop, and Explore tab toggle", async () => {
		const user = userEvent.setup();
		const props = setup({ exploreOpen: true });
		await user.click(screen.getByTestId("videos-explore-sheet-close"));
		expect(props.onExploreClose).toHaveBeenCalledTimes(1);

		props.onExploreClose.mockClear();
		await user.click(screen.getByTestId("videos-explore-sheet-backdrop"));
		expect(props.onExploreClose).toHaveBeenCalledTimes(1);

		props.onExploreClose.mockClear();
		await user.click(screen.getByRole("button", { name: "Explore" }));
		expect(props.onExploreClose).toHaveBeenCalledTimes(1);
		expect(props.onExploreOpen).not.toHaveBeenCalled();
	});

	it("closes Profile via X, backdrop, tab toggle, and Escape", async () => {
		const user = userEvent.setup();
		const props = setup({ profileOpen: true });
		expect(document.body.style.overflow).toBe("hidden");

		await user.click(screen.getByTestId("videos-profile-sheet-close"));
		expect(props.onProfileClose).toHaveBeenCalledTimes(1);

		props.onProfileClose.mockClear();
		await user.click(screen.getByTestId("videos-profile-sheet-backdrop"));
		expect(props.onProfileClose).toHaveBeenCalledTimes(1);

		props.onProfileClose.mockClear();
		await user.click(screen.getByRole("button", { name: "Profile" }));
		expect(props.onProfileClose).toHaveBeenCalledTimes(1);

		props.onProfileClose.mockClear();
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(props.onProfileClose).toHaveBeenCalledTimes(1);
	});
});
