import i18n from "../i18n/index.js";

/**
 * Accessible name for a surface carrying an unseen count — the desktop edge tab and the phone's
 * Explore sheet both use it, so a badge says the same thing to a screen reader as it does to the
 * eye. Kept out of videosDrawerBadges.js: that module is pure arithmetic and its tests run without
 * the i18n runtime.
 */
export function tabUnseenLabel(label, count) {
	const n = Number(count);
	if (!Number.isFinite(n) || n <= 0) return label;
	return i18n.t("videos.edgeDrawer.tabUnseenLabel", { label, count: n });
}
