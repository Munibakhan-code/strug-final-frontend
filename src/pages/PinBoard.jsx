import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { PinBoardIcon, SearchIcon } from "../components/icons.jsx";
import { Skel, SkeletonProductCard, SkeletonCircle, SkeletonHeading } from "../components/skeletons.jsx";
import { LeoButton, ODCategoryBubble, clickableProps } from "../components/shared.jsx";
import { getPins, createPin, deletePin, togglePinSave, getSavedPins, getPinComments, addPinComment } from "../api/pins";
import { uploadImage } from "../api/shop";
import { isAuthenticated, getAuthUserId } from "../store/auth";
import { useDialog } from "../components/ConfirmDialog.jsx";
import { timeAgo } from "../utils/time.js";

// Backend pin_comment row -> the comment card shape rendered below.
const COMMENT_COLORS = ["#7c3aed", "#db2777", "#059669", "#d97706", "#0891b2", "#dc2626"];
function mapComment(c) {
	const name = c.author_name || "User";
	return {
		id: c.pin_comment_id,
		user: name,
		avatar: name.slice(0, 2).toUpperCase(),
		color: COMMENT_COLORS[(c.user_id ?? 0) % COMMENT_COLORS.length],
		text: c.body,
		time: c.created_at ? timeAgo(c.created_at) : "just now",
	};
}

// image_url is user-supplied and rendered for every board viewer — only allow
// http(s) (reject javascript:/data:/blob: and anything that fails parsing).
function isSafeHttpUrl(u) {
	try { const p = new URL(u, window.location.origin); return p.protocol === "http:" || p.protocol === "https:"; }
	catch { return false; }
}

// Map a backend pin row -> the board card shape. Real pins carry image_url;
// imgH is derived so the masonry columns keep their varied heights.
function mapPin(p) {
	return {
		id: `db_${p.pin_id}`,
		pin_id: p.pin_id,
		owner_id: p.user_id ?? null,
		title: p.title || "Pin",
		category: p.category || "Home",
		user: p.author_name || "user",
		image_url: isSafeHttpUrl(p.image_url) ? p.image_url : null,
		target_url: p.target_url || null,
		imgH: 150 + ((p.pin_id * 37) % 180),
		gradient: "linear-gradient(160deg, #0f1a2a, #1a2a3a)",
	};
}

const PIN_COMMENTS = [
	{ user: "interior.muse",  avatar: "IM", color: "#7c3aed", text: "Love this aesthetic! Saving for my own project ✨", time: "2h" },
	{ user: "designbydaya",   avatar: "DD", color: "#db2877", text: "Where is this from? The palette is perfect.", time: "4h" },
	{ user: "creativehive_",  avatar: "CH", color: "#059669", text: "The lighting here is everything 🙌", time: "1d" },
	{ user: "moodboardly",    avatar: "MB", color: "#d97706", text: "Just added this to my vision board collection.", time: "2d" },
];

const PINTEREST_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#2563eb", match: null },
	{ id: "fashion", labelKey: "pinboard.categories.fashion", color: "#db2777", match: "Fashion" },
	{ id: "home", labelKey: "pinboard.categories.home", color: "#d97706", match: "Home" },
	{ id: "food", labelKey: "discounts.categories.food", color: "#059669", match: "Food" },
	{ id: "travel", labelKey: "discounts.categories.travel", color: "#0891b2", match: "Travel" },
	{ id: "art", labelKey: "pinboard.categories.art", color: "#7c3aed", match: "Art" },
	{ id: "diy", labelKey: "pinboard.categories.diy", color: "#65a30d", match: "DIY" },
	{ id: "fitness", labelKey: "meet.categories.fitness", color: "#dc2626", match: "Fitness" },
	{ id: "beauty", labelKey: "pinboard.categories.beauty", color: "#f59e0b", match: "Beauty" },
	{ id: "tech", labelKey: "meet.categories.tech", color: "#374151", match: "Tech" },
];

