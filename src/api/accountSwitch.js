import { revokeRefreshCookie } from './auth.js';
import {
  getAuthUserId,
  clearAuth,
} from '../store/auth.js';
import {
  rememberActiveAccount,
  listSavedAccounts,
  getSavedAccount,
  removeSavedAccount,
  clearSavedAccounts,
  isAccessTokenExpired,
  setAddingAccountFlag,
  clearActiveSessionKeepAccounts,
  applySavedAccountSession,
} from '../store/savedAccounts.js';
import { isLocalDevLoginEnabled } from '../utils/devLogin.js';

function loginUrl() {
  if (isLocalDevLoginEnabled()) return '/';
  return import.meta.env.VITE_LOGIN_URL ?? 'https://strug.ca/en/login';
}

function goLogin() {
  window.location.href = loginUrl();
}

function softReloadApp() {
  // Full reload clears React trees, sockets, and in-memory caches so accounts
  // cannot leak UI state into each other (same isolation goal as bug #50 wipes).
  window.location.reload();
}

/** Snapshot the live session, then switch to another saved account. */
export async function switchToAccount(userId) {
  const currentId = getAuthUserId();
  if (currentId != null && String(currentId) === String(userId)) {
    return { ok: true, same: true };
  }

  rememberActiveAccount();

  const target = getSavedAccount(userId);
  if (!target) return { ok: false, reason: 'missing' };

  if (isAccessTokenExpired(target.accessToken)) {
    clearActiveSessionKeepAccounts();
    await revokeRefreshCookie();
    setAddingAccountFlag(true);
    goLogin();
    return { ok: false, reason: 'expired' };
  }

  if (!applySavedAccountSession(target)) {
    return { ok: false, reason: 'apply' };
  }

  // Vaulted access tokens cannot mint a refresh cookie (#1272). Drop the previous
  // account's cookie so silent restore cannot pull it back; this tab stays on the
  // access JWT until it expires (then the user signs in again).
  await revokeRefreshCookie();
  softReloadApp();
  return { ok: true };
}

/**
 * Keep current account in the vault and send the user to login for another.
 * Revokes the refresh cookie so restoreSession cannot silently pull the previous
 * account back while on the login host.
 */
export async function beginAddAnotherAccount() {
  rememberActiveAccount();
  clearActiveSessionKeepAccounts();
  await revokeRefreshCookie();
  setAddingAccountFlag(true);
  goLogin();
}

/**
 * Sign out of the active account only. If another vault entry has a usable
 * token, switch to it; otherwise full logout → login.
 */
export async function signOutCurrentAccount() {
  const uid = getAuthUserId();
  rememberActiveAccount();
  if (uid != null) removeSavedAccount(uid);

  await revokeRefreshCookie();
  clearActiveSessionKeepAccounts();
  try {
    localStorage.removeItem('strug_session_owner');
  } catch { /* ignore */ }

  const others = listSavedAccounts().filter((a) => !isAccessTokenExpired(a.accessToken));
  if (others.length > 0) {
    const next = others[0];
    if (applySavedAccountSession(next)) {
      softReloadApp();
      return { ok: true, switchedTo: next.userId };
    }
  }

  clearAuth();
  clearSavedAccounts();
  window.dispatchEvent(new Event('strug:logout'));
  goLogin();
  return { ok: true, signedOutAll: true };
}

/** Sign out everywhere on this device — vault + refresh cookie. */
export async function signOutAllAccounts() {
  await revokeRefreshCookie();
  clearSavedAccounts();
  clearAuth();
  setAddingAccountFlag(false);
  window.dispatchEvent(new Event('strug:logout'));
  goLogin();
  return { ok: true };
}
