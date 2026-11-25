import L from "leaflet";

/** Fit a Leaflet map to a set of [lat,lng] points (single point → recentre at `maxZoom`). */
export function fitLeafletMap(map, points, { maxZoom = 15, padding = [48, 48] } = {}) {
	const pts = (points || []).filter(Boolean);
	if (!map || !pts.length) return;
	if (pts.length === 1) map.setView(pts[0], maxZoom - 1, { animate: true });
	else map.fitBounds(L.latLngBounds(pts), { padding, maxZoom, animate: true });
}
