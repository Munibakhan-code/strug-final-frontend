/** Wedding brand accent (falls back when CSS var is unset). */
export const WEDDING_ACCENT = "var(--wedding-accent, #db2877)";
export const WEDDING_ACCENT_SOFT = "var(--wedding-accent-soft, #f472b6)";

/** Local calendar YYYY-MM-DD (client timezone). */
export function localTodayISO() {
	const t = new Date();
	return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/** Resolve locale for wedding date formatting (i18n → navigator → en). */
export function weddingLocale(lang) {
	const raw = String(lang || (typeof navigator !== "undefined" ? navigator.language : "") || "en").trim();
	return raw || "en";
}

/** Format a Date with the active locale (not hard-coded en-US). */
export function formatWeddingDate(date, options, lang) {
	if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return "";
	try {
		return date.toLocaleDateString(weddingLocale(lang), options);
	} catch {
		return date.toLocaleDateString("en", options);
	}
}

/**
 * Boutique items that support in-store try-on / appointment requests
 * (dresses, rings, accessories — not stationery/decor).
 */
export function weddingItemAllowsTryOn(category) {
	const c = String(category || "").toLowerCase();
	if (!c) return false;
	return c.includes("dress") || c.includes("ring") || c.includes("accessor");
}

/** Prefer listing avg_rating/review_count columns; fall back to attributes. */
export function resolveVendorRating(listing, attrs = {}) {
	const colCount = listing?.review_count != null ? Number(listing.review_count) : NaN;
	if (Number.isFinite(colCount) && colCount > 0) {
		const avg = listing?.avg_rating != null ? Number(listing.avg_rating) : NaN;
		return {
			rating: Number.isFinite(avg) ? avg : null,
			reviews: colCount,
		};
	}
	const avg = attrs.rating != null ? Number(attrs.rating) : NaN;
	const reviews =
		attrs.reviews != null
			? Number(attrs.reviews)
			: attrs.review_count != null
				? Number(attrs.review_count)
				: NaN;
	return {
		rating: Number.isFinite(avg) ? avg : null,
		reviews: Number.isFinite(reviews) ? reviews : null,
	};
}

/** Placeholder thumb when a listing has no image (theme-neutral gradient). */
export function weddingPlaceholderThumb() {
	return "linear-gradient(135deg, var(--color-surface-raised, #1e1b4b), color-mix(in srgb, var(--wedding-accent, #db2877) 55%, #7c3aed), var(--color-border, #c4b5fd))";
}

/** Page inset: mobile / tablet / desktop (desktop leaves room for left rail). */
export function weddingPageInset(isMobile, isTablet = false) {
	return {
		paddingLeft: isMobile ? 14 : isTablet ? 28 : 108,
		paddingRight: isMobile ? 14 : isTablet ? 28 : 48,
		boxSizing: "border-box",
		width: "100%",
	};
}

/** Bottom padding so content clears mobile bottom nav / safe area. */
export function weddingPageBottom(isMobile) {
	return isMobile ? 96 : 48;
}

/**
 * Auto-fill card grid that never overflows narrow phones
 * (minmax(min(100%, Npx), 1fr) collapses to one column under N).
 */
export function weddingCardGrid(minPx = 260, gap = 16) {
	return {
		display: "grid",
		gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minPx}px), 1fr))`,
		gap,
		width: "100%",
	};
}

/** Horizontally scrollable category row — left-aligned so first chips aren’t clipped. */
export function weddingCategoryRow(isMobile) {
	return {
		display: "flex",
		gap: isMobile ? 12 : 20,
		marginBottom: isMobile ? 20 : 28,
		flexWrap: "nowrap",
		overflowX: "auto",
		paddingBottom: 6,
		WebkitOverflowScrolling: "touch",
		scrollbarWidth: "none",
		msOverflowStyle: "none",
		justifyContent: isMobile ? "flex-start" : "center",
		width: "100%",
	};
}

/** Centered content shell used across wedding views. */
export function weddingContentShell(maxWidth = 1100) {
	return {
		maxWidth,
		margin: "0 auto",
		width: "100%",
		minWidth: 0,
		boxSizing: "border-box",
	};
}

/** Inclusive list of YYYY-MM-DD from start through end (local noon stepping). */
export function eachDateISOInclusive(startStr, endStr) {
	if (!startStr) return [];
	const end = endStr && endStr >= startStr ? endStr : startStr;
	const out = [];
	const cur = new Date(`${startStr}T12:00:00`);
	const last = new Date(`${end}T12:00:00`);
	if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime())) return [];
	for (let d = new Date(cur); d <= last; d.setDate(d.getDate() + 1)) {
		out.push(
			`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
		);
	}
	return out;
}

/** True if any day in [start, end] inclusive is in the unavailable set. */
export function rangeOverlapsUnavailable(startStr, endStr, unavailable) {
	if (!startStr || !unavailable?.size) return false;
	return eachDateISOInclusive(startStr, endStr || startStr).some((d) => unavailable.has(d));
}

export function expandBookedToUnavailableSet(data) {
	const set = new Set();
	(data?.booked || []).forEach((b) => {
		if (!b.start_date) return;
		const start = String(b.start_date).slice(0, 10);
		const end = b.end_date ? String(b.end_date).slice(0, 10) : start;
		eachDateISOInclusive(start, end).forEach((d) => set.add(d));
	});
	(data?.blocked || []).forEach((b) => {
		if (b.is_blocked && b.date) set.add(String(b.date).slice(0, 10));
	});
	return set;
}

/** Inclusive day count for multi-day wedding packages (1 when no end / same day). */
export function inclusiveEventDays(startStr, endStr) {
	const days = eachDateISOInclusive(startStr, endStr || startStr).length;
	return Math.max(1, days);
}
