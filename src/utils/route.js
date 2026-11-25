/** Route helpers shared by rideshare + on-demand + courier live maps.
 *  Google Directions is preferred; OSRM is used as a real road-route fallback
 *  before falling back to a straight origin/destination path. Rendering stays on Leaflet. */

import { loadGoogleMaps } from "./googleMaps.js";

// Routing fallback host. Defaults to the OSRM public *demo* server (no SLA / "no production
// use") — set VITE_OSRM_BASE_URL to a self-hosted or paid instance before shipping to prod.
const OSRM_BASE_URL = import.meta.env.VITE_OSRM_BASE_URL || "https://router.project-osrm.org";

/** Decode a Google encoded polyline into an array of [lat, lng] pairs. */
export function decodePolyline(encoded) {
	if (typeof encoded !== "string" || !encoded) return [];
	const pts = []; let i = 0, lat = 0, lng = 0;
	while (i < encoded.length) {
		let b, shift = 0, result = 0;
		do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
		lat += result & 1 ? ~(result >> 1) : result >> 1; shift = result = 0;
		do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
		lng += result & 1 ? ~(result >> 1) : result >> 1;
		pts.push([lat / 1e5, lng / 1e5]);
	}
	return pts;
}

// A LatLng from the Maps SDK exposes lat()/lng() accessors; some shapes carry plain numbers.
function toLatLngPair(p) {
	return typeof p?.lat === "function" ? [p.lat(), p.lng()] : [p?.lat, p?.lng];
}

/** Pull a road-accurate [[lat,lng]...] path out of a Google DirectionsRoute, whichever shape
 *  the SDK returns. Prefers the per-step geometry (`legs[].steps[].path`) — `overview_path` is a
 *  *simplified* polyline that visibly cuts corners / runs off the road when zoomed in. Falls back
 *  to overview_path, then the encoded string.
 *
 *  This is also the production bug fix: the old code reached straight for
 *  `route.overview_polyline.points` — a legacy shape the current Maps JS release does not populate.
 *  `points` came back undefined, decodePolyline threw on `undefined.length`, and because the throw
 *  happened INSIDE the Directions callback it killed the callback silently: no route, no error the
 *  app could see. Every map quietly fell back to a straight dashed line and a haversine ETA. Now it
 *  degrades through overview_path → encoded string → [] without ever throwing. */
export function routePath(route) {
	// Most accurate: concatenate the decoded per-step paths.
	const legs = route?.legs;
	if (Array.isArray(legs) && legs.length) {
		const pts = [];
		for (const leg of legs) {
			for (const step of leg?.steps || []) {
				if (Array.isArray(step?.path)) {
					for (const p of step.path) pts.push(toLatLngPair(p));
				}
			}
		}
		const clean = pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
		if (clean.length > 1) return clean;
	}
	// Current SDK: overview_path is an already-decoded LatLng[].
	if (Array.isArray(route?.overview_path) && route.overview_path.length) {
		return route.overview_path.map(toLatLngPair).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
	}
	// Legacy: an encoded polyline, either as { points } or as a bare string.
	const op = route?.overview_polyline;
	return decodePolyline(typeof op === "string" ? op : op?.points);
}

function fallbackRouteMeta(origin, destination, status = "NO_ROUTE") {
	return { path: [origin, destination], durationMin: null, distanceKm: null, source: "fallback", status };
}

// OSRM has no free-text instruction field like Google's — synthesize one from
// maneuver.type/modifier + the street name.
const OSRM_MANEUVER_VERB = {
	turn: "Turn", "new name": "Continue onto", depart: "Head", arrive: "Arrive", merge: "Merge",
	"on ramp": "Take the ramp", "off ramp": "Take the exit", fork: "Keep", "end of road": "Turn",
	continue: "Continue", roundabout: "Enter the roundabout", rotary: "Enter the roundabout",
	"roundabout turn": "At the roundabout, turn", notification: "Continue",
};
function osrmInstruction(step) {
	const type = step?.maneuver?.type;
	const modifier = step?.maneuver?.modifier;
	const name = step?.name;
	const verb = OSRM_MANEUVER_VERB[type] || "Continue";
	const withModifier = modifier && type !== "depart" && type !== "arrive" ? `${verb} ${modifier}` : verb;
	return name ? `${withModifier}${type === "new name" ? "" : " onto"} ${name}`.replace(/\s+/g, " ").trim() : withModifier;
}
function mapOsrmSteps(route) {
	const steps = route?.legs?.[0]?.steps;
	if (!Array.isArray(steps)) return [];
	return steps.map((step) => ({
		instruction: osrmInstruction(step),
		distanceM: step?.distance ?? null,
		durationS: step?.duration ?? null,
		maneuver: step?.maneuver?.type ? `${step.maneuver.type}${step.maneuver.modifier ? `-${step.maneuver.modifier}` : ""}` : null,
		startLat: step?.maneuver?.location?.[1] ?? null,
		startLng: step?.maneuver?.location?.[0] ?? null,
	}));
}

