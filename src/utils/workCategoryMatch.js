function leafMatchesSlug(child, slug) {
  if (!child || !slug) return false;
  if (child.slug === slug) return true;
  const tail = String(slug).split("--").pop();
  return !!tail && child.slug?.endsWith(`--${tail}`);
}

function fuzzyLeaf(child, needle) {
  if (!needle) return false;
  const n = String(child.name || "").toLowerCase();
  const s = String(child.slug || "").toLowerCase();
  const compact = needle.replace(/\s+/g, "-");
  return n.includes(needle) || s.includes(compact);
}

/**
 * Resolve Work macro + ALL matching leaves from a Book Artist / concierge preset.
 * Unlike first-hit matching, DJ includes DJ Assistant when both slugs are requested.
 */
export function matchWorkLeaves(macros, { macroSlug, leafSlugs } = {}) {
  const list = Array.isArray(macros) ? macros : [];
  const slugList = (Array.isArray(leafSlugs) ? leafSlugs : []).filter(Boolean);
  let foundMacro = macroSlug ? list.find((c) => c.slug === macroSlug) || null : null;
  const matched = [];
  const seen = new Set();

  const push = (leaf, macro) => {
    const id = leaf?.work_category_id ?? leaf?.slug;
    if (id == null || seen.has(id)) return;
    seen.add(id);
    matched.push(leaf);
    if (!foundMacro) foundMacro = macro;
  };

  if (slugList.length) {
    const ordered = foundMacro ? [foundMacro, ...list.filter((m) => m !== foundMacro)] : list;
    for (const slug of slugList) {
      for (const m of ordered) {
        const hit = (m.children || []).find((c) => leafMatchesSlug(c, slug));
        if (hit) {
          push(hit, m);
          if (foundMacro && m !== foundMacro && foundMacro.slug !== m.slug) {
            // Keep the preset macro when it already matched; extra hits stay on that tree.
          }
          break;
        }
      }
    }
    if (!matched.length) {
      const needle = String(slugList[0] || "").split("--").pop()?.replace(/-/g, " ");
      for (const m of ordered) {
        const fuzzy = (m.children || []).find((c) => fuzzyLeaf(c, needle));
        if (fuzzy) {
          push(fuzzy, m);
          break;
        }
      }
    }
  }

  return {
    macro: foundMacro,
    leaves: matched,
    leaf: matched[0] || null,
  };
}
