/** In-app open for profile "Most viewed" — never window.location.assign (#1583). */

export function openMostViewedFromProfile(item, onNavigate) {
	if (!item || item.id == null || item.id === "") return false;
	const type = String(item.type || "").toLowerCase();
	if (type === "video") {
		window.__videosOpenVideoId = item.id;
		onNavigate?.("videos");
		return true;
	}
	if (type === "townhall") {
		window.__townHallOpenPostId = item.id;
		onNavigate?.("social");
		window.dispatchEvent(new Event("strug:open-notification-target"));
		return true;
	}
	window.__feedOpenPostId = item.id;
	onNavigate?.("feed");
	window.dispatchEvent(new Event("strug:open-notification-target"));
	return true;
}
