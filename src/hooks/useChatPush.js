import { useEffect, useRef } from 'react';
import { getUser } from '../store/auth';
import { connectSocket, registerSocialProfileRoom } from '../api/socket';
import { subscribeChatEvents } from '../api/chatSocket';
import { isViewingChatChannel } from '../utils/chatViewing.js';
import { shouldQuietChatPush } from '../utils/chatQuietPrefs.js';
import { initWebPush, getPushPreferences } from '../api/push';

function canUsePush() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function requestChatPushPermission() {
  if (!canUsePush() || Notification.permission !== 'default') return Promise.resolve(Notification.permission);
  try {
    // iOS Safari (16.4+) throws synchronously here when the page hasn't been
    // added to the home screen yet, instead of rejecting the returned promise.
    return Notification.requestPermission();
  } catch {
    return Promise.resolve(Notification.permission);
  }
}

const PUSH_PREFS_CACHE_KEY = 'strug_push_prefs_cache';

function chatPushAllowedFromCache() {
  try {
    const raw = localStorage.getItem(PUSH_PREFS_CACHE_KEY);
    if (!raw) return true; // missing key = allowed (sparse opt-out)
    const cats = JSON.parse(raw)?.categories;
    if (!cats || typeof cats !== 'object') return true;
    return cats.chat !== false;
  } catch {
    return true;
  }
}

async function chatPushAllowed() {
  try {
    const d = await getPushPreferences();
    if (d?.categories) {
      try { localStorage.setItem(PUSH_PREFS_CACHE_KEY, JSON.stringify({ categories: d.categories })); } catch { /* noop */ }
      return d.categories.chat !== false;
    }
  } catch { /* fall through to cache */ }
  return chatPushAllowedFromCache();
}

// `authReady` is AppInner's `authBooted`. Without it this effect ran once at mount, read a
// sessionStorage that restoreSession() had not populated yet, saw null, bailed — and, with only
// stable deps, NEVER re-ran. On a hard reload or a new tab that silently meant no socket, no
// push registration, no toasts, for the whole session. Gate on authReady, not a one-shot read.
export function useChatPush(authReady) {
  const recentRef = useRef(new Set());

  useEffect(() => {
    if (!authReady) return undefined;
    const user = getUser();
    if (!user || !canUsePush()) return undefined;

    connectSocket();
    if (user.profile_id) registerSocialProfileRoom(user.profile_id);

    // Do NOT auto-prompt when permission is still 'default' — Settings owns the opt-in.
    // Only re-register the SW/subscription when already granted.
    if (Notification.permission === 'granted') {
      initWebPush();
    }

    const showPush = async (n) => {
      if (Notification.permission !== 'granted') return;
      if (!(await chatPushAllowed())) return;

      const channelId = n.channel_id ?? null;
      if (channelId == null) return;
      if (shouldQuietChatPush(channelId)) return;

      const key = n.target_id ? `msg-${n.target_id}` : `ch-${channelId}`;
      if (recentRef.current.has(key)) return;
      recentRef.current.add(key);
      setTimeout(() => recentRef.current.delete(key), 5000);

      const body = String(n.content ?? n.body ?? n.message ?? 'New message').slice(0, 120);

      if (isViewingChatChannel(channelId)) return;
      if (document.visibilityState === 'visible' && document.hasFocus()) return;

      const title = n.sender?.handle ? `@${n.sender.handle}` : 'Strug';
      try {
        const notif = new Notification(title, {
          body,
          icon: n.sender?.profile_pic_url || '/favicon.ico',
          tag: `chat-${n.target_id ?? 'new'}`,
        });
        notif.onclick = () => {
          window.focus();
          import('../api/chat').then(({ openChatFromNotification }) => {
            openChatFromNotification(n);
          });
          notif.close();
        };
      } catch {
        /* ignore */
      }
    };

    const unsub = subscribeChatEvents({
      onNotification: (n) => {
        if (n?.type === 'CHAT_MESSAGE') showPush(n);
      },
    });

    return () => {
      unsub();
    };
  }, [authReady]);
}
