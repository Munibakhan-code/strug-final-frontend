import React from "react";
import { useViewport } from "../hooks/useViewport.js";
import { useDialog } from "./ConfirmDialog.jsx";
import { Avatar } from "./SafeImage.jsx";
import { ChatMediaImage } from "./ChatMediaImage.jsx";
import { ChatMediaVideo } from "./ChatMediaVideo.jsx";
import { ChatMediaAudio } from "./ChatMediaAudio.jsx";
import { ChatMediaFile } from "./ChatMediaFile.jsx";
import {
	getMyConversations,
	getChannelMessages,
	sendMessage as sendChatMessage,
	markMessagesRead,
	editMessage,
	deleteMessage,
	notifyChatInboxUpdate,
} from "../api/chat.js";
import {
	joinChatChannel,
	leaveChatChannel,
	sendChatMessageSocket,
	emitTypingStart,
	emitTypingStop,
	subscribeChatEvents,
} from "../api/chatSocket.js";
import { connectSocket } from "../api/socket.js";
import { mergeChatMessageLists } from "../utils/chatLive.js";
import { useChatLiveFallback } from "../hooks/useChatLiveFallback.js";
import { getUser } from "../store/auth.js";
import i18n from "../i18n/index.js";
import {
	SELLER_CHAT_COLORS,
	SELLER_CHAT_PAGE_SIZE,
	chatUserId,
	isSameChatUser,
	sellerChannelId,
	isSameSellerChannel,
	filterSellerConversations,
	sortSellerConversations,
	nextSellerUnreadCount,
	zeroUnreadForChannel,
	resolveActiveChannelId,
	sellerThreadHasMore,
	sellerConvColor,
	sellerMessageMedia,
	sellerMediaPreviewLabel,
	sellerLastMessagePreview,
	mapSellerMessage,
	sellerPartnerProfile,
	sellerFormatTime,
	sellerFormatConvTime,
	createSellerClientMsgId,
	extractConversationList,
	extractMessageList,
} from "../utils/sellerChat.js";

