import { getWishlist } from '../api/wishlist.js';
import { getAuthUserId, isAuthenticated } from '../store/auth.js';
import { wishlistMembershipKey } from './wishlistAdd.js';

/** In-memory membership for the signed-in user's wishlist (survives remounts in-session). */
let cachedUserId = null;
let keys = new Set();
let loadPromise = null;

function resetIfUserChanged() {
  const uid = getAuthUserId();
  if (uid == null || uid === '') {
    cachedUserId = null;
    keys = new Set();
    loadPromise = null;
    return null;
  }
  if (cachedUserId != null && String(cachedUserId) !== String(uid)) {
    cachedUserId = null;
    keys = new Set();
    loadPromise = null;
  }
  return uid;
}

function ingestItems(items) {
  const next = new Set();
  for (const row of Array.isArray(items) ? items : []) {
    if (!row || row.status === 'removed') continue;
    const k = wishlistMembershipKey(row.item_type, row.item_ref_id);
    if (k) next.add(k);
  }
  keys = next;
}

/** Ensure current user's wishlist refs are loaded (one request, shared). */
export async function ensureWishlistMembership() {
  if (!isAuthenticated()) {
    keys = new Set();
    cachedUserId = null;
    loadPromise = null;
    return keys;
  }
  const uid = resetIfUserChanged();
  if (uid == null) return keys;
  if (cachedUserId != null && String(cachedUserId) === String(uid) && loadPromise === null) {
    // Already loaded for this user
    return keys;
  }
  if (loadPromise && String(cachedUserId) === String(uid)) return loadPromise;

  cachedUserId = uid;
  loadPromise = getWishlist(uid)
    .then((data) => {
      ingestItems(data);
      loadPromise = null;
      return keys;
    })
    .catch(() => {
      // Soft-fail: leave empty so hearts stay empty; user can still add
      loadPromise = null;
      return keys;
    });
  return loadPromise;
}

export function isWishlistMember(itemType, itemRefId) {
  const k = wishlistMembershipKey(itemType, itemRefId);
  return k ? keys.has(k) : false;
}

/** After a successful add, keep hearts filled without refetch. */
export function markWishlistMember(itemType, itemRefId) {
  const k = wishlistMembershipKey(itemType, itemRefId);
  if (k) keys.add(k);
}

export function clearWishlistMembershipCache() {
  cachedUserId = null;
  keys = new Set();
  loadPromise = null;
}
