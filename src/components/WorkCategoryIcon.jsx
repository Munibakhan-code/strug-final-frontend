import React from "react";

// Declared at MODULE scope on purpose — a component defined inside a render body gets a
// new type identity every render and remounts its subtree (that was bug #412).
// A category with no /work-icons/<slug>.webp used to render an EMPTY disc. Walk alias
// candidates (assistant / parent artwork, via workIconCandidates in utils/workCategoryIcon.js)
// before giving up.
export function WorkCategoryIcon({ slug, alt, round = true, fallbacks = [] }) {
  const candidates = [...new Set([slug, ...fallbacks].filter(Boolean))];
  const [idx, setIdx] = React.useState(0);
  const current = candidates[idx] || null;
  if (!current) return null;
  return (
    <img
      src={`/work-icons/${current}.webp`}
      alt={alt || ""}
      loading="lazy"
      decoding="async"
      onError={() => setIdx((i) => i + 1)}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: round ? "50%" : 8 }}
    />
  );
}
