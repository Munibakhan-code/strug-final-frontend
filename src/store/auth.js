import {
  clearUserLocation,
  migrateLegacyLocationForOwner,
  promoteGuestLocationToUser,
} from '../utils/userLocation.js';
import { clearPlaybackCache } from '../utils/videoPlaybackCache.js';
import { setObservabilityUser } from '../utils/observability.js';

const TOKEN_KEY = 'strug_access_token';
const USER_KEY = 'strug_user';
// Which account actually signed in on THIS browser. The access token lives in
// sessionStorage (per-tab, gone when the tab closes) but the refresh cookie is httpOnly and
// browser-wide, so a new tab silently trades that cookie for a session — as whoever the
// cookie belongs to. Nothing used to check that this was the account you had been using, so
// a stale cookie (e.g. one minted against staging, which shares the .strug.ca cookie domain
// with prod) logged you into a DIFFERENT account — the test user (#414). This key is the
// browser-wide record of the last real sign-in, so a restore can be matched against it.
const SESSION_OWNER_KEY = 'strug_session_owner';

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getSessionOwner() {
  const raw = localStorage.getItem(SESSION_OWNER_KEY);
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isNaN(n) ? raw : n;
}

/** Record the account that just signed in. Call from every genuine login path — NOT from a
 *  cookie restore, which is the thing we're validating against this record. */
export function setSessionOwner(user) {
  const id = userIdOf(user);
  if (id == null || id === '') return;
  // Before recording the new owner, reconcile delivery location for this account:
  //  - Adopt the legacy pre-namespacing GLOBAL location keys ONLY when this browser's last real
  //    sign-in was the SAME account (getSessionOwner() still holds the previous owner here), so a
  //    remembered location survives the deploy without inheriting another account's stale one.
  //  - Carry any location a guest entered (per-tab sessionStorage) into this account.
  try {
    const prevOwner = getSessionOwner();
    if (prevOwner != null && String(prevOwner) === String(id)) {
      migrateLegacyLocationForOwner(id);
    }
    promoteGuestLocationToUser(id);
  } catch { /* location reconcile is best-effort — never block sign-in */ }
  localStorage.setItem(SESSION_OWNER_KEY, String(id));
}

