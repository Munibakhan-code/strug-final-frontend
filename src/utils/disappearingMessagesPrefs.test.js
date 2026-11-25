/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  shouldShowDisappearingBanner,
  clearDisappearingPrefs,
} from "./disappearingMessagesPrefs.js";

describe("shouldShowDisappearingBanner", () => {
  it("hides empty and Off values", () => {
    expect(shouldShowDisappearingBanner(null)).toBe(false);
    expect(shouldShowDisappearingBanner("")).toBe(false);
    expect(shouldShowDisappearingBanner("Off")).toBe(false);
    expect(shouldShowDisappearingBanner("off")).toBe(false);
  });

  it("shows real durations", () => {
    expect(shouldShowDisappearingBanner("24h")).toBe(true);
    expect(shouldShowDisappearingBanner("7 days")).toBe(true);
  });
});

describe("clearDisappearingPrefs", () => {
  it("removes the legacy key", () => {
    const map = new Map([["strug_disappearing", "{}"]]);
    const storage = {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      removeItem: (k) => { map.delete(k); },
    };
    expect(clearDisappearingPrefs(storage)).toBe(true);
    expect(storage.getItem("strug_disappearing")).toBeNull();
  });
});