const PINTEREST_PINS = [
	{ id: 1,  title: "Minimal living room inspo",        category: "Home",    user: "interiors.co",  imgH: 220, gradient: "linear-gradient(160deg, #1a1a2a, #0d0d1a)" },
	{ id: 2,  title: "Summer outfit ideas 2024",         category: "Fashion", user: "stylebynia",    imgH: 160, gradient: "linear-gradient(160deg, #2a0a1a, #1c0610)" },
	{ id: 3,  title: "Avocado toast three ways",         category: "Food",    user: "forkful",       imgH: 280, gradient: "linear-gradient(160deg, #0a2a0a, #06180a)" },
	{ id: 4,  title: "Santorini travel guide",           category: "Travel",  user: "wanderlust.k",  imgH: 190, gradient: "linear-gradient(160deg, #0a1a2a, #060f1c)" },
	{ id: 5,  title: "Abstract watercolor techniques",   category: "Art",     user: "brushstroke",   imgH: 240, gradient: "linear-gradient(160deg, #1a0a2a, #10061c)" },
	{ id: 6,  title: "DIY macramé wall hanging",         category: "DIY",     user: "craftclub",     imgH: 170, gradient: "linear-gradient(160deg, #1a2a0a, #0f1806)" },
	{ id: 7,  title: "30-day yoga challenge",            category: "Fitness", user: "zenflow",       imgH: 260, gradient: "linear-gradient(160deg, #2a0a0a, #1c0606)" },
	{ id: 8,  title: "Glass skin routine — 5 steps",    category: "Beauty",  user: "glowup.lab",    imgH: 145, gradient: "linear-gradient(160deg, #2a1a0a, #1c1006)" },
	{ id: 9,  title: "Desk setup 2024 — ultra clean",   category: "Tech",    user: "setupgoals",    imgH: 200, gradient: "linear-gradient(160deg, #0a0a1a, #060610)" },
	{ id: 10, title: "Coastal grandmother aesthetic",    category: "Fashion", user: "linen.life",    imgH: 300, gradient: "linear-gradient(160deg, #0a1a1a, #060f0f)" },
	{ id: 11, title: "Japandi kitchen renovation",       category: "Home",    user: "spaceandform",  imgH: 175, gradient: "linear-gradient(160deg, #1a1a0a, #111106)" },
	{ id: 12, title: "Matcha latte art tutorial",        category: "Food",    user: "café.edit",     imgH: 230, gradient: "linear-gradient(160deg, #0a2a14, #06180c)" },
	{ id: 13, title: "Hidden gems — Kyoto",              category: "Travel",  user: "eastbound",     imgH: 155, gradient: "linear-gradient(160deg, #1a0a1a, #12060f)" },
	{ id: 14, title: "Charcoal portrait study",          category: "Art",     user: "sketchdaily",   imgH: 270, gradient: "linear-gradient(160deg, #0f0f0f, #0a0a0a)" },
	{ id: 15, title: "Upcycled denim jacket",            category: "DIY",     user: "thriftcraft",   imgH: 185, gradient: "linear-gradient(160deg, #0a1a2a, #06101c)" },
	{ id: 16, title: "5-4-3-2-1 HIIT circuit",          category: "Fitness", user: "burnwithme",    imgH: 210, gradient: "linear-gradient(160deg, #1a0a0a, #120606)" },
	{ id: 17, title: "Dewy makeup in 10 minutes",        category: "Beauty",  user: "dewlooks",      imgH: 165, gradient: "linear-gradient(160deg, #1a1a0a, #0f0f06)" },
	{ id: 18, title: "Mechanical keyboard build log",    category: "Tech",    user: "keebstudio",    imgH: 245, gradient: "linear-gradient(160deg, #0a0f1a, #06080f)" },
	{ id: 19, title: "Boho bedroom refresh",             category: "Home",    user: "nestednook",    imgH: 190, gradient: "linear-gradient(160deg, #1a1a0a, #12120a)" },
	{ id: 20, title: "Street style — Paris fashion week",category: "Fashion", user: "rue.style",     imgH: 320, gradient: "linear-gradient(160deg, #0a0a0a, #141414)" },
];

