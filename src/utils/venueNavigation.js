/**
 * Venues deep-link / history helpers (listing paths + post-login checkout resume).
 */

/** @param {string} [pathname] */
export function parseVenueListingIdFromPath(pathname = "") {
	const m = String(pathname || "").match(/^\/listing\/venue\/([^/-]+)/);
	return m ? m[1] : null;
}

/**
 * @param {string} [pathname]
 * @param {string|number|null|undefined} selectedId
 * @returns {'landing' | 'same' | { openId: string }}
 */
export function venuePopstateAction(pathname, selectedId) {
	const id = parseVenueListingIdFromPath(pathname);
	if (!id) return "landing";
	if (String(selectedId ?? "") === String(id)) return "same";
	return { openId: id };
}

/**
 * @param {string} [search] location.search (with or without `?`)
 * @returns {{ eventDate: string, attendees: number } | null}
 */
export function parseVenueCheckoutResumeQuery(search = "") {
	const raw = String(search || "");
	const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
	if (params.get("checkout") !== "1") return null;
	const eventDate = params.get("eventDate");
	if (!eventDate) return null;
	const attendees = Math.max(1, Number(params.get("attendees")) || 1);
	return { eventDate, attendees };
}
