import { loadGoogleMaps } from "./googleMaps.js";

/**
 * Resolve address coordinates using the Google Maps Geocoder.
 * Returns { lat, lng } on success, otherwise null.
 *
 * This used to return null the instant `window.google` was absent, and no caller ever retried. But
 * the Maps SDK is deliberately deferred (App.jsx injects it on the first pointer/key/touch event, or
 * after a 5s idle timeout), so any caller that geocoded before the user interacted got a silent null
 * and gave up — e.g. a courier accepting a job would resolve the pickup to null and the map would
 * simply never appear for that delivery. Awaiting the idempotent loader makes it self-healing.
 *
 * `googleRef` is still honoured so tests can inject a stub without touching the loader.
 */
export async function geocodeAddress(address, googleRef) {
  if (!address) return null;

  const maps = googleRef?.maps ?? (await loadGoogleMaps());
  if (!maps?.Geocoder) return null;

  try {
    return await new Promise((resolve) => {
      new maps.Geocoder().geocode({ address }, (results, status) => {
        if (status === 'OK' && results?.[0]?.geometry?.location) {
          const loc = results[0].geometry.location;
          resolve({ lat: loc.lat(), lng: loc.lng() });
          return;
        }
        resolve(null);
      });
    });
  } catch {
    return null;
  }
}
