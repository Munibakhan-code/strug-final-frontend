/** Country-agnostic distance + ETA helpers (Haversine; ~30 km/h urban average). */

const EARTH_RADIUS_KM = 6371;
const DEFAULT_AVG_SPEED_KMH = 30;

export function haversineKm(lat1, lon1, lat2, lon2) {
  const la1 = Number(lat1);
  const lo1 = Number(lon1);
  const la2 = Number(lat2);
  const lo2 = Number(lon2);
  if (![la1, lo1, la2, lo2].every(Number.isFinite)) return null;
  const dLat = ((la2 - la1) * Math.PI) / 180;
  const dLon = ((lo2 - lo1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos((la1 * Math.PI) / 180) * Math.cos((la2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function etaMinutesFromDistanceKm(distanceKm, avgSpeedKmh = DEFAULT_AVG_SPEED_KMH) {
  const d = Number(distanceKm);
  if (!Number.isFinite(d) || d < 0) return null;
  const speed = Number(avgSpeedKmh) > 0 ? Number(avgSpeedKmh) : DEFAULT_AVG_SPEED_KMH;
  return Math.max(1, Math.round((d / speed) * 60));
}

/** Human label e.g. "~5 min" — used on passenger live tracking UI. */
export function formatEtaLabel(distanceKm, avgSpeedKmh = DEFAULT_AVG_SPEED_KMH) {
  const min = etaMinutesFromDistanceKm(distanceKm, avgSpeedKmh);
  return min != null ? `~${min} min` : "—";
}

/**
 * Food / Shop browse ETA baseline: 15 min + 6 min per km.
 * Matches Food.jsx vendorsWithDist (`15 + Math.round(dist * 6)`).
 */
export function foodStyleEtaMinutes(distanceKm) {
  const d = Number(distanceKm);
  if (!Number.isFinite(d) || d < 0) return null;
  return 15 + Math.round(d * 6);
}

/** Food-style shop/restaurant card label, e.g. "18–25 min (2.4 km)". */
export function distanceLabel(userLat, userLng, storeLat, storeLng) {
  const km = haversineKm(userLat, userLng, storeLat, storeLng);
  if (km == null) return null;
  const eta = foodStyleEtaMinutes(km);
  if (eta == null) return null;
  return `${Math.max(eta - 3, 1)}–${eta + 5} min (${km.toFixed(1)} km)`;
}

/** Client-side browse hide radius (km). Matches the pre-773663fb Food filter. */
export const FOOD_BROWSE_RADIUS_KM = 50;

/**
 * Whether a vendor belongs on the food browse list for a known distance.
 * Unknown distance (null) stays visible so pre-geocode listings are not wiped.
 */
export function isWithinFoodBrowseRadius(distanceKm, maxKm = FOOD_BROWSE_RADIUS_KM) {
  if (distanceKm == null) return true;
  const d = Number(distanceKm);
  if (!Number.isFinite(d)) return true;
  return d <= maxKm;
}

/** [lat, lng] from Leaflet pair or API fields. */
export function coordsPair(lat, lngOrLong) {
  const la = Number(lat);
  const lo = Number(lngOrLong);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return [la, lo];
}

/** Live ETA from driver position to a target [lat, lng]. */
export function liveEtaLabel(driverCoords, targetCoords, avgSpeedKmh = DEFAULT_AVG_SPEED_KMH) {
  if (!driverCoords || !targetCoords) return null;
  const km = haversineKm(driverCoords[0], driverCoords[1], targetCoords[0], targetCoords[1]);
  return km != null ? formatEtaLabel(km, avgSpeedKmh) : null;
}

/** Compass bearing in degrees (0 = north, 90 = east) from [lat,lng] `from` → `to`.
 *  Used to point the live marker in its direction of travel on the tracking maps. */
export function bearingDeg(from, to) {
  if (!from || !to) return null;
  const rad = (d) => (d * Math.PI) / 180;
  const phi1 = rad(from[0]);
  const phi2 = rad(to[0]);
  const dLon = rad(to[1] - from[1]);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  if (!Number.isFinite(y) || !Number.isFinite(x)) return null;
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
