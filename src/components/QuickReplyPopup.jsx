import React, { useState, useEffect, useRef, useCallback } from "react";
import { Avatar } from "./SafeImage.jsx";
import { getUser } from "../store/auth";
import {
  getChannelMessages,
  sendMessage,
  markMessagesRead,
} from "../api/chat";
import {
  subscribeChatEvents,
  joinChatChannel,
  leaveChatChannel,
} from "../api/chatSocket";
import { mergeChatMessageLists } from "../utils/chatLive.js";
import { useChatLiveFallback } from "../hooks/useChatLiveFallback.js";

/**
 * Board #467: reply to a DM without leaving your current section.
 *
 * When a chat toast arrives (e.g. while watching a video), tapping it used to navigate the
 * whole app to the Messages page. This popup instead expands the conversation IN PLACE — a
 * compact thread + composer anchored bottom-right — so the user reads and replies without
 * losing the video/page they were on. "Open full chat" is the escape hatch to the real page.
 *
 * It is deliberately self-contained (does NOT reuse Messages.jsx's 4.7k-line internals): it
 * loads the last page of messages, subscribes to live inbound for this one channel, and sends
 * over the same REST endpoint. Mirrors Messages.jsx's socket lifecycle
 * (join + window.__activeChatChannelId) so toasts for the open channel stay suppressed.
 */

function myUserId() {
  const u = getUser();
  const n = Number(u?.user_id ?? u?.id);
  return Number.isFinite(n) ? n : null;
}

function sameUser(a, b) {
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
}