export function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function getUser() {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

function userIdOf(user) {
  return user?.user_id ?? user?.id ?? null;
}

/** Decode JWT payload (unsigned) — identity / exp only. */
function payloadFromAccessToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

/** Decode user_id from a JWT access token payload (unsigned read — identity only). */
export function userIdFromAccessToken(token) {
  const payload = payloadFromAccessToken(token);
  if (!payload) return null;
  const raw = payload?.user_id ?? payload?.userId ?? payload?.id;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isNaN(n) ? raw : n;
}

/** Claims needed to seed sessionStorage when a redirect only carried the access token. */
export function claimsFromAccessToken(token) {
  const payload = payloadFromAccessToken(token);
  if (!payload) return null;
  const user_id = payload?.user_id ?? payload?.userId ?? payload?.id;
  if (user_id == null || user_id === '') return null;
  return {
    user_id: Number.isNaN(Number(user_id)) ? user_id : Number(user_id),
    name: payload?.name ?? null,
    email: payload?.login && String(payload.login).includes('@') ? payload.login : null,
    permission: payload?.permission ?? null,
  };
}

/** Resolved user id for API calls — prefer the signed JWT over mutable sessionStorage user JSON. */
export function getAuthUserId() {
  const fromToken = userIdFromAccessToken(getToken());
  if (fromToken != null && fromToken !== '') return fromToken;
  const fromUser = userIdOf(getUser());
  if (fromUser != null && fromUser !== '') {
    const n = Number(fromUser);
    return Number.isNaN(n) ? fromUser : n;
  }
  return null;
}

export function setUser(user) {
  // Reconcile cached per-user state on every account change. Logout clears these keys,
  // but switching accounts on a shared browser usually happens WITHOUT an explicit
  // logout (login as B straight over A's session, incl. the server-proxied ?token=
  // redirect), so clearAuth never runs and A's location/wallet bled into B (bug #50).
  // Wipe whenever the stored user id changes to a different account.
  const prevId = userIdOf(getUser());
  const nextId = userIdOf(user);
  if (prevId != null && nextId != null && prevId !== nextId) {
    clearPerUserState();
  }
  // Tag crash reports with the account id only — no email, handle or IP — so a report can be
  // traced back to "which user hit this" without carrying PII off the device.
  setObservabilityUser(nextId);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

// Per-user state cached in localStorage under GLOBAL (non-namespaced) keys. On a shared
// browser these leaked from one account to the next because logout only cleared the token
// (bug #50 "Account Bleeding": a location set on account A showed up on account B; wallet
// balance and seller banking/payout details bled the same way). Wipe them all on logout.
// Device-level UI prefs (theme/language/autoplay) are intentionally NOT listed — they are not
// account-specific and should survive an account switch.
const PER_USER_KEYS = [
  // Delivery / service location
  'strug_user_address', 'strug_user_lat', 'strug_user_lng', 'strug_user_location',
  'strug_profile_addresses', 'strug_recent_addresses',
  // Financial / wallet — must never persist across accounts
  'strug_wallet_balance', 'strug_seller_bank_details', 'strug_seller_payout_history', 'strug_payout_freq',
  // Per-user preferences & saved state
  'strug_notif_prefs', 'strug_privacy_prefs', 'strug_profile_visibility', 'strug_re_saved',
  // Onboarding state is per-ACCOUNT, not per-device. Left global, one user's dismissal
  // suppressed the welcome for the next account to sign in on the same device — the #50
  // account-bleed class applied to onboarding (#416).
  'strug_welcome_seen', 'strug_new_user',
  // #421: "has opened the provider hub" — per-account, so a new account still gets the cue.
  'strug_provider_seen',
];

// Per-user state stored under DYNAMIC (per-entity) sessionStorage keys, so they can't be listed
// by name like PER_USER_KEYS. Same #50 account-bleed class: `strug_resume_<videoId>` is the video
// "resume where you left off" position — keyed only by video, so on a shared browser account B
// re-opening a video A watched resumed at A's timestamp (#477). Wipe every matching key on account
// change / logout. (sessionStorage because that's where these live; the token lives here too, per-tab.)
const PER_USER_SESSION_PREFIXES = ['strug_resume_'];
// Same idea in localStorage: `strug_videos_drawer_seen_v1:<userId>` is the "unseen badge" marker per
// Videos drawer tab. It is namespaced per account, so it never showed the wrong counts, but nothing
// removed it — every account that ever signed in on the device left a key behind for good.
const PER_USER_LOCAL_PREFIXES = ['strug_videos_drawer_seen_v1'];

function clearByPrefix(storage, prefixes) {
  try {
    const doomed = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && prefixes.some((p) => key.startsWith(p))) doomed.push(key);
    }
    for (const key of doomed) storage.removeItem(key);
  } catch { /* private mode / quota — non-fatal */ }
}

export function clearPerUserState() {
  for (const key of PER_USER_KEYS) localStorage.removeItem(key);
  clearByPrefix(sessionStorage, PER_USER_SESSION_PREFIXES);
  clearByPrefix(localStorage, PER_USER_LOCAL_PREFIXES);
  clearPlaybackCache(); // in-memory playback URLs, same per-account reasoning as the resume keys
}

export function clearAuth() {
  const ownerId = getAuthUserId(); // capture before the token/user that identify it are wiped
  setObservabilityUser(null); // stop attributing later crashes to the account that just left
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(SESSION_OWNER_KEY);
  clearPerUserState(); // legacy GLOBAL keys (incl. old location keys) + per-user session keys
  clearUserLocation(ownerId); // this account's namespaced location + this tab's guest location
}

export function isAuthenticated() {
  const token = getToken();
  if (!token) return false;
  const payload = payloadFromAccessToken(token);
  // Tokens without exp still count as present (legacy / opaque); only reject when exp is past.
  if (payload && typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
    return false;
  }
  return true;
}

/** JWT `exp` as epoch ms, or null when missing / unreadable. */
export function accessTokenExpMs() {
  const payload = payloadFromAccessToken(getToken());
  if (payload && typeof payload.exp === 'number') return payload.exp * 1000;
  return null;
}

/** True when this tab still has session signals (token, user, or browser session owner). */
export function hasSessionSignals() {
  return Boolean(getToken() || getUser() || getSessionOwner() != null);
}
