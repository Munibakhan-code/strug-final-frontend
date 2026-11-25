// Global notification state (Epic 10).
//
// ONE hook, mounted ONCE in AppInner — it replaces the three page-scoped bells
// (FeedNotificationsPanel / WorkNotificationBell / QuoteNotificationBell), which each opened
// their own socket listener and only existed on the page that rendered them.
//
// ⚠️ AUTH-READY RACE — the reason this hook takes `authReady` instead of calling getUser():
// every other global hook (useChatToast:64, useTransactionalToast:64, useChatPush:21,
// useChatUnread:24) does `const user = getUser(); if (!user) return;` inside a mount effect
// with stable deps. On a hard reload sessionStorage is empty until restoreSession() resolves,
// so they all see null, bail, and NEVER re-run — the socket never connects and no notification
// ever arrives for that tab. Gate on authReady (AppInner's `authBooted`) so the effect re-runs
// once the session is actually restored.
//
// ⚠️ SOCKET EVENT NAMES — the backend currently emits a *different, dynamically-suffixed* event
// name per vertical (`work-notification-${uid}`, `quote-notification-${uid}`, …) even though the
// `user-${id}` room already scopes delivery. That is precisely why no global listener was
// possible before. We subscribe to all the legacy names AND to the unified `notification:new`
// that Epic 10 Phase 1 introduces, so this hook keeps working across the migration and the
// legacy names can be deleted server-side without touching the UI.

import { useState, useEffect, useCallback, useRef } from 'react';
import { connectSocket, getSocket, registerSocialProfileRoom } from '../api/socket';
import { getAuthUserId, getUser } from '../store/auth';
import { fetchAllNotifications, markOneRead, markEverythingRead, deleteOne } from '../api/notifications';

/** The unified event. Everything below it is legacy and goes away after Phase 1. */
const UNIFIED_EVENT = 'notification:new';
const legacyEvents = (uid) => [
  'new-notification',            // social — already stable (services/live-notify.js:68 does it right)
  `work-notification-${uid}`,
  `quote-notification-${uid}`,
  'quote-request-new',
];

export function useNotifications(authReady) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  // Locally-dismissed rows. The unified table now has a real DELETE route, so a dismissed unified
  // row is gone server-side; the legacy silos have no delete, so for those "dismiss" is a
  // local hide + mark-read. Either way this ref keeps the row hidden for the rest of the session
  // (belt-and-suspenders against a refetch racing the delete). A ref (not state) because the
  // filter below reads it without needing to re-run on every mutation — setItems re-renders.
  const dismissed = useRef(new Set());
  // Guards against a socket burst (e.g. 5 offers at once) triggering 5 concurrent refetches.
  const refetching = useRef(false);

  const refresh = useCallback(async () => {
    if (refetching.current) return;
    refetching.current = true;
    try {
      const rows = await fetchAllNotifications();
      setItems(rows.filter((r) => !dismissed.current.has(r.key)));
    } catch {
      // Fail-soft: a notification fetch must never break the app shell.
    } finally {
      refetching.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authReady) return undefined;
    const uid = getAuthUserId();
    if (uid == null) return undefined;

    refresh();

    const socket = connectSocket();
    // Social notifications are delivered to the `profile_<id>` room, not `user-<id>`, so the
    // profile room still has to be joined explicitly. (Another artefact of the profile_id /
    // user_id identity split that Phase 1 removes.)
    const profileId = getUser()?.profile_id;
    if (profileId != null) registerSocialProfileRoom(profileId);

    const onIncoming = () => refresh();
    const names = [UNIFIED_EVENT, ...legacyEvents(uid)];
    names.forEach((n) => socket.on(n, onIncoming));

    // Reconnect can miss events, so re-sync on connect.
    socket.on('connect', onIncoming);

    // Fallback for a socket that never connects: refresh on tab focus.
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onIncoming);

    // Last-resort slow poll if the socket stays unreachable.
    const pollId = window.setInterval(refresh, 45000);

    // Existing in-app bus — chat marks its notifications read and fires this (api/chat.js:364).
    window.addEventListener('strug:notifications-update', onIncoming);

    return () => {
      const s = getSocket();
      names.forEach((n) => s?.off(n, onIncoming));
      s?.off('connect', onIncoming);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onIncoming);
      window.clearInterval(pollId);
      window.removeEventListener('strug:notifications-update', onIncoming);
    };
  }, [authReady, refresh]);

  const unread = items.reduce((n, i) => (i.read ? n : n + 1), 0);

  const markRead = useCallback(async (n) => {
    if (n.read) return;
    // Optimistic — the panel must feel instant; a failed PATCH self-corrects on next refresh.
    // The work silo has no per-row endpoint, so marking one work row read clears them all.
    setItems((prev) =>
      prev.map((i) =>
        i.key === n.key || (n.source === 'work' && i.source === 'work') ? { ...i, read: true } : i,
      ),
    );
    try { await markOneRead(n); } catch { refresh(); }
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((i) => (i.read ? i : { ...i, read: true })));
    try { await markEverythingRead(); } catch { refresh(); }
  }, [refresh]);

  // Clear a single row from the panel without navigating. Optimistic: hide immediately, then
  // delete server-side (unified rows) or fall back to mark-read (legacy silos with no delete).
  // A failed delete is swallowed — the row is already hidden and `dismissed` keeps it that way.
  const dismiss = useCallback((n) => {
    dismissed.current.add(n.key);
    setItems((prev) => prev.filter((i) => i.key !== n.key));
    const p = deleteOne(n);
    if (p) p.catch(() => {});
    else if (!n.read) markOneRead(n).catch(() => {});
  }, []);

  return {
    items, unread, loading,
    open, setOpen,
    toggle: useCallback(() => setOpen((v) => !v), []),
    close: useCallback(() => setOpen(false), []),
    markRead, markAllRead, dismiss, refresh,
  };
}