function PinDetailPage({ pin, onBack, onDelete }) {
	const { isMobile } = useViewport();
	// Real (backend) pins carry pin_id; demo PINTEREST_PINS don't — save/comments
	// hit the API only for real pins, otherwise fall back to local demo behaviour.
	const realId = pin.pin_id;
	// Only the pin's owner may delete it (the backend enforces this too).
	const canDelete = !!realId && pin.owner_id != null && pin.owner_id === getAuthUserId();
	const [saved, setSaved] = useState(false);
	const [saveBusy, setSaveBusy] = useState(false);
	const [comment, setComment] = useState("");
	const [comments, setComments] = useState(realId ? [] : PIN_COMMENTS);
	const [posting, setPosting] = useState(false);
	const [liked, setLiked] = useState(false);
	const [followerCount] = useState(() => Math.floor(Math.random() * 900) + 100);
	const relatedPins = PINTEREST_PINS.filter(p => p.id !== pin.id && (p.category === pin.category || Math.abs(p.id - pin.id) <= 3)).slice(0, 6);

	// Load real comments + saved-state for backend pins.
	useEffect(() => {
		if (!realId) return;
		let cancelled = false;
		getPinComments(realId)
			.then(res => { if (!cancelled) setComments((Array.isArray(res) ? res : (res?.data ?? [])).map(mapComment)); })
			.catch(() => {});
		if (isAuthenticated()) {
			getSavedPins()
				.then(res => { if (!cancelled) { const arr = Array.isArray(res) ? res : (res?.data ?? []); setSaved(arr.some(p => p.pin_id === realId)); } })
				.catch(() => {});
		}
		return () => { cancelled = true; };
	}, [realId]);

	async function handleSave() {
		if (!realId) { setSaved(v => !v); return; } // demo pin
		if (!isAuthenticated()) { window.__nav?.("login"); return; }
		if (saveBusy) return;
		const next = !saved;
		setSaved(next);
		setSaveBusy(true);
		try {
			const res = await togglePinSave(realId);
			if (typeof res?.saved === "boolean") setSaved(res.saved);
		} catch { setSaved(!next); }
		finally { setSaveBusy(false); }
	}

	async function handleAddComment() {
		const body = comment.trim();
		if (!body || posting) return;
		if (!realId) { // demo pin — keep local-only behaviour
			setComments(p => [{ user: "you", avatar: "Y", color: "#2563eb", text: body, time: "just now" }, ...p]);
			setComment("");
			return;
		}
		if (!isAuthenticated()) { window.__nav?.("login"); return; }
		setPosting(true);
		try {
			const res = await addPinComment(realId, body);
			const created = res?.data ?? res;
			if (created) setComments(p => [mapComment(created), ...p]);
			setComment("");
		} catch { /* leave input intact so the user can retry */ }
		finally { setPosting(false); }
	}

	return (
		<div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 0 40px" }}>
				<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, padding: 0, marginBottom: 20 }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					{i18n.t("pinboard.backToBoard")}
				</button>
				<div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
					{/* Left: image — pin.gradient is a per-pin decorative thumbnail backdrop (masonry
					    card look, same as PinterestPin below), intentionally kept dark regardless
					    of theme so it reads consistently as a photo-card surface. */}
					<div style={{ flex: "0 0 auto", width: "min(380px, 100%)" }}>
						<div style={{ borderRadius: 20, background: pin.gradient, height: Math.min(480, pin.imgH * 1.5), display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
							{pin.image_url
								? <img loading="lazy" decoding="async" src={pin.image_url} alt={pin.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none"; }} />
								: <PinBoardIcon s={40} />}
						</div>
					</div>
					{/* Right: detail */}
					<div style={{ flex: 1, minWidth: 260 }}>
						{/* Action row */}
						<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
							<button onClick={handleSave} disabled={saveBusy} style={{ padding: "8px 20px", borderRadius: 20, border: "none", background: saved ? "#2563eb" : "var(--color-surface-raised)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: saved ? "#fff" : "var(--color-text-primary)", cursor: saveBusy ? "default" : "pointer", transition: "all 0.15s" }}>{saved ? i18n.t("pinboard.saved") : i18n.t("pinboard.save")}</button>
							<button onClick={() => setLiked(v => !v)} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: liked ? "rgba(239,68,68,0.15)" : "var(--color-surface-raised)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 16 }}>{liked ? "❤️" : "🤍"}</button>
							<button className="bg-surface-raised" style={{ width: 36, height: 36, borderRadius: "50%", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
								<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
							</button>
							{canDelete && (
								<button onClick={() => onDelete?.(pin)} title={i18n.t("common.delete", { defaultValue: "Delete" })} style={{ marginLeft: "auto", width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
									onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.22)"}
									onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,0.12)"}>
									<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
								</button>
							)}
						</div>
						{/* Title */}
						<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, letterSpacing: "0.02em", marginBottom: 8, lineHeight: 1.2 }}>{pin.title}</h2>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 20 }}>{i18n.t("pinboard.savedIn")} <span style={{ color: "#60a5fa" }}>{pin.category}</span></p>
						{/* Creator */}
						<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--color-border-subtle)" }}>
							<div className="bg-surface-raised text-text-primary" style={{ width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{pin.user.slice(0,1).toUpperCase()}</div>
							<div>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13 }}>{pin.user}</p>
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("pinboard.creator")} · {i18n.t("pinboard.followers", { count: followerCount })}</p>
							</div>
							<button className="border border-border text-text-primary" style={{ marginLeft: "auto", padding: "7px 16px", borderRadius: 20, background: "none", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{i18n.t("common.follow")}</button>
						</div>
						{/* Comments */}
						<div style={{ marginBottom: 20 }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 14, letterSpacing: "0.05em", textTransform: "uppercase" }}>{i18n.t("pinboard.comments")}</p>
							{comments.map((c, i) => (
								<div key={i} style={{ display: "flex", gap: 10, marginBottom: 14 }}>
									{/* c.color is always a vivid per-user accent (COMMENT_COLORS), so white stays readable on it in both themes */}
									<div style={{ width: 30, height: 30, borderRadius: "50%", background: c.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "'Barlow Condensed', sans-serif", flexShrink: 0 }}>{c.avatar}</div>
									<div>
										<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
											<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12 }}>{c.user}</span>
											<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10 }}>{c.time}</span>
										</div>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5 }}>{c.text}</p>
									</div>
								</div>
							))}
							{/* Add comment */}
							<div style={{ display: "flex", gap: 8, marginTop: 10 }}>
								<input value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleAddComment(); }} placeholder={i18n.t("pinboard.addComment")} className="border border-border text-text-primary" style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 20, padding: "9px 16px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none" }}
									onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.4)"}
									onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
								<button onClick={handleAddComment} disabled={!comment.trim() || posting} style={{ width: 36, height: 36, borderRadius: "50%", background: (comment.trim() && !posting) ? "#2563eb" : "var(--color-surface-raised)", border: "none", cursor: (comment.trim() && !posting) ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}>
									<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={(comment.trim() && !posting) ? "#fff" : "var(--color-text-primary)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
								</button>
							</div>
						</div>
					</div>
				</div>
				{/* Related pins */}
				{relatedPins.length > 0 && (
					<div style={{ marginTop: 32 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 16, letterSpacing: "0.08em", textTransform: "uppercase" }}>{i18n.t("pinboard.moreLikeThis")}</p>
						<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
							{relatedPins.map(rp => (
								// Mini masonry card, same "always dark" thumbnail treatment as PinterestPin below.
								<div key={rp.id} onClick={() => {}} style={{ width: 150, borderRadius: 12, overflow: "hidden", cursor: "pointer" }}>
									<div style={{ height: rp.imgH * 0.5, background: rp.gradient, minHeight: 80 }} />
									<div style={{ padding: "6px 8px", background: "rgba(20,18,28,0.8)" }}>
										<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.3 }}>{rp.title}</p>
									</div>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function CreatePinModal({ onClose, onCreated }) {
	const [title, setTitle] = useState("");
	const [desc, setDesc] = useState("");
	const [imageUrl, setImageUrl] = useState("");
	const [category, setCategory] = useState("Home");
	const [submitting, setSubmitting] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [err, setErr] = useState(null);
	const fileInputRef = useRef(null);
	const ready = title.trim().length > 0;

	async function handleFile(e) {
		const file = e.target.files?.[0];
		e.target.value = ""; // allow re-picking the same file
		if (!file) return;
		if (!file.type.startsWith("image/")) { setErr("Please choose an image file."); return; }
		if (file.size > 20 * 1024 * 1024) { setErr("Image must be under 20MB."); return; }
		setUploading(true); setErr(null);
		try {
			const res = await uploadImage(file);
			if (res?.url) setImageUrl(res.url);
			else setErr("Upload failed — no URL returned.");
		} catch {
			setErr("Upload failed. Please try again.");
		} finally {
			setUploading(false);
		}
	}

	async function submit() {
		if (!ready || submitting) return;
		if (imageUrl.trim() && !isSafeHttpUrl(imageUrl.trim())) { setErr("Image URL must be a valid http(s) link."); return; }
		setSubmitting(true); setErr(null);
		try {
			const res = await createPin({ title: title.trim(), description: desc.trim(), category, image_url: imageUrl.trim() });
			const pin = res?.data ?? res;
			onCreated(pin);
		} catch (e) {
			setErr(e?.response?.data?.message || "Could not publish your pin. Please try again.");
			setSubmitting(false);
		}
	}

	return (
		<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
			onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
			<div className="bg-surface border border-border" style={{ borderRadius: 20, padding: 28, width: "min(480px, 100%)", maxHeight: "90vh", overflowY: "auto" }}>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
					<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 24 }}>{i18n.t("pinboard.createPin")}</h2>
					<button onClick={onClose} className="bg-surface-raised text-text-secondary" style={{ width: 32, height: 32, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>×</button>
				</div>
				{/* Image preview + URL */}
				<input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
				<div onClick={() => !uploading && fileInputRef.current?.click()} {...clickableProps(() => { if (!uploading) fileInputRef.current?.click(); })} aria-label="Upload image"
					style={{ height: 160, borderRadius: 14, border: "2px dashed var(--color-border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12, background: "rgba(255,255,255,0.02)", overflow: "hidden", position: "relative", cursor: uploading ? "default" : "pointer" }}>
					{isSafeHttpUrl(imageUrl.trim()) && <img src={imageUrl.trim()} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
					{uploading
						? <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, position: "relative" }}>Uploading…</p>
						: !isSafeHttpUrl(imageUrl.trim()) && <>
							<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("pinboard.uploadImage")}</p>
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("pinboard.uploadHint")}</p>
						</>}
				</div>
				<div style={{ marginBottom: 14 }}>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Or paste an image URL</p>
					<input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://…/image.jpg"
						className="border border-border text-text-primary"
						style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none" }}
						onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.4)"}
						onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
				</div>
				{[{ label: i18n.t("pinboard.fieldTitle"), val: title, set: setTitle, placeholder: i18n.t("pinboard.titlePlaceholder") }, { label: i18n.t("pinboard.fieldDescription"), val: desc, set: setDesc, placeholder: i18n.t("pinboard.descPlaceholder") }].map(f => (
					<div key={f.label} style={{ marginBottom: 14 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginBottom: 6 }}>{f.label}</p>
						<input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
							className="border border-border text-text-primary"
							style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none" }}
							onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.4)"}
							onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
					</div>
				))}
				<div style={{ marginBottom: 20 }}>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginBottom: 6 }}>{i18n.t("pinboard.category")}</p>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						{["Home", "Fashion", "Food", "Travel", "Art", "DIY", "Fitness", "Beauty", "Tech"].map(c => (
							<button key={c} onClick={() => setCategory(c)} style={{ padding: "5px 12px", borderRadius: 16, border: `1px solid ${category === c ? "#2563eb" : "var(--color-border)"}`, background: category === c ? "rgba(37,99,235,0.15)" : "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: category === c ? "#93c5fd" : "var(--color-text-secondary)", cursor: "pointer", transition: "all 0.15s" }}>{c}</button>
						))}
					</div>
				</div>
				{err && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 10 }}>{err}</p>}
				<button onClick={submit} disabled={!ready || submitting || uploading}
					style={{ width: "100%", background: submitting ? "#059669" : (ready && !uploading) ? "#2563eb" : "var(--color-surface-raised)", border: "none", borderRadius: 12, padding: "13px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: (ready && !uploading) ? "#fff" : "var(--color-text-muted)", cursor: (ready && !uploading) ? "pointer" : "default", transition: "all 0.2s" }}>
					{submitting ? i18n.t("pinboard.publishing") : uploading ? "Uploading image…" : i18n.t("pinboard.publishPin")}
				</button>
			</div>
		</div>
	);
}

// Masonry photo/gradient card — kept dark regardless of theme (same call as
// HubCategoryCard's thumbnail tiles) since it's a photo surface with white overlay
// text/chips that need to read over an image or dark gradient, not the page background.
function PinterestPin({ pin, onOpen, onDelete, myId }) {
	const [saved, setSaved] = useState(false);
	const [hov, setHov] = useState(false);
	const initials = pin.user.slice(0, 1).toUpperCase();
	const canDelete = !!pin.pin_id && pin.owner_id != null && pin.owner_id === myId;
	return (
		<div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={() => onOpen && onOpen(pin)}
			style={{ borderRadius: 14, overflow: "hidden", background: "rgba(20,18,28,0.7)", marginBottom: 10, cursor: "pointer", position: "relative", flexShrink: 0 }}>
			<div style={{ height: pin.imgH, background: pin.gradient, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
				{pin.image_url
					? <img src={pin.image_url} alt="" loading="lazy" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
					: <PinBoardIcon s={24} />}
				{hov && canDelete && (
					<button onClick={e => { e.stopPropagation(); onDelete?.(pin); }} title={i18n.t("common.delete", { defaultValue: "Delete" })} style={{
						position: "absolute", top: 8, left: 8,
						background: "rgba(0,0,0,0.55)", border: "none", borderRadius: "50%",
						width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
						cursor: "pointer",
					}}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
					</button>
				)}
				{hov && (
					<button onClick={e => { e.stopPropagation(); setSaved(v => !v); }} style={{
						position: "absolute", top: 8, right: 8,
						background: saved ? "#2563eb" : "rgba(255,255,255,0.93)",
						border: "none", borderRadius: 20, padding: "5px 12px",
						color: saved ? "#fff" : "#000",
						fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12,
						cursor: "pointer",
					}}>
						{saved ? i18n.t("pinboard.saved") : i18n.t("pinboard.save")}
					</button>
				)}
			</div>
			{hov && (
				<div style={{ padding: "8px 10px 10px" }}>
					<p style={{ fontSize: 12, fontWeight: 600, color: "#fff", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4, marginBottom: 6 }}>{pin.title}</p>
					<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
						<div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
							<span style={{ fontSize: 9, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{initials}</span>
						</div>
						<span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif" }}>{pin.user}</span>
					</div>
				</div>
			)}
		</div>
	);
}

function PinScrollColumn({ pins, direction, speed, onOpen, onDelete, myId }) {
	const doubled = [...pins, ...pins];
	return (
		<div style={{ flex: 1, overflow: "hidden", minWidth: 0 }}>
			<div className={direction === "up" ? "pin-col-up" : "pin-col-down"} style={{ "--spd": speed, display: "flex", flexDirection: "column", gap: 10 }}>
				{doubled.map((pin, i) => <PinterestPin key={i} pin={pin} onOpen={onOpen} onDelete={onDelete} myId={myId} />)}
			</div>
		</div>
	);
}

function PinBoardPage() {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("pinboard");
	const categories = useI18nCategoryList(PINTEREST_CATEGORY_DEFS);
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [activeCategory, setActiveCategory] = useState("All");
	const [query, setQuery] = useState("");
	const [autoScroll, setAutoScroll] = useState(true);
	const [selectedPin, setSelectedPin] = useState(null);
	const [createOpen, setCreateOpen] = useState(false);
	const [dbPins, setDbPins] = useState([]);
	const [pinDialog, { confirm, notify }] = useDialog();
	const myId = getAuthUserId();
	useEffect(() => {
		getPins().then((res) => {
			const arr = Array.isArray(res) ? res : (res?.data ?? []);
			setDbPins(arr.map(mapPin));
		}).catch(() => {});
	}, []);

	// Delete one of the caller's own pins (the backend re-checks ownership).
	async function handleDeletePin(pin) {
		if (!pin?.pin_id) return;
		const ok = await confirm({
			title: i18n.t("pinboard.deleteTitle", { defaultValue: "Delete this pin?" }),
			message: i18n.t("pinboard.deleteConfirm", { defaultValue: "This permanently removes your pin. This can’t be undone." }),
			confirmLabel: i18n.t("common.delete", { defaultValue: "Delete" }),
		});
		if (!ok) return;
		try {
			await deletePin(pin.pin_id);
			setDbPins((prev) => prev.filter((p) => p.pin_id !== pin.pin_id));
			setSelectedPin((cur) => (cur?.pin_id === pin.pin_id ? null : cur));
		} catch {
			notify({ title: i18n.t("dialog.notice"), message: i18n.t("pinboard.deleteFailed", { defaultValue: "Couldn’t delete the pin. Please try again." }) });
		}
	}
	const catScrollRef = useRef(null);
	const [catScrollState, setCatScrollState] = useState({ atStart: true, atEnd: true });
	useLayoutEffect(() => {
		const el = catScrollRef.current;
		if (!el) return;
		const update = () => setCatScrollState(prev => { const atStart = el.scrollLeft <= 4, atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4; return prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }; });
		update();
		el.addEventListener("scroll", update, { passive: true });
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
	}, [autoScroll]);
	const allPins = [...dbPins, ...PINTEREST_PINS];
	const filtered = allPins.filter(p => {
		const matchCat = matchesCategory(activeCategory, p.category, categories);
		const matchQ = !query || p.title.toLowerCase().includes(query.toLowerCase());
		return matchCat && matchQ;
	});
	// Distribute pins across columns (2 on mobile, 4 on desktop)
	const numCols = isMobile ? 2 : 4;
	const cols = Array.from({ length: numCols }, () => []);
	filtered.forEach((pin, i) => cols[i % numCols].push(pin));
	const speeds = isMobile ? ["28s", "36s"] : ["28s", "36s", "24s", "32s"];
	const directions = isMobile ? ["up", "down"] : ["up", "down", "up", "down"];

	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [autoScroll]);

	if (selectedPin) return <>{pinDialog}<PinDetailPage pin={selectedPin} onBack={() => setSelectedPin(null)} onDelete={handleDeletePin} /></>;

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ paddingTop: 28, paddingBottom: 16 }}>
				<SkeletonHeading />
				<Skel w="min(560px, 100%)" h={44} r={12} style={{ margin: "16px auto" }} />
				<div style={{ display: "flex", gap: 20, marginTop: 16, justifyContent: "center" }}>
					{[...Array(7)].map((_,i) => <SkeletonCircle key={i} />)}
				</div>
			</div>
			<div style={{ flex: 1, display: "flex", gap: 10, overflow: "hidden" }}>
				{[...Array(4)].map((_,col) => (
					<div key={col} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
						{[...Array(3)].map((_,i) => <Skel key={i} w="100%" h={col % 2 === 0 ? 180 : 140} r={12} />)}
					</div>
				))}
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			{pinDialog}
			{createOpen && <CreatePinModal onClose={() => setCreateOpen(false)} onCreated={newPin => { if (newPin?.pin_id) setDbPins(p => [mapPin(newPin), ...p]); setCreateOpen(false); }} />}
			{/* Header */}
			<div style={{ paddingTop: 28, paddingBottom: 16, flexShrink: 0, animation: "fadeUp 0.3s ease both" }}>
				{/* Row 1: title + create + toggle */}
				<div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, justifyContent: "center" }}>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase" }}>{landingTitle}</h1>
					<button onClick={() => setCreateOpen(true)} style={{ display: "flex", alignItems: "center", gap: 7, background: "#2563eb", border: "none", borderRadius: 20, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, padding: "8px 18px", cursor: "pointer", flexShrink: 0 }}>
						<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
						Create Post
					</button>
					<div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.05)", borderRadius: 20, padding: 3, gap: 2, flexShrink: 0 }}>
						<button onClick={() => setAutoScroll(true)} className={autoScroll ? "text-text-primary" : "text-text-secondary"} style={{ padding: "5px 12px", borderRadius: 18, border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, background: autoScroll ? "var(--color-surface-raised)" : "transparent", transition: "all 0.15s" }}>{t("pinboard.auto")}</button>
						<button onClick={() => setAutoScroll(false)} className={!autoScroll ? "text-text-primary" : "text-text-secondary"} style={{ padding: "5px 12px", borderRadius: 18, border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, background: !autoScroll ? "var(--color-surface-raised)" : "transparent", transition: "all 0.15s" }}>{i18n.t("social.browse")}</button>
					</div>
				</div>
				{/* Row 2: search bar */}
				<div className="od-search-wrap" style={{ width: "min(560px, 100%)", margin: "0 auto 16px" }}>
					<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "11px 16px", gap: 10 }}>
						<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={16} /></div>
						<input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 14, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} />
					</div>
				</div>
				{/* Row 3: category circles with arrows */}
				<div style={{ display: "flex", alignItems: "flex-start", gap: 10, animation: "fadeUp 0.3s ease 60ms both" }}>
					<button onClick={() => catScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })}
						className={catScrollState.atStart ? "bg-surface border border-border-subtle text-text-muted" : "bg-surface-raised border border-border text-text-primary"}
						style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, cursor: catScrollState.atStart ? "default" : "pointer", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.12s, background 0.2s" }}
						onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					</button>
					<div ref={catScrollRef} className="ecom-cat-scroll" style={{ flex: 1, display: "flex", gap: 16, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none", justifyContent: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "center" : "flex-start" }}>
						{categories.map((cat, i) => <LeoButton key={cat.id} cat={cat} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 20} />)}
					</div>
					<button onClick={() => catScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
						style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: catScrollState.atEnd ? "var(--color-surface)" : "#2563eb", border: `1px solid ${catScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`, color: catScrollState.atEnd ? "var(--color-text-muted)" : "#fff", cursor: catScrollState.atEnd ? "default" : "pointer", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: catScrollState.atEnd ? "none" : "0 2px 14px rgba(37,99,235,0.55)", transition: "transform 0.12s, background 0.2s" }}
						onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</button>
				</div>
			</div>
			{/* Columns */}
			{autoScroll ? (
				<div style={{ flex: 1, display: "flex", gap: 10, overflow: "hidden" }}>
					{cols.map((colPins, i) => colPins.length > 0 ? (
						<PinScrollColumn key={i} pins={colPins} direction={directions[i]} speed={speeds[i]} onOpen={setSelectedPin} onDelete={handleDeletePin} myId={myId} />
					) : null)}
				</div>
			) : (
				<div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 24 }}>
					<div style={{ columnCount: isMobile ? 2 : 4, columnGap: 10 }}>
						{filtered.map((pin) => <PinterestPin key={pin.id} pin={pin} onOpen={setSelectedPin} onDelete={handleDeletePin} myId={myId} />)}
					</div>
				</div>
			)}
		</div>
	);
}

export { PinBoardPage };
