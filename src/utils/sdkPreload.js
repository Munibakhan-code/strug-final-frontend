/**
 * Route gate for the heavy third-party SDKs (#465 — "the platform takes a long time to load
 * on mobile").
 *
 * Stripe.js (~1.0 MB decoded) and the Google Maps JS API + Places (~1.3 MB decoded across 6
 * files) were both deferred off the critical path, but each had an unconditional fallback
 * timer — so they loaded on EVERY route, ~5s in, whether or not the page had a checkout or a
 * map. Measured on prod /videos on a 390px viewport: 4.1 MB of JS decoded, of which ~2.3 MB
 * was Stripe + Maps. Deferring only moves the parse/compile cost; on a mid-range phone that
 * cost is still seconds of main thread.
 *
 * This is a DENY-list, deliberately. Stripe is loaded in exactly one place (the <Elements>
 * wrapper at the app root), so a route that needs a checkout and doesn't trigger it would
 * break payments — an allow-list would have to enumerate every payment-capable vertical and
 * stay correct forever. Skipping the handful of media routes that provably have neither a
 * checkout nor a map is the safe direction to be wrong in: the worst case is that an SDK
 * loads somewhere it isn't needed, not that a checkout has no Stripe.
 */

/** Routes with no checkout and no map — the ones people sit on for minutes at a time. */
export const SDK_FREE_ROUTES = new Set([
  'videos',
  'feed',
  'social',
  'live',
  'messages',
]);

export function routeNeedsHeavySdks(navId) {
  if (!navId) return false;
  return !SDK_FREE_ROUTES.has(navId);
}

// The <Elements> wrapper sits ABOVE AppInner (it has to — it's a provider), so it can't read
// activeNav from props. AppInner publishes the active route here; the wrapper subscribes.
let activeRoute = null;
const subscribers = new Set();

export function setActiveRoute(navId) {
  if (navId === activeRoute) return;
  activeRoute = navId;
  subscribers.forEach((fn) => fn(navId));
}

export function subscribeActiveRoute(fn) {
  subscribers.add(fn);
  if (activeRoute !== null) fn(activeRoute);
  return () => subscribers.delete(fn);
}

export function getActiveRoute() {
  return activeRoute;
}
