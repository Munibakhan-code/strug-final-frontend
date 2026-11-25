/**
 * Device-local mute / snooze prefs used by Messages and chat browser push.
 * Forever mute should also call muteChannel (server); timed mute/snooze are local-only.
 */

export const MUTED_CONVS_KEY = "strug_muted_convs";
export const SNOOZE_UNTIL_KEY = "strug_snooze_until";
export const SNOOZE_CONVS_KEY = "strug_snooze_convs";

function defaultStorage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function readJsonObject(key, storage = defaultStorage()) {
  if (!storage) return {};
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Latest mute map from storage (not a React closure snapshot). */
export function loadMutedConvs(storage = defaultStorage()) {
  return readJsonObject(MUTED_CONVS_KEY, storage);
}

/**
 * Patch one channel's mute entry using the current storage map so concurrent
 * toggles after an await cannot wipe sibling channels.
 * @param {unknown} channelId
 * @param {number|null|undefined} value `-1` forever, epoch ms for timed, null/undefined to clear
 * @param {Storage} [storage]
 * @returns {Record<string, number>}
 */
export function patchMutedConv(channelId, value, storage = defaultStorage()) {
  const map = { ...loadMutedConvs(storage) };
  if (channelId == null || channelId === "") return map;
  const key = String(channelId);
  // Drop both string and numeric keys so we never leave a stale twin entry.
  delete map[key];
  delete map[channelId];
  if (value != null && Number.isFinite(Number(value))) {
    map[key] = Number(value);
  }
  if (storage) {
    try {
      storage.setItem(MUTED_CONVS_KEY, JSON.stringify(map));
    } catch {
      /* quota / private mode */
    }
  }
  return map;
}

/** @param {unknown} channelId @param {number} [now] @param {Storage} [storage] */
export function isChannelMutedLocally(channelId, now = Date.now(), storage = defaultStorage()) {
  if (channelId == null || channelId === "") return false;
  const map = readJsonObject(MUTED_CONVS_KEY, storage);
  const v = map[String(channelId)] ?? map[channelId];
  return v === -1 || (typeof v === "number" && v > now);
}

/** @param {number} [now] @param {Storage} [storage] */
export function isGloballySnoozedLocally(now = Date.now(), storage = defaultStorage()) {
  if (!storage) return false;
  try {
    const until = Number(storage.getItem(SNOOZE_UNTIL_KEY) || 0);
    return Number.isFinite(until) && until > now;
  } catch {
    return false;
  }
}

/** @param {unknown} channelId @param {number} [now] @param {Storage} [storage] */
export function isChannelSnoozedLocally(channelId, now = Date.now(), storage = defaultStorage()) {
  if (channelId == null || channelId === "") return false;
  const map = readJsonObject(SNOOZE_CONVS_KEY, storage);
  const until = map[String(channelId)] ?? map[channelId];
  return typeof until === "number" && until > now;
}

/**
 * True when browser/in-app chat push should stay quiet for this channel.
 * @param {unknown} channelId
 * @param {number} [now]
 * @param {Storage} [storage]
 */
export function shouldQuietChatPush(channelId, now = Date.now(), storage = defaultStorage()) {
  if (isGloballySnoozedLocally(now, storage)) return true;
  if (channelId == null || channelId === "") return false;
  return isChannelMutedLocally(channelId, now, storage) || isChannelSnoozedLocally(channelId, now, storage);
}

/**
 * Remove a user id from Messages' local block filter (`strug_blocked`).
 * @param {unknown} userId
 * @param {Storage} [storage]
 */
export function removeBlockedUserIdFromStorage(userId, storage = defaultStorage()) {
  const uid = Number(userId);
  if (!storage || !Number.isFinite(uid) || uid <= 0) return false;
  try {
    const raw = storage.getItem("strug_blocked");
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return false;
    const next = parsed.filter((id) => Number(id) !== uid);
    if (next.length === parsed.length) return false;
    storage.setItem("strug_blocked", JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export const BLOCKED_CHANGED_EVENT = "strug:blocked-changed";

export function notifyBlockedUsersChanged() {
  try {
    window.dispatchEvent(new CustomEvent(BLOCKED_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}
