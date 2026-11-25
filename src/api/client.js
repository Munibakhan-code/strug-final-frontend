import axios from 'axios';
import { getToken, setToken, getUser, setUser, clearAuth, getSessionOwner } from '../store/auth';
import { syncSavedAccountAfterRefresh } from '../store/savedAccounts.js';
import i18n from '../i18n/index.js';
import { syncLanguageFromUser } from '../utils/languagePrefs.js';
import { recordApiFailure } from '../utils/diagnostics.js';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 15000,
  // Send the httpOnly refresh cookie so the session can be silently renewed.
  withCredentials: true,
});

client.interceptors.request.use(async (config) => {
  let token = getToken();
  // On a hard load / new tab the access token isn't in storage yet, but the app kicks off a silent
  // session restore (refresh cookie → token) at startup (main.jsx). If that restore is in flight,
  // wait for it so this request carries the token instead of racing ahead tokenless and 401ing into
  // an empty page. We only AWAIT an already-running refresh — never start one here — so a genuine
  // guest (no refresh in flight) is unaffected and still sends the request unauthenticated.
  if (!token && refreshPromise) {
    await refreshPromise;
    token = getToken();
  }
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const lng = i18n.language || i18n.resolvedLanguage || 'en';
  config.headers['Accept-Language'] = lng;
  return config;
});

// Decide whether a session handed back by /auth/refresh is really ours to adopt.
//
// Renewing an expired token mid-session is the easy case: a session for account X is already
// open in this tab, so the refreshed account must be X. Restoring on boot/a new tab has no
// open session to compare against, so it falls back to strug_session_owner — the browser-wide
// record of who last actually signed in here. A cookie with no matching record was not created
// by a sign-in on this browser (it is stale, or was minted against another environment on the
// shared .strug.ca cookie domain) and must not be adopted (#414).
function ownsRestoredSession(user, accessToken) {
  const restoredId = idOf(user) ?? idFromToken(accessToken);
  const currentId = idOf(getUser());

  // Renewing a session already open in this tab — it must stay the same account. If the
  // response doesn't identify the account there is no evidence of a switch, and the open
  // session was already vetted when it was established, so let the renewal through.
  if (currentId != null) {
    return restoredId == null || String(currentId) === String(restoredId);
  }

  // A session materialising from the cookie alone (boot / new tab). Adopt it only if this
  // browser has a record of that exact account signing in here.
  if (restoredId == null) return false;
  const owner = getSessionOwner();
  return owner != null && String(owner) === String(restoredId);
}

function idOf(user) {
  const id = user?.user_id ?? user?.id ?? null;
  return id === '' ? null : id;
}

function idFromToken(token) {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.user_id ?? payload?.userId ?? payload?.id ?? null;
  } catch {
    return null;
  }
}

// Kill a refresh cookie we've refused, so it can't re-offer the same foreign session on the
// next load. Bare axios (not `client`) to stay out of the interceptors; best-effort — local
// state is cleared regardless, so the user simply lands as a signed-out guest.
function disownForeignSession() {
  clearAuth();
  axios
    .delete(`${client.defaults.baseURL}/auth/delete_token`, { withCredentials: true })
    .catch(() => {});
}

// Single-flight refresh: if many requests 401 at once, only one /auth/refresh runs
// and the rest await the same promise. Uses a bare axios call (not `client`) so it
// never re-enters this interceptor. Returns the new access token, or null on failure.
let refreshPromise = null;
let refreshFailedAt = 0;
const REFRESH_COOLDOWN_MS = 30_000;

export function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;
  if (Date.now() - refreshFailedAt < REFRESH_COOLDOWN_MS) {
    return Promise.resolve(null);
  }
  refreshPromise = axios
      // Bare axios has no default timeout (unlike `client`) — bound it so a stuck backend can't
      // hang every request that awaits this refresh.
      .post(`${client.defaults.baseURL}/auth/refresh`, {}, { withCredentials: true, timeout: 15000 })
      .then((res) => {
        const data = res.data || {};
        if (data.accessToken) {
          // The refresh cookie is browser-wide and outlives the tab, so it may belong to an
          // account that never signed in here — a stale cookie, or one minted against another
          // environment (staging and prod share the .strug.ca cookie domain). Adopting it
          // blindly silently signed people into the test user / someone else's account (#414).
          // Only restore a session the browser has a matching record of signing in with; an
          // unrecognised cookie is revoked rather than adopted.
          if (!ownsRestoredSession(data.user, data.accessToken)) {
            disownForeignSession();
            return null;
          }
          setToken(data.accessToken);
          if (data.user) {
            setUser(data.user);
            syncLanguageFromUser(data.user);
          }
          syncSavedAccountAfterRefresh(data.accessToken, data.user || getUser());
          return data.accessToken;
        }
        return null;
      })
      .catch(() => {
        refreshFailedAt = Date.now();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  return refreshPromise;
}

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err.response?.status;
    const body = err.response?.data;
    const original = err.config || {};
    const isAuthError =
      status === 401 ||
      (status === 403 && (body === 'Invalid token' || body?.message === 'Invalid token'));
    const isRefreshCall = (original.url || '').includes('/auth/refresh');

    // Remember the failure so a bug report filed moments later can carry it. Method + path +
    // status only — never the body or headers (see utils/diagnostics.js). A 401 that we're
    // about to transparently refresh-and-retry is NOT a failure the user experienced, so skip
    // it; if the retry itself fails it comes back through here and is recorded then.
    const willRetry = isAuthError && getToken() && !original._retry && !isRefreshCall;
    if (!willRetry) {
      recordApiFailure({ method: original.method, url: original.url, status: status ?? 0 });
    }

    // Only treat as session expiry if a token was actually sent — a 401 with no token
    // is expected for guest users.
    if (isAuthError && getToken() && !original._retry && !isRefreshCall) {
      original._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        // Replay the original request with the fresh token.
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return client(original);
      }
      // Refresh failed — the session is genuinely over.
      clearAuth();
      window.dispatchEvent(new Event('strug:logout'));
    }
    return Promise.reject(err);
  }
);

export default client;
