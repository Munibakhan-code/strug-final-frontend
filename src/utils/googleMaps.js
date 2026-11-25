// Lazy, idempotent Google Maps JS loader.
//
// Previously the Maps JS API (+ Places) was injected eagerly on app boot, adding
// ~8 requests to the initial load path on every page — even pages with no map.
// This loads it on demand and only once; the returned promise resolves with
// `window.google.maps` (or null if no key / load failure). Callers should still
// guard with `window.google?.maps?...` as the rest of the app already does.
let mapsPromise = null;

export function loadGoogleMaps() {
  if (typeof window === "undefined") return Promise.resolve(null);
  const key = import.meta.env.VITE_GOOGLE_MAPS_KEY;
  if (!key) return Promise.resolve(null);
  const existingScripts = Array.from(document.querySelectorAll(
    'script[src*="maps.googleapis.com/maps/api/js"]',
  ));
  const currentScript = existingScripts.find((script) => {
    try {
      return new URL(script.src).searchParams.get("key") === key;
    } catch {
      return false;
    }
  });
  const hasStaleMapsScript = existingScripts.length > 0 && !currentScript;
  if (window.google?.maps && !hasStaleMapsScript) return Promise.resolve(window.google.maps);
  if (hasStaleMapsScript) {
    existingScripts.forEach((script) => script.remove());
    try { delete window.google; } catch { window.google = undefined; }
    mapsPromise = null;
  }
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise((resolve) => {
    const finish = () => {
      mapsPromise = null;
      resolve(window.google?.maps ?? null);
    };
    const scripts = Array.from(document.querySelectorAll(
      'script[src*="maps.googleapis.com/maps/api/js"]',
    ));
    const matchingScript = scripts.find((script) => {
      try {
        return new URL(script.src).searchParams.get("key") === key;
      } catch {
        return false;
      }
    });
    scripts
      .filter((script) => script !== matchingScript)
      .forEach((script) => script.remove());
    if (matchingScript) {
      if (window.google?.maps) finish();
      else {
        matchingScript.addEventListener("load", finish, { once: true });
        matchingScript.addEventListener("error", finish, { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&loading=async`;
    script.async = true;
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", finish, { once: true });
    document.head.appendChild(script);
  });
  return mapsPromise;
}
