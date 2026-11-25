import { describe, it, expect } from "vitest";
import { resumeStartPosition, hlsPlayerConfig, qualityChoicesFromLevels, autoQualityLabel } from "./hlsPlayback.js";

describe("resumeStartPosition", () => {
	it("starts at the beginning when there is no real resume point", () => {
		expect(resumeStartPosition(0)).toBe(-1);
		expect(resumeStartPosition(3)).toBe(-1);
		expect(resumeStartPosition(NaN)).toBe(-1);
	});

	it("uses a mid-watch timestamp so HLS does not fetch from 0:00 first", () => {
		expect(resumeStartPosition(42)).toBe(42);
		expect(resumeStartPosition("90")).toBe(90);
	});

	it("does not resume into the last 15 seconds of an already-finished video", () => {
		expect(resumeStartPosition(80, 90)).toBe(-1);
		expect(resumeStartPosition(70, 90)).toBe(70);
	});
});

describe("hlsPlayerConfig", () => {
	it("starts a phone on a cellular ABR guess and a short buffer", () => {
		const cfg = hlsPlayerConfig({ isMobile: true, startPosition: 48 });
		expect(cfg.abrEwmaDefaultEstimate).toBe(500_000);
		expect(cfg.maxBufferLength).toBe(15);
		expect(cfg.maxMaxBufferLength).toBe(40);
		expect(cfg.startPosition).toBe(48);
		expect(cfg.startLevel).toBe(-1);
	});

	it("keeps the desktop buffer and broadband ABR guess", () => {
		const cfg = hlsPlayerConfig({ isMobile: false, startPosition: 0 });
		expect(cfg.abrEwmaDefaultEstimate).toBe(1_500_000);
		expect(cfg.maxBufferLength).toBe(30);
		expect(cfg.startPosition).toBe(-1);
	});
});

describe("qualityChoicesFromLevels", () => {
	it("falls back to Auto when the master has no rungs", () => {
		expect(qualityChoicesFromLevels([])).toEqual([{ label: "Auto", index: -1 }]);
		expect(qualityChoicesFromLevels(null)).toEqual([{ label: "Auto", index: -1 }]);
	});

	it("lists Auto then heights high-to-low, keeping the hls.js level index", () => {
		expect(qualityChoicesFromLevels([{ height: 360 }, { height: 1080 }, { height: 720 }])).toEqual([
			{ label: "Auto", index: -1 },
			{ label: "1080p", index: 1 },
			{ label: "720p", index: 2 },
			{ label: "360p", index: 0 },
		]);
	});
});

describe("autoQualityLabel", () => {
	it("shows the active height while Auto is selected", () => {
		expect(autoQualityLabel(0)).toBe("Auto");
		expect(autoQualityLabel(NaN)).toBe("Auto");
		expect(autoQualityLabel(480)).toBe("Auto (480p)");
	});
});
