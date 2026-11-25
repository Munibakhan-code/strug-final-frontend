import { useBreadcrumbSubTrail } from "../contexts/BreadcrumbContext.js";

// `trail` is the shell-owned base (Home > current vertical); the current
// page's own sub-navigation (Account's tab, a seller dashboard's tab, ...) is
// read from BreadcrumbContext and appended automatically, so callers of
// <Breadcrumbs> never need to know whether the current page has gone deeper.
// `accent` (per-vertical hue) is intentionally no longer used for the current
// crumb — it clashed with the theme; the trail is now monochrome. Callers may
// still pass it harmlessly.
export default function Breadcrumbs({ trail, height = 36, style }) {
  const subTrail = useBreadcrumbSubTrail();
  const segments = [...trail, ...subTrail];
  if (segments.length < 2) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        height,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 16px",
        // Blend into the page instead of reading as a separate lighter bar.
        background: "transparent",
        overflowX: "auto",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {i > 0 && (
              <span style={{ color: "var(--color-text-muted)", fontSize: 12 }} aria-hidden="true">
                /
              </span>
            )}
            {isLast || !seg.onClick ? (
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12.5,
                  fontWeight: isLast ? 600 : 500,
                  // Monochrome hierarchy, theme-aware — hardcoded white was invisible on light theme.
                  color: isLast ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                }}
                aria-current={isLast ? "page" : undefined}
              >
                {seg.label}
              </span>
            ) : (
              <button
                onClick={seg.onClick}
                aria-label={seg.ariaLabel}
                title={seg.title}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-primary)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-secondary)")}
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: "var(--color-text-secondary)",
                  background: "none",
                  border: "none",
                  padding: 0,
                  ...(seg.iconOnly ? {
                    width: 44,
                    height: 44,
                    display: "grid",
                    placeItems: "center",
                    margin: "0 -8px",
                    borderRadius: 12,
                  } : {}),
                  cursor: "pointer",
                  transition: "color 0.15s",
                }}
              >
                {seg.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
