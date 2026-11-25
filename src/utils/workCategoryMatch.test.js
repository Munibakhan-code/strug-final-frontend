import { describe, it, expect } from "vitest";
import { matchWorkLeaves } from "./workCategoryMatch.js";
import { bookArtistLeavesForHint } from "./bookArtistCategories.js";

const cats = [
  {
    slug: "cleaning",
    children: [{ slug: "cleaning--house-cleaner", name: "House Cleaner", work_category_id: 1 }],
  },
  {
    slug: "events-entertainment",
    children: [
      { slug: "events-entertainment--dj", name: "DJ", work_category_id: 10 },
      { slug: "events-entertainment--dj-assistant", name: "DJ Assistant", work_category_id: 11 },
      { slug: "events-entertainment--photographer", name: "Photographer", work_category_id: 12 },
      { slug: "events-entertainment--photography-assistant", name: "Photography Assistant", work_category_id: 13 },
      { slug: "events-entertainment--mc-host", name: "MC / Host", work_category_id: 14 },
    ],
  },
];

describe("matchWorkLeaves", () => {
  it("returns every requested leaf, not only the first", () => {
    const r = matchWorkLeaves(cats, {
      macroSlug: "events-entertainment",
      leafSlugs: ["events-entertainment--dj", "events-entertainment--dj-assistant"],
    });
    expect(r.macro.slug).toBe("events-entertainment");
    expect(r.leaves.map((l) => l.slug)).toEqual([
      "events-entertainment--dj",
      "events-entertainment--dj-assistant",
    ]);
    expect(r.leaf.slug).toBe("events-entertainment--dj");
  });

  it("macro-only browse has no leaves", () => {
    const r = matchWorkLeaves(cats, { macroSlug: "events-entertainment", leafSlugs: [] });
    expect(r.macro.slug).toBe("events-entertainment");
    expect(r.leaves).toEqual([]);
    expect(r.leaf).toBe(null);
  });

  it("matches MC / Host slug tails", () => {
    const r = matchWorkLeaves(cats, {
      macroSlug: "events-entertainment",
      leafSlugs: ["events-entertainment--mc-host", "events-entertainment--mc"],
    });
    expect(r.leaf.slug).toBe("events-entertainment--mc-host");
  });
});

describe("bookArtistLeavesForHint", () => {
  it("maps concierge copy onto talent leaves", () => {
    expect(bookArtistLeavesForHint("Wedding photographer")).toContain("events-entertainment--photographer");
    expect(bookArtistLeavesForHint("Club DJ")).toContain("events-entertainment--dj");
  });
});
