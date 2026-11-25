/** Book Artist → Work (events-entertainment) category map. */
export const BOOK_ARTIST_MACRO = "events-entertainment";
export const BOOK_ARTIST_RADIUS_KM = 50;

export const BOOK_ARTIST_CATEGORIES = [
  {
    id: "dj",
    labelKey: "bookartist.categoryDj",
    fallback: "DJ",
    color: "#7c3aed",
    leafSlugs: ["events-entertainment--dj", "events-entertainment--dj-assistant"],
  },
  {
    id: "photographer",
    labelKey: "bookartist.categoryPhotographer",
    fallback: "Photographer",
    color: "#0891b2",
    leafSlugs: [
      "events-entertainment--photographer",
      "events-entertainment--photography-assistant",
      "events-entertainment--photography",
    ],
  },
  {
    id: "videographer",
    labelKey: "bookartist.categoryVideographer",
    fallback: "Videographer",
    color: "#2563eb",
    leafSlugs: [
      "events-entertainment--videographer",
      "events-entertainment--videography",
    ],
  },
  {
    id: "musician",
    labelKey: "bookartist.categoryMusician",
    fallback: "Musician",
    color: "#059669",
    leafSlugs: [
      "events-entertainment--live-musician",
      "events-entertainment--musician",
    ],
  },
  {
    id: "mc",
    labelKey: "bookartist.categoryMc",
    fallback: "MC / Host",
    color: "#db2777",
    leafSlugs: [
      "events-entertainment--mc-host",
      "events-entertainment--mc",
      "events-entertainment--mc-/-host",
    ],
  },
  {
    id: "comedian",
    labelKey: "bookartist.categoryComedian",
    fallback: "Comedian",
    color: "#f59e0b",
    leafSlugs: ["events-entertainment--comedian"],
  },
  {
    id: "magician",
    labelKey: "bookartist.categoryMagician",
    fallback: "Magician",
    color: "#8b5cf6",
    leafSlugs: ["events-entertainment--magician"],
  },
  {
    id: "decorator",
    labelKey: "bookartist.categoryDecorator",
    fallback: "Decorator",
    color: "#ea580c",
    leafSlugs: ["events-entertainment--decorator"],
  },
  {
    id: "browse-all",
    labelKey: "bookartist.browseAllEntertainment",
    fallback: "Browse all entertainment",
    color: "#f43f5e",
    leafSlugs: [],
    macroOnly: true,
  },
];

export function bookArtistLeavesForHint(text) {
  const cat = String(text || "").toLowerCase();
  if (/photo/.test(cat)) return BOOK_ARTIST_CATEGORIES.find((c) => c.id === "photographer")?.leafSlugs || [];
  if (/video/.test(cat)) return BOOK_ARTIST_CATEGORIES.find((c) => c.id === "videographer")?.leafSlugs || [];
  if (/\bdj\b/.test(cat)) return BOOK_ARTIST_CATEGORIES.find((c) => c.id === "dj")?.leafSlugs || [];
  if (/music|musician/.test(cat)) return BOOK_ARTIST_CATEGORIES.find((c) => c.id === "musician")?.leafSlugs || [];
  if (/\bmc\b|host/.test(cat)) return BOOK_ARTIST_CATEGORIES.find((c) => c.id === "mc")?.leafSlugs || [];
  if (/comed/.test(cat)) return BOOK_ARTIST_CATEGORIES.find((c) => c.id === "comedian")?.leafSlugs || [];
  if (/magic/.test(cat)) return BOOK_ARTIST_CATEGORIES.find((c) => c.id === "magician")?.leafSlugs || [];
  if (/decor/.test(cat)) return BOOK_ARTIST_CATEGORIES.find((c) => c.id === "decorator")?.leafSlugs || [];
  return [];
}
