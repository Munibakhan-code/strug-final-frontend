import { useState, useEffect, useCallback } from 'react';
import { getTotalUnreadCount } from '../api/chat';
import { connectSocket, registerSocialProfileRoom } from '../api/socket';
import { subscribeChatEvents } from '../api/chatSocket';
import { getUser } from '../store/auth';
import { isViewingChatChannel } from '../utils/chatViewing.js';

function normalizeUserId(id) {
  if (id == null || id === '') return null;
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

// `authReady` = AppInner's `authBooted`. See useChatPush for why a one-shot getUser() in a
// mount effect silently disables this hook for the whole session on a hard reload.
export function useChatUnread(authReady) {
  const [unreadTotal, setUnreadTotal] = useState(0);

  const refresh = useCallback(() => {
    getTotalUnreadCount()
      .then(setUnreadTotal)
      .catch(() => setUnreadTotal(0));
  }, []);

  useEffect(() => {
    if (!authReady) return undefined;
    const user = getUser();
    if (!user) return undefined;

    refresh();
    connectSocket();
    if (user.profile_id) registerSocialProfileRoom(user.profile_id);

    const onInboxUpdate = () => refresh();
    window.addEventListener('strug:chat-inbox-update', onInboxUpdate);

    const myUserId = normalizeUserId(user.user_id ?? user.id);

    const unsub = subscribeChatEvents({
      onMessageCreated: (msg) => {
        const channelId = msg?.channel_id;
        const senderId = msg?.sender_id ?? msg?.user?.user_id;
        if (normalizeUserId(senderId) === myUserId) return;
        if (channelId != null && isViewingChatChannel(channelId)) return;
        onInboxUpdate();
      },
      onNotification: (n) => {
        if (n?.type === 'CHAT_MESSAGE') {
          if (n.channel_id != null && isViewingChatChannel(n.channel_id)) return;
          onInboxUpdate();
          return;
        }
        onInboxUpdate();
      },
      onMessagesRead: onInboxUpdate,
    });

    return () => {
      window.removeEventListener('strug:chat-inbox-update', onInboxUpdate);
      unsub();
    };
  }, [refresh, authReady]);

  return unreadTotal;
}