async function fetchOsrmRouteMeta(origin, destination, callback, fallbackStatus, withSteps = false) {
	try {
		if (typeof fetch !== "function") {
			callback(fallbackRouteMeta(origin, destination, fallbackStatus));
			return;
		}
		const url = new URL(`/route/v1/driving/${origin[1]},${origin[0]};${destination[1]},${destination[0]}`, OSRM_BASE_URL);
		url.searchParams.set("overview", "full");
		url.searchParams.set("geometries", "geojson");
		if (withSteps) url.searchParams.set("steps", "true");
		const res = await fetch(url);
		if (!res.ok) {
			callback(fallbackRouteMeta(origin, destination, fallbackStatus ?? `OSRM_${res.status}`));
			return;
		}
		const data = await res.json();
		const route = data?.routes?.[0];
		const coords = route?.geometry?.coordinates;
		if (!Array.isArray(coords) || coords.length < 2) {
			callback(fallbackRouteMeta(origin, destination, fallbackStatus ?? data?.code));
			return;
		}
		callback({
			path: coords.map(([lng, lat]) => [lat, lng]),
			durationMin: route.duration != null ? Math.max(1, Math.round(route.duration / 60)) : null,
			distanceKm: route.distance != null ? route.distance / 1000 : null,
			source: "osrm",
			status: data?.code ?? fallbackStatus ?? "OK",
			...(withSteps ? { steps: mapOsrmSteps(route) } : {}),
		});
	} catch {
		callback(fallbackRouteMeta(origin, destination, fallbackStatus ?? "OSRM_ERROR"));
	}
}

// Google returns instructions as an HTML fragment, e.g. "<b>Turn left</b> onto Main St".
function stripHtml(html) {
	return typeof html === "string" ? html.replace(/<[^>]*>/g, "") : "";
}
function mapGoogleSteps(leg) {
	const steps = leg?.steps;
	if (!Array.isArray(steps)) return [];
	return steps.map((step) => {
		const start = toLatLngPair(step?.start_location);
		return {
			instruction: stripHtml(step?.instructions),
			distanceM: step?.distance?.value ?? null,
			durationS: step?.duration?.value ?? null,
			maneuver: step?.maneuver || null,
			startLat: Number.isFinite(start?.[0]) ? start[0] : null,
			startLng: Number.isFinite(start?.[1]) ? start[1] : null,
		};
	});
}

/** Fetch the driving route between two [lat,lng] points; calls back with the path.
 *  Awaits the (deferred) Google Maps SDK, so a route whose coords resolved before the user
 *  interacted still draws. Falls back to a straight origin→destination path if the SDK is absent. */
export async function fetchRoute(origin, destination, callback) {
	const maps = await loadGoogleMaps();
	if (!maps?.DirectionsService) {
		callback([origin, destination]);
		return;
	}
	new maps.DirectionsService().route(
		{ origin: { lat: origin[0], lng: origin[1] }, destination: { lat: destination[0], lng: destination[1] }, travelMode: "DRIVING" },
		(result, status) => {
			if (status === "OK" && result.routes?.[0]) {
				const path = routePath(result.routes[0]);
				if (path.length > 1) { callback(path); return; }
			}
			callback([origin, destination]);
		}
	);
}

/** Like fetchRoute but also returns the live ETA — calls back with
 *  { path: [[lat,lng]...], durationMin, distanceKm, source, status }.
 *  Prefers Google, falls back to OSRM, then a straight line. */
export async function fetchRouteMeta(origin, destination, callback) {
	const maps = await loadGoogleMaps();
	if (!maps?.DirectionsService) {
		await fetchOsrmRouteMeta(origin, destination, callback, "NO_GOOGLE_MAPS");
		return;
	}
	new maps.DirectionsService().route(
		{ origin: { lat: origin[0], lng: origin[1] }, destination: { lat: destination[0], lng: destination[1] }, travelMode: "DRIVING" },
		async (result, status) => {
			if (status !== "OK" || !result.routes?.[0]) {
				await fetchOsrmRouteMeta(origin, destination, callback, status);
				return;
			}
			const route = result.routes[0];
			const leg = route.legs?.[0];
			const path = routePath(route);
			// If Google returns no usable geometry, fall back to OSRM rather than drawing nothing.
			if (path.length < 2) {
				await fetchOsrmRouteMeta(origin, destination, callback, status);
				return;
			}
			callback({
				path,
				durationMin: leg?.duration?.value != null ? Math.max(1, Math.round(leg.duration.value / 60)) : null,
				distanceKm: leg?.distance?.value != null ? leg.distance.value / 1000 : null,
				source: "google",
				status,
			});
		}
	);
}

/** Like fetchRouteMeta but also returns turn-by-turn `steps` — used for the driver
 *  turn-by-turn overlay. Not merged into fetchRouteMeta itself: that function's existing
 *  callers don't need the extra per-step work, so this stays a separate, additive export. */
export async function fetchRouteWithSteps(origin, destination, callback) {
	const maps = await loadGoogleMaps();
	if (!maps?.DirectionsService) {
		await fetchOsrmRouteMeta(origin, destination, callback, "NO_GOOGLE_MAPS", true);
		return;
	}
	new maps.DirectionsService().route(
		{ origin: { lat: origin[0], lng: origin[1] }, destination: { lat: destination[0], lng: destination[1] }, travelMode: "DRIVING" },
		async (result, status) => {
			if (status !== "OK" || !result.routes?.[0]) {
				await fetchOsrmRouteMeta(origin, destination, callback, status, true);
				return;
			}
			const route = result.routes[0];
			const leg = route.legs?.[0];
			const path = routePath(route);
			if (path.length < 2) {
				await fetchOsrmRouteMeta(origin, destination, callback, status, true);
				return;
			}
			callback({
				path,
				durationMin: leg?.duration?.value != null ? Math.max(1, Math.round(leg.duration.value / 60)) : null,
				distanceKm: leg?.distance?.value != null ? leg.distance.value / 1000 : null,
				source: "google",
				status,
				steps: mapGoogleSteps(leg),
			});
		}
	);
}
