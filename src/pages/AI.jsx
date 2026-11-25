import React, { useMemo } from "react";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { AISparkleIcon } from "../components/icons.jsx";
import { sendAIChat } from "../api/ai";

const STRUG_AI_MODELS = [
	{ id: "strug-1", labelKey: "ai.modelStrug1", shortKey: "1", descKey: "ai.modelDescFast" },
	{ id: "strug-pro", labelKey: "ai.modelStrugPro", shortKey: "Pro", descKey: "ai.modelDescCapable" },
	{ id: "strug-mini", labelKey: "ai.modelStrugMini", shortKey: "Mini", descKey: "ai.modelDescLight" },
];

const STRUG_AI_INITIAL_CHATS = [
	{ id: "1", title: i18n.t("ai.chatGettingStarted"), pinned: true, createdAt: new Date(), messages: [{ id: "1", role: "ai", content: i18n.t("ai.greetingFull") }] },
	{ id: "2", title: i18n.t("ai.chatOrderHelp"), pinned: false, createdAt: new Date(Date.now() - 86400000), messages: [{ id: "1", role: "user", content: i18n.t("ai.orderQuestion") }, { id: "2", role: "ai", content: i18n.t("ai.orderTrackHelp") }] },
];

const STRUG_AI_SUGGESTIONS = [
	{ labelKey: "ai.suggestFindService", icon: "M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" },
	{ labelKey: "ai.suggestTrackOrder", icon: "M9 17H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17h4a2 2 0 002-2V5a2 2 0 00-2-2h-4M12 12v9M8 12h8" },
	{ labelKey: "ai.suggestWhatCanDo", icon: "M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5Z" },
	{ labelKey: "ai.suggestBrowseDeals", icon: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" },
];

function StrugAIPage({ onClose, isMobile }) {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("ai");
const [chats, setChats] = React.useState(STRUG_AI_INITIAL_CHATS);
	const [activeChatId, setActiveChatId] = React.useState("1");
	const [input, setInput] = React.useState("");
	const [isTyping, setIsTyping] = React.useState(false);
	const [selectedModel, setSelectedModel] = React.useState("strug-pro");
	const [searchQuery, setSearchQuery] = React.useState("");
	const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
	const messagesEndRef = React.useRef(null);
	const textareaRef = React.useRef(null);
	const msgIdRef = React.useRef(100);

	const activeChat = chats.find(c => c.id === activeChatId) || chats[0];
	const isEmptyChat = activeChat?.messages.length === 1 && activeChat.messages[0].role === "ai";

	React.useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [activeChat?.messages, isTyping]);

	const autoResize = () => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = Math.min(el.scrollHeight, 140) + "px";
	};

	const nextId = () => String(++msgIdRef.current);

	const createNewChat = () => {
		const id = nextId();
		const newChat = {
			id,
			title: i18n.t("ai.newChat"),
			pinned: false,
			createdAt: new Date(),
			messages: [{ id: "1", role: "ai", content: i18n.t("ai.greetingShort") }],
		};
		setChats(prev => [newChat, ...prev]);
		setActiveChatId(newChat.id);
	};

	const deleteChat = (id) => {
		setChats(prev => prev.filter(c => c.id !== id));
		if (activeChatId === id) setActiveChatId(chats[0]?.id || "");
	};

	const togglePin = (id) => {
		setChats(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));
	};

	const sendMessage = async (text) => {
		const msg = (text || input).trim();
		if (!msg || isTyping) return;
		// History = the conversation so far (before this new message), mapped to the
		// backend's {role:'user'|'assistant'} shape. Backend caps at 20 turns / 4000 chars.
		const priorMessages = chats.find(c => c.id === activeChatId)?.messages ?? [];
		const history = priorMessages
			.slice(-20)
			.map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: String(m.content).slice(0, 4000) }));
		const userMsg = { id: nextId(), role: "user", content: msg };
		setChats(prev => prev.map(c =>
			c.id === activeChatId
				? { ...c, title: c.messages.length === 1 ? msg.slice(0, 30) : c.title, messages: [...c.messages, userMsg] }
				: c
		));
		setInput("");
		if (textareaRef.current) textareaRef.current.style.height = "auto";
		setIsTyping(true);
		try {
			const reply = await sendAIChat({ message: msg, verticalSlug: "home", history });
			const aiMsg = { id: nextId(), role: "ai", content: reply || "I didn't catch that — could you rephrase?" };
			setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: [...c.messages, aiMsg] } : c));
		} catch {
			const content = "🚧 Strug AI is still under development and isn't available yet. Please check back soon.";
			const aiMsg = { id: nextId(), role: "ai", content };
			setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: [...c.messages, aiMsg] } : c));
		} finally {
			setIsTyping(false);
		}
	};

	const filteredChats = searchQuery
		? chats.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
		: chats;
	const pinnedChats = filteredChats.filter(c => c.pinned);
	const recentChats = filteredChats.filter(c => !c.pinned);
	const currentModel = STRUG_AI_MODELS.find(m => m.id === selectedModel);

	return (
		<div style={{ flex: 1, display: "flex", overflow: "hidden", height: "100%", paddingLeft: isMobile ? 0 : 108 }}>
			{/* AI Chat Sidebar */}
			{isMobile && mobileSidebarOpen && (
				<div onClick={() => setMobileSidebarOpen(false)} style={{ position: "absolute", inset: 0, zIndex: 10, background: "rgba(0,0,0,0.5)" }} />
			)}
			<div style={{
				width: 240, flexShrink: 0,
				boxShadow: "1px 0 0 var(--color-border-subtle), 4px 0 16px var(--color-shadow)",
				display: (isMobile && !mobileSidebarOpen) ? "none" : "flex",
				flexDirection: "column",
				background: isMobile ? "var(--color-surface-raised)" : "transparent",
				...(isMobile ? { position: "absolute", top: 0, left: 0, bottom: 0, zIndex: 11, animation: "flyoutIn 0.2s ease both" } : {}),
			}}>
				{/* Header */}
				<div style={{ padding: "20px 16px 14px", borderBottom: "1px solid var(--color-border-subtle)" }}>
					<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
						<div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #2563eb, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
							<AISparkleIcon s={14} />
						</div>
						<span className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: "0.06em", textTransform: "uppercase", flex: 1 }}>{i18n.t("ai.title")}</span>
						{onClose && !isMobile && (
							<button onClick={onClose} className="text-text-secondary" style={{ width: 24, height: 24, borderRadius: 6, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.12s" }} onMouseEnter={e => e.currentTarget.style.color = "var(--color-text-primary)"} onMouseLeave={e => e.currentTarget.style.color = "var(--color-text-muted)"}>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
							</button>
						)}
						{isMobile && (
							<button onClick={() => setMobileSidebarOpen(false)} className="text-text-secondary" style={{ width: 24, height: 24, borderRadius: 6, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} onMouseEnter={e => e.currentTarget.style.color = "var(--color-text-primary)"} onMouseLeave={e => e.currentTarget.style.color = "var(--color-text-muted)"}>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
							</button>
						)}
					</div>
					<button onClick={createNewChat} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", color: "#60a5fa", fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "background 0.12s", marginBottom: 12 }}
						onMouseEnter={e => e.currentTarget.style.background = "rgba(37,99,235,0.25)"}
						onMouseLeave={e => e.currentTarget.style.background = "rgba(37,99,235,0.15)"}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
						{t("ai.newChat")}
					</button>
					{/* Model selector — segmented control */}
					<div className="bg-surface-raised" style={{ display: "flex", borderRadius: 8, padding: 3, gap: 2 }}>
						{STRUG_AI_MODELS.map(m => (
							<button key={m.id} onClick={() => setSelectedModel(m.id)} style={{ flex: 1, padding: "5px 0", borderRadius: 6, fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, border: "none", cursor: "pointer", transition: "all 0.12s", background: selectedModel === m.id ? "rgba(37,99,235,0.35)" : "transparent", color: selectedModel === m.id ? "#93c5fd" : "var(--color-text-secondary)" }}>
								{t(m.labelKey).replace(i18n.t("ai.title").split(" ")[0] + " ", "")}
							</button>
						))}
					</div>
				</div>

				{/* Search */}
				<div style={{ padding: "8px 12px", borderBottom: "1px solid var(--color-border-subtle)" }}>
					<div className="bg-surface" style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 8, padding: "6px 10px" }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth={2} strokeLinecap="round"><circle cx={11} cy={11} r={8}/><path d="m21 21-4.35-4.35"/></svg>
						<input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }} />
					</div>
				</div>

				{/* Chat list */}
				<div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
					{pinnedChats.length > 0 && (
						<>
							<p className="text-text-muted" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", padding: "4px 8px 6px", fontFamily: "'DM Sans', sans-serif" }}>{t("ai.pinned")}</p>
							{pinnedChats.map(chat => (
								<AIChatRow key={chat.id} chat={chat} active={activeChatId === chat.id} onSelect={() => setActiveChatId(chat.id)} onDelete={() => deleteChat(chat.id)} onTogglePin={() => togglePin(chat.id)} />
							))}
						</>
					)}
					{recentChats.length > 0 && (
						<>
							<p className="text-text-muted" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", padding: "8px 8px 6px", fontFamily: "'DM Sans', sans-serif" }}>{t("ai.recent")}</p>
							{recentChats.map(chat => (
								<AIChatRow key={chat.id} chat={chat} active={activeChatId === chat.id} onSelect={() => setActiveChatId(chat.id)} onDelete={() => deleteChat(chat.id)} onTogglePin={() => togglePin(chat.id)} />
							))}
						</>
					)}
				</div>
			</div>

			{/* Main Chat Area */}
			<div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
				{/* Top bar */}
				<div style={{ padding: "0 16px", height: 48, flexShrink: 0, display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--color-border-subtle)" }}>
					{isMobile && (
						<button onClick={() => setMobileSidebarOpen(true)} className="text-text-secondary" style={{ width: 32, height: 32, borderRadius: 8, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
							<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
						</button>
					)}
					<span className="text-text-primary" style={{ flex: 1, fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeChat?.title || t("ai.chat")}</span>
					<div style={{ flexShrink: 0, padding: "3px 9px", borderRadius: 20, background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.25)", fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, color: "#93c5fd" }}>
						{currentModel ? t(currentModel.labelKey) : ""}
					</div>
					{isMobile && onClose && (
						<button onClick={onClose} className="bg-surface-raised border border-border" style={{ width: 32, height: 32, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.12s" }}
							onMouseEnter={e => e.currentTarget.style.background = "var(--color-border)"}
							onMouseLeave={e => e.currentTarget.style.background = "var(--color-surface-raised)"}
						>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth={2.5} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
						</button>
					)}
				</div>

				{/* Messages or empty state */}
				<div style={{ flex: 1, overflowY: "auto", padding: "24px 28px 16px", display: "flex", flexDirection: "column" }}>
					{isEmptyChat ? (
						<>
							{/* Show welcome message */}
							<div style={{ display: "flex", gap: 10, marginBottom: 28 }}>
								<div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg, #2563eb, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
									<AISparkleIcon s={13} />
								</div>
								<div className="bg-surface-raised border border-border-subtle" style={{ maxWidth: "72%", padding: "10px 14px", borderRadius: "14px 14px 14px 4px" }}>
									<p className="text-text-primary" style={{ fontSize: 14, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.55, margin: 0, textDecoration: "none" }}>{activeChat.messages[0].content}</p>
								</div>
							</div>
							{/* Suggested prompts */}
							<div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
								<p className="text-text-muted" style={{ fontSize: 11, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{t("ai.suggestionsTitle")}</p>
								{STRUG_AI_SUGGESTIONS.map((s, i) => (
									<button key={i} onClick={() => sendMessage(t(s.labelKey))} className="bg-surface border border-border-subtle" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, cursor: "pointer", textAlign: "left", transition: "background 0.12s" }}
										onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-raised)"}
										onMouseLeave={e => e.currentTarget.style.background = "var(--color-surface)"}>
										<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth={1.8} strokeLinecap="round"><path d={s.icon}/></svg>
										<span className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", textDecoration: "none" }}>{t(s.labelKey)}</span>
									</button>
								))}
							</div>
						</>
					) : (
						activeChat?.messages.map((msg, i) => (
							<div key={msg.id} style={{ display: "flex", flexDirection: msg.role === "user" ? "row-reverse" : "row", gap: 10, marginBottom: 16, animation: "fadeUp 0.2s ease both", animationDelay: `${i * 20}ms` }}>
								{msg.role === "ai" && (
									<div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg, #2563eb, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
										<AISparkleIcon s={13} />
									</div>
								)}
								<div style={{ maxWidth: "72%", padding: "10px 14px", borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: msg.role === "user" ? "rgba(37,99,235,0.25)" : "var(--color-surface-raised)", border: "1px solid", borderColor: msg.role === "user" ? "rgba(37,99,235,0.3)" : "var(--color-border-subtle)" }}>
									<p className="text-text-primary" style={{ fontSize: 14, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.55, margin: 0, textDecoration: "none" }}>{msg.content}</p>
								</div>
							</div>
						))
					)}
					{isTyping && (
						<div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
							<div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg, #2563eb, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
								<AISparkleIcon s={13} />
							</div>
							<div className="bg-surface-raised border border-border-subtle" style={{ padding: "10px 16px", borderRadius: "14px 14px 14px 4px", display: "flex", alignItems: "center", gap: 4 }}>
								{[0,1,2].map(i => (
									<div key={i} className="bg-text-muted" style={{ width: 6, height: 6, borderRadius: "50%", animation: "typingDot 1s ease infinite", animationDelay: `${i * 0.2}s` }} />
								))}
							</div>
						</div>
					)}
					<div ref={messagesEndRef} />
				</div>

				{/* Input */}
				<div style={{ padding: "8px 16px 16px", flexShrink: 0 }}>
					<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "10px 12px 8px" }}>
						<textarea ref={textareaRef} value={input} onChange={e => { setInput(e.target.value); autoResize(); }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }}} placeholder={t("ai.messagePlaceholder")} rows={1} className="text-text-primary" style={{ width: "100%", background: "none", border: "none", outline: "none", fontSize: 14, fontFamily: "'DM Sans', sans-serif", resize: "none", caretColor: "#2563eb", lineHeight: 1.5, minHeight: 22, overflow: "hidden" }} />
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
							<div style={{ display: "flex", gap: 4 }}>
								<button className="text-text-secondary" style={{ width: 30, height: 30, borderRadius: 8, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.12s" }} onMouseEnter={e => e.currentTarget.style.color = "var(--color-text-primary)"} onMouseLeave={e => e.currentTarget.style.color = "var(--color-text-muted)"}>
									<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
								</button>
								<button className="text-text-secondary" style={{ width: 30, height: 30, borderRadius: 8, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.12s" }} onMouseEnter={e => e.currentTarget.style.color = "var(--color-text-primary)"} onMouseLeave={e => e.currentTarget.style.color = "var(--color-text-muted)"}>
									<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 2a3 3 0 013 3v7a3 3 0 01-6 0V5a3 3 0 013-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v3M8 22h8"/></svg>
								</button>
							</div>
							<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
								<span className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{t("ai.enterToSend")}</span>
								<button onClick={() => sendMessage()}
									onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.opacity = "1"; }}
									onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.opacity = input.trim() ? "1" : "0.45"; }}
									onMouseDown={e => e.currentTarget.style.transform = "scale(0.88)"}
									onMouseUp={e => e.currentTarget.style.transform = "scale(1.1)"}
									style={{ width: 32, height: 32, borderRadius: 10, background: input.trim() ? "linear-gradient(135deg, #2563eb, #7c3aed)" : "var(--color-surface-raised)", border: "1px solid", borderColor: input.trim() ? "rgba(37,99,235,0.5)" : "var(--color-border)", cursor: input.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.12s, background 0.15s, opacity 0.15s", opacity: input.trim() ? 1 : 0.45 }}>
									{/* Arrow stays white on the active blue-gradient bg but follows the neutral
									    text token on the raised idle bg, so it stays visible in both themes. */}
									<span style={{ color: input.trim() ? "#fff" : "var(--color-text-primary)", fontSize: 16, lineHeight: 1, display: "block" }}>↑</span>
								</button>
							</div>
						</div>
					</div>
					<p className="text-text-muted" style={{ fontSize: 11, textAlign: "center", marginTop: 8, fontFamily: "'DM Sans', sans-serif" }}>{t("ai.disclaimer")}</p>
				</div>
			</div>
		</div>
	);
}

function AIChatRow({ chat, active, onSelect, onDelete, onTogglePin }) {
	const { t } = usePageI18n("ai");
	const [hovered, setHovered] = React.useState(false);
	return (
		<div onClick={onSelect} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, cursor: "pointer", background: active ? "rgba(37,99,235,0.15)" : hovered ? "var(--color-surface-raised)" : "transparent", transition: "background 0.12s", marginBottom: 2 }}>
			<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={active ? "#60a5fa" : "var(--color-text-muted)"} strokeWidth={2} strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
			<span className={active ? "text-text-primary" : "text-text-secondary"} style={{ flex: 1, fontSize: 13, fontFamily: "'DM Sans', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chat.title}</span>
			{(hovered || active) && (
				<div style={{ display: "flex", gap: 2 }} onClick={e => e.stopPropagation()}>
					<button onClick={onTogglePin} title={chat.pinned ? t("ai.unpin") : t("ai.pinChat")} style={{ width: 22, height: 22, borderRadius: 5, background: "none", border: "none", cursor: "pointer", color: chat.pinned ? "#60a5fa" : "var(--color-text-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
						<svg width={11} height={11} viewBox="0 0 24 24" fill={chat.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx={12} cy={10} r={3}/></svg>
					</button>
					<button onClick={onDelete} className="text-text-muted" style={{ width: 22, height: 22, borderRadius: 5, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} onMouseEnter={e => e.currentTarget.style.color = "#ef4444"} onMouseLeave={e => e.currentTarget.style.color = "var(--color-text-muted)"}>
						<svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
					</button>
				</div>
			)}
		</div>
	);
}

export { StrugAIPage, AIChatRow };
