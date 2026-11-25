// Unified notification read layer (Epic 10).
//
// Phase 1 shipped a single backend endpoint — GET /notifications — backed by one `notification`
// table that every vertical writes through services/notify.js. That is now the source of truth,
// and it is the ONLY source that carries rides + orders.
//
// The four legacy siloed tables (social / work / quote) still exist and still receive writes, so
// during rollout we merge the unified feed with the legacy ones and de-dupe. Once every
// dispatch path writes only through notify() and the legacy bells are retired, the LEGACY_SOURCES
// block below can be deleted and this becomes a thin wrapper over /notifications.
//
// Normalised shape (`Notif`): { key, source, id, vertical, type, urgency, title, body,
//                               createdAt, read, nav, expiresAt }

import client from './client';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from './social';
import { getWorkNotifications, markWorkNotificationsRead } from './ondemandwork';
import { getQuoteNotifications, markAllQuoteNotificationsRead, markQuoteNotificationRead } from './quotes';

// Drives the panel's filter chips. MUST list every vertical the backend can emit — a vertical
// present in VERTICAL_LABELS but missing here can never be filtered to. `booking` and `system`
// were omitted originally and were silently unfilterable.
export const VERTICAL_ORDER = [
  'rideshare', 'ecommerce', 'food', 'courier', 'work', 'jobs', 'quotes', 'booking',
  'social', 'video', 'live', 'townhall', 'payments', 'system',
];

export const VERTICAL_LABELS = {
  rideshare: 'Rides',
  ecommerce: 'Deliveries',
  food: 'Food',
  courier: 'Courier',
  work: 'Work',
  jobs: 'Jobs',
  quotes: 'Quotes',
  social: 'Social',
  booking: 'Bookings',
  video: 'Video',
  live: 'Live',
  townhall: 'Town Hall',
  payments: 'Payments',
  system: 'System',
};

const asArray = (r) => (Array.isArray(r) ? r : (r?.items ?? r?.notifications ?? r?.data ?? []));
const ts = (v) => (v ? new Date(v).getTime() : 0);

// The unified feed is the source of truth for rides + orders; the legacy silos (social/work/quote)
// are supplementary and on their way out. Don't let one slow silo endpoint hold the whole panel on
// a loading skeleton for the full 15s client timeout — cap each at 5s and merge whatever came back.
function withDeadline(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('notif-silo-timeout')), ms)),
  ]);
}

// ── Unified endpoint (Phase 1) ──────────────────────────────────────────────
// Rows already arrive in the canonical shape; only re-key for the merge + de-dupe.
function normaliseUnified(n) {
  return {
    key: `notif:${n.notification_id}`,
    source: 'notif',
    id: n.notification_id,
    vertical: n.vertical || 'system',
    type: n.type,
    urgency: n.urgency || 'ambient',
    title: n.title,
    body: n.body ?? null,
    createdAt: n.created_at,
    read: !!n.is_read,
    nav: n.action_url || null,
    // Entity identity for an actionable row (e.g. entityType 'ride_request', entityId 42) plus
    // the vertical-specific payload. Carried through so an inline Accept/Decline can target the
    // real endpoint (acceptRide / acceptWorkOffer / acceptBooking) without a round-trip. Only the
    // unified source has these; legacy silos leave them null.
    entityType: n.entity_type ?? null,
    entityId: n.entity_id ?? null,
    data: n.data ?? null,
    expiresAt: n.expires_at ?? null,
  };
}

// ── Legacy silos (pre-Phase-1; removable once fully migrated) ────────────────
function normaliseSocial(n) {
  const type = String(n.type || '').toUpperCase();
  const handle = n.sender?.handle;
  const at = handle ? `@${handle}` : 'Someone';
  let title;
  let nav = 'social';
  switch (type) {
    case 'LIKE':    title = `${at} liked your post`; break;
    case 'COMMENT': title = `${at} commented on your post`; break;
    case 'FOLLOW':  title = `${at} started following you`; break;
    case 'MENTION': title = `${at} mentioned you`; break;
    case 'DM':
    case 'CHAT_MESSAGE': title = handle ? `Message from ${at}` : 'New message'; nav = 'messages'; break;
    case 'LIVE':    title = n.display_name ? `${n.display_name} is live` : `${at} is live`; nav = 'live'; break;
    default:        title = n.message || 'New notification';
  }
  // Carry the target so the panel can deep-link (#472). The legacy silo only stores target_id
  // (the liked/commented post) — for LIKE/COMMENT/MENTION/REPLY that's a feed post. FOLLOW's
  // target_id is a profile_id the profile page can't consume (it keys on user_id), so leave it
  // null and let those fall back to the category until the backend carries a user_id.
  const entityType = ['LIKE', 'COMMENT', 'MENTION', 'REPLY'].includes(type) ? 'social_post' : null;
  return {
    key: `social:${n.notification_id}`, source: 'social', id: n.notification_id,
    vertical: 'social', type: type.toLowerCase(), urgency: 'ambient', title,
    body: n.content ?? n.message ?? null, createdAt: n.created_at, read: !!n.is_read, nav, expiresAt: null,
    entityType, entityId: entityType ? (n.target_id ?? null) : null,
  };
}

