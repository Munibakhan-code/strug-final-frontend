/**
 * Jobs Phase 4 — client portfolio helpers.
 */

export const MAX_PORTFOLIO_ITEMS = 24;

export function isPortfolioImage(item) {
  const type = String(item?.media_type || "").toLowerCase();
  if (type === "image") return true;
  return /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(String(item?.url || ""));
}

export function portfolioItemLabel(item) {
  const title = String(item?.title || "").trim();
  if (title) return title;
  const type = String(item?.media_type || "link").toLowerCase();
  if (type === "pdf") return "PDF sample";
  if (type === "image") return "Image";
  if (type === "video") return "Video";
  return "Link";
}

/** Normalize API list (me.portfolio or talent-pool portfolio). */
export function normalizePortfolioList(raw) {
  if (Array.isArray(raw)) return raw.filter((x) => x && x.url);
  if (Array.isArray(raw?.portfolio)) return raw.portfolio.filter((x) => x && x.url);
  if (Array.isArray(raw?.candidate_portfolio_item)) {
    return raw.candidate_portfolio_item.filter((x) => x && x.url);
  }
  return [];
}
