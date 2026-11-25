import React from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchRouteMeta } from "../utils/route.js";
import { haversineKm, etaMinutesFromDistanceKm } from "../utils/geo.js";

// A static two-point route preview: origin pin, destination pin, the road route between them, and
// a distance/duration badge. This is the booking-time counterpart to LiveTrackingMap (which tracks
// a *moving* entity). Courier prices the real route now, so the route the user is being charged for
// should be the one they can see.
//
//   origin       { lat, lng } | null
//   destination  { lat, lng } | null
//   accent       route + origin colour
//   height       map height in px
//   onMeta       optional ({ distanceKm, durationMin }) => void — bubbles the resolved route up
//   nearbyPoints optional [{ lat, lng }] — small dots for nearby available drivers/couriers,
//                rendered but never fitted into bounds (route + endpoints stay the frame)

const pin = (color) =>
	L.divIcon({
		className: "",
		html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 10px ${color}aa"></div>`,
		iconSize: [14, 14],
		iconAnchor: [7, 7],
	});

const nearbyDot = L.divIcon({
	className: "",
	html: `<div style="width:10px;height:10px;border-radius:50%;background:#f59e0b;border:2px solid #fff;box-shadow:0 0 8px #f59e0b99"></div>`,
	iconSize: [10, 10],
	iconAnchor: [5, 5],
});

// Leaflet measures its container once, at mount. Inside a tab / collapsed panel / a mobile layout
// that shifts after mount, that measurement is stale and the map renders as grey tiles with the
// markers offset. Re-measuring on resize (and once on mount, after layout settles) is the standard
// guard — the app had none anywhere.
function FitRoute({ points }) {
	const map = useMap();
	const key = points.map((p) => (p ? p.join(",") : "_")).join("|");

	React.useEffect(() => {
		const invalidate = () => map.invalidateSize();
		const raf = requestAnimationFrame(invalidate);
		window.addEventListener("resize", invalidate);
		return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", invalidate); };
	}, [map]);

	React.useEffect(() => {
		const pts = points.filter(Boolean);
		if (!pts.length) return;
		map.invalidateSize();
		if (pts.length === 1) map.setView(pts[0], 14, { animate: true });
		else map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15, animate: true });
	}, [key]); // eslint-disable-line react-hooks/exhaustive-deps

	return null;
}

export default function RoutePreviewMap({ origin, destination, accent = "#2563eb", height = 200, onMeta, nearbyPoints = [], nearbyLabel = null }) {
	const from = origin && origin.lat != null ? [origin.lat, origin.lng] : null;
	const to = destination && destination.lat != null ? [destination.lat, destination.lng] : null;

	const [route, setRoute] = React.useState([]);
	const [meta, setMeta] = React.useState(null);

	React.useEffect(() => {
		if (!from || !to) { setRoute([]); setMeta(null); return undefined; }

		// Straight-line numbers immediately so the badge never sits empty; Directions refines them
		// as soon as the (deferred) Maps SDK is up.
		const straightKm = haversineKm(from[0], from[1], to[0], to[1]);
		setMeta({ distanceKm: straightKm, durationMin: etaMinutesFromDistanceKm(straightKm), exact: false });

		let cancelled = false;
		fetchRouteMeta(from, to, (m) => {
			if (cancelled) return;
			if (m.path?.length > 1) setRoute(m.path);
			setMeta({
				distanceKm: m.distanceKm ?? straightKm,
				durationMin: m.durationMin ?? etaMinutesFromDistanceKm(straightKm),
				exact: m.distanceKm != null,
			});
		});
		return () => { cancelled = true; };
	}, [from && from[0], from && from[1], to && to[0], to && to[1]]); // eslint-disable-line react-hooks/exhaustive-deps

	React.useEffect(() => {
		if (meta) onMeta?.({ distanceKm: meta.distanceKm, durationMin: meta.durationMin });
	}, [meta?.distanceKm, meta?.durationMin]); // eslint-disable-line react-hooks/exhaustive-deps

	const center = from || to;
	if (!center) return null;

	// The map canvas (dark CartoDB tiles) and every overlay directly on top of it — this
	// container's border, the pins/route, and the distance/nearby badges below — stay hardcoded
	// dark in both themes: the tiles never retheme, so overlays on top of them must stay dark
	// for legibility (same reasoning as Quotes.jsx's QuoteAreaMap).
	return (
		<div style={{ position: "relative", width: "100%", height, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
			<MapContainer center={center} zoom={13} style={{ width: "100%", height: "100%" }} zoomControl={false} attributionControl={false} scrollWheelZoom={false}>
				<TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
				{/* Distinct keys matter: without them React reconciles the fallback and the real route as
				    the SAME element, and Leaflet's setStyle only applies the keys it is handed — so the
				    dashed stroke of the placeholder survived onto the real road route. Keying them apart
				    mounts a clean layer instead of restyling the old one. */}
				{route.length > 1
					? <Polyline key="route" positions={route} pathOptions={{ color: accent, weight: 4, opacity: 0.9, dashArray: null }} />
					: (from && to) && <Polyline key="straight" positions={[from, to]} pathOptions={{ color: accent, weight: 3, opacity: 0.5, dashArray: "6 8" }} />}
				{from && <Marker position={from} icon={pin(accent)} />}
				{to && <Marker position={to} icon={pin("#059669")} />}
				{nearbyPoints.map((p) => (
					<Marker key={p.id ?? `${p.lat},${p.lng}`} position={[p.lat, p.lng]} icon={nearbyDot} />
				))}
				<FitRoute points={[from, to]} />
			</MapContainer>
			{meta && from && to && (
				<div style={{ position: "absolute", top: 10, left: 10, background: "rgba(10,10,20,0.85)", backdropFilter: "blur(8px)", border: `1px solid ${accent}55`, borderRadius: 20, padding: "5px 12px", zIndex: 1000, display: "flex", alignItems: "center", gap: 8 }}>
					<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#fff" }}>{meta.distanceKm.toFixed(1)} km</span>
					<span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.35)" }} />
					<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>{meta.durationMin} min</span>
				</div>
			)}
			{nearbyLabel && (
				<div style={{ position: "absolute", top: 10, right: 10, background: "rgba(10,10,20,0.85)", backdropFilter: "blur(8px)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 20, padding: "5px 12px", zIndex: 1000 }}>
					<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: nearbyPoints.length > 0 ? "#fbbf24" : "rgba(255,255,255,0.55)" }}>{nearbyLabel}</span>
				</div>
			)}
		</div>
	);
}
