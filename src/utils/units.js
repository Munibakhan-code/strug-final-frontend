// Distance-unit preference (km ⇄ mi) + human-friendly distance/duration formatting.
// The preference is persisted and broadcast so every distance readout across the app
// (route pills, map overlays, payment summary…) updates together when it's toggled.

import { useEffect, useState } from "react";

const KEY = "strug_distance_unit";
const EVENT = "strug:distance-unit";
const KM_PER_MI = 1.609344;

export function getDistanceUnit() {
	try {
		return localStorage.getItem(KEY) === "mi" ? "mi" : "km";
	} catch {
		return "km";
	}
}

export function setDistanceUnit(unit) {
	const next = unit === "mi" ? "mi" : "km";
	try {
		localStorage.setItem(KEY, next);
	} catch {
		/* ignore */
	}
	if (typeof window !== "undefined") {
		window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
	}
	return next;
}

/** React hook: `[unit, setUnit]`, staying in sync across components via the window event. */
export function useDistanceUnit() {
	const [unit, setUnit] = useState(getDistanceUnit);
	useEffect(() => {
		const handler = (e) => setUnit(e.detail === "mi" ? "mi" : "km");
		const storage = (e) => { if (e.key === KEY) setUnit(getDistanceUnit()); };
		window.addEventListener(EVENT, handler);
		window.addEventListener("storage", storage);
		return () => {
			window.removeEventListener(EVENT, handler);
			window.removeEventListener("storage", storage);
		};
	}, []);
	return [unit, setDistanceUnit];
}

/** Convert km → the chosen unit's numeric value. */
export function kmToUnit(km, unit = "km") {
	const n = Number(km);
	if (!Number.isFinite(n)) return null;
	return unit === "mi" ? n / KM_PER_MI : n;
}

/** Format a km distance in the chosen unit, e.g. "276.3 km" / "171.7 mi". */
export function formatDistance(km, unit = "km") {
	const v = kmToUnit(km, unit);
	if (v == null) return null;
	const suffix = unit === "mi" ? "mi" : "km";
	return `${v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${suffix}`;
}

/** Format minutes as "45 min", "3 hr", or "3 hr 30 min". */
export function formatDuration(totalMin) {
	const m = Math.round(Number(totalMin));
	if (!Number.isFinite(m) || m < 0) return null;
	if (m < 60) return `${m} min`;
	const hr = Math.floor(m / 60);
	const min = m % 60;
	return min ? `${hr} hr ${min} min` : `${hr} hr`;
}
