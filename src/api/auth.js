import client, { refreshAccessToken } from './client';
import { setToken, setUser, clearAuth, getUser, setSessionOwner } from '../store/auth';
import { rememberActiveAccount, setAddingAccountFlag } from '../store/savedAccounts.js';
import { syncLanguageFromUser } from '../utils/languagePrefs.js';

// Mint + store the httpOnly refresh cookie after a proxied strug.ca login.
// Login Set-Cookie never reaches the browser (Next proxies JSON only). Minting a
// 14d refresh from the access JWT alone was removed (#1272). Instead the API returns
// a one-time `session_handoff` that we claim here with credentials so api.strug.ca
// can set the cookie and silent restore works after the tab/app closes.
export async function establishRefreshCookie(handoff) {
  if (!handoff || typeof handoff !== 'string') return false;
  try {
    await client.post('/auth/session/claim-handoff', { handoff });
    return true;
  } catch {
    return false;
  }
}

// Try to restore a session from the refresh cookie alone (no access token in storage).
// This is what rescues users whose localStorage was wiped — e.g. iOS Safari eviction —
// so they stay logged in instead of being bounced to the login page. Returns the user
// on success, or null.
export async function restoreSession() {
  const token = await refreshAccessToken();
  return token ? getUser() : null;
}

/** Request a registration OTP. Backend accepts email + optional username. */
export async function registerRequest(email, username) {
  const { data } = await client.post('/auth/register-request', {
    email,
    ...(username ? { username } : {}),
  });
  return data;
}

export async function verifyOtpAndRegister(email, otp, password, name) {
  const { data } = await client.post('/auth/verify-otp-and-register', { email, otp, password, name });
  if (data.accessToken) {
    setToken(data.accessToken);
    setUser(data.user);
    setSessionOwner(data.user);
    rememberActiveAccount();
    setAddingAccountFlag(false);
    await syncLanguageFromUser(data.user);
  }
  return data;
}

export async function login(emailOrPhone, password) {
  const storedLang = localStorage.getItem('strug_language');
  const { data } = await client.post(
    '/auth/login',
    { login: emailOrPhone, password, ...(storedLang ? { language: storedLang } : {}) },
    storedLang ? { headers: { 'X-Strug-Language': storedLang } } : {},
  );
  if (data.accessToken) {
    setToken(data.accessToken);
    setUser(data.user);
    setSessionOwner(data.user);
    rememberActiveAccount();
    setAddingAccountFlag(false);
    await syncLanguageFromUser(data.user);
  }
  return data;
}

// Revoke the httpOnly refresh cookie server-side. Without this, logout only cleared
// sessionStorage; the refresh cookie survived, so the NEXT visit to app.strug.ca hit
// restoreSession() → /auth/refresh → silently logged the *previous* account back in
// (bugs #207/#225 "logout/return shows a previously logged-in account"). Best-effort:
// even if the network call fails we still clear local state in logout().
export async function revokeRefreshCookie() {
  try {
    await client.delete('/auth/delete_token');
    return true;
  } catch {
    return false;
  }
}

export async function logout() {
  await revokeRefreshCookie();
  clearAuth();
}

export async function setupProfile(handle, displayName, bio) {
  const { data } = await client.post('/social-profile/setup', {
    handle,
    display_name: displayName,
    ...(bio ? { bio } : {}),
  });
  if (data?.data?.profile_id) {
    const user = getUser();
    if (user) setUser({ ...user, profile_id: data.data.profile_id, username: handle });
  }
  return data;
}