function normaliseWork(n) {
  return {
    key: `work:${n.work_notification_id}`, source: 'work', id: n.work_notification_id,
    vertical: 'work', type: n.type || 'update', urgency: 'ambient', title: n.title,
    body: typeof n.body === 'string' && !n.body.trim().startsWith('{') ? n.body : null,
    createdAt: n.created_at, read: !!n.is_read, nav: 'sd-work', expiresAt: null,
  };
}

function normaliseQuote(n) {
  return {
    key: `quote:${n.quote_notification_id}`, source: 'quote', id: n.quote_notification_id,
    vertical: 'quotes', type: n.type || 'update', urgency: 'ambient', title: n.title,
    body: typeof n.body === 'string' && !n.body.trim().startsWith('{') ? n.body : null,
    createdAt: n.created_at, read: !!n.is_read, nav: 'quotes', expiresAt: null,
  };
}

const getUnified = () => client.get('/notifications').then((r) => r.data);

/**
 * Fetch the unified feed and the legacy silos in parallel, merge newest-first.
 *
 * Fail-soft per source: a 404 on any one (unified endpoint not deployed yet, or a user with no
 * work profile) contributes zero rows and never blanks the panel. De-dupe by (vertical, type,
 * entity) so a row that exists in both the unified table AND a legacy silo shows once.
 */
export async function fetchAllNotifications() {
  const [unified, social, work, quote] = await Promise.allSettled([
    getUnified(),
    withDeadline(getNotifications()),
    withDeadline(getWorkNotifications()),
    withDeadline(getQuoteNotifications()),
  ]);

  const out = [];
  if (unified.status === 'fulfilled') out.push(...asArray(unified.value).map(normaliseUnified));
  if (social.status === 'fulfilled') out.push(...asArray(social.value).map(normaliseSocial));
  if (work.status === 'fulfilled') out.push(...asArray(work.value).map(normaliseWork));
  if (quote.status === 'fulfilled') out.push(...asArray(quote.value).map(normaliseQuote));

  // De-dupe: the unified row wins over a legacy duplicate (it carries urgency + expiry).
  const seen = new Set();
  const deduped = [];
  for (const n of out.sort((a, b) => ts(b.createdAt) - ts(a.createdAt))) {
    // Prefer identity by title+vertical+minute — legacy and unified rows have different ids but
    // describe the same event. Unified rows come first only when newer; to make them win
    // deterministically, key on vertical+type+title and let the first (newest) survive.
    const dupeKey = `${n.vertical}|${n.type}|${n.title}|${n.body ?? ''}`;
    if (seen.has(dupeKey)) continue;
    seen.add(dupeKey);
    deduped.push(n);
  }
  return deduped;
}

/**
 * Permanently dismiss one row. Only the unified table has a DELETE route (Epic 10 (b)); the
 * legacy silos have none, so this returns undefined for them and the caller falls back to
 * mark-read + a local hide. A 404 (already gone) is swallowed by the caller.
 */
export function deleteOne(n) {
  if (n.source === 'notif') return client.delete(`/notifications/${n.id}`).then((r) => r.data);
  return undefined;
}

/** Mark one row read, routed back to whichever source it came from. */
export async function markOneRead(n) {
  if (n.source === 'notif') return client.patch(`/notifications/${n.id}/read`).then((r) => r.data);
  if (n.source === 'social') return markNotificationRead(n.id);
  if (n.source === 'quote') return markQuoteNotificationRead(n.id);
  if (n.source === 'work') return markWorkNotificationsRead(); // work silo has no per-row endpoint
  return undefined;
}

/** Mark everything read across the unified table and every legacy silo. Fail-soft. */
export async function markEverythingRead() {
  await Promise.allSettled([
    client.patch('/notifications/read-all'),
    markAllNotificationsRead(),
    markWorkNotificationsRead(),
    markAllQuoteNotificationsRead(),
  ]);
}
