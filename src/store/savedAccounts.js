/**
 * Multi-account roster (Gmail / X style).
 *
 * The httpOnly refresh cookie is browser-wide (one active account). We keep a
 * local vault of recently used accounts + their last access token so the profile
 * flyout can switch without a full re-login while the token is still valid (~1h).
 * Switching rebinds the refresh cookie via /auth/session/refresh-cookie.
 *
 * Tokens in localStorage are XSS-sensitive — same class as the active access
 * token already living in sessionStorage. Device UI prefs stay global; per-user
 * cache wipe on id change remains in auth.setUser (bug #50).
 */
import {
  getToken,
  getUser,
  setToken,
  setUser,
  setSessionOwner,
  clearPerUserState,
  userIdFromAccessToken,
} from './auth.js';

const ACCOUNTS_KEY = 'strug_saved_accounts';
const ADDING_FLAG = 'strug_adding_account';
export const MAX_SAVED_ACCOUNTS = 8;

function userIdOf(user) {
  const id = user?.user_id ?? user?.id ?? null;
  return id === '' || id == null ? null : id;
}

function normalizeId(id) {
  if (id == null || id === '') return null;
  const n = Number(id);
  return Number.isNaN(n) ? String(id) : n;
}

function idsEqual(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function readList() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeList(list) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  } catch {
    /* private mode / quota */
  }
}

/** Public profile fields only — never password / secrets. */
export function accountSnapshot(user, accessToken) {
  const userId = normalizeId(userIdOf(user) ?? userIdFromAccessToken(accessToken));
  if (userId == null) return null;
  return {
    userId,
    profile_id: user?.profile_id ?? null,
    created_at: user?.created_at ?? user?.createdAt ?? user?.social_created_at ?? user?.socialCreatedAt ?? null,
    social_created_at: user?.social_created_at ?? user?.socialCreatedAt ?? user?.created_at ?? user?.createdAt ?? null,
    name: user?.name ?? user?.display_name ?? null,
    email: user?.email ?? user?.login ?? null,
    username: user?.username ?? user?.handle ?? null,
    profile_pic_url: user?.profile_pic_url ?? null,
    language: user?.language ?? null,
    currency: user?.currency ?? null,
    country: user?.country ?? null,
    is_creator: user?.is_creator ?? false,
    is_seller: user?.is_seller ?? false,
    is_driver: user?.is_driver ?? false,
    is_courier: user?.is_courier ?? false,
    has_password: user?.has_password ?? null,
    has_seen_welcome: user?.has_seen_welcome ?? null,
    accessToken: accessToken || null,
    savedAt: Date.now(),
  };
}

export function listSavedAccounts() {
  return readList();
}

export function getSavedAccount(userId) {
  const id = normalizeId(userId);
  if (id == null) return null;
  return readList().find((a) => idsEqual(a.userId, id)) || null;
}

export function upsertSavedAccount(user, accessToken) {
  const snap = accountSnapshot(user, accessToken);
  if (!snap) return null;
  const prev = readList().filter((a) => !idsEqual(a.userId, snap.userId));
  const next = [snap, ...prev].slice(0, MAX_SAVED_ACCOUNTS);
  writeList(next);
  return snap;
}

/** Persist the currently active session into the vault (no-op if signed out). */
export function rememberActiveAccount() {
  const token = getToken();
  const user = getUser();
  if (!token || !user) return null;
  return upsertSavedAccount(user, token);
}

export function updateSavedAccountToken(userId, accessToken) {
  const id = normalizeId(userId);
  if (id == null || !accessToken) return;
  const list = readList();
  let changed = false;
  const next = list.map((a) => {
    if (!idsEqual(a.userId, id)) return a;
    changed = true;
    return { ...a, accessToken, savedAt: Date.now() };
  });
  if (changed) writeList(next);
}

export function removeSavedAccount(userId) {
  const id = normalizeId(userId);
  if (id == null) return;
  writeList(readList().filter((a) => !idsEqual(a.userId, id)));
}

export function clearSavedAccounts() {
  try {
    localStorage.removeItem(ACCOUNTS_KEY);
  } catch { /* ignore */ }
}

export function isAccessTokenExpired(token) {
  if (!token || typeof token !== 'string') return true;
  try {
    const part = token.split('.')[1];
    if (!part) return false; // opaque / legacy — treat as usable until API says otherwise
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.exp !== 'number') return false;
    // 30s skew so we don't switch into a token that dies mid-flight
    return payload.exp * 1000 <= Date.now() + 30_000;
  } catch {
    return true;
  }
}

export function setAddingAccountFlag(on) {
  try {
    if (on) localStorage.setItem(ADDING_FLAG, '1');
    else localStorage.removeItem(ADDING_FLAG);
  } catch { /* ignore */ }
}

export function isAddingAccount() {
  try {
    return localStorage.getItem(ADDING_FLAG) === '1';
  } catch {
    return false;
  }
}

/**
 * Drop active sessionStorage identity without wiping the saved-accounts vault
 * or device prefs. Caller decides whether to revoke the refresh cookie.
 */
export function clearActiveSessionKeepAccounts() {
  try {
    sessionStorage.removeItem('strug_access_token');
    sessionStorage.removeItem('strug_user');
  } catch { /* ignore */ }
  clearPerUserState();
}

/** Activate a vault entry into the live session (does not touch the refresh cookie). */
export function applySavedAccountSession(account) {
  if (!account?.accessToken) return false;
  const user = {
    user_id: account.userId,
    ...(account.profile_id != null ? { profile_id: account.profile_id } : {}),
    ...(account.created_at != null ? { created_at: account.created_at } : {}),
    ...(account.social_created_at != null ? { social_created_at: account.social_created_at } : {}),
    ...(account.name != null ? { name: account.name } : {}),
    ...(account.email != null ? { email: account.email } : {}),
    ...(account.username != null ? { username: account.username } : {}),
    ...(account.profile_pic_url != null ? { profile_pic_url: account.profile_pic_url } : {}),
    ...(account.language != null ? { language: account.language } : {}),
    ...(account.currency != null ? { currency: account.currency } : {}),
    ...(account.country != null ? { country: account.country } : {}),
    ...(account.is_creator != null ? { is_creator: Boolean(account.is_creator) } : {}),
    ...(account.is_seller != null ? { is_seller: Boolean(account.is_seller) } : {}),
    ...(account.is_driver != null ? { is_driver: Boolean(account.is_driver) } : {}),
    ...(account.is_courier != null ? { is_courier: Boolean(account.is_courier) } : {}),
    ...(account.has_password != null ? { has_password: Boolean(account.has_password) } : {}),
    ...(account.has_seen_welcome != null ? { has_seen_welcome: Boolean(account.has_seen_welcome) } : {}),
  };
  setToken(account.accessToken);
  setUser(user);
  setSessionOwner(user);
  return true;
}

/** After a successful refresh of the active session, keep the vault token fresh. */
export function syncSavedAccountAfterRefresh(accessToken, user) {
  const id = userIdOf(user) ?? userIdFromAccessToken(accessToken);
  if (id == null || !accessToken) return;
  if (user) upsertSavedAccount(user, accessToken);
  else updateSavedAccountToken(id, accessToken);
}
