/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  toDatetimeLocalValue,
  fromDatetimeLocalValue,
  schedulePresets,
} from "./datetimeLocal.js";

describe("toDatetimeLocalValue / fromDatetimeLocalValue", () => {
  it("round-trips a local wall time without UTC shift", () => {
    const d = new Date(2026, 8, 11, 15, 45, 0); // local Sep 11 2026 15:45
    const value = toDatetimeLocalValue(d);
    expect(value).toBe("2026-09-11T15:45");
    expect(fromDatetimeLocalValue(value)).toBe(d.getTime());
  });

  it("returns empty string / null for invalid input", () => {
    expect(toDatetimeLocalValue(new Date("nope"))).toBe("");
    expect(fromDatetimeLocalValue("")).toBeNull();
    expect(fromDatetimeLocalValue("not-a-date")).toBeNull();
  });

  it("does not use UTC slice for the control value (regression)", () => {
    const d = new Date(2026, 0, 1, 0, 30); // local midnight+30
    const local = toDatetimeLocalValue(d);
    const utcSlice = d.toISOString().slice(0, 16);
    // In non-UTC timezones these differ; when they match (UTC offset 0) both are fine.
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromDatetimeLocalValue(local)).toBe(d.getTime());
    // If we wrongly used UTC slice, parsing as local would shift. Assert local path wins.
    if (local !== utcSlice) {
      expect(fromDatetimeLocalValue(utcSlice)).not.toBe(d.getTime());
    }
  });
});

describe("schedulePresets", () => {
  it("returns 15m, 1h, and tomorrow 9:00 in the future", () => {
    const now = new Date(2026, 8, 11, 10, 0, 0);
    const presets = schedulePresets(now);
    expect(presets.map((p) => p.id)).toEqual(["15m", "1h", "tomorrow9"]);
    expect(presets[0].at).toBe(now.getTime() + 15 * 60 * 1000);
    expect(presets[1].at).toBe(now.getTime() + 60 * 60 * 1000);
    const tmr = new Date(presets[2].at);
    expect(tmr.getHours()).toBe(9);
    expect(tmr.getMinutes()).toBe(0);
    expect(presets[2].at).toBeGreaterThan(now.getTime());
  });
});
