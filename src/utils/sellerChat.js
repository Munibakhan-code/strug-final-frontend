import i18n from "../i18n/index.js";

export const SELLER_CHAT_COLORS = ["#059669", "#2563eb", "#d97706", "#7c3aed", "#ec4899"];
export const SELLER_CHAT_PAGE_SIZE = 30;

export function chatUserId(id) {
	if (id == null || id === "") return null;
	const n = Number(id);
	return Number.isFinite(n) ? n : null;
}

export function isSameChatUser(a, b) {
	const left = chatUserId(a);
	const right = chatUserId(b);
	return left != null && right != null && left === right;
}

export function sellerChannelId(conv) {
	const id = conv?.channel_id ?? conv?.id ?? null;
	if (id == null || id === "") return null;
	const n = Number(id);
	return Number.isFinite(n) ? n : null;
}

export function isSameSellerChannel(a, b) {
	const left = chatUserId(a);
	const right = chatUserId(b);
	return left != null && right != null && left === right;
}

export const sameSellerChannel = isSameSellerChannel;

export function findSellerConversation(list, channelId) {
	if (!Array.isArray(list) || channelId == null) return null;
	return list.find((c) => isSameSellerChannel(sellerChannelId(c), channelId)) ?? null;
}

/** Keep the open channel_id across list re-sorts; never fall back to index 0. */
export function resolveActiveChannelId(list, activeChannelId) {
	if (activeChannelId == null) return null;
	const found = findSellerConversation(list, activeChannelId);
	return found ? sellerChannelId(found) : null;
}

export function zeroUnreadForChannel(list, channelId) {
	return (Array.isArray(list) ? list : []).map((c) =>
		isSameSellerChannel(sellerChannelId(c), channelId) ? { ...c, unread_count: 0 } : c,
	);
}

export function nextUnreadCount({ unreadCount, channelId, activeChannelId, isMine }) {
	if (isMine) return unreadCount ?? 0;
	if (isSameSellerChannel(channelId, activeChannelId)) return 0;
	return (unreadCount ?? 0) + 1;
}

export function nextSellerUnreadCount({ unread, channelId, activeChannelId, senderId, myUserId }) {
	return nextUnreadCount({
		unreadCount: unread,
		channelId,
		activeChannelId,
		isMine: isSameChatUser(senderId, myUserId),
	});
}

/**
 * `null` / omitted = show everything (legacy).
 * `[]` = unscoped DMs only (no context_type) — ecommerce/decor buyer contact.
 * `["food", …]` = those vertical context_type values.
 */
export function filterSellerConversations(all, allowedContexts) {
	const list = Array.isArray(all) ? all : [];
	if (!Array.isArray(allowedContexts)) return list;
	if (allowedContexts.length === 0) {
		return list.filter((c) => !c?.context_type);
	}
	return list.filter((c) => allowedContexts.includes(c?.context_type));
}

export function sortSellerConversations(list) {
	return [...list].sort((a, b) => {
		const aT = a.last_message?.sent_at ? new Date(a.last_message.sent_at).getTime() : 0;
		const bT = b.last_message?.sent_at ? new Date(b.last_message.sent_at).getTime() : 0;
		return bT - aT;
	});
}

export function sellerConvColor(conv) {
	const cid = sellerChannelId(conv) ?? 0;
	return SELLER_CHAT_COLORS[cid % SELLER_CHAT_COLORS.length];
}

function parseMessageMetadata(metadata) {
	if (!metadata) return null;
	if (typeof metadata === "object") return metadata;
	if (typeof metadata === "string") {
		try {
			return JSON.parse(metadata);
		} catch {
			return null;
		}
	}
	return null;
}

