/** Verticals that mount the shared right-edge drawer (Videos keeps its own drawer).
 * Jobs uses `JobsEdgeDrawer` (includes Résumé) — do not also mount the shared drawer there. */
export const EDGE_DRAWER_VERTICALS = new Set([
	"home",
	"tempstay",
	"food",
	"shop",
	"rideshare",
	"venues",
	"social",
	"feed",
]);

/** @returns {import("./verticalEdgeDrawerConfig.js").EdgeDrawerTab[]} */
function socialEdgeTabs() {
	return [
		{ id: "vault", labelKey: "edgeDrawer.social.vault", titleKey: "edgeDrawer.social.vaultTitle", auth: true },
		{ id: "closeFriends", labelKey: "edgeDrawer.social.closeFriends", titleKey: "edgeDrawer.social.closeFriendsTitle", auth: true },
		{ id: "bookmarks", labelKey: "edgeDrawer.social.bookmarks", titleKey: "edgeDrawer.social.bookmarksTitle", auth: true },
	];
}

/** @param {string} activeNav @param {{ is404?: boolean }} ctx */
export function shouldShowVerticalEdgeDrawer(activeNav, { is404 = false } = {}) {
	if (is404) return false;
	return EDGE_DRAWER_VERTICALS.has(activeNav);
}

/** Strug AI edge fab: top 50%, translateY(calc(-50% + 20px)), height 80 (App.jsx). */
export const AI_FAB_CENTER_OFFSET_PX = 20;
export const AI_FAB_HEIGHT_PX = 80;
export const EDGE_TAB_CLEARANCE_PX = 16;
/** Must match SlideOutEdgeTab `height` so tabs don't grow into each other. */
export const EDGE_TAB_HEIGHT_DESKTOP_PX = 86;
export const EDGE_TAB_HEIGHT_MOBILE_PX = 76;
export const EDGE_TAB_GAP_DESKTOP_PX = 16;
export const EDGE_TAB_GAP_MOBILE_PX = 10;
/** Non-label chrome inside SlideOutEdgeTab: padding + border + gap + arrow icon height — must match
 * `labelChromePx` in SlideOutPanel.jsx exactly, or the label's maxHeight there clips the last
 * letter(s) of longer words (bug: "DASHBOARD" clipped to "DASHBOARC"). */
function edgeTabLabelChromePx(isMobile) {
	return isMobile ? 8 * 2 + 2 + 4 + 12 : 10 * 2 + 2 + 6 + 14;
}
/** Fallback per-character advance (no canvas, e.g. jsdom tests) — rough average glyph width for
 * uppercase DM Sans Bold plus the 0.06em letter-spacing gap. */
const EDGE_TAB_CHAR_ADVANCE_EM = 0.74;

let labelMeasureCanvas = null;
/** vertical-rl + text-orientation:mixed rotates each Latin glyph 90°, so the label's block-direction
 * (vertical) extent equals its normal horizontal advance width — measure that directly instead of
 * guessing a fixed per-character size, so the tab is sized to the word, not to a worst-case estimate. */
function measureLabelAdvancePx(label, fontSize) {
	if (!label || typeof document === "undefined") return null;
	try {
		labelMeasureCanvas = labelMeasureCanvas || document.createElement("canvas");
		const ctx = labelMeasureCanvas.getContext("2d");
		if (!ctx || typeof ctx.measureText !== "function") return null;
		ctx.font = `700 ${fontSize}px 'DM Sans', sans-serif`;
		const width = ctx.measureText(label).width;
		if (!width) return null;
		const letterSpacingPx = fontSize * 0.06 * Math.max(0, label.length - 1);
		// Small safety margin: canvas text may measure against a fallback font if 'DM Sans' hasn't
		// finished loading into this context yet, which can under-measure vs. the real label.
		return width + letterSpacingPx + 4;
	} catch {
		return null;
	}
}

/** CSS transform for the Strug AI fab (keep +offset on hover/press too). */
export function aiFabTranslateY(scale = 1) {
	const base = `translateY(calc(-50% + ${AI_FAB_CENTER_OFFSET_PX}px))`;
	if (scale === 1) return base;
	return `${base} scale(${scale})`;
}

/**
 * @param {{ isMobile?: boolean, labels?: string[], measuredLabelPx?: number|null }} [opts]
 * `measuredLabelPx` — an actual DOM-measured advance width (see VerticalEdgeDrawer's hidden
 * measurer) — wins when present; it's exact where the canvas/estimate below can be off if the
 * web font hasn't loaded into the canvas context yet (bug: "DASHBOARD" clipped to "DASHBOAF").
 * `labels` is the pre-layout fallback so tabs aren't clipped for the one frame before that
 * measurement lands.
 */
