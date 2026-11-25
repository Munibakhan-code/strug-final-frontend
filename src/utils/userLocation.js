/**
 * Per-account delivery-location storage (fix for cross-account "location bleed", bug #50 class).
 *
 * Auth sessions are per-tab (the access token + user live in sessionStorage), but the delivery
 * location used to live in browser-wide localStorage under GLOBAL, non-namespaced keys. Two tabs
 * signed into two different accounts therefore shared ONE location: the last writer won and the
 * other tab picked it up on refresh. This module is the single source of truth for those keys and
 * resolves BOTH the storage and the real key from the tab's CURRENT identity:
 *
 *   - Signed in -> localStorage, key `${base}:${userId}`  (persists per account, across tabs/restarts)
 *   - Guest     -> sessionStorage, plain `base`           (per-tab, so two guest tabs don't collide)
 *
 * Call sites use getLocationItem / setLocationItem / removeLocationItem as near drop-in
 * replacements for localStorage.getItem / setItem / removeItem on the five keys below.
 */
import { getAuthUserId } from '../store/auth.js';

export const LOCATION_KEYS = Object.freeze([
  'strug_user_lat',
  'strug_user_lng',
  'strug_user_location',
  'strug_user_address',
  'strug_recent_addresses',
]);

/** The signed-in account id for THIS tab, or null for a guest. */
function activeUserId() {
  const uid = getAuthUserId();
  return uid == null || uid === '' ? null : String(uid);
}

/** Resolve the storage + real key for a base location key given the tab's current identity. */
function resolve(base) {
  const uid = activeUserId();
  if (uid != null) return { store: localStorage, key: `${base}:${uid}` };
  return { store: sessionStorage, key: base }; // guest -> per-tab isolation
}

export function getLocationItem(base) {
  try {
    const { store, key } = resolve(base);
    return store.getItem(key);
  } catch {
    return null; // private mode / disabled storage — non-fatal
  }
}

export function setLocationItem(base, value) {
  try {
    const { store, key } = resolve(base);
    if (value == null) store.removeItem(key);
    else store.setItem(key, value);
  } catch { /* private mode / quota — non-fatal */ }
}

export function removeLocationItem(base) {
  try {
    const { store, key } = resolve(base);
    store.removeItem(key);
  } catch { /* non-fatal */ }
}

/**
 * Remove a specific account's namespaced location keys AND this tab's guest keys.
 * Called on logout, after the account id has been captured.
 */
export function clearUserLocation(userId) {
  const uid = userId == null || userId === '' ? null : String(userId);
  try {
    for (const base of LOCATION_KEYS) {
      if (uid != null) localStorage.removeItem(`${base}:${uid}`);
      sessionStorage.removeItem(base); // clear this tab's guest bucket too
    }
  } catch { /* non-fatal */ }
}

/**
 * One-time adoption of legacy pre-namespacing GLOBAL location keys into a user's namespace.
 * Only safe when the caller has verified this browser's last real sign-in was this SAME account
 * (otherwise we'd inherit a different account's stale location). Fills only missing namespaced
 * keys, then clears the legacy globals so they can't bleed again.
 */
export function migrateLegacyLocationForOwner(userId) {
  const uid = userId == null || userId === '' ? null : String(userId);
  if (uid == null) return;
  try {
    for (const base of LOCATION_KEYS) {
      const legacy = localStorage.getItem(base);
      if (legacy == null) continue;
      const nsKey = `${base}:${uid}`;
      if (localStorage.getItem(nsKey) == null) localStorage.setItem(nsKey, legacy);
      localStorage.removeItem(base);
    }
  } catch { /* non-fatal */ }
}

/**
 * Carry a guest's entered location (per-tab sessionStorage) into their account on login.
 * Fills only missing namespaced keys so a returning user's saved location is never clobbered,
 * then clears the guest bucket so it can't later bleed into a different account in this tab.
 */
export function promoteGuestLocationToUser(userId) {
  const uid = userId == null || userId === '' ? null : String(userId);
  if (uid == null) return;
  try {
    for (const base of LOCATION_KEYS) {
      const guestVal = sessionStorage.getItem(base);
      if (guestVal == null) continue;
      const nsKey = `${base}:${uid}`;
      if (localStorage.getItem(nsKey) == null) localStorage.setItem(nsKey, guestVal);
      sessionStorage.removeItem(base);
    }
  } catch { /* non-fatal */ }
}
