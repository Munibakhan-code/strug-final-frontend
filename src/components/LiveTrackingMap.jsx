import React from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import SmoothMarker from "./SmoothMarker.jsx";
import { Tooltip } from "react-leaflet";
import { LeafletMapControls } from "./LeafletMapControls.jsx";
import { fitLeafletMap } from "../utils/leafletFit.js";
import { fetchRouteMeta } from "../utils/route.js";
import { avatarDivIcon, initialOf } from "../utils/mapAvatar.js";
import { haversineKm, etaMinutesFromDistanceKm } from "../utils/geo.js";

// A dark live-tracking map: a smoothly-moving "live" marker (worker / driver)
// heading toward a fixed "destination" marker, with the road route drawn between
// them and a live ETA badge. Reusable across On-Demand work and rideshare.
//   live        { lat, lng } | null  — the moving entity (updates as GPS pings arrive)
//   destination { lat, lng } | null  — the fixed target (the hirer / drop-off)
//   accent      colour of the live marker + route
//   height      map height in px
//   onEta       optional (minutes|null) => void — bubbles the live ETA to the parent sheet
//   liveAvatar  optional worker photo URL — shown (non-rotating) on the moving marker
//   liveName    optional worker name — hover tooltip on the moving marker

const destDot = (color) =>
	L.divIcon({
		className: "",
		// A solid dot with a pulsing ring behind it (see the strugPulse keyframe in render).
		html: `<div style="position:relative;width:0;height:0">
			<span style="position:absolute;left:-9px;top:-9px;width:18px;height:18px;border-radius:50%;background:${color};animation:strugPulse 1.6s ease-out infinite"></span>
			<span style="position:absolute;left:-8px;top:-8px;width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 12px ${color}aa"></span>
		</div>`,
		iconSize: [0, 0],
		iconAnchor: [0, 0],
	});

// Directional live marker — a disc with an arrow that SmoothMarker rotates toward travel.
const liveArrow = (color) =>
	L.divIcon({
		className: "",
		html: `<div style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 0 0 6px ${color}33,0 1px 6px rgba(0,0,0,.55);transition:transform .9s linear">
			<svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M12 3l7 18-7-4-7 4z"/></svg>
		</div>`,
		iconSize: [26, 26],
		iconAnchor: [13, 13],
	});

// Keeps both markers (and the route) in view as the live point moves (no remount → smooth pan).
function FitPoints({ points }) {
	const map = useMap();
	const key = points.map((p) => (p ? p.join(",") : "_")).join("|");
	React.useEffect(() => {
		const pts = points.filter(Boolean);
		if (!pts.length) return;
		if (pts.length === 1) map.setView(pts[0], 14, { animate: true });
		else map.fitBounds(L.latLngBounds(pts), { padding: [44, 44], maxZoom: 15, animate: true });
	}, [key]); // eslint-disable-line react-hooks/exhaustive-deps
	return null;
}

export default function LiveTrackingMap({ live, destination, accent = "#2563eb", height = 220, onEta, liveAvatar, liveName }) {
	const livePt = live && live.lat != null ? [live.lat, live.lng] : null;
	const destPt = destination && destination.lat != null ? [destination.lat, destination.lng] : null;
	const center = livePt || destPt;

	const [route, setRoute] = React.useState([]);
	const [etaMin, setEtaMin] = React.useState(null);
	const lastRoutePt = React.useRef(null);
	const mapRef = React.useRef(null);

	// Recompute the road route + ETA as the live point moves (throttled to ~80m of travel).
	React.useEffect(() => {
		if (!livePt || !destPt) { setRoute([]); setEtaMin(null); return undefined; }
		const haversineMin = etaMinutesFromDistanceKm(haversineKm(livePt[0], livePt[1], destPt[0], destPt[1]));
		const prev = lastRoutePt.current;
		const movedEnough = !prev || Math.abs(livePt[0] - prev[0]) >= 0.0008 || Math.abs(livePt[1] - prev[1]) >= 0.0008;
		if (!movedEnough && route.length) return undefined;
		lastRoutePt.current = livePt;
		// Straight-line fallback ETA immediately; refined by Directions if the SDK is loaded.
		setEtaMin((cur) => cur ?? haversineMin);
		let cancelled = false;
		fetchRouteMeta(livePt, destPt, (meta) => {
			if (cancelled) return;
			if (meta.path?.length > 1) setRoute(meta.path);
			setEtaMin(meta.durationMin ?? haversineMin);
		});
		if (!window.google?.maps?.DirectionsService) setEtaMin(haversineMin);
		return () => { cancelled = true; };
	}, [livePt && livePt[0], livePt && livePt[1], destPt && destPt[0], destPt && destPt[1]]); // eslint-disable-line react-hooks/exhaustive-deps

	React.useEffect(() => { onEta?.(etaMin); }, [etaMin]); // eslint-disable-line react-hooks/exhaustive-deps

	if (!center) return null;

	// The map canvas (dark CartoDB tiles) and every overlay directly on top of it — this
	// container's border, the markers/route, and the ETA badge — stay hardcoded dark in both
	// themes: the tiles never retheme, so overlays on top of them must stay dark for legibility
	// (same reasoning as Quotes.jsx's QuoteAreaMap). LeafletMapControls below is the same story.
	return (
		<div style={{ position: "relative", width: "100%", height, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", marginTop: 14 }}>
			<style>{`@keyframes strugPulse{0%{transform:scale(1);opacity:.55}100%{transform:scale(3.4);opacity:0}}`}</style>
			<MapContainer ref={mapRef} center={center} zoom={14} style={{ width: "100%", height: "100%" }} zoomControl={false} attributionControl={false}>
				<TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
				{/* Cased route: dark under-stroke for depth, then the accent line on top. */}
				{route.length > 1 && <Polyline positions={route} pathOptions={{ color: "#0b1220", weight: 8, opacity: 0.55 }} />}
				{route.length > 1 && <Polyline positions={route} pathOptions={{ color: accent, weight: 4.5, opacity: 0.95 }} />}
				{destPt && <Marker position={destPt} icon={destDot("#059669")} />}
				{livePt && (
					// A matched worker shows their photo (upright, no rotation); otherwise a
					// directional arrow that rotates toward travel.
					(liveAvatar || liveName)
						? <SmoothMarker position={livePt} icon={avatarDivIcon(liveAvatar, accent, 40, { initial: initialOf(liveName) })} durationMs={900}>
							{liveName ? <Tooltip direction="top" offset={[0, -20]}>{liveName}</Tooltip> : null}
						</SmoothMarker>
						: <SmoothMarker position={livePt} icon={liveArrow(accent)} rotate durationMs={900} />
				)}
				<FitPoints points={[livePt, destPt]} />
			</MapContainer>
			<LeafletMapControls mapRef={mapRef} onRecenter={() => fitLeafletMap(mapRef.current, [livePt, destPt])} />
			{livePt && etaMin != null && (
				<div style={{ position: "absolute", top: 10, left: 10, background: "rgba(10,10,20,0.85)", backdropFilter: "blur(8px)", border: `1px solid ${accent}55`, borderRadius: 20, padding: "5px 12px", zIndex: 1000, display: "flex", alignItems: "center", gap: 6 }}>
					<span style={{ width: 7, height: 7, borderRadius: "50%", background: accent, boxShadow: `0 0 8px ${accent}` }} />
					<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#fff" }}>{etaMin} min away</span>
				</div>
			)}
		</div>
	);
}
