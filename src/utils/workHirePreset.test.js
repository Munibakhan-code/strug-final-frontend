import { describe, it, expect, beforeEach } from "vitest";
import { setWorkHirePreset, peekWorkHirePreset, clearWorkHirePreset } from "./workHirePreset.js";

describe("workHirePreset", () => {
  beforeEach(() => {
    clearWorkHirePreset();
    sessionStorage.clear();
  });

  it("round-trips macro, leaves, catalog, and source", () => {
    setWorkHirePreset({
      macro: "events-entertainment",
      leafSlugs: ["events-entertainment--dj", "events-entertainment--dj-assistant"],
      source: "bookartist",
      catalog: true,
      radius: 50,
    });
    const peeked = peekWorkHirePreset();
    expect(peeked.macro).toBe("events-entertainment");
    expect(peeked.leafSlugs).toEqual([
      "events-entertainment--dj",
      "events-entertainment--dj-assistant",
    ]);
    expect(peeked.source).toBe("bookartist");
    expect(peeked.catalog).toBe(true);
    expect(peeked.radius).toBe(50);
    expect(peeked.ts).toEqual(expect.any(Number));
  });

  it("survives a clear of window globals via sessionStorage", () => {
    setWorkHirePreset({ macro: "events-entertainment", source: "bookartist", catalog: true });
    delete window.__ondemandPresetMacro;
    delete window.__ondemandPresetLeafSlugs;
    delete window.__ondemandPresetMeta;
    expect(peekWorkHirePreset().macro).toBe("events-entertainment");
  });

  it("clear removes both stores", () => {
    setWorkHirePreset({ macro: "events-entertainment", leafSlugs: ["events-entertainment--dj"] });
    clearWorkHirePreset();
    expect(peekWorkHirePreset()).toBe(null);
  });
});