function genClientMsgId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `qr-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

function normalize(msg, me) {
  const senderId = msg.sender_id ?? msg.user?.user_id ?? null;
  return {
    id: msg.message_id ?? msg.id ?? null,
    clientMsgId: msg.client_msg_id ?? msg.metadata?.__client_msg_id ?? null,
    text: msg.content ?? "",
    contentType: msg.content_type ?? "text",
    mine: sameUser(senderId, me),
    sentAt: msg.sent_at ?? msg.created_at ?? null,
    senderName: msg.user?.name ?? msg.user?.username ?? msg.sender?.handle ?? null,
    pending: false,
  };
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function QuickReplyPopup({ channel, onClose, onOpenFull }) {
  const channelId = channel?.channelId ?? null;
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const me = myUserId();

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  // Merge a message in, de-duping by real id and by optimistic client_msg_id.
  const upsert = useCallback((incoming) => {
    setMessages((prev) => {
      const byClient =
        incoming.clientMsgId != null &&
        prev.findIndex((m) => m.clientMsgId != null && m.clientMsgId === incoming.clientMsgId);
      const byId =
        incoming.id != null && prev.findIndex((m) => m.id != null && m.id === incoming.id);
      const idx =
        typeof byClient === "number" && byClient >= 0
          ? byClient
          : typeof byId === "number" && byId >= 0
            ? byId
            : -1;
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...next[idx], ...incoming, pending: false };
        return next;
      }
      return [...prev, incoming];
    });
  }, []);

  const pollOpenThread = useCallback(async (id) => {
    if (id == null || Number(id) !== Number(channelId)) return;
    try {
      const data = await getChannelMessages(id, 20);
      const list = data?.messages ?? (Array.isArray(data) ? data : []);
      setMessages((prev) => {
        const merged = mergeChatMessageLists(prev, list.map((m) => normalize(m, me)));
        if (merged !== prev) scrollToBottom();
        return merged;
      });
    } catch {
      /* next tick retries */
    }
  }, [channelId, me, scrollToBottom]);

  useChatLiveFallback({
    channelId,
    pollThread: pollOpenThread,
  });

  // Load history + wire the socket for THIS channel.
  useEffect(() => {
    if (channelId == null) return undefined;
    let alive = true;
    setLoading(true);
    setError(null);
    setMessages([]);

    // Suppress toasts for the channel we're actively reading (same flag Messages.jsx sets).
    window.__activeChatChannelId = channelId;
    joinChatChannel(channelId).catch(() => {});
    markMessagesRead(channelId).catch(() => {});

    getChannelMessages(channelId, 20)
      .then((data) => {
        if (!alive) return;
        const list = data?.messages ?? (Array.isArray(data) ? data : []);
        // API returns newest-first or oldest-first depending on caller; sort ascending by time/id.
        const mapped = list.map((m) => normalize(m, me));
        mapped.sort((a, b) => {
          const at = a.sentAt ? new Date(a.sentAt).getTime() : 0;
          const bt = b.sentAt ? new Date(b.sentAt).getTime() : 0;
          if (at !== bt) return at - bt;
          return (a.id ?? 0) - (b.id ?? 0);
        });
        setMessages(mapped);
        scrollToBottom();
      })
      .catch(() => {
        if (alive) setError("Couldn't load this conversation.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    const unsub = subscribeChatEvents({
      onMessageCreated: (msg) => {
        if (Number(msg.channel_id) !== Number(channelId)) return;
        upsert(normalize(msg, me));
        const senderId = msg.sender_id ?? msg.user?.user_id;
        if (!sameUser(senderId, me)) markMessagesRead(channelId).catch(() => {});
        scrollToBottom();
      },
    });

    return () => {
      alive = false;
      unsub();
      leaveChatChannel(channelId);
      if (Number(window.__activeChatChannelId) === Number(channelId)) {
        window.__activeChatChannelId = null;
      }
    };
  }, [channelId, me, upsert, scrollToBottom]);

  useEffect(() => {
    if (channelId != null) setTimeout(() => inputRef.current?.focus(), 120);
  }, [channelId]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || channelId == null) return;
    const clientMsgId = genClientMsgId();
    setInput("");
    setSending(true);
    setError(null);
    // Optimistic echo.
    upsert({
      id: null,
      clientMsgId,
      text,
      contentType: "text",
      mine: true,
      sentAt: new Date().toISOString(),
      pending: true,
    });
    scrollToBottom();
    try {
      const saved = await sendMessage(channelId, text, "text", clientMsgId);
      const savedMsg = saved?.message ?? saved;
      if (savedMsg) upsert({ ...normalize(savedMsg, me), clientMsgId });
    } catch {
      setError("Message failed to send. Tap to retry.");
      // Roll the optimistic row back to a retry affordance.
      setMessages((prev) =>
        prev.map((m) =>
          m.clientMsgId === clientMsgId ? { ...m, pending: false, failed: true } : m,
        ),
      );
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, channelId, upsert, me, scrollToBottom]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") onClose?.();
  };

  if (channelId == null) return null;

  // The toast can't always name the sender: a CHAT_MESSAGE notification with no handle (the
  // common path in prod, where cross-replica socket delivery falls back to notifications)
  // arrives titled "New message". Once the thread loads it carries real sender names, so
  // recover the peer's name from the latest inbound message instead of showing a generic label.
  const derivedPeerName = messages.reduce(
    (acc, m) => (!m.mine && m.senderName ? m.senderName : acc),
    null,
  );
  const toastName = channel?.title && channel.title !== "New message" ? channel.title : null;
  const peerName = toastName || derivedPeerName || channel?.title || "Message";
  const peerPic = channel?.pic || null;

  return (
    <div
      role="dialog"
      aria-label={`Conversation with ${peerName}`}
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 220, // above ChatToast (200) so a fresh toast never covers the open reply panel
        width: "min(360px, calc(100vw - 32px))",
        height: "min(460px, calc(100vh - 120px))",
        display: "flex",
        flexDirection: "column",
        // Neutral floating-panel chrome (rule 1), same role/tokens as ChatToast's panel.
        background: "linear-gradient(180deg, var(--color-surface-raised) 0%, var(--color-surface) 100%)",
        border: "1px solid var(--color-border)",
        borderRadius: 16,
        boxShadow: "0 18px 50px var(--color-shadow)",
        overflow: "hidden",
        animation: "chatToastIn 0.22s ease both",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        <Avatar
          url={peerPic}
          initials={peerName?.[0] ?? "M"}
          size={34}
          style={{ background: "#059669", fontWeight: 800, fontSize: 14 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {peerName}
          </p>
          <button
            type="button"
            onClick={() => onOpenFull?.(channelId)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              marginTop: 1,
              fontSize: 11,
              color: "#60a5fa",
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Open full chat
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close conversation"
          style={{
            background: "none",
            border: "none",
            color: "var(--color-text-secondary)",
            fontSize: 20,
            lineHeight: 1,
            cursor: "pointer",
            padding: 4,
          }}
        >
          ×
        </button>
      </div>

      {/* Thread */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {loading && (
          <p style={{ color: "var(--color-text-muted)", fontSize: 12, margin: "auto" }}>Loading…</p>
        )}
        {!loading && messages.length === 0 && !error && (
          <p style={{ color: "var(--color-text-muted)", fontSize: 12, margin: "auto", textAlign: "center" }}>
            No messages yet. Say hello 👋
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={m.id ?? m.clientMsgId ?? i}
            style={{
              alignSelf: m.mine ? "flex-end" : "flex-start",
              maxWidth: "78%",
            }}
          >
            <div
              style={{
                // "them" bubble is a neutral surface role (same pattern as Messages.jsx's
                // MessageBubble), so its text follows suit rather than a fixed white that would
                // go invisible once the bubble itself re-themes light (rule 4).
                background: m.mine ? "#2563eb" : "var(--color-surface-raised)",
                color: m.mine ? "#fff" : "var(--color-text-primary)",
                borderRadius: 12,
                padding: "8px 11px",
                fontSize: 13,
                lineHeight: 1.4,
                wordBreak: "break-word",
                opacity: m.pending ? 0.6 : 1,
                border: m.failed ? "1px solid #ef4444" : "none",
              }}
            >
              {m.contentType !== "text" && m.contentType
                ? `[${m.contentType}]`
                : m.text}
            </div>
            <p
              style={{
                fontSize: 9,
                // Sits directly on the popup panel bg (not the bubble), so it uses the muted
                // text token uniformly regardless of m.mine — same as Messages.jsx's
                // below-media caption treatment.
                color: m.failed ? "#ef4444" : "var(--color-text-muted)",
                margin: "2px 4px 0",
                textAlign: m.mine ? "right" : "left",
              }}
            >
              {m.failed ? "Failed to send" : formatTime(m.sentAt)}
            </p>
          </div>
        ))}
      </div>

      {/* Composer */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          padding: "10px 12px",
          borderTop: "1px solid var(--color-border-subtle)",
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Type a reply…"
          aria-label="Type a reply"
          style={{
            flex: 1,
            resize: "none",
            maxHeight: 90,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            padding: "9px 12px",
            color: "var(--color-text-primary)",
            fontSize: 13,
            fontFamily: "'DM Sans', sans-serif",
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || sending}
          aria-label="Send reply"
          style={{
            background: !input.trim() || sending ? "rgba(37,99,235,0.4)" : "#2563eb",
            border: "none",
            borderRadius: 10,
            width: 38,
            height: 38,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: !input.trim() || sending ? "default" : "pointer",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
      {error && (
        <p style={{ color: "#ef4444", fontSize: 11, textAlign: "center", padding: "0 12px 8px", margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}