function isHttpUrl(value) {
	return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

export function sellerMessageMedia(msg) {
	const meta = parseMessageMetadata(msg?.metadata);
	const contentType = String(msg?.contentType ?? msg?.content_type ?? "text").toLowerCase();
	const rawText = typeof msg?.text === "string" ? msg.text : (typeof msg?.content === "string" ? msg.content : "");
	const textUrl = isHttpUrl(rawText) ? rawText.trim() : null;
	const url = meta?.url || textUrl || null;
	const mime = String(meta?.mime_type ?? "").toLowerCase();

	if (msg?.deleted) return { kind: "text" };

	if (contentType === "image" || contentType.startsWith("image/") || mime.startsWith("image/")) {
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
		if (/\.(png|jpe?g|webp|gif|bmp)(\?|#|$)/i.test(url) || /\/chat-media\//i.test(url)) {
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

export function sellerMediaPreviewLabel(kind, name, t) {
	const tr = typeof t === "function" ? t : (key) => i18n.t(key);
	switch (kind) {
		case "image":
			return tr("messages.photo");
		case "video":
			return tr("messages.video");
		case "audio":
			return tr("messages.audio");
		case "file":
			return name || tr("messages.attachment");
		default:
			return "";
	}
}

export function sellerMediaKind(contentType, textOrUrl, metadata) {
	return sellerMessageMedia({
		contentType,
		text: textOrUrl,
		content: textOrUrl,
		metadata,
	});
}

/** Never returns a raw object — safe to render as React children. */
export function sellerLastMessagePreview(lastMessage, t) {
	const tr = typeof t === "function" ? t : (key) => i18n.t(key);
	if (lastMessage == null || lastMessage === "") return "";
	if (typeof lastMessage === "string") return lastMessage;
	if (typeof lastMessage !== "object") return "";

	const media = sellerMessageMedia({
		text: typeof lastMessage.content === "string" ? lastMessage.content : "",
		contentType: lastMessage.content_type ?? lastMessage.contentType ?? "text",
		metadata: lastMessage.metadata,
		deleted: false,
	});
	if (media.kind !== "text") {
		return sellerMediaPreviewLabel(media.kind, media.name, tr);
	}
	if (typeof lastMessage.content === "string") return lastMessage.content;
	if (lastMessage.content && typeof lastMessage.content === "object") return "";
	return "";
}

export function mapSellerMessage(m, myUserId) {
	const senderId = m.sender_id ?? m.user?.user_id ?? null;
	const profiles = m.user?.social_profiles;
	const profile = Array.isArray(profiles) ? profiles[0] : profiles;
	const name = m.user?.name ?? m.sender_name ?? i18n.t("shared.defaultUser");
	const deleted = !!m.deleted_at;
	const contentType = String(m.content_type ?? "text").toLowerCase();
	const raw = m.content ?? m.text ?? "";
	const text = deleted
		? i18n.t("shared.messageDeleted")
		: (typeof raw === "string" ? raw : "");
	const metadata = parseMessageMetadata(m.metadata);
	return {
		id: m.message_id ?? m.id,
		clientMsgId: m.client_msg_id ?? metadata?.__client_msg_id ?? null,
		senderId,
		isMe: isSameChatUser(senderId, myUserId),
		text,
		contentType,
		metadata,
		senderName: name,
		profilePicUrl: profile?.profile_pic_url ?? m.user?.profile_pic_url ?? null,
		avatarInitial: name[0]?.toUpperCase() ?? "?",
		sentAt: m.sent_at ?? m.created_at,
		edited: !!m.edited_at,
		deleted,
	};
}

export function sellerPartnerProfile(conv) {
	if (!conv?.other_user) return null;
	const name = conv.other_user.name ?? conv.channel_name ?? i18n.t("shared.defaultUser");
	return {
		senderName: name,
		profilePicUrl: conv.other_user.profile_pic_url ?? null,
		avatarInitial: name[0]?.toUpperCase() ?? "?",
		color: sellerConvColor(conv),
	};
}

export function sellerFormatTime(ts) {
	if (!ts) return "";
	const d = new Date(ts);
	return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function sellerFormatConvTime(ts) {
	if (!ts) return "";
	const d = new Date(ts);
	const now = new Date();
	const diffMs = now - d;
	if (diffMs < 60000) return i18n.t("shared.justNow");
	if (diffMs < 3600000) return i18n.t("shared.minutesAgo", { count: Math.floor(diffMs / 60000) });
	if (diffMs < 86400000) return i18n.t("shared.hoursAgo", { count: Math.floor(diffMs / 3600000) });
	return d.toLocaleDateString();
}

export function createSellerClientMsgId() {
	return `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function extractConversationList(data) {
	if (Array.isArray(data)) return data;
	return data?.channels ?? data?.data ?? [];
}

export function extractMessageList(data) {
	if (Array.isArray(data)) return data;
	return data?.messages ?? data?.data ?? [];
}

export function sellerThreadHasMore(data, msgs) {
	if (data?.pagination?.has_more != null) return !!data.pagination.has_more;
	return (Array.isArray(msgs) ? msgs.length : 0) >= SELLER_CHAT_PAGE_SIZE;
}
