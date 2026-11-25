// #426: macro accent colors/emoji + per-category artwork lookup. Icons live in
// public/work-icons/<slug>.webp (144px, centre-cropped square, ~4kB each). Shared
// between the buyer-side browse/hire flow (OnDemandHire) and the worker-side
// services list (OnDemandWorker) so both read the same artwork and colors instead
// of drifting.

export const MACRO_STYLE = {
  "home-property-maintenance": { color: "#2563eb", icon: "🔧" },
  "cleaning":                  { color: "#06b6d4", icon: "🧽" },
  "landscaping-outdoor":       { color: "#22c55e", icon: "🌿" },
  "security-surveillance":     { color: "#ef4444", icon: "🛡️" },
  "moving-logistics":          { color: "#f59e0b", icon: "📦" },
  "childcare":                 { color: "#ec4899", icon: "🍼" },
  "elder-personal-care":       { color: "#14b8a6", icon: "🧑‍🦽" },
  "pet-care":                  { color: "#a855f7", icon: "🐾" },
  "food-hospitality":          { color: "#f97316", icon: "🍽️" },
  "events-entertainment":      { color: "#d946ef", icon: "🎉" },
  "construction-trades":       { color: "#eab308", icon: "🏗️" },
  "it-tech-onsite":            { color: "#3b82f6", icon: "💻" },
  "health-wellness":           { color: "#10b981", icon: "💪" },
  "beauty-grooming":           { color: "#f472b6", icon: "💇" },
  "retail-merchandising":      { color: "#8b5cf6", icon: "🛍️" },
  "warehousing-labor":         { color: "#64748b", icon: "🏭" },
  "automotive-roadside":       { color: "#0ea5e9", icon: "🚗" },
  "salon-spa":                 { color: "#f43f5e", icon: "💅" },
  // #434. Artwork for driving-school is not drawn yet. Deliberately no icon: the tile and the
  // section heading stay blank rather than showing an emoji stand-in. Drop
  // /work-icons/driving-school.webp in and it renders with no code change.
  "driving-school":            { color: "#7c3aed", icon: "" },
};
export const styleFor = (slug) => MACRO_STYLE[slug] || { color: "#6366f1", icon: "🧩" };

// Leaf slugs are not consistent across environments: prod namespaces them
// ("home-property-maintenance--plumber") while other databases store the bare leaf
// ("plumber"). Normalise to the namespaced form so one set of icon files works everywhere.
export function workIconKey(macroSlug, leafSlug) {
  if (!leafSlug) return macroSlug || null;
  if (!macroSlug) return leafSlug;
  return leafSlug.startsWith(`${macroSlug}--`) ? leafSlug : `${macroSlug}--${leafSlug}`;
}

/** When a leaf has no dedicated webp, try a sibling / parent file so the disc is not blank. */
export const WORK_ICON_ALIASES = {
  "events-entertainment--dj": ["events-entertainment--dj-assistant"],
  "events-entertainment--photographer": ["events-entertainment--photography-assistant"],
  "events-entertainment--photography": ["events-entertainment--photography-assistant"],
  "events-entertainment--mc-host": ["events-entertainment--mc"],
  "events-entertainment--mc-/-host": ["events-entertainment--mc"],
  "events-entertainment--videographer": ["events-entertainment"],
  "events-entertainment--videography": ["events-entertainment"],
  "events-entertainment--live-musician": ["events-entertainment"],
  "events-entertainment--musician": ["events-entertainment"],
  "events-entertainment--comedian": ["events-entertainment--mc"],
  "events-entertainment--magician": ["events-entertainment--decorator"],
};

export function workIconCandidates(macroSlug, leafSlug) {
  const key = workIconKey(macroSlug, leafSlug);
  const aliases = (key && WORK_ICON_ALIASES[key]) || [];
  return [...new Set([key, ...aliases, macroSlug].filter(Boolean))];
}