function SellerMessageBody({ m, isMe, onOpenFull }) {
	if (m.deleted) {
		return (
			<p style={{ fontSize: 13, color: isMe ? "#fff" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.45, fontStyle: "italic" }}>
				{m.text}
			</p>
		);
	}

	const media = sellerMessageMedia(m);
	if (media.kind === "image" && media.url) {
		return <ChatMediaImage url={media.url} />;
	}
	if (media.kind === "video" && media.url) {
		return <ChatMediaVideo url={media.url} />;
	}
	if (media.kind === "audio" && media.url) {
		return <ChatMediaAudio url={media.url} />;
	}
	if (media.kind === "file" && media.url) {
		return <ChatMediaFile url={media.url} name={media.name} />;
	}
	if (media.kind !== "text") {
		return (
			<div>
				<p style={{ fontSize: 13, color: isMe ? "#fff" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.45 }}>
					{sellerMediaPreviewLabel(media.kind, media.name)}
				</p>
				<button
					type="button"
					onClick={onOpenFull}
					style={{ marginTop: 6, padding: 0, background: "none", border: "none", color: isMe ? "rgba(255,255,255,0.85)" : "#60a5fa", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
				>
					{i18n.t("shared.openInMessages")}
				</button>
			</div>
		);
	}

	return (
		<p style={{ fontSize: 13, color: isMe ? "#fff" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.45 }}>
			{typeof m.text === "string" ? m.text : ""}
		</p>
	);
}

// `contexts` scopes this seller-side inbox to the chat channels that belong to the
// dashboard's vertical (by channel context_type). Empty array = unscoped DMs only
// (ecommerce/decor buyer contact that cannot be vertical-attributed). Omitting the
// prop preserves the legacy "show everything" behavior.
const SellerChatTab = React.memo(function SellerChatTab({ color = "#2563eb", contexts }) {
	const { isMobile } = useViewport();
	const [convos, setConvos] = React.useState([]);
	const [activeChannelId, setActiveChannelId] = React.useState(null);
	const [inboxStatus, setInboxStatus] = React.useState("loading");
	const [threadStatus, setThreadStatus] = React.useState("idle");
	const [hasMore, setHasMore] = React.useState(false);
	const [loadingMore, setLoadingMore] = React.useState(false);
	const [messages, setMessages] = React.useState([]);
	const [msgInput, setMsgInput] = React.useState("");
	const [sending, setSending] = React.useState(false);
	const [typingUserId, setTypingUserId] = React.useState(null);
	const [editingId, setEditingId] = React.useState(null);
	const [editText, setEditText] = React.useState("");
	const [chatDialog, { notify: notifyChat }] = useDialog();
	const myUser = React.useMemo(() => getUser(), []);
	const myUserId = chatUserId(myUser?.user_id ?? myUser?.id);
	const channelIdRef = React.useRef(null);
	const activeChannelIdRef = React.useRef(null);
	const typingUserIdRef = React.useRef(null);
	const messagesEndRef = React.useRef(null);
	const messagesScrollRef = React.useRef(null);
	const typingTimerRef = React.useRef(null);
	const loadingMoreRef = React.useRef(false);
	const hasMoreRef = React.useRef(false);
	const messagesListRef = React.useRef([]);

	typingUserIdRef.current = typingUserId;
	messagesListRef.current = messages;
	hasMoreRef.current = hasMore;

	const contextKey = Array.isArray(contexts) ? contexts.join(",") : null;
	const allowedContexts = React.useMemo(
		() => (Array.isArray(contexts) ? contexts : null),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[contextKey],
	);

	const zeroActiveUnread = React.useCallback((list) => {
		const activeId = activeChannelIdRef.current;
		if (activeId == null) return list;
		return zeroUnreadForChannel(list, activeId);
	}, []);

	const reloadConvos = React.useCallback(() => {
		setInboxStatus((prev) => (prev === "ready" ? prev : "loading"));
		return getMyConversations()
			.then((data) => {
				const all = extractConversationList(data);
				const channels = sortSellerConversations(filterSellerConversations(all, allowedContexts));
				setConvos(zeroActiveUnread(channels));
				setInboxStatus("ready");
			})
			.catch(() => {
				setConvos([]);
				setInboxStatus("error");
			});
	}, [allowedContexts, zeroActiveUnread]);

	React.useEffect(() => {
		reloadConvos();
		connectSocket();
		const onInboxUpdate = () => reloadConvos();
		window.addEventListener("strug:chat-inbox-update", onInboxUpdate);
		return () => window.removeEventListener("strug:chat-inbox-update", onInboxUpdate);
	}, [reloadConvos]);

	React.useEffect(() => {
		const next = resolveActiveChannelId(convos, activeChannelId);
		if (activeChannelId != null && next !== activeChannelId) {
			setActiveChannelId(next);
		}
	}, [convos, activeChannelId]);

	const activeConv = React.useMemo(
		() => convos.find((c) => isSameSellerChannel(sellerChannelId(c), activeChannelId)) ?? null,
		[convos, activeChannelId],
	);
	const channelId = sellerChannelId(activeConv);
	const partnerProfile = activeConv ? sellerPartnerProfile(activeConv) : null;
	const isGroupChat = !!activeConv && !!activeConv.type && activeConv.type !== "dm";

	React.useEffect(() => {
		channelIdRef.current = channelId;
		activeChannelIdRef.current = activeChannelId;
	}, [channelId, activeChannelId]);

	React.useEffect(() => {
		if (!channelId) {
			window.__activeChatChannelId = null;
			return undefined;
		}
		window.__activeChatChannelId = channelId;
		return () => {
			window.__activeChatChannelId = null;
		};
	}, [channelId]);

	React.useEffect(() => {
		if (!channelId) {
			setMessages([]);
			setThreadStatus("idle");
			setHasMore(false);
			return undefined;
		}
		let cancelled = false;
		setMessages([]);
		setTypingUserId(null);
		setEditingId(null);
		setEditText("");
		setThreadStatus("loading");
		setHasMore(false);
		hasMoreRef.current = false;

		getChannelMessages(channelId, SELLER_CHAT_PAGE_SIZE)
			.then((data) => {
				if (cancelled) return;
				const msgs = extractMessageList(data);
				setMessages(msgs.map((m) => mapSellerMessage(m, myUserId)));
				const more = sellerThreadHasMore(data, msgs);
				setHasMore(more);
				hasMoreRef.current = more;
				setThreadStatus("ready");
			})
			.catch(() => {
				if (!cancelled) {
					setMessages([]);
					setThreadStatus("error");
				}
			});
		joinChatChannel(channelId).catch(() => {});
		markMessagesRead(channelId)
			.then(() => {
				if (cancelled) return;
				setConvos((prev) => zeroUnreadForChannel(prev, channelId));
			})
			.catch(() => {});
		return () => {
			cancelled = true;
			leaveChatChannel(channelId);
		};
	}, [channelId, myUserId]);

	React.useEffect(() => {
		const unsub = subscribeChatEvents({
			onMessageCreated: (msg) => {
				const cid = msg.channel_id;
				setConvos((prev) => {
					const updated = prev.map((c) => {
						if (!isSameSellerChannel(sellerChannelId(c), cid)) return c;
						return {
							...c,
							last_message: {
								message_id: msg.message_id,
								content: msg.content,
								content_type: msg.content_type,
								sent_at: msg.sent_at ?? new Date().toISOString(),
								is_mine: isSameChatUser(msg.sender_id, myUserId),
							},
							unread_count: nextSellerUnreadCount({
								unread: c.unread_count,
								channelId: cid,
								activeChannelId: channelIdRef.current,
								senderId: msg.sender_id,
								myUserId,
							}),
						};
					});
					return sortSellerConversations(updated);
				});

				if (!isSameSellerChannel(cid, channelIdRef.current)) return;
				if (isSameChatUser(msg.sender_id, myUserId)) {
					setMessages((prev) => {
						if (prev.some((m) => m.id === msg.message_id || (msg.client_msg_id && m.clientMsgId === msg.client_msg_id))) {
							return prev.map((m) =>
								m.id === msg.message_id || (msg.client_msg_id && m.clientMsgId === msg.client_msg_id)
									? mapSellerMessage(msg, myUserId)
									: m,
							);
						}
						return prev;
					});
					return;
				}

				setMessages((prev) => {
					if (prev.some((m) => m.id === msg.message_id)) return prev;
					return [...prev, mapSellerMessage(msg, myUserId)];
				});
				markMessagesRead(cid)
					.then(() => {
						setConvos((prev) => zeroUnreadForChannel(prev, cid));
					})
					.catch(() => {});
				notifyChatInboxUpdate();
			},
			onMessageUpdated: (msg) => {
				if (!isSameSellerChannel(msg.channel_id, channelIdRef.current)) return;
				setMessages((prev) =>
					prev.map((m) => (m.id === msg.message_id ? mapSellerMessage(msg, myUserId) : m)),
				);
			},
			onMessageDeleted: (msg) => {
				if (!isSameSellerChannel(msg.channel_id, channelIdRef.current)) return;
				const messageId = msg.message_id ?? msg.id;
				setMessages((prev) =>
					prev.map((m) => {
						if (m.id !== messageId) return m;
						if (msg.deleted_at != null) return mapSellerMessage(msg, myUserId);
						return { ...m, deleted: true, text: i18n.t("shared.messageDeleted") };
					}),
				);
			},
			onTypingStarted: ({ channel_id, user_id }) => {
				if (isSameSellerChannel(channel_id, channelIdRef.current) && !isSameChatUser(user_id, myUserId)) {
					setTypingUserId(user_id);
				}
			},
			onTypingStopped: ({ channel_id, user_id }) => {
				if (isSameSellerChannel(channel_id, channelIdRef.current) && isSameChatUser(user_id, typingUserIdRef.current)) {
					setTypingUserId(null);
				}
			},
			onNotification: () => reloadConvos(),
		});
		return unsub;
	}, [myUserId, reloadConvos]);

	const pollOpenThread = React.useCallback(async (id) => {
		if (!id || id !== channelIdRef.current) return;
		try {
			const data = await getChannelMessages(id, SELLER_CHAT_PAGE_SIZE);
			const msgs = extractMessageList(data);
			setMessages((prev) => mergeChatMessageLists(prev, msgs.map((m) => mapSellerMessage(m, myUserId))));
		} catch {
			/* next tick retries */
		}
	}, [myUserId]);

	useChatLiveFallback({
		channelId,
		pollThread: pollOpenThread,
		pollInbox: reloadConvos,
	});

	React.useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages.length, channelId]);

	function selectConversation(id) {
		setActiveChannelId(id);
		activeChannelIdRef.current = id;
		setConvos((prev) => zeroUnreadForChannel(prev, id));
	}

	async function loadOlderMessages() {
		if (!channelId || loadingMoreRef.current || !hasMoreRef.current) return;
		const list = messagesListRef.current;
		const beforeId = list[0]?.id;
		if (typeof beforeId !== "number") return;

		loadingMoreRef.current = true;
		setLoadingMore(true);
		const el = messagesScrollRef.current;
		const prevHeight = el?.scrollHeight ?? 0;
		const prevTop = el?.scrollTop ?? 0;

		try {
			const data = await getChannelMessages(channelId, SELLER_CHAT_PAGE_SIZE, beforeId);
			const older = extractMessageList(data);
			if (older.length === 0) {
				setHasMore(false);
				hasMoreRef.current = false;
			} else {
				setMessages((prev) => {
					const existing = new Set(prev.map((m) => m.id));
					const merged = older
						.map((m) => mapSellerMessage(m, myUserId))
						.filter((m) => !existing.has(m.id));
					return [...merged, ...prev];
				});
				const more = sellerThreadHasMore(data, older);
				setHasMore(more);
				hasMoreRef.current = more;
			}
			requestAnimationFrame(() => {
				if (!el) return;
				el.scrollTop = el.scrollHeight - prevHeight + prevTop;
			});
		} catch {
			/* keep hasMore so the seller can retry */
		} finally {
			loadingMoreRef.current = false;
			setLoadingMore(false);
		}
	}

	function handleThreadScroll(e) {
		if (e.currentTarget.scrollTop < 48 && hasMoreRef.current && !loadingMoreRef.current) {
			loadOlderMessages();
		}
	}

	function handleTyping() {
		if (!channelId) return;
		emitTypingStart(channelId);
		clearTimeout(typingTimerRef.current);
		typingTimerRef.current = setTimeout(() => emitTypingStop(channelId), 2000);
	}

	async function handleSend() {
		if (!msgInput.trim() || !channelId || sending) return;
		const text = msgInput.trim();
		setMsgInput("");
		emitTypingStop(channelId);
		setSending(true);

		const clientMsgId = createSellerClientMsgId();
		const optimistic = {
			id: `tmp-${clientMsgId}`,
			clientMsgId,
			senderId: myUserId,
			isMe: true,
			text,
			contentType: "text",
			senderName: myUser?.name ?? i18n.t("shared.you"),
			profilePicUrl: myUser?.profile_pic_url ?? null,
			avatarInitial: (myUser?.name ?? "Y")[0]?.toUpperCase(),
			sentAt: new Date().toISOString(),
			deleted: false,
		};
		setMessages((prev) => [...prev, optimistic]);

		try {
			let saved;
			try {
				saved = await sendChatMessageSocket(channelId, text, "text", clientMsgId);
			} catch {
				const already = messagesListRef.current?.find(
					(m) => m.isMe && m.clientMsgId === clientMsgId && typeof m.id === "number",
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
					saved = await sendChatMessage(channelId, text, "text", clientMsgId);
				}
			}
			const mapped = mapSellerMessage(saved, myUserId);
			setMessages((prev) => {
				const dupe = prev.some(
					(m) =>
						m.id !== optimistic.id &&
						(m.id === mapped.id || (!!mapped.clientMsgId && m.clientMsgId === mapped.clientMsgId && typeof m.id === "number")),
				);
				const withoutTmp = prev.filter((m) => m.id !== optimistic.id);
				return dupe ? withoutTmp : [...withoutTmp, mapped];
			});
			setConvos((prev) =>
				sortSellerConversations(
					prev.map((c) =>
						isSameSellerChannel(sellerChannelId(c), channelId)
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
					),
				),
			);
			notifyChatInboxUpdate();
		} catch {
			setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
			setMsgInput(text);
		} finally {
			setSending(false);
		}
	}

	function openAllMessages() {
		delete window.__openChatChannelId;
		window.__nav?.("messages");
	}

	function openInMessages() {
		if (channelId) window.__openChatChannelId = channelId;
		window.__nav?.("messages");
	}

	function startEditMessage(m) {
		setEditingId(m.id);
		setEditText(m.text);
	}

	async function saveEditMessage() {
		if (!editingId || !editText.trim()) return;
		try {
			const saved = await editMessage(editingId, editText.trim());
			setMessages((prev) =>
				prev.map((m) => (m.id === editingId ? mapSellerMessage(saved, myUserId) : m)),
			);
			setEditingId(null);
			setEditText("");
		} catch (err) {
			notifyChat({ title: i18n.t("shared.couldntEditMessage"), message: err?.response?.data?.error || err?.response?.data?.message || i18n.t("shared.failedEditMessage") });
		}
	}

	async function removeMessage(m) {
		if (!m?.id || typeof m.id !== "number") return;
		const messageId = m.id;
		setMessages((prev) =>
			prev.map((x) =>
				x.id === messageId ? { ...x, deleted: true, text: i18n.t("shared.messageDeleted") } : x,
			),
		);
		try {
			const saved = await deleteMessage(messageId);
			if (saved?.deleted_at != null) {
				setMessages((prev) =>
					prev.map((x) =>
						x.id === messageId ? mapSellerMessage(saved, myUserId) : x,
					),
				);
			}
		} catch {
			setMessages((prev) =>
				prev.map((x) => (x.id === messageId ? { ...m, deleted: false, text: m.text } : x)),
			);
		}
	}

	function getDisplayName(conv) {
		return conv?.channel_name ?? conv?.name ?? conv?.other_user?.name ?? conv?.other_user?.username ?? i18n.t("common.conversation");
	}

	function renderAvatar({ url, initial, bg, size = 28 }) {
		return (
			<Avatar
				url={url}
				initials={initial}
				size={size}
				style={{ background: bg, fontSize: size * 0.38, fontWeight: 700 }}
			/>
		);
	}

	const showList = !isMobile || !activeConv;
	const showThread = !isMobile || !!activeConv;

	return (
		<div
			className="bg-surface border border-border-subtle"
			style={{
				display: "grid",
				gridTemplateColumns: isMobile ? "1fr" : "260px 1fr",
				gap: 0,
				height: isMobile ? "min(70vh, 640px)" : 520,
				borderRadius: 16,
				overflow: "hidden",
			}}
		>
			{chatDialog}
			{showList && (
			<div className="border-r border-border-subtle" style={{ overflowY: "auto" }}>
				<div className="border-b border-border-subtle" style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
					<p className="text-text-secondary" style={{ fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("shared.messages")}</p>
					<button
						type="button"
						onClick={openAllMessages}
						style={{ padding: "4px 8px", background: "none", border: "none", color: "#60a5fa", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
					>
						{i18n.t("shared.openAll")}
					</button>
				</div>
				{inboxStatus === "loading" && convos.length === 0 && (
					<div style={{ padding: "24px 16px", textAlign: "center" }}>
						<p className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("common.loading")}</p>
					</div>
				)}
				{inboxStatus === "error" && (
					<div style={{ padding: "24px 16px", textAlign: "center" }}>
						<p className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>{i18n.t("messages.failedInbox")}</p>
						<button
							type="button"
							onClick={reloadConvos}
							style={{ padding: "6px 12px", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 8, color: "#60a5fa", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
						>
							{i18n.t("common.tryAgain")}
						</button>
					</div>
				)}
				{inboxStatus === "ready" && convos.length === 0 && (
					<div style={{ padding: "24px 16px", textAlign: "center" }}>
						<p className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("shared.noConversationsYet")}</p>
					</div>
				)}
				{convos.map((c) => {
					const convColor = sellerConvColor(c);
					const unread = c.unread_count ?? 0;
					const cid = sellerChannelId(c);
					const isActive = isSameSellerChannel(cid, activeChannelId);
					return (
						<div
							key={cid ?? c.channel_id ?? c.id}
							role="button"
							tabIndex={0}
							aria-current={isActive ? "true" : undefined}
							onClick={() => cid != null && selectConversation(cid)}
							onKeyDown={(e) => {
								if ((e.key === "Enter" || e.key === " ") && cid != null) {
									e.preventDefault();
									selectConversation(cid);
								}
							}}
							style={{
								padding: "12px 16px",
								cursor: "pointer",
								background: isActive ? "var(--color-surface-raised)" : "transparent",
								borderBottom: "1px solid var(--color-border-subtle)",
								display: "flex",
								gap: 10,
								alignItems: "center",
							}}
							onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--color-border-subtle)"; }}
							onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
						>
							{renderAvatar({
								url: c.other_user?.profile_pic_url,
								initial: getDisplayName(c)[0]?.toUpperCase(),
								bg: convColor,
								size: 36,
							})}
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
									<p className="text-text-primary" style={{ fontSize: 13, fontWeight: unread > 0 ? 700 : 600, fontFamily: "'DM Sans', sans-serif", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", maxWidth: 120 }}>{getDisplayName(c)}</p>
									<span className="text-text-muted" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>
										{sellerFormatConvTime(c.last_message?.sent_at ?? c.last_message_at ?? c.updated_at)}
									</span>
								</div>
								<p className={unread > 0 ? "text-text-secondary" : "text-text-muted"} style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", maxWidth: 160, marginTop: 2 }}>
									{sellerLastMessagePreview(c.last_message)}
								</p>
							</div>
							{unread > 0 && (
								<span style={{ minWidth: 18, height: 18, borderRadius: 9, background: color, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
									{unread > 99 ? "99+" : unread}
								</span>
							)}
						</div>
					);
				})}
			</div>
			)}

			{showThread && (
			<div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
				{activeConv ? (
					<>
						<div className="border-b border-border-subtle" style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 10 }}>
							{isMobile && (
								<button
									type="button"
									onClick={() => setActiveChannelId(null)}
									style={{ padding: "4px 8px", background: "none", border: "none", color: "var(--color-text-secondary)", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
								>
									{i18n.t("common.back")}
								</button>
							)}
							{renderAvatar({
								url: partnerProfile?.profilePicUrl ?? activeConv.other_user?.profile_pic_url,
								initial: partnerProfile?.avatarInitial ?? getDisplayName(activeConv)[0]?.toUpperCase(),
								bg: partnerProfile?.color ?? sellerConvColor(activeConv),
								size: 32,
							})}
							<div style={{ flex: 1, minWidth: 0 }}>
								<p className="text-text-primary" style={{ fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{getDisplayName(activeConv)}</p>
								<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>
									{typingUserId ? i18n.t("common.typing") : activeConv.other_user?.handle ?? (isGroupChat ? i18n.t("shared.groupChat") : "")}
								</p>
							</div>
							<button
								type="button"
								onClick={openInMessages}
								style={{ padding: "6px 12px", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 8, color: "#60a5fa", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
							>
								{i18n.t("shared.openInMessages")}
							</button>
						</div>
						<div
							ref={messagesScrollRef}
							onScroll={handleThreadScroll}
							style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}
						>
							{threadStatus === "loading" && messages.length === 0 && (
								<p className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", textAlign: "center" }}>{i18n.t("messages.loadingMessages")}</p>
							)}
							{threadStatus === "error" && messages.length === 0 && (
								<div style={{ textAlign: "center" }}>
									<p className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>{i18n.t("messages.failedLoad")}</p>
									<button
										type="button"
										onClick={() => {
											setActiveChannelId(null);
											requestAnimationFrame(() => setActiveChannelId(channelId));
										}}
										style={{ padding: "6px 12px", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 8, color: "#60a5fa", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
									>
										{i18n.t("common.tryAgain")}
									</button>
								</div>
							)}
							{hasMore ? (
								<button
									type="button"
									onClick={loadOlderMessages}
									disabled={loadingMore}
									style={{ alignSelf: "center", padding: "6px 12px", background: "none", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-secondary)", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", opacity: loadingMore ? 0.6 : 1 }}
								>
									{loadingMore ? i18n.t("messages.loadingMessages") : i18n.t("messages.loadOlder")}
								</button>
							) : messages.length >= SELLER_CHAT_PAGE_SIZE ? (
								<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", textAlign: "center" }}>
									{i18n.t("shared.olderHistoryInMessages")}
								</p>
							) : null}
							{(hasMore || messages.length >= SELLER_CHAT_PAGE_SIZE) && (
								<button
									type="button"
									onClick={openInMessages}
									style={{ alignSelf: "center", padding: 0, background: "none", border: "none", color: "#60a5fa", fontSize: 11, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
								>
									{i18n.t("shared.historyInMessages")}
								</button>
							)}
							{messages.map((m) => {
								const themAvatar = partnerProfile && !m.isMe
									? partnerProfile
									: {
											senderName: m.senderName,
											profilePicUrl: m.profilePicUrl,
											avatarInitial: m.avatarInitial,
											color: SELLER_CHAT_COLORS[chatUserId(m.senderId) % SELLER_CHAT_COLORS.length || 0],
										};
								const showName = !m.isMe && (isGroupChat || !!partnerProfile);
								const canModify =
									m.isMe &&
									!m.deleted &&
									editingId !== m.id &&
									typeof m.id === "number" &&
									(m.contentType === "text" || !m.contentType);
								const isEditing = editingId === m.id;
								return (
									<div key={m.id} style={{ display: "flex", justifyContent: m.isMe ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 8 }}>
										{!m.isMe && renderAvatar({
											url: themAvatar.profilePicUrl,
											initial: themAvatar.avatarInitial,
											bg: themAvatar.color,
										})}
										<div style={{ maxWidth: "65%", position: "relative" }}>
											{canModify && (
												<div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 4 }}>
													<button type="button" onClick={() => startEditMessage(m)} className="bg-surface-raised border border-border text-text-secondary" style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer" }}>{i18n.t("common.edit")}</button>
													<button type="button" onClick={() => removeMessage(m)} style={{ padding: "2px 8px", background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 6, color: "#f87171", fontSize: 10, cursor: "pointer" }}>{i18n.t("common.delete")}</button>
												</div>
											)}
											<div style={{ padding: "9px 14px", borderRadius: m.isMe ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: m.isMe ? color : "var(--color-surface-raised)", opacity: m.deleted ? 0.6 : 1 }}>
												{showName && (
													<p className="text-text-muted" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>
														{themAvatar.senderName ?? m.senderName}
													</p>
												)}
												{isEditing ? (
													<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
														<textarea
															value={editText}
															onChange={(e) => setEditText(e.target.value)}
															onKeyDown={(e) => {
																if (e.key === "Enter" && !e.shiftKey) {
																	e.preventDefault();
																	saveEditMessage();
																}
																if (e.key === "Escape") {
																	e.preventDefault();
																	setEditingId(null);
																	setEditText("");
																}
															}}
															rows={2}
															autoFocus
															style={{ width: "100%", minWidth: 140, resize: "vertical", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none" }}
														/>
														<div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
															<button type="button" onClick={saveEditMessage} style={{ padding: "5px 10px", background: "#fff", border: "none", borderRadius: 6, color: color, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{i18n.t("common.save")}</button>
															<button type="button" onClick={() => { setEditingId(null); setEditText(""); }} style={{ padding: "5px 10px", background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
														</div>
													</div>
												) : (
													<SellerMessageBody m={m} isMe={m.isMe} onOpenFull={openInMessages} />
												)}
												{!isEditing && (
													<p style={{ fontSize: 10, color: m.isMe ? "rgba(255,255,255,0.45)" : "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", marginTop: 4, textAlign: "right" }}>
														{m.isMe ? i18n.t("shared.youPrefix") : ""}
														{sellerFormatTime(m.sentAt)}
														{m.edited ? ` · ${i18n.t("messages.editedLabel")}` : ""}
													</p>
												)}
											</div>
										</div>
										{m.isMe && renderAvatar({
											url: myUser?.profile_pic_url ?? null,
											initial: (myUser?.name ?? "Y")[0]?.toUpperCase(),
											bg: "#2563eb",
										})}
									</div>
								);
							})}
							<div ref={messagesEndRef} />
						</div>
						<div className="border-t border-border-subtle" style={{ padding: "12px 20px", display: "flex", gap: 10 }}>
							<textarea
								value={msgInput}
								onChange={(e) => { setMsgInput(e.target.value); handleTyping(); }}
								onKeyDown={(e) => {
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										handleSend();
									}
								}}
								placeholder={i18n.t("shared.typeMessage")}
								rows={1}
								aria-label={i18n.t("shared.typeMessage")}
								className="bg-surface-raised border border-border text-text-primary"
								style={{ flex: 1, padding: "10px 14px", borderRadius: 10, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", resize: "none", minHeight: 40, maxHeight: 120 }}
							/>
							<button
								type="button"
								onClick={handleSend}
								disabled={sending}
								style={{ padding: "10px 18px", background: color, border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", opacity: sending ? 0.6 : 1 }}
							>
								{i18n.t("common.send")}
							</button>
						</div>
					</>
				) : (
					<div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
						<p className="text-text-muted" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("shared.selectConversation")}</p>
					</div>
				)}
			</div>
			)}
		</div>
	);
});

export { SellerChatTab };
export default SellerChatTab;
