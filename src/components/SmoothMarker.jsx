import { useLayoutEffect, useRef } from "react";
import { Marker } from "react-leaflet";

// A Leaflet marker that *glides* between GPS fixes instead of teleporting, and
// (optionally) rotates its icon toward the direction of travel. This is the main
// thing that makes the Strug live maps feel alive — a driver/worker dot eases
// from one ping to the next over ~1s rather than jumping every few seconds.
//
//   position   [lat, lng]   latest fix (component animates from the previous one)
//   icon       L.divIcon    the marker icon; its single root element is what gets rotated
//   durationMs number       glide duration between fixes (default 1000)
//   rotate     bool         rotate the icon's root element toward the heading
export default function SmoothMarker({ position, icon, durationMs = 1000, rotate = false, children }) {
	const markerRef = useRef(null);
	const rafRef = useRef(0);
	const currentRef = useRef(position); // where the marker actually is right now
	const headingRef = useRef(0);

	// Layout effect (not effect): runs after react-leaflet's own setLatLng but
	// before paint, so we reset to the glide start and never flash at the target.
	useLayoutEffect(() => {
		const marker = markerRef.current;
		if (!marker || !position) return undefined;
		const from = currentRef.current || position;
		const to = position;
		if (from[0] === to[0] && from[1] === to[1]) return undefined;

		if (rotate) {
			const dy = to[0] - from[0];
			const dx = to[1] - from[1];
			if (Math.abs(dy) > 1e-7 || Math.abs(dx) > 1e-7) {
				// atan2(Δlng, Δlat): 0° = heading north, increases clockwise
				headingRef.current = (Math.atan2(dx, dy) * 180) / Math.PI;
			}
		}

		cancelAnimationFrame(rafRef.current);
		const startedAt = performance.now();
		const tick = (now) => {
			const t = Math.min(1, (now - startedAt) / durationMs);
			const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
			const lat = from[0] + (to[0] - from[0]) * e;
			const lng = from[1] + (to[1] - from[1]) * e;
			marker.setLatLng([lat, lng]);
			const root = marker._icon?.firstElementChild;
			if (rotate && root) root.style.transform = `rotate(${headingRef.current}deg)`;
			if (t < 1) rafRef.current = requestAnimationFrame(tick);
			else currentRef.current = to;
		};
		rafRef.current = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafRef.current);
	}, [position && position[0], position && position[1], durationMs, rotate]); // eslint-disable-line react-hooks/exhaustive-deps

	if (!position) return null;
	// Pass the latest position so react-leaflet tracks it; the layout effect above
	// resets to the glide start and animates over it before the browser paints.
	return <Marker ref={markerRef} position={position} icon={icon}>{children}</Marker>;
}
