import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VerticalEdgeDrawer from "./VerticalEdgeDrawer.jsx";

const viewportState = { isMobile: false };

vi.mock("../hooks/useViewport.js", () => ({
	useViewport: () => viewportState,
}));

vi.mock("../store/auth.js", () => ({
	isAuthenticated: vi.fn(() => false),
	getAuthUserId: vi.fn(() => null),
}));

vi.mock("../utils/verticalEdgeDrawerData.js", () => ({
	loadEdgeDrawerTabData: vi.fn(async () => ({ items: [{ id: 1, title: "Test link", nav: "dashboard" }] })),
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key) => {
			const map = {
				"edgeDrawer.home.dashboard": "Dashboard",
				"edgeDrawer.home.provider": "Provider",
				"edgeDrawer.food.orders": "Orders",
				"edgeDrawer.food.favourites": "Favourites",
				"edgeDrawer.food.active": "Active",
				"edgeDrawer.signInPrompt": "Sign in to see your saved items and history.",
				"edgeDrawer.signIn": "Sign in",
				"edgeDrawer.empty": "Nothing here yet.",
				"common.loading": "Loading...",
			};
			return map[key] || key;
		},
	}),
}));

describe("VerticalEdgeDrawer", () => {
	beforeEach(() => {
		viewportState.isMobile = false;
		vi.clearAllMocks();
	});

	it("renders home dashboard tab on desktop", () => {
		render(
			<VerticalEdgeDrawer activeNav="home" navigateTo={vi.fn()} onRequireAuth={vi.fn()} />,
		);
		expect(screen.getByLabelText("Dashboard")).toBeInTheDocument();
	});

	it("shows sign-in prompt for auth-gated food tab when guest", async () => {
		const user = userEvent.setup();
		render(
			<VerticalEdgeDrawer activeNav="food" navigateTo={vi.fn()} onRequireAuth={vi.fn()} />,
		);
		await user.click(screen.getByLabelText("Orders"));
		expect(screen.getByText(/sign in to see/i)).toBeInTheDocument();
	});

	it("does not render shared edge tabs on jobs (JobsEdgeDrawer owns that rail)", () => {
		const { container } = render(
			<VerticalEdgeDrawer activeNav="jobs" navigateTo={vi.fn()} onRequireAuth={vi.fn()} />,
		);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders compact home tabs on mobile", () => {
		viewportState.isMobile = true;
		render(
			<VerticalEdgeDrawer activeNav="home" navigateTo={vi.fn()} onRequireAuth={vi.fn()} />,
		);
		const tab = screen.getByLabelText("Dashboard");
		expect(tab).toHaveAttribute("data-compact", "true");
	});
});
