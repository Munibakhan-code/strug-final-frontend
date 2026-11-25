/**
 * Legacy device-local scheduled chat queue (localStorage).
 * New schedules go through POST /scheduled-chat-messages; these helpers remain for
 * one-time migration of older device-only drafts and schedule-time validation.
 */

export const SCHEDULED_MSGS_STORAGE_PREFIX = "strug_scheduled_msgs";
export const SCHEDULED_CHAT_MIN_LEAD_MS = 30_000;

export function scheduledMsgsStorageKey(userId) {
  const id = userId == null || userId === "" ? "anon" : String(userId);
  return `${SCHEDULED_MSGS_STORAGE_PREFIX}:${id}`;
}

/** Migrate legacy unscoped `strug_scheduled_msgs` into the user key once. */
export function loadScheduledMsgs(userId, storage = localStorage) {
  const key = scheduledMsgsStorageKey(userId);
  try {
    const raw = storage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
    // One-time migrate from pre-user-scoped key.
    const legacy = storage.getItem(SCHEDULED_MSGS_STORAGE_PREFIX);
    if (!legacy) return [];
    const parsed = JSON.parse(legacy);
    const list = Array.isArray(parsed) ? parsed : [];
    if (list.length && userId != null && userId !== "") {
      storage.setItem(key, JSON.stringify(list));
      storage.removeItem(SCHEDULED_MSGS_STORAGE_PREFIX);
    }
    return list;
  } catch {
    return [];
  }
}

export function saveScheduledMsgs(userId, arr, storage = localStorage) {
  try {
    storage.setItem(scheduledMsgsStorageKey(userId), JSON.stringify(Array.isArray(arr) ? arr : []));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Split queue into due vs remaining. Does not mutate storage.
 * @param {Array<{ scheduledFor: number }>} queue
 * @param {number} [now]
 */
export function partitionDueScheduledMsgs(queue, now = Date.now()) {
  const list = Array.isArray(queue) ? queue : [];
  const due = [];
  const remaining = [];
  for (const entry of list) {
    const at = Number(entry?.scheduledFor);
    if (Number.isFinite(at) && at <= now) due.push(entry);
    else remaining.push(entry);
  }
  return { due, remaining };
}

/**
 * Remove one entry by clientMsgId after a successful send (or cancel).
 */
export function removeScheduledMsg(queue, clientMsgId) {
  const id = String(clientMsgId || "");
  return (Array.isArray(queue) ? queue : []).filter((e) => String(e?.clientMsgId) !== id);
}

/**
 * Validate schedule is at least `minLeadMs` in the future.
 */
export function isValidScheduleTime(scheduledFor, now = Date.now(), minLeadMs = SCHEDULED_CHAT_MIN_LEAD_MS) {
  const at = Number(scheduledFor);
  return Number.isFinite(at) && at >= now + minLeadMs;
}

/**
 * Map a legacy local scheduledFor onto a server-acceptable time.
 * Past times are dropped (null). Times inside the lead window are bumped to now+lead
 * so near-term drafts still deliver instead of being wiped or stuck on-device.
 */
export function coerceScheduleForMigration(
  scheduledFor,
  now = Date.now(),
  minLeadMs = SCHEDULED_CHAT_MIN_LEAD_MS,
) {
  const at = Number(scheduledFor);
  if (!Number.isFinite(at) || at <= now) return null;
  if (at < now + minLeadMs) return now + minLeadMs;
  return at;
}

/**
 * Build PATCH body for editing a pending schedule. Omits `scheduledFor` when the
 * picker still shows the original time so the API does not re-apply the lead check.
 * @returns {{ ok: true, payload: { content: string, scheduledFor?: number } } | { ok: false, error: 'empty' | 'too_soon' }}
 */
export function buildScheduledMessageUpdatePayload({
  content,
  scheduledFor,
  originalScheduledFor,
  now = Date.now(),
  minLeadMs = SCHEDULED_CHAT_MIN_LEAD_MS,
}) {
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) return { ok: false, error: "empty" };
  const payload = { content: text };
  if (scheduledFor == null || scheduledFor === "") return { ok: true, payload };
  const next = Number(scheduledFor);
  const orig = Number(originalScheduledFor);
  if (Number.isFinite(orig) && Number.isFinite(next) && next === orig) {
    return { ok: true, payload };
  }
  if (!isValidScheduleTime(next, now, minLeadMs)) {
    return { ok: false, error: "too_soon" };
  }
  return { ok: true, payload: { ...payload, scheduledFor: next } };
}

/**
 * Push device-local drafts to POST /scheduled-chat-messages.
 * Only removes entries that succeeded (or returned an idempotent pending row).
 * Failed creates stay in storage for a later pass.
 *
 * @param {{
 *   userId: number|string,
 *   createScheduledMessage: (body: object) => Promise<unknown>,
 *   storage?: Storage,
 *   now?: number,
 *   minLeadMs?: number,
 * }} opts
 */
export async function migrateLegacyScheduledMsgs({
  userId,
  createScheduledMessage,
  storage = localStorage,
  now = Date.now(),
  minLeadMs = SCHEDULED_CHAT_MIN_LEAD_MS,
}) {
  const legacy = loadScheduledMsgs(userId, storage);
  if (!legacy.length) return { migrated: 0, remaining: 0 };

  const remaining = [];
  let migrated = 0;

  for (const entry of legacy) {
    const scheduledFor = coerceScheduleForMigration(entry?.scheduledFor, now, minLeadMs);
    if (scheduledFor == null) {
      // Past draft: drop (server flush never saw it; keeping it forever is noise).
      continue;
    }
    try {
      await createScheduledMessage({
        channelId: entry.channelId,
        content: entry.content,
        contentType: entry.contentType || "text",
        clientMsgId: entry.clientMsgId,
        scheduledFor,
        metadata: entry.metadata ?? null,
      });
      migrated += 1;
    } catch {
      remaining.push(entry);
    }
  }

  saveScheduledMsgs(userId, remaining, storage);
  return { migrated, remaining: remaining.length };
}
