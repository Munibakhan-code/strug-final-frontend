import React from "react";
import { useMap } from "react-leaflet";
import { fitLeafletMap } from "../utils/leafletFit.js";
import { Tooltip } from "./shared.jsx";

// Shared map chrome for the Leaflet maps (rideshare fallback + on-demand). Mirrors the
// recenter / zoom controls and fit-to-content behaviour of the Google preview map.
// These buttons render as an absolute overlay directly on top of the (always-dark) Leaflet
// tile layer, so — like the tiles themselves — they stay hardcoded dark in both themes rather
// than following the light/dark surface tokens; a light control here would clash with the map.

const CTRL_BTN = {
	width: 34,
	height: 34,
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	background: "rgba(13,16,26,0.9)",
	backdropFilter: "blur(8px)",
	border: "1px solid rgba(255,255,255,0.14)",
	borderRadius: 9,
	color: "#e6ebf5",
	cursor: "pointer",
	padding: 0,
	lineHeight: 0,
	boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
};

/** Declarative fit — re-fits whenever the point set changes (no map remount → smooth pan). */
export function FitLeafletBounds({ points, maxZoom = 15 }) {
	const map = useMap();
	const key = (points || []).map((p) => (p ? p.join(",") : "_")).join("|");
	React.useEffect(() => {
		fitLeafletMap(map, points, { maxZoom });
	}, [key]); // eslint-disable-line react-hooks/exhaustive-deps
	return null;
}

/** Recenter + zoom overlay. `mapRef` holds the Leaflet map instance; `onRecenter` re-fits. */
export function LeafletMapControls({ mapRef, onRecenter, bottom = 12 }) {
	return (
		<div style={{ position: "absolute", right: 10, bottom, display: "flex", flexDirection: "column", gap: 7, zIndex: 1000 }}>
			<Tooltip text="Recenter"><button type="button" aria-label="Recenter map" style={CTRL_BTN} onClick={onRecenter}>
				<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
			</button></Tooltip>
			<Tooltip text="Zoom in"><button type="button" aria-label="Zoom in" style={CTRL_BTN} onClick={() => mapRef.current?.zoomIn()}>
				<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
			</button></Tooltip>
			<Tooltip text="Zoom out"><button type="button" aria-label="Zoom out" style={CTRL_BTN} onClick={() => mapRef.current?.zoomOut()}>
				<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14"/></svg>
			</button></Tooltip>
		</div>
	);
}
