import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import EmojiPicker, { Theme as EmojiPickerTheme } from "emoji-picker-react";
import { useTheme } from "../utils/theme.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import i18n from "../i18n/index.js";
import {
  formatVoiceDuration,
  useVoiceNoteRecorder,
} from "../hooks/useVoiceNoteRecorder.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { Skel, SkeletonHeading } from "../components/skeletons.jsx";
import { ChatContextOriginBadge } from "../components/ChatContextOriginBadge.jsx";
import { useDialog } from "../components/ConfirmDialog.jsx";
import { getUser } from "../store/auth";
import { blockUser, reportProfile, getProfileByUserId } from "../api/social";
import { openSharedVideoUrl, resolveVideoShareFromMessage } from "../utils/videoShareTargets.js";
import { toDatetimeLocalValue, fromDatetimeLocalValue, schedulePresets } from "../utils/datetimeLocal.js";
import {
  isValidScheduleTime,
  migrateLegacyScheduledMsgs,
  buildScheduledMessageUpdatePayload,
} from "../utils/scheduledMessages.js";
import StrugVideoWatermark from "../components/StrugVideoWatermark.jsx";
import {
  getMyConversations,
  getChannelParticipants,
  addGroupMember,
  getChannelMessages,
  openChatChannel,
  sendMessage as sendChatMessageRest,
  createScheduledMessage,
  listScheduledMessages,
  updateScheduledMessage,
  cancelScheduledMessage,
  markMessagesRead,
  markChatNotificationsReadForChannel,
  openDmChannel,
  muteChannel,
  editMessage,
  deleteMessage,
  deleteConversation,
  uploadChatMedia,
  searchMessages,
  resolveComposeTarget,
  notifyChatInboxUpdate,
  peekNavReturn,
  clearNavReturn,
  reactToMessage,
  pinMessage,
} from "../api/chat";
import {
  joinChatChannel,
  leaveChatChannel,
  sendChatMessageSocket,
  emitTypingStart,
  emitTypingStop,
  subscribeChatEvents,
  markMessagesReadSocket,
  queryPresence,
} from "../api/chatSocket";
import { connectSocket } from "../api/socket";
import { mergeChatMessageLists } from "../utils/chatLive.js";
import { BLOCKED_CHANGED_EVENT, patchMutedConv } from "../utils/chatQuietPrefs.js";
import {
  clearDisappearingPrefs,
  shouldShowDisappearingBanner,
} from "../utils/disappearingMessagesPrefs.js";
import {
  coerceChatText,
  coerceContextTypeKey,
  convAccentColor,
  formatContextTypeLabel,
  normalizeMessageReactions,
  normalizePollOptions,
  parseChatMessageMetadata,
  parseIdSetFromStorage,
  parseLocationCoords,
} from "../utils/messagesRenderHelpers.js";
import { useChatLiveFallback } from "../hooks/useChatLiveFallback.js";
import { clickableProps, Tooltip } from "../components/shared.jsx";
import { ChatImageLightbox } from "../components/ChatImageLightbox.jsx";
import { ChatMediaImage } from "../components/ChatMediaImage.jsx";
import { ChatMediaVideo } from "../components/ChatMediaVideo.jsx";
import { ChatMediaAudio } from "../components/ChatMediaAudio.jsx";
import { VoiceWaveformBars } from "../components/VoiceWaveformBars.jsx";
import { ChatMediaFile } from "../components/ChatMediaFile.jsx";
import { AdminSupportPanel } from "../components/AdminSupportPanel.jsx";
import { Avatar, SafeImage } from "../components/SafeImage.jsx";
import {
  getHighlights, addHighlight, deleteHighlight,
  getBucketList, addBucketItem, updateBucketItem, deleteBucketItem,
  getCapsules, addCapsule, deleteCapsule,
  getMonthlyMemory,
  contributeCapsule,
} from "../api/journal.js";

const SWIPE_REPLY_THRESHOLD = 56;
const DOUBLE_TAP_MS = 320;
const COLORS = ["#059669", "#2563eb", "#d97706", "#7c3aed", "#ec4899"];

/** Subtle default chat backdrop when no custom wallpaper is set (WhatsApp-style). */
const DEFAULT_CHAT_BG_STYLE = {
  backgroundColor: "var(--color-surface)",
  backgroundImage:
    "radial-gradient(circle at 20% 18%, rgba(128,128,128,0.07) 0, transparent 42%), radial-gradient(circle at 78% 82%, rgba(128,128,128,0.06) 0, transparent 42%)",
};

function bubbleBorderRadius(isMe, groupPosition) {
  const R = 16;
  const tight = 6;
  const tail = 4;
  if (isMe) {
    if (groupPosition === "first") return `${R}px ${R}px ${tight}px ${R}px`;
    if (groupPosition === "middle") return `${R}px ${tight}px ${tight}px ${R}px`;
    if (groupPosition === "last") return `${R}px ${tight}px ${tail}px ${R}px`;
    return `${R}px ${R}px ${tail}px ${R}px`;
  }
  if (groupPosition === "first") return `${R}px ${R}px ${R}px ${tight}px`;
  if (groupPosition === "middle") return `${tight}px ${R}px ${R}px ${tight}px`;
  if (groupPosition === "last") return `${tight}px ${R}px ${R}px ${tail}px`;
  return `${R}px ${R}px ${R}px ${tail}px`;
}

function normalizeUserId(id) {
  if (id == null || id === "") return null;
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

function isSameUser(a, b) {
  const left = normalizeUserId(a);
  const right = normalizeUserId(b);
  return left != null && right != null && left === right;
}

function normalizeMessageId(id) {
  if (id == null || id === "") return null;
  if (typeof id === "string" && id.startsWith("tmp-")) return id;
  const n = Number(id);
  return Number.isFinite(n) ? n : id;
}

function isSameMessageId(a, b) {
  return normalizeMessageId(a) === normalizeMessageId(b);
}

function extractSenderMeta(m) {
  const senderId = m.sender_id ?? m.user?.user_id ?? null;
  const profiles = m.user?.social_profiles;
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  const name = m.user?.name ?? m.sender_name ?? i18n.t("messages.defaultUser");
  return {
    senderId,
    senderName: name,
    senderHandle: profile?.handle ?? m.user?.username ?? null,
    profilePicUrl:
      profile?.profile_pic_url ??
      m.user?.profile_pic_url ??
      m.user?.profilePicUrl ??
      null,
    avatarInitial: name[0]?.toUpperCase() ?? "?",
  };
}

function buildMyProfile(user) {
  if (!user) {
    return {
      senderId: null,
      senderName: i18n.t("messages.you"),
      profilePicUrl: null,
      avatarInitial: "Y",
    };
  }
  const name = user.name ?? user.username ?? i18n.t("messages.you");
  return {
    senderId: normalizeUserId(user.user_id ?? user.id),
    senderName: name,
    profilePicUrl: user.profile_pic_url ?? user.profilePicUrl ?? null,
    avatarInitial: name[0]?.toUpperCase() ?? "Y",
  };
}

function buildPartnerProfile(conv) {
  if (!conv?.other_user) return null;
  const name = conv.other_user.name ?? convTitle(conv);
  return {
    senderName: name,
    profilePicUrl: conv.other_user.profile_pic_url ?? null,
    avatarInitial: convAvatar(conv),
    color: convAccentColor(conv.channel_id, COLORS),
  };
}

function formatTime(sentAt) {
  if (!sentAt) return "";
  return new Date(sentAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseMessageMetadata(metadata) {
  return parseChatMessageMetadata(metadata);
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function detectMessageMedia(msg) {
  const meta = parseMessageMetadata(msg.metadata);
  const contentType = String(msg.contentType ?? "text").toLowerCase();
  const textValue = coerceChatText(msg.text);
  const textUrl = isHttpUrl(textValue) ? textValue.trim() : null;
  const url = meta?.url || textUrl;
  const mime = String(meta?.mime_type ?? "").toLowerCase();

  if (msg.deleted) return { kind: "text" };

  if (
    contentType === "image" ||
    contentType.startsWith("image/") ||
    mime.startsWith("image/")
  ) {
    return { kind: "image", url };
  }
  if (contentType === "video" || mime.startsWith("video/")) {
    return { kind: "video", url };
  }
  if (contentType === "audio" || mime.startsWith("audio/")) {
    return { kind: "audio", url };
  }
  if (contentType === "file" || mime === "application/pdf") {
    return { kind: "file", url, name: meta?.filename };
  }

  if (url) {
    if (
      /\.(png|jpe?g|webp|gif|bmp)(\?|#|$)/i.test(url) ||
      /\/chat-media\//i.test(url)
    ) {
      return { kind: "image", url };
    }
    if (/\.(mp4|webm|mov)(\?|#|$)/i.test(url)) {
      return { kind: "video", url };
    }
    if (/\.(mp3|mpeg|wav|ogg)(\?|#|$)/i.test(url)) {
      return { kind: "audio", url };
    }
    if (/\.pdf(\?|#|$)/i.test(url)) {
      return { kind: "file", url, name: meta?.filename };
    }
  }

  return { kind: "text" };
}

function isNearScrollBottom(el, threshold = 140) {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

function scrollMessagesToBottom(el, anchor, behavior = "auto") {
  const run = () => {
    if (anchor) {
      anchor.scrollIntoView({ behavior, block: "end", inline: "nearest" });
    }
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  };
  run();
  requestAnimationFrame(() => {
    requestAnimationFrame(run);
  });
}

function scheduleScrollToBottom(el, anchor, behavior = "auto") {
  [0, 80, 200, 400, 700, 1000].forEach((ms) => {
    setTimeout(
      () => scrollMessagesToBottom(el, anchor, ms === 0 ? behavior : "auto"),
      ms,
    );
  });
}

function messagePreviewText(lastMessage) {
  if (!lastMessage) return i18n.t("messages.noMessagesYet");
  const preview = detectMessageMedia({
    text: lastMessage.content ?? "",
    contentType: lastMessage.content_type ?? "text",
    metadata: lastMessage.metadata,
    deleted: false,
  });
  switch (preview.kind) {
    case "image":
      return i18n.t("messages.photo");
    case "video":
      return i18n.t("messages.video");
    case "audio":
      return i18n.t("messages.audio");
    case "file":
      return preview.name || i18n.t("messages.attachment");
    default:
      return coerceChatText(lastMessage.content).trim() || i18n.t("messages.noMessagesYet");
  }
}

function conversationPreviewText(lastMessage) {
  const base = messagePreviewText(lastMessage);
  if (lastMessage?.is_mine) {
    return `${i18n.t("messages.you")}: ${base}`;
  }
  return base;
}

const WA_REPLY_ACCENT = "#06cf9c";
const WA_REPLY_ACCENT_ON_ME = "#53bdeb";

function messageReplyPreviewFromMapped(m) {
  if (!m) return "";
  if (m.deleted) return i18n.t("shared.messageDeleted");
  const preview = detectMessageMedia({
    text: m.text ?? "",
    contentType: m.contentType ?? "text",
    metadata: m.metadata,
    deleted: false,
  });
  switch (preview.kind) {
    case "image":
      return i18n.t("messages.photo");
    case "video":
      return i18n.t("messages.video");
    case "audio":
      return i18n.t("messages.audio");
    case "file":
      return preview.name || i18n.t("messages.attachment");
    default:
      return coerceChatText(m.text).trim() || i18n.t("messages.attachment");
  }
}

function buildReplyTarget(m) {
  return {
    id: m.id,
    from: m.from,
    senderName:
      m.from === "me"
        ? i18n.t("messages.you")
        : (m.senderName ?? i18n.t("messages.defaultUser")),
    text: messageReplyPreviewFromMapped(m),
  };
}

function formatReplyMetaPreview(replyMeta) {
  if (!replyMeta?.text) return "";
  return messageReplyPreviewFromMapped({
    text: coerceChatText(replyMeta.text),
    contentType: "text",
    metadata: null,
    deleted: false,
  });
}

function ReplyQuoteStrip({
  senderName,
  text,
  accentColor,
  variant = "bubble",
  wallpaper = false,
  onMeBubble = false,
  onDismiss,
}) {
  const preview = coerceChatText(text).trim();
  if (variant === "composer") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          margin: "0 4px 8px",
          borderRadius: 10,
          overflow: "hidden",
          background: wallpaper ? "rgba(255,255,255,0.1)" : "var(--color-surface-raised)",
          border: wallpaper ? "1px solid rgba(255,255,255,0.08)" : "1px solid var(--color-border-subtle)",
        }}
      >
        <div style={{ width: 4, background: accentColor, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, padding: "8px 12px" }}>
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: accentColor,
              margin: 0,
              lineHeight: 1.25,
            }}
          >
            {senderName}
          </p>
          <p
            className="text-text-secondary"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              margin: "2px 0 0",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.35,
            }}
          >
            {preview}
          </p>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={i18n.t("messages.cancel")}
            className="text-text-secondary"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: "8px 12px",
              alignSelf: "center",
            }}
          >
            ×
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      style={{
        background: onMeBubble ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.06)",
        borderRadius: 8,
        padding: "6px 8px 6px 0",
        marginBottom: 6,
        maxWidth: "100%",
        display: "flex",
        alignItems: "stretch",
        overflow: "hidden",
        border: onMeBubble ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ width: 4, background: accentColor, borderRadius: 4, flexShrink: 0, marginRight: 8 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            fontWeight: 600,
            color: accentColor,
            margin: 0,
            lineHeight: 1.25,
          }}
        >
          {senderName}
        </p>
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            color: onMeBubble ? "rgba(255,255,255,0.75)" : "var(--color-text-secondary)",
            margin: "2px 0 0",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: 1.35,
          }}
        >
          {preview}
        </p>
      </div>
    </div>
  );
}

function startOfDayMs(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayKeyFromSentAt(sentAt) {
  if (!sentAt) return i18n.t("messages.unknownDay");
  const t = new Date(sentAt);
  if (Number.isNaN(t.getTime())) return i18n.t("messages.unknownDay");
  return String(startOfDayMs(t));
}

function formatDayLabel(sentAt) {
  if (!sentAt) return "";
  const d = new Date(sentAt);
  if (Number.isNaN(d.getTime())) return "";
  const todayStart = startOfDayMs(new Date());
  const dayStart = startOfDayMs(d);
  const diffDays = Math.round((todayStart - dayStart) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return i18n.t("messages.today");
  if (diffDays === 1) return i18n.t("messages.yesterday");
  const now = new Date();
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

function DateSeparator({ label }) {
  if (!label) return null;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        margin: "8px 0 4px",
        flexShrink: 0,
      }}
    >
      <span
        className="text-text-secondary" style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 10,
          fontWeight: 600,
          borderRadius: 8,
          padding: "4px 10px",
          letterSpacing: "0.02em",
          background: "var(--color-surface-raised)",
          border: "1px solid var(--color-border-subtle)",
          boxShadow: "0 1px 4px var(--color-shadow)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function renderMessagesWithDateSeparators(list, renderBubble) {
  const elements = [];
  let lastDayKey = null;
  list.forEach((m, index) => {
    const dayKey = dayKeyFromSentAt(m.sentAt);
    if (dayKey !== lastDayKey) {
      lastDayKey = dayKey;
      const label = formatDayLabel(m.sentAt);
      if (label) {
        elements.push(
          <DateSeparator key={`day-${dayKey}-${m.id}`} label={label} />,
        );
      }
    }
    const prev = list[index - 1];
    const next = list[index + 1];
    const sameSenderPrev =
      prev &&
      prev.from === m.from &&
      dayKeyFromSentAt(prev.sentAt) === dayKey;
    const sameSenderNext =
      next &&
      next.from === m.from &&
      dayKeyFromSentAt(next.sentAt) === dayKey;
    const groupPosition = !sameSenderPrev && !sameSenderNext
      ? "single"
      : !sameSenderPrev && sameSenderNext
        ? "first"
        : sameSenderPrev && sameSenderNext
          ? "middle"
          : "last";
    elements.push(
      <div
        key={`wrap-${m.id}`}
        style={{ marginTop: sameSenderPrev ? 2 : 8 }}
      >
        {renderBubble(m, groupPosition)}
      </div>,
    );
  });
  return elements;
}

function mapMessage(m, myUserId) {
  const meta = extractSenderMeta(m);
  const deleted = !!m.deleted_at;
  const isMine = isSameUser(meta.senderId, myUserId);
  return {
    id: normalizeMessageId(m.message_id ?? m.id),
    clientMsgId: m.client_msg_id ?? m.metadata?.__client_msg_id ?? null,
    from: isMine ? "me" : "them",
    senderId: meta.senderId,
    senderName: meta.senderName,
    senderHandle: meta.senderHandle,
    profilePicUrl: meta.profilePicUrl,
    avatarInitial: meta.avatarInitial,
    text: deleted ? i18n.t("shared.messageDeleted") : coerceChatText(m.content ?? m.text),
    contentType: m.content_type ?? "text",
    time: formatTime(m.sent_at ?? m.created_at),
    sentAt: m.sent_at ?? m.created_at,
    edited: !!m.edited_at,
    deleted,
    metadata: parseMessageMetadata(m.metadata),
    isRead: m.is_read === true,
  };
}

function mergeMessageMetadata(mapped, fallbackMetadata) {
  if (!fallbackMetadata?.reply_to || mapped.metadata?.reply_to) return mapped;
  return {
    ...mapped,
    metadata: { ...(mapped.metadata || {}), ...fallbackMetadata },
  };
}

function convTitle(conv) {
  if (conv.context_type === "support" && conv.context_id) {
    return i18n.t("messages.supportTicket", { id: conv.context_id });
  }
  if (conv.other_user?.name) return conv.other_user.name;
  const contextTypeKey = coerceContextTypeKey(conv.context_type);
  if (contextTypeKey) {
    const label = formatContextTypeLabel(contextTypeKey);
    return conv.context_id
      ? i18n.t("messages.contextChat", { label, id: conv.context_id })
      : label;
  }
  return conv.channel_name || i18n.t("messages.conversation");
}

function convSubtitle(conv) {
  if (conv.participants?.length) {
    const names = conv.participants.map((p) => p.name).filter(Boolean);
    if (names.length) return names.slice(0, 4).join(", ");
  }
  if (conv.other_user?.handle) return conv.other_user.handle;
  if (conv.member_count > 2) return i18n.t("messages.membersCount", { count: conv.member_count });
  if (conv.type && conv.type !== "dm") return conv.type;
  return "";
}

function buildParticipantLookup(participants) {
  const map = new Map();
  (participants || []).forEach((p) => {
    const id = normalizeUserId(p.user_id);
    if (id != null) map.set(id, p);
  });
  return map;
}

function convAvatar(conv) {
  return (
    conv.other_user?.avatar ||
    conv.other_user?.name?.[0]?.toUpperCase() ||
    conv.context_type?.[0]?.toUpperCase() ||
    "?"
  );
}

function ReceiptMarks({ read, onAccent = false }) {
  const label = read ? i18n.t("messages.read") : i18n.t("messages.sent");
  const stroke = onAccent
    ? (read ? "#53bdeb" : "rgba(255,255,255,0.55)")
    : (read ? "#53bdeb" : "var(--color-text-muted)");
  const opacity = read ? 1 : 0.75;
  const check = (
    <svg
      width={11}
      height={11}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        marginLeft: 4,
        verticalAlign: "middle",
        opacity,
      }}
      aria-label={label}
    >
      {check}
      {read ? <span style={{ marginLeft: -5 }}>{check}</span> : null}
    </span>
  );
}

/** When another participant reads, mark our outgoing messages as read in UI. */
function applyOutgoingReadReceipt(messages, { user_id, last_read_message_id }, myUserId) {
  if (isSameUser(user_id, myUserId)) return messages;
  const upToId =
    last_read_message_id != null ? Number(last_read_message_id) : null;
  return messages.map((m) => {
    if (m.from !== "me" || m.deleted) return m;
    if (
      upToId != null &&
      !Number.isNaN(upToId) &&
      typeof m.id === "number" &&
      m.id > upToId
    ) {
      return m;
    }
    return m.isRead ? m : { ...m, isRead: true };
  });
}

// #457: delegate to the shared Avatar. The old display:none-on-error left an EMPTY coloured disc,
// because `initial` sits in the else branch of the ternary and never rendered once the <img> was in
// the tree. The shared Avatar drives the fallback from state, so the initial actually shows.
function MessageAvatar({ url, initial, color = "#2563eb", size = 34 }) {
  return (
    <Avatar
      url={url}
      initials={initial}
      size={size}
      style={{ background: color, fontWeight: 800, fontSize: size * 0.38 }}
    />
  );
}

