/** Shared Jobs page layout tokens (seeker + employer). */
import "./jobsInteractive.css";

export const JOBS_ACCENT = "#2563eb";
export const JOBS_FONT = "'DM Sans', sans-serif";
export const JOBS_HEAD = "'Barlow Condensed', sans-serif";

/** Desktop content max: wide board, not a phone column. */
export const JOBS_INNER_MAX = 1320;

/** Extra right inset so content clears Jobs edge tabs + AI fab. */
export const JOBS_EDGE_RAIL_PAD = 72;

/** Motion + radius scale (4/8px grid). */
export const JOBS_EASE = "180ms ease-out";
export const JOBS_RADIUS = Object.freeze({ sm: 10, md: 12, lg: 14, xl: 16 });

export const jobsSectionLabelStyle = Object.freeze({
	fontSize: 12,
	fontWeight: 600,
	color: "var(--color-text-secondary)",
	letterSpacing: "0.04em",
	textTransform: "uppercase",
	lineHeight: 1.35,
});

export const jobsBlurbStyle = Object.freeze({
	fontFamily: JOBS_FONT,
	fontSize: 13,
	color: "var(--color-text-secondary)",
	margin: 0,
	lineHeight: 1.55,
});

/**
 * Ghost / primary / danger button styles for Jobs Phase-4 panels.
 * Pair with className `jobs-btn` (+ `jobs-btn--primary` / `jobs-btn--danger`).
 */
export function jobsBtnStyle({ primary = false, danger = false, disabled = false, compact = false } = {}) {
	const base = {
		padding: compact ? "6px 10px" : "10px 14px",
		background: "transparent",
		border: "1px solid var(--color-border)",
		borderRadius: JOBS_RADIUS.md,
		color: "var(--color-text-primary)",
		fontFamily: JOBS_FONT,
		fontSize: compact ? 12 : 13,
		fontWeight: 600,
		cursor: disabled ? "not-allowed" : "pointer",
		minHeight: compact ? 32 : 40,
		lineHeight: 1.3,
		opacity: disabled ? 0.55 : 1,
		boxSizing: "border-box",
	};
	if (primary) {
		return {
			...base,
			background: disabled ? "var(--color-border)" : JOBS_ACCENT,
			borderColor: disabled ? "var(--color-border)" : JOBS_ACCENT,
			color: disabled ? "var(--color-text-muted)" : "#fff",
			fontWeight: 700,
		};
	}
	if (danger) {
		return {
			...base,
			color: "#f87171",
			borderColor: "rgba(248,113,113,0.4)",
		};
	}
	return base;
}

export function jobsInputStyle(extra = {}) {
	return {
		background: "var(--color-surface)",
		border: "1px solid var(--color-border)",
		borderRadius: JOBS_RADIUS.sm,
		padding: "10px 12px",
		color: "var(--color-text-primary)",
		fontFamily: JOBS_FONT,
		fontSize: 14,
		lineHeight: 1.4,
		outline: "none",
		boxSizing: "border-box",
		width: "100%",
		...extra,
	};
}

export function jobsPanelCardStyle({ highlighted = false, padding = "16px 18px" } = {}) {
	return {
		background: highlighted
			? "color-mix(in srgb, #2563eb 8%, var(--color-surface-raised))"
			: "var(--color-surface)",
		border: `1px solid ${highlighted ? "color-mix(in srgb, #2563eb 40%, var(--color-border))" : "var(--color-border)"}`,
		borderRadius: JOBS_RADIUS.xl,
		padding,
		boxShadow: highlighted
			? "0 6px 18px color-mix(in srgb, var(--color-shadow) 28%, transparent)"
			: "0 1px 0 color-mix(in srgb, var(--color-shadow) 18%, transparent)",
	};
}

export function jobsEmptyStateStyle() {
	return {
		border: "1px dashed var(--color-border)",
		borderRadius: JOBS_RADIUS.lg,
		padding: "28px 16px",
		textAlign: "center",
		color: "var(--color-text-muted)",
		fontFamily: JOBS_FONT,
		fontSize: 13,
		lineHeight: 1.5,
		background: "var(--color-surface-raised)",
	};
}

/** feedback: "ok" | "err" | "warn" — pair with jobs-feedback / jobs-feedback--* classes. */
export function jobsFeedbackTextStyle() {
	return {
		fontFamily: JOBS_FONT,
		fontSize: 13,
		fontWeight: 600,
		margin: 0,
	};
}

/** Outer page scroller — sidebar + edge-rail padding (no artificial phone width). */
export function jobsPageOuterStyle(isMobile) {
  return {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    paddingTop: isMobile ? 20 : 28,
    paddingBottom: isMobile ? 40 : 56,
    paddingLeft: isMobile ? 16 : 108,
    paddingRight: isMobile ? 16 : JOBS_EDGE_RAIL_PAD,
    color: "var(--color-text-primary)",
  };
}

/** Inner content column — fills available width up to JOBS_INNER_MAX. */
export function jobsPageInnerStyle(isMobile = false) {
  return {
    width: "100%",
    maxWidth: isMobile ? "100%" : JOBS_INNER_MAX,
    margin: "0 auto",
    boxSizing: "border-box",
  };
}

/** Desktop job results grid (1 col mobile / tablet, 2 col wide). */
export function jobsResultsGridStyle(isMobile, isTablet) {
  if (isMobile) {
    return { display: "grid", gap: 12, gridTemplateColumns: "1fr" };
  }
  if (isTablet) {
    return { display: "grid", gap: 14, gridTemplateColumns: "1fr" };
  }
  return {
    display: "grid",
    gap: 14,
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  };
}

/** Sticky filter shell. */
export function jobsFilterShellStyle() {
  return {
    marginBottom: 20,
    position: "sticky",
    top: 0,
    zIndex: 5,
    padding: "16px 18px",
    borderRadius: 18,
    background: "color-mix(in srgb, var(--color-surface) 92%, transparent)",
    border: "1px solid var(--color-border)",
    boxShadow: "0 10px 28px color-mix(in srgb, var(--color-shadow) 45%, transparent)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
  };
}
