import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DesktopVideoEndScreen from "./DesktopVideoEndScreen.jsx";
import { desktopEndScreenLayout } from "../../utils/desktopVideoEndScreen.js";

const items = Array.from({ length: 8 }, (_, index) => ({
	id: index + 1,
	title: `Suggested video ${index + 1}`,
	channel: "Creator",
	duration: "4:20",
	thumb: `https://example.com/${index + 1}.jpg`,
}));

describe("DesktopVideoEndScreen", () => {
	it("scales the visible grid with the actual player bounds", () => {
		expect(desktopEndScreenLayout(480, 340)).toMatchObject({ columns: 1, limit: 1, compact: true });
		expect(desktopEndScreenLayout(620, 450)).toMatchObject({ columns: 2, limit: 2, compact: false });
		expect(desktopEndScreenLayout(800, 450)).toMatchObject({ columns: 3, limit: 3, compact: false });
		expect(desktopEndScreenLayout(900, 506)).toMatchObject({ columns: 3, limit: 3, compact: false });
		expect(desktopEndScreenLayout(1280, 720)).toMatchObject({ columns: 3, limit: 6, compact: false });
	});

	it("renders professional controls and opens a selected recommendation", () => {
		const onSelect = vi.fn();
		const onReplay = vi.fn();
		const onCancelCountdown = vi.fn();
		render(<DesktopVideoEndScreen items={items} countdown={5} onSelect={onSelect} onReplay={onReplay} onCancelCountdown={onCancelCountdown} />);

		expect(screen.getByTestId("desktop-video-end-screen")).toBeInTheDocument();
		expect(screen.getAllByRole("button", { name: /Play Suggested video/i })).toHaveLength(3);
		fireEvent.click(screen.getByRole("button", { name: "Play Suggested video 1" }));
		fireEvent.click(screen.getByRole("button", { name: "Replay video" }));
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(onSelect).toHaveBeenCalledWith(items[0]);
		expect(onReplay).toHaveBeenCalledTimes(1);
		expect(onCancelCountdown).toHaveBeenCalledTimes(1);
	});

	it("keeps replay and autoplay controls available while recommendations are empty", () => {
		render(<DesktopVideoEndScreen items={[]} countdown={3} onReplay={vi.fn()} onCancelCountdown={vi.fn()} />);

		expect(screen.getByText("No recommendations are available right now.")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Replay video" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
	});
});