export function edgeTabHeightPx(opts = {}) {
	const isMobile = Boolean(opts.isMobile);
	const minHeight = isMobile ? EDGE_TAB_HEIGHT_MOBILE_PX : EDGE_TAB_HEIGHT_DESKTOP_PX;
	const chrome = edgeTabLabelChromePx(isMobile);
	if (opts.measuredLabelPx != null) {
		return Math.max(minHeight, Math.ceil(opts.measuredLabelPx) + chrome);
	}
	const labels = opts.labels || [];
	if (!labels.length) return minHeight;
	const fontSize = isMobile ? 10 : 11;
	const longestAdvance = Math.max(
		0,
		...labels.map((label) => measureLabelAdvancePx(label, fontSize) ?? (label || "").length * fontSize * EDGE_TAB_CHAR_ADVANCE_EM),
	);
	const needed = Math.ceil(longestAdvance) + chrome;
	return Math.max(minHeight, needed);
}

/** @param {number} px offset from vertical centre (negative = above centre) */
function formatStackTop(px) {
	if (px >= 0) return `calc(50% + ${px}px)`;
	return `calc(50% - ${Math.abs(px)}px)`;
}

/**
 * Stack edge tabs above/below the AI fab dead zone with even spacing.
 * @param {number} index 0-based tab index
 * @param {number} total tab count
 * @param {{ isMobile?: boolean, labels?: string[] }} [opts]
 */
export function stackEdgeTabTop(index, total, opts = {}) {
	const isMobile = Boolean(opts.isMobile);
	const tabHeight = edgeTabHeightPx({ isMobile, labels: opts.labels });
	const step = tabHeight + (isMobile ? EDGE_TAB_GAP_MOBILE_PX : EDGE_TAB_GAP_DESKTOP_PX);
	const deadTop = AI_FAB_CENTER_OFFSET_PX - AI_FAB_HEIGHT_PX / 2 - EDGE_TAB_CLEARANCE_PX;
	const deadBottom = AI_FAB_CENTER_OFFSET_PX + AI_FAB_HEIGHT_PX / 2 + EDGE_TAB_CLEARANCE_PX;
	const belowStart = deadBottom + 8;
	const aboveBottom = deadTop - 8;

	if (total <= 0) return formatStackTop(80);
	if (total === 1) return formatStackTop(belowStart);

	const belowCount = Math.floor(total / 2);
	const aboveCount = total - belowCount;

	if (index < aboveCount) {
		const slotFromInner = aboveCount - 1 - index;
		const topPx = aboveBottom - tabHeight - slotFromInner * step;
		return formatStackTop(topPx);
	}

	const belowIndex = index - aboveCount;
	const topPx = belowStart + belowIndex * step;
	return formatStackTop(topPx);
}

/**
 * @typedef {{ id: string, labelKey: string, titleKey?: string, auth?: boolean }} EdgeDrawerTab
 * @param {string} activeNav
 * @returns {EdgeDrawerTab[]}
 */
export function getEdgeDrawerTabs(activeNav) {
	switch (activeNav) {
		case "home":
			return [
				{ id: "dashboard", labelKey: "edgeDrawer.home.dashboard", titleKey: "edgeDrawer.home.dashboardTitle" },
				{ id: "provider", labelKey: "edgeDrawer.home.provider", titleKey: "edgeDrawer.home.providerTitle" },
			];
		case "tempstay":
			return [
				{ id: "trips", labelKey: "edgeDrawer.tempstay.trips", auth: true },
				{ id: "saved", labelKey: "edgeDrawer.tempstay.saved", auth: true },
				{ id: "recent", labelKey: "edgeDrawer.tempstay.recent" },
			];
		case "food":
			return [
				{ id: "orders", labelKey: "edgeDrawer.food.orders", auth: true },
				{ id: "favourites", labelKey: "edgeDrawer.food.favourites", auth: true },
				{ id: "active", labelKey: "edgeDrawer.food.active", auth: true },
			];
		case "shop":
			return [
				{ id: "orders", labelKey: "edgeDrawer.shop.orders", auth: true },
				{ id: "wishlist", labelKey: "edgeDrawer.shop.wishlist", auth: true },
			];
		case "jobs":
			// Owned by JobsEdgeDrawer (applications / saved / alerts / résumé).
			return [];
		case "rideshare":
			return [
				{ id: "trips", labelKey: "edgeDrawer.rideshare.trips", auth: true },
				{ id: "places", labelKey: "edgeDrawer.rideshare.places", auth: true },
				{ id: "active", labelKey: "edgeDrawer.rideshare.active", auth: true },
			];
		case "venues":
			return [
				{ id: "bookings", labelKey: "edgeDrawer.venues.bookings", auth: true },
				{ id: "saved", labelKey: "edgeDrawer.venues.saved", auth: true },
			];
		case "social":
		case "feed":
			return socialEdgeTabs();
		default:
			return [];
	}
}
