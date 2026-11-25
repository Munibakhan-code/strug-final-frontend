import { refreshAccessToken } from '../api/client.js';
import {
  accessTokenExpMs,
  getToken,
  hasSessionSignals,
  isAuthenticated,
} from '../store/auth.js';

/** Renew access tokens this long before JWT exp (IG-style silent refresh). */
export const REFRESH_AHEAD_MS = 5 * 60 * 1000;

let proactiveTimer = null;
let visibilityInstalled = false;

export function accessTokenNeedsRefresh(skewMs = REFRESH_AHEAD_MS) {
  const token = getToken();
  if (!token) return hasSessionSignals();
  const expMs = accessTokenExpMs();
  if (expMs == null) return false;
  return expMs - skewMs <= Date.now();
}

/**
 * Refresh when the access JWT is missing or expired but the browser may still
 * have a valid httpOnly refresh cookie (14d). Returns the usable access token or null.
 */
export async function ensureValidAccessToken() {
  if (isAuthenticated()) return getToken();
  if (!hasSessionSignals()) return null;
  if (!accessTokenNeedsRefresh(0)) return getToken();
  return refreshAccessToken();
}

export function clearProactiveSessionRefresh() {
  if (proactiveTimer != null) {
    clearTimeout(proactiveTimer);
    proactiveTimer = null;
  }
}

export function scheduleProactiveSessionRefresh() {
  clearProactiveSessionRefresh();
  if (!hasSessionSignals() && !isAuthenticated()) return;

  const expMs = accessTokenExpMs();
  if (expMs == null) return;

  const delay = expMs - Date.now() - REFRESH_AHEAD_MS;
  const runRefresh = async () => {
    if (!accessTokenNeedsRefresh(0)) {
      scheduleProactiveSessionRefresh();
      return;
    }
    const token = await refreshAccessToken();
    if (token) scheduleProactiveSessionRefresh();
  };

  if (delay <= 0) {
    runRefresh();
    return;
  }

  proactiveTimer = setTimeout(runRefresh, delay);
}

function onVisibilityChange() {
  if (document.visibilityState !== 'visible') return;
  if (!accessTokenNeedsRefresh(0)) return;
  refreshAccessToken().then((token) => {
    if (token) scheduleProactiveSessionRefresh();
  });
}

export function installSessionRefreshOnVisibility() {
  if (visibilityInstalled) return;
  document.addEventListener('visibilitychange', onVisibilityChange);
  visibilityInstalled = true;
}

export function uninstallSessionRefreshOnVisibility() {
  if (!visibilityInstalled) return;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  visibilityInstalled = false;
}