function MessageBubble({
  m,
  myProfile,
  partnerProfile,
  senderLookup,
  showSenderName = false,
  showAvatars = false,
  groupPosition = "single",
  channelContextType = null,
  channelContextId = null,
  isEditing = false,
  editDraft = "",
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  onEdit,
  onDeleteForEveryone,
  onDeleteForMe,
  onImageClick,
  onMediaLoad,
  onReply,
  onReact,
  onDoubleTapReact,
  onPin,
  onStar,
  onForward,
  onAddToJournal,
  onVotePoll,
  onViewOnceSeen,
  viewOnceSeen: viewOnceSeenSet,
  viewOnceViewing: viewOnceViewingSet,
  isStarred = false,
  myUserId: myUId,
  fontSize = 14,
  bubbleColor = "#2563eb",
}) {
  const isMe = m.from === "me";
  const [menuOpen, setMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [showDeleteSub, setShowDeleteSub] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [heartBurst, setHeartBurst] = useState(false);
  const menuBtnRef = useRef(null);
  const lastTapRef = useRef(0);
  const swipeRef = useRef({ active: false, startX: 0, startY: 0, dx: 0, pointerId: null });
  // Which edge the message-action menu anchors to. Defaults by author side, but is
  // recomputed on open so a right-opening menu never runs off a narrow (mobile) screen (#469).
  const [menuAlignRight, setMenuAlignRight] = useState(isMe);
  const [menuPlacement, setMenuPlacement] = useState("above");
  const [menuAnchorRect, setMenuAnchorRect] = useState(null);
  const menuPortalRef = useRef(null);
  const media = detectMessageMedia(m);
  const replyMeta = m.metadata?.reply_to ?? null;
  const reactions = normalizeMessageReactions(m.metadata?.reactions);
  const locationCoords = parseLocationCoords(m.metadata);
  const isPinned = m.metadata?.pinned === true;
  const messageOriginType =
    m.metadata?.origin ||
    m.metadata?.source_vertical ||
    m.metadata?.context_type ||
    channelContextType;
  const messageOriginId =
    m.metadata?.origin_context_id ?? m.metadata?.context_id ?? channelContextId;
  const isPoll = (m.contentType ?? m.content_type) === "poll" && m.metadata?.question;
  const pollOptions = isPoll ? normalizePollOptions(m.metadata?.options) : [];
  const isLocation = (m.contentType ?? m.content_type) === "location" && locationCoords;
  const isEvent = (m.contentType ?? m.content_type) === "event" && m.metadata?.title;
  const videoShare = !isPoll && !isLocation && !isEvent
    ? resolveVideoShareFromMessage({ text: m.text, metadata: m.metadata })
    : null;
  const isVideoShare = !!videoShare?.url;
  const QUICK_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];
  const isImage = !isPoll && !isLocation && !isEvent && !isVideoShare && media.kind === "image" && !!media.url;
  const isVideo = !isPoll && !isLocation && !isEvent && !isVideoShare && media.kind === "video" && !!media.url;
  const isAudio = !isPoll && !isLocation && !isEvent && !isVideoShare && media.kind === "audio" && !!media.url;
  const isFile = !isPoll && !isLocation && !isEvent && !isVideoShare && media.kind === "file" && !!media.url;
  const imageUrl = media.url;
  const videoUrl = media.url;
  const audioUrl = media.url;
  const fileUrl = media.url;
  const fileName = media.name || m.metadata?.filename || i18n.t("messages.attachment");
  const mediaCaption = coerceChatText(m.metadata?.caption || "").trim();
  const senderParticipant = senderLookup?.get(normalizeUserId(m.senderId));
  const themAvatar = senderParticipant
    ? {
        url: senderParticipant.profile_pic_url,
        initial: senderParticipant.name?.[0]?.toUpperCase() ?? "?",
        color: convAccentColor(normalizeUserId(m.senderId), COLORS),
      }
    : partnerProfile
      ? {
          url: partnerProfile.profilePicUrl,
          initial: partnerProfile.avatarInitial,
          color: partnerProfile.color,
        }
      : {
          url: m.profilePicUrl,
          initial: m.avatarInitial,
          color: convAccentColor(normalizeUserId(m.senderId), COLORS),
        };
  const displaySenderName =
    senderParticipant?.name ?? partnerProfile?.senderName ?? m.senderName;
  const showNameLabel = !isMe && showSenderName;
  const showMediaMeta = isImage || isVideo || isAudio;
  const hasRichMedia = isImage || isVideo || isAudio || isFile;
  const showActions = (hovered || menuOpen) && !m.deleted && !isEditing && typeof m.id === "number";
  const useInlineMeta =
    !showMediaMeta &&
    !isFile &&
    !isEditing &&
    !isPoll &&
    !isLocation &&
    !isEvent &&
    !isVideoShare &&
    !m.deleted &&
    (m.text?.length ?? 0) <= 48 &&
    !String(m.text).includes("\n");
  const metaColor = isMe ? "rgba(255,255,255,0.55)" : "var(--color-text-muted)";

  const closeMenu = () => {
    setMenuOpen(false);
    setShowDeleteSub(false);
    setMenuAnchorRect(null);
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (ev) => {
      const target = ev.target;
      if (menuBtnRef.current?.contains(target) || menuPortalRef.current?.contains(target)) return;
      closeMenu();
    };
    const onScroll = () => closeMenu();
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menuOpen]);

  const canGesture = !m.deleted && !isEditing && !menuOpen;

  const resetSwipe = () => {
    swipeRef.current = { active: false, startX: 0, startY: 0, dx: 0, pointerId: null };
    setSwipeOffset(0);
  };

  const onBubblePointerDown = (e) => {
    if (!canGesture || e.button > 0) return;
    if (e.target.closest("[data-noswipe]")) return;
    swipeRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      pointerId: e.pointerId,
    };
  };

  const onBubblePointerMove = (e) => {
    if (!swipeRef.current.active || swipeRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - swipeRef.current.startX;
    const dy = e.clientY - swipeRef.current.startY;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) {
      resetSwipe();
      return;
    }
    if (dx > 0) {
      const clamped = Math.min(dx, 72);
      swipeRef.current.dx = clamped;
      setSwipeOffset(clamped);
    }
  };

  const onBubblePointerUp = (e) => {
    if (!swipeRef.current.active || swipeRef.current.pointerId !== e.pointerId) return;
    const dx = swipeRef.current.dx;
    resetSwipe();
    if (dx >= SWIPE_REPLY_THRESHOLD) onReply?.(m);
  };

  const onBubbleClick = (e) => {
    if (e.target.closest("[data-noswipe]")) return;
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0;
      setHeartBurst(true);
      window.setTimeout(() => setHeartBurst(false), 750);
      onDoubleTapReact?.(m);
    } else {
      lastTapRef.current = now;
    }
  };

  const actionBar = showActions ? (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, alignSelf: "flex-end", marginBottom: 4, flexShrink: 0, position: "relative" }}>
      {QUICK_EMOJIS.map((e) => (
        <button key={e} type="button" onClick={() => onReact?.(m, e)} title={e}
          style={{ fontSize: 15, background: "none", border: "none", cursor: "pointer", padding: "2px 1px", borderRadius: 4, lineHeight: 1, opacity: 0.65, transition: "opacity 0.1s, transform 0.1s" }}
          onMouseEnter={(ev) => { ev.currentTarget.style.opacity = "1"; ev.currentTarget.style.transform = "scale(1.2)"; }}
          onMouseLeave={(ev) => { ev.currentTarget.style.opacity = "0.65"; ev.currentTarget.style.transform = "scale(1)"; }}
        >{e}</button>
      ))}
      <div style={{ position: "relative" }}>
        <button type="button" aria-label="Message actions"
          ref={menuBtnRef}
          onClick={(ev) => {
            ev.stopPropagation();
            const willOpen = !menuOpen;
            if (willOpen && menuBtnRef.current) {
              const rect = menuBtnRef.current.getBoundingClientRect();
              const menuHeight = showDeleteSub
                ? 120
                : isMe && media.kind === "text" && !isPoll && !isLocation
                  ? 290
                  : 260;
              const spaceAbove = rect.top;
              const spaceBelow = window.innerHeight - rect.bottom;
              setMenuPlacement(spaceAbove >= menuHeight || spaceAbove > spaceBelow ? "above" : "below");
              setMenuAlignRight(rect.left + 168 > window.innerWidth);
              setMenuAnchorRect(rect);
            } else if (!willOpen) {
              setMenuAnchorRect(null);
            }
            setMenuOpen(willOpen);
            if (!willOpen) setShowDeleteSub(false);
          }}
          /* Message-actions trigger floats over any bubble/media color (accent, neutral,
             photo thumbnail) so it stays dark regardless of theme (rule 3), like a
             scrim control, to always keep enough contrast against arbitrary content. */
          style={{ width: 22, height: 22, borderRadius: "50%", background: menuOpen ? "rgba(15,23,42,0.96)" : "rgba(15,23,42,0.6)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.85)", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: menuOpen ? "0 4px 14px rgba(0,0,0,0.4)" : "none" }}
        >
          <span style={{ display: "flex", gap: 2 }}>
            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "currentColor" }} />
            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "currentColor" }} />
            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "currentColor" }} />
          </span>
        </button>
        {menuOpen && menuAnchorRect && createPortal(
          <div
            ref={menuPortalRef}
            onClick={(ev) => ev.stopPropagation()}
            className="bg-surface-raised border border-border"
            style={{
              position: "fixed",
              zIndex: 10000,
              minWidth: 168,
              maxWidth: 240,
              borderRadius: 10,
              overflow: "hidden",
              boxShadow: "0 12px 36px var(--color-shadow)",
              ...(menuPlacement === "above"
                ? { bottom: window.innerHeight - menuAnchorRect.top + 6 }
                : { top: menuAnchorRect.bottom + 6 }),
              ...(menuAlignRight
                ? { right: window.innerWidth - menuAnchorRect.right }
                : { left: menuAnchorRect.left }),
            }}
          >
            {showDeleteSub ? (
              <>
                <button type="button" onClick={() => setShowDeleteSub(false)} className="bg-surface text-text-secondary" style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "8px 13px", border: "none", borderBottom: "1px solid var(--color-border-subtle)", fontSize: 11, cursor: "pointer", textAlign: "left" }}>← Back</button>
                <button type="button" onClick={() => { closeMenu(); onDeleteForMe?.(m); }} className="text-text-primary" style={{ display: "block", width: "100%", padding: "9px 13px", background: "none", border: "none", borderBottom: "1px solid var(--color-border-subtle)", fontSize: 12, textAlign: "left", cursor: "pointer" }}>Delete for me</button>
                <button type="button" onClick={() => { closeMenu(); onDeleteForEveryone?.(m); }} style={{ display: "block", width: "100%", padding: "9px 13px", background: "none", border: "none", color: "#f87171", fontSize: 12, textAlign: "left", cursor: "pointer" }}>Delete for everyone</button>
              </>
            ) : (
              <>
                {[
                  { label: "Reply", action: () => { closeMenu(); onReply?.(m); } },
                  { label: isStarred ? "Unstar" : "Star", action: () => { closeMenu(); onStar?.(m); } },
                  { label: "Add to Journal", action: () => { closeMenu(); onAddToJournal?.(m); } },
                  { label: isPinned ? "Unpin" : "Pin", action: () => { closeMenu(); onPin?.(m); } },
                  { label: "Forward", action: () => { closeMenu(); onForward?.(m); } },
                  ...(isMe && media.kind === "text" && !isPoll && !isLocation ? [
                    { label: i18n.t("messages.edit"), action: () => { closeMenu(); onEdit?.(m); }, divider: true },
                  ] : []),
                ].map(({ label, action, divider }, idx) => (
                  <button key={idx} type="button" onClick={action} className="text-text-primary" style={{ display: "block", width: "100%", padding: "9px 13px", background: "none", border: "none", borderTop: divider ? "1px solid var(--color-border-subtle)" : "none", fontSize: 12, textAlign: "left", cursor: "pointer" }}>{label}</button>
                ))}
                <button type="button" onClick={() => setShowDeleteSub(true)} style={{ display: "block", width: "100%", padding: "9px 13px", background: "none", border: "none", borderTop: "1px solid var(--color-border-subtle)", color: "#f87171", fontSize: 12, textAlign: "left", cursor: "pointer" }}>Delete</button>
              </>
            )}
          </div>,
          document.body,
        )}
      </div>
    </div>
  ) : null;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); if (!menuOpen) setShowDeleteSub(false); }}
      onPointerDown={onBubblePointerDown}
      onPointerMove={onBubblePointerMove}
      onPointerUp={onBubblePointerUp}
      onPointerCancel={resetSwipe}
      onClick={onBubbleClick}
      style={{
        display: "flex",
        justifyContent: isMe ? "flex-end" : "flex-start",
        alignItems: "flex-end",
        gap: 6,
        width: "100%",
        position: "relative",
        touchAction: "pan-y",
      }}
    >
      {swipeOffset > 8 && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: isMe ? "auto" : 4,
            right: isMe ? 4 : "auto",
            bottom: 10,
            fontSize: 16,
            opacity: Math.min(1, swipeOffset / SWIPE_REPLY_THRESHOLD),
            color: "var(--color-text-muted)",
            pointerEvents: "none",
          }}
        >
          ↩
        </span>
      )}
      {heartBurst && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: "40%",
            transform: "translate(-50%, -50%)",
            fontSize: 42,
            lineHeight: 1,
            pointerEvents: "none",
            animation: "msgHeartBurst 0.75s ease-out forwards",
            filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.25))",
          }}
        >
          ❤️
        </span>
      )}
      {!isMe && showAvatars && (
        <MessageAvatar
          url={themAvatar.url}
          initial={themAvatar.initial}
          color={themAvatar.color}
        />
      )}

      {isMe && actionBar}

      <div style={{ maxWidth: isImage ? (showAvatars ? "82%" : "88%") : (showAvatars ? "72%" : "80%"), minWidth: 0, overflow: "visible", transform: `translateX(${swipeOffset}px)`, transition: swipeOffset ? "none" : "transform 0.15s ease-out" }}>
        {showNameLabel && (
          <p
            className="text-text-secondary" style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 11,
              fontWeight: 600,
              marginBottom: 4,
              marginLeft: 2,
            }}
          >
            {displaySenderName}
          </p>
        )}
        <div
          style={{
            padding: (hasRichMedia || isPoll || isLocation || isEvent || isVideoShare) ? (isFile ? "10px 12px" : (isPoll || isLocation || isEvent || isVideoShare) ? "10px 12px" : 4) : (useInlineMeta ? "8px 12px" : "10px 14px"),
            borderRadius: bubbleBorderRadius(isMe, groupPosition),
            background: isMe ? bubbleColor : "var(--color-surface-raised)",
            border: isPinned ? "1.5px solid #facc15" : isMe ? "none" : "none",
            boxShadow: isMe
              ? "none"
              : "0 1px 2px var(--color-shadow)",
            opacity: m.deleted ? 0.6 : 1,
          }}
        >
          {messageOriginType &&
            coerceContextTypeKey(messageOriginType) &&
            coerceContextTypeKey(messageOriginType) !== "dm" &&
            !m.deleted && (
              <ChatContextOriginBadge
                contextType={messageOriginType}
                contextId={messageOriginId}
                t={i18n.t.bind(i18n)}
                style={{
                  marginBottom: 8,
                  padding: "3px 8px",
                  fontSize: 11,
                  letterSpacing: "0.02em",
                  lineHeight: 1.35,
                  background: isMe ? "rgba(255,255,255,0.16)" : "rgba(37,99,235,0.14)",
                  borderColor: isMe ? "rgba(255,255,255,0.28)" : "rgba(37,99,235,0.3)",
                  color: isMe ? "#fff" : "#93c5fd",
                  transition: "opacity 180ms ease-out, transform 180ms ease-out",
                }}
              />
            )}
          {replyMeta && !m.deleted && (
            <ReplyQuoteStrip
              senderName={coerceChatText(replyMeta.senderName) || i18n.t("messages.defaultUser")}
              text={formatReplyMetaPreview(replyMeta)}
              accentColor={
                replyMeta.from === "me" ||
                replyMeta.senderName === i18n.t("messages.you")
                  ? WA_REPLY_ACCENT_ON_ME
                  : WA_REPLY_ACCENT
              }
              variant="bubble"
              onMeBubble={isMe}
            />
          )}
          {isImage ? (
            (() => {
              const isViewOnce = m.metadata?.view_once === true;
              const viewOnceDone = isViewOnce && viewOnceSeenSet?.has(String(m.id));
              const viewOnceCurrentlyShowing = isViewOnce && viewOnceViewingSet?.has(String(m.id));
              if (isViewOnce && m.from !== "me" && !viewOnceDone && !viewOnceCurrentlyShowing) {
                return (
                  <div onClick={() => onViewOnceSeen?.(m.id)} {...clickableProps(() => onViewOnceSeen?.(m.id))} className="bg-surface" style={{ cursor: "pointer", padding: "12px 14px", textAlign: "center", borderRadius: 10 }}>
                    <span style={{ fontSize: 28 }}>👁</span>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#60a5fa", marginTop: 6, fontWeight: 600 }}>Tap to view · 1 time only</p>
                  </div>
                );
              }
              if (isViewOnce && m.from !== "me" && viewOnceDone && !viewOnceCurrentlyShowing) {
                return (
                  <div style={{ padding: "12px 14px", textAlign: "center" }}>
                    <span style={{ fontSize: 20 }}>👁</span>
                    <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginTop: 4 }}>Viewed</p>
                  </div>
                );
              }
              return (
                <>
                  <ChatMediaImage url={imageUrl} onClick={onImageClick} onLoad={onMediaLoad} />
                  {mediaCaption ? (
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: fontSize, color: isMe ? "#fff" : "var(--color-text-primary)", margin: "6px 2px 0", lineHeight: 1.4, wordBreak: "break-word" }}>{mediaCaption}</p>
                  ) : null}
                </>
              );
            })()
          ) : isVideo ? (
            <>
              <ChatMediaVideo url={videoUrl} onLoad={onMediaLoad} />
              {mediaCaption ? (
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: fontSize, color: isMe ? "#fff" : "var(--color-text-primary)", margin: "6px 2px 0", lineHeight: 1.4, wordBreak: "break-word" }}>{mediaCaption}</p>
              ) : null}
            </>
          ) : isAudio ? (
            <ChatMediaAudio
              url={audioUrl}
              durationSeconds={m.metadata?.duration_seconds}
              waveformPeaks={m.metadata?.waveform_peaks}
              isMe={isMe}
              onLoad={onMediaLoad}
            />
          ) : isFile ? (
            <ChatMediaFile url={fileUrl} name={fileName} />
          ) : isPoll ? (
            // Poll can render on either bubble side (isMe accent or "them" neutral surface),
            // so its text/overlay colors follow isMe rather than a fixed white (rule 4).
            <div style={{ minWidth: 200, maxWidth: 280 }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: fontSize, fontWeight: 700, color: isMe ? "#fff" : "var(--color-text-primary)", marginBottom: 10 }}>{coerceChatText(m.metadata.question)}</p>
              {pollOptions.map((opt, i) => {
                const totalVotes = pollOptions.reduce((s, o) => s + (o.voters?.length ?? 0), 0);
                const myVote = Array.isArray(opt.voters) && myUId != null && opt.voters.includes(myUId);
                const pct = totalVotes > 0 ? Math.round((opt.voters?.length ?? 0) / totalVotes * 100) : 0;
                return (
                  <button key={i} type="button" onClick={() => onVotePoll?.(m.id, i)} style={{ display: "block", width: "100%", marginBottom: 6, padding: "7px 10px", background: isMe ? (myVote ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.07)") : (myVote ? "rgba(37,99,235,0.16)" : "var(--color-surface)"), border: isMe ? (myVote ? "1px solid rgba(255,255,255,0.5)" : "1px solid rgba(255,255,255,0.15)") : (myVote ? "1px solid rgba(37,99,235,0.4)" : "1px solid var(--color-border)"), borderRadius: 8, cursor: "pointer", textAlign: "left", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: isMe ? "rgba(255,255,255,0.12)" : "rgba(37,99,235,0.1)", borderRadius: 8 }} />
                    <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: isMe ? "#fff" : "var(--color-text-primary)" }}>{opt.text}</span>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: isMe ? "rgba(255,255,255,0.6)" : "var(--color-text-secondary)" }}>{pct}%</span>
                    </div>
                  </button>
                );
              })}
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: isMe ? "rgba(255,255,255,0.55)" : "var(--color-text-secondary)", marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                <span>{pollOptions.reduce((s, o) => s + (o.voters?.length ?? 0), 0)} vote(s)</span>
                <span>{m.time}</span>
              </p>
            </div>
          ) : isLocation ? (
            <div style={{ minWidth: 160 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={isMe ? "rgba(255,255,255,0.6)" : "var(--color-text-secondary)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <div>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: isMe ? "#fff" : "var(--color-text-primary)" }}>Location</p>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: isMe ? "rgba(255,255,255,0.55)" : "var(--color-text-secondary)" }}>{locationCoords.lat.toFixed(4)}, {locationCoords.lng.toFixed(4)}</p>
                </div>
              </div>
              <a href={`https://www.google.com/maps?q=${locationCoords.lat},${locationCoords.lng}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#60a5fa", textDecoration: "none", fontWeight: 600 }}>Open in Maps →</a>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: isMe ? "rgba(255,255,255,0.55)" : "var(--color-text-secondary)", marginTop: 6, textAlign: isMe ? "right" : "left" }}>{m.time}</p>
            </div>
          ) : isEvent ? (
            <div style={{ minWidth: 200, maxWidth: 280 }}>
              <div style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 10, padding: "10px 12px" }}>
                <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 11, color: "#60a5fa", marginBottom: 4, letterSpacing: 0.5, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 4 }}><svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Event</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: isMe ? "#fff" : "var(--color-text-primary)", marginBottom: 4 }}>{m.metadata.title}</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: isMe ? "rgba(255,255,255,0.7)" : "var(--color-text-secondary)" }}>{m.metadata.date} at {m.metadata.time}</p>
                {m.metadata.note ? <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: isMe ? "rgba(255,255,255,0.55)" : "var(--color-text-secondary)", marginTop: 4 }}>{m.metadata.note}</p> : null}
              </div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: isMe ? "rgba(255,255,255,0.55)" : "var(--color-text-secondary)", marginTop: 6, textAlign: isMe ? "right" : "left" }}>{m.time}</p>
            </div>
          ) : isVideoShare ? (
            <div style={{ minWidth: 200, maxWidth: 280 }}>
              <div style={{
                background: isMe ? "rgba(0,0,0,0.22)" : "var(--color-surface)",
                border: isMe ? "1px solid rgba(255,255,255,0.12)" : "1px solid var(--color-border-subtle)",
                borderRadius: 12,
                overflow: "hidden",
              }}>
                <div style={{
                  width: "100%",
                  aspectRatio: "16 / 9",
                  background: videoShare.thumb
                    ? `center / cover no-repeat url(${JSON.stringify(videoShare.thumb)})`
                    : "linear-gradient(135deg,#1e3a5f,#0f2744)",
                  position: "relative",
                }}>
                  <button
                    type="button"
                    onClick={() => openSharedVideoUrl(videoShare.url)}
                    aria-label={videoShare.title || i18n.t("videos.watch", { defaultValue: "Watch" })}
                    style={{ position: "absolute", inset: 0, border: "none", padding: 0, cursor: "pointer", background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "2px solid rgba(255,255,255,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </div>
                  </button>
                  {/* YouTube-embed style: corner mark is a hyperlink to the watch page */}
                  <StrugVideoWatermark href={videoShare.url} size={14} style={{ bottom: 8, right: 8, zIndex: 2 }} />
                </div>
                <button
                  type="button"
                  onClick={() => openSharedVideoUrl(videoShare.url)}
                  style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "10px 12px" }}
                >
                  <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: isMe ? "rgba(255,255,255,0.7)" : "#60a5fa", margin: "0 0 4px" }}>
                    {i18n.t("videos.title", { defaultValue: "Videos" })}
                  </p>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: isMe ? "#fff" : "var(--color-text-primary)", margin: 0, lineHeight: 1.35 }}>
                    {videoShare.title || i18n.t("videos.untitled", { defaultValue: "Untitled" })}
                  </p>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: isMe ? "rgba(255,255,255,0.55)" : "var(--color-text-muted)", margin: "6px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {videoShare.url.replace(/^https?:\/\//, "")}
                  </p>
                </button>
              </div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: isMe ? "rgba(255,255,255,0.55)" : "var(--color-text-secondary)", marginTop: 6, textAlign: isMe ? "right" : "left", display: "flex", alignItems: "center", justifyContent: isMe ? "flex-end" : "flex-start", gap: 4 }}>
                <span>{m.time}</span>
                {isMe && !String(m.id).startsWith("tmp-") ? <ReceiptMarks read={!!m.isRead} onAccent={isMe} /> : null}
              </p>
            </div>
          ) : isEditing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea
                value={editDraft}
                onChange={(e) => onEditDraftChange?.(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSaveEdit?.(); }
                  if (e.key === "Escape") { e.preventDefault(); onCancelEdit?.(); }
                }}
                rows={2}
                autoFocus
                style={{ width: "100%", minWidth: 160, resize: "vertical", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: fontSize, lineHeight: 1.45, outline: "none" }}
              />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button type="button" onClick={onSaveEdit} style={{ padding: "5px 12px", background: "#fff", border: "none", borderRadius: 6, color: "#2563eb", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{i18n.t("messages.save")}</button>
                <button type="button" onClick={onCancelEdit} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, cursor: "pointer" }}>{i18n.t("messages.cancel")}</button>
              </div>
            </div>
          ) : useInlineMeta ? (
            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: fontSize,
                color: isMe ? "#fff" : "var(--color-text-primary)",
                lineHeight: 1.45,
                fontStyle: m.deleted ? "italic" : "normal",
                wordBreak: "break-word",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-end",
                justifyContent: isMe ? "flex-end" : "flex-start",
                gap: "2px 8px",
              }}
            >
              <span style={{ flex: "1 1 auto", minWidth: "30%" }}>{m.text}</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 2,
                  fontSize: 10,
                  color: metaColor,
                  flexShrink: 0,
                  marginLeft: "auto",
                  lineHeight: 1.2,
                }}
              >
                {m.edited ? <span style={{ opacity: 0.7 }}>{i18n.t("messages.editedLabel")}</span> : null}
                <span>{m.time}</span>
                {isMe && !String(m.id).startsWith("tmp-") ? <ReceiptMarks read={!!m.isRead} onAccent /> : null}
              </span>
            </p>
          ) : (
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: fontSize, color: isMe ? "#fff" : "var(--color-text-primary)", lineHeight: 1.5, fontStyle: m.deleted ? "italic" : "normal", wordBreak: "break-word" }}>
              {m.text}
            </p>
          )}
          {!useInlineMeta && !showMediaMeta && !isFile && !isEditing && !isPoll && !isLocation && !isEvent && !isVideoShare && (
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: metaColor, marginTop: 4, textAlign: isMe ? "right" : "left", display: "flex", alignItems: "center", justifyContent: isMe ? "flex-end" : "flex-start", gap: 4 }}>
              <span>{m.time}</span>
              {m.edited ? <span style={{ opacity: 0.7 }}>{i18n.t("messages.editedLabel")}</span> : null}
              {isMe && !String(m.id).startsWith("tmp-") ? <ReceiptMarks read={!!m.isRead} onAccent={isMe} /> : null}
            </p>
          )}
          {isFile && (
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: isMe ? "rgba(255,255,255,0.55)" : "var(--color-text-muted)", marginTop: 8, textAlign: isMe ? "right" : "left", display: "flex", alignItems: "center", justifyContent: isMe ? "flex-end" : "flex-start", gap: 4 }}>
              <span>{m.time}</span>
              {isMe && !String(m.id).startsWith("tmp-") ? <ReceiptMarks read={!!m.isRead} onAccent={isMe} /> : null}
            </p>
          )}
        </div>
        {showMediaMeta && (
          // Below-media caption sits directly on the page/wallpaper background (not the
          // bubble), so both sides use the muted text token rather than fixed white (rule 4).
          <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, marginTop: 4, textAlign: isMe ? "right" : "left", display: "flex", alignItems: "center", justifyContent: isMe ? "flex-end" : "flex-start", gap: 4 }}>
            <span>{m.time}</span>
            {isMe && !String(m.id).startsWith("tmp-") ? <ReceiptMarks read={!!m.isRead} onAccent={isMe} /> : null}
          </p>
        )}
        {Object.keys(reactions).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5, justifyContent: isMe ? "flex-end" : "flex-start" }}>
            {Object.entries(reactions).map(([emoji, users]) => {
              const reacted = Array.isArray(users) && users.includes(myUId);
              return (
                <button key={emoji} type="button" onClick={() => onReact?.(m, emoji)} style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 12, background: reacted ? "rgba(37,99,235,0.35)" : "var(--color-surface-raised)", border: reacted ? "1px solid rgba(37,99,235,0.55)" : "1px solid var(--color-border)", cursor: "pointer", fontSize: 13, color: reacted ? "#fff" : "var(--color-text-primary)" }}>
                  <span>{emoji}</span>
                  <span style={{ fontSize: 11, opacity: 0.85 }}>{Array.isArray(users) ? users.length : 0}</span>
                </button>
              );
            })}
          </div>
        )}
        {isStarred && (
          <div style={{ textAlign: isMe ? "right" : "left", marginTop: 2 }}>
            <span style={{ fontSize: 10, color: "#facc15" }}>★ Starred</span>
          </div>
        )}
      </div>

      {!isMe && actionBar}

      {isMe && showAvatars && (
        <MessageAvatar
          url={myProfile?.profilePicUrl}
          initial={myProfile?.avatarInitial ?? "Y"}
          color="#2563eb"
        />
      )}
    </div>
  );
}

const CHAT_MEDIA_ACCEPT =
  "image/*,video/mp4,video/quicktime,video/*,audio/*";

const CHAT_DOC_ACCEPT =
  "application/pdf,.pdf,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.ms-excel,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,application/vnd.ms-powerpoint,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx,text/plain,.txt";

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPendingMediaFile(file) {
  if (!file) return false;
  const type = String(file.type || "").toLowerCase();
  return type.startsWith("image/") || type.startsWith("video/") || type.startsWith("audio/");
}

function ChatInput({
  value,
  onChange,
  onSend,
  sending,
  onTyping,
  onAttach,
  onAttachCamera,
  onAttachDocument,
  wallpaper,
  onMicPointerDown,
  onMicPointerUp,
  onMicPointerMove,
  onMicCancel,
  uploading,
  isRecording,
  recordingSeconds,
  recordingLevels,
  recordingSlideOffset = 0,
  replyTo,
  onCancelReply,
  scheduledFor,
  onScheduledForChange,
  onOpenPoll,
  onOpenEvent,
  onSendLocation,
  onViewOnceAttach,
  hasAttachment,
}) {
  const { isMobile } = useViewport();
  const [theme] = useTheme();
  const canSend = (value.trim().length > 0 || hasAttachment) && !sending && !uploading;
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [sttActive, setSttActive] = useState(false);
  const sttRef = useRef(null);
  const composerInputRef = useRef(null);
  const plusBtnRef = useRef(null);
  const plusMenuPortalRef = useRef(null);
  const [plusMenuRect, setPlusMenuRect] = useState(null);
  const [plusMenuAbove, setPlusMenuAbove] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiBtnRef = useRef(null);
  const emojiPickerPortalRef = useRef(null);
  const [emojiPickerRect, setEmojiPickerRect] = useState(null);
  const [emojiPickerAbove, setEmojiPickerAbove] = useState(true);
  // Anchor when the picker opens so min/presets are stable across renders (no Date.now in render).
  const [schedulePickerAnchorMs, setSchedulePickerAnchorMs] = useState(null);
  const scheduleMin = schedulePickerAnchorMs != null
    ? toDatetimeLocalValue(new Date(schedulePickerAnchorMs + 60_000))
    : "";
  const presets = schedulePickerAnchorMs != null
    ? schedulePresets(new Date(schedulePickerAnchorMs))
    : [];

  useEffect(() => {
    if (!showPlusMenu) return undefined;
    const onPointerDown = (ev) => {
      const target = ev.target;
      if (plusBtnRef.current?.contains(target) || plusMenuPortalRef.current?.contains(target)) return;
      setShowPlusMenu(false);
      setPlusMenuRect(null);
    };
    const onScroll = () => {
      setShowPlusMenu(false);
      setPlusMenuRect(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [showPlusMenu]);

  useEffect(() => {
    if (!showEmojiPicker) return undefined;
    const onPointerDown = (ev) => {
      const target = ev.target;
      if (emojiBtnRef.current?.contains(target) || emojiPickerPortalRef.current?.contains(target)) return;
      setShowEmojiPicker(false);
      setEmojiPickerRect(null);
    };
    const onScroll = (ev) => {
      // Capture-phase scroll listener also sees scrolls inside the picker's own emoji
      // list (scroll doesn't bubble, but capturing ancestors still see it) — ignore those.
      if (emojiPickerPortalRef.current?.contains(ev.target)) return;
      setShowEmojiPicker(false);
      setEmojiPickerRect(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [showEmojiPicker]);

  const insertEmoji = (emoji) => {
    const el = composerInputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    onChange(next);
    onTyping?.();
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  };

  // WhatsApp-style composer: wrap long text onto new lines and grow the box with it
  // (up to a cap, then it scrolls internally) instead of scrolling the text sideways.
  const COMPOSER_MAX_HEIGHT = 120;
  useLayoutEffect(() => {
    const el = composerInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [value]);

  const startSTT = () => {
    const SR = (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) { alert("Voice-to-text not supported in this browser."); return; }
    if (sttRef.current) { sttRef.current.stop(); sttRef.current = null; setSttActive(false); return; }
    const sr = new SR();
    sr.lang = "en-US";
    sr.interimResults = true;
    sr.continuous = true;
    const baseText = value;
    sr.onresult = (ev) => {
      const transcript = Array.from(ev.results).map((r) => r[0].transcript).join("");
      onChange(baseText + (baseText && !baseText.endsWith(" ") ? " " : "") + transcript);
    };
    sr.onend = () => { setSttActive(false); sttRef.current = null; };
    sr.start();
    sttRef.current = sr;
    setSttActive(true);
  };

  const handleMicPointerDown = (e) => {
    if (isRecording || uploading) return;
    onMicPointerDown?.(e);
  };

  const handleMicPointerUp = (e) => {
    onMicPointerUp?.(e);
  };

  const handleMicPointerMove = (e) => {
    if (!isRecording) return;
    onMicPointerMove?.(e);
  };

  const slideCancelProgress = Math.min(1, Math.max(0, -recordingSlideOffset / 72));

  const iconBtn = (active, recording = false) => ({
    width: 36, height: 36, borderRadius: "50%",
    background: recording ? "rgba(239,68,68,0.2)" : active ? "rgba(37,99,235,0.15)" : "none",
    border: "none",
    cursor: uploading ? "default" : "pointer",
    color: recording ? "#f87171" : active ? "#93c5fd" : "var(--color-text-muted)",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "color 0.12s, background 0.12s", flexShrink: 0,
  });

  const plusMenuItem = { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 13px", background: "none", border: "none", borderBottom: "1px solid var(--color-border-subtle)", fontSize: 12, cursor: "pointer", textAlign: "left" };

  return (
    <div style={{ padding: "6px 10px 10px", flexShrink: 0, background: wallpaper ? "rgba(0,0,0,0.35)" : "var(--color-surface)", backdropFilter: wallpaper ? "blur(4px)" : undefined }}>
      {replyTo && (
        <ReplyQuoteStrip
          senderName={replyTo.senderName ?? i18n.t("messages.defaultUser")}
          text={replyTo.text}
          accentColor={replyTo.from === "me" ? WA_REPLY_ACCENT_ON_ME : WA_REPLY_ACCENT}
          variant="composer"
          wallpaper={!!wallpaper}
          onDismiss={onCancelReply}
        />
      )}
      {scheduledFor && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "rgba(245,158,11,0.1)", borderLeft: "3px solid #f59e0b", borderRadius: 8, margin: "0 6px 6px" }}>
          <span style={{ fontSize: 13 }}>📅</span>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#fbbf24", flex: 1 }}>
            {i18n.t("messages.scheduledFor", { date: new Date(scheduledFor).toLocaleString() })}
          </p>
          <button type="button" onClick={() => onScheduledForChange?.(null)} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "2px 4px" }}>×</button>
        </div>
      )}
      {isRecording ? (
        <div
          onPointerMove={handleMicPointerMove}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "4px 2px",
            transform: `translateX(${recordingSlideOffset}px)`,
            transition: recordingSlideOffset ? "none" : "transform 0.15s ease-out",
          }}
        >
          <button
            type="button"
            onClick={onMicCancel}
            aria-label={i18n.t("messages.cancel")}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "none",
              background: slideCancelProgress > 0.4 ? "rgba(239,68,68,0.25)" : wallpaper ? "rgba(255,255,255,0.1)" : "var(--color-surface-raised)",
              color: slideCancelProgress > 0.4 ? "#f87171" : "var(--color-text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#ef4444",
                flexShrink: 0,
                boxShadow: "0 0 0 4px rgba(239,68,68,0.25)",
              }}
            />
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                color: "#f87171",
                flexShrink: 0,
                minWidth: 36,
              }}
            >
              {formatVoiceDuration(recordingSeconds)}
            </span>
            <VoiceWaveformBars
              peaks={recordingLevels ?? []}
              progress={1}
              barCount={24}
              height={28}
              activeColor="#ef4444"
              inactiveColor="rgba(239,68,68,0.35)"
              inactiveColorThem="rgba(239,68,68,0.35)"
              isMe
            />
            <span
              className="text-text-muted"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11,
                flexShrink: 0,
                opacity: slideCancelProgress > 0.15 ? 1 : 0.55,
              }}
            >
              {i18n.t("messages.slideToCancel")}
            </span>
          </div>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              background: "#00a884",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 2px 8px rgba(0,168,132,0.35)",
            }}
            aria-hidden
          >
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round">
              <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" />
            </svg>
          </div>
        </div>
      ) : (
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, opacity: uploading ? 0.75 : 1 }}>
        <div className="bg-surface-raised border border-border" style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, borderRadius: 24, padding: "4px 6px 4px 10px", minHeight: 42 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              type="button"
              ref={emojiBtnRef}
              aria-label="Emoji"
              title="Emoji"
              disabled={uploading}
              onClick={() => {
                const willOpen = !showEmojiPicker;
                if (willOpen && emojiBtnRef.current) {
                  const rect = emojiBtnRef.current.getBoundingClientRect();
                  const pickerHeight = 340;
                  const spaceAbove = rect.top;
                  const spaceBelow = window.innerHeight - rect.bottom;
                  setEmojiPickerAbove(spaceAbove >= pickerHeight || spaceAbove > spaceBelow);
                  setEmojiPickerRect(rect);
                } else {
                  setEmojiPickerRect(null);
                }
                setShowEmojiPicker(willOpen);
              }}
              style={{ ...iconBtn(showEmojiPicker), width: 32, height: 32 }}
              onMouseEnter={(e) => { if (!uploading) e.currentTarget.style.color = "var(--color-text-primary)"; }}
              onMouseLeave={(e) => { if (!showEmojiPicker) e.currentTarget.style.color = "var(--color-text-muted)"; }}
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </button>
            {showEmojiPicker && emojiPickerRect && createPortal(
              <div
                ref={emojiPickerPortalRef}
                className="strug-emoji-picker"
                style={{
                  position: "fixed",
                  zIndex: 10000,
                  ...(emojiPickerAbove
                    ? { bottom: window.innerHeight - emojiPickerRect.top + 6 }
                    : { top: emojiPickerRect.bottom + 6 }),
                  left: emojiPickerRect.left,
                }}
              >
                <style>{`.strug-emoji-picker .epr-emoji-category-label { display: none; }`}</style>
                <EmojiPicker
                  onEmojiClick={(emojiData) => insertEmoji(emojiData.emoji)}
                  theme={theme === "light" ? EmojiPickerTheme.LIGHT : EmojiPickerTheme.DARK}
                  autoFocusSearch={false}
                  lazyLoadEmojis
                  width={300}
                  height={360}
                />
              </div>,
              document.body,
            )}
          </div>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              type="button"
              ref={plusBtnRef}
              onClick={() => {
                const willOpen = !showPlusMenu;
                if (willOpen && plusBtnRef.current) {
                  const rect = plusBtnRef.current.getBoundingClientRect();
                  const menuHeight = 220;
                  const spaceAbove = rect.top;
                  const spaceBelow = window.innerHeight - rect.bottom;
                  setPlusMenuAbove(spaceAbove >= menuHeight || spaceAbove > spaceBelow);
                  setPlusMenuRect(rect);
                } else if (!willOpen) {
                  setPlusMenuRect(null);
                }
                setShowPlusMenu(willOpen);
              }}
              disabled={uploading}
              title={i18n.t("messages.attachTitle")}
              style={{ ...iconBtn(showPlusMenu), width: 32, height: 32 }}
              onMouseEnter={(e) => { if (!uploading) e.currentTarget.style.color = "var(--color-text-primary)"; }}
              onMouseLeave={(e) => { if (!showPlusMenu) e.currentTarget.style.color = "var(--color-text-muted)"; }}
            >
              {uploading ? <span style={{ fontSize: 11 }}>...</span> : (
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                </svg>
              )}
            </button>
            {showPlusMenu && plusMenuRect && createPortal(
              <div
                ref={plusMenuPortalRef}
                className="bg-surface-raised border border-border"
                style={{
                  position: "fixed",
                  zIndex: 10000,
                  minWidth: 168,
                  borderRadius: 10,
                  overflow: "hidden",
                  boxShadow: "0 12px 36px var(--color-shadow)",
                  ...(plusMenuAbove
                    ? { bottom: window.innerHeight - plusMenuRect.top + 6 }
                    : { top: plusMenuRect.bottom + 6 }),
                  left: plusMenuRect.left,
                }}
              >
                <button type="button" onClick={() => { setShowPlusMenu(false); setPlusMenuRect(null); onAttach?.(); }} className="text-text-primary" style={plusMenuItem}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>{i18n.t("messages.gallery", { defaultValue: "Gallery" })}</button>
                {onAttachCamera && (
                  <button type="button" onClick={() => { setShowPlusMenu(false); setPlusMenuRect(null); onAttachCamera?.(); }} className="text-text-primary" style={plusMenuItem}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>{i18n.t("messages.camera", { defaultValue: "Camera" })}</button>
                )}
                {onAttachDocument && (
                  <button type="button" onClick={() => { setShowPlusMenu(false); setPlusMenuRect(null); onAttachDocument?.(); }} className="text-text-primary" style={plusMenuItem}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>{i18n.t("messages.document")}</button>
                )}
                <button type="button" onClick={() => { setShowPlusMenu(false); setPlusMenuRect(null); startSTT(); }} className="text-text-primary" style={plusMenuItem}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8"/></svg>{i18n.t("messages.voiceToText")}</button>
                <button type="button" onClick={() => { setShowPlusMenu(false); setPlusMenuRect(null); onSendLocation?.(); }} className="text-text-primary" style={plusMenuItem}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>Location</button>
                <button type="button" onClick={() => { setShowPlusMenu(false); setPlusMenuRect(null); onOpenPoll?.(); }} className="text-text-primary" style={plusMenuItem}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>Poll</button>
                <button type="button" onClick={() => { setShowPlusMenu(false); setPlusMenuRect(null); onOpenEvent?.(); }} className="text-text-primary" style={plusMenuItem}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Schedule Event</button>
                <button type="button" onClick={() => { setShowPlusMenu(false); setPlusMenuRect(null); setSchedulePickerAnchorMs(Date.now()); setShowSchedulePicker(true); }} className="text-text-primary" style={{ ...plusMenuItem, borderBottom: onViewOnceAttach ? "1px solid var(--color-border-subtle)" : "none" }}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Schedule message</button>
                {onViewOnceAttach && (
                  <button type="button" onClick={() => { setShowPlusMenu(false); setPlusMenuRect(null); onViewOnceAttach?.(); }} className="text-text-primary" style={{ ...plusMenuItem, borderBottom: "none" }}>👁 View once</button>
                )}
              </div>,
              document.body,
            )}
          </div>
          <textarea
            ref={composerInputRef}
            value={value}
            rows={1}
            onChange={(e) => { onChange(e.target.value); onTyping?.(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (canSend) onSend(); } }}
            placeholder={isRecording ? i18n.t("messages.recording", { time: formatVoiceDuration(recordingSeconds) }) : sttActive ? "🎙 Listening..." : hasAttachment ? i18n.t("messages.addCaption", { defaultValue: "Add a caption…" }) : i18n.t("messages.typePlaceholder")}
            disabled={uploading || isRecording}
            className="msg-composer-input text-text-primary"
            style={{
              flex: 1, minWidth: 0, background: "none", border: "none", outline: "none",
              fontSize: isMobile ? 16 : 14, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb",
              lineHeight: 1.45, padding: "6px 0", resize: "none", overflowY: "auto",
              maxHeight: COMPOSER_MAX_HEIGHT, wordBreak: "break-word",
            }}
          />
        </div>
        {canSend ? (
          <button type="button" onClick={onSend} disabled={!canSend} title={scheduledFor ? "Schedule" : i18n.t("messages.sendTitle")}
            style={{ width: 42, height: 42, borderRadius: "50%", background: "#00a884", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 8px rgba(0,168,132,0.35)" }}
          >
            {scheduledFor ? (
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ) : (
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            )}
          </button>
        ) : (
          <button type="button" disabled={uploading} title={i18n.t("messages.releaseToSend")} style={iconBtn(false)}
            onPointerDown={(e) => { e.preventDefault(); handleMicPointerDown(e); }}
            onPointerUp={(e) => { e.preventDefault(); handleMicPointerUp(e); }}
            onPointerMove={handleMicPointerMove}
            onContextMenu={(e) => e.preventDefault()}
          >
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M12 2a3 3 0 013 3v7a3 3 0 01-6 0V5a3 3 0 013-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v3M8 22h8" />
            </svg>
          </button>
        )}
      </div>
      )}
      {showSchedulePicker && (
        <div style={{ padding: "8px 6px 0", display: "flex", flexDirection: "column", gap: 6 }}>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("messages.scheduleFor")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onScheduledForChange?.(p.at)}
                className="bg-surface-raised border border-border text-text-secondary"
                style={{
                  borderRadius: 999,
                  padding: "4px 10px",
                  fontSize: 11,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: "pointer",
                  borderColor: scheduledFor === p.at ? "rgba(37,99,235,0.55)" : undefined,
                  color: scheduledFor === p.at ? "#93c5fd" : undefined,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="datetime-local"
            min={scheduleMin}
            value={scheduledFor ? toDatetimeLocalValue(new Date(scheduledFor)) : ""}
            onChange={(e) => {
              const ms = fromDatetimeLocalValue(e.target.value);
              onScheduledForChange?.(ms);
              if (!e.target.value) setShowSchedulePicker(false);
            }}
            className="bg-surface-raised border border-border text-text-primary"
            style={{ borderRadius: 8, padding: "6px 10px", fontSize: 12, outline: "none", colorScheme: "dark" }}
          />
          <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, lineHeight: 1.4, margin: 0 }}>
            {i18n.t("messages.scheduledLocalDisclaimer")}
          </p>
        </div>
      )}
    </div>
  );
}

function MessagesPage() {
	const { t, title, searchPlaceholder } = usePageI18n("messages");
  const { isMobile } = useViewport();
  const loading = usePageLoad();
  const myUser = getUser();
  const myUserId = normalizeUserId(myUser?.user_id ?? myUser?.id);
  const myProfile = buildMyProfile(myUser);

  const [activeChatId, setActiveChatId] = useState(null);
  const [inputMsg, setInputMsg] = useState("");
  const [conversations, setConversations] = useState([]);
  // #275 online presence — set of user ids currently online (peers in this user's chats).
  const [onlineUsers, setOnlineUsers] = useState(() => new Set());
  const isUserOnline = (uid) => uid != null && onlineUsers.has(Number(uid));
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [typingUserId, setTypingUserId] = useState(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeUserId, setComposeUserId] = useState("");
  const [composeLoading, setComposeLoading] = useState(false);
  const [composeError, setComposeError] = useState("");
  const [inboxError, setInboxError] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchApplied, setSearchApplied] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [channelParticipants, setChannelParticipants] = useState([]);
  const [showMembers, setShowMembers] = useState(false);
  const [showAdminSupport, setShowAdminSupport] = useState(false);
  const [navReturn, setNavReturn] = useState(() => peekNavReturn());
  // Centered confirm/notice dialog (replaces native window.confirm/alert which
  // the browser anchors to the top of the page).
  const [dialog, { confirm, notify }] = useDialog();

  const [replyTo, setReplyTo] = useState(null);
  const [starredIds, setStarredIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("strug_starred_msgs") || "[]")); }
    catch { return new Set(); }
  });
  const [pinnedMsg, setPinnedMsg] = useState(null);
  const [showStarred, setShowStarred] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardMsg, setForwardMsg] = useState(null);
  const [forwardTarget, setForwardTarget] = useState(null);
  const [forwarding, setForwarding] = useState(false);

  // Task 2: Delete for me (local hide)
  const [hiddenMsgIds, setHiddenMsgIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("strug_hidden_msgs") || "[]")); }
    catch { return new Set(); }
  });

  // Task 3: Schedule messages (server-backed; migrate any legacy localStorage once)
  const [scheduledFor, setScheduledFor] = useState(null);
  const [scheduledQueue, setScheduledQueue] = useState([]);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleClockMs, setScheduleClockMs] = useState(() => Date.now());
  const [editingScheduledId, setEditingScheduledId] = useState(null);
  const [editScheduledText, setEditScheduledText] = useState("");
  const [editScheduledFor, setEditScheduledFor] = useState(null);
  const [savingScheduleEdit, setSavingScheduleEdit] = useState(false);

  const refreshScheduledQueue = useCallback(async (channelId = activeChatId) => {
    if (!myUserId) {
      setScheduledQueue([]);
      return;
    }
    try {
      const rows = await listScheduledMessages(channelId || null);
      const list = Array.isArray(rows) ? rows : [];
      setScheduledQueue(list.map((r) => ({
        scheduledMessageId: r.scheduled_message_id,
        channelId: r.channel_id,
        content: r.content,
        contentType: r.content_type,
        clientMsgId: r.client_msg_id,
        scheduledFor: new Date(r.scheduled_for).getTime(),
        status: r.status,
        metadata: r.metadata,
      })));
    } catch {
      /* keep prior queue on transient failure */
    }
  }, [myUserId, activeChatId]);

  useEffect(() => {
    setScheduleClockMs(Date.now());
    const tick = setInterval(() => setScheduleClockMs(Date.now()), 5000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!myUserId) {
      setScheduledQueue([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      // Retry until local leftovers are gone: failed posts stay in storage; near-term
      // drafts are bumped into the 30s lead window instead of being wiped.
      await migrateLegacyScheduledMsgs({
        userId: myUserId,
        createScheduledMessage,
      });
      if (!cancelled) await refreshScheduledQueue(activeChatId);
    })();
    return () => { cancelled = true; };
  }, [myUserId, activeChatId, refreshScheduledQueue]);

  // Task 5: Poll modal
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);

  // Task 7/8/10/12: Chat settings panel
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [settingsSub, setSettingsSub] = useState(null); // 'disappearing'|'theme'|'fontsize'|'nickname'
  // Mobile: settings opens as a dropdown anchored to the gear button instead of taking
  // over the whole screen — the button's rect (captured on open) positions it.
  const settingsBtnRef = useRef(null);
  const [settingsMenuRect, setSettingsMenuRect] = useState(null);
  const [convMenuId, setConvMenuId] = useState(null);
  const [showGlobalMenu, setShowGlobalMenu] = useState(false);
  const [globalMenuTab, setGlobalMenuTab] = useState(null); // 'group'|'mood'|'note'
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [inviteInput, setInviteInput] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [chatWallpaper, setChatWallpaper] = useState(() => {
    try { return JSON.parse(localStorage.getItem("strug_wallpapers") || "{}"); }
    catch { return {}; }
  });
  const [fontSize, setFontSize] = useState(() => {
    try { return Number(localStorage.getItem("strug_fontsize")) || 14; }
    catch { return 14; }
  });
  const [bubbleColor, setBubbleColor] = useState(() => {
    try { return localStorage.getItem("strug_bubble_color") || "#005c4b"; }
    catch { return "#2563eb"; }
  });
  function saveBubbleColor(color) {
    setBubbleColor(color);
    try { localStorage.setItem("strug_bubble_color", color); } catch {}
  }
  const [disappearing] = useState(() => {
    // Feature is Coming soon: drop legacy localStorage so sticky banners do not reappear.
    clearDisappearingPrefs();
    return {};
  });
  const [nicknames, setNicknames] = useState(() => {
    try { return JSON.parse(localStorage.getItem("strug_nicknames") || "{}"); }
    catch { return {}; }
  });
  const [privateNotes, setPrivateNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem("strug_notes") || "{}"); }
    catch { return {}; }
  });
  const [blockedIds, setBlockedIds] = useState(() =>
    parseIdSetFromStorage(localStorage.getItem("strug_blocked")),
  );
  const [mood, setMood] = useState(() => localStorage.getItem("strug_mood") || "");

  useEffect(() => {
    const syncBlocked = () => {
      setBlockedIds(parseIdSetFromStorage(localStorage.getItem("strug_blocked")));
    };
    window.addEventListener(BLOCKED_CHANGED_EVENT, syncBlocked);
    window.addEventListener("storage", syncBlocked);
    return () => {
      window.removeEventListener(BLOCKED_CHANGED_EVENT, syncBlocked);
      window.removeEventListener("storage", syncBlocked);
    };
  }, []);

  // Task 9: Favourite conversations
  const [favConvIds, setFavConvIds] = useState(() =>
    parseIdSetFromStorage(localStorage.getItem("strug_fav_convs")),
  );

  // Conversation list search/tabs — distinct from `searchQuery` above, which searches
  // messages inside the currently-open chat, not the list itself.
  const [convSearchQuery, setConvSearchQuery] = useState("");
  const [convFilterTab, setConvFilterTab] = useState("all"); // 'all' | 'unread' | 'favorites' | 'groups'

  // Task 11: Smart reply
  const [dismissedSmartReply, setDismissedSmartReply] = useState(false);

  // Hidden chats
  const [hiddenChats, setHiddenChats] = useState(() => {
    try { return JSON.parse(localStorage.getItem("strug_hidden_chats") || "{}"); } catch { return {}; }
  });
  const [hiddenChatsUnlocked, setHiddenChatsUnlocked] = useState(false);
  const [showHiddenAuthModal, setShowHiddenAuthModal] = useState(false);
  const [hiddenAuthInput, setHiddenAuthInput] = useState("");
  const [hiddenAuthError, setHiddenAuthError] = useState("");
  const hiddenSessionTimerRef = useRef(null);
  const HIDDEN_SESSION_MS = 5 * 60 * 1000;

  // Mute conversations
  const [mutedConvs, setMutedConvs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("strug_muted_convs") || "{}"); } catch { return {}; }
  });
  const [showMuteMenu, setShowMuteMenu] = useState(null);

  // Snooze notifications
  const [snoozedUntil, setSnoozedUntil] = useState(() => {
    try { const v = Number(localStorage.getItem("strug_snooze_until") || "0"); return v > Date.now() ? v : 0; } catch { return 0; }
  });
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);

  // Group events
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventNote, setEventNote] = useState("");

  // View-once media
  const [viewOnceSeen, setViewOnceSeen] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("strug_view_once_seen") || "[]")); } catch { return new Set(); }
  });
  const [viewOnceViewing, setViewOnceViewing] = useState(() => new Set());
  const [viewOnceMode, setViewOnceMode] = useState(false);

  // Chat lock (mobile only)
  const [chatLocked, setChatLocked] = useState(() => {
    try { return !!localStorage.getItem("strug_chat_pin"); } catch { return false; }
  });
  const [chatUnlocked, setChatUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [newPinInput, setNewPinInput] = useState("");

  // Appear offline
  const [appearOffline, setAppearOffline] = useState(() => {
    try { return localStorage.getItem("strug_appear_offline") === "1"; } catch { return false; }
  });

  // Pending file attachment — held before send so user can toggle view-once
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingFileViewOnce, setPendingFileViewOnce] = useState(false);
  const [pendingFilePreviewUrl, setPendingFilePreviewUrl] = useState(null);

  useEffect(() => {
    if (!pendingFile || !String(pendingFile.type || "").toLowerCase().startsWith("image/")) {
      setPendingFilePreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(pendingFile);
    setPendingFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  // Per-contact note panel (channel_id of currently open note)
  const [convNoteOpen, setConvNoteOpen] = useState(null);

  // Per-contact snooze { [channelId]: expiresAtMs }
  const [snoozedConvs, setSnoozedConvs] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem("strug_snooze_convs") || "{}"); return (v && typeof v === "object") ? v : {}; } catch { return {}; }
  });
  const [showSnoozeConvMenu, setShowSnoozeConvMenu] = useState(null);

  // Group creation step: 'pick' (member picker) → 'name' (name + create)
  const [groupStep, setGroupStep] = useState("pick");
  const [groupPickerMembers, setGroupPickerMembers] = useState(new Set());

  // Friend Journal
  const [showJournal, setShowJournal] = useState(false);
  const [journalTab, setJournalTab] = useState("highlights"); // highlights | bucket | capsules | memories
  const [journalHighlights, setJournalHighlights] = useState([]);
  const [journalBucket, setJournalBucket] = useState([]);
  const [journalCapsules, setJournalCapsules] = useState([]);
  const [journalMemory, setJournalMemory] = useState(null);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalMemoryYM, setJournalMemoryYM] = useState(() => {
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });
  const [newBucketTitle, setNewBucketTitle] = useState("");
  const [newBucketEmoji, setNewBucketEmoji] = useState("");
  const [newBucketCategory, setNewBucketCategory] = useState("adventure");
  const [newCapsuleTitle, setNewCapsuleTitle] = useState("");
  const [newCapsuleNote, setNewCapsuleNote] = useState("");
  const [newCapsuleDate, setNewCapsuleDate] = useState("");
  const [showAddBucket, setShowAddBucket] = useState(false);
  const [showAddCapsule, setShowAddCapsule] = useState(false);
  const [contributingCapsuleId, setContributingCapsuleId] = useState(null);
  const [contributeNote, setContributeNote] = useState("");
  const isAdmin = myUser?.permission === "admin";
  const messagesScrollRef = useRef(null);
  const messagesListRef = useRef([]);
  const bottomAnchorRef = useRef(null);
  const topLoadRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const docInputRef = useRef(null);
  const [vmSlideOffset, setVmSlideOffset] = useState(0);
  const vmStartXRef = useRef(0);
  const vmSlideOffsetRef = useRef(0);
  const activeChatIdRef = useRef(null);
  const typingUserIdRef = useRef(null);
  const typingTimerRef = useRef(null);
  const joinedChannelRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const canLoadOlderRef = useRef(false);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const PAGE_SIZE = 30;

  activeChatIdRef.current = activeChatId;
  typingUserIdRef.current = typingUserId;

  const clearChatSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setSearching(false);
    setSearchApplied(false);
  }, []);

  useEffect(() => {
    clearChatSearch();
    setShowSearch(false);
    setShowStarred(false);
    setReplyTo(null);
    setPinnedMsg(null);
    setNavReturn(peekNavReturn());
  }, [activeChatId, clearChatSearch]);

  // This page has its own chatHeader row (back/avatar/name/search/settings) —
  // the global "Home / Messages" breadcrumb strip above it is redundant.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("strug:hide-breadcrumb", { detail: true }));
    return () => window.dispatchEvent(new CustomEvent("strug:hide-breadcrumb", { detail: false }));
  }, []);

  useEffect(() => {
    const pinned = messages.find((m) => m.metadata?.pinned === true && !m.deleted);
    setPinnedMsg(pinned ?? null);
  }, [messages]);

  const returnToContext = useCallback(() => {
    const target = peekNavReturn();
    if (!target?.id) return;
    clearNavReturn();
    setNavReturn(null);
    window.__nav?.(target.id);
  }, []);

  useEffect(() => {
    messagesListRef.current = messages;
  }, [messages]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const scrollToBottom = useCallback((behavior = "auto") => {
    scrollMessagesToBottom(
      messagesScrollRef.current,
      bottomAnchorRef.current,
      behavior,
    );
  }, []);

  const scrollToBottomIfStuck = useCallback(() => {
    if (!stickToBottomRef.current) return;
    scrollMessagesToBottom(
      messagesScrollRef.current,
      bottomAnchorRef.current,
      "auto",
    );
  }, []);

  const forceScrollToLatest = useCallback((behavior = "auto") => {
    stickToBottomRef.current = true;
    scheduleScrollToBottom(
      messagesScrollRef.current,
      bottomAnchorRef.current,
      behavior,
    );
  }, []);

  const markChannelRead = useCallback((channelId) => {
    if (!channelId) return;
    if (joinedChannelRef.current === channelId) {
      markMessagesReadSocket(channelId).catch(() => {
        markMessagesRead(channelId).catch(() => {});
      });
    } else {
      markMessagesRead(channelId).catch(() => {});
    }
    markChatNotificationsReadForChannel(channelId).catch(() => {});
  }, []);

  const reloadInbox = useCallback(async () => {
    try {
      const data = await getMyConversations();
      setConversations(Array.isArray(data) ? data : (data?.channels ?? []));
      setInboxError("");
      notifyChatInboxUpdate();
    } catch {
      setConversations([]);
      setInboxError(i18n.t("messages.failedInbox"));
    }
  }, []);

  useEffect(() => {
    if (!activeChatId) {
      window.__activeChatChannelId = null;
      // Lets App.jsx hide the mobile bell — it otherwise floats over the composer.
      window.dispatchEvent(new CustomEvent("strug:chat-open-changed", { detail: { open: false } }));
      return undefined;
    }
    window.__activeChatChannelId = activeChatId;
    window.dispatchEvent(new CustomEvent("strug:chat-open-changed", { detail: { open: true } }));
    return () => {
      window.__activeChatChannelId = null;
      window.dispatchEvent(new CustomEvent("strug:chat-open-changed", { detail: { open: false } }));
    };
  }, [activeChatId]);

  useEffect(() => {
    connectSocket();
    reloadInbox();
  }, [reloadInbox]);

  useEffect(() => {
    const pending = window.__openChatChannelId;
    if (pending) {
      setActiveChatId(Number(pending));
      delete window.__openChatChannelId;
    }
  }, []);

  useEffect(() => {
    setDismissedSmartReply(false);
    setShowChatSettings(false);
    setSettingsSub(null);
    setConvMenuId(null);
  }, [activeChatId]);

  useEffect(() => {
    if (!activeChatId) return undefined;

    let cancelled = false;
    stickToBottomRef.current = true;
    canLoadOlderRef.current = false;
    setLoadingMessages(true);
    setMessages([]);
    setHasMore(false);

    (async () => {
      try {
        await joinChatChannel(activeChatId);
        joinedChannelRef.current = activeChatId;
      } catch {
        /* REST still works if socket join fails */
      }

      try {
        const data = await getChannelMessages(activeChatId, PAGE_SIZE);
        if (cancelled) return;
        const list = data?.messages ?? (Array.isArray(data) ? data : []);
        setMessages(list.map((m) => mapMessage(m, myUserId)));
        setHasMore(!!data?.pagination?.has_more);
        hasMoreRef.current = !!data?.pagination?.has_more;
      } catch {
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) {
          setLoadingMessages(false);
          forceScrollToLatest("auto");
          setTimeout(() => {
            canLoadOlderRef.current = true;
          }, 700);
        }
      }

      markChannelRead(activeChatId);
      setConversations((prev) =>
        prev.map((c) =>
          c.channel_id === activeChatId ? { ...c, unread_count: 0 } : c,
        ),
      );
    })();

    return () => {
      cancelled = true;
      if (joinedChannelRef.current === activeChatId) {
        leaveChatChannel(activeChatId);
        joinedChannelRef.current = null;
      }
      setTypingUserId(null);
    };
  }, [activeChatId, myUserId]);

  useEffect(() => {
    const unsub = subscribeChatEvents({
      onMessageCreated: (msg) => {
        const channelId = msg?.channel_id;
        if (!channelId) return;

        setConversations((prev) => {
          const exists = prev.some((c) => c.channel_id === channelId);
          const updated = prev.map((c) =>
            c.channel_id === channelId
              ? {
                  ...c,
                  last_message: {
                    message_id: msg.message_id,
                    content: msg.content,
                    content_type: msg.content_type,
                    sent_at: msg.sent_at,
                    is_mine: isSameUser(msg.sender_id, myUserId),
                  },
                  unread_count:
                    channelId === activeChatIdRef.current
                      ? 0
                      : (isSameUser(msg.sender_id, myUserId) || isMuted(channelId) || isGloballySnoozed() || isConvSnoozed(channelId))
                        ? (c.unread_count ?? 0)
                        : (c.unread_count ?? 0) + 1,
                }
              : c,
          );
          if (!exists) {
            reloadInbox();
            return prev;
          }
          return [...updated].sort((a, b) => {
            const aT = a.last_message?.sent_at ? new Date(a.last_message.sent_at).getTime() : 0;
            const bT = b.last_message?.sent_at ? new Date(b.last_message.sent_at).getTime() : 0;
            return bT - aT;
          });
        });

        if (channelId !== activeChatIdRef.current) return;

        const senderId = msg.sender_id ?? msg.user?.user_id;
        if (isSameUser(senderId, myUserId)) {
          setMessages((prev) => {
            const mapped = mapMessage(msg, myUserId);
            // Already have the real message (by id or client_msg_id)? Drop any lingering tmp twin.
            const hasReal = prev.some(
              (m) =>
                typeof m.id === "number" &&
                (isSameMessageId(m.id, mapped.id) ||
                  (!!mapped.clientMsgId && m.clientMsgId === mapped.clientMsgId)),
            );
            if (hasReal) {
              const hasTmpTwin = mapped.clientMsgId
                ? prev.some((m) => String(m.id).startsWith("tmp-") && m.clientMsgId === mapped.clientMsgId)
                : false;
              if (!hasTmpTwin) return prev;
              return prev.filter(
                (m) =>
                  !(String(m.id).startsWith("tmp-") &&
                    !!mapped.clientMsgId &&
                    m.clientMsgId === mapped.clientMsgId),
              );
            }
            // Reconcile the optimistic row by client_msg_id (fall back to text for legacy sends).
            const tmpIdx = prev.findIndex(
              (m) =>
                String(m.id).startsWith("tmp-") &&
                m.from === "me" &&
                (mapped.clientMsgId ? m.clientMsgId === mapped.clientMsgId : m.text === mapped.text),
            );
            if (tmpIdx >= 0) {
              const next = [...prev];
              next[tmpIdx] = mergeMessageMetadata(mapped, prev[tmpIdx].metadata);
              return next;
            }
            return [...prev, mapped];
          });
          return;
        }

        setMessages((prev) => {
          if (prev.some((m) => isSameMessageId(m.id, msg.message_id))) return prev;
          return [...prev, mapMessage(msg, myUserId)];
        });
        scrollToBottomIfStuck();
        markChannelRead(channelId);
      },
      onMessageUpdated: (msg) => {
        if (msg.channel_id !== activeChatIdRef.current) return;
        const messageId = normalizeMessageId(msg.message_id ?? msg.id);
        const apply = (list) =>
          list.map((m) =>
            isSameMessageId(m.id, messageId) ? mapMessage(msg, myUserId) : m,
          );
        setMessages(apply);
        setSearchResults((prev) => (prev.length ? apply(prev) : prev));
      },
      onMessageDeleted: (msg) => {
        if (msg.channel_id !== activeChatIdRef.current) return;
        const messageId = normalizeMessageId(msg.message_id ?? msg.id);
        const apply = (list) =>
          list.map((m) => {
            if (!isSameMessageId(m.id, messageId)) return m;
            if (msg.deleted_at != null) return mapMessage(msg, myUserId);
            return { ...m, deleted: true, text: i18n.t("shared.messageDeleted") };
          });
        setMessages(apply);
        setSearchResults((prev) => (prev.length ? apply(prev) : prev));
      },
      onTypingStarted: ({ channel_id, user_id }) => {
        if (
          channel_id === activeChatIdRef.current &&
          !isSameUser(user_id, myUserId)
        ) {
          setTypingUserId(user_id);
        }
      },
      onTypingStopped: ({ channel_id, user_id }) => {
        if (
          channel_id === activeChatIdRef.current &&
          isSameUser(user_id, typingUserIdRef.current)
        ) {
          setTypingUserId(null);
        }
      },
      onMessagesRead: (payload) => {
        const channel_id = payload?.channel_id;
        if (channel_id == null) return;

        if (channel_id === activeChatIdRef.current) {
          setMessages((prev) =>
            applyOutgoingReadReceipt(prev, payload, myUserId),
          );
        }

        setConversations((prev) =>
          prev.map((c) =>
            c.channel_id === channel_id ? { ...c, unread_count: 0 } : c,
          ),
        );
      },
      onPresenceChanged: ({ user_id, online }) => {
        if (user_id == null) return;
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          if (online) next.add(Number(user_id));
          else next.delete(Number(user_id));
          return next;
        });
      },
      onNotification: () => {
        reloadInbox();
      },
    });
    return unsub;
  }, [myUserId, reloadInbox]);

  const pollOpenThread = useCallback(async (channelId) => {
    if (!channelId || channelId !== activeChatIdRef.current) return;
    try {
      const data = await getChannelMessages(channelId, PAGE_SIZE);
      const list = data?.messages ?? (Array.isArray(data) ? data : []);
      setMessages((prev) => {
        const merged = mergeChatMessageLists(prev, list.map((m) => mapMessage(m, myUserId)));
        if (merged !== prev) queueMicrotask(() => scrollToBottomIfStuck());
        return merged;
      });
    } catch {
      /* next tick retries */
    }
  }, [myUserId, scrollToBottomIfStuck]);

  useChatLiveFallback({
    channelId: activeChatId,
    pollThread: pollOpenThread,
    pollInbox: reloadInbox,
  });

  // #275 presence: seed the initial online snapshot for everyone in the inbox (the server
  // scopes results to the caller's peers). Live online/offline edges then arrive via the
  // onPresenceChanged handler above. Re-query when the peer set changes.
  const peerIdsKey = conversations.map((c) => c.other_user?.user_id).filter(Boolean).sort().join(",");
  useEffect(() => {
    const ids = peerIdsKey ? peerIdsKey.split(",").map(Number) : [];
    if (!ids.length) return;
    queryPresence(ids).then((online) => setOnlineUsers(new Set((online || []).map(Number))));
  }, [peerIdsKey]);

  useLayoutEffect(() => {
    if (loadingMessages || !activeChatId) return;
    if (stickToBottomRef.current) {
      scrollToBottom("auto");
    }
  }, [activeChatId, loadingMessages, messages.length, scrollToBottom]);

  const loadOlderMessages = useCallback(async () => {
    const channelId = activeChatIdRef.current;
    const list = messagesListRef.current;
    if (
      !channelId ||
      loadingMoreRef.current ||
      !hasMoreRef.current ||
      list.length === 0
    ) {
      return;
    }

    const beforeId = list[0]?.id;
    if (typeof beforeId !== "number") return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    const el = messagesScrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;

    try {
      const data = await getChannelMessages(channelId, PAGE_SIZE, beforeId);
      const older = data?.messages ?? [];
      if (older.length === 0) {
        setHasMore(false);
        hasMoreRef.current = false;
      } else {
        setMessages((prev) => {
          const existing = new Set(prev.map((m) => m.id));
          const merged = older
            .map((m) => mapMessage(m, myUserId))
            .filter((m) => !existing.has(m.id));
          return [...merged, ...prev];
        });
        const more = !!data?.pagination?.has_more;
        setHasMore(more);
        hasMoreRef.current = more;
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!el) return;
          const newHeight = el.scrollHeight;
          el.scrollTop = newHeight - prevHeight + prevTop;
        });
      });
    } catch {
      /* ignore */
    }

    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [myUserId]);

  useEffect(() => {
    if (loadingMessages || !activeChatId) return undefined;

    const root = messagesScrollRef.current;
    const target = topLoadRef.current;
    if (!(root instanceof Element) || !(target instanceof Element)) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          canLoadOlderRef.current &&
          hasMoreRef.current &&
          !loadingMoreRef.current
        ) {
          loadOlderMessages();
        }
      },
      { root, rootMargin: "80px 0px 0px 0px", threshold: 0 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [
    activeChatId,
    loadingMessages,
    messages.length,
    hasMore,
    loadOlderMessages,
  ]);

  function handleScroll(e) {
    const el = e.currentTarget;
    stickToBottomRef.current = isNearScrollBottom(el);
    if (
      canLoadOlderRef.current &&
      hasMoreRef.current &&
      !loadingMoreRef.current &&
      el.scrollTop < 80
    ) {
      loadOlderMessages();
    }
  }

  function hashPin(str) { try { return btoa(btoa(str)); } catch { return str; } }

  function saveHiddenChats(next) {
    setHiddenChats(next);
    try { localStorage.setItem("strug_hidden_chats", JSON.stringify(next)); } catch {}
  }

  function isMuted(channelId) {
    const v = mutedConvs[channelId];
    if (v === -1 || (typeof v === "number" && v > Date.now())) return true;
    return conversations.some((c) => c.channel_id === channelId && !!c.muted);
  }

  function muteConv(channelId, durationMs) {
    // Read-modify-write from storage so concurrent mute toggles cannot drop siblings.
    const map = patchMutedConv(
      channelId,
      durationMs === -1 ? -1 : Date.now() + durationMs,
    );
    setMutedConvs(map);
    setShowMuteMenu(null);
    setConvMenuId(null);
    // Forever mute also hits the server so push/notify skip this channel.
    if (durationMs === -1) {
      muteChannel(channelId, true)
        .then(() => {
          setConversations((prev) =>
            prev.map((c) => (c.channel_id === channelId ? { ...c, muted: true } : c)),
          );
        })
        .catch(() => {});
    }
  }

  function unmuteConv(channelId) {
    const map = patchMutedConv(channelId, null);
    setMutedConvs(map);
    setConvMenuId(null);
    muteChannel(channelId, false)
      .then(() => {
        setConversations((prev) =>
          prev.map((c) => (c.channel_id === channelId ? { ...c, muted: false } : c)),
        );
      })
      .catch(() => {});
  }

  function isGloballySnoozed() { return snoozedUntil > Date.now(); }

  function snoozeFor(ms) {
    const until = ms === -1 ? 9999999999999 : Date.now() + ms;
    setSnoozedUntil(until);
    try { localStorage.setItem("strug_snooze_until", String(until)); } catch {}
    setShowSnoozeMenu(false);
  }

  function unsnooze() {
    setSnoozedUntil(0);
    try { localStorage.removeItem("strug_snooze_until"); } catch {}
  }

  function isConvSnoozed(channelId) { const t = snoozedConvs[channelId]; return t != null && t > Date.now(); }
  function snoozeConv(channelId, ms) {
    const until = ms === -1 ? 9999999999999 : Date.now() + ms;
    const next = { ...snoozedConvs, [channelId]: until };
    setSnoozedConvs(next);
    try { localStorage.setItem("strug_snooze_convs", JSON.stringify(next)); } catch {}
    setShowSnoozeConvMenu(null);
    setConvMenuId(null);
  }
  function unsnoozeConv(channelId) {
    const next = { ...snoozedConvs };
    delete next[channelId];
    setSnoozedConvs(next);
    try { localStorage.setItem("strug_snooze_convs", JSON.stringify(next)); } catch {}
    setConvMenuId(null);
  }

  function markViewOnceSeen(msgId) {
    setViewOnceSeen((prev) => {
      const next = new Set(prev);
      next.add(String(msgId));
      try { localStorage.setItem("strug_view_once_seen", JSON.stringify([...next])); } catch {}
      return next;
    });
    setViewOnceViewing((prev) => {
      const next = new Set(prev);
      next.add(String(msgId));
      return next;
    });
  }

  function lockHiddenChats() {
    setHiddenChatsUnlocked(false);
    if (hiddenSessionTimerRef.current) clearTimeout(hiddenSessionTimerRef.current);
  }

  function resetHiddenSessionTimer() {
    if (hiddenSessionTimerRef.current) clearTimeout(hiddenSessionTimerRef.current);
    hiddenSessionTimerRef.current = setTimeout(lockHiddenChats, HIDDEN_SESSION_MS);
  }

  function tryUnlockHiddenChats() {
    const hashed = hashPin(hiddenAuthInput);
    const matched = Object.values(hiddenChats).some((v) => v === hashed);
    if (matched) {
      setHiddenChatsUnlocked(true);
      setShowHiddenAuthModal(false);
      setHiddenAuthInput("");
      setHiddenAuthError("");
      resetHiddenSessionTimer();
    } else {
      setHiddenAuthError("Incorrect password.");
      setHiddenAuthInput("");
    }
  }

  function verifyPin() {
    const stored = (() => { try { return localStorage.getItem("strug_chat_pin"); } catch { return null; } })();
    if (stored && hashPin(pinInput) === stored) {
      setChatUnlocked(true); setPinInput(""); setPinError("");
    } else {
      setPinError("Incorrect PIN.");
      setPinInput("");
    }
  }

  async function tryBiometric() {
    try {
      if (!navigator.credentials) { setPinError("Biometrics not supported on this device."); return; }
      const cred = await navigator.credentials.get({ password: true }).catch(() => null);
      if (cred) { setChatUnlocked(true); setPinError(""); }
      else { setPinError("No saved credential — use your PIN."); }
    } catch { setPinError("Biometric failed — use your PIN."); }
  }

  function toggleAppearOffline() {
    const next = !appearOffline;
    setAppearOffline(next);
    try { next ? localStorage.setItem("strug_appear_offline", "1") : localStorage.removeItem("strug_appear_offline"); } catch {}
  }

  function handleTyping() {
    if (!activeChatId || appearOffline) return;
    emitTypingStart(activeChatId);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => emitTypingStop(activeChatId), 2000);
  }

  async function sendMsg() {
    if (pendingFile) {
      if (!activeChatId || uploading) return;
      const file = pendingFile;
      const viewOnce = pendingFileViewOnce;
      const caption = inputMsg.trim();
      setPendingFile(null);
      setPendingFileViewOnce(false);
      setInputMsg("");
      await handleAttach(file, viewOnce, caption);
      return;
    }
    if (scheduledFor) {
      await scheduleCurrentMessage();
      return;
    }
    if (!inputMsg.trim() || !activeChatId || sendingRef.current) return;
    sendingRef.current = true;
    const text = inputMsg.trim();
    const currentReplyTo = replyTo;
    setInputMsg("");
    setReplyTo(null);
    if (!appearOffline) emitTypingStop(activeChatId);
    setSending(true);

    // Stable per-send id so the optimistic row reconciles against the server echo by id —
    // never by text (which cross-matched on rapid/identical sends → duplicates #62/#77).
    const clientMsgId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const msgMeta = currentReplyTo
      ? {
          reply_to: {
            id: currentReplyTo.id,
            text: currentReplyTo.text,
            senderName: currentReplyTo.senderName,
            from: currentReplyTo.from,
          },
        }
      : null;
    const optimistic = {
      id: `tmp-${clientMsgId}`,
      clientMsgId,
      from: "me",
      senderId: myUserId,
      senderName: myProfile.senderName,
      profilePicUrl: myProfile.profilePicUrl,
      avatarInitial: myProfile.avatarInitial,
      text,
      contentType: "text",
      time: i18n.t("messages.justNow"),
      sentAt: new Date().toISOString(),
      edited: false,
      deleted: false,
      isRead: false,
      metadata: msgMeta,
    };
    setMessages((prev) => [...prev, optimistic]);
    forceScrollToLatest("smooth");

    try {
      let saved;
      try {
        saved = await sendChatMessageSocket(activeChatId, text, "text", clientMsgId, msgMeta);
      } catch {
        // The socket ack timed out. The message may already have been delivered + broadcast,
        // so match the already-arrived real message by client_msg_id (NOT text — identical
        // texts cross-matched the wrong row). Only fall back to REST if it truly never landed;
        // the REST endpoint is idempotent on client_msg_id, so even a redundant call is safe.
        const already = messagesListRef.current?.find(
          (m) => m.from === "me" && m.clientMsgId === clientMsgId && typeof m.id === "number",
        );
        if (already) {
          saved = {
            message_id: already.id,
            content: text,
            sent_at: already.sentAt,
            sender_id: myUserId,
            client_msg_id: clientMsgId,
          };
        } else {
          saved = await sendChatMessageRest(activeChatId, text, "text", clientMsgId, msgMeta);
        }
      }
      const mapped = mergeMessageMetadata(mapMessage(saved, myUserId), msgMeta);
      setMessages((prev) => {
        // Reconcile the optimistic row with the server message. Dedupe by real id OR
        // client_msg_id so Path A (ack) and Path B (socket broadcast) can never both append.
        const dupe = prev.some(
          (m) =>
            m.id !== optimistic.id &&
            (isSameMessageId(m.id, mapped.id) ||
              (!!mapped.clientMsgId && m.clientMsgId === mapped.clientMsgId)),
        );
        const withoutTmp = prev.filter((m) => m.id !== optimistic.id);
        return dupe ? withoutTmp : [...withoutTmp, mapped];
      });
      forceScrollToLatest("smooth");
      setConversations((prev) =>
        prev
          .map((c) =>
            c.channel_id === activeChatId
              ? {
                  ...c,
                  last_message: {
                    message_id: saved.message_id,
                    content: text,
                    content_type: "text",
                    sent_at: saved.sent_at ?? new Date().toISOString(),
                    is_mine: true,
                  },
                }
              : c,
          )
          .sort((a, b) => {
            const aT = a.last_message?.sent_at ? new Date(a.last_message.sent_at).getTime() : 0;
            const bT = b.last_message?.sent_at ? new Date(b.last_message.sent_at).getTime() : 0;
            return bT - aT;
          }),
      );
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInputMsg(text);
    } finally {
      sendingRef.current = false;
    }
    setSending(false);
  }

  async function startConversation() {
    const raw = composeUserId.trim();
    if (!raw) return;
    setComposeLoading(true);
    setComposeError("");
    try {
      const userId = await resolveComposeTarget(raw);
      const channel = await openDmChannel(userId);
      const channelId = channel?.channel_id ?? channel?.id;
      if (channelId) {
        await reloadInbox();
        setActiveChatId(channelId);
      }
      setShowCompose(false);
      setComposeUserId("");
    } catch (e) {
      setComposeError(
        e?.response?.data?.error ??
          e?.response?.data?.message ??
          e?.message ??
          i18n.t("messages.userNotFound"),
      );
    }
    setComposeLoading(false);
  }

  async function runSearch() {
    const q = searchQuery.trim();
    if (!activeChatId || !q) {
      clearChatSearch();
      return;
    }
    setSearching(true);
    setSearchApplied(true);
    try {
      const data = await searchMessages(activeChatId, q);
      const list = data?.messages ?? (Array.isArray(data) ? data : []);
      setSearchResults(list.map((m) => mapMessage(m, myUserId)));
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  }

  async function handleAttach(file, viewOnce = null, caption = "") {
    if (!file || !activeChatId || uploading) return;
    const isViewOnceUpload = viewOnce !== null ? viewOnce : viewOnceMode;
    setViewOnceMode(false);
    setUploading(true);
    setUploadError("");
    try {
      const saved = await uploadChatMedia(activeChatId, file, { durationSeconds: file.durationSeconds, caption });
      const durationSeconds = Number(file.durationSeconds);
      const waveformPeaks = Array.isArray(file.waveformPeaks) ? file.waveformPeaks : null;
      const savedWithLocalDuration =
        Number.isFinite(durationSeconds) && durationSeconds > 0 || isViewOnceUpload || waveformPeaks
          ? {
              ...saved,
              metadata: {
                ...(parseMessageMetadata(saved?.metadata) || {}),
                ...(Number.isFinite(durationSeconds) && durationSeconds > 0 ? { duration_seconds: durationSeconds } : {}),
                ...(waveformPeaks?.length ? { waveform_peaks: waveformPeaks } : {}),
                ...(isViewOnceUpload ? { view_once: true } : {}),
              },
            }
          : saved;
      const mapped = mapMessage(savedWithLocalDuration, myUserId);
      setMessages((prev) => {
        const id = saved?.message_id ?? saved?.id;
        if (id != null && prev.some((m) => m.id === id)) {
          return prev.map((m) => (m.id === id ? mapped : m));
        }
        return [...prev, mapped];
      });
      forceScrollToLatest("smooth");
    } catch (e) {
      const msg =
        e?.response?.data?.error ??
        e?.response?.data?.message ??
        (e?.code === "ECONNABORTED"
          ? i18n.t("messages.uploadTimeout")
          : e?.message) ??
        i18n.t("messages.uploadFailed");
      setUploadError(msg);
    }
    setUploading(false);
  }

  const handleAttachRef = useRef(handleAttach);
  handleAttachRef.current = handleAttach;

  const voiceNote = useVoiceNoteRecorder({
    onRecorded: (file) => handleAttachRef.current?.(file),
    onError: (err) =>
      setUploadError(err?.message ?? i18n.t("messages.recordFailed")),
  });

  const micHeldRef = useRef(false);

  const onMicPointerDown = useCallback(
    (e) => {
      if (uploading || !activeChatId || voiceNote.isRecording) return;
      micHeldRef.current = true;
      setUploadError("");
      vmStartXRef.current = e.clientX ?? 0;
      setVmSlideOffset(0);
      try {
        e.currentTarget?.setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      voiceNote.start();
    },
    [activeChatId, uploading, voiceNote],
  );

  const onMicPointerMove = useCallback((e) => {
    if (!micHeldRef.current || !voiceNote.isRecording) return;
    const dx = (e.clientX ?? 0) - vmStartXRef.current;
    const offset = dx < 0 ? dx : 0;
    vmSlideOffsetRef.current = offset;
    setVmSlideOffset(offset);
  }, [voiceNote.isRecording]);

  const onMicPointerUp = useCallback(() => {
    if (!micHeldRef.current && !voiceNote.isRecording) return;
    micHeldRef.current = false;
    if (vmSlideOffsetRef.current < -72) {
      voiceNote.cancel();
    } else if (voiceNote.isRecording) {
      voiceNote.stop();
    }
    vmSlideOffsetRef.current = 0;
    setVmSlideOffset(0);
  }, [voiceNote]);

  const onMicCancel = useCallback(() => {
    micHeldRef.current = false;
    vmSlideOffsetRef.current = 0;
    setVmSlideOffset(0);
    voiceNote.cancel();
  }, [voiceNote]);

  useEffect(() => {
    if (!voiceNote.isRecording) return undefined;
    const onWindowMove = (e) => onMicPointerMove(e);
    const onWindowUp = () => {
      if (micHeldRef.current) onMicPointerUp();
    };
    window.addEventListener("pointermove", onWindowMove);
    window.addEventListener("pointerup", onWindowUp);
    return () => {
      window.removeEventListener("pointermove", onWindowMove);
      window.removeEventListener("pointerup", onWindowUp);
    };
  }, [voiceNote.isRecording, onMicPointerMove, onMicPointerUp]);

  function startEditMessage(m) {
    setEditingId(normalizeMessageId(m.id));
    setEditText(m.deleted ? "" : (m.text ?? ""));
  }

  function cancelEditMessage() {
    setEditingId(null);
    setEditText("");
  }

  async function saveEditMessage() {
    if (!editingId || !editText.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      const saved = await editMessage(editingId, editText.trim());
      const apply = (list) =>
        list.map((m) =>
          isSameMessageId(m.id, editingId) ? mapMessage(saved, myUserId) : m,
        );
      setMessages(apply);
      setSearchResults((prev) => (prev.length ? apply(prev) : prev));
      cancelEditMessage();
    } catch (error) {
      notify({
        title: i18n.t("messages.couldntEditMessage"),
        message:
          error?.response?.data?.error ||
          error?.response?.data?.message ||
          i18n.t("messages.failedEditMessage"),
      });
    } finally {
      setSavingEdit(false);
    }
  }

  async function removeMessage(m) {
    if (!m?.id || typeof m.id !== "number") return;
    const messageId = normalizeMessageId(m.id);
    const apply = (list) =>
      list.map((x) => {
        if (!isSameMessageId(x.id, messageId)) return x;
        return { ...x, deleted: true, text: i18n.t("shared.messageDeleted") };
      });
    setMessages(apply);
    setSearchResults((prev) => (prev.length ? apply(prev) : prev));
    try {
      const saved = await deleteMessage(messageId);
      if (saved?.deleted_at != null) {
        const withSaved = (list) =>
          list.map((x) =>
            isSameMessageId(x.id, messageId) ? mapMessage(saved, myUserId) : x,
          );
        setMessages(withSaved);
        setSearchResults((prev) => (prev.length ? withSaved(prev) : prev));
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((x) =>
          isSameMessageId(x.id, messageId) ? { ...m, deleted: false, text: m.text } : x,
        ),
      );
      notify({
        title: i18n.t("messages.couldntDeleteMessage"),
        message:
          error?.response?.data?.error ||
          error?.response?.data?.message ||
          i18n.t("messages.failedDeleteMessage"),
      });
    }
  }

  async function toggleMute(conv) {
    try {
      const next = !(conv.muted ?? false);
      await muteChannel(conv.channel_id, next);
      setConversations((prev) =>
        prev.map((c) =>
          c.channel_id === conv.channel_id ? { ...c, muted: next } : c,
        ),
      );
      // After await, React state may be stale; patch storage from the latest map.
      const map = patchMutedConv(conv.channel_id, next ? -1 : null);
      setMutedConvs(map);
    } catch {
      /* ignore */
    }
  }

  function toggleStar(m) {
    const id = normalizeMessageId(m.id);
    if (id == null) return;
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem("strug_starred_msgs", JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  async function handleReact(m, emoji) {
    if (!m?.id || typeof m.id !== "number") return;
    try {
      const updated = await reactToMessage(m.id, emoji);
      const apply = (list) => list.map((x) => isSameMessageId(x.id, m.id) ? mapMessage(updated, myUserId) : x);
      setMessages(apply);
      setSearchResults((prev) => (prev.length ? apply(prev) : prev));
    } catch {}
  }

  async function handleDoubleTapReact(m) {
    if (!m?.id || m.deleted) return;
    const reactions = m.metadata?.reactions ?? {};
    const heartUsers = reactions["❤️"];
    const already = Array.isArray(heartUsers) && heartUsers.some((uid) => isSameUser(uid, myUserId));
    if (!already && typeof m.id === "number") {
      await handleReact(m, "❤️");
    }
  }

  async function handlePin(m) {
    if (!m?.id || typeof m.id !== "number") return;
    try {
      const updated = await pinMessage(m.id);
      const apply = (list) => list.map((x) => isSameMessageId(x.id, m.id) ? mapMessage(updated, myUserId) : x);
      setMessages(apply);
      setSearchResults((prev) => (prev.length ? apply(prev) : prev));
    } catch {}
  }

  async function forwardMessage() {
    if (!forwardMsg || !forwardTarget || forwarding) return;
    setForwarding(true);
    try {
      const channelId = forwardTarget.channel_id;
      const text = forwardMsg.text ?? "";
      const clientMsgId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      await sendChatMessageRest(channelId, text, "text", clientMsgId);
    } catch {}
    setForwarding(false);
    setShowForwardModal(false);
    setForwardMsg(null);
    setForwardTarget(null);
  }

  // Task 2: Delete for me
  function handleDeleteForMe(m) {
    const id = normalizeMessageId(m.id);
    if (id == null) return;
    setHiddenMsgIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem("strug_hidden_msgs", JSON.stringify([...next])); } catch {}
      return next;
    });
    setMessages((prev) => prev.filter((x) => !isSameMessageId(x.id, id)));
  }

  // Task 3: Scheduled messages are delivered by the backend cron (no client flush send).
  // Refresh the pending list periodically so rows disappear after server send.
  useEffect(() => {
    if (!myUserId) return undefined;
    const tick = setInterval(() => { refreshScheduledQueue(activeChatId); }, 15000);
    const onVis = () => {
      if (document.visibilityState === "visible") refreshScheduledQueue(activeChatId);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [myUserId, activeChatId, refreshScheduledQueue]);

  async function scheduleCurrentMessage() {
    setScheduleError("");
    if (!inputMsg.trim() || !activeChatId || !scheduledFor || sendingRef.current) return;
    if (!isValidScheduleTime(scheduledFor)) {
      setScheduleError(i18n.t("messages.scheduleTooSoon", { defaultValue: "Pick a time at least 30 seconds from now." }));
      return;
    }
    sendingRef.current = true;
    setSending(true);
    try {
      await createScheduledMessage({
        channelId: activeChatId,
        content: inputMsg.trim(),
        contentType: "text",
        clientMsgId: `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        scheduledFor,
        metadata: replyTo
          ? {
              reply_to: {
                id: replyTo.id,
                text: replyTo.text,
                senderName: replyTo.senderName,
                from: replyTo.from,
              },
            }
          : null,
      });
      setInputMsg("");
      setScheduledFor(null);
      setReplyTo(null);
      await refreshScheduledQueue(activeChatId);
    } catch (error) {
      setScheduleError(
        error?.response?.data?.error ||
          error?.message ||
          i18n.t("messages.scheduleTooSoon", { defaultValue: "Could not schedule message." }),
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function cancelScheduledMsg(scheduledMessageId) {
    try {
      await cancelScheduledMessage(scheduledMessageId);
      await refreshScheduledQueue(activeChatId);
      if (editingScheduledId === scheduledMessageId) {
        setEditingScheduledId(null);
        setEditScheduledText("");
        setEditScheduledFor(null);
      }
    } catch (error) {
      setScheduleError(error?.response?.data?.error || error?.message || "Could not cancel.");
    }
  }

  async function saveScheduledEdit() {
    if (!editingScheduledId || savingScheduleEdit) return;
    const original = scheduledQueue.find((s) => s.scheduledMessageId === editingScheduledId);
    const built = buildScheduledMessageUpdatePayload({
      content: editScheduledText,
      scheduledFor: editScheduledFor,
      originalScheduledFor: original?.scheduledFor,
    });
    if (!built.ok) {
      setScheduleError(
        built.error === "empty"
          ? i18n.t("messages.scheduleTooSoon", { defaultValue: "Message text is required." })
          : i18n.t("messages.scheduleTooSoon", { defaultValue: "Pick a time at least 30 seconds from now." }),
      );
      return;
    }
    setSavingScheduleEdit(true);
    setScheduleError("");
    try {
      await updateScheduledMessage(editingScheduledId, built.payload);
      setEditingScheduledId(null);
      setEditScheduledText("");
      setEditScheduledFor(null);
      await refreshScheduledQueue(activeChatId);
    } catch (error) {
      setScheduleError(error?.response?.data?.error || error?.message || "Could not update schedule.");
    } finally {
      setSavingScheduleEdit(false);
    }
  }

  // Task 5: Vote on a poll
  async function handleVotePoll(messageId, optionId) {
    if (!messageId || typeof messageId !== "number") return;
    try {
      const { votePoll } = await import("../api/chat");
      const updated = await votePoll(messageId, optionId);
      const apply = (list) => list.map((x) => isSameMessageId(x.id, messageId) ? mapMessage(updated, myUserId) : x);
      setMessages(apply);
      setSearchResults((prev) => (prev.length ? apply(prev) : prev));
    } catch {}
  }

  // Task 5: Send poll
  async function sendPoll() {
    const opts = pollOptions.filter((o) => o.trim());
    if (!pollQuestion.trim() || opts.length < 2 || !activeChatId) return;
    const clientMsgId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const meta = { question: pollQuestion.trim(), options: opts.map((text, id) => ({ id, text, voters: [] })), allowMultiple: false };
    setShowPollModal(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
    const optimistic = {
      id: `tmp-${clientMsgId}`,
      clientMsgId,
      from: "me",
      senderId: myUserId,
      senderName: myProfile.senderName,
      profilePicUrl: myProfile.profilePicUrl,
      avatarInitial: myProfile.avatarInitial,
      text: meta.question,
      contentType: "poll",
      time: i18n.t("messages.justNow"),
      sentAt: new Date().toISOString(),
      edited: false,
      deleted: false,
      isRead: false,
      metadata: meta,
    };
    setMessages((prev) => [...prev, optimistic]);
    forceScrollToLatest("smooth");
    try {
      const saved = await sendChatMessageRest(activeChatId, meta.question, "poll", clientMsgId, meta);
      const mapped = mapMessage(saved, myUserId);
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== optimistic.id && !(m.clientMsgId === clientMsgId && typeof m.id === "number"));
        if (without.some((m) => isSameMessageId(m.id, mapped.id))) return without;
        return [...without, mapped];
      });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    }
  }

  async function sendEvent() {
    if (!eventTitle.trim() || !eventDate || !eventTime || !activeChatId) return;
    const clientMsgId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const meta = { title: eventTitle.trim(), date: eventDate, time: eventTime, note: eventNote.trim() };
    setShowEventModal(false);
    setEventTitle(""); setEventDate(""); setEventTime(""); setEventNote("");
    try {
      const saved = await sendChatMessageRest(activeChatId, `📅 ${eventTitle.trim()} — ${eventDate} ${eventTime}`, "event", clientMsgId, meta);
      const mapped = mapMessage(saved, myUserId);
      setMessages((prev) => {
        if (prev.some((m) => isSameMessageId(m.id, mapped.id))) return prev;
        return [...prev, mapped];
      });
      forceScrollToLatest("smooth");
    } catch {}
  }

  // Task 6: Send location
  async function sendLocation() {
    if (!activeChatId) return;
    if (!navigator.geolocation) { alert("Geolocation not supported."); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      const clientMsgId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      try {
        const saved = await sendChatMessageRest(activeChatId, `Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, "location", clientMsgId, { lat, lng });
        const mapped = mapMessage(saved, myUserId);
        setMessages((prev) => {
          if (prev.some((m) => isSameMessageId(m.id, mapped.id))) return prev;
          return [...prev, mapped];
        });
        forceScrollToLatest("smooth");
      } catch {}
    }, () => { alert("Could not get your location."); });
  }

  // Task 7: Disappearing messages UI is Coming soon (no setter until server expiry ships).

  // Task 8: Wallpaper + font size
  function setWallpaperForChannel(channelId, color) {
    setChatWallpaper((prev) => {
      const next = { ...prev, [channelId]: color };
      try { localStorage.setItem("strug_wallpapers", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function saveFontSize(size) {
    setFontSize(size);
    try { localStorage.setItem("strug_fontsize", String(size)); } catch {}
  }

  // Task 9: Favourite conversations
  function toggleFavConv(channelId) {
    setFavConvIds((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) next.delete(channelId); else next.add(channelId);
      try { localStorage.setItem("strug_fav_convs", JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  // Task 10: Nickname, note, block
  function saveNickname(partnerId, name) {
    setNicknames((prev) => {
      const next = { ...prev, [partnerId]: name };
      try { localStorage.setItem("strug_nicknames", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function savePrivateNote(partnerId, note) {
    setPrivateNotes((prev) => {
      const next = { ...prev, [partnerId]: note };
      try { localStorage.setItem("strug_notes", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  async function resolvePeerProfileId(conv) {
    const direct = conv.other_user?.profile_id;
    if (direct) return direct;
    const uid = conv.other_user?.user_id;
    if (!uid) return null;
    try {
      const d = await getProfileByUserId(uid);
      const p = d?.data ?? d;
      return p?.profile_id ?? null;
    } catch {
      return null;
    }
  }

  async function blockContact(conv) {
    const ok = window.confirm(`Block ${convTitle(conv)}?`);
    if (!ok) return;
    const partnerId = conv.other_user?.user_id;
    setBlockedIds((prev) => {
      const next = new Set(prev);
      if (partnerId) next.add(partnerId);
      try { localStorage.setItem("strug_blocked", JSON.stringify([...next])); } catch {}
      return next;
    });
    const profileId = await resolvePeerProfileId(conv);
    if (profileId) {
      try { await blockUser(profileId); } catch { /* noop */ }
    }
    try { await deleteConversation(conv.channel_id); } catch {}
    setConversations((prev) => prev.filter((c) => c.channel_id !== conv.channel_id));
    if (activeChatId === conv.channel_id) setActiveChatId(null);
    setShowChatSettings(false);
    setSettingsSub(null);
    setConvMenuId(null);
  }

  async function reportContact(conv, reason) {
    const profileId = await resolvePeerProfileId(conv);
    if (profileId) {
      try {
        await reportProfile(profileId, reason || "Reported by user");
      } catch { /* noop */ }
    }
    alert("Report submitted. Thank you.");
  }

  // Task 11: Smart reply suggestions
  function smartRepliesFor(msg) {
    if (!msg) return [];
    const text = coerceChatText(msg.text).toLowerCase();
    if (text.includes("?")) return ["Yes", "No", "Let me check"];
    if (text.includes("thanks") || text.includes("thank you")) return ["You're welcome!", "Of course!", "Anytime!"];
    if (text.includes("hi") || text.includes("hello") || text.includes("hey")) return ["Hey!", "Hi there!", "Hello!"];
    return ["👍", "Sounds good!", "Got it"];
  }

  // Task 12: Mood status
  function saveMood(value) {
    setMood(value);
    try { localStorage.setItem("strug_mood", value); } catch {}
  }

  // Delete (leave) a whole conversation — previously you could only delete individual
  // messages, not the thread (bug #8). Optimistically drop it; restore on failure.
  async function handleCreateGroup() {
    if (!newGroupName.trim() || creatingGroup) return;
    setCreatingGroup(true);
    try {
      const apiClient = await import("../api/client.js").then((m) => m.default);
      const { data } = await apiClient.post("/chat-channel", { type: "group", channel_name: newGroupName.trim() });
      const channelId = data?.channel_id;
      if (channelId) {
        if (groupPickerMembers.size > 0) {
          await Promise.allSettled([...groupPickerMembers].map((uid) =>
            apiClient.post(`/chat-channel/${channelId}/participants`, { user_id: uid })
          ));
        }
        setNewGroupName("");
        setGroupPickerMembers(new Set());
        setGroupStep("pick");
        setShowGlobalMenu(false);
        setGlobalMenuTab(null);
        stickToBottomRef.current = true;
        canLoadOlderRef.current = false;
        setActiveChatId(Number(channelId));
        const { getMyConversations } = await import("../api/chat.js");
        const updated = await getMyConversations();
        setConversations(Array.isArray(updated) ? updated : (updated?.channels ?? []));
      }
    } catch {
      // ignore
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleDeleteConversation(conv) {
    const ok = await confirm({
      title: i18n.t("messages.deleteConversationTitle"),
      message: i18n.t("messages.deleteConversationMessage"),
      confirmLabel: i18n.t("messages.delete"),
    });
    if (!ok) return;
    const prevConvs = conversations;
    setConversations((prev) => prev.filter((c) => c.channel_id !== conv.channel_id));
    if (activeChatId === conv.channel_id) setActiveChatId(null);
    try {
      await deleteConversation(conv.channel_id);
      notifyChatInboxUpdate();
    } catch {
      setConversations(prevConvs);
      notify({
        title: i18n.t("messages.couldntDelete"),
        message: i18n.t("messages.couldntDeleteConversation"),
      });
    }
  }

  const activeConv = conversations.find((c) => c.channel_id === activeChatId);
  const isGroupChat = !!activeConv && activeConv.type !== "dm";
  const partnerProfile =
    activeConv && !isGroupChat ? buildPartnerProfile(activeConv) : null;
  const senderLookup = useMemo(
    () =>
      buildParticipantLookup(
        channelParticipants.length
          ? channelParticipants
          : activeConv?.participants,
      ),
    [channelParticipants, activeConv?.participants],
  );

  useEffect(() => {
    setShowMembers(false);
    setChannelParticipants([]);
    if (!activeChatId || !isGroupChat) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const list = await getChannelParticipants(activeChatId);
        if (!cancelled) {
          setChannelParticipants(Array.isArray(list) ? list : []);
        }
      } catch {
        if (!cancelled && activeConv?.participants) {
          setChannelParticipants(activeConv.participants);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeChatId, isGroupChat, activeConv?.participants]);

  useEffect(() => {
    if (!showGlobalMenu && !convMenuId) return undefined;
    function handleOutside(e) {
      if (!e.target.closest("[data-menu-anchor]")) {
        setShowGlobalMenu(false);
        setConvMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showGlobalMenu, convMenuId]);

  // Journal load — must be before the loading early-return so hook count is stable
  useEffect(() => {
    if (!showJournal || !activeChatId) return;
    setJournalLoading(true);
    const cid = activeChatId;
    const load = async () => {
      try {
        if (journalTab === "highlights") {
          const data = await getHighlights(cid);
          setJournalHighlights(Array.isArray(data) ? data : []);
        } else if (journalTab === "bucket") {
          const data = await getBucketList(cid);
          setJournalBucket(Array.isArray(data) ? data : []);
        } else if (journalTab === "capsules") {
          const data = await getCapsules(cid);
          setJournalCapsules(Array.isArray(data) ? data : []);
        } else if (journalTab === "memories") {
          const data = await getMonthlyMemory(cid, journalMemoryYM.year, journalMemoryYM.month);
          setJournalMemory(data);
        }
      } catch {}
      setJournalLoading(false);
    };
    load();
  }, [showJournal, journalTab, activeChatId, journalMemoryYM]);

  function openSupportTicketChannel(channelId) {
    stickToBottomRef.current = true;
    canLoadOlderRef.current = false;
    setActiveChatId(Number(channelId));
    openChatChannel(channelId, { navigate: false });
  }

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          paddingLeft: isMobile ? 16 : 108,
          paddingRight: isMobile ? 16 : 32,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ paddingTop: 28, paddingBottom: 16 }}>
          <SkeletonHeading />
        </div>
        <div style={{ display: "flex", gap: 16, flex: 1 }}>
          {!isMobile && <Skel w={280} h="100%" r={14} style={{ flexShrink: 0 }} />}
          <Skel style={{ flex: 1 }} h="100%" r={14} />
        </div>
      </div>
    );
  }

  const activeWallpaper = activeChatId ? (chatWallpaper[activeChatId] ?? "") : "";

  const chatHeader = activeConv ? (
    <div
      style={{
        padding: isMobile ? "14px 16px" : "14px 18px",
        borderBottom: "1px solid var(--color-border-subtle)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexShrink: 0,
        // Wallpaper scrim over an arbitrary background image — stays dark regardless of
        // theme (rule 3), same as ChatInput's matching scrim.
        background: activeWallpaper ? "rgba(0,0,0,0.35)" : undefined,
        backdropFilter: activeWallpaper ? "blur(4px)" : undefined,
      }}
    >
      {isMobile && (
        <button
          onClick={() => (navReturn ? returnToContext() : setActiveChatId(null))}
          style={{
            background: "none",
            border: "none",
            // Header sits on a fixed-dark wallpaper scrim when set (rule 3), else the
            // themed panel background — text/icon color follows suit (rule 4).
            color: activeWallpaper ? "#fff" : "var(--color-text-primary)",
            cursor: "pointer",
            padding: "4px 8px 4px 0",
            display: "flex",
            alignItems: "center",
          }}
        >
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}
      <div
        onClick={() => {
          const uid = activeConv.other_user?.user_id;
          if (uid != null) { window.__profileTargetId = uid; window.__nav?.("profile"); }
        }}
        style={{
          cursor: activeConv.other_user?.user_id ? "pointer" : "default",
          width: 38,
          height: 38,
          borderRadius: "50%",
          // #457: the photo (objectFit:cover, 100%x100%) hides this colour entirely when it loads,
          // and it is exactly the disc we want behind the initial when the photo 404s.
          background: convAccentColor(activeConv.channel_id, COLORS),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 800,
          fontSize: 15,
          color: "#fff",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <SafeImage
          src={activeConv.other_user?.profile_pic_url}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          fallback={convAvatar(activeConv)}
        />
      </div>
      <div
        style={{ flex: 1, minWidth: 0, cursor: activeConv.other_user?.user_id ? "pointer" : "default" }}
        onClick={() => {
          const uid = activeConv.other_user?.user_id;
          if (uid != null) { window.__profileTargetId = uid; window.__nav?.("profile"); }
        }}
      >
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            fontSize: 15,
            color: activeWallpaper ? "#fff" : "var(--color-text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {(activeConv.other_user?.user_id && nicknames[activeConv.other_user.user_id]) || convTitle(activeConv)}
        </p>
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            color: (!typingUserId && !isGroupChat && isUserOnline(activeConv.other_user?.user_id)) ? "#4ade80" : activeWallpaper ? "rgba(255,255,255,0.55)" : "var(--color-text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: 5,
            flexWrap: "wrap",
          }}
        >
          {coerceContextTypeKey(activeConv.context_type) && coerceContextTypeKey(activeConv.context_type) !== "dm" && (
            <ChatContextOriginBadge
              contextType={activeConv.context_type}
              contextId={activeConv.context_id}
              t={i18n.t.bind(i18n)}
              style={{ marginTop: 2 }}
            />
          )}
          {typingUserId ? (
            i18n.t("messages.typing")
          ) : (!isGroupChat && isUserOnline(activeConv.other_user?.user_id)) ? (
            <>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", display: "inline-block", flexShrink: 0 }} />
              {i18n.t("messages.online")}
            </>
          ) : (
            convSubtitle(activeConv)
          )}
        </p>
      </div>
      <div
        style={{
          display: "flex",
          gap: isMobile ? 4 : 6,
          flexShrink: 0,
          alignItems: "center",
          maxWidth: isMobile ? "44vw" : "min(50%, 400px)",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
      >
        {navReturn && (
          <button
            type="button"
            onClick={returnToContext}
            style={{
              padding: "6px 12px",
              background: "rgba(245,158,11,0.12)",
              border: "1px solid rgba(245,158,11,0.35)",
              borderRadius: 8,
              color: "#fbbf24",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {navReturn.label}
          </button>
        )}
        {isGroupChat && (
          <button
            type="button"
            onClick={() => setShowMembers((v) => !v)}
            title={i18n.t("messages.viewMembers")}
            style={{
              background: showMembers ? "rgba(37,99,235,0.2)" : activeWallpaper ? "rgba(255,255,255,0.06)" : "var(--color-surface-raised)",
              border: activeWallpaper ? "1px solid rgba(255,255,255,0.1)" : "1px solid var(--color-border)",
              borderRadius: 8,
              padding: "6px 10px",
              color: activeWallpaper ? "#fff" : "var(--color-text-primary)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {i18n.t("messages.members")}
          </button>
        )}
        {!isMobile && (
        <>
        <Tooltip text="Starred messages"><button
          type="button"
          aria-label="Starred messages"
          onClick={() => setShowStarred((v) => !v)}
          style={{
            background: showStarred ? "rgba(250,204,21,0.18)" : activeWallpaper ? "rgba(255,255,255,0.06)" : "var(--color-surface-raised)",
            border: showStarred ? "1px solid rgba(250,204,21,0.4)" : activeWallpaper ? "1px solid rgba(255,255,255,0.1)" : "1px solid var(--color-border)",
            borderRadius: 8,
            padding: "6px 10px",
            color: showStarred ? "#facc15" : activeWallpaper ? "rgba(255,255,255,0.6)" : "var(--color-text-secondary)",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          ★
        </button></Tooltip>
        <Tooltip text="Friend Journal"><button
          type="button"
          aria-label="Friend Journal"
          onClick={() => { setShowJournal(v => !v); setJournalTab("highlights"); }}
          style={{
            background: showJournal ? "rgba(167,139,250,0.18)" : activeWallpaper ? "rgba(255,255,255,0.06)" : "var(--color-surface-raised)",
            border: showJournal ? "1px solid rgba(167,139,250,0.4)" : activeWallpaper ? "1px solid rgba(255,255,255,0.1)" : "1px solid var(--color-border)",
            borderRadius: 8,
            padding: "6px 10px",
            color: showJournal ? "#a78bfa" : activeWallpaper ? "rgba(255,255,255,0.6)" : "var(--color-text-secondary)",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          📓
        </button></Tooltip>
        </>
        )}
        <button
          type="button"
          onClick={() => {
            setShowSearch((open) => {
              if (open) clearChatSearch();
              return !open;
            });
          }}
          title={i18n.t("messages.searchMessages")}
          aria-label={i18n.t("messages.searchMessages")}
          style={{
            background: showSearch ? "rgba(37,99,235,0.2)" : activeWallpaper ? "rgba(255,255,255,0.06)" : "var(--color-surface-raised)",
            border: activeWallpaper ? "1px solid rgba(255,255,255,0.1)" : "1px solid var(--color-border)",
            borderRadius: 8,
            padding: isMobile ? 0 : "6px 10px",
            ...(isMobile ? { width: 32, height: 32 } : null),
            color: activeWallpaper ? "#fff" : "var(--color-text-primary)",
            fontSize: 11,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isMobile ? (
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          ) : (
            i18n.t("messages.search")
          )}
        </button>
        {!isMobile && (
          <button
            onClick={() => toggleMute(activeConv)}
            title={activeConv.muted ? i18n.t("messages.unmute") : i18n.t("messages.mute")}
            aria-label={activeConv.muted ? i18n.t("messages.unmute") : i18n.t("messages.mute")}
            style={{
              background: activeWallpaper ? "rgba(255,255,255,0.06)" : "var(--color-surface-raised)",
              border: activeWallpaper ? "1px solid rgba(255,255,255,0.1)" : "1px solid var(--color-border)",
              borderRadius: 8,
              padding: "6px 10px",
              color: activeWallpaper ? "rgba(255,255,255,0.6)" : "var(--color-text-secondary)",
              fontSize: 11,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {activeConv.muted ? (
                <>
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </>
              ) : (
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
              )}
            </svg>
          </button>
        )}
        <Tooltip text={i18n.t("messages.chatSettings")}><button
          ref={settingsBtnRef}
          type="button"
          aria-label={i18n.t("messages.chatSettings")}
          onClick={() => {
            if (showChatSettings) {
              setSettingsSub(null);
            } else {
              const rect = settingsBtnRef.current?.getBoundingClientRect();
              if (rect) setSettingsMenuRect(rect);
            }
            setShowChatSettings((v) => !v);
          }}
          style={{
            background: showChatSettings ? "rgba(37,99,235,0.18)" : activeWallpaper ? "rgba(255,255,255,0.06)" : "var(--color-surface-raised)",
            border: activeWallpaper ? "1px solid rgba(255,255,255,0.1)" : "1px solid var(--color-border)",
            borderRadius: 8,
            padding: isMobile ? 0 : "6px 10px",
            ...(isMobile ? { width: 32, height: 32 } : null),
            color: activeWallpaper ? "rgba(255,255,255,0.6)" : "var(--color-text-secondary)",
            fontSize: 11,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >{isMobile ? (
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        ) : i18n.t("messages.chatSettings")}</button></Tooltip>
      </div>
    </div>
  ) : null;

  async function handleAddHighlightFromMessage(msg) {
    if (!activeChatId) return;
    try {
      const payload = {
        message_id: msg.id,
        content: msg.text ?? msg.content ?? null,
        content_type: msg.contentType ?? msg.content_type ?? "text",
        media_url: msg.mediaUrl ?? msg.media_url ?? null,
      };
      await addHighlight(activeChatId, payload);
      if (showJournal && journalTab === "highlights") {
        const data = await getHighlights(activeChatId);
        setJournalHighlights(Array.isArray(data) ? data : []);
      }
    } catch {}
  }

  async function handleDeleteHighlight(id) {
    if (!activeChatId) return;
    try {
      await deleteHighlight(activeChatId, id);
      setJournalHighlights(prev => prev.filter(h => h.id !== id));
    } catch {}
  }

  async function handleAddBucketItem() {
    if (!newBucketTitle.trim() || !activeChatId) return;
    try {
      await addBucketItem(activeChatId, {
        title: newBucketTitle.trim(),
        emoji: newBucketEmoji || null,
        category: newBucketCategory,
      });
      setNewBucketTitle(""); setNewBucketEmoji(""); setShowAddBucket(false);
      const data = await getBucketList(activeChatId);
      setJournalBucket(Array.isArray(data) ? data : []);
    } catch {}
  }

  async function handleToggleBucketComplete(item) {
    if (!activeChatId) return;
    try {
      await updateBucketItem(activeChatId, item.id, { is_completed: !item.is_completed });
      const data = await getBucketList(activeChatId);
      setJournalBucket(Array.isArray(data) ? data : []);
    } catch {}
  }

  async function handleDeleteBucketItem(id) {
    if (!activeChatId) return;
    try {
      await deleteBucketItem(activeChatId, id);
      setJournalBucket(prev => prev.filter(b => b.id !== id));
    } catch {}
  }

  async function handleAddCapsule() {
    if (!newCapsuleTitle.trim() || !newCapsuleDate || !activeChatId) return;
    try {
      await addCapsule(activeChatId, {
        title: newCapsuleTitle.trim(),
        description: newCapsuleNote.trim() || null,
        unlock_date: new Date(newCapsuleDate).toISOString(),
        contents: { note: newCapsuleNote.trim() },
      });
      setNewCapsuleTitle(""); setNewCapsuleNote(""); setNewCapsuleDate(""); setShowAddCapsule(false);
      const data = await getCapsules(activeChatId);
      setJournalCapsules(Array.isArray(data) ? data : []);
    } catch {}
  }

  async function handleDeleteCapsule(id) {
    if (!activeChatId) return;
    try {
      await deleteCapsule(activeChatId, id);
      setJournalCapsules(prev => prev.filter(c => c.id !== id));
    } catch {}
  }

  async function handleContributeCapsule(id) {
    if (!contributeNote.trim() || !activeChatId) return;
    try {
      await contributeCapsule(activeChatId, id, { note: contributeNote.trim() });
      setContributingCapsuleId(null); setContributeNote("");
      const data = await getCapsules(activeChatId);
      setJournalCapsules(Array.isArray(data) ? data : []);
    } catch {}
  }

  async function handleInviteMember() {
    if (!inviteInput.trim() || !activeChatId) return;
    setInviteError("");
    try {
      const result = await addGroupMember(activeChatId, inviteInput.trim());
      setInviteInput("");
      // Refresh participant list
      const list = await getChannelParticipants(activeChatId);
      setChannelParticipants(Array.isArray(list) ? list : []);
      if (result?.message === "Already a member") setInviteError("Already a member.");
    } catch (err) {
      setInviteError(err?.response?.data?.error ?? "User not found.");
    }
  }

  const membersPanel =
    showMembers && isGroupChat ? (
      <div
        style={{
          padding: "10px 18px 14px",
          // Sits directly on chatBody's background, which is either a fixed-dark preset
          // wallpaper color or the theme-following panel bg — same rule-4 conditional as
          // chatHeader/ChatInput above.
          borderBottom: activeWallpaper ? "1px solid rgba(255,255,255,0.08)" : "1px solid var(--color-border-subtle)",
          flexShrink: 0,
        }}
      >
        {/* Member chips */}
        {channelParticipants.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {channelParticipants.map((p) => (
              <span
                key={p.user_id}
                style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: activeWallpaper ? "rgba(255,255,255,0.75)" : "var(--color-text-secondary)", background: activeWallpaper ? "rgba(255,255,255,0.08)" : "var(--color-surface-raised)", border: activeWallpaper ? "1px solid rgba(255,255,255,0.1)" : "1px solid var(--color-border)", borderRadius: 20, padding: "4px 10px" }}
              >
                {p.name}{p.role === "owner" ? " 👑" : p.role === "admin" ? " ⚡" : ""}
              </span>
            ))}
          </div>
        )}
        {/* Invite input */}
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={inviteInput}
            onChange={(e) => { setInviteInput(e.target.value); setInviteError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleInviteMember()}
            placeholder="Add by name or username…"
            style={{ flex: 1, background: activeWallpaper ? "rgba(255,255,255,0.07)" : "var(--color-surface-raised)", border: activeWallpaper ? "1px solid rgba(255,255,255,0.14)" : "1px solid var(--color-border)", borderRadius: 8, padding: "7px 10px", color: activeWallpaper ? "#fff" : "var(--color-text-primary)", fontSize: 12, outline: "none" }}
          />
          <button
            type="button"
            onClick={handleInviteMember}
            disabled={!inviteInput.trim()}
            style={{ padding: "7px 14px", background: inviteInput.trim() ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 600, cursor: inviteInput.trim() ? "pointer" : "default", fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}
          >
            Add
          </button>
        </div>
        {inviteError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#f87171", marginTop: 5 }}>{inviteError}</p>}
      </div>
    ) : null;

  const chatBody = (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
        background: activeWallpaper || undefined,
        transition: "background 0.25s ease",
      }}
    >
      {chatHeader}
      {membersPanel}
      {pinnedMsg && !showStarred && (
        <div style={{ padding: "6px 16px", background: "rgba(250,204,21,0.08)", borderBottom: "1px solid rgba(250,204,21,0.2)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/></svg>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#facc15", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pinnedMsg.text ?? "[media]"}</p>
          <button type="button" onClick={() => handlePin(pinnedMsg)} style={{ background: "none", border: "none", color: activeWallpaper ? "rgba(255,255,255,0.55)" : "var(--color-text-secondary)", cursor: "pointer", fontSize: 13, padding: "2px 4px" }}>Unpin</button>
        </div>
      )}
      {activeChatId && shouldShowDisappearingBanner(disappearing[activeChatId]) && (
        <div style={{ padding: "5px 16px", background: "rgba(239,68,68,0.07)", borderBottom: "1px solid rgba(239,68,68,0.18)", flexShrink: 0 }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#f87171", display: "flex", alignItems: "center", gap: 5 }}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2c0 0-4 4-4 8a4 4 0 0 0 8 0 4.5 4.5 0 0 0-.5-2c-.5 1-1.5 1.5-2.5 1.5a2.5 2.5 0 0 1-2.5-2.5C10.5 4.5 12 2 12 2z"/></svg>Messages disappear after {disappearing[activeChatId]}</p>
        </div>
      )}
      {showChatSettings && activeChatId && activeConv && (() => {
        const partnerId = activeConv.other_user?.user_id;
        const nick = partnerId ? (nicknames[partnerId] ?? "") : "";
        const wall = chatWallpaper[activeChatId] ?? "";
        const WALLPAPERS = ["", "#0d1421", "#1a0a2e", "#0a1f0a", "#0a1f1f", "#1a1a1a", "#0a0a1e", "#1a0a0a"];
        const WALL_NAMES = ["Default", "Navy", "Purple", "Forest", "Teal", "Charcoal", "Midnight", "Warm Dark"];
        // Disappearing messages remain Coming soon; do not surface legacy Off banners.
        // Settings floats over the chat area with its own opaque surface, independent of
        // the conversation's wallpaper — tokenizes plainly like other floating chrome.
        // On both desktop and mobile it's a dropdown anchored to the gear button (not a
        // full-width/full-screen takeover), positioned from the button's rect on open.
        const rect = settingsMenuRect;
        const panelWrap = {
          position: "fixed",
          top: rect ? Math.min(rect.bottom + 8, window.innerHeight - 60) : 60,
          right: rect ? Math.max(8, window.innerWidth - rect.right) : 8,
          width: isMobile ? "min(300px, calc(100vw - 24px))" : 320,
          maxHeight: "min(70vh, 460px)",
          zIndex: 12000,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 14,
          boxShadow: "0 12px 36px rgba(0,0,0,0.45)",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          display: "flex",
          flexDirection: "column",
        };
        // Transparent full-screen catcher — closes the dropdown on an outside tap, the
        // same pattern MoreFlyout/ProfileFlyout use for their popovers.
        const backdrop = (
          <div
            onClick={() => { setShowChatSettings(false); setSettingsSub(null); }}
            style={{ position: "fixed", inset: 0, zIndex: 11999 }}
          />
        );
        const row = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", borderBottom: "1px solid var(--color-border-subtle)", cursor: "pointer" };
        const label = { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "var(--color-text-primary)" };
        const sub = { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "var(--color-text-muted)", marginTop: 1 };
        const chev = <span className="text-text-muted" style={{ fontSize: 16 }}>›</span>;
        const backBtn = (
          <button type="button" onClick={() => setSettingsSub(null)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#60a5fa", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: "11px 18px 8px" }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>‹</span> Back
          </button>
        );

        if (!settingsSub) {
          const menuItems = [
            { key: "disappearing", label: "Disappearing messages", hint: "Coming soon", disabled: true },
            { key: "theme", label: "Chat theme", hint: wall ? "Custom" : "Default" },
            { key: "fontsize", label: "Font size", hint: `${fontSize}px` },
            ...(partnerId ? [{ key: "nickname", label: "Nickname", hint: nick || "Not set" }] : []),
          ];
          return (
            <>
              {backdrop}
              <div style={panelWrap}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px 10px",
                  borderBottom: "1px solid var(--color-border-subtle)",
                  minWidth: 0,
                  background: "var(--color-surface)",
                  borderRadius: "14px 14px 0 0",
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                }}
              >
                <p
                  className="text-text-primary"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: 15,
                    flex: 1,
                    minWidth: 0,
                    margin: 0,
                  }}
                >
                  {i18n.t("messages.chatSettings")}
                </p>
                <button type="button" onClick={() => { setSettingsSub(null); setShowChatSettings(false); }} className="text-text-muted" aria-label={i18n.t("messages.cancel")} style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 2px" }}>×</button>
              </div>
              {menuItems.map(({ key, label: lbl, hint, disabled }) => (
                <div key={key} role="button" tabIndex={disabled ? -1 : 0} title={disabled ? "Coming soon" : undefined} aria-disabled={disabled || undefined}
                  style={{ ...row, opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
                  onClick={() => { if (!disabled) setSettingsSub(key); }}
                  onKeyDown={(e) => { if (!disabled && e.key === "Enter") setSettingsSub(key); }}>
                  <div style={{ minWidth: 0, flex: 1, paddingRight: 8 }}><p style={{ ...label, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lbl}</p><p style={sub}>{hint}</p></div>
                  {!disabled && chev}
                </div>
              ))}
              </div>
            </>
          );
        }

        if (settingsSub === "theme") {
          const BUBBLE_COLORS = ["#2563eb","#7c3aed","#059669","#dc2626","#d97706","#0891b2","#db2777","#374151"];
          const BUBBLE_NAMES = ["Blue","Purple","Green","Red","Amber","Cyan","Pink","Slate"];
          return (
            <>
              {backdrop}
              <div style={panelWrap}>
              {backBtn}
              {/* Background */}
              <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", padding: "0 18px 8px" }}>Background</p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: "0 18px 16px", borderBottom: "1px solid var(--color-border-subtle)" }}>
                {WALLPAPERS.map((c, i) => (
                  <button key={i} type="button" title={WALL_NAMES[i]} onClick={() => setWallpaperForChannel(activeChatId, c)}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer" }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: c || "var(--color-surface)", border: wall === c ? "2.5px solid #60a5fa" : "1.5px solid var(--color-border)", boxShadow: wall === c ? "0 0 0 3px rgba(96,165,250,0.22)" : "none", transition: "box-shadow 0.15s" }} />
                    <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10 }}>{WALL_NAMES[i]}</span>
                  </button>
                ))}
              </div>
              {/* Bubble colour */}
              <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", padding: "12px 18px 8px" }}>My bubble colour</p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: "0 18px 16px" }}>
                {BUBBLE_COLORS.map((c, i) => (
                  <button key={i} type="button" title={BUBBLE_NAMES[i]} onClick={() => saveBubbleColor(c)}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer" }}>
                    {/* Selected ring uses the text-primary token (not a fixed #fff) so it still
                        shows up once the drawer bg above tokenizes to a light surface (rule 4). */}
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: c, border: bubbleColor === c ? "2.5px solid var(--color-text-primary)" : "1.5px solid var(--color-border)", boxShadow: bubbleColor === c ? `0 0 0 3px ${c}66` : "none", transition: "box-shadow 0.15s" }} />
                    <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10 }}>{BUBBLE_NAMES[i]}</span>
                  </button>
                ))}
              </div>
              </div>
            </>
          );
        }

        if (settingsSub === "fontsize") return (
          <>
            {backdrop}
            <div style={panelWrap}>
            {backBtn}
            <div style={{ padding: "4px 18px 18px" }}>
              <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 14 }}>Font size: <strong style={{ color: "#60a5fa" }}>{fontSize}px</strong></p>
              <input type="range" min={12} max={18} step={1} value={fontSize} onChange={(e) => saveFontSize(Number(e.target.value))} style={{ accentColor: "#2563eb", width: "100%", maxWidth: 260 }} />
              <div style={{ display: "flex", justifyContent: "space-between", maxWidth: 260, marginTop: 4 }}>
                <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10 }}>Small</span>
                <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10 }}>Large</span>
              </div>
              <p className="text-text-primary bg-surface" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: fontSize, marginTop: 14, borderRadius: 8, padding: "8px 12px" }}>Preview text at {fontSize}px</p>
            </div>
            </div>
          </>
        );

        if (settingsSub === "nickname" && partnerId) return (
          <>
            {backdrop}
            <div style={panelWrap}>
            {backBtn}
            <div style={{ padding: "4px 18px 18px" }}>
              <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 12 }}>Set a nickname only you can see.</p>
              <input value={nick} onChange={(e) => saveNickname(partnerId, e.target.value)} placeholder={convTitle(activeConv)}
                autoFocus
                className="bg-surface-raised border border-border text-text-primary" style={{ borderRadius: 10, padding: "10px 14px", fontSize: 13, outline: "none", width: "100%", maxWidth: 280, boxSizing: "border-box" }} />
            </div>
            </div>
          </>
        );

        return null;
      })()}
      {showSearch && (
        <div
          style={{
            padding: "10px 16px",
            borderBottom: activeWallpaper ? "1px solid rgba(255,255,255,0.06)" : "1px solid var(--color-border-subtle)",
            display: "flex",
            gap: 8,
          }}
        >
          <input
            value={searchQuery}
            onChange={(e) => {
              const next = e.target.value;
              setSearchQuery(next);
              if (!next.trim()) {
                setSearchResults([]);
                setSearchApplied(false);
              }
            }}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder={searchPlaceholder}
            style={{
              flex: 1,
              background: activeWallpaper ? "rgba(255,255,255,0.06)" : "var(--color-surface-raised)",
              border: activeWallpaper ? "1px solid rgba(255,255,255,0.12)" : "1px solid var(--color-border)",
              borderRadius: 8,
              padding: "8px 12px",
              color: activeWallpaper ? "#fff" : "var(--color-text-primary)",
              fontSize: 13,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={runSearch}
            disabled={searching}
            style={{
              padding: "8px 12px",
              background: "#2563eb",
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {searching ? "..." : t("messages.searchGo")}
          </button>
          {searchQuery && (
            <button
              type="button"
              onClick={clearChatSearch}
              title={t("messages.clearSearch")}
              style={{
                padding: "8px 12px",
                background: activeWallpaper ? "rgba(255,255,255,0.06)" : "var(--color-surface-raised)",
                border: activeWallpaper ? "1px solid rgba(255,255,255,0.1)" : "1px solid var(--color-border)",
                borderRadius: 8,
                color: activeWallpaper ? "#fff" : "var(--color-text-primary)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={CHAT_MEDIA_ACCEPT}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) { setPendingFile(file); setPendingFileViewOnce(false); }
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept={CHAT_MEDIA_ACCEPT}
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) { setPendingFile(file); setPendingFileViewOnce(false); }
          e.target.value = "";
        }}
      />
      <input
        ref={docInputRef}
        type="file"
        accept={CHAT_DOC_ACCEPT}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) { setPendingFile(file); setPendingFileViewOnce(false); }
          e.target.value = "";
        }}
      />
      {showJournal && activeChatId ? (
        <div className="bg-surface" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Journal tab bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 0, borderBottom: "1px solid var(--color-border-subtle)", flexShrink: 0, padding: "0 16px" }}>
            <div style={{ display: "flex", gap: 4, flex: 1, overflowX: "auto", padding: "10px 0" }}>
              {[
                { id: "highlights", label: "Highlights" },
                { id: "bucket", label: "Bucket List" },
                { id: "capsules", label: "Time Capsules" },
                { id: "memories", label: "Monthly" },
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setJournalTab(t.id)}
                  style={{ padding: "5px 12px", borderRadius: 20, border: journalTab === t.id ? "1px solid rgba(167,139,250,0.5)" : "1px solid var(--color-border)", background: journalTab === t.id ? "rgba(167,139,250,0.14)" : "transparent", color: journalTab === t.id ? "#a78bfa" : "var(--color-text-secondary)", fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", whiteSpace: "nowrap", fontWeight: journalTab === t.id ? 600 : 400 }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setShowJournal(false)} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, paddingLeft: 8 }}>×</button>
          </div>
          {/* Journal content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 24px" }}>
            {journalLoading ? (
              <p className="text-text-muted" style={{ textAlign: "center", fontSize: 13, marginTop: 40 }}>Loading…</p>
            ) : journalTab === "highlights" ? (
              <div>
                <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 14 }}>
                  Highlights are saved from messages using the "Add to Journal" action.
                </p>
                {journalHighlights.length === 0 ? (
                  <p className="text-text-muted" style={{ textAlign: "center", fontSize: 13, marginTop: 30 }}>No highlights yet — star a message to save it here.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {journalHighlights.map(h => (
                      <div key={h.id} className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                        {h.media_url && ['image'].includes(h.content_type) && (
                          <SafeImage
                            src={h.media_url}
                            alt=""
                            style={{ maxWidth: 220, borderRadius: 8, objectFit: "cover" }}
                            fallback={<div className="border border-border-subtle" style={{ width: 220, height: 140, borderRadius: 8, background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))" }} />}
                          />
                        )}
                        <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: 0 }}>{h.content ?? "[media]"}</p>
                        <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0 }}>
                          Saved by {h.user?.name ?? "you"} · {h.created_at ? new Date(h.created_at).toLocaleDateString() : ""}
                        </p>
                        {h.note && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#a78bfa", fontStyle: "italic", margin: 0 }}>"{h.note}"</p>}
                        <button type="button" onClick={() => handleDeleteHighlight(h.id)} style={{ alignSelf: "flex-end", background: "none", border: "none", color: "rgba(239,68,68,0.6)", fontSize: 11, cursor: "pointer", padding: 0 }}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : journalTab === "bucket" ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, margin: 0 }}>Shared Bucket List</p>
                  <button type="button" onClick={() => setShowAddBucket(v => !v)} style={{ background: "rgba(167,139,250,0.14)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 8, padding: "5px 12px", color: "#a78bfa", fontSize: 12, cursor: "pointer" }}>+ Add</button>
                </div>
                {showAddBucket && (
                  <div className="bg-surface-raised" style={{ borderRadius: 12, padding: 14, marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={newBucketEmoji} onChange={e => setNewBucketEmoji(e.target.value)} placeholder="🏔️" maxLength={2} className="bg-surface-raised border border-border text-text-primary" style={{ width: 40, borderRadius: 8, padding: "6px 8px", fontSize: 18, textAlign: "center" }} />
                      <input value={newBucketTitle} onChange={e => setNewBucketTitle(e.target.value)} placeholder="Go skydiving together…" className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, borderRadius: 8, padding: "6px 10px", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }} />
                    </div>
                    <select value={newBucketCategory} onChange={e => setNewBucketCategory(e.target.value)} className="bg-surface-raised border border-border text-text-primary" style={{ borderRadius: 8, padding: "6px 10px", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
                      {["adventure","travel","food","wellness","creative","social","career","other"].map(c => <option key={c} value={c} className="bg-surface-raised">{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
                    </select>
                    <button type="button" onClick={handleAddBucketItem} style={{ alignSelf: "flex-end", background: "#a78bfa", border: "none", borderRadius: 8, padding: "6px 16px", color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>Save</button>
                  </div>
                )}
                {journalBucket.length === 0 ? (
                  <p className="text-text-muted" style={{ textAlign: "center", fontSize: 13, marginTop: 30 }}>No items yet — add your first shared goal.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {journalBucket.map(b => (
                      <div key={b.id} style={{ background: b.is_completed ? "rgba(34,197,94,0.06)" : "var(--color-surface-raised)", borderRadius: 12, padding: "12px 14px", border: b.is_completed ? "1px solid rgba(34,197,94,0.2)" : "1px solid var(--color-border-subtle)", display: "flex", alignItems: "center", gap: 12 }}>
                        <button type="button" onClick={() => handleToggleBucketComplete(b)} style={{ width: 22, height: 22, borderRadius: "50%", border: b.is_completed ? "2px solid #22c55e" : "2px solid var(--color-border)", background: b.is_completed ? "#22c55e" : "transparent", color: "#fff", fontSize: 12, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{b.is_completed ? "✓" : ""}</button>
                        <span style={{ fontSize: 20 }}>{b.emoji || "✨"}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className={b.is_completed ? "text-text-muted" : "text-text-primary"} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, textDecoration: b.is_completed ? "line-through" : "none", margin: 0 }}>{b.title}</p>
                          <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0 }}>{b.category}</p>
                        </div>
                        <button type="button" onClick={() => handleDeleteBucketItem(b.id)} style={{ background: "none", border: "none", color: "rgba(239,68,68,0.5)", fontSize: 14, cursor: "pointer" }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : journalTab === "capsules" ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, margin: 0 }}>Time Capsules</p>
                  <button type="button" onClick={() => setShowAddCapsule(v => !v)} style={{ background: "rgba(167,139,250,0.14)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 8, padding: "5px 12px", color: "#a78bfa", fontSize: 12, cursor: "pointer" }}>+ Create</button>
                </div>
                {showAddCapsule && (
                  <div className="bg-surface-raised" style={{ borderRadius: 12, padding: 14, marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                    <input value={newCapsuleTitle} onChange={e => setNewCapsuleTitle(e.target.value)} placeholder="Capsule title…" className="bg-surface-raised border border-border text-text-primary" style={{ borderRadius: 8, padding: "6px 10px", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }} />
                    <textarea value={newCapsuleNote} onChange={e => setNewCapsuleNote(e.target.value)} placeholder="A message for your future selves…" rows={3} className="bg-surface-raised border border-border text-text-primary" style={{ borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "'DM Sans', sans-serif", resize: "vertical" }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <label className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>Unlock date</label>
                      <input type="date" value={newCapsuleDate} onChange={e => setNewCapsuleDate(e.target.value)} min={new Date().toISOString().slice(0,10)} className="bg-surface-raised border border-border text-text-primary" style={{ borderRadius: 8, padding: "6px 10px", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }} />
                    </div>
                    <button type="button" onClick={handleAddCapsule} style={{ alignSelf: "flex-end", background: "#a78bfa", border: "none", borderRadius: 8, padding: "6px 16px", color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>Seal Capsule</button>
                  </div>
                )}
                {journalCapsules.length === 0 ? (
                  <p className="text-text-muted" style={{ textAlign: "center", fontSize: 13, marginTop: 30 }}>No capsules yet — seal one and open it on a special date.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {journalCapsules.map(c => {
                      const unlockDate = new Date(c.unlock_date);
                      const daysLeft = Math.ceil((unlockDate - new Date()) / (1000 * 60 * 60 * 24));
                      const isCreator = String(c.created_by) === String(myUserId);
                      const creatorName = c.user?.name || "them";
                      const partnerName = isCreator ? (activeConv?.other_user?.name || "your friend") : (myUser?.name || "you");
                      const myMessageLabel = isCreator ? "Your message" : (c.user?.name || "Their message");
                      const partnerMessageLabel = isCreator ? (activeConv?.other_user?.name || "Their message") : "Your message";
                      const iAmPartner = !isCreator;
                      const partnerHasContributed = !!c.partner_id;
                      const isContributing = contributingCapsuleId === c.id;
                      return (
                        <div key={c.id} style={{ background: c.is_unlocked ? "rgba(167,139,250,0.08)" : "var(--color-surface-raised)", borderRadius: 14, padding: "14px 16px", border: c.is_unlocked ? "1px solid rgba(167,139,250,0.3)" : "1px solid var(--color-border-subtle)" }}>
                          {/* Header */}
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c.is_unlocked ? "#a78bfa" : "var(--color-text-muted)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>{c.is_unlocked ? <><path d="M5 11V7a7 7 0 0 1 14 0v4"/><rect x="2" y="11" width="20" height="11" rx="2" ry="2"/></> : <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>}</svg>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, margin: 0 }}>{c.title}</p>
                              <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "2px 0 0" }}>
                                {c.is_unlocked ? `Opened ${unlockDate.toLocaleDateString()}` : daysLeft > 0 ? `Opens in ${daysLeft} day${daysLeft !== 1 ? "s" : ""} · ${unlockDate.toLocaleDateString()}` : "Ready to open!"}
                              </p>
                            </div>
                            {isCreator && <button type="button" onClick={() => handleDeleteCapsule(c.id)} style={{ background: "none", border: "none", color: "rgba(239,68,68,0.4)", fontSize: 14, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>}
                          </div>
                          {/* Message slots */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {/* Creator slot */}
                            <div className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 8, padding: "8px 10px" }}>
                              <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{myMessageLabel}</p>
                              {c.is_unlocked && c.contents?.note ? (
                                <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0, fontStyle: "italic" }}>"{c.contents.note}"</p>
                              ) : (
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                                  <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>Sealed</span>
                                </div>
                              )}
                            </div>
                            {/* Partner slot */}
                            <div className="bg-surface-raised" style={{ borderRadius: 8, padding: "8px 10px", border: `1px solid ${partnerHasContributed ? "rgba(167,139,250,0.2)" : "var(--color-border-subtle)"}` }}>
                              <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{partnerMessageLabel}</p>
                              {c.is_unlocked && c.partner_contents?.note ? (
                                <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0, fontStyle: "italic" }}>"{c.partner_contents.note}"</p>
                              ) : partnerHasContributed ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                                  <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>Sealed</span>
                                </div>
                              ) : iAmPartner ? (
                                isContributing ? (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    <textarea value={contributeNote} onChange={e => setContributeNote(e.target.value)} placeholder="Write your message for the future…" rows={2} className="bg-surface-raised text-text-primary" style={{ border: "1px solid rgba(167,139,250,0.3)", borderRadius: 6, padding: "6px 8px", fontSize: 12, fontFamily: "'DM Sans', sans-serif", resize: "none", width: "100%", boxSizing: "border-box" }} />
                                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                      <button type="button" onClick={() => { setContributingCapsuleId(null); setContributeNote(""); }} className="border border-border text-text-secondary" style={{ background: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
                                      <button type="button" onClick={() => handleContributeCapsule(c.id)} style={{ background: "#a78bfa", border: "none", borderRadius: 6, padding: "4px 10px", color: "#fff", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>Seal my message</button>
                                    </div>
                                  </div>
                                ) : (
                                  <button type="button" onClick={() => { setContributingCapsuleId(c.id); setContributeNote(""); }} style={{ background: "none", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 6, padding: "4px 10px", color: "#a78bfa", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>+ Add your message</button>
                                )
                              ) : (
                                <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontStyle: "italic" }}>Waiting for their message…</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : journalTab === "memories" ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <button type="button" onClick={() => setJournalMemoryYM(({ year, month }) => month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 })} className="bg-surface-raised border border-border text-text-primary" style={{ borderRadius: 8, padding: "5px 10px", fontSize: 14, cursor: "pointer" }}>‹</button>
                  <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, flex: 1, textAlign: "center", margin: 0 }}>
                    {new Date(journalMemoryYM.year, journalMemoryYM.month - 1).toLocaleString("default", { month: "long", year: "numeric" })}
                  </p>
                  <button type="button" onClick={() => setJournalMemoryYM(({ year, month }) => month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 })} className="bg-surface-raised border border-border text-text-primary" style={{ borderRadius: 8, padding: "5px 10px", fontSize: 14, cursor: "pointer" }}>›</button>
                </div>
                {!journalMemory ? (
                  <p className="text-text-muted" style={{ textAlign: "center", fontSize: 13, marginTop: 30 }}>No messages this month.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                      {[
                        { label: "Messages", value: journalMemory.total, icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
                        { label: "Photos", value: journalMemory.photos, icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> },
                        { label: "Videos", value: journalMemory.videos, icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg> },
                        { label: "Audio", value: journalMemory.audio, icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> },
                        { label: "Reactions", value: journalMemory.reactions, icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> },
                        { label: "Locations", value: journalMemory.locations, icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> },
                      ].map(stat => (
                        <div key={stat.label} className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
                          <div style={{ display: "flex", justifyContent: "center", margin: "0 0 4px" }}>{stat.icon}</div>
                          <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: "#a78bfa", margin: 0 }}>{stat.value}</p>
                          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0 }}>{stat.label}</p>
                        </div>
                      ))}
                    </div>
                    {journalMemory.most_active_day && (
                      <div style={{ background: "rgba(167,139,250,0.08)", borderRadius: 12, padding: "12px 14px", border: "1px solid rgba(167,139,250,0.15)", textAlign: "center" }}>
                        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 2px" }}>Most active day</p>
                        <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: "#a78bfa", margin: 0 }}>
                          {new Date(journalMemory.most_active_day).toLocaleDateString("default", { weekday: "long", month: "short", day: "numeric" })}
                        </p>
                      </div>
                    )}
                    {journalMemory.media?.length > 0 && (
                      <div>
                        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 10 }}>Photos & Videos</p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                          {journalMemory.media.map((m, i) => (
                            <div key={i} className="bg-surface-raised border border-border-subtle" style={{ aspectRatio: "1", borderRadius: 8, overflow: "hidden" }}>
                              {m.content_type === "image" ? (
                                // #457: a purged media blob 404s — show the empty tile, not a broken icon.
                                <SafeImage
                                  src={m.content}
                                  alt=""
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  fallback={<div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))" }} />}
                                />
                              ) : (
                                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
      <div
        ref={messagesScrollRef}
        className="scroll-area"
        onScroll={handleScroll}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          padding: isMobile ? "12px 16px 20px" : "16px 18px 24px",
          display: "flex",
          flexDirection: "column",
          ...(activeWallpaper ? {} : DEFAULT_CHAT_BG_STYLE),
        }}
      >
        {!loadingMessages && messages.length > 0 && (loadingMore || hasMore) && (
          <div
            ref={topLoadRef}
            style={{
              flexShrink: 0,
              padding: "10px 0 6px",
              textAlign: "center",
            }}
          >
            {/* This branch renders directly on chatBody's background (fixed-dark preset
                wallpaper or the theme-following panel bg), same rule-4 conditional used
                throughout chatHeader/membersPanel/search above. */}
            {loadingMore ? (
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  color: activeWallpaper ? "rgba(255,255,255,0.55)" : "var(--color-text-secondary)",
                }}
              >
                {t("messages.loadingMessages")}
              </span>
            ) : (
              <button
                type="button"
                onClick={loadOlderMessages}
                style={{
                  padding: "8px 16px",
                  borderRadius: 20,
                  border: activeWallpaper ? "1px solid rgba(255,255,255,0.15)" : "1px solid var(--color-border)",
                  background: activeWallpaper ? "rgba(255,255,255,0.06)" : "var(--color-surface-raised)",
                  color: activeWallpaper ? "rgba(255,255,255,0.65)" : "var(--color-text-secondary)",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t("messages.loadOlder")}
              </button>
            )}
          </div>
        )}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            flexShrink: 0,
          }}
        >
        {loadingMessages ? (
          <p
            style={{
              textAlign: "center",
              fontSize: 13,
              color: activeWallpaper ? "rgba(255,255,255,0.35)" : "var(--color-text-muted)",
              marginTop: 40,
            }}
          >
            {t("messages.loadingMessages")}
          </p>
        ) : showStarred && messages.filter((m) => starredIds.has(m.id)).length === 0 ? (
          <p style={{ textAlign: "center", fontSize: 13, color: activeWallpaper ? "rgba(255,255,255,0.35)" : "var(--color-text-muted)", marginTop: 40 }}>No starred messages yet</p>
        ) : showSearch && searchApplied && !searching && searchResults.length === 0 ? (
          <p
            style={{
              textAlign: "center",
              fontSize: 13,
              color: activeWallpaper ? "rgba(255,255,255,0.35)" : "var(--color-text-muted)",
              marginTop: 40,
            }}
          >
            {t("messages.noSearchResults")}
          </p>
        ) : messages.length === 0 ? (
          <p
            style={{
              textAlign: "center",
              fontSize: 13,
              color: activeWallpaper ? "rgba(255,255,255,0.35)" : "var(--color-text-muted)",
              marginTop: 40,
            }}
          >
            {t("messages.sayHello")}
          </p>
        ) : (
          renderMessagesWithDateSeparators(
            (showStarred
              ? messages.filter((m) => starredIds.has(m.id))
              : showSearch && searchApplied && searchResults.length > 0
                ? searchResults
                : messages
            ).filter((m) => !hiddenMsgIds.has(normalizeMessageId(m.id))),
            (m, groupPosition) => (
              <MessageBubble
                key={m.id}
                m={m}
                myProfile={myProfile}
                partnerProfile={partnerProfile}
                senderLookup={senderLookup}
                showSenderName={isGroupChat}
                showAvatars={isGroupChat}
                groupPosition={groupPosition}
                channelContextType={activeConv?.context_type}
                channelContextId={activeConv?.context_id}
                isEditing={isSameMessageId(editingId, m.id)}
                editDraft={editText}
                onEditDraftChange={setEditText}
                onSaveEdit={saveEditMessage}
                onCancelEdit={cancelEditMessage}
                onEdit={startEditMessage}
                onDeleteForEveryone={removeMessage}
                onDeleteForMe={handleDeleteForMe}
                onImageClick={setLightboxUrl}
                onMediaLoad={scrollToBottomIfStuck}
                onReply={(msg) => setReplyTo(buildReplyTarget(msg))}
                onReact={handleReact}
                onDoubleTapReact={handleDoubleTapReact}
                onPin={handlePin}
                onStar={toggleStar}
                onAddToJournal={handleAddHighlightFromMessage}
                onForward={(msg) => { setForwardMsg(msg); setShowForwardModal(true); }}
                onVotePoll={handleVotePoll}
                onViewOnceSeen={markViewOnceSeen}
                viewOnceSeen={viewOnceSeen}
                viewOnceViewing={viewOnceViewing}
                isStarred={starredIds.has(m.id)}
                myUserId={myUserId}
                fontSize={fontSize}
                bubbleColor={bubbleColor}
              />
            ),
          )
        )}
        <div ref={bottomAnchorRef} aria-hidden style={{ height: 1, flexShrink: 0 }} />
        </div>
      </div>
      )}
      <div style={{ position: "relative", flexShrink: 0 }}>
        {uploadError ? (
          <p
            style={{
              margin: 0,
              padding: "8px 16px 0",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              color: "#f87171",
            }}
          >
            {uploadError}
          </p>
        ) : null}
        {pendingFile && (
          <div style={{ padding: "6px 16px 0" }}>
            {pendingFilePreviewUrl ? (
              <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#000", border: activeWallpaper ? "1px solid rgba(255,255,255,0.12)" : "1px solid var(--color-border)" }}>
                <button type="button" onClick={() => { setPendingFile(null); setPendingFileViewOnce(false); }} aria-label="Cancel attachment" style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "none", color: "#fff", fontSize: 18, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>×</button>
                <button type="button" onClick={() => setPendingFileViewOnce((v) => !v)} style={{ position: "absolute", top: 8, left: 8, background: pendingFileViewOnce ? "rgba(37,99,235,0.85)" : "rgba(0,0,0,0.55)", border: "none", borderRadius: 8, padding: "4px 10px", color: "#fff", fontSize: 11, fontWeight: pendingFileViewOnce ? 600 : 400, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", zIndex: 2 }}>
                  👁 View once
                </button>
                <img src={pendingFilePreviewUrl} alt={pendingFile.name} style={{ display: "block", width: "100%", maxHeight: 260, objectFit: "contain", background: "#000" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: activeWallpaper ? "rgba(255,255,255,0.08)" : "var(--color-surface-raised)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: activeWallpaper ? "#fff" : "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{pendingFile.name}</p>
                    {pendingFile.size ? (
                      <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "2px 0 0" }}>{formatFileSize(pendingFile.size)}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: activeWallpaper ? "rgba(255,255,255,0.08)" : "var(--color-surface-raised)", border: activeWallpaper ? "1px solid rgba(255,255,255,0.12)" : "1px solid var(--color-border)", borderRadius: 12 }}>
                {isPendingMediaFile(pendingFile) ? (
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={activeWallpaper ? "rgba(255,255,255,0.55)" : "var(--color-text-secondary)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                ) : (
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="1.8" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: activeWallpaper ? "#fff" : "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{pendingFile.name}</p>
                  {pendingFile.size ? (
                    <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "2px 0 0" }}>{formatFileSize(pendingFile.size)}</p>
                  ) : null}
                </div>
                {isPendingMediaFile(pendingFile) ? (
                  <button type="button" onClick={() => setPendingFileViewOnce((v) => !v)} style={{ background: pendingFileViewOnce ? "rgba(37,99,235,0.25)" : activeWallpaper ? "rgba(255,255,255,0.08)" : "var(--color-surface)", border: pendingFileViewOnce ? "1px solid rgba(37,99,235,0.6)" : activeWallpaper ? "1px solid rgba(255,255,255,0.15)" : "1px solid var(--color-border)", borderRadius: 8, padding: "3px 10px", color: pendingFileViewOnce ? "#93c5fd" : activeWallpaper ? "rgba(255,255,255,0.55)" : "var(--color-text-secondary)", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", flexShrink: 0, fontWeight: pendingFileViewOnce ? 600 : 400 }}>
                    👁 View once
                  </button>
                ) : null}
                <button type="button" onClick={() => { setPendingFile(null); setPendingFileViewOnce(false); }} style={{ background: "none", border: "none", color: activeWallpaper ? "rgba(255,255,255,0.55)" : "var(--color-text-secondary)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "2px 4px", flexShrink: 0 }}>×</button>
              </div>
            )}
          </div>
        )}
        {!dismissedSmartReply && !inputMsg && (() => {
          const lastPartnerMsg = [...messages].reverse().find((m) => m.from !== "me" && !m.deleted);
          const chips = lastPartnerMsg ? smartRepliesFor(lastPartnerMsg) : [];
          if (!chips.length) return null;
          return (
            <div style={{ display: "flex", gap: 6, padding: "6px 10px 4px", flexWrap: "wrap", alignItems: "center", background: activeWallpaper ? "rgba(0,0,0,0.25)" : undefined }}>
              {chips.map((c) => (
                <button key={c} type="button" onClick={() => { setInputMsg(c); setDismissedSmartReply(true); }}
                  className="bg-surface-raised border border-border text-text-primary"
                  style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                >{c}</button>
              ))}
              <button type="button" onClick={() => setDismissedSmartReply(true)} style={{ background: "none", border: "none", color: activeWallpaper ? "rgba(255,255,255,0.35)" : "var(--color-text-muted)", fontSize: 14, cursor: "pointer", padding: "2px 4px" }}>×</button>
            </div>
          );
        })()}
        {scheduleError && (
          <p role="alert" style={{ margin: "0 10px 6px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#fca5a5" }}>{scheduleError}</p>
        )}
        {scheduledQueue.filter((s) => String(s.channelId) === String(activeChatId) && Number(s.scheduledFor) > scheduleClockMs).length > 0 && (
          <div style={{ margin: "0 10px 8px", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.08)" }}>
            <p style={{ margin: "0 0 6px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, color: "#fbbf24" }}>
              {i18n.t("messages.pendingScheduled", { defaultValue: "Scheduled" })}
            </p>
            {scheduledQueue
              .filter((s) => String(s.channelId) === String(activeChatId) && Number(s.scheduledFor) > scheduleClockMs)
              .map((s) => (
                <div key={s.scheduledMessageId || s.clientMsgId} style={{ marginBottom: 8 }}>
                  {editingScheduledId === s.scheduledMessageId ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <textarea
                        value={editScheduledText}
                        onChange={(e) => setEditScheduledText(e.target.value)}
                        rows={2}
                        className="bg-surface-raised border border-border text-text-primary"
                        style={{ borderRadius: 8, padding: "6px 8px", fontSize: 12, fontFamily: "'DM Sans', sans-serif", resize: "vertical", outline: "none" }}
                      />
                      <input
                        type="datetime-local"
                        value={editScheduledFor ? toDatetimeLocalValue(new Date(editScheduledFor)) : toDatetimeLocalValue(new Date(s.scheduledFor))}
                        min={toDatetimeLocalValue(new Date(scheduleClockMs + 60_000))}
                        onChange={(e) => {
                          const ms = fromDatetimeLocalValue(e.target.value);
                          if (ms != null) setEditScheduledFor(ms);
                        }}
                        className="bg-surface-raised border border-border text-text-primary"
                        style={{ borderRadius: 8, padding: "6px 8px", fontSize: 12, outline: "none", colorScheme: "dark" }}
                      />
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button type="button" disabled={savingScheduleEdit} onClick={() => { setEditingScheduledId(null); setEditScheduledText(""); setEditScheduledFor(null); }} style={{ background: "none", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>
                          {i18n.t("messages.cancelSchedule", { defaultValue: "Cancel" })}
                        </button>
                        <button type="button" disabled={savingScheduleEdit} onClick={saveScheduledEdit} style={{ background: "#00a884", border: "none", borderRadius: 8, padding: "4px 10px", color: "#fff", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
                          {i18n.t("messages.saveScheduleEdit", { defaultValue: "Save" })}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <p style={{ flex: 1, margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {new Date(s.scheduledFor).toLocaleString()} · {s.content}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingScheduledId(s.scheduledMessageId);
                          setEditScheduledText(s.content || "");
                          setEditScheduledFor(s.scheduledFor);
                          setScheduleError("");
                        }}
                        style={{ background: "none", border: "none", color: "#93c5fd", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}
                      >
                        {i18n.t("messages.editSchedule", { defaultValue: "Edit" })}
                      </button>
                      <button type="button" onClick={() => cancelScheduledMsg(s.scheduledMessageId)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>
                        {i18n.t("messages.cancelSchedule", { defaultValue: "Cancel" })}
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}
        <ChatInput
          value={inputMsg}
          onChange={setInputMsg}
          onSend={sendMsg}
          sending={sending}
          onTyping={handleTyping}
          uploading={uploading}
          hasAttachment={!!pendingFile}
          isRecording={voiceNote.isRecording}
          recordingSeconds={voiceNote.seconds}
          recordingLevels={voiceNote.levels}
          recordingSlideOffset={vmSlideOffset}
          onAttach={() => {
            if (uploading || voiceNote.isRecording) return;
            setUploadError("");
            fileInputRef.current?.click();
          }}
          onAttachCamera={() => {
            if (uploading || voiceNote.isRecording) return;
            setUploadError("");
            cameraInputRef.current?.click();
          }}
          onAttachDocument={() => {
            if (uploading || voiceNote.isRecording) return;
            setUploadError("");
            docInputRef.current?.click();
          }}
          onMicPointerDown={onMicPointerDown}
          onMicPointerUp={onMicPointerUp}
          onMicPointerMove={onMicPointerMove}
          onMicCancel={onMicCancel}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          scheduledFor={scheduledFor}
          onScheduledForChange={(v) => { setScheduleError(""); setScheduledFor(v); }}
          onOpenPoll={() => setShowPollModal(true)}
          onOpenEvent={() => setShowEventModal(true)}
          onViewOnceAttach={() => { setViewOnceMode(true); fileInputRef.current?.click(); }}
          onSendLocation={sendLocation}
          wallpaper={activeWallpaper}
        />
      </div>
    </div>
  );

  const visibleConversations = [...conversations]
    .filter((c) => !blockedIds.has(c.other_user?.user_id) && !hiddenChats[c.channel_id])
    .filter((c) => convFilterTab !== "unread" || c.unread_count > 0)
    .filter((c) => convFilterTab !== "favorites" || favConvIds.has(c.channel_id))
    .filter((c) => convFilterTab !== "groups" || c.type !== "dm")
    .filter((c) => {
      const q = convSearchQuery.trim().toLowerCase();
      if (!q) return true;
      const name = ((c.other_user?.user_id && nicknames[c.other_user.user_id]) || convTitle(c) || "").toLowerCase();
      const preview = (conversationPreviewText(c.last_message) || "").toLowerCase();
      return name.includes(q) || preview.includes(q);
    })
    .sort((a, b) => {
      const aFav = favConvIds.has(a.channel_id) ? 0 : 1;
      const bFav = favConvIds.has(b.channel_id) ? 0 : 1;
      return aFav - bFav;
    });

  const globalMenuPanel = showGlobalMenu && (() => {
    const rowStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 16px", cursor: "pointer", background: "none" };
    const onRowEnter = (e) => { e.currentTarget.style.background = "var(--color-wash-2)"; };
    const onRowLeave = (e) => { e.currentTarget.style.background = "none"; };
    const menuRow = (key, label, icon) => (
      <div
        key={key}
        role="button"
        tabIndex={0}
        onClick={() => { if (globalMenuTab === key && key === "group") { setGroupStep("pick"); setGroupPickerMembers(new Set()); } setGlobalMenuTab(globalMenuTab === key ? null : key); }}
        onKeyDown={(e) => { if (e.key === "Enter") { if (globalMenuTab === key && key === "group") { setGroupStep("pick"); setGroupPickerMembers(new Set()); } setGlobalMenuTab(globalMenuTab === key ? null : key); } }}
        onMouseEnter={onRowEnter}
        onMouseLeave={onRowLeave}
        style={{ ...rowStyle, background: globalMenuTab === key ? "var(--color-wash-2)" : "none" }}
      >
        <span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 12 }}>{icon}{label}</span>
      </div>
    );
    return (
      <div data-menu-anchor className="bg-surface-raised border border-border" style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        right: 0,
        width: 240,
        borderRadius: 16,
        boxShadow: "0 20px 50px var(--color-shadow)",
        overflow: "hidden",
        zIndex: 500,
        padding: "6px 0",
      }}>
        {menuRow("group", "Create group", <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>)}
        {globalMenuTab === "group" && (
          <div style={{ padding: "6px 16px 14px" }}>
            {groupStep === "pick" ? (
              <>
                <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 8 }}>Select members to add:</p>
                <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, marginBottom: 10 }}>
                  {conversations.filter((c) => c.other_user?.user_id && !blockedIds.has(c.other_user.user_id)).map((c) => {
                    const uid = c.other_user.user_id;
                    const checked = groupPickerMembers.has(uid);
                    return (
                      <button key={uid} type="button" onClick={() => {
                        setGroupPickerMembers((prev) => {
                          const next = new Set(prev);
                          if (next.has(uid)) next.delete(uid); else next.add(uid);
                          return next;
                        });
                      }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 8px", background: checked ? "rgba(37,99,235,0.15)" : "none", border: checked ? "1px solid rgba(37,99,235,0.4)" : "1px solid transparent", borderRadius: 8, cursor: "pointer", textAlign: "left" }}>
                        <div style={{ width: 14, height: 14, borderRadius: 4, border: `2px solid ${checked ? "#2563eb" : "var(--color-border)"}`, background: checked ? "#2563eb" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {checked && <svg width={9} height={9} viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(c.other_user?.name ?? c.other_user?.username) || "Contact"}</span>
                      </button>
                    );
                  })}
                </div>
                <button type="button" onClick={() => setGroupStep("name")} style={{ width: "100%", padding: "8px 0", background: "#2563eb", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  Next →
                </button>
              </>
            ) : (
              <>
                {groupPickerMembers.size > 0 && (
                  <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 6 }}>{groupPickerMembers.size} member{groupPickerMembers.size > 1 ? "s" : ""} selected</p>
                )}
                <input
                  autoFocus
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Group name…"
                  onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
                  className="bg-surface border border-border text-text-primary" style={{ borderRadius: 8, padding: "8px 12px", fontSize: 12, outline: "none", width: "100%", boxSizing: "border-box", marginBottom: 8 }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => setGroupStep("pick")} className="bg-surface text-text-secondary" style={{ flex: 1, padding: "8px 0", border: "none", borderRadius: 8, fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>← Back</button>
                  <button type="button" onClick={handleCreateGroup} disabled={!newGroupName.trim() || creatingGroup} style={{ flex: 2, padding: "8px 0", background: newGroupName.trim() ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 600, cursor: newGroupName.trim() ? "pointer" : "default", fontFamily: "'DM Sans', sans-serif" }}>
                    {creatingGroup ? "Creating…" : "Create group"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {menuRow("mood", "Note to self", <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>)}
        {globalMenuTab === "mood" && (
          <div style={{ padding: "6px 16px 14px" }}>
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "0 0 8px", lineHeight: 1.4 }}>
              This device only. Other people cannot see this. Separate from private notes on contacts.
            </p>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {["😊","😍","🎮","📚","💼","🏃","🎵","🍕"].map((em) => (
                <button key={em} type="button" onClick={() => saveMood(em + " ")} style={{ fontSize: 17, background: "none", border: "none", cursor: "pointer", padding: "2px 3px", borderRadius: 6 }}>{em}</button>
              ))}
            </div>
            <input value={mood} onChange={(e) => saveMood(e.target.value.slice(0, 30))} placeholder="Note to self…" className="bg-surface border border-border text-text-primary" style={{ borderRadius: 8, padding: "8px 12px", fontSize: 12, outline: "none", width: "100%", boxSizing: "border-box" }} />
          </div>
        )}
        {menuRow("note", activeConv?.other_user?.user_id ? `Note for ${(activeConv.other_user?.name ?? "contact")}` : "Private note", <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>)}
        {globalMenuTab === "note" && (
          <div style={{ padding: "6px 16px 14px" }}>
            {activeConv?.other_user?.user_id ? (
              <textarea
                value={privateNotes[activeConv.other_user.user_id] ?? ""}
                onChange={(e) => savePrivateNote(activeConv.other_user.user_id, e.target.value)}
                placeholder="Your private note…"
                rows={3}
                className="bg-surface border border-border text-text-primary" style={{ borderRadius: 8, padding: "8px 12px", fontSize: 12, outline: "none", width: "100%", resize: "none", boxSizing: "border-box" }}
              />
            ) : (
              <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontStyle: "italic" }}>Open a direct chat to add a private note.</p>
            )}
          </div>
        )}
        <div data-menu-anchor role="button" onClick={() => { setShowGlobalMenu(false); setShowHiddenAuthModal(true); }} onMouseEnter={onRowEnter} onMouseLeave={onRowLeave} style={rowStyle}>
          <span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 12 }}><svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Hidden chats</span>
          {Object.keys(hiddenChats).length > 0 && <span className="bg-surface text-text-secondary" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", borderRadius: 10, padding: "2px 7px" }}>{Object.keys(hiddenChats).length}</span>}
        </div>

        <div style={{ borderTop: "1px solid var(--color-border-subtle)", marginTop: 4, paddingTop: 4 }}>
          <div data-menu-anchor role="button" onClick={toggleAppearOffline} onMouseEnter={onRowEnter} onMouseLeave={onRowLeave} style={rowStyle}>
            <span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 12 }}><svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/><line x1="3" y1="3" x2="21" y2="21"/></svg>Hide typing</span>
            <span aria-hidden="true" style={{ width: 34, height: 19, borderRadius: 10, background: appearOffline ? "#2563eb" : "var(--color-border)", position: "relative", flexShrink: 0, transition: "background 0.15s" }}>
              <span style={{ position: "absolute", top: 2, left: appearOffline ? 17 : 2, width: 15, height: 15, borderRadius: "50%", background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />
            </span>
          </div>
          {appearOffline && (
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "0 16px 8px", lineHeight: 1.35 }}>
              Hides typing indicators on this device. You still appear online to others while connected.
            </p>
          )}
          <div data-menu-anchor style={{ position: "relative" }}>
            <div role="button" onClick={() => { if (isGloballySnoozed()) { unsnooze(); } else { setShowSnoozeMenu((v) => !v); } }} onMouseEnter={onRowEnter} onMouseLeave={onRowLeave} style={rowStyle}>
              <span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 12 }}><svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>Snooze notifications</span>
              {isGloballySnoozed() && (
                <span style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", color: "#fbbf24", fontWeight: 600 }}>
                  {snoozedUntil > 9999999999000 ? "Always" : `until ${new Date(snoozedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                </span>
              )}
            </div>
            {showSnoozeMenu && !isGloballySnoozed() && (
              <div data-menu-anchor style={{ padding: "0 0 8px" }}>
                {[["30 minutes", 30*60*1000], ["1 hour", 60*60*1000], ["2 hours", 2*60*60*1000], ["8 hours", 8*60*60*1000], ["Until tomorrow", -1]].map(([label, ms]) => (
                  <button key={label} type="button" onClick={() => snoozeFor(ms)} className="text-text-secondary" style={{ display: "block", width: "100%", padding: "8px 16px", background: "none", border: "none", fontSize: 12, fontFamily: "'DM Sans', sans-serif", textAlign: "left", cursor: "pointer" }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {isMobile && menuRow("lock", chatLocked ? "Device chat lock (change / remove)" : "Set device chat lock", <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>)}
        {isMobile && globalMenuTab === "lock" && (
          <div data-menu-anchor style={{ padding: "6px 16px 14px" }}>
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 8, lineHeight: 1.4 }}>
              {chatLocked
                ? "Change or remove the PIN stored on this device only. Clearing site data removes it. This is not account security."
                : "Optional PIN stored on this device only. It is not synced to your Strug account; clearing browser data bypasses it."}
            </p>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={newPinInput}
              onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="New 4-digit PIN…"
              className="bg-surface border border-border text-text-primary" style={{ width: "100%", borderRadius: 8, padding: "7px 10px", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 8, letterSpacing: 4, textAlign: "center" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => { if (newPinInput.length !== 4) return; try { localStorage.setItem("strug_chat_pin", hashPin(newPinInput)); } catch {} setChatLocked(true); setChatUnlocked(true); setNewPinInput(""); setGlobalMenuTab(null); setShowGlobalMenu(false); }} disabled={newPinInput.length !== 4} style={{ flex: 1, padding: "8px 0", background: newPinInput.length === 4 ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, cursor: newPinInput.length === 4 ? "pointer" : "default" }}>
                Save PIN
              </button>
              {chatLocked && (
                <button type="button" onClick={() => { try { localStorage.removeItem("strug_chat_pin"); } catch {} setChatLocked(false); setChatUnlocked(false); setNewPinInput(""); setGlobalMenuTab(null); }} style={{ flex: 1, padding: "8px 0", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontSize: 12, cursor: "pointer" }}>
                  Remove lock
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  })();

  const convList = (
    <div
      className="bg-surface border border-border" style={{
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        flex: isMobile ? 1 : undefined,
        width: isMobile ? undefined : 340,
        flexShrink: 0,
        position: "relative",
      }}
    >
      <div
        style={{
          padding: "16px 16px 12px",
          borderBottom: "1px solid var(--color-border-subtle)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p
            className="text-text-primary" style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 800,
              fontSize: 22,
            }}
          >
            {title}
          </p>
          <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
            {isGloballySnoozed() && (
              <Tooltip text="Notifications snoozed — click to unsnooze"><button type="button" aria-label="Notifications snoozed — click to unsnooze" onClick={unsnooze} style={{ background: "none", border: "none", padding: "2px 6px", cursor: "pointer", color: "#fbbf24", display: "flex", alignItems: "center" }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              </button></Tooltip>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAdminSupport(true)}
                className="text-text-secondary" style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 10,
                  fontWeight: 700,
                }}
                title={t("messages.openSupportTicket")}
              >
                {t("messages.support")}
              </button>
            )}
            <button
              onClick={() => {
                setShowCompose(true);
                setComposeError("");
                setComposeUserId("");
              }}
              className="text-text-secondary" style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 9,
                borderRadius: 9,
                display: "flex",
                alignItems: "center",
              }}
              title={t("messages.newMessageBtn")}
            >
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
            {/* Global ⋯ — floating popover trigger, anchored to this wrapper */}
            <div data-menu-anchor style={{ position: "relative" }}>
              <Tooltip text="More options"><button
                type="button"
                aria-label="More options"
                onClick={() => { setShowGlobalMenu((v) => !v); setGlobalMenuTab(null); }}
                className="text-text-secondary" style={{ background: showGlobalMenu ? "var(--color-surface-raised)" : "none", border: "none", cursor: "pointer", padding: "7px 9px", borderRadius: 9, display: "flex", alignItems: "center" }}
              >
                <span style={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                  {[0,1,2].map((i) => <span key={i} style={{ width: 3.5, height: 3.5, borderRadius: "50%", background: "currentColor", display: "block" }} />)}
                </span>
              </button></Tooltip>
              {globalMenuPanel}
            </div>
          </div>
        </div>

        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted" style={{ position: "absolute", left: 12, pointerEvents: "none" }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={convSearchQuery}
            onChange={(e) => setConvSearchQuery(e.target.value)}
            placeholder={t("messages.searchConversations", "Search conversations")}
            className="bg-surface-raised border border-border text-text-primary" style={{
              width: "100%",
              borderRadius: 10,
              padding: "9px 12px 9px 34px",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[["all", t("messages.tabAll", "All")], ["unread", t("messages.tabUnread", "Unread")], ["favorites", t("messages.tabFavorites", "Favorites")], ["groups", t("messages.tabGroups", "Groups")]].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setConvFilterTab(key)}
              className={convFilterTab === key ? "" : "border border-border text-text-secondary"} style={{
                background: convFilterTab === key ? "rgba(37,99,235,0.15)" : "var(--color-surface)",
                border: convFilterTab === key ? "1px solid rgba(37,99,235,0.4)" : undefined,
                borderRadius: 999,
                padding: "6px 14px",
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 600,
                fontSize: 12.5,
                color: convFilterTab === key ? "#2563eb" : undefined,
                transition: "background 0.15s, color 0.15s, border-color 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <AdminSupportPanel
        open={showAdminSupport}
        conversations={conversations}
        onClose={() => setShowAdminSupport(false)}
        onOpenChannel={openSupportTicketChannel}
        onInboxReload={reloadInbox}
      />

      {showCompose && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCompose(false);
          }}
        >
          <div
            className="bg-surface-raised border border-border" style={{
              borderRadius: 16,
              padding: 28,
              width: 340,
              boxShadow: "0 20px 60px var(--color-shadow)",
            }}
          >
            <p
              className="text-text-primary" style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 800,
                fontSize: 18,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 16,
              }}
            >
              {t("messages.newMessage")}
            </p>
            <input
              autoFocus
              value={composeUserId}
              onChange={(e) => setComposeUserId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startConversation()}
              placeholder={t("messages.composePlaceholder")}
              className="bg-surface-raised border border-border text-text-primary" style={{
                width: "100%",
                borderRadius: 10,
                padding: "11px 14px",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {composeError && (
              <p
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  color: "#f87171",
                  marginTop: 8,
                }}
              >
                {composeError}
              </p>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button
                onClick={() => setShowCompose(false)}
                className="bg-surface-raised border border-border text-text-secondary" style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 10,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {t("messages.cancel")}
              </button>
              <button
                onClick={startConversation}
                disabled={composeLoading || !composeUserId.trim()}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 10,
                  background:
                    composeLoading || !composeUserId.trim()
                      ? "rgba(37,99,235,0.4)"
                      : "#2563eb",
                  border: "none",
                  color: "#fff",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor:
                    composeLoading || !composeUserId.trim() ? "default" : "pointer",
                }}
              >
                {composeLoading ? t("messages.opening") : t("messages.startChat")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="scroll-area" style={{ flex: 1, overflowY: "auto" }}>
        {inboxError && (
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              color: "#f87171",
              padding: "12px 16px",
            }}
          >
            {inboxError}
          </p>
        )}
        {conversations.length === 0 ? (
          <p
            className="text-text-muted" style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              padding: "20px 16px",
              textAlign: "center",
            }}
          >
            {t("messages.noMessagesYet")}
          </p>
        ) : visibleConversations.length === 0 ? (
          <p
            className="text-text-muted" style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              padding: "20px 16px",
              textAlign: "center",
            }}
          >
            {convSearchQuery.trim()
              ? t("messages.noSearchResults", "No conversations found")
              : convFilterTab === "unread"
              ? t("messages.noUnread", "No unread conversations")
              : convFilterTab === "groups"
              ? t("messages.noGroups", "No group conversations yet")
              : t("messages.noFavorites", "No favorite conversations yet")}
          </p>
        ) : (
          visibleConversations.map((conv) => {
            const bg = convAccentColor(conv.channel_id, COLORS);
            const timeStr = conv.last_message?.sent_at
              ? formatTime(conv.last_message.sent_at)
              : "";
            const hasUnread = (conv.unread_count ?? 0) > 0;
            const previewText = conversationPreviewText(conv.last_message);
            return (
              <div key={conv.channel_id}>
              <div
                role="button"
                tabIndex={0}
                className="conv-row"
                onClick={() => {
                  stickToBottomRef.current = true;
                  canLoadOlderRef.current = false;
                  setActiveChatId(conv.channel_id);
                }}
                onMouseEnter={(e) => { if (activeChatId !== conv.channel_id) e.currentTarget.style.background = "var(--color-wash-2)"; }}
                onMouseLeave={(e) => { if (activeChatId !== conv.channel_id) e.currentTarget.style.background = "none"; }}
                style={{
                  position: "relative",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: isMobile ? 10 : 12,
                  padding: isMobile ? "12px 14px" : "14px 16px",
                  background:
                    activeChatId === conv.channel_id
                      ? "rgba(37,99,235,0.12)"
                      : "none",
                  border: "none",
                  borderLeft: `3px solid ${activeChatId === conv.channel_id ? "#2563eb" : "transparent"}`,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s",
                }}
              >
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div
                    style={{
                      width: isMobile ? 48 : 44,
                      height: isMobile ? 48 : 44,
                      borderRadius: "50%",
                      // #457: the loaded photo covers this disc entirely; on a 404 it is the disc
                      // we want behind the initial.
                      background: bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontWeight: 800,
                      fontSize: 17,
                      color: "#fff",
                      overflow: "hidden",
                    }}
                  >
                    <SafeImage
                      src={conv.other_user?.profile_pic_url}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      fallback={convAvatar(conv)}
                    />
                  </div>
                  {/* #275 online presence dot (1:1 chats only) */}
                  {!conv.is_group && isUserOnline(conv.other_user?.user_id) && (
                    <span style={{ position: "absolute", right: 0, bottom: 0, width: 12, height: 12, borderRadius: "50%", background: "#4ade80", border: "2px solid var(--color-surface)" }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 3,
                      gap: 8,
                    }}
                  >
                    <p
                      className="text-text-primary" style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontWeight: hasUnread ? 800 : 600,
                        fontSize: isMobile ? 15 : 14,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {(conv.other_user?.user_id && nicknames[conv.other_user.user_id]) || convTitle(conv)}
                    </p>
                  </div>
                  {/* #182: show which vertical/order a chat originated from, so a store /
                      driver / food / etc. conversation is distinguishable from a plain DM
                      even when the other party's name is what titles the row. */}
                  <ChatContextOriginBadge
                    contextType={conv.context_type}
                    contextId={conv.context_id}
                    t={i18n.t.bind(i18n)}
                  />
                  <p
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 13,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      color: hasUnread ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                      fontWeight: hasUnread ? 600 : 400,
                      margin: 0,
                    }}
                  >
                    {previewText}
                  </p>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 6,
                    flexShrink: 0,
                    minWidth: 44,
                  }}
                >
                  {timeStr ? (
                    <span
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 11,
                        color: hasUnread ? "#25d366" : "var(--color-text-muted)",
                        fontWeight: hasUnread ? 600 : 400,
                      }}
                    >
                      {timeStr}
                    </span>
                  ) : null}
                  {isMuted(conv.channel_id) ? (
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.45 }} role="img" aria-label="Muted"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                  ) : hasUnread ? (
                    <span style={{ minWidth: 20, height: 20, padding: "0 6px", borderRadius: 10, background: "#25d366", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {conv.unread_count > 99 ? "99+" : conv.unread_count}
                    </span>
                  ) : null}
                </div>
                {!isMobile && conv.other_user?.user_id && (
                  <button
                    type="button"
                    title={convNoteOpen === conv.channel_id ? "Close note" : "Private note"}
                    className="conv-delete"
                    onClick={(e) => { e.stopPropagation(); setConvNoteOpen(convNoteOpen === conv.channel_id ? null : conv.channel_id); }}
                    style={{ flexShrink: 0, background: convNoteOpen === conv.channel_id ? "var(--color-surface-raised)" : "none", border: "none", padding: "4px 6px", cursor: "pointer", color: privateNotes[conv.other_user.user_id] ? "#fbbf24" : "var(--color-text-muted)", display: "flex", alignItems: "center", borderRadius: 6 }}
                  ><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                )}
                {!isMobile && (
                <button
                  type="button"
                  title={favConvIds.has(conv.channel_id) ? "Unfavourite" : "Favourite"}
                  className="conv-delete"
                  onClick={(e) => { e.stopPropagation(); toggleFavConv(conv.channel_id); }}
                  style={{ flexShrink: 0, background: "none", border: "none", padding: "4px 6px", cursor: "pointer", fontSize: 15, color: favConvIds.has(conv.channel_id) ? "#fbbf24" : "var(--color-text-muted)", display: "flex", alignItems: "center" }}
                >★</button>
                )}
                <div data-menu-anchor style={{ position: "relative", flexShrink: 0 }}>
                  <button
                    type="button"
                    className="conv-delete text-text-muted"
                    onClick={(e) => { e.stopPropagation(); setConvMenuId(convMenuId === conv.channel_id ? null : conv.channel_id); }}
                    style={{ background: "none", border: "none", padding: "8px 6px", cursor: "pointer", display: "flex", alignItems: "center", gap: 2 }}
                  >
                    <span style={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                      {[0,1,2].map((i) => <span key={i} style={{ width: 3.5, height: 3.5, borderRadius: "50%", background: "currentColor", display: "block" }} />)}
                    </span>
                  </button>
                  {convMenuId === conv.channel_id && (
                    <div onClick={(e) => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ position: "absolute", right: 0, top: "100%", zIndex: 300, borderRadius: 12, minWidth: 170, boxShadow: "0 16px 40px var(--color-shadow)", overflow: "hidden" }}>
                      {conv.other_user?.user_id && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); setConvMenuId(null); blockContact(conv); }} className="text-text-secondary" style={{ display: "block", width: "100%", padding: "11px 14px", background: "none", border: "none", fontSize: 12, fontFamily: "'DM Sans', sans-serif", textAlign: "left", cursor: "pointer", borderBottom: "1px solid var(--color-border-subtle)" }}>
                          Block contact
                        </button>
                      )}
                      {conv.other_user?.user_id && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); setConvMenuId(null); const r = window.prompt("Reason: Spam / Harassment / Inappropriate / Other"); if (r) reportContact(conv, r); }} className="text-text-secondary" style={{ display: "block", width: "100%", padding: "11px 14px", background: "none", border: "none", fontSize: 12, fontFamily: "'DM Sans', sans-serif", textAlign: "left", cursor: "pointer", borderBottom: "1px solid var(--color-border-subtle)" }}>
                          Report contact
                        </button>
                      )}
                      {isMuted(conv.channel_id) ? (
                        <button type="button" onClick={(e) => { e.stopPropagation(); unmuteConv(conv.channel_id); }} className="text-text-secondary" style={{ display: "block", width: "100%", padding: "11px 14px", background: "none", border: "none", fontSize: 12, fontFamily: "'DM Sans', sans-serif", textAlign: "left", cursor: "pointer", borderBottom: "1px solid var(--color-border-subtle)" }}>
                          Unmute
                        </button>
                      ) : (
                        <div style={{ position: "relative" }}>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setShowMuteMenu(showMuteMenu === conv.channel_id ? null : conv.channel_id); }} className="text-text-secondary" style={{ display: "block", width: "100%", padding: "11px 14px", background: "none", border: "none", fontSize: 12, fontFamily: "'DM Sans', sans-serif", textAlign: "left", cursor: "pointer", borderBottom: "1px solid var(--color-border-subtle)" }}>
                            Mute ›
                          </button>
                          {showMuteMenu === conv.channel_id && (
                            <div className="bg-surface-raised border border-border" style={{ position: "absolute", left: "100%", top: 0, borderRadius: 10, minWidth: 160, boxShadow: "0 12px 32px var(--color-shadow)", overflow: "hidden", zIndex: 400 }}>
                              {[["1 hour", 60*60*1000], ["8 hours", 8*60*60*1000], ["1 week", 7*24*60*60*1000], ["Always", -1]].map(([label, ms]) => (
                                <button key={label} type="button" onClick={(e) => { e.stopPropagation(); muteConv(conv.channel_id, ms); }} className="text-text-secondary" style={{ display: "block", width: "100%", padding: "10px 14px", background: "none", border: "none", borderBottom: "1px solid var(--color-border-subtle)", fontSize: 12, fontFamily: "'DM Sans', sans-serif", textAlign: "left", cursor: "pointer" }}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {isConvSnoozed(conv.channel_id) ? (
                        <button type="button" onClick={(e) => { e.stopPropagation(); unsnoozeConv(conv.channel_id); }} className="text-text-secondary" style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "11px 14px", background: "none", border: "none", fontSize: 12, fontFamily: "'DM Sans', sans-serif", textAlign: "left", cursor: "pointer", borderBottom: "1px solid var(--color-border-subtle)" }}>
                          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>Unsnooze
                        </button>
                      ) : (
                        <div style={{ position: "relative" }}>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setShowSnoozeConvMenu(showSnoozeConvMenu === conv.channel_id ? null : conv.channel_id); }} className="text-text-secondary" style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "11px 14px", background: "none", border: "none", fontSize: 12, fontFamily: "'DM Sans', sans-serif", textAlign: "left", cursor: "pointer", borderBottom: "1px solid var(--color-border-subtle)" }}>
                            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>Snooze ›
                          </button>
                          {showSnoozeConvMenu === conv.channel_id && (
                            <div className="bg-surface-raised border border-border" style={{ position: "absolute", left: "100%", top: 0, borderRadius: 10, minWidth: 160, boxShadow: "0 12px 32px var(--color-shadow)", overflow: "hidden", zIndex: 400 }}>
                              {[["15 minutes", 15*60*1000], ["1 hour", 60*60*1000], ["4 hours", 4*60*60*1000], ["Until tomorrow", 86400000]].map(([label, ms]) => (
                                <button key={label} type="button" onClick={(e) => { e.stopPropagation(); snoozeConv(conv.channel_id, ms); }} className="text-text-secondary" style={{ display: "block", width: "100%", padding: "10px 14px", background: "none", border: "none", borderBottom: "1px solid var(--color-border-subtle)", fontSize: 12, fontFamily: "'DM Sans', sans-serif", textAlign: "left", cursor: "pointer" }}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <button type="button" onClick={(e) => { e.stopPropagation(); setConvMenuId(null); const pw = window.prompt("Set a password to hide this chat (you'll need it to reveal it):"); if (pw && pw.trim()) { saveHiddenChats({ ...hiddenChats, [conv.channel_id]: hashPin(pw.trim()) }); if (activeChatId === conv.channel_id) setActiveChatId(null); } }} className="text-text-secondary" style={{ display: "block", width: "100%", padding: "11px 14px", background: "none", border: "none", fontSize: 12, fontFamily: "'DM Sans', sans-serif", textAlign: "left", cursor: "pointer", borderBottom: "1px solid var(--color-border-subtle)" }}>
                        Hide chat
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setConvMenuId(null); handleDeleteConversation(conv); }} style={{ display: "block", width: "100%", padding: "11px 14px", background: "none", border: "none", color: "#f87171", fontSize: 12, fontFamily: "'DM Sans', sans-serif", textAlign: "left", cursor: "pointer" }}>
                        Delete conversation
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {convNoteOpen === conv.channel_id && conv.other_user?.user_id && (
                <div onClick={(e) => e.stopPropagation()} style={{ padding: "0 16px 10px" }}>
                  <textarea
                    autoFocus
                    value={privateNotes[conv.other_user.user_id] ?? ""}
                    onChange={(e) => savePrivateNote(conv.other_user.user_id, e.target.value)}
                    placeholder="Private note about this contact…"
                    rows={3}
                    className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 10, padding: "8px 12px", fontSize: 12, outline: "none", resize: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" }}
                  />
                </div>
              )}
              </div>
            );
          })
        )}
        {Object.keys(hiddenChats).length > 0 && (
          <div style={{ borderTop: "1px solid var(--color-border-subtle)", marginTop: 4 }}>
            {!hiddenChatsUnlocked ? (
              <button
                type="button"
                onClick={() => setShowHiddenAuthModal(true)}
                className="text-text-secondary" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "14px 16px", background: "none", border: "none", cursor: "pointer" }}
              >
                <span style={{ fontSize: 16 }}>🔒</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Hidden Chats</span>
                <span className="bg-surface-raised" style={{ marginLeft: "auto", fontFamily: "'DM Sans', sans-serif", fontSize: 11, borderRadius: 10, padding: "2px 7px" }}>{Object.keys(hiddenChats).length}</span>
              </button>
            ) : (
              <div onClick={resetHiddenSessionTimer}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 6px" }}>
                  <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>🔓 Hidden</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); lockHiddenChats(); }} style={{ background: "none", border: "none", fontSize: 11, color: "#f87171", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Lock</button>
                </div>
                {conversations.filter((c) => !!hiddenChats[c.channel_id]).sort((a, b) => {
                  const at = a.last_message?.sent_at ? new Date(a.last_message.sent_at).getTime() : 0;
                  const bt = b.last_message?.sent_at ? new Date(b.last_message.sent_at).getTime() : 0;
                  return bt - at;
                }).map((conv) => {
                  const bg = convAccentColor(conv.channel_id, COLORS);
                  const timeStr = conv.last_message?.sent_at ? formatTime(conv.last_message.sent_at) : "";
                  return (
                    <div
                      key={conv.channel_id}
                      role="button"
                      tabIndex={0}
                      className="conv-row"
                      onClick={() => { resetHiddenSessionTimer(); stickToBottomRef.current = true; canLoadOlderRef.current = false; setActiveChatId(conv.channel_id); }}
                      style={{ position: "relative", width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: activeChatId === conv.channel_id ? "rgba(37,99,235,0.15)" : "none", cursor: "pointer", boxSizing: "border-box" }}
                    >
                      <div style={{ width: 42, height: 42, borderRadius: "50%", background: bg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#fff", overflow: "hidden", border: "1.5px solid var(--color-border)" }}>
                        <SafeImage
                          src={conv.other_user?.profile_pic_url}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          fallback={(conv.other_user?.name?.[0] ?? conv.channel_name?.[0] ?? "?").toUpperCase()}
                        />
                      </div>
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{convTitle(conv)}</p>
                          <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, flexShrink: 0, marginLeft: 6 }}>{timeStr}</span>
                        </div>
                        <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                          {conv.last_message?.content ?? ""}
                        </p>
                      </div>
                      <div data-menu-anchor style={{ position: "relative", flexShrink: 0 }}>
                        <button
                          type="button"
                          className="conv-delete text-text-muted"
                          onClick={(e) => { e.stopPropagation(); setConvMenuId(convMenuId === conv.channel_id ? null : conv.channel_id); }}
                          style={{ background: "none", border: "none", padding: "8px 6px", cursor: "pointer", display: "flex", alignItems: "center" }}
                        >
                          <span style={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                            {[0,1,2].map((i) => <span key={i} style={{ width: 3.5, height: 3.5, borderRadius: "50%", background: "currentColor", display: "block" }} />)}
                          </span>
                        </button>
                        {convMenuId === conv.channel_id && (
                          <div onClick={(e) => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ position: "absolute", right: 0, top: "100%", zIndex: 300, borderRadius: 12, minWidth: 150, boxShadow: "0 16px 40px var(--color-shadow)", overflow: "hidden" }}>
                            <button type="button" onClick={(e) => { e.stopPropagation(); const next = { ...hiddenChats }; delete next[conv.channel_id]; saveHiddenChats(next); setConvMenuId(null); }} className="text-text-secondary" style={{ display: "block", width: "100%", padding: "11px 14px", background: "none", border: "none", fontSize: 12, fontFamily: "'DM Sans', sans-serif", textAlign: "left", cursor: "pointer", borderBottom: "1px solid var(--color-border-subtle)" }}>
                              Unhide chat
                            </button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setConvMenuId(null); handleDeleteConversation(conv); }} style={{ display: "block", width: "100%", padding: "11px 14px", background: "none", border: "none", color: "#f87171", fontSize: 12, fontFamily: "'DM Sans', sans-serif", textAlign: "left", cursor: "pointer" }}>
                              Delete conversation
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile && chatLocked && !chatUnlocked) {
    return (
      <div className="bg-bg" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
        <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 4, letterSpacing: 1 }}>Chat Locked</p>
        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 24 }}>Enter your PIN to access messages</p>
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pinInput}
          onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
          onKeyDown={(e) => e.key === "Enter" && verifyPin()}
          placeholder="••••"
          autoFocus
          className="bg-surface-raised border border-border text-text-primary" style={{ textAlign: "center", fontSize: 28, letterSpacing: 10, width: 140, borderRadius: 14, padding: "14px 16px", outline: "none", fontFamily: "monospace" }}
        />
        {pinError && <p style={{ fontFamily: "'DM Sans', sans-serif", color: "#f87171", fontSize: 12, marginTop: 10 }}>{pinError}</p>}
        <button type="button" onClick={verifyPin} style={{ marginTop: 16, padding: "11px 36px", background: "linear-gradient(135deg, #2563eb, #7c3aed)", border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
          Unlock
        </button>
        <button type="button" onClick={tryBiometric} style={{ marginTop: 10, background: "none", border: "none", color: "#60a5fa", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
          Use Face ID / Fingerprint
        </button>
      </div>
    );
  }

  if (isMobile && activeChatId && activeConv) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: activeWallpaper || "var(--color-bg)",
          transition: "background 0.25s ease",
        }}
      >
        {chatBody}
        {dialog}
        {showForwardModal && forwardMsg && (
          <div onClick={() => { setShowForwardModal(false); setForwardMsg(null); setForwardTarget(null); }} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={(e) => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: 24, width: 320, maxWidth: "90vw", boxShadow: "0 20px 60px var(--color-shadow)" }}>
              <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Forward message</p>
              <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{forwardMsg.text ?? "[media]"}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto", marginBottom: 14 }}>
                {conversations.filter((c) => c.channel_id !== activeChatId).map((c) => (
                  <button key={c.channel_id} type="button" onClick={() => setForwardTarget(c)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: forwardTarget?.channel_id === c.channel_id ? "rgba(37,99,235,0.25)" : "var(--color-surface-raised)", border: forwardTarget?.channel_id === c.channel_id ? "1px solid rgba(37,99,235,0.5)" : "1px solid var(--color-border-subtle)", borderRadius: 10, cursor: "pointer", textAlign: "left", width: "100%" }}>
                    <div className="text-text-primary" style={{ width: 30, height: 30, borderRadius: "50%", background: convAccentColor(c.channel_id, COLORS), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{convAvatar(c)}</div>
                    <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{convTitle(c)}</p>
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => { setShowForwardModal(false); setForwardMsg(null); setForwardTarget(null); }} className="bg-surface-raised text-text-primary" style={{ flex: 1, padding: "9px 0", border: "none", borderRadius: 10, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                <button type="button" onClick={forwardMessage} disabled={!forwardTarget || forwarding} style={{ flex: 1, padding: "9px 0", background: forwardTarget ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 600, cursor: forwardTarget ? "pointer" : "default" }}>{forwarding ? "..." : "Forward"}</button>
              </div>
            </div>
          </div>
        )}
        {showPollModal && (
          <div onClick={() => setShowPollModal(false)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={(e) => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: 24, width: 320, maxWidth: "90vw", boxShadow: "0 20px 60px var(--color-shadow)" }}>
              <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Create Poll</p>
              <input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} placeholder="Ask a question…" className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 10, padding: "9px 12px", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
              {pollOptions.map((opt, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input value={opt} onChange={(e) => { const next = [...pollOptions]; next[i] = e.target.value; setPollOptions(next); }} placeholder={`Option ${i + 1}`} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, borderRadius: 8, padding: "7px 10px", fontSize: 12, outline: "none" }} />
                  {pollOptions.length > 2 && (
                    <button type="button" onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button>
                  )}
                </div>
              ))}
              {pollOptions.length < 6 && (
                <button type="button" onClick={() => setPollOptions((prev) => [...prev, ""])} className="bg-surface-raised text-text-secondary" style={{ width: "100%", padding: "7px 0", border: "1px dashed var(--color-border)", borderRadius: 8, fontSize: 12, cursor: "pointer", marginBottom: 14 }}>+ Add option</button>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button type="button" onClick={() => setShowPollModal(false)} className="bg-surface-raised text-text-primary" style={{ flex: 1, padding: "9px 0", border: "none", borderRadius: 10, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                <button type="button" onClick={sendPoll} disabled={!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2} style={{ flex: 1, padding: "9px 0", background: pollQuestion.trim() && pollOptions.filter((o) => o.trim()).length >= 2 ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Send Poll</button>
              </div>
            </div>
          </div>
        )}
        {showEventModal && (
          <div onClick={() => setShowEventModal(false)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={(e) => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: 24, width: 340, boxShadow: "0 20px 60px var(--color-shadow)" }}>
              <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 14 }}>📅 Schedule Event</p>
              <input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="Event title…" className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 10, padding: "9px 12px", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, borderRadius: 8, padding: "7px 10px", fontSize: 12, outline: "none", colorScheme: "dark" }} />
                <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, borderRadius: 8, padding: "7px 10px", fontSize: 12, outline: "none", colorScheme: "dark" }} />
              </div>
              <input value={eventNote} onChange={(e) => setEventNote(e.target.value)} placeholder="Note (optional)…" className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 10, padding: "9px 12px", fontSize: 12, outline: "none", boxSizing: "border-box", marginBottom: 14 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => { setShowEventModal(false); setEventTitle(""); setEventDate(""); setEventTime(""); setEventNote(""); }} className="bg-surface-raised text-text-primary" style={{ flex: 1, padding: "9px 0", border: "none", borderRadius: 10, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                <button type="button" onClick={sendEvent} disabled={!eventTitle.trim() || !eventDate || !eventTime} style={{ flex: 1, padding: "9px 0", background: eventTitle.trim() && eventDate && eventTime ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Send</button>
              </div>
            </div>
          </div>
        )}
        {showHiddenAuthModal && (
          <div onClick={() => { setShowHiddenAuthModal(false); setHiddenAuthInput(""); setHiddenAuthError(""); }} style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={(e) => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ borderRadius: 20, padding: "32px 28px", width: 320, maxWidth: "90vw", boxShadow: "0 24px 64px var(--color-shadow)" }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🔒</div>
                <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: 0.5 }}>Hidden Chats</p>
                <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 4 }}>Enter your password to unlock</p>
              </div>
              <input type="password" value={hiddenAuthInput} onChange={(e) => { setHiddenAuthInput(e.target.value); setHiddenAuthError(""); }} onKeyDown={(e) => e.key === "Enter" && tryUnlockHiddenChats()} placeholder="Password…" autoFocus className="bg-surface-raised text-text-primary" style={{ width: "100%", border: `1px solid ${hiddenAuthError ? "rgba(239,68,68,0.6)" : "var(--color-border)"}`, borderRadius: 12, padding: "11px 14px", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" }} />
              {hiddenAuthError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#f87171", marginTop: 6 }}>{hiddenAuthError}</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button type="button" onClick={() => { setShowHiddenAuthModal(false); setHiddenAuthInput(""); setHiddenAuthError(""); }} className="bg-surface-raised text-text-primary" style={{ flex: 1, padding: "10px 0", border: "none", borderRadius: 10, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
                <button type="button" onClick={tryUnlockHiddenChats} style={{ flex: 1, padding: "10px 0", background: "linear-gradient(135deg, #2563eb, #7c3aed)", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Unlock</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        paddingLeft: isMobile ? 16 : 108,
        paddingRight: isMobile ? 16 : 32,
        paddingBottom: 16,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes msgHeartBurst {
          0% { transform: translate(-50%, -50%) scale(0.35); opacity: 0; }
          18% { transform: translate(-50%, -50%) scale(1.12); opacity: 1; }
          100% { transform: translate(-50%, -58%) scale(1); opacity: 0; }
        }
      `}</style>
      <div style={{ paddingTop: 28, flexShrink: 0 }} />

      {isMobile ? (
        convList
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            gap: 16,
            minHeight: 0,
            overflow: "hidden",
            animation: "fadeUp 0.3s ease 60ms both",
          }}
        >
          {convList}
          <div
            className="bg-surface border border-border" style={{
              flex: 1,
              minHeight: 0,
              borderRadius: 14,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {activeChatId && activeConv ? (
              chatBody
            ) : (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    background: "rgba(37,99,235,0.12)",
                    border: "1px solid rgba(37,99,235,0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width={24}
                    height={24}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                </div>
                <p
                  className="text-text-primary" style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 700,
                    fontSize: 18,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {t("messages.selectConversation")}
                </p>
                <p
                  className="text-text-secondary" style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                  }}
                >
                  {t("messages.chooseConversationHint")}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      {lightboxUrl && (
        <ChatImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
      {showForwardModal && forwardMsg && (
        <div onClick={() => { setShowForwardModal(false); setForwardMsg(null); setForwardTarget(null); }} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ borderRadius: 14, padding: "20px 24px", width: 320, maxWidth: "90vw", boxShadow: "0 24px 64px var(--color-shadow)" }}>
            <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 17, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Forward Message</p>
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{forwardMsg.text ?? "[media]"}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto", marginBottom: 14 }}>
              {conversations.filter((c) => c.channel_id !== activeChatId).map((c) => (
                <button key={c.channel_id} type="button" onClick={() => setForwardTarget(c)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: forwardTarget?.channel_id === c.channel_id ? "rgba(37,99,235,0.25)" : "var(--color-surface-raised)", border: forwardTarget?.channel_id === c.channel_id ? "1px solid rgba(37,99,235,0.5)" : "1px solid var(--color-border-subtle)", borderRadius: 10, cursor: "pointer", textAlign: "left", width: "100%" }}>
                  <div className="text-text-primary" style={{ width: 30, height: 30, borderRadius: "50%", background: convAccentColor(c.channel_id, COLORS), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{convAvatar(c)}</div>
                  <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{convTitle(c)}</p>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => { setShowForwardModal(false); setForwardMsg(null); setForwardTarget(null); }} className="bg-surface-raised text-text-primary" style={{ flex: 1, padding: "9px 0", border: "none", borderRadius: 10, fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button type="button" onClick={forwardMessage} disabled={!forwardTarget || forwarding} style={{ flex: 1, padding: "9px 0", background: forwardTarget ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 600, cursor: forwardTarget ? "pointer" : "default" }}>{forwarding ? "..." : "Forward"}</button>
            </div>
          </div>
        </div>
      )}
      {dialog}
      {showPollModal && (
        <div onClick={() => setShowPollModal(false)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: 24, width: 340, boxShadow: "0 20px 60px var(--color-shadow)" }}>
            <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Create Poll</p>
            <input
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="Ask a question…"
              className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 10, padding: "9px 12px", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10 }}
            />
            {pollOptions.map((opt, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input
                  value={opt}
                  onChange={(e) => { const next = [...pollOptions]; next[i] = e.target.value; setPollOptions(next); }}
                  placeholder={`Option ${i + 1}`}
                  className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, borderRadius: 8, padding: "7px 10px", fontSize: 12, outline: "none" }}
                />
                {pollOptions.length > 2 && (
                  <button type="button" onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button>
                )}
              </div>
            ))}
            {pollOptions.length < 6 && (
              <button type="button" onClick={() => setPollOptions((prev) => [...prev, ""])} className="bg-surface-raised text-text-secondary" style={{ width: "100%", padding: "7px 0", border: "1px dashed var(--color-border)", borderRadius: 8, fontSize: 12, cursor: "pointer", marginBottom: 14 }}>+ Add option</button>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button type="button" onClick={() => setShowPollModal(false)} className="bg-surface-raised text-text-primary" style={{ flex: 1, padding: "9px 0", border: "none", borderRadius: 10, fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button type="button" onClick={sendPoll} disabled={!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2} style={{ flex: 1, padding: "9px 0", background: pollQuestion.trim() && pollOptions.filter((o) => o.trim()).length >= 2 ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Send Poll</button>
            </div>
          </div>
        </div>
      )}
      {showHiddenAuthModal && (
        <div onClick={() => { setShowHiddenAuthModal(false); setHiddenAuthInput(""); setHiddenAuthError(""); }} style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ borderRadius: 20, padding: "32px 28px", width: 320, maxWidth: "90vw", boxShadow: "0 24px 64px var(--color-shadow)" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🔒</div>
              <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: 0.5 }}>Hidden Chats</p>
              <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 4 }}>Enter your password to unlock</p>
            </div>
            <input type="password" value={hiddenAuthInput} onChange={(e) => { setHiddenAuthInput(e.target.value); setHiddenAuthError(""); }} onKeyDown={(e) => e.key === "Enter" && tryUnlockHiddenChats()} placeholder="Password…" autoFocus className="bg-surface-raised text-text-primary" style={{ width: "100%", border: `1px solid ${hiddenAuthError ? "rgba(239,68,68,0.6)" : "var(--color-border)"}`, borderRadius: 12, padding: "11px 14px", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" }} />
            {hiddenAuthError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#f87171", marginTop: 6 }}>{hiddenAuthError}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => { setShowHiddenAuthModal(false); setHiddenAuthInput(""); setHiddenAuthError(""); }} className="bg-surface-raised text-text-primary" style={{ flex: 1, padding: "10px 0", border: "none", borderRadius: 10, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
              <button type="button" onClick={tryUnlockHiddenChats} style={{ flex: 1, padding: "10px 0", background: "linear-gradient(135deg, #2563eb, #7c3aed)", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Unlock</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { MessagesPage };
