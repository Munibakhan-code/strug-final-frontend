import { useState, useEffect, useRef, useCallback } from "react";
import { getUser } from "../store/auth";
import { connectSocket, registerSocialProfileRoom } from "../api/socket";
import { subscribeChatEvents } from "../api/chatSocket";
import { isViewingChatChannel } from "../utils/chatViewing.js";

function chatUserId(id) {
  if (id == null || id === "") return null;
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

// `authReady` = AppInner's `authBooted`. See useChatPush for why a one-shot getUser() in a
// mount effect silently disables this hook for the whole session on a hard reload.
export function useChatToast({ activeNav, onOpenChat, authReady }) {
  const [toast, setToast] = useState(null);
  const hideTimerRef = useRef(null);
  const recentKeysRef = useRef(new Set());
  // `activeNavRef` used to be declared here and written during render. Nothing ever read it,
  // so it was a no-op that also violated the "no ref writes during render" rule.

  const dismiss = useCallback(() => {
    clearTimeout(hideTimerRef.current);
    setToast(null);
  }, []);

  const showToast = useCallback((payload) => {
    clearTimeout(hideTimerRef.current);
    setToast(payload);
    hideTimerRef.current = setTimeout(() => setToast(null), 5500);
  }, []);

  const shouldShow = useCallback((key) => {
    if (recentKeysRef.current.has(key)) return false;
    recentKeysRef.current.add(key);
    setTimeout(() => recentKeysRef.current.delete(key), 4000);
    return true;
  }, []);

  const openChat = useCallback(
    (channelId) => {
      dismiss();
      onOpenChat?.(channelId);
    },
    [dismiss, onOpenChat],
  );

  useEffect(() => {
    if (!authReady) return undefined;
    const user = getUser();
    if (!user) return undefined;

    connectSocket();
    if (user.profile_id) registerSocialProfileRoom(user.profile_id);

    const myUserId = chatUserId(user.user_id ?? user.id);

    const presentToast = ({ channelId, messageId, title, body, pic }) => {
      if (channelId == null) return;
      if (isViewingChatChannel(channelId)) return;
      const key = messageId ? `msg-${messageId}` : `ch-${channelId}-${Date.now()}`;
      if (!shouldShow(key)) return;
      showToast({ channelId, title, body, pic });
    };

    const unsub = subscribeChatEvents({
      onMessageCreated: (msg) => {
        const senderId = msg.sender_id ?? msg.user?.user_id;
        if (chatUserId(senderId) === myUserId) return;
        const name = msg.user?.name ?? msg.sender?.handle ?? msg.user?.username ?? "Someone";
        const profiles = msg.user?.social_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        presentToast({
          channelId: msg.channel_id,
          messageId: msg.message_id ?? msg.id,
          title: name,
          body: (msg.content ?? "Sent a message").slice(0, 90),
          pic: profile?.profile_pic_url ?? msg.user?.profile_pic_url ?? null,
        });
      },
      onNotification: (n) => {
        if (n?.type !== "CHAT_MESSAGE") return;
        const channelId = n.channel_id ?? null;
        if (channelId == null) return;
        if (isViewingChatChannel(channelId)) return;

        const body = String(
          n.content ?? n.body ?? n.message ?? "Sent you a message",
        ).slice(0, 90);

        presentToast({
          channelId,
          messageId: n.target_id,
          title: n.sender?.handle ? `@${n.sender.handle}` : "New message",
          body,
          pic: n.sender?.profile_pic_url ?? null,
        });
      },
    });

    return () => {
      unsub();
      clearTimeout(hideTimerRef.current);
    };
  }, [shouldShow, showToast, authReady]);

  return { toast, dismiss, openChat };
}
