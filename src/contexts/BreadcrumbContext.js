import { createContext, useContext, useEffect } from "react";

// The shell (App.jsx) owns the base trail (Home > current vertical) since only
// it knows activeNav. Deep pages that have their own internal sub-navigation
// (Account's settings tabs, a seller dashboard's tab bar, ...) extend that
// trail by calling usePageBreadcrumb() with their own segments — the shell's
// <Breadcrumbs> reads them back via useBreadcrumbSubTrail() and appends them.
// Provider lives in BreadcrumbProvider.jsx (kept out of this file so it stays
// JSX-free, matching SplitModeContext.js).
export const BreadcrumbContext = createContext(null);

// Pages call this with an array of { label, onClick? } segments to extend the
// shell's base trail. Pass a memoized array (useMemo, keyed on whatever local
// view-state drives it, e.g. activeTab) — an unmemoized literal still works,
// it just re-registers every render. Segments are cleared on unmount so
// leaving the page doesn't leak a stale trail onto whatever's next.
export function usePageBreadcrumb(segments) {
  const ctx = useContext(BreadcrumbContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setSubTrail(segments || []);
    return () => ctx.setSubTrail([]);
  }, [ctx, segments]);
}

export function useBreadcrumbSubTrail() {
  const ctx = useContext(BreadcrumbContext);
  return ctx ? ctx.subTrail : [];
}
