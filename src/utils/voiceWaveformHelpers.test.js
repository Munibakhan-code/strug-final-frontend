import { describe, expect, it } from "vitest";
import {
  buildFallbackWaveform,
  normalizeWaveformPeaks,
} from "./voiceWaveformHelpers.js";

describe("normalizeWaveformPeaks", () => {
  it("scales peaks to 0–1 range", () => {
    const out = normalizeWaveformPeaks([0, 0.5, 1], 3);
    expect(out).toEqual([0, 0.5, 1]);
  });

  it("returns fallback for empty or invalid input", () => {
    expect(normalizeWaveformPeaks(null, 8).length).toBe(8);
    expect(normalizeWaveformPeaks([], 8).length).toBe(8);
    expect(normalizeWaveformPeaks(["bad", -1], 8).length).toBe(8);
  });

  it("pads short peak arrays to requested bar count", () => {
    const out = normalizeWaveformPeaks([0.2, 0.8], 5);
    expect(out.length).toBe(5);
    expect(out[0]).toBe(0.25);
    expect(out[1]).toBe(1);
  });
});

describe("buildFallbackWaveform", () => {
  it("returns deterministic length", () => {
    const a = buildFallbackWaveform(16);
    const b = buildFallbackWaveform(16);
    expect(a).toEqual(b);
    expect(a.every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it("defaults to 32 bars", () => {
    expect(buildFallbackWaveform().length).toBe(32);
  });
});
