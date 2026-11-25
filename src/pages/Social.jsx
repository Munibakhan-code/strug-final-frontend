import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import i18n from "../i18n/index.js";
import ReportModal from "../components/ReportModal.jsx";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { loadHls } from "../utils/livePlayback.js";
import { useViewport } from "../hooks/useViewport.js";
import { useSplitMode } from "../contexts/SplitModeContext.js";
import {
	SkeletonTownHallFeed,
	SkeletonTownHallReply,
	SkeletonTownHallDetail,
	SkeletonTownHallVoice,
	SkeletonTownHallTopic,
	SkeletonTownHallSuggestedCard,
	SkeletonSearchRow,
} from "../components/skeletons.jsx";
import { useDialog } from "../components/ConfirmDialog.jsx";
import { getUser } from "../store/auth";
import { getLiveSessions } from "../api/live";
import { addInteraction, searchContent, getTrendingTags, toggleFollowByUserId, getFollowing, getFollowCounts, blockUser, muteUser, reportProfile } from "../api/social";
import { isViewingChatChannel } from "../utils/chatViewing.js";
import { subscribeChatEvents } from "../api/chatSocket.js";
import { connectSocket } from "../api/socket.js";
import { toggleTownHallRepost, createTownHallPost, createTownHallPostWithMedia, createTownHallPostFull, uploadTownHallMedia, getTownHallFeed, getTownHallFollowing, toggleTownHallLike, getTownHallReplies, deleteTownHallPost, viewTownHallPost, getTownHallPost, getTownHallPostPublic, getTownHallTrending, getTownHallSpotlight, toggleSavePost, getSavedPosts, searchTownHallPosts, voteTownHallPoll, getTownHallVoicesToFollow, getTownHallTrendingTopics, getTownHallQuotes, startTownhallImport, getTownhallImport } from "../api/townhall";
import { formatTownhallImportStatus, normalizeTwitterSourceUrl } from "../utils/twitterSource.js";
import { timeAgo } from "../utils/time.js";
import { mapTownHallPoll, quotedPostApiId, townHallFollowLabel } from "../utils/townHallPostMap.js";
import VerificationBadge from "../components/VerificationBadge.jsx";
import { Avatar, SafeImage } from "../components/SafeImage.jsx";
import { clickableProps, Tooltip, ExpandableText } from "../components/shared.jsx";
import { trackAdEvent } from "../api/ads";
import { RecordVideoTrigger } from "../components/InAppCameraModal.jsx";
import { filterSavedTownHallPosts } from "../utils/savedTownHallGrid.js";

// Board #457/#453: a large number of media/profile rows point at Azure blobs that were purged and
// now 404. Any bare <img> renders the browser's broken-image icon. Avatars fall back to initials via
// <Avatar>; post/comment media falls back to this neutral tile via <SafeImage fallback={...}>.
// Deliberately dark regardless of theme — this tile stands in for photo/video media (rule 3),
// so it should read the same as the media it is replacing rather than following the page theme.
function MediaPlaceholder({ style }) {
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#0d1421", ...style }}>
			<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
				<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
			</svg>
		</div>
	);
}

// #483: feed captions used to render in full, flooding the timeline with long posts.
// Collapse anything past 3 lines behind a Strug-style accent pill — ExpandableText
// owns the clamp/measure so white-space:pre-wrap cannot defeat -webkit-line-clamp.
function PostCaption({ text, onOpen, adMode, mb = 12 }) {
	return (
		<ExpandableText
			text={text}
			onOpen={!adMode ? onOpen : undefined}
			lines={3}
			mb={mb}
			className="text-text-primary"
			style={{ fontSize: 14, lineHeight: 1.6 }}
		/>
	);
}

// Sponsored-post CTA label per backend cta_text enum.
const AD_CTA_LABELS = { LEARN_MORE: "Learn More", SHOP_NOW: "Shop Now", BOOK_NOW: "Book Now", ORDER_NOW: "Order Now", SUBSCRIBE: "Subscribe" };

// Advertiser-controlled target_url is rendered into an href for other users, so
// only allow http(s) — reject javascript:/data:/vbscript:/file:/blob: (XSS).
function isSafeHttpUrl(u) {
	try { const p = new URL(u, window.location.origin); return p.protocol === "http:" || p.protocol === "https:"; }
	catch { return false; }
}

const SOCIAL_TABS = [
	{ id: "home",      label: i18n.t("pinboard.categories.home"),      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
	{ id: "following", label: i18n.t("videos.following"), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg> },
	{ id: "explore",   label: i18n.t("social.explore"),   icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> },
	{ id: "trending",  label: i18n.t("videos.trending"),  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> },
	{ id: "saved",     label: i18n.t("social.saved"),     icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> },
];

const SORT_OPTIONS = [
	{ id: "recent",  label: i18n.t("social.sortMostRecent"),  days: null, order: "desc" },
	{ id: "2weeks",  label: i18n.t("social.sortLast2Weeks"), days: 14,   order: "desc" },
	{ id: "month",   label: i18n.t("social.sortLastMonth"),   days: 30,   order: "desc" },
	{ id: "oldest",  label: i18n.t("social.sortOldestFirst"), days: null, order: "asc" },
];

/* ── Saved Posts Grid ── */
function SavedGrid({ posts, onViewPost }) {
	const [filter, setFilter] = useState("all");
	const filtered = filterSavedTownHallPosts(posts, filter);
	return (
		<div style={{ paddingBottom: 24 }}>
			<div style={{ padding: "20px 16px 14px", textAlign: "center" }}>
				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>{i18n.t("social.saved")}</h2>
			</div>
			<div style={{ display: "flex", gap: 8, padding: "0 16px 16px", justifyContent: "center", flexWrap: "wrap" }}>
				{[
					{ id: "all", label: i18n.t("events.categories.all") },
					{ id: "post", label: i18n.t("social.post") },
					{ id: "photo", label: i18n.t("messages.photo") },
					{ id: "video", label: i18n.t("messages.video") },
				].map(f => (
					<button key={f.id} onClick={() => setFilter(f.id)} className={`${filter === f.id ? "text-text-primary" : "text-text-secondary"}`} style={{ padding: "6px 20px", borderRadius: 20, border: `1.5px solid ${filter === f.id ? "var(--color-text-primary)" : "var(--color-border)"}`, background: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
						{f.label}
					</button>
				))}
			</div>
			{filtered.length === 0 ? (
				<div className="text-text-muted" style={{ textAlign: "center", padding: "60px 20px", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
					{posts.length === 0 ? i18n.t("social.bookmarkHint") : i18n.t("social.noSavedFilterMatch")}
				</div>
			) : (
				<div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
					{/* Grid tiles (photo/video thumbnails, and text-only posts rendered as a gradient tile) stay
					    dark regardless of theme — this is a photo-grid, so every tile reads as a "media" tile. */}
					{filtered.map(p => (
						<div key={p.id} onClick={() => onViewPost && onViewPost(p)} {...clickableProps(() => onViewPost && onViewPost(p))} aria-label={p.text ? `View post: ${p.text.slice(0, 60)}` : "View post"} style={{ position: "relative", paddingBottom: "125%", cursor: "pointer", overflow: "hidden", background: "#0d1421" }}>
							{p.media_url ? (
								p.media_type === "video"
									? <video src={p.media_url} muted playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
									: <SafeImage loading="lazy" decoding="async" src={p.media_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
										fallback={<MediaPlaceholder style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />} />
							) : (
								<div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${p.avatarColor ?? "#2563eb"}28, #0d1421)`, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 8 }}>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, lineHeight: 1.4, margin: 0, display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.text}</p>
								</div>
							)}
							{p.media_type === "video" && (
								<div style={{ position: "absolute", top: 5, right: 5, pointerEvents: "none" }}>
									<svg width={13} height={13} viewBox="0 0 24 24" fill="#fff" opacity={0.9}><polygon points="5,3 19,12 5,21"/></svg>
								</div>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function fmtViews(n) {
	if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
	if (n >= 1000)    return (n / 1000).toFixed(1)    + "K";
	return String(n);
}

// The API sends a post's view tally two ways, and they do not always agree:
//   view_count    — the counter column POST /town-hall/:id/view increments, and the one
//                   /social-profile/:id/most-viewed ranks on. This is the real number.
//   _count.views  — how many rows exist in town_hall_post_view (one per user, ever).
// A post can have a view_count with no per-user rows behind it, in which case _count.views is 0.
// Reading _count first was `0 ?? view_count` — and `??` does NOT fall through a literal 0 — so
// every post rendered "0 views" while the API was reporting hundreds (#433). Take the larger of
// the two: the counter is authoritative and can never legitimately be below the row count.
function postViews(p) {
	return Math.max(Number(p?.view_count ?? 0) || 0, Number(p?._count?.views ?? 0) || 0);
}


function townhallAuthorId(p) {
	return p?.author_user_id ?? p?.user_id ?? null;
}

/** Numeric Town Hall post id for API calls. Repost feed cards use id like `repost_9` — never send that. */
function townHallApiId(p) {
	const raw = p?._repostOf ?? p?.post_id ?? p?.id;
	if (raw == null) return null;
	const n = typeof raw === "number" ? raw : parseInt(String(raw).replace(/^repost_/, ""), 10);
	return Number.isInteger(n) && n > 0 ? n : null;
}

function isOwnTownHallRepost(p, myUserId) {
	if (!p) return false;
	if (p._repostBy === "You") return true;
	if (myUserId != null && p._repostUserId != null && String(p._repostUserId) === String(myUserId)) return true;
	return false;
}

function townHallRepostLabel(post, { viewerId, viewerReposted } = {}) {
	const ownRow = isOwnTownHallRepost(post, viewerId);
	if (post?._repostBy && !ownRow) return `${post._repostBy} ${i18n.t("social.repostedVerb", "reposted")}`;
	if (ownRow || viewerReposted) return i18n.t("social.youReposted", "You reposted");
	return null;
}

/** Drop "You reposted" copies when the original is already in the list (or keep a single self-repost). */
function foldSelfReposts(list, myUserId) {
	if (!Array.isArray(list) || list.length === 0) return list;
	const originalIds = new Set();
	for (const p of list) {
		if (p?._repostBy || p?._repostUserId) continue;
		const id = townHallApiId(p);
		if (id != null) originalIds.add(String(id));
	}
	const seenSelf = new Set();
	return list.filter(p => {
		if (!isOwnTownHallRepost(p, myUserId)) return true;
		const id = townHallApiId(p);
		if (id == null) return true;
		const key = String(id);
		if (originalIds.has(key) || seenSelf.has(key)) return false;
		seenSelf.add(key);
		return true;
	});
}

function goToTownhallProfile(p) {
	try {
		const id = townhallAuthorId(p);
		if (id != null) window.__profileTargetId = id;
		if (window.__nav) window.__nav("profile");
	} catch { /* noop */ }
}

// #355 / #370: immersive fullscreen player for a single town-hall video on mobile.
// Renders a fixed black overlay (portaled to body) with native controls so users can
// scrub/seek freely (#370: inline mobile controls were too cramped to skip ahead).
// Hides the app's mobile bottom nav while open (matches ShortsPlayer's immersive event),
// and exits via the Close button, a downward swipe, or Escape.
function FullscreenVideoOverlay({ src, hlsUrl, poster, onClose }) {
	const touchStartY = useRef(null);
	// #415: on mobile THIS is where the video is actually watched (the tile behind it is only a
	// preview), so the fullscreen player must use the transcoded rendition too — otherwise the
	// mobile win is lost and it still streams the raw upload.
	const videoRef = useRef(null);
	useEffect(() => {
		const el = videoRef.current;
		if (!el) return undefined;
		let hls = null;
		let cancelled = false;
		loadHls().then((Hls) => {
			if (cancelled || !el) return;
			if (hlsUrl && Hls.isSupported()) {
				hls = new Hls({ startFragPrefetch: true, maxBufferLength: 30, startLevel: -1, capLevelToPlayerSize: true });
				hls.loadSource(hlsUrl);
				hls.attachMedia(el);
			} else {
				el.src = (hlsUrl && el.canPlayType("application/vnd.apple.mpegurl")) ? hlsUrl : src;
			}
			el.play().catch(() => { /* user can press play */ });
		});
		return () => { cancelled = true; if (hls) hls.destroy(); };
	}, [src, hlsUrl]);
	const [dragY, setDragY] = useState(0);
	const [dragging, setDragging] = useState(false);

	// Hide the app's mobile bottom nav while immersive (same signal ShortsPlayer uses).
	useEffect(() => {
		window.dispatchEvent(new CustomEvent("strug:immersive-media", { detail: true }));
		return () => window.dispatchEvent(new CustomEvent("strug:immersive-media", { detail: false }));
	}, []);

	// Escape closes.
	useEffect(() => {
		const onKey = (e) => { if (e.key === "Escape") onClose(); };
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return createPortal(
		<div
			style={{ position: "fixed", inset: 0, background: "#000", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragging ? "none" : "transform 0.2s ease" }}
			onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; setDragging(true); }}
			onTouchMove={(e) => { if (touchStartY.current != null) { const dy = e.touches[0].clientY - touchStartY.current; if (dy > 0) setDragY(dy); } }}
			onTouchEnd={() => { if (dragY > 110) onClose(); else setDragY(0); touchStartY.current = null; setDragging(false); }}
		>
			<button onClick={onClose} aria-label="Close video" style={{ position: "absolute", top: 20, left: 16, zIndex: 210, display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 20, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
				<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				Close
			</button>
			<video ref={videoRef} controls autoPlay playsInline poster={poster || undefined}
				// The fullscreen player joins the same one-at-a-time rule (#420).
				onPlay={(e) => playExclusively(e.currentTarget)}
				// Keep touches on the video with the native controls (scrub) instead of the
				// swipe-to-close gesture, which lives on the surrounding black margins.
				onTouchStart={(e) => e.stopPropagation()}
				onClick={(e) => e.stopPropagation()}
				style={{ maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain", background: "#000" }} />
		</div>,
		document.body
	);
}

// #420: exactly ONE town-hall video plays at a time, and it is the one most in view.
//
// Each video observing itself independently does NOT work: when two posts are both on screen,
// each one's observer pauses the other's *pending* play() and BOTH end up paused
// ("AbortError: The play() request was interrupted by a call to pause()"). So the observers only
// record visibility here, and a single coalesced pass picks one winner per frame.
//
// It also can't be the old `document.querySelectorAll("video")` sweep, which skipped anything
// muted — autoplayed video MUST be muted, so that sweep would have become a no-op the moment
// autoplay landed and every visible post would have played at once.
const townHallInView = new Map(); // <video> -> intersectionRatio
let townHallPlaying = null;
let reconcileQueued = false;

function reconcileTownHallPlayback() {
	reconcileQueued = false;
	let best = null;
	let bestRatio = 0;
	for (const [el, ratio] of townHallInView) {
		if (ratio > bestRatio) { best = el; bestRatio = ratio; }
	}
	// Stop whatever was playing if it is no longer the winner.
	if (townHallPlaying && townHallPlaying !== best) {
		try { townHallPlaying.pause(); } catch { /* detached */ }
	}
	townHallPlaying = best;
	if (!best || !best.paused) return;
	// Never re-mute someone who deliberately turned the sound on — they may scroll the post
	// half out of view and back, which re-fires the observer.
	if (!best.dataset.unmuted) best.muted = true;
	best.play().catch(() => { /* autoplay can still be refused; leave it paused */ });
}

function queueReconcile() {
	if (reconcileQueued) return;
	reconcileQueued = true;
	requestAnimationFrame(reconcileTownHallPlayback);
}

// A user pressing play on any video wins outright over the scroll-picked one.
function playExclusively(el) {
	if (townHallPlaying && townHallPlaying !== el) {
		try { townHallPlaying.pause(); } catch { /* detached */ }
	}
	townHallPlaying = el;
}

// #420 autoplay-in-view + #415 lazy source.
// Every town-hall video used to carry its `src` from mount, so a feed with N video posts fired
// N media requests immediately and they all competed for bandwidth. Town-hall media is the
// ORIGINAL upload — there is no HLS rendition and no poster frame to show meanwhile — so not
// fetching a video until it is actually wanted is the biggest start-up win available on the
// client, and it is a large part of why videos were slow to load and buffer.
function useAutoplayInView(src, hlsUrl) {
	const ref = useRef(null);
	const hlsRef = useRef(null);
	useEffect(() => {
		const el = ref.current;
		if (!el) return undefined;
		// #415: prefer the transcoded HLS rendition. Town hall posts used to play the ORIGINAL
		// upload (up to 50MB, no bitrate ladder, no poster), which is why they were slow to start
		// and buffered. hls_url only appears once the worker has finished, so a post that is still
		// transcoding — or one uploaded before the pipeline existed — falls back to media_url and
		// behaves exactly as it does today.
		const attach = () => {
			if (el.src || hlsRef.current) return;
			loadHls().then((Hls) => {
				if (el.src || hlsRef.current) return;
				if (hlsUrl && Hls.isSupported()) {
					const hls = new Hls({ startFragPrefetch: true, maxBufferLength: 30, startLevel: -1, capLevelToPlayerSize: true });
					hlsRef.current = hls;
					hls.loadSource(hlsUrl);
					hls.attachMedia(el);
				} else if (hlsUrl && el.canPlayType("application/vnd.apple.mpegurl")) {
					el.src = hlsUrl;
				} else if (src) {
					el.src = src;
				}
			});
		};
		const io = new IntersectionObserver(([entry]) => {
			if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
				attach(); // fetch only now
				townHallInView.set(el, entry.intersectionRatio);
			} else {
				townHallInView.delete(el);
				if (!el.paused) { try { el.pause(); } catch { /* detached */ } }
			}
			queueReconcile();
		}, { threshold: [0, 0.5, 0.75, 1] });
		io.observe(el);
		return () => {
			io.disconnect();
			townHallInView.delete(el);
			if (townHallPlaying === el) townHallPlaying = null;
			try { el.pause(); } catch { /* detached */ }
			if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
		};
	}, [src, hlsUrl]);
	return ref;
}

// #355: a town-hall video. On desktop it stays an inline <video controls>. On mobile it renders
// a tappable preview with a play badge that opens FullscreenVideoOverlay. Both autoplay while
// they are the video in view (#420) and only load their source at that point (#415).
function TownHallVideo({ src, hlsUrl, poster, style }) {
	const { isMobile } = useViewport();
	const [fs, setFs] = useState(false);
	// don't also play the tile behind the fullscreen overlay
	const videoRef = useAutoplayInView(fs ? null : src, fs ? null : hlsUrl);

	if (isMobile) {
		return (
			<>
				<div onClick={() => setFs(true)} {...clickableProps(() => setFs(true))} aria-label={i18n.t("social.expandVideo", { defaultValue: "Play video fullscreen" })} style={{ position: "relative", cursor: "pointer", width: "100%", aspectRatio: "1 / 1", maxHeight: 480, borderRadius: 8, overflow: "hidden", background: "#000", marginTop: style?.marginTop, marginBottom: style?.marginBottom ?? 12 }}>
					<video ref={videoRef} muted loop playsInline preload="none" poster={poster || undefined} tabIndex={-1} style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
					<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.18)" }}>
						<div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.25)" }}>
							<svg width={22} height={22} viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 3 }}><path d="M8 5v14l11-7z"/></svg>
						</div>
					</div>
				</div>
				{fs && <FullscreenVideoOverlay src={src} hlsUrl={hlsUrl} poster={poster} onClose={() => setFs(false)} />}
			</>
		);
	}

	return (
		<video
			ref={videoRef}
			controls
			playsInline
			muted
			preload="none"
			poster={poster || undefined}
			// Remember an intentional unmute so scrolling the post out and back doesn't silence it.
			onVolumeChange={(e) => { if (!e.currentTarget.muted) e.currentTarget.dataset.unmuted = "1"; }}
			// Pressing play on any video — autoplayed or not — stops whichever one was playing.
			onPlay={(e) => playExclusively(e.currentTarget)}
			style={style}
		/>
	);
}

function ReplyModal({ post, onClose, onSubmit }) {
	const [text, setText] = useState("");
	const [mediaFile, setMediaFile] = useState(null);
	const fileRef = useRef(null);
	const max = 280;
	const me = getUser();
	// Media-only replies are allowed (#431) — same rule as the post composer.
	const canReply = !!text.trim() || !!mediaFile;
	const previewUrl = useMemo(() => mediaFile ? URL.createObjectURL(mediaFile) : null, [mediaFile]);
	useEffect(() => { return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }; }, [previewUrl]);

	return createPortal((
		<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 150, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 60 }}
			onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
			<div className="bg-surface-raised border border-border" style={{ width: "min(600px, 95vw)", borderRadius: 20, padding: 24, animation: "fadeUp 0.2s ease both", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
					<button onClick={onClose} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
					<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700 }}>{i18n.t("common.reply")}</span>
					<div style={{ width: 30 }} />
				</div>
				{/* Original post preview */}
				<div style={{ display: "flex", gap: 12, marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--color-border-subtle)" }}>
					<div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
						<Avatar url={post.avatar_url} initials={post.avatar} alt={post.user} size={40}
							color={post.avatarColor} style={{ background: post.avatarColor, fontSize: 14 }} />
						<div className="bg-border" style={{ width: 2, flex: 1, marginTop: 8, minHeight: 20, borderRadius: 1 }} />
					</div>
					<div>
						<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
							<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14 }}>{post.user}</span>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{post.handle}</span>
						</div>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.5 }}>{(post.text || "").slice(0, 140)}{(post.text || "").length > 140 ? "…" : ""}</p>
						<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 6 }}>
							Replying to <span style={{ color: "#2563eb" }}>{post.handle}</span>
						</p>
					</div>
				</div>
				{/* Compose */}
				<div style={{ display: "flex", gap: 12 }}>
					<Avatar url={me?.profile_pic_url} initials={(me?.name || "Y").slice(0, 1)} alt={me?.name} size={40}
						color="#2563eb" style={{ background: "#2563eb", fontSize: 14 }} />
					<div style={{ flex: 1 }}>
						<textarea value={text} onChange={e => { if (e.target.value.length <= max) setText(e.target.value); }}
							placeholder={i18n.t("social.postReply")} autoFocus
							className="text-text-primary" style={{ width: "100%", background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 16, resize: "none", minHeight: 80, lineHeight: 1.5, caretColor: "#2563eb", boxSizing: "border-box" }} rows={3} />
						{mediaFile && previewUrl && (
							<div style={{ borderRadius: 10, overflow: "hidden", position: "relative", marginBottom: 10 }}>
								{mediaFile.type.startsWith("video")
									? <video src={previewUrl} style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block", borderRadius: 10 }} muted playsInline controls />
									: <img loading="lazy" decoding="async" src={previewUrl} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block", borderRadius: 10 }} />}
								<button onClick={() => setMediaFile(null)} style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 24, height: 24, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, lineHeight: 1 }}>×</button>
							</div>
						)}
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--color-border-subtle)", paddingTop: 12, marginTop: 8 }}>
							<div style={{ display: "flex", gap: 14, alignItems: "center" }}>
								<input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={e => setMediaFile(e.target.files[0] || null)} />
								<button onClick={() => fileRef.current?.click()} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", minHeight: 44, minWidth: 44 }} aria-label={i18n.t("social.photoVideo", { defaultValue: "Photo/Video" })}>
									<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
								</button>
								<RecordVideoTrigger compact label={false} onFile={setMediaFile} />
							</div>
							<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
								{text.length > 240 && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: text.length > 270 ? "#ef4444" : "var(--color-text-muted)" }}>{max - text.length}</span>}
								<button onClick={() => { if (canReply) { onSubmit(townHallApiId(post) ?? post.id, text, mediaFile); onClose(); } }}
									disabled={!canReply}
									style={{ background: canReply ? "#2563eb" : "rgba(37,99,235,0.35)", border: "none", borderRadius: 20, padding: "8px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: canReply ? "pointer" : "default", transition: "background 0.15s" }}>
									Reply
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	), document.body);
}

// Quote Post Modal

function QuoteModal({ post, onClose, onSubmit, uploading }) {
	const [text, setText]         = useState("");
	const [mediaFile, setMediaFile] = useState(null);
	const fileRef = useRef(null);
	const max = 280;
	const me = getUser();
	// Media-only quotes are allowed (#431) — the quoted post itself carries the context.
	const canQuote = (!!text.trim() || !!mediaFile) && !uploading;
	const previewUrl = useMemo(() => mediaFile ? URL.createObjectURL(mediaFile) : null, [mediaFile]);
	useEffect(() => { return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }; }, [previewUrl]);
	return createPortal((
		<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 150, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 60 }}
			onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
			<div className="bg-surface-raised border border-border" style={{ width: "min(600px, 95vw)", borderRadius: 20, padding: 24, animation: "fadeUp 0.2s ease both", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
					<button onClick={onClose} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
					<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700 }}>{i18n.t("social.quotePost")}</span>
					<div style={{ width: 30 }} />
				</div>
				<div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
					<Avatar url={me?.profile_pic_url} initials={(me?.name || "Y").slice(0, 1)} alt={me?.name} size={40}
						color="#2563eb" style={{ background: "#2563eb", fontSize: 14, flexShrink: 0 }} />
					<div style={{ flex: 1 }}>
						<textarea value={text} onChange={e => { if (e.target.value.length <= max) setText(e.target.value); }}
							placeholder="Add a comment…" autoFocus
							className="text-text-primary" style={{ width: "100%", background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 16, resize: "none", minHeight: 72, lineHeight: 1.5, caretColor: "#2563eb", boxSizing: "border-box" }} rows={3} />
						{mediaFile && previewUrl && (
							<div style={{ borderRadius: 10, overflow: "hidden", position: "relative", marginBottom: 10 }}>
								{mediaFile.type.startsWith("video")
									? <video src={previewUrl} style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block", borderRadius: 10 }} muted playsInline controls />
									: <img loading="lazy" decoding="async" src={previewUrl} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block", borderRadius: 10 }} />}
								<button onClick={() => setMediaFile(null)} style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 24, height: 24, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, lineHeight: 1 }}>×</button>
							</div>
						)}
					</div>
				</div>
				{/* Quoted post embed */}
				<div className="border border-border bg-surface-raised" style={{ borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
					<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
						<Avatar url={post.avatar_url} initials={post.avatar} size={22}
							color={post.avatarColor} style={{ background: post.avatarColor, fontSize: 10 }} />
						<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13 }}>{post.user}</span>
						<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{post.handle}</span>
					</div>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5 }}>{(post.text || "").slice(0, 180)}{(post.text || "").length > 180 ? "…" : ""}</p>
				</div>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--color-border-subtle)", paddingTop: 12 }}>
					<div style={{ display: "flex", gap: 14, alignItems: "center" }}>
						<input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={e => setMediaFile(e.target.files[0] || null)} />
						<button onClick={() => fileRef.current?.click()} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", minHeight: 44, minWidth: 44 }} aria-label={i18n.t("social.photoVideo", { defaultValue: "Photo/Video" })}>
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
						</button>
						<RecordVideoTrigger compact label={false} onFile={setMediaFile} />
					</div>
					<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
						{text.length > 240 && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: text.length > 270 ? "#ef4444" : "var(--color-text-muted)" }}>{max - text.length}</span>}
						<button onClick={() => { if (canQuote) { onSubmit(text, mediaFile, post); onClose(); } }}
							disabled={!canQuote}
							style={{ background: canQuote ? "#2563eb" : "rgba(37,99,235,0.35)", border: "none", borderRadius: 20, padding: "8px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: canQuote ? "pointer" : "default", transition: "background 0.15s" }}>
							{uploading ? i18n.t("social.posting") : i18n.t("social.post")}
						</button>
					</div>
				</div>
			</div>
		</div>
	), document.body);
}

// Compact poll options — vote once, then show counts/percentages.
function TownHallPoll({ postId, poll, onVoted, onError }) {
	const [local, setLocal] = useState(poll);
	const [voting, setVoting] = useState(false);
	useEffect(() => { setLocal(poll); }, [poll]);
	if (!local?.options?.length) return null;
	const total = local.total_votes ?? local.options.reduce((s, o) => s + (o.votes_count ?? 0), 0);
	const voted = local.voted_option_id != null;
	const cast = async (optionId) => {
		if (voted || voting || !postId) return;
		setVoting(true);
		try {
			await voteTownHallPoll(postId, optionId);
			const next = {
				...local,
				voted_option_id: optionId,
				total_votes: total + 1,
				options: local.options.map(o => o.option_id === optionId
					? { ...o, votes_count: (o.votes_count ?? 0) + 1 }
					: o),
			};
			setLocal(next);
			onVoted?.(next);
		} catch (e) {
			onError?.(e?.response?.data?.message || "Could not record your vote.");
		} finally {
			setVoting(false);
		}
	};
	return (
		<div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
			{local.options.map(opt => {
				const votes = opt.votes_count ?? 0;
				const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
				const mine = voted && opt.option_id === local.voted_option_id;
				return (
					<button
						key={opt.option_id}
						type="button"
						disabled={voted || voting}
						onClick={() => cast(opt.option_id)}
						style={{
							position: "relative", overflow: "hidden", textAlign: "left",
							background: "var(--color-surface-raised)",
							border: `1.5px solid ${mine ? "#2563eb" : "var(--color-border)"}`,
							borderRadius: 10, padding: "9px 12px", cursor: voted || voting ? "default" : "pointer",
							fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "var(--color-text-primary)",
						}}
					>
						{voted && (
							<span aria-hidden style={{
								position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`,
								background: mine ? "rgba(37,99,235,0.22)" : "rgba(37,99,235,0.10)",
								transition: "width 0.25s ease",
							}} />
						)}
						<span style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 10, fontWeight: mine ? 700 : 500 }}>
							<span>{opt.text}</span>
							{voted && <span className="text-text-secondary" style={{ fontWeight: 600, flexShrink: 0 }}>{pct}%</span>}
						</span>
					</button>
				);
			})}
			{voted && (
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "2px 0 0" }}>
					{fmtViews(total)} vote{total === 1 ? "" : "s"}
				</p>
			)}
		</div>
	);
}

// Post Card
function SocialPostCard({ post, delay = 0, liveNow, onViewPost, onViewQuotedPost, onViewProfile, onRepost, onQuote, onLike, onReplyModal, onAvatarEnter, onAvatarLeave, onBookmark, onDelete, onNotInterested, onMute, onBlock, onReport, onFollowAuthor, onNotify, onPollVoted, followState }) {
	const [liked,      setLiked]      = useState(!!post.liked);
	const [reposted,   setReposted]   = useState(!!post.reposted);
	const [bookmarked, setBookmarked] = useState(!!post.saved);
	useEffect(() => { setLiked(!!post.liked); }, [post.liked]);
	useEffect(() => { setReposted(!!post.reposted); }, [post.reposted]);
	useEffect(() => { setBookmarked(!!post.saved); }, [post.saved]);
	const [menuOpen,       setMenuOpen]       = useState(false);
	const [repostMenuOpen, setRepostMenuOpen] = useState(false);
	const [likeAnim,     setLikeAnim]     = useState(false);
	const [repostAnim,   setRepostAnim]   = useState(false);
	const [bookmarkAnim, setBookmarkAnim] = useState(false);
	const [dtHeart, setDtHeart] = useState(false);
	const [revealSensitive, setRevealSensitive] = useState(false);
	const dtRef = useRef(0);

	function handleImgDoubleTap() {
		const now = Date.now();
		if (now - dtRef.current < 320 && !adMode) {
			if (!liked) {
				setLiked(true);
				if (onLike) Promise.resolve(onLike(post, true)).catch(() => setLiked(false));
			}
			setDtHeart(true);
			setTimeout(() => setDtHeart(false), 1000);
		}
		dtRef.current = now;
	}

	function triggerAnim(set) { set(true); setTimeout(() => set(false), 420); }

	// Fire one impression when a sponsored post is rendered. Best-effort.
	useEffect(() => {
		if (post.is_ad && post.campaign_id) trackAdEvent(post.campaign_id, "impression").catch(() => {});
	}, [post.is_ad, post.campaign_id]);

	const views      = post.views ?? 0;
	const likeCount  = (post.likes ?? 0) - (post.liked ? 1 : 0) + (liked ? 1 : 0);
	const repostCount = (post.reposts ?? 0) - (post.reposted ? 1 : 0) + (reposted ? 1 : 0);
	const _me   = getUser();
	const _myId = _me?.user_id ?? null;
	const isOwnPost = _myId != null && String(post.author_user_id) === String(_myId);
	const repostLabel = townHallRepostLabel(post, { viewerId: _myId, viewerReposted: reposted });
	// Sponsored shadow-posts have synthetic ids — disable engagement (like/reply/
	// repost/bookmark) and profile/post navigation; only the CTA link is actionable.
	const adMode = !!post.is_ad;

	return (
		<div style={{ borderBottom: "1px solid var(--color-border-subtle)", padding: "16px 20px", animation: `fadeUp 0.35s ease ${delay}ms both`, position: "relative", zIndex: (menuOpen || repostMenuOpen) ? 201 : "auto" }}>
			{(menuOpen || repostMenuOpen) && (
				<div style={{ position: "fixed", inset: 0, zIndex: 199 }} onClick={() => { setMenuOpen(false); setRepostMenuOpen(false); }} />
			)}

			{repostLabel && (
				<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, paddingLeft: 52 }}>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
					<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#059669", fontWeight: 600 }}>{repostLabel}</span>
				</div>
			)}

			<div style={{ display: "flex", gap: 12 }}>
				{/* Avatar — Doc 2 design (image support) + Doc 1 profile navigation */}
				<div style={{ flexShrink: 0 }}>
					<Avatar
						url={post.avatar_url} initials={post.avatar} alt={post.user} size={40}
						color={post.avatarColor}
						onMouseEnter={e => onAvatarEnter && onAvatarEnter(post, e.currentTarget.getBoundingClientRect())}
						onMouseLeave={() => onAvatarLeave && onAvatarLeave()}
						onClick={() => !adMode && onViewProfile && onViewProfile(post)}
						style={{ background: post.avatarColor, fontSize: 14, cursor: adMode ? "default" : "pointer" }} />
				</div>

				<div style={{ flex: 1, minWidth: 0 }}>
					{/* Header */}
					<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, justifyContent: "space-between", flexWrap: "wrap" }}>
						<div onClick={() => !adMode && onViewProfile && onViewProfile(post)} {...((!adMode && onViewProfile) ? clickableProps(() => onViewProfile(post)) : {})} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1, cursor: (!adMode && onViewProfile) ? "pointer" : "default" }}>
							<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>{post.user}</span>
							<VerificationBadge verified={post.verified} verificationType={post.verification_type} />
							{(() => {
								const live = liveNow?.[post.author_user_id] || liveNow?.[String(post.handle || '').replace(/^@/, '')];
								if (!live) return null;
								const href = live.handle ? `/live/@${live.handle}` : '/live';
								return (
									<a href={href} onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.__nav?.('live'); if (live.handle) window.history.pushState({ nav: 'live' }, '', href); }}
										style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff', background: '#dc2626', borderRadius: 4, padding: '2px 6px', textDecoration: 'none' }}>
										LIVE
									</a>
								);
							})()}
							{post.is_ad
								? <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 5, padding: "1px 7px", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>Sponsored</span>
								: <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post.handle} · {post.time}</span>}
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
							{/* Three-dot menu —  */}
							<div style={{ position: "relative" }}>
								{!adMode && <button onClick={() => setMenuOpen(v => !v)} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 6, fontSize: 18, lineHeight: 1 }}>···</button>}
								{menuOpen && (
									<div className="bg-surface border border-border" style={{ position: "absolute", right: 0, top: 28, borderRadius: 10, padding: "6px 0", zIndex: 200, minWidth: 180, boxShadow: "0 8px 32px rgba(0,0,0,0.8)" }} onClick={() => setMenuOpen(false)}>
										{isOwnPost ? (
											<div onClick={() => onDelete && onDelete(post)} {...clickableProps(() => onDelete && onDelete(post))} style={{ padding: "9px 16px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#ef4444", cursor: "pointer", fontWeight: 600 }}
												onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-raised)"}
												onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
												Delete post
											</div>
										) : (
											[
												{ label: i18n.t("social.notInterested"),       onClick: () => onNotInterested && onNotInterested(post) },
												{ label: followState === "requested" ? i18n.t("social.requested", "Requested") : followState ? i18n.t("common.following") : i18n.t("social.followUser", { handle: post.handle }), onClick: () => onFollowAuthor && onFollowAuthor(post) },
												{ label: i18n.t("messages.mute"),                 onClick: () => onMute && onMute(post) },
												{ label: i18n.t("profile.block"),  danger: true,  onClick: () => onBlock && onBlock(post) },
												{ label: i18n.t("profile.report"), danger: true,  onClick: () => onReport && onReport(post) },
											].map(opt => (
												<div key={opt.label} onClick={opt.onClick} {...clickableProps(opt.onClick)} style={{ padding: "9px 16px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: opt.danger ? "#ef4444" : "var(--color-text-secondary)", cursor: "pointer" }}
													onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-raised)"}
													onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
													{opt.label}
												</div>
											))
										)}
									</div>
								)}
							</div>
						</div>
					</div>

					{/* Post text / media — gated behind sensitive reveal when needed */}
					{post.is_sensitive && !revealSensitive ? (
						<div style={{ marginBottom: 12, borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-surface-raised)", padding: "28px 16px", textAlign: "center" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "0 0 12px" }}>Sensitive content</p>
							<button type="button" onClick={() => setRevealSensitive(true)}
								style={{ background: "#2563eb", border: "none", borderRadius: 20, padding: "7px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>
								Show
							</button>
						</div>
					) : (
						<>
							<PostCaption text={post.text} onOpen={() => onViewPost && onViewPost(post)} adMode={adMode} mb={(post.media_url || post.poll || post.pinned_product) ? 8 : 12} />

							{post.poll && (
								<TownHallPoll
									// townHallApiId, not post.id — a repost card's id is "repost_9",
									// which the backend's parseInt turns into NaN.
									postId={townHallApiId(post) ?? post.post_id}
									poll={post.poll}
									onVoted={(updated) => onPollVoted?.(post, updated)}
									onError={(msg) => onNotify?.({ title: i18n.t("common.error", "Error"), message: msg })}
								/>
							)}

							{post.pinned_product && (
								<div className="border border-border bg-surface-raised" style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
									<div style={{ flex: 1, minWidth: 0 }}>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post.pinned_product.name}</p>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "2px 0 0" }}>
											{typeof post.pinned_product.price === "number" ? `$${Number(post.pinned_product.price).toFixed(2)}` : post.pinned_product.price}
										</p>
									</div>
								</div>
							)}

							{/* Media */}
							{post.media_url && (
								post.media_type === "video"
									? <TownHallVideo src={post.media_url} hlsUrl={post.hls_url} poster={post.thumbnail_url} style={{ width: "100%", height: "auto", maxHeight: 560, objectFit: "contain", borderRadius: 8, marginBottom: 12, background: "#000", display: "block" }} />
									: (
										<div style={{ position: "relative", cursor: "pointer" }} onClick={handleImgDoubleTap}>
											{/* #341: cap the feed-card media height — tall/portrait images previously rendered
											    full-width AND full-height, dominating the desktop feed. Cover-crop to a
											    bounded preview here; the post-detail view still shows the full image. */}
											<SafeImage loading="lazy" decoding="async" src={post.media_url} alt="" style={{ width: "100%", height: "auto", maxHeight: 560, objectFit: "cover", borderRadius: 8, marginBottom: 12, display: "block", background: "#000" }}
												fallback={<MediaPlaceholder style={{ width: "100%", height: 220, borderRadius: 8, marginBottom: 12 }} />} />
											{dtHeart && (
												<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", overflow: "hidden", borderRadius: 8 }}>
													<div style={{ position: "absolute", width: 72, height: 72, borderRadius: "50%", border: "2px solid rgba(239,68,68,0.5)", animation: "heartBurstRipple 0.55s ease-out both" }} />
													<svg width={80} height={80} viewBox="0 0 24 24" fill="#ef4444" style={{ position: "absolute", animation: "heartBurstCenter 0.65s cubic-bezier(0.34,1.56,0.64,1) both", filter: "drop-shadow(0 0 18px #ef4444bb)" }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
													{[[-44,8],[44,8],[-22,-44],[22,-44],[0,-52]].map(([dx,dy],i) => (
														<svg key={i} width={i%2===0?18:14} height={i%2===0?18:14} viewBox="0 0 24 24" fill="#ef4444"
															style={{ position: "absolute", left: `calc(50% + ${dx}px)`, top: `calc(50% + ${dy}px)`, transform: "translate(-50%,-50%)", animation: `heartBurstFloat ${0.6+i*0.04}s ease ${i*55}ms both`, filter: "drop-shadow(0 0 4px #ef444477)" }}>
															<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
														</svg>
													))}
												</div>
											)}
										</div>
									)
							)}
						</>
					)}

					{/* Sponsored CTA — opens the advertiser's link and records a click */}
					{post.is_ad && isSafeHttpUrl(post.target_url) && (
						<a href={post.target_url} target="_blank" rel="noopener noreferrer nofollow sponsored"
							onClick={() => { if (post.campaign_id) trackAdEvent(post.campaign_id, "click").catch(() => {}); }}
							style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12, background: "rgba(37,99,235,0.14)", border: "1px solid rgba(37,99,235,0.45)", borderRadius: 10, padding: "9px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#60a5fa", textDecoration: "none" }}>
							{AD_CTA_LABELS[post.cta_text] || "Learn More"}
							<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
						</a>
					)}

					{/* Quoted post embed */}
					{post._quotedPost && (
						post._quotedPost._fromText ? (
							<div style={{ borderLeft: "3px solid var(--color-border)", paddingLeft: 12, marginBottom: 12, marginTop: 4 }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5, margin: 0, fontStyle: "italic" }}>
									{(post._quotedPost.text || "").slice(0, 200)}{(post._quotedPost.text || "").length > 200 ? "…" : ""}
								</p>
							</div>
						) : (
							<div onClick={e => {
								e.stopPropagation();
								const qid = quotedPostApiId(post._quotedPost);
								if (qid != null && onViewQuotedPost) onViewQuotedPost(qid);
							}} {...clickableProps(() => {
								const qid = quotedPostApiId(post._quotedPost);
								if (qid != null && onViewQuotedPost) onViewQuotedPost(qid);
							})}
								className="border border-border bg-surface-raised" style={{ borderRadius: 14, padding: "12px 14px", marginBottom: 12, cursor: "pointer", transition: "background 0.13s" }}
								onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-raised)"}
								onMouseLeave={e => e.currentTarget.style.background = "var(--color-surface-raised)"}>
								<div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6, flexWrap: "wrap" }}>
									<Avatar url={post._quotedPost.avatar_url} initials={post._quotedPost.avatar} size={20}
										color={post._quotedPost.avatarColor} style={{ background: post._quotedPost.avatarColor, fontSize: 9 }} />
									<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13 }}>{post._quotedPost.user}</span>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{post._quotedPost.handle}</span>
									<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>·</span>
									<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{post._quotedPost.time}</span>
								</div>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5, margin: 0 }}>
									{(post._quotedPost.text || "").slice(0, 200)}{(post._quotedPost.text || "").length > 200 ? "…" : ""}
								</p>
								{post._quotedPost.media_url && post._quotedPost.media_type !== "video" && (
									<SafeImage loading="lazy" decoding="async" src={post._quotedPost.media_url} alt="" style={{ width: "100%", borderRadius: 8, marginTop: 8, maxHeight: 200, objectFit: "cover", display: "block" }}
										fallback={<MediaPlaceholder style={{ width: "100%", height: 120, borderRadius: 8, marginTop: 8 }} />} />
								)}
							</div>
						)
					)}

					{/* Actions — hidden for sponsored shadow-posts (synthetic ids) */}
					{!adMode && <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
						{/* Reply */}
						<button onClick={() => onReplyModal && onReplyModal(post)} className="text-text-secondary" style={{ background: "none", border: "none", display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: 0 }}
							onMouseEnter={e => e.currentTarget.style.color = "#2563eb"}
							onMouseLeave={e => e.currentTarget.style.color = "var(--color-text-muted)"}>
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
							{post.comments ?? 0}
						</button>

						{/* Repost dropdown — Doc 1 toggle logic */}
						<div style={{ position: "relative" }}>
							<button onClick={() => setRepostMenuOpen(v => !v)} style={{ background: "none", border: "none", display: "flex", alignItems: "center", gap: 5, color: reposted ? "#059669" : "var(--color-text-muted)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: 0, transition: "color 0.15s" }}>
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ animation: repostAnim ? "socialRepostSpin 0.42s cubic-bezier(0.34,1.56,0.64,1) both" : "none" }}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
								{repostCount}
							</button>
							{repostMenuOpen && (
								<div className="bg-surface border border-border" style={{ position: "absolute", bottom: 28, left: -10, borderRadius: 12, padding: "6px 0", zIndex: 200, minWidth: 160, boxShadow: "0 8px 32px rgba(0,0,0,0.8)" }}>
									<div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: reposted ? "#059669" : "var(--color-text-primary)" }}
										onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-raised)"}
										onMouseLeave={e => e.currentTarget.style.background = "transparent"}
										onClick={() => {
											const next = !reposted;
											setReposted(next);
											setRepostMenuOpen(false);
											triggerAnim(setRepostAnim);
											if (onRepost) {
												Promise.resolve(onRepost(post, next)).catch(() => setReposted(!next));
											}
										}}>
										<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
										{reposted ? i18n.t("social.undoRepost") : i18n.t("social.repost")}
									</div>
									<div className="text-text-primary" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}
										onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-raised)"}
										onMouseLeave={e => e.currentTarget.style.background = "transparent"}
										onClick={() => { setRepostMenuOpen(false); if (onQuote) onQuote(post); }}>
										<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
										Quote Post
									</div>
								</div>
							)}
						</div>

						{/* Like */}
						<button onClick={(e) => {
							e.stopPropagation();
							const next = !liked;
							setLiked(next);
							triggerAnim(setLikeAnim);
							if (onLike) Promise.resolve(onLike(post, next)).catch(() => setLiked(!next));
						}}
							style={{ background: "none", border: "none", display: "flex", alignItems: "center", gap: 5, color: liked ? "#ef4444" : "var(--color-text-muted)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: 0, transition: "color 0.15s" }}>
							<svg width="20" height="20" viewBox="0 0 24 24" fill={liked ? "#ef4444" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ animation: likeAnim ? (liked ? "socialLikePop 0.38s cubic-bezier(0.34,1.56,0.64,1) both" : "socialTap 0.28s cubic-bezier(0.34,1.56,0.64,1) both") : "none" }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
							{likeCount}
						</button>

						{/* Views */}
						<span className="text-text-muted" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontFamily: "'DM Sans', sans-serif", userSelect: "none" }}>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
							{fmtViews(views)}
						</span>

						{/* Bookmark */}
						<button 
							onClick={() => { 
								const next = !bookmarked; 
								setBookmarked(next); 
								triggerAnim(setBookmarkAnim); 
								if (onBookmark) Promise.resolve(onBookmark(post, next)).catch(() => setBookmarked(!next));
							}} 
							style={{ 
								background: "none", 
								border: "none", 
								display: "flex", 
								alignItems: "center", 
								gap: 5, 
								color: bookmarked ? "#2563eb" : "var(--color-text-muted)", 
								cursor: "pointer", 
								padding: 0, 
								transition: "color 0.15s", 
								marginLeft: "auto" 
							}}>
							<svg 
								width="16" 
								height="16" 
								viewBox="0 0 24 24" 
								fill={bookmarked ? "#2563eb" : "none"} 
								stroke="currentColor" 
								strokeWidth="1.8" 
								strokeLinecap="round" 
								strokeLinejoin="round" 
								style={{ 
									animation: bookmarkAnim ? (bookmarked ? "socialSavePop 0.38s cubic-bezier(0.34,1.56,0.64,1) both" : "socialTap 0.28s cubic-bezier(0.34,1.56,0.64,1) both") : "none" 
								}}>
								<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
							</svg>
						</button>
					</div>}
				</div>
			</div>
		</div>
	);
}

function TownHallXImportPanel({ compact = false }) {
	const [url, setUrl] = useState("");
	const [busy, setBusy] = useState(false);
	const [job, setJob] = useState(null);
	const [msg, setMsg] = useState(null);
	const [showPointer, setShowPointer] = useState(() => {
		try { return localStorage.getItem("th_x_import_seen") !== "1"; } catch { return true; }
	});

	useEffect(() => {
		let stop = false;
		async function loadJob() {
			try {
				const res = await getTownhallImport();
				if (!stop) setJob(res?.data ?? null);
			} catch { /* ignore */ }
		}
		loadJob();
		const running = job && ["queued", "listing", "importing"].includes(job.status);
		const t = setInterval(loadJob, running ? 4000 : 20000);
		return () => { stop = true; clearInterval(t); };
	}, [job?.status]);

	async function handleImport() {
		const raw = url.trim();
		if (!raw || busy) return;
		setBusy(true);
		setMsg(null);
		try {
			normalizeTwitterSourceUrl(raw);
			const res = await startTownhallImport(raw);
			setJob(res?.data ?? null);
			setMsg(res?.message || i18n.t("social.importFromXHint"));
			try { localStorage.setItem("th_x_import_seen", "1"); } catch { /* ignore */ }
			setShowPointer(false);
		} catch (e) {
			const data = e?.response?.data;
			if (data?.data) setJob(data.data);
			setMsg(data?.message || e?.message || i18n.t("common.error", "Error"));
		} finally {
			setBusy(false);
		}
	}

	const statusLine = formatTownhallImportStatus(job);
	const importing = job && ["queued", "listing", "importing"].includes(job.status);

	return (
		<div
			style={{
				borderBottom: compact ? "none" : "1px solid var(--color-border-subtle)",
				padding: compact ? "0 0 12px" : "12px 20px 14px",
				position: "relative",
			}}
		>
			{showPointer && !compact && (
				<div
					style={{
						position: "absolute",
						top: 8,
						right: 16,
						background: "#0f172a",
						color: "#fff",
						fontFamily: "'DM Sans', sans-serif",
						fontSize: 11,
						fontWeight: 700,
						padding: "5px 10px",
						borderRadius: 8,
						zIndex: 2,
						boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
					}}
				>
					{i18n.t("social.importPointer")}
				</div>
			)}
			<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
				{i18n.t("social.importFromX")}
			</p>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 10, lineHeight: 1.45 }}>
				{i18n.t("social.importFromXHint")}
			</p>
			<input
				value={url}
				onChange={(e) => setUrl(e.target.value)}
				placeholder={i18n.t("social.importFromXPlaceholder")}
				className="bg-surface-raised border border-border text-text-primary"
				style={{
					width: "100%",
					boxSizing: "border-box",
					minHeight: 44,
					borderRadius: 10,
					padding: "10px 12px",
					fontFamily: "'DM Sans', sans-serif",
					fontSize: 16,
					marginBottom: 8,
					outline: "none",
				}}
			/>
			<button
				type="button"
				onClick={handleImport}
				disabled={busy || !url.trim() || importing}
				style={{
					width: "100%",
					minHeight: 44,
					padding: "10px 12px",
					border: "none",
					borderRadius: 10,
					background: "#2563eb",
					color: "#fff",
					fontFamily: "'DM Sans', sans-serif",
					fontWeight: 700,
					fontSize: 13,
					cursor: busy || !url.trim() || importing ? "default" : "pointer",
					opacity: busy || !url.trim() || importing ? 0.6 : 1,
				}}
			>
				{busy ? i18n.t("social.importStarting") : i18n.t("social.importLibrary")}
			</button>
			{(statusLine || msg) && (
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 8, lineHeight: 1.4 }}>
					{statusLine || msg}
				</p>
			)}
		</div>
	);
}

function SocialComposePage({ onPost, uploading = false }) {
	const [text, setText]               = useState("");
	const [mediaFile, setMediaFile]     = useState(null);
	const [showSchedule, setShowSchedule] = useState(false);
	const [scheduleDate, setScheduleDate] = useState("");
	const [minSchedule, setMinSchedule]   = useState("");
	const [showPoll, setShowPoll]         = useState(false);
	const [pollOptions, setPollOptions]   = useState(["", ""]);
	const fileRef = useRef(null);
	const max = 280;

	const openSchedule = () => {
		setShowSchedule(v => !v);
		setMinSchedule(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
	};

	const previewUrl = useMemo(() => mediaFile ? URL.createObjectURL(mediaFile) : null, [mediaFile]);
	useEffect(() => { return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }; }, [previewUrl]);

	const me = getUser();
	const remaining = max - text.length;
	const cleanedPoll = showPoll ? pollOptions.map(o => o.trim()).filter(Boolean) : [];
	const pollReady = !showPoll || (cleanedPoll.length >= 2 && cleanedPoll.length <= 4);
	// A post may be image/video-only — text is only required when there is no attachment (#431).
	// Poll-only posts are also allowed when 2–4 options are filled.
	const canPost = (!!text.trim() || !!mediaFile || cleanedPoll.length >= 2) && pollReady && !uploading;

	const resetCompose = () => {
		setText(""); setMediaFile(null); setScheduleDate(""); setShowSchedule(false);
		setShowPoll(false); setPollOptions(["", ""]);
	};

	return (
		<div style={{ borderBottom: "1px solid var(--color-border-subtle)", padding: "16px 20px" }}>
			<input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={e => setMediaFile(e.target.files[0] || null)} />
			<div style={{ display: "flex", gap: 12 }}>
				{/* Doc 2 avatar image */}
				<Avatar url={me?.profile_pic_url} initials={(me?.name || "Y").slice(0, 1)} alt={me?.name} size={40}
					color="#2563eb" style={{ background: "#2563eb", fontSize: 14 }} />
				<div style={{ flex: 1 }}>
					<textarea value={text} onChange={e => { if (e.target.value.length <= max) setText(e.target.value); }}
						placeholder={i18n.t("social.whatsHappening")}
						className="text-text-primary" style={{ width: "100%", boxSizing: "border-box", background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 16, resize: "none", minHeight: 72, lineHeight: 1.5, caretColor: "#2563eb" }} rows={3} />
					{mediaFile && (
						<div style={{ marginBottom: 10, borderRadius: 10, overflow: "hidden", position: "relative" }}>
							{mediaFile.type.startsWith("video")
								? <video src={previewUrl} style={{ width: "100%", maxHeight: 240, objectFit: "cover", display: "block", borderRadius: 10 }} muted playsInline controls />
								: <img loading="lazy" decoding="async" src={previewUrl} alt="" style={{ width: "100%", maxHeight: 240, objectFit: "cover", display: "block", borderRadius: 10 }} />}
							<button onClick={() => setMediaFile(null)} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 26, height: 26, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, lineHeight: 1 }}>×</button>
						</div>
					)}
					{showPoll && (
						<div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>
							{pollOptions.map((opt, i) => (
								<div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
									<input
										value={opt}
										onChange={e => setPollOptions(prev => prev.map((x, j) => j === i ? e.target.value.slice(0, 80) : x))}
										placeholder={`Option ${i + 1}`}
										className="bg-surface-raised border border-border text-text-primary"
										style={{ flex: 1, borderRadius: 8, padding: "7px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none" }}
									/>
									{pollOptions.length > 2 && (
										<button type="button" onClick={() => setPollOptions(prev => prev.filter((_, j) => j !== i))}
											className="text-text-muted" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button>
									)}
								</div>
							))}
							{pollOptions.length < 4 && (
								<button type="button" onClick={() => setPollOptions(prev => [...prev, ""])}
									style={{ alignSelf: "flex-start", background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, padding: 0 }}>
									+ Add option
								</button>
							)}
						</div>
					)}
					{showSchedule && (
						<div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("social.scheduleFor")}</span>
							{/* colorScheme stays "dark" regardless of theme — matches the established pattern for
							    native date/time inputs across the app: the browser's own picker chrome isn't retheme'd. */}
							<input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} min={minSchedule}
								className="bg-surface-raised border border-border text-text-primary" style={{ borderRadius: 8, padding: "5px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, outline: "none", colorScheme: "dark" }} />
							{scheduleDate && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#059669" }}>✓ Scheduled</span>}
						</div>
					)}
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--color-border-subtle)", paddingTop: 10 }}>
						<div style={{ display: "flex", gap: 14, alignItems: "center" }}>
							<button onClick={() => fileRef.current?.click()} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", minHeight: 44, minWidth: 44 }} aria-label={i18n.t("social.photoVideo", { defaultValue: "Photo/Video" })}>
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
							</button>
							<RecordVideoTrigger compact label={false} onFile={setMediaFile} />
							<button type="button" onClick={() => setShowPoll(v => { if (v) setPollOptions(["", ""]); return !v; })}
								style={{ background: "none", border: "none", color: showPoll ? "#2563eb" : "rgba(37,99,235,0.65)", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700 }}>
								Poll
							</button>
							<button onClick={openSchedule} style={{ background: "none", border: "none", color: showSchedule ? "#2563eb" : "rgba(37,99,235,0.65)", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
							</button>
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: remaining < 20 ? "#ef4444" : remaining < 60 ? "#f59e0b" : "var(--color-text-muted)" }}>{text.length} / {max}</span>
							<button
								onClick={async () => {
									if (canPost) {
										try {
											const when = scheduleDate ? new Date(scheduleDate).toISOString() : null;
											await onPost(text, mediaFile, when, cleanedPoll.length >= 2 ? cleanedPoll : null);
											resetCompose();
										} catch (e) { console.error("Post failed", e); }
									}
								}}
								disabled={!canPost}
								style={{ background: canPost ? "#2563eb" : "rgba(37,99,235,0.4)", border: "none", borderRadius: 20, padding: "8px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: canPost ? "pointer" : "default", transition: "background 0.15s" }}>
								{uploading ? "Uploading…" : scheduleDate ? "Schedule" : "Post"}
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

// * ── Post Detail 
function SocialPostDetailPage({ post, onBack, onRepost, onDelete, noOuterPad, onViewCountUpdate, onFollow, onLike, onPollVoted, followState }) {
	const { isMobile } = useViewport();
	const isSplitMode = useSplitMode();
	const [detailDialog, { notify, confirm }] = useDialog();
	const _me   = getUser();
	const _myId = _me?.user_id ?? null;
	const isOwnPost = _myId != null && String(post.author_user_id) === String(_myId);

	const [comments, setComments]           = useState([]);
	const [commentsLoaded, setCommentsLoaded] = useState(false);
	const [replyText, setReplyText]         = useState("");
	const [mediaFile, setMediaFile]         = useState(null);
	const [liked,     setLiked]             = useState(!!post.liked);
	const [reposted,  setReposted]          = useState(!!post.reposted);
	const [bookmarked, setBookmarked]       = useState(!!post.saved);
	useEffect(() => { setLiked(!!post.liked); }, [post.liked]);
	useEffect(() => { setReposted(!!post.reposted); }, [post.reposted]);
	useEffect(() => { setBookmarked(!!post.saved); }, [post.saved]);
	const [likeAnim,   setLikeAnim]         = useState(false);
	const [repostAnim, setRepostAnim]       = useState(false);
	const [quotes, setQuotes]               = useState(null);
	const [quotesOpen, setQuotesOpen]       = useState(false);
	const [quotesLoading, setQuotesLoading] = useState(false);
	const fileRef = useRef(null);
	const replyTextareaRef = useRef(null);
	const initialViews = Math.max(Number(post.views ?? 0) || 0, postViews(post));
	const [views, setViews] = useState(initialViews);

	const likeCount   = (post.likes   ?? 0) - (post.liked   ? 1 : 0) + (liked   ? 1 : 0);
	const repostCount = (post.reposts ?? 0) - (post.reposted ? 1 : 0) + (reposted ? 1 : 0);
	const repostLabel = townHallRepostLabel(post, { viewerId: _myId, viewerReposted: reposted });

	const apiPostId = townHallApiId(post);

	const replyPreviewUrl = useMemo(() => mediaFile ? URL.createObjectURL(mediaFile) : null, [mediaFile]);
	useEffect(() => { return () => { if (replyPreviewUrl) URL.revokeObjectURL(replyPreviewUrl); }; }, [replyPreviewUrl]);

	function triggerAnim(set) { set(true); setTimeout(() => set(false), 420); }

	useEffect(() => {
		if (!apiPostId) return;
		viewTownHallPost(apiPostId).then(r => {
			if (r && typeof r.view_count === "number") {
				setViews(r.view_count);
				onViewCountUpdate?.(apiPostId, r.view_count); 
			}
		}).catch(err => {
			console.error("View tracking failed:", err);
		});
	}, [apiPostId]);

	function mapComment(c) {
		const sp   = c.user?.social_profiles?.[0] ?? null;
		const name = sp?.display_name || c.user?.name || c.user?.username || c.user_name || c.username || "User";
		return {
			id:             c.post_id ?? c.comment_id ?? c.id ?? Date.now(),
			user:           name,
			handle:         sp?.handle ? `@${sp.handle}` : null,
			author_user_id: c.user?.user_id ?? null,
			avatar:         (name[0] ?? "U").toUpperCase(),
			avatar_url:     sp?.profile_pic_url ?? c.user?.profile_photo_url ?? null,
			avatarColor:    "#7c3aed",
			text:           c.content ?? c.text ?? "",
			media_url:      c.media_url ?? null,
			media_type:     c.media_type ?? null,
			hls_url:        c.hls_url ?? null,
			thumbnail_url:  c.thumbnail_url ?? null,
			time:           c.created_at ? new Date(c.created_at).toLocaleDateString() : (c.timestamp ?? "now"),
		};
	}

	function refreshComments() {
		if (!apiPostId) { setCommentsLoaded(true); return; }
		getTownHallReplies(apiPostId).then(data => {
			const arr = Array.isArray(data) ? data : (data?.data ?? data?.replies ?? []);
			setComments(arr.map(mapComment));
		}).catch(() => { setComments([]); }).finally(() => setCommentsLoaded(true));
	}

	useEffect(() => {
		let alive = true;
		setComments([]);
		setCommentsLoaded(false);
		if (!apiPostId) {
			setCommentsLoaded(true);
			return;
		}
		getTownHallReplies(apiPostId).then(data => {
			if (!alive) return;
			const arr = Array.isArray(data) ? data : (data?.data ?? data?.replies ?? []);
			setComments(arr.map(mapComment));
		}).catch(() => {
			if (alive) setComments([]);
		}).finally(() => {
			if (alive) setCommentsLoaded(true);
		});
		return () => { alive = false; };
	}, [apiPostId]);  

	async function loadQuotes() {
		if (!apiPostId) return;
		if (quotesOpen) { setQuotesOpen(false); return; }
		setQuotesOpen(true);
		if (quotes != null) return;
		setQuotesLoading(true);
		try {
			const data = await getTownHallQuotes(apiPostId);
			const arr = Array.isArray(data) ? data : (data?.data ?? data?.quotes ?? []);
			setQuotes(arr.map(q => {
				const sp = q.user?.social_profiles?.[0] ?? null;
				const name = sp?.display_name || q.user?.name || q.user?.username || "User";
				return {
					id: q.post_id ?? q.id,
					user: name,
					handle: sp?.handle ? `@${sp.handle}` : null,
					text: q.content ?? "",
					time: q.created_at ? timeAgo(q.created_at) : timeAgo(null),
				};
			}));
		} catch {
			setQuotes([]);
			notify({ title: i18n.t("common.error", "Error"), message: i18n.t("social.quotesFailed", "Could not load quotes.") });
		} finally {
			setQuotesLoading(false);
		}
	}

	async function submitComment() {
		// A reply may be image/video-only — don't require text when there's media (#361).
		if (!replyText.trim() && !mediaFile) return;
		const txt = replyText;
		const file = mediaFile;
		const me  = getUser();
		const myName = me?.name || "You";
		setReplyText(""); setMediaFile(null);
		const localMediaType = file ? (file.type.startsWith("video") ? "video" : "image") : null;
		const tempId = Date.now();
		const localUrl = file ? URL.createObjectURL(file) : null;
		setComments(prev => [{ id: tempId, user: myName, author_user_id: me?.user_id ?? null, avatar: (myName[0] ?? "Y").toUpperCase(), avatar_url: me?.profile_pic_url ?? null, avatarColor: "#2563eb", text: txt, media_url: localUrl, media_type: localMediaType, time: "now" }, ...prev]);
		try {
			// Upload the attachment first, then post the reply WITH the media — the inline composer
			// previously sent text only, so image replies silently dropped the image (#361).
			let mediaUrl = null, mediaType = null;
			if (file) { try { const res = await uploadTownHallMedia(file); mediaUrl = res.url; mediaType = res.media_type; } catch { /* keep text-only on upload failure */ } }
			await (mediaUrl ? createTownHallPostWithMedia(txt, apiPostId, mediaUrl, mediaType) : createTownHallPost(txt, apiPostId));
			if (localUrl) URL.revokeObjectURL(localUrl);
			refreshComments();
		} catch (err) {
			setComments(prev => prev.filter(c => c.id !== tempId));
			if (localUrl) URL.revokeObjectURL(localUrl);
			notify({ title: i18n.t("common.error", "Error"), message: err?.response?.data?.message || i18n.t("social.replyFailed", "Could not post reply.") });
		}
	}

	const outerPad = noOuterPad
		? { paddingLeft: 0, paddingRight: 0 }
		: { paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 };

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", ...outerPad }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 680, width: "100%", margin: "0 auto", overflow: "hidden" }}>
				{/* Back */}
				{!(isMobile || isSplitMode) && (
					<div style={{ padding: "16px 0 0", flexShrink: 0, borderBottom: "1px solid var(--color-border-subtle)" }}>
						<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, padding: "0 0 16px", marginLeft: 4 }}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
							Back
						</button>
					</div>
				)}

				<div style={{ flex: 1, overflowY: "auto" }}>
					{/* Post */}
					<div style={{ padding: "20px 8px", borderBottom: "1px solid var(--color-border-subtle)" }}>
						{repostLabel && (
							<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, paddingLeft: 4 }}>
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#059669", fontWeight: 600 }}>{repostLabel}</span>
							</div>
						)}
						<div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
							{/* Avatar */}
							<Avatar url={post.avatar_url} initials={post.avatar} alt={post.user} size={44}
								color={post.avatarColor} onClick={() => goToTownhallProfile(post)}
								style={{ background: post.avatarColor, fontSize: 16, cursor: "pointer" }} />
							<div style={{ flex: 1 }}>
								<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
									<div onClick={() => goToTownhallProfile(post)} {...clickableProps(() => goToTownhallProfile(post))} style={{ cursor: "pointer" }}>
										<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
											<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15 }}>{post.user}</span>
											<VerificationBadge verified={post.verified} verificationType={post.verification_type} />
										</div>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{post.handle}</p>
									</div>
									{/* delete for own posts */}
									{isOwnPost ? (
										<button onClick={() => onDelete && onDelete(post)} aria-label="Delete post" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.45)", borderRadius: 20, padding: "6px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
											Delete
										</button>
									) : (
										<button
											type="button"
											onClick={async () => {
												if (followState === true) {
													const ok = await confirm({
														title: i18n.t("social.unfollowTitle", { defaultValue: "Unfollow?" }),
														message: i18n.t("social.unfollowConfirm", { handle: post.handle, defaultValue: `Unfollow ${post.handle}?` }),
														confirmLabel: i18n.t("social.unfollow", { defaultValue: "Unfollow" }),
														danger: true,
													});
													if (!ok) return;
												}
												onFollow && onFollow(post);
											}}
											className="bg-text-primary text-bg"
											style={{ border: "none", borderRadius: 20, padding: "6px 16px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
										>
											{townHallFollowLabel(followState, i18n.t.bind(i18n))}
										</button>
									)}
								</div>
							</div>
						</div>

						<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, lineHeight: 1.7, marginBottom: post.media_url || post.poll || post.pinned_product ? 8 : 14 }}>{post.text}</p>
						{post.poll && <TownHallPoll postId={apiPostId} poll={post.poll} onVoted={(updated) => onPollVoted?.(post, updated)} onError={(msg) => notify({ title: i18n.t("common.error", "Error"), message: msg })} />}
						{post.pinned_product && (
							<div className="border border-border bg-surface-raised" style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
								<div style={{ flex: 1, minWidth: 0 }}>
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, margin: 0 }}>{post.pinned_product.name}</p>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "2px 0 0" }}>
										{typeof post.pinned_product.price === "number" ? `$${Number(post.pinned_product.price).toFixed(2)}` : post.pinned_product.price}
									</p>
								</div>
							</div>
						)}
						{post.media_url && (
							post.media_type === "video"
								? <TownHallVideo src={post.media_url} hlsUrl={post.hls_url} poster={post.thumbnail_url} style={{ width: "100%", height: "auto", borderRadius: 8, marginBottom: 14, background: "#000", display: "block" }} />
								: <SafeImage loading="lazy" decoding="async" src={post.media_url} alt="" style={{ width: "100%", height: "auto", borderRadius: 8, marginBottom: 14, display: "block" }}
									fallback={<MediaPlaceholder style={{ width: "100%", height: 240, borderRadius: 8, marginBottom: 14 }} />} />
						)}
						<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 14 }}>{timeAgo(post.created_at)}</p>

						{/* Stats */}
						<div style={{ display: "flex", gap: 20, padding: "10px 0", borderTop: "1px solid var(--color-border-subtle)", borderBottom: "1px solid var(--color-border-subtle)", marginBottom: 12 }}>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}><strong className="text-text-primary">{repostCount}</strong> {i18n.t("social.repostsLabel")}</span>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}><strong className="text-text-primary">{likeCount}</strong> {i18n.t("social.likesLabel")}</span>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}><strong className="text-text-primary">{fmtViews(views)}</strong> {i18n.t("social.viewsLabel")}</span>
						</div>

						{/* Actions */}
						<div style={{ display: "flex", gap: 28, paddingTop: 4, flexWrap: "wrap" }}>
							<button type="button" onClick={() => replyTextareaRef.current?.focus()} className="text-text-secondary" style={{ background: "none", border: "none", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: 0 }}>
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
								{commentsLoaded ? comments.length : (post.comments ?? 0)}
							</button>
							<button title={reposted ? i18n.t("social.undoRepost") : i18n.t("social.repost")} onClick={() => { const next = !reposted; setReposted(next); if (onRepost) onRepost(post, next); triggerAnim(setRepostAnim); }} style={{ background: "none", border: "none", display: "flex", alignItems: "center", gap: 6, color: reposted ? "#059669" : "var(--color-text-muted)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: 0, transition: "color 0.15s" }}>
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ animation: repostAnim ? "socialRepostSpin 0.42s cubic-bezier(0.34,1.56,0.64,1) both" : "none" }}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
								{repostCount}
							</button>
							<button onClick={() => {
								const next = !liked;
								setLiked(next);
								triggerAnim(setLikeAnim);
								if (onLike) {
									Promise.resolve(onLike(post, next)).catch(() => setLiked(!next));
								} else if (apiPostId) {
									toggleTownHallLike(apiPostId).catch(() => setLiked(!next));
								}
							}} style={{ background: "none", border: "none", display: "flex", alignItems: "center", gap: 6, color: liked ? "#ef4444" : "var(--color-text-muted)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: 0, transition: "color 0.15s" }}>
								<svg width="20" height="20" viewBox="0 0 24 24" fill={liked ? "#ef4444" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ animation: likeAnim ? (liked ? "socialLikePop 0.38s cubic-bezier(0.34,1.56,0.64,1) both" : "socialTap 0.28s cubic-bezier(0.34,1.56,0.64,1) both") : "none" }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
								{likeCount}
							</button>
							<button type="button" onClick={loadQuotes} className="text-text-secondary" style={{ background: "none", border: "none", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: 0 }}>
								Quotes{quotes != null ? ` (${quotes.length})` : ""}
							</button>
							<button onClick={() => {
								const next = !bookmarked;
								setBookmarked(next);
								if (apiPostId) {
									toggleSavePost(apiPostId).catch(() => {
										setBookmarked(!next);
										notify({ title: i18n.t("common.error", "Error"), message: i18n.t("social.saveFailed", "Could not update bookmark.") });
									});
								}
							}} style={{ background: "none", border: "none", display: "flex", alignItems: "center", gap: 6, color: bookmarked ? "#2563eb" : "var(--color-text-muted)", cursor: "pointer", padding: 0, marginLeft: "auto" }}>
								<svg width="20" height="20" viewBox="0 0 24 24" fill={bookmarked ? "#2563eb" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
							</button>
						</div>
						{quotesOpen && (
							<div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--color-border-subtle)" }}>
								<p className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: "0.06em", margin: "0 0 8px" }}>QUOTES</p>
								{quotesLoading ? (
									Array.from({ length: 2 }).map((_, i) => <SkeletonTownHallReply key={i} />)
								) : !quotes?.length ? (
									<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>No quotes yet</p>
								) : quotes.map(q => (
									<div key={q.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
										<div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 2 }}>
											<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13 }}>{q.user}</span>
											{q.handle && <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{q.handle}</span>}
											<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{q.time}</span>
										</div>
										{q.text && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0, lineHeight: 1.45 }}>{q.text}</p>}
									</div>
								))}
							</div>
						)}
					</div>

					{/* Reply compose  */}
					<div style={{ padding: "14px 8px", borderBottom: "1px solid var(--color-border-subtle)" }}>
						<input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={e => setMediaFile(e.target.files[0] || null)} />
						<div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
							<Avatar url={_me?.profile_pic_url} initials={(_me?.name || "Y").slice(0, 1)} alt={_me?.name} size={34}
								color="#2563eb" style={{ background: "#2563eb", fontSize: 12, marginTop: 2 }} />
							<div style={{ flex: 1 }}>
								<textarea ref={replyTextareaRef} value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), submitComment())}
									placeholder={i18n.t("social.postReply")}
									className="text-text-primary" style={{ width: "100%", background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 15, caretColor: "#2563eb", paddingBottom: 8, resize: "none", minHeight: 44, boxSizing: "border-box" }} rows={2} />
								{mediaFile && replyPreviewUrl && (
									<div style={{ borderRadius: 8, overflow: "hidden", position: "relative", marginBottom: 8 }}>
										{mediaFile.type.startsWith("video")
											? <video src={replyPreviewUrl} style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 8 }} muted playsInline controls />
											: <img loading="lazy" decoding="async" src={replyPreviewUrl} alt="" style={{ width: "100%", maxHeight: 160, objectFit: "cover", display: "block", borderRadius: 8 }} />}
										<button onClick={() => setMediaFile(null)} style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 22, height: 22, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>×</button>
									</div>
								)}
								<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--color-border-subtle)" }}>
									<div style={{ display: "flex", gap: 12, alignItems: "center" }}>
										<button onClick={() => fileRef.current?.click()} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", minHeight: 44, minWidth: 44 }} aria-label={i18n.t("social.photoVideo", { defaultValue: "Photo/Video" })}>
											<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
										</button>
										<RecordVideoTrigger compact label={false} onFile={setMediaFile} />
									</div>
									{(replyText.trim() || mediaFile) && (
										<button onClick={submitComment} style={{ background: "#2563eb", border: "none", borderRadius: 20, padding: "7px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>{i18n.t("common.reply")}</button>
									)}
								</div>
							</div>
						</div>
					</div>

					{/* Comments  */}
					<div>
						{!commentsLoaded && Array.from({ length: 3 }).map((_, i) => <SkeletonTownHallReply key={`rskel-${i}`} />)}
						{commentsLoaded && comments.length === 0 && (
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "24px 8px" }}>{i18n.t("social.noRepliesYet", "No replies yet")}</p>
						)}
						{comments.map(c => (
							<div key={c.id} style={{ padding: "14px 8px", borderBottom: "1px solid var(--color-border-subtle)", display: "flex", gap: 12, animation: "fadeUp 0.25s ease both" }}>
								<Avatar url={c.avatar_url} initials={c.avatar} alt={c.user} size={36}
									color={c.avatarColor}
									style={{ background: c.avatarColor, fontSize: 13, cursor: c.author_user_id ? "pointer" : "default" }}
									onClick={() => c.author_user_id && goToTownhallProfile({ author_user_id: c.author_user_id })} />
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
										<span onClick={() => c.author_user_id && goToTownhallProfile({ author_user_id: c.author_user_id })} {...clickableProps(() => c.author_user_id && goToTownhallProfile({ author_user_id: c.author_user_id }))} className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: c.author_user_id ? "pointer" : "default" }}>{c.user}</span>
										{c.handle && <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{c.handle}</span>}
										<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{c.time}</span>
										{/* Delete own reply (#362) — replies are town-hall posts, so DELETE /town-hall/:id. */}
										{_myId != null && c.author_user_id != null && String(c.author_user_id) === String(_myId) && (
											<Tooltip text="Delete reply"><button onClick={() => { setComments(prev => prev.filter(x => x.id !== c.id)); deleteTownHallPost(c.id).catch(() => refreshComments()); }} aria-label="Delete reply" style={{ marginLeft: "auto", background: "none", border: "none", color: "rgba(239,68,68,0.7)", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
												<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
											</button></Tooltip>
										)}
									</div>
									{c.text && (
										<ExpandableText
											text={c.text}
											lines={4}
											className="text-text-secondary"
											style={{ fontSize: 14, lineHeight: 1.5 }}
										/>
									)}
									{c.media_url && (
										c.media_type === "video"
											? <TownHallVideo src={c.media_url} hlsUrl={c.hls_url} poster={c.thumbnail_url} style={{ width: "100%", maxHeight: 320, borderRadius: 8, marginTop: 6, background: "#000", display: "block" }} />
											: <SafeImage loading="lazy" decoding="async" src={c.media_url} alt="" style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: 8, marginTop: 6, display: "block" }}
												fallback={<MediaPlaceholder style={{ width: "100%", height: 160, borderRadius: 8, marginTop: 6 }} />} />
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
			{detailDialog}
		</div>
	);
}


/* ── Main Page ── */
function SocialPage({ initialTownHallPostId } = {}) {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("social");
	const { isMobile } = useViewport();
	const isSplitMode = useSplitMode();
	const [tab, setTab]       = useState("home");
	const [sortBy, setSortBy] = useState("recent");
	const [sortOpen, setSortOpen] = useState(false);
	// Post currently being reported (drives the shared reason picker).
	const [reportTarget, setReportTarget] = useState(null);
	const [posts, setPosts]   = useState([]);
	const [feedReady, setFeedReady] = useState(false);
	const [feedError, setFeedError] = useState(null);
	const [detailHydrating, setDetailHydrating] = useState(!!initialTownHallPostId);
	const [exploreQuery, setExploreQuery] = useState("");
	const [trendingPosts,       setTrendingPosts]       = useState(null);
	const [trendingPostsLoaded, setTrendingPostsLoaded] = useState(false);
	// #470 "Post of the Week" — the week's standout post, shown atop the Home feed.
	const [spotlightPost,       setSpotlightPost]       = useState(null);
	const [liveNow, setLiveNow] = useState({});
	useEffect(() => {
		getLiveSessions()
			.then((res) => {
				const rows = Array.isArray(res) ? res : (res?.data ?? []);
				const map = {};
				for (const s of rows) {
					const session = { handle: s.handle, session_id: s.session_id };
					if (s.streamer_user_id != null) map[s.streamer_user_id] = session;
					if (s.handle) map[s.handle] = session;
				}
				setLiveNow(map);
			})
			.catch(() => {});
	}, []);

	/* Post detail with URL history */
	const [selectedPost, setSelectedPost] = useState(null);
	const [deepLinkError, setDeepLinkError] = useState(null);
	const openPost = useCallback((p) => {
		setSelectedPost(p);
		const id = townHallApiId(p);
		if (id != null) { try { window.history.pushState({ nav: "social", postId: id }, "", `/townhall/${id}`); } catch { /* noop */ } }
	}, []);
	const closePost = useCallback(() => {
		setSelectedPost(null);
		try { window.history.pushState({ nav: "social" }, "", "/townhall"); } catch { /* noop */ }
	}, []);

	/* Popstate: browser back from /townhall/:id → close post */
	useEffect(() => {
		const handler = () => {
			if (!/^\/townhall\/[^/]+/.test(window.location.pathname)) setSelectedPost(null);
		};
		window.addEventListener('popstate', handler);
		return () => window.removeEventListener('popstate', handler);
	}, []);

	/* Fetch a town-hall post by id and open it — shared by the cold-load /townhall/:id deep link
	   and the in-app notification deep link (#472). */
	const mapPostRef = useRef(null);
	const openTownHallPostById = useCallback((id) => {
		const apiId = townHallApiId({ id });
		if (apiId == null) return;
		setDeepLinkError(null);
		setDetailHydrating(true);
		const fetchPost = getUser() ? getTownHallPost(apiId) : getTownHallPostPublic(apiId);
		fetchPost
			.then(data => {
				const raw = data?.data ?? data;
				if (!raw || (raw.post_id == null && raw.id == null)) {
					throw Object.assign(new Error("not_found"), { response: { status: 404 } });
				}
				if (mapPostRef.current) {
					openPost(mapPostRef.current(raw));
					return;
				}
				const sp = raw.user?.social_profiles?.[0] ?? null;
				const name = sp?.display_name || raw.user?.name || raw.user?.username || "User";
				const handle = sp?.handle || raw.user?.username || "user";
				openPost({
					id: raw.post_id,
					author_user_id: raw.user?.user_id ?? null,
					author_profile_id: sp?.profile_id ?? null,
					user: name,
					handle: `@${handle}`,
					avatar: name.slice(0, 1).toUpperCase(),
					avatar_url: sp?.profile_pic_url ?? null,
					avatarColor: "#2563eb",
					time: timeAgo(raw.created_at),
					created_at: raw.created_at ?? null,
					text: raw.content ?? "",
					media_url: raw.media_url ?? null,
					media_type: raw.media_type ?? null,
					hls_url: raw.hls_url ?? null,
					thumbnail_url: raw.thumbnail_url ?? null,
					processing_status: raw.processing_status ?? null,
					poll: mapTownHallPoll(raw),
					is_sensitive: raw.is_sensitive ?? false,
					is_banned: raw.is_banned ?? false,
					liked: raw.liked ?? raw.is_liked_by_me ?? false,
					saved: raw.saved ?? false,
					reposted: raw.reposted ?? false,
					likes: raw._count?.likes ?? 0,
					comments: raw._count?.replies ?? 0,
					reposts: raw._count?.reposts ?? 0,
					views: postViews(raw),
					verified: sp?.is_verified ?? false,
					_quotedPost: raw.quote_post ? {
						id: raw.quote_post.post_id,
						author_user_id: raw.quote_post.user?.user_id ?? null,
						text: raw.quote_post.content ?? "",
					} : null,
				});
			})
			.catch((err) => {
				const status = err?.response?.status;
				setDeepLinkError(status === 403
					? i18n.t("social.postPrivate", { defaultValue: "This post is private or you do not have access." })
					: i18n.t("social.postUnavailable", { defaultValue: "This post could not be opened." }));
				didColdLoad.current = false;
			})
			.finally(() => setDetailHydrating(false));
	}, [openPost]);

	/* Cold-load from /townhall/:id deep link */
	const didColdLoad = useRef(false);
	useEffect(() => {
		if (!initialTownHallPostId || didColdLoad.current) return;
		didColdLoad.current = true;
		openTownHallPostById(initialTownHallPostId);
	}, [initialTownHallPostId, openTownHallPostById]);

	// #472: a notification for a town-hall post opens THAT post. App.jsx stashes the id in
	// window.__townHallOpenPostId and fires strug:open-notification-target. Read it on mount
	// (navigated here) AND on the event (already on Social — no remount). Consume-once.
	useEffect(() => {
		const consume = () => {
			const id = window.__townHallOpenPostId;
			if (id == null) return;
			delete window.__townHallOpenPostId;
			openTownHallPostById(id);
		};
		consume();
		window.addEventListener("strug:open-notification-target", consume);
		return () => window.removeEventListener("strug:open-notification-target", consume);
	}, [openTownHallPostById]);

	/* Compose */
	const [composeOpen, setComposeOpen]   = useState(false);
	const [composeText, setComposeText]   = useState("");
	const [composeMedia, setComposeMedia] = useState(null); // mobile media (Doc 1)
	const composeFileRef = useRef(null);
	const fabRef = useRef(null);
	const fabDragRef = useRef(null);
	const [fabPos, setFabPos] = useState(null);
	const composePreviewUrl = useMemo(() => composeMedia ? URL.createObjectURL(composeMedia) : null, [composeMedia]);
	useEffect(() => { return () => { if (composePreviewUrl) URL.revokeObjectURL(composePreviewUrl); }; }, [composePreviewUrl]);

	/* Notifications */

	/* Upload */
	const [uploading, setUploading] = useState(false);

	/* Search / trending */
	const [searchResults, setSearchResults]   = useState(null);
	const [searchLoading, setSearchLoading]   = useState(false);
	const [trendingTags, setTrendingTags]     = useState([]);
	const [trendingLoaded, setTrendingLoaded] = useState(false);
	const searchDebounceRef = useRef(null);

	/* Following feed (Doc 1) */
	const [followingPosts, setFollowingPosts] = useState(null);

	/* Saved */
	const [savedPosts, setSavedPosts] = useState([]);
	const [savedLoaded, setSavedLoaded] = useState(false);

	/* Modals */
	const [replyModalPost, setReplyModalPost] = useState(null);
	const [quoteModalPost, setQuoteModalPost] = useState(null);

	/* Delete (Doc 1) */
	const [pendingDelete, setPendingDelete] = useState(null);
	const [deleting, setDeleting]           = useState(false);

	/* Dialog (Doc 1) */
	const [socialDialog, { notify, confirm }] = useDialog();

	/* Profile hover card */
	const [activeProfilePost, setActiveProfilePost] = useState(null);
	const [hoverCounts, setHoverCounts]             = useState(null);
	const [profileCardPos, setProfileCardPos]       = useState({ x: 0, bottom: 0 });
	const profileHoverTimer = useRef(null);

	/* Infinite scroll */
	const [hasMorePosts, setHasMorePosts]   = useState(true);
	const [loadingMore, setLoadingMore]     = useState(false);
	const feedPageRef    = useRef(1);
	const loadingMoreRef = useRef(false);
	const loadingFollowingRef = useRef(false);
	// Following tab pagination (#42): the following feed used to fetch only page 1, so
	// users following many people saw just the first batch.
	const [hasMoreFollowing, setHasMoreFollowing] = useState(true);
	const followingPageRef = useRef(1);

	/* ── Follow state — Doc 2 design ── */
	const [isFollowing, setIsFollowing]   = useState({});
	const [followLoading, setFollowLoading] = useState({});
	const followLoadingRef = useRef({});
	const isFollowingRef   = useRef({});
	const currentUserId    = getUser()?.user_id;
	const [showAllVoices, setShowAllVoices] = useState(false);
	const [showAllTrending, setShowAllTrending] = useState(false);
	const [voicesToFollow, setVoicesToFollow] = useState([]);
	const [voicesLoaded, setVoicesLoaded] = useState(false);

	useEffect(() => { isFollowingRef.current = isFollowing; }, [isFollowing]);

	useEffect(() => {
		if (tab !== "saved") return;
		let alive = true;
		getSavedPosts().then(data => {
			if (!alive) return;
			setSavedPosts(foldSelfReposts((Array.isArray(data) ? data : []).map(mapPost), currentUserId));
		}).catch(err => {
			console.error("Failed to fetch saved:", err);
			if (alive) setSavedPosts([]);
		}).finally(() => { if (alive) setSavedLoaded(true); });
		return () => { alive = false; };
	}, [tab]); // mapPost is stable enough; defined later in this component

	useEffect(() => {
		// /social-follow/following takes the social PROFILE id, not the user id (they differ).
		// Passing user_id 404s and the "already following" map never loads.
		const myProfileId = getUser()?.profile_id;
		if (!myProfileId) return;
		getFollowing(myProfileId)
			.then(res => {
				const arr = Array.isArray(res) ? res : (res?.data ?? res?.following ?? []);
				const map = {};
				arr.forEach(item => {
					const uid = (typeof item === "number" || typeof item === "string")
						? item
						: (item?.user_id ?? item?.id ?? item?.followed_user_id ?? item?.following_id);
					if (uid != null) map[uid] = true;
				});
				setIsFollowing(map);
			})
			.catch(() => {});
	}, []);  

	const handleFollowToggle = useCallback(async (authorUserId) => {
		if (!authorUserId || followLoadingRef.current[authorUserId]) return;
		const wasFollowing = !!isFollowingRef.current[authorUserId];
		setIsFollowing(prev => ({ ...prev, [authorUserId]: !wasFollowing }));
		followLoadingRef.current[authorUserId] = true;
		setFollowLoading(prev => ({ ...prev, [authorUserId]: true }));
		try {
			const result = await toggleFollowByUserId(authorUserId);
			const action = result?.action;
			if (action === "followed") setIsFollowing(prev => ({ ...prev, [authorUserId]: true }));
			else if (action === "unfollowed" || action === "cancelled") setIsFollowing(prev => ({ ...prev, [authorUserId]: false }));
			else if (action === "requested") setIsFollowing(prev => ({ ...prev, [authorUserId]: "requested" }));
			return action;
		} catch {
			setIsFollowing(prev => ({ ...prev, [authorUserId]: wasFollowing }));
			throw new Error("follow_failed");
		} finally {
			followLoadingRef.current[authorUserId] = false;
			setFollowLoading(prev => ({ ...prev, [authorUserId]: false }));
		}
	}, []);


	/* follow button helpers — deliberately a stark black/white inverted toggle (unfollowed =
	   white pill/black text, following = dark pill/white text) in BOTH themes, like X/Twitter's
	   follow button. Each state pairs its own bg+fg, so it is never a mismatch — left hardcoded
	   on purpose rather than tokenized to the surface/text roles. */
	const followBtnStyle = (uid, compact = false) => ({
		background:  isFollowing[uid] ? "rgba(0,0,0,0.8)" : "#ffffff",
		color:       isFollowing[uid] ? "#ffffff" : "#000000",
		border:      isFollowing[uid] ? "1px solid rgba(255,255,255,0.2)" : "1px solid #000000",
		borderRadius: 20,
		padding:     compact ? "6px 14px" : "6px 16px",
		fontFamily:  "'DM Sans', sans-serif",
		fontSize:    12,
		fontWeight:  700,
		cursor:      followLoading[uid] ? "default" : "pointer",
		opacity:     followLoading[uid] ? 0.7 : 1,
		flexShrink:  0,
		transition:  "all 0.15s",
	});
	const followBtnLabel = (uid) => followLoading[uid] ? "…" : isFollowing[uid] === "requested" ? i18n.t("social.requested", "Requested") : isFollowing[uid] ? i18n.t("common.following") : i18n.t("common.follow");

	//  mapPost 
	const mapPost = useCallback(p => {
		const rawText = p.content ?? "";
		let text = rawText;
		let _quotedPost = null;

		if (p.quote_post) {
			const q   = p.quote_post;
			const qsp = q.user?.social_profiles?.[0] ?? null;
			const qName   = qsp?.display_name || q.user?.name || q.user?.username || "User";
			const qHandle = qsp?.handle || q.user?.username || q.user?.name || "user";
			_quotedPost = {
				id: q.post_id,
				author_user_id: q.user?.user_id ?? null,
				author_profile_id: qsp?.profile_id ?? null,
				user: qName,
				handle: `@${qHandle}`,
				avatar: qName.slice(0, 1).toUpperCase(),
				avatar_url: q.user?.profile_photo_url ?? q.user?.avatar_url ?? qsp?.profile_pic_url ?? null,
				avatarColor: "#2563eb",
				time: q.created_at ? timeAgo(q.created_at) : timeAgo(null),
				text: q.content ?? "",
				media_url:  q.media_url  ?? null,
				media_type: q.media_type ?? null,
				verified: qsp?.is_verified ?? false,
			};
		} else {
			const QUOTE_MARKER = "↩ Quoting ";
			const markerIdx    = rawText.indexOf(QUOTE_MARKER);
			if (markerIdx !== -1) {
				const after      = rawText.slice(markerIdx + QUOTE_MARKER.length);
				const colonQuote = after.indexOf(': "');
				if (colonQuote !== -1) {
					const qText = after.slice(colonQuote + 3, after.endsWith('"') ? -1 : undefined);
					text = rawText.slice(0, markerIdx).replace(/[\s\n]+$/, "");
					_quotedPost = { _fromText: true, text: qText, media_url: null, media_type: null };
				}
			}
		}

		const sp           = p.user?.social_profiles?.[0] ?? null;
		const authorName   = sp?.display_name || p.user?.name || p.user?.username || "User";
		const authorHandle = sp?.handle || p.user?.username || p.user?.name || "user";

		return {
			id:                p.post_id,
			post_id:           p.post_id,
			author_user_id:    p.user?.user_id ?? null,
			author_profile_id: sp?.profile_id ?? null,
			user:              authorName,
			handle:            `@${authorHandle}`,
			avatar:            authorName.slice(0, 1).toUpperCase(),
			avatar_url:        p.user?.profile_photo_url ?? p.user?.avatar_url ?? sp?.profile_pic_url ?? null,
			avatarColor:       "#2563eb",
			time:              timeAgo(p.created_at),
			created_at:        p.created_at ?? null,
			text,
			media_url:         p.media_url  ?? null,
			media_type:        p.media_type ?? null,
			hls_url:           p.hls_url ?? null,
			thumbnail_url:     p.thumbnail_url ?? null,
			poll:              mapTownHallPoll(p),
			pinned_product:    p.pinned_product ?? null,
			is_sensitive:      p.is_sensitive ?? false,
			is_banned:         p.is_banned ?? false,
			likes:             p._count?.likes   ?? 0,
			comments:          p._count?.replies ?? 0,
			reposts:           p._count?.reposts ?? 0,
			views: 			   postViews(p),
			saved: p.saved ?? (p.saves?.some(s => String(s.user_id) === String(currentUserId)) ?? false),
			liked:             p.liked   ?? p.is_liked_by_me ?? false,
			reposted:          p.reposted ?? false,
			scheduled_at:      p.scheduled_at ?? null,
			verified:          sp?.is_verified ?? false,
			verification_type: sp?.verification_type ?? 'NONE',
			_quotedPost,
			_repostBy: p._repostBy ?? null,
			_repostOf: p._repostOf ?? ((p._repostBy || p._repostUserId) ? p.post_id : null),
			_repostUserId: p._repostUserId ?? null,
			// Sponsored (ad) shadow-post fields injected by the backend ad engine.
			// Stable per-slot key: every sponsored card carries the same shadow post id.
			feed_item_key: p.feed_item_key ?? null,
			is_ad:       p.is_ad ?? false,
			campaign_id: p.campaign_id ?? null,
			cta_text:    p.cta_text ?? null,
			target_url:  p.target_url ?? null,
		};
	}, []);
	mapPostRef.current = mapPost;

	useEffect(() => {
		if (tab !== 'trending') return;

		setTrendingPostsLoaded(false);
		getTownHallTrending(1, 20)
			.then(data => {	
				const arr = Array.isArray(data) ? data : (data?.data ?? []);
				setTrendingPosts(foldSelfReposts(arr.map(mapPost), currentUserId));
				setTrendingPostsLoaded(true);
			})
			.catch(() => {
				setTrendingPosts([]);
				setTrendingPostsLoaded(true);
			});
	}, [tab, mapPost, currentUserId]);

	// #470: load the "Post of the Week" spotlight once (endpoint returns null when nothing qualifies).
	useEffect(() => {
		let alive = true;
		getTownHallSpotlight()
			.then(data => {
				const p = data && (data.data ?? data);
				if (alive && p && (p.post_id ?? p.id)) setSpotlightPost(mapPost(p));
			})
			.catch(() => {});
		return () => { alive = false; };
	}, [mapPost]);


	/* ── Feed loading ── */
	const loadFeedPage = useCallback(async (page) => {
		if (loadingMoreRef.current) return;
		loadingMoreRef.current = true;
		if (page > 1) setLoadingMore(true);
		try {
			const data = await getTownHallFeed(page, 20);
			const arr  = Array.isArray(data) ? data : (data?.data ?? data?.posts ?? []);
			if (arr.length < 20) setHasMorePosts(false);
			if (page === 1) setFeedError(null);
			if (!arr.length) return;
			const mapped = foldSelfReposts(arr.map(mapPost), currentUserId);
			setPosts(prev => page === 1 ? mapped : foldSelfReposts([...prev, ...mapped], currentUserId));
		} catch (err) {
			if (page === 1) {
				const msg = err?.response?.data?.message || i18n.t("social.feedLoadFailed", "Could not load the Town Hall feed.");
				setFeedError(msg);
				notify({ title: i18n.t("common.error", "Error"), message: msg });
			} else {
				feedPageRef.current = Math.max(1, page - 1);
			}
		}
		finally {
			loadingMoreRef.current = false;
			setLoadingMore(false);
			if (page === 1) setFeedReady(true);
		}
	}, [mapPost, notify, currentUserId]);

	const loadFollowingPage = useCallback(async (page) => {
		if (loadingFollowingRef.current) return;
		loadingFollowingRef.current = true;
		if (page > 1) setLoadingMore(true);
		try {
			const data = await getTownHallFollowing(page, 20);
			const arr  = Array.isArray(data) ? data : (data?.data ?? data?.posts ?? []);
			if (arr.length < 20) setHasMoreFollowing(false);
			const mapped = foldSelfReposts(arr.map(mapPost), currentUserId);
			setFollowingPosts(prev => (page === 1 || prev === null) ? mapped : foldSelfReposts([...(prev || []), ...mapped], currentUserId));
		} catch {
			if (page === 1) setFollowingPosts([]);
			else followingPageRef.current = Math.max(1, page - 1);
		}
		finally { loadingFollowingRef.current = false; setLoadingMore(false); }
	}, [mapPost, currentUserId]);

	const handleFeedScroll = useCallback((e) => {
		const el = e.currentTarget;
		if (el.scrollHeight - el.scrollTop - el.clientHeight >= 400) return;
		if (loadingMoreRef.current) return;
		if (tab === "following") {
			if (!hasMoreFollowing || loadingFollowingRef.current) return;
			const next = followingPageRef.current + 1;
			followingPageRef.current = next;
			loadFollowingPage(next);
		} else {
			if (!hasMorePosts || loadingMoreRef.current) return;
			const next = feedPageRef.current + 1;
			feedPageRef.current = next;
			loadFeedPage(next);
		}
	}, [tab, hasMorePosts, hasMoreFollowing, loadFeedPage, loadFollowingPage]);

	const handleViewCountUpdate = useCallback((postId, newCount) => {
		const apiId = townHallApiId({ id: postId });
		setPosts(prev => prev.map(p => (townHallApiId(p) === apiId || p.id === postId) ? { ...p, views: newCount } : p));
		setFollowingPosts(prev => prev ? prev.map(p => (townHallApiId(p) === apiId || p.id === postId) ? { ...p, views: newCount } : p) : prev);
	}, []);

	useEffect(() => { loadFeedPage(1); }, [loadFeedPage]);

	useEffect(() => {
		const pid = new URLSearchParams(window.location.search).get("post");
		if (!pid) return;
		getTownHallPost(pid).then(data => {
			const raw = data?.data ?? data;
			if (raw && (raw.post_id ?? raw.id) != null) setSelectedPost(mapPost(raw));
		}).catch(() => {});
	}, [mapPost]);

	useEffect(() => {
		if (tab !== "following" || followingPosts !== null) return;
		followingPageRef.current = 1;
		setHasMoreFollowing(true);
		loadFollowingPage(1);
	}, [tab, followingPosts, loadFollowingPage]);

	/* Real hover card counts (Doc 1) */
	useEffect(() => {
		const pid = activeProfilePost?.author_profile_id;
		if (!pid) { setHoverCounts(null); return; }
		let live = true;
		setHoverCounts(null);
		getFollowCounts(pid).then(res => {
			if (!live) return;
			const c = res?.data?._count ?? res?._count ?? res?.data ?? res ?? {};
			setHoverCounts({ followers: c.followers ?? 0, following: c.following ?? 0 });
		}).catch(() => live && setHoverCounts({ followers: 0, following: 0 }));
		return () => { live = false; };
	}, [activeProfilePost?.author_profile_id]);

	/* Trending topics (Town Hall hashtags) — empty on failure, never invent tags */
	useEffect(() => {
		getTownHallTrendingTopics(10).then(data => {
			const arr = Array.isArray(data?.topics) ? data.topics : (Array.isArray(data) ? data : (data?.data ?? []));
			const mapped = arr
				.map(t => {
					const raw = t.tag ?? t.hashtag ?? t.name ?? "";
					const tag = raw.startsWith("#") ? raw : (raw ? `#${raw}` : "");
					return { tag, posts: `${fmtViews(t.count ?? t.post_count ?? 0)} posts`, cat: t.category ?? "Trending" };
				})
				.filter(t => t.tag);
			setTrendingTags(mapped);
			setTrendingLoaded(true);
		}).catch(() => { setTrendingTags([]); setTrendingLoaded(true); });
	}, []);

	/* Voices to Follow — dedicated endpoint, not inventing from feed authors */
	useEffect(() => {
		let alive = true;
		getTownHallVoicesToFollow(8).then(data => {
			if (!alive) return;
			const arr = Array.isArray(data?.users) ? data.users : (Array.isArray(data) ? data : (data?.data ?? []));
			const mapped = arr.map(u => {
				const name = u.display_name || u.name || u.username || u.handle || "User";
				const handle = u.handle || u.username || "user";
				return {
					author_user_id: u.user_id ?? null,
					author_profile_id: u.profile_id ?? null,
					user: name,
					handle: handle.startsWith("@") ? handle : `@${handle}`,
					avatar: name.slice(0, 1).toUpperCase(),
					avatar_url: u.profile_pic_url ?? null,
					avatarColor: "#2563eb",
					verified: u.is_verified ?? false,
				};
			}).filter(u => u.author_user_id);
			setVoicesToFollow(mapped);
			setIsFollowing(prev => {
				const next = { ...prev };
				arr.forEach(u => {
					if (u.user_id != null && u.is_following) next[u.user_id] = true;
				});
				return next;
			});
			setVoicesLoaded(true);
		}).catch(() => { if (alive) { setVoicesToFollow([]); setVoicesLoaded(true); } });
		return () => { alive = false; };
	}, []);

	/* Search debounce */
	useEffect(() => {
		clearTimeout(searchDebounceRef.current);
		const q = exploreQuery.trim();
		if (!q) { setSearchResults(null); setSearchLoading(false); return; }
		setSearchLoading(true);
		searchDebounceRef.current = setTimeout(() => {
			// Accounts + hashtags (existing) and post content (#338) in parallel.
			Promise.allSettled([searchContent(q), searchTownHallPosts(q)]).then(([accRes, postRes]) => {
				const data     = accRes.status === "fulfilled" ? accRes.value : null;
				const payload  = data?.data ?? data ?? {};
				const profiles = (payload.profiles ?? []).map(p => ({
					profile_id: p.profile_id ?? null,
					user_id:    p.user_id ?? null,
					user:       p.display_name || p.handle || "User",
					handle:     `@${p.handle ?? "user"}`,
					avatar:     (p.display_name || p.handle || "U").slice(0, 2).toUpperCase(),
					avatar_url: p.profile_pic_url ?? null,
					avatarColor: "#2563eb",
					verified:   p.is_verified ?? false,
				}));
				const tags = (payload.tags ?? []).map(t => ({
					tag:   t.name ? (t.name.startsWith("#") ? t.name : `#${t.name}`) : (t.tag ?? ""),
					posts: `${fmtViews(t.post_count ?? t.count ?? 0)} posts`,
				})).filter(t => t.tag);
				const postPayload = postRes.status === "fulfilled" ? postRes.value : null;
				const rawPosts = Array.isArray(postPayload?.posts) ? postPayload.posts
					: (Array.isArray(postPayload) ? postPayload : []);
				// Search-posts returns the RAW post shape (author under .user with
				// social_profiles). SocialPostCard expects the normalized card shape, so
				// run it through mapPost like the feed/saved/trending lists do — otherwise
				// it renders the raw user object as a child and throws (React #31).
				const posts = rawPosts.map(mapPost);
				setSearchResults({ profiles, tags, posts });
			}).catch(() => setSearchResults({ profiles: [], tags: [], posts: [] }))
			.finally(() => setSearchLoading(false));
		}, 400);
		return () => clearTimeout(searchDebounceRef.current);
	}, [exploreQuery, mapPost]);

	/* ── Feed helpers ── */
	const dropFromFeeds = (pred) => {
		setPosts(prev => prev.filter(p => !pred(p)));
		setFollowingPosts(prev => prev ? prev.filter(p => !pred(p)) : prev);
		setSavedPosts(prev => prev.filter(p => !pred(p)));
		setTrendingPosts(prev => prev ? prev.filter(p => !pred(p)) : prev);
		setSpotlightPost(prev => (prev && pred(prev)) ? null : prev);
	};

	/* Avatar hover card */
	function handleAvatarEnter(post, rect) {
		clearTimeout(profileHoverTimer.current);
		profileHoverTimer.current = setTimeout(() => {
			setProfileCardPos({ x: Math.min(rect.left, window.innerWidth - 292), bottom: window.innerHeight - rect.top + 10 });
			setActiveProfilePost(post);
		}, 300);
	}
	function handleAvatarLeave() { clearTimeout(profileHoverTimer.current); profileHoverTimer.current = setTimeout(() => setActiveProfilePost(null), 200); }
	function handleProfileCardEnter() { clearTimeout(profileHoverTimer.current); }
	function handleProfileCardLeave() { clearTimeout(profileHoverTimer.current); profileHoverTimer.current = setTimeout(() => setActiveProfilePost(null), 200); }

	/* ── Post actions ── */
	const handlePost = async (text, mediaFile, scheduledAt = null, pollOptions = null) => {
		const u           = getUser();
		const displayName = u?.name || "You";
		const initials    = displayName.slice(0, 2).toUpperCase();
		const fallbackId  = u?.user_id || u?.id || u?.profile_id;
		const isScheduled = !!scheduledAt;
		const poll_options = Array.isArray(pollOptions) && pollOptions.length >= 2 ? pollOptions : null;

		let mediaUrl = null, mediaType = null;
		if (mediaFile) {
			try { setUploading(true); const res = await uploadTownHallMedia(mediaFile); mediaUrl = res.url; mediaType = res.media_type; }
			catch { notify({ title: i18n.t("social.uploadFailed"), message: i18n.t("social.uploadFailedMessage") }); setUploading(false); throw new Error("upload_failed"); }
			finally { setUploading(false); }
		}

		const optimisticPoll = poll_options ? {
			options: poll_options.map((t, i) => ({ option_id: `tmp_${i}`, text: t, votes_count: 0 })),
			total_votes: 0,
			voted_option_id: null,
		} : null;
		const newPost = {
			id: `tmp_${Date.now()}`,
			post_id: null,
			author_user_id: fallbackId ?? null,
			user_id: fallbackId ?? null,
			user: displayName,
			handle: `@${u?.username || u?.handle || "you"}`,
			avatar: initials,
			avatar_url: u?.profile_pic_url ?? null,
			avatarColor: "#2563eb",
			time: "now",
			text,
			media_url: mediaUrl,
			media_type: mediaType,
			poll: optimisticPoll,
			likes: 0, comments: 0, reposts: 0, verified: false,
		};
		if (!isScheduled) setPosts(p => [newPost, ...p]);

		if (fallbackId) {
			const payload = {
				content: text,
				parent_id: null,
				media_url: mediaUrl,
				media_type: mediaType,
				quote_post_id: null,
				scheduled_at: scheduledAt,
				...(poll_options ? { poll_options } : {}),
			};
			const apiCall = (mediaUrl || poll_options)
				? createTownHallPostFull(payload)
				: createTownHallPost(text, null, scheduledAt);
			try {
				const savedPost = await apiCall;
				if (isScheduled) {
					notify({ title: i18n.t("social.postScheduled"), message: i18n.t("social.postScheduledMessage", { date: new Date(scheduledAt).toLocaleString() }), danger: false });
					return savedPost;
				}
				const mapped = savedPost?.post_id != null ? mapPost(savedPost) : null;
				setPosts(p => p.map(post => post.id === newPost.id ? (mapped ? { ...mapped, _quotedPost: post._quotedPost } : { ...post, id: savedPost.post_id, post_id: savedPost.post_id, author_user_id: fallbackId }) : post));
				return savedPost;
			} catch (err) {
				const msg = err?.response?.data?.message || "Failed to post — please try again.";
				if (!isScheduled) setPosts(p => p.filter(post => post.id !== newPost.id));
				notify({ title: i18n.t("social.couldntPost"), message: msg });
				throw err;
			}
		} else {
			notify({ title: i18n.t("social.sessionError"), message: i18n.t("social.sessionErrorMessage") });
		}
	};

	const handleRepost = (post, isReposting = true) => {
		const thid = townHallApiId(post);
		if (!thid) return Promise.resolve();
		const wanted = !!isReposting;
		const apply = (reposted, count) => {
			const patch = (x) => {
				if (!x) return x;
				const sameApi = townHallApiId(x) != null && String(townHallApiId(x)) === String(thid);
				const sameCard = post?.id != null && String(x.id) === String(post.id);
				if (!sameApi && !sameCard) return x;
				const was = !!x.reposted;
				let nextReposts = x.reposts ?? 0;
				if (typeof count === "number") nextReposts = count;
				else if (was !== reposted) nextReposts = Math.max(0, nextReposts + (reposted ? 1 : -1));
				return { ...x, reposted, reposts: nextReposts };
			};
			const nextList = (list) => foldSelfReposts((list || []).map(patch), currentUserId);
			setPosts(nextList);
			setFollowingPosts(list => list ? nextList(list) : list);
			setSavedPosts(nextList);
			setTrendingPosts(list => list ? nextList(list) : list);
			setSpotlightPost(prev => patch(prev));
			setSelectedPost(prev => patch(prev));
		};
		apply(wanted);
		return toggleTownHallRepost(thid).then(res => {
			const body = res?.data ?? res;
			if (typeof body?.reposted === "boolean") apply(body.reposted, body.count ?? body.reposts);
		}).catch(err => {
			apply(!wanted);
			notify({ title: i18n.t("common.error", "Error"), message: err?.response?.data?.message || i18n.t("social.couldntRepost", "Could not update repost.") });
			throw err;
		});
	};

	const handleQuotePost = async (text, mediaFile, quotedPost) => {
		const u           = getUser();
		const displayName = u?.name || "You";
		const initials    = displayName.slice(0, 2).toUpperCase();
		const fallbackId  = u?.user_id || u?.id || u?.profile_id;

		let mediaUrl = null, mediaType = null;
		if (mediaFile) {
			try { setUploading(true); const res = await uploadTownHallMedia(mediaFile); mediaUrl = res.url; mediaType = res.media_type; }
			catch { notify({ title: i18n.t("social.uploadFailed"), message: i18n.t("social.uploadFailedMessage") }); setUploading(false); throw new Error("upload_failed"); }
			finally { setUploading(false); }
		}

		const newPost = { id: Date.now(), post_id: null, user: displayName, handle: `@${u?.username || u?.handle || "you"}`, avatar: initials, avatar_url: u?.profile_pic_url ?? null, avatarColor: "#2563eb", time: "now", text, media_url: mediaUrl, media_type: mediaType, likes: 0, comments: 0, reposts: 0, verified: false, _quotedPost: quotedPost };
		setPosts(p => [newPost, ...p]);

		if (fallbackId) {
			const quoteId = townHallApiId(quotedPost);
			createTownHallPostWithMedia(text, null, mediaUrl, mediaType, quoteId)
				.then(savedPost => { setPosts(p => p.map(post => post.id === newPost.id ? { ...post, id: savedPost.post_id, _quotedPost: post._quotedPost } : post)); })
				.catch(err => {
					setPosts(p => p.filter(post => post.id !== newPost.id));
					notify({ title: i18n.t("social.couldntPost"), message: err?.response?.data?.message || "Failed to post — please try again." });
				});
		}
	};

	const handleNotInterested = (post) => {
		dropFromFeeds(p => p.id === post.id);
		notify({ title: i18n.t("social.gotIt"), message: i18n.t("social.fewerPostsLikeThis"), danger: false });
	};
	const handleMute = async (post) => {
		const pid = post.author_profile_id;
		if (!pid) {
			notify({ title: i18n.t("common.error", "Error"), message: i18n.t("social.muteFailed", "Could not mute this user.") });
			return;
		}
		try {
			await muteUser(pid);
			dropFromFeeds(p => p.author_user_id === post.author_user_id);
			if (selectedPost?.author_user_id === post.author_user_id) closePost();
			notify({ title: i18n.t("profile.muted"), message: i18n.t("social.mutedMessage", { handle: post.handle }), danger: false });
		} catch (err) {
			notify({ title: i18n.t("common.error", "Error"), message: err?.response?.data?.message || i18n.t("social.muteFailed", "Could not mute this user.") });
		}
	};
	const handleBlock = async (post) => {
		const ok = await confirm({ title: i18n.t("social.blockConfirmTitle", { handle: post.handle }), message: i18n.t("social.blockConfirmMessage"), confirmLabel: i18n.t("profile.block") });
		if (!ok) return;
		const pid = post.author_profile_id;
		if (!pid) {
			notify({ title: i18n.t("common.error", "Error"), message: i18n.t("social.blockFailed", "Could not block this user.") });
			return;
		}
		try {
			await blockUser(pid);
			dropFromFeeds(p => p.author_user_id === post.author_user_id);
			if (selectedPost?.author_user_id === post.author_user_id) closePost();
			notify({ title: i18n.t("profile.blocked"), message: i18n.t("social.blockedMessage", { handle: post.handle }), danger: false });
		} catch (err) {
			notify({ title: i18n.t("common.error", "Error"), message: err?.response?.data?.message || i18n.t("social.blockFailed", "Could not block this user.") });
		}
	};
	// Open the reason picker for THIS post. It used to fire-and-forget a hardcoded
	// "Reported from Town Hall" against the author's PROFILE — so the moderator got a
	// report that named neither the offending post nor a real reason, and the toast
	// claimed success even when the call failed.
	const handleReport = (post) => setReportTarget(post);
	const handleFollowAuthor = async (post) => {
		const uid = post.author_user_id;
		if (!uid) return;
		try {
			const action = await handleFollowToggle(uid);
			if (action === "unfollowed" || action === "cancelled") {
				notify({ title: i18n.t("common.unfollowed", "Unfollowed"), message: i18n.t("social.unfollowed", { handle: post.handle, defaultValue: `Unfollowed ${post.handle}` }), danger: false });
			} else if (action === "requested") {
				notify({ title: i18n.t("social.requested", "Requested"), message: i18n.t("social.followRequested", "Follow request sent."), danger: false });
			} else {
				notify({ title: i18n.t("videos.following"), message: i18n.t("social.nowFollowing", { handle: post.handle }), danger: false });
			}
		} catch {
			notify({ title: i18n.t("common.error", "Error"), message: i18n.t("social.followFailed", "Could not update follow.") });
		}
	};

	const confirmDeletePost = () => {
		const target = pendingDelete;
		if (!target?.id) { setPendingDelete(null); return; }
		setDeleting(true);
		deleteTownHallPost(townHallApiId(target))
			.then(() => {
				const apiId = townHallApiId(target);
				dropFromFeeds(p => townHallApiId(p) === apiId || p.id === target.id);
				if (townHallApiId(selectedPost) === apiId || selectedPost?.id === target.id) closePost();
				setPendingDelete(null);
			})
			.catch(err => {
				notify({ title: i18n.t("common.error", "Error"), message: err?.response?.data?.message || i18n.t("social.deleteFailed", "Could not delete this post.") });
			})
			.finally(() => setDeleting(false));
	};

	const handleLike = (p, nextLiked) => {
		const id = townHallApiId(p);
		const wanted = typeof nextLiked === "boolean" ? nextLiked : !p.liked;
		const apply = (liked, likes) => {
			const patch = (x) => {
				if (!x) return x;
				const sameApi = id != null && townHallApiId(x) != null && String(townHallApiId(x)) === String(id);
				const sameCard = p?.id != null && String(x.id) === String(p.id);
				if (!sameApi && !sameCard) return x;
				const was = !!x.liked;
				let nextLikes = x.likes ?? 0;
				if (typeof likes === "number") nextLikes = likes;
				else if (was !== liked) nextLikes = Math.max(0, nextLikes + (liked ? 1 : -1));
				return { ...x, liked, likes: nextLikes };
			};
			setPosts(list => list.map(patch));
			setFollowingPosts(list => list ? list.map(patch) : list);
			setSavedPosts(list => list.map(patch));
			setTrendingPosts(list => list ? list.map(patch) : list);
			setSpotlightPost(prev => patch(prev));
			setSelectedPost(prev => patch(prev));
		};
		apply(wanted);
		if (!id) return Promise.resolve();
		return toggleTownHallLike(id).then(res => {
			const body = res?.data ?? res;
			if (typeof body?.liked === "boolean") apply(body.liked, body.likes ?? body.count ?? body.newCount);
		}).catch(err => {
			apply(!wanted);
			notify({ title: i18n.t("common.error", "Error"), message: err?.response?.data?.message || i18n.t("social.likeFailed", "Could not update like.") });
			throw err;
		});
	};

	const handlePollVoted = (p, poll) => {
		const id = townHallApiId(p);
		const patch = (list) => !list ? list : list.map(x => townHallApiId(x) === id ? { ...x, poll } : x);
		setPosts(patch);
		setFollowingPosts(patch);
		setSavedPosts(patch);
		setTrendingPosts(patch);
		setSpotlightPost(prev => (prev && townHallApiId(prev) === id) ? { ...prev, poll } : prev);
		setSelectedPost(prev => (prev && townHallApiId(prev) === id) ? { ...prev, poll } : prev);
	};

	/* Shared card props */
	// Sponsored cards are injected at three offsets and all share ONE shadow post id, so
	// post.id is not unique across the feed. The backend sends feed_item_key for exactly this.
	const sharedCardProps = (post, i) => ({
		key: post.feed_item_key ?? post.id, post, delay: i * 40,
		onViewPost:      openPost,
		onViewQuotedPost: openTownHallPostById,
		onViewProfile:   (p) => goToTownhallProfile(p),
		onRepost:        handleRepost,
		onQuote:         (p) => setQuoteModalPost(p),
		onLike:          handleLike,
		onReplyModal:    (p) => setReplyModalPost(p),
		onAvatarEnter:   handleAvatarEnter,
		onAvatarLeave:   handleAvatarLeave,
		onBookmark: (p, next) => {
			const id = townHallApiId(p);
			setSavedPosts(prev => next ? [p, ...prev] : prev.filter(x => townHallApiId(x) !== id && x.id !== p.id));
			if (!id) return Promise.resolve();
			return toggleSavePost(id).catch(err => {
				setSavedPosts(prev => next ? prev.filter(x => townHallApiId(x) !== id && x.id !== p.id) : [p, ...prev]);
				notify({ title: i18n.t("common.error", "Error"), message: err?.response?.data?.message || i18n.t("social.saveFailed", "Could not update bookmark.") });
				throw err;
			});
		},
		onDelete:        (p) => setPendingDelete(p),
		onNotInterested: handleNotInterested,
		onMute:          handleMute,
		onBlock:         handleBlock,
		onReport:        handleReport,
		onFollowAuthor:  handleFollowAuthor,
		liveNow,
		isFollowing,
		followState: isFollowing[post.author_user_id],
		onNotify:        notify,
		onPollVoted: handlePollVoted,
	});

	/* Sort */
	const sortedPosts = (() => {
		const cfg      = SORT_OPTIONS.find(o => o.id === sortBy) ?? SORT_OPTIONS[0];
		const now      = Date.now();
		const stamped  = posts.map(p => ({ p, t: p.created_at ? new Date(p.created_at).getTime() : now }));
		const windowed = cfg.days ? stamped.filter(x => now - x.t <= cfg.days * 86400000) : stamped;
		windowed.sort((a, b) => cfg.order === "asc" ? a.t - b.t : b.t - a.t);
		return windowed.map(x => x.p);
	})();

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 32, overflow: "hidden" }}>
			{socialDialog}
			<ReportModal
				open={!!reportTarget}
				onClose={() => setReportTarget(null)}
				targetType="TOWN_HALL_POST"
				targetId={townHallApiId(reportTarget) ?? reportTarget?.post_id}
				title={i18n.t("social.reportPost", "Report post")}
				onSubmitted={() => notify({ title: i18n.t("social.thanksForReporting"), message: i18n.t("social.reportReviewMessage"), danger: false })}
			/>
			<div style={{ flex: 1, display: "flex", overflow: "hidden", width: "100%" }}>

				{/* ── Left sidebar — Doc 2 design ── */}
				{!(isMobile || isSplitMode) && !selectedPost && (
					<div style={{ width: 280, flexShrink: 0, padding: "16px 20px 20px 0", overflowY: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}>
						{/* Voices to Follow */}
						<div className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 16, marginBottom: 16, overflow: "hidden" }}>
							<div style={{ padding: "16px 16px 10px", display: "flex", alignItems: "center", gap: 9 }}>
								<span style={{ width: 3, height: 15, borderRadius: 2, background: "#2563eb", flexShrink: 0 }} />
								<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 17, letterSpacing: "0.05em", textTransform: "uppercase", margin: 0 }}>{i18n.t("social.voicesToFollow")}</p>
							</div>
							{!voicesLoaded ? (
								Array.from({ length: 5 }).map((_, i) => <SkeletonTownHallVoice key={i} />)
							) : (
								voicesToFollow.slice(0, showAllVoices ? voicesToFollow.length : 5).map((p) => (
								<div key={p.author_user_id} onClick={() => goToTownhallProfile(p)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", cursor: "pointer", transition: "background 0.12s" }}
									onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-raised)"}
									onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
									<Avatar url={p.avatar_url} initials={p.avatar} alt={p.user} size={38}
										color={p.avatarColor} style={{ background: p.avatarColor, fontSize: 13 }} />
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ display: "flex", alignItems: "center", gap: 5 }}>
											<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.user}</p>
											{p.verified && <svg width="12" height="12" viewBox="0 0 24 24" fill="#2563eb"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
										</div>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{p.handle}</p>
									</div>
									<button onClick={e => { e.stopPropagation(); handleFollowToggle(p.author_user_id); }} style={followBtnStyle(p.author_user_id)}>
										{followBtnLabel(p.author_user_id)}
									</button>
								</div>
								))
							)}
							{voicesLoaded && voicesToFollow.length === 0 && (
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, padding: "4px 16px 14px", margin: 0 }}>{i18n.t("social.noVoices", "No suggestions right now")}</p>
							)}
							{voicesToFollow.length > 0 && (
							<div style={{ padding: "12px 16px" }}>
								<button
									onClick={() => setShowAllVoices(!showAllVoices)}
									style={{ background: "none", border: "none", color: "#2563eb", fontFamily: "'DM Sans', sans-serif", fontSize: 14, cursor: "pointer", padding: 0 }}
								>
									{showAllVoices ? i18n.t("common.showLess") : i18n.t("social.showAllVoices")}
								</button>
							</div>
							)}
						</div>
						{/* Trending Now */}
						<div className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 16, overflow: "hidden" }}>
							<div style={{ padding: "16px 16px 10px", display: "flex", alignItems: "center", gap: 9 }}>
								<span style={{ width: 3, height: 15, borderRadius: 2, background: "#2563eb", flexShrink: 0 }} />
								<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 17, letterSpacing: "0.05em", textTransform: "uppercase", margin: 0 }}>{i18n.t("social.trendingNow")}</p>
							</div>
							{!trendingLoaded ? (
								Array.from({ length: 5 }).map((_, i) => <SkeletonTownHallTopic key={i} />)
							) : trendingLoaded && trendingTags.length === 0 ? (
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, padding: "4px 16px 14px", margin: 0 }}>{i18n.t("social.noTrending")}</p>
							) : trendingTags.slice(0, showAllTrending ? trendingTags.length : 5).map((topic, i) => (
								<div key={i} onClick={() => { setExploreQuery(topic.tag || ""); setTab("explore"); closePost(); }} {...clickableProps(() => { setExploreQuery(topic.tag || ""); setTab("explore"); closePost(); })} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", cursor: "pointer", transition: "background 0.12s" }}
									onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-raised)"}
									onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
									<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 19, color: "rgba(96,165,250,0.6)", width: 18, textAlign: "center", flexShrink: 0 }}>{i + 1}</span>
									<div style={{ flex: 1, minWidth: 0 }}>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{topic.tag}</p>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{topic.cat} · {topic.posts}</p>
									</div>
								</div>
							))}
							{trendingLoaded && trendingTags.length > 0 && (
							<div style={{ padding: "12px 16px" }}>
								<button
									onClick={() => setShowAllTrending(!showAllTrending)}
									style={{ background: "none", border: "none", color: "#2563eb", fontFamily: "'DM Sans', sans-serif", fontSize: 14, cursor: "pointer", padding: 0 }}
								>
									{showAllTrending ? i18n.t("common.showLess") : i18n.t("social.showAllTopics")}
								</button>
							</div>
							)}
						</div>
					</div>
				)}

				{/* ── Main feed column ── */}
				<div style={{ flex: 1, display: "flex", flexDirection: "column", borderLeft: (isMobile || isSplitMode) ? "none" : "1px solid var(--color-border-subtle)", borderRight: (isMobile || isSplitMode) ? "none" : "1px solid var(--color-border-subtle)", overflow: "hidden" }}>

					{/* Header */}
					{(isMobile || isSplitMode) ? (
						<>
							<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: "1px solid var(--color-border-subtle)", flexShrink: 0 }}>
								{selectedPost ? (
									<button onClick={closePost} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 14, padding: 0 }}>
										<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
										Back
									</button>
								) : (() => {
									// #373: mobile Town Hall header — show the signed-in user's clickable
									// profile photo (avatar hydrated onto the auth user as profile_pic_url),
									// falling back to their name initial, instead of a static "Y" placeholder.
									const meHdr = getUser();
									const meAvatar = meHdr?.profile_pic_url;
									const meInitial = (meHdr?.name || meHdr?.display_name || meHdr?.username || "").trim().charAt(0).toUpperCase();
									return (
										<button onClick={() => { delete window.__profileTargetId; window.__nav && window.__nav("profile"); }} aria-label={i18n.t("nav.profile", { defaultValue: "Your profile" })} style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, border: "none", cursor: "pointer", flexShrink: 0 }}>
											{/* The slot is a <button>, so keep the <img> here and let SafeImage swap in the same
											    initial/person-glyph node the no-photo case already renders (#457). */}
											<SafeImage src={meAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
												fallback={meInitial
													? <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 12, color: "#fff" }}>{meInitial}</span>
													: <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>} />
										</button>
									);
								})()}
								<span className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: "0.04em", textTransform: "uppercase" }}>{i18n.t("social.townHall")}</span>
							</div>
							{!selectedPost && (
								<div style={{ display: "flex", borderBottom: "1px solid var(--color-border-subtle)", flexShrink: 0 }}>
									{SOCIAL_TABS.map(t => (
										<button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "11px 0", background: "none", border: "none", borderBottom: `2px solid ${tab === t.id ? "#2563eb" : "transparent"}`, color: tab === t.id ? "#2563eb" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
											{t.label}
										</button>
									))}
								</div>
							)}
						</>
					) : (
						<div style={{ padding: "20px 20px 0", borderBottom: "1px solid var(--color-border-subtle)", flexShrink: 0 }}>
							<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
								<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 24, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>{i18n.t("social.landingTitle")}</h1>
							</div>
							{/* #381/#391: convenient always-visible search at the top of Town Hall.
							    Typing drives the Explore search (GET /town-hall/search fan-out) so
							    people/posts are reachable without first opening the Explore tab. */}
							<div className="bg-surface-raised border border-border" style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 12, padding: "10px 14px", marginBottom: 14 }}>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
								<input
									value={tab === "explore" ? exploreQuery : ""}
									onChange={e => { if (tab !== "explore") setTab("explore"); setExploreQuery(e.target.value); }}
									onFocus={() => { if (tab !== "explore") setTab("explore"); }}
									placeholder={searchPlaceholder}
									className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 15 }} />
							</div>
						</div>
					)}

					{/* Feed / Detail */}
					<div onScroll={handleFeedScroll} className="styled-scrollbar" style={{ flex: 1, overflowY: "auto" }}>
						{selectedPost ? (
							<SocialPostDetailPage post={selectedPost} onBack={closePost} onRepost={handleRepost} onDelete={(p) => setPendingDelete(p)} noOuterPad onViewCountUpdate={handleViewCountUpdate} onFollow={handleFollowAuthor} onLike={handleLike} onPollVoted={handlePollVoted} followState={isFollowing[selectedPost.author_user_id]} />
						) : detailHydrating ? (
							<SkeletonTownHallDetail />
						) : deepLinkError ? (
							<div style={{ padding: "48px 24px", textAlign: "center" }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: "0 0 16px" }}>{deepLinkError}</p>
								<button type="button" onClick={() => {
									const id = window.location.pathname.match(/^\/townhall\/([^/]+)/)?.[1];
									if (id) openTownHallPostById(id);
									else setDeepLinkError(null);
								}} style={{ background: "#2563eb", border: "none", borderRadius: 20, padding: "8px 20px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
									{i18n.t("common.retry", "Try again")}
								</button>
							</div>
						) : (
							<>
								{/* Home tab */}
								{tab === "home" && (
									<>
										{!feedReady ? <SkeletonTownHallFeed count={4} /> : (
											<>
												{!(isMobile || isSplitMode) && (
													<>
														<TownHallXImportPanel />
														<SocialComposePage onPost={handlePost} uploading={uploading} />
													</>
												)}
												{/* Mobile suggested strip — Doc 2 design with Doc 2 follow buttons */}
												{(isMobile || isSplitMode) && (!voicesLoaded || voicesToFollow.length > 0) && (
													<div style={{ paddingBottom: 8, borderBottom: "1px solid var(--color-border-subtle)" }}>
														<p className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", padding: "12px 16px 8px", margin: 0 }}>{i18n.t("social.suggestedForYou")}</p>
														<div style={{ display: "flex", gap: 10, overflowX: "auto", paddingLeft: 16, paddingRight: 16, paddingBottom: 4, msOverflowStyle: "none", scrollbarWidth: "none" }}>
															{!voicesLoaded
																? Array.from({ length: 4 }).map((_, i) => <SkeletonTownHallSuggestedCard key={i} />)
																: voicesToFollow.slice(0, 6).map((p) => (
																// #369: tapping a suggested-for-you card (avatar/name) opens that profile.
																<div key={p.author_user_id} onClick={() => goToTownhallProfile(p)} className="bg-surface-raised border border-border-subtle" style={{ flexShrink: 0, cursor: "pointer", borderRadius: 16, padding: "14px 14px 12px", width: 140, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
																	<Avatar url={p.avatar_url} initials={p.avatar} alt={p.user} size={44}
																		color={p.avatarColor} style={{ background: p.avatarColor, fontSize: 16 }} />
																	<div style={{ textAlign: "center", width: "100%" }}>
																		<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.user}</p>
																		<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.handle}</p>
																	</div>
																	<button onClick={(e) => { e.stopPropagation(); handleFollowToggle(p.author_user_id); }} style={{ ...followBtnStyle(p.author_user_id), borderRadius: 14, padding: "5px 0", fontSize: 11, width: "100%" }}>
																		{followBtnLabel(p.author_user_id)}
																	</button>
																</div>
																))}
														</div>
													</div>
												)}
												{spotlightPost && (
													<div style={{ marginBottom: 16, borderRadius: 14, border: "1px solid rgba(37,99,235,0.35)", background: "linear-gradient(180deg, rgba(37,99,235,0.10), rgba(37,99,235,0.02))", overflow: "hidden" }}>
														<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 4px" }}>
															<svg width="15" height="15" viewBox="0 0 24 24" fill="#f5b301" stroke="#f5b301" strokeWidth="1.5" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
															<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9dc0f5" }}>Post of the Week</span>
															<span className="text-text-muted" style={{ marginLeft: "auto", fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>Most talked-about this week</span>
														</div>
														<SocialPostCard {...sharedCardProps(spotlightPost, 0)} />
													</div>
												)}
												{feedError && posts.length === 0 && (
													<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, padding: "20px 16px", margin: 0, color: "#ef4444" }}>{feedError}</p>
												)}
												{sortedPosts.map((post, i) => <SocialPostCard {...sharedCardProps(post, i)} />)}
												{loadingMore && <SkeletonTownHallFeed count={2} />}
												{!hasMorePosts && posts.length > 0 && (
													<p className="text-text-muted" style={{ textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 12, padding: "20px 0 32px" }}>{i18n.t("social.allCaughtUp")}</p>
												)}
											</>
										)}
									</>
								)}

								{tab === "following" && (
									followingPosts === null ? (
										<SkeletonTownHallFeed count={4} />
									) : followingPosts.length === 0 ? (
										<div className="text-text-secondary" style={{ textAlign: "center", padding: "56px 24px" }}>
											<p className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "0.04em", textTransform: "uppercase", margin: "0 0 6px" }}>{i18n.t("social.nothingHere")}</p>
											<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: "0 0 16px" }}>{i18n.t("social.followPeopleHint")}</p>
											<button onClick={() => setTab("explore")} style={{ background: "#2563eb", border: "none", borderRadius: 20, padding: "9px 22px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer" }}>{i18n.t("social.findPeople")}</button>
										</div>
									) : (
										<>
											{followingPosts.map((post, i) => <SocialPostCard {...sharedCardProps(post, i)} />)}
											{loadingMore && <SkeletonTownHallFeed count={2} />}
											{!hasMoreFollowing && followingPosts.length > 0 && (
												<p className="text-text-muted" style={{ textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 12, padding: "20px 0 32px" }}>You're all caught up</p>
											)}
										</>
									)
								)}

								{/* Explore tab */}
								{tab === "explore" && (
									<div style={{ padding: "16px 20px" }}>
										{/* #9: on desktop the persistent header search bar (rendered above when
										    !(isMobile || isSplitMode)) already drives Explore, so this inner search
										    box is a duplicate — two search bars appeared on Explore. Only render it
										    on mobile/split, where that header search bar is not present. */}
										{(isMobile || isSplitMode) && (
											<div className="bg-surface-raised border border-border" style={{ borderRadius: 20, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", marginBottom: 24, touchAction: "manipulation" }}>
												<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
												<input value={exploreQuery} onChange={e => setExploreQuery(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 16 }} />
											</div>
										)}
										<p className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: "0.06em", marginBottom: 14 }}>{searchLoading || searchResults ? "SEARCH RESULTS" : "SUGGESTED FOR YOU"}</p>
										{searchLoading ? (
											<>
												{Array.from({ length: 4 }).map((_, i) => <SkeletonSearchRow key={i} />)}
												<SkeletonTownHallFeed count={2} />
											</>
										) : searchResults ? (
											(searchResults.profiles.length === 0 && searchResults.tags.length === 0 && (searchResults.posts?.length ?? 0) === 0)
												? <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{i18n.t("common.noResults")}</p>
												: <>
													{searchResults.profiles.map((p, i) => (
														<div key={p.profile_id ?? p.handle ?? i} onClick={() => { if (p.user_id != null) window.__profileTargetId = p.user_id; if (window.__nav) window.__nav("profile"); }} {...clickableProps(() => { if (p.user_id != null) window.__profileTargetId = p.user_id; if (window.__nav) window.__nav("profile"); })} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--color-border-subtle)", cursor: "pointer" }}>
															<Avatar url={p.avatar_url} initials={p.avatar} size={44}
																color={p.avatarColor} style={{ background: p.avatarColor, fontSize: 16 }} />
															<div style={{ flex: 1, minWidth: 0 }}>
																<div style={{ display: "flex", alignItems: "center", gap: 5 }}>
																	<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.user}</span>
																	{p.verified && <svg width="13" height="13" viewBox="0 0 24 24" fill="#2563eb"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
																</div>
																<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{p.handle}</span>
															</div>
															<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
														</div>
													))}
													{searchResults.tags.map((t, i) => (
														<div key={`tag-${i}`} onClick={() => { setExploreQuery(t.tag || ""); setTab("explore"); }} {...clickableProps(() => { setExploreQuery(t.tag || ""); setTab("explore"); })} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--color-border-subtle)", cursor: "pointer" }}>
															<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#2563eb" }}>{t.tag}</span>
															<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{t.posts}</span>
														</div>
													))}
													{searchResults.posts?.length > 0 && (
														<>
															<p className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: "0.06em", margin: "18px 0 6px" }}>{i18n.t("social.postsHeading", { defaultValue: "POSTS" })}</p>
															{searchResults.posts.map((post, i) => <SocialPostCard {...sharedCardProps(post, i)} />)}
														</>
													)}
												</>
										) : (!feedReady
											? <SkeletonTownHallFeed count={3} />
											: posts.length === 0
											? <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, padding: "16px 0" }}>{i18n.t("social.noPostsYet")}</p>
											: posts.slice(0, 4).map((post, i) => <SocialPostCard {...sharedCardProps(post, i)} />)
										)}
									</div>
								)}

								{/* Trending tab */}
								{tab === "trending" && (
									<div>
										{/* Header */}
										<div style={{ padding: "20px 20px 0" }}>
											<p className="text-text-secondary" style={{
												fontFamily: "'Barlow Condensed', sans-serif",
												fontWeight: 800, fontSize: 18,
												letterSpacing: "0.06em", marginBottom: 4
											}}>
												TRENDING NOW
											</p>
											<p className="text-text-muted" style={{
												fontFamily: "'DM Sans', sans-serif",
												fontSize: 12, marginBottom: 16
											}}>
												Most engaging posts in the last 48 hours
											</p>
										</div>

										{/* Loading skeletons */}
										{!trendingPostsLoaded && <SkeletonTownHallFeed count={4} />}

										{/* Empty state */}
										{trendingPostsLoaded && trendingPosts?.length === 0 && (
											<div className="text-text-muted" style={{
												textAlign: "center", padding: "60px 24px"
											}}>
												<p className="text-text-secondary" style={{
													fontFamily: "'Barlow Condensed', sans-serif",
													fontWeight: 800, fontSize: 20,
													letterSpacing: "0.04em", textTransform: "uppercase",
													margin: "0 0 8px"
												}}>
													{i18n.t("social.noTrending")}
												</p>
												<p style={{
													fontFamily: "'DM Sans', sans-serif", fontSize: 14
												}}>
													{i18n.t("social.trendingCheckBack")}
												</p>
											</div>
										)}

										{/* Posts */}
										{trendingPostsLoaded && trendingPosts?.map((post, i) => (
											<SocialPostCard {...sharedCardProps(post, i)} />
										))}
									</div>
								)}

								{/* Saved tab */}
								{tab === "saved" && (
									!savedLoaded && savedPosts.length === 0 ? (
										<SkeletonTownHallFeed count={4} />
									) : savedPosts.length === 0 ? (
										<div className="text-text-muted" style={{ textAlign: "center", padding: "60px 20px", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
											{i18n.t("social.bookmarkHint")}
										</div>
									) : (
										savedPosts.map((post, i) => <SocialPostCard {...sharedCardProps(post, i)} />)
									)
								)}
							</>
						)}
					</div>
				</div>

				{/* ── Right sidebar  */}
				{!(isMobile || isSplitMode) && (
					<div style={{ width: 250, flexShrink: 0, padding: "16px 0 20px 24px", overflowY: "visible", scrollbarWidth: "none", msOverflowStyle: "none" }}>
						{tab === "home" && !selectedPost && (
							<div style={{ marginBottom: 24 }}>
								{/* Sort by */}
								<p className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 10px 2px" }}>{i18n.t("social.sortBy")}</p>
								<div style={{ position: "relative", marginBottom: 24 }}>
									<button onClick={() => setSortOpen(v => !v)} className="bg-surface-raised" style={{ width: "100%", border: `1px solid ${sortOpen ? "rgba(37,99,235,0.6)" : "var(--color-border)"}`, borderRadius: 12, padding: "11px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", transition: "border-color 0.15s" }}>
										<span style={{ display: "flex", alignItems: "center", gap: 9 }}>
											<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>
											<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600 }}>{(SORT_OPTIONS.find(o => o.id === sortBy) ?? SORT_OPTIONS[0]).label}</span>
										</span>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: sortOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><polyline points="6 9 12 15 18 9"/></svg>
									</button>
									{sortOpen && <div onClick={() => setSortOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />}
									{sortOpen && (
										<div className="bg-surface-raised border border-border" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, borderRadius: 12, padding: 6, zIndex: 30, boxShadow: "0 12px 32px rgba(0,0,0,0.5)" }}>
											{SORT_OPTIONS.map(o => (
												<button key={o.id} onClick={() => { setSortBy(o.id); setSortOpen(false); }} style={{ width: "100%", textAlign: "left", background: sortBy === o.id ? "rgba(37,99,235,0.18)" : "transparent", border: "none", borderRadius: 8, padding: "9px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: sortBy === o.id ? "#60a5fa" : "var(--color-text-secondary)", cursor: "pointer", transition: "background 0.12s" }}
													onMouseEnter={e => { if (sortBy !== o.id) e.currentTarget.style.background = "var(--color-surface-raised)"; }}
													onMouseLeave={e => { if (sortBy !== o.id) e.currentTarget.style.background = "transparent"; }}>
													{o.label}
												</button>
											))}
										</div>
									)}
								</div>
							</div>
						)}

						{/* Navigation tabs */}
						<p className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 10px 2px" }}>{i18n.t("social.browse")}</p>
						<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
							{SOCIAL_TABS.map(t => {
								const active = tab === t.id && !selectedPost;
								return (
									<button key={t.id} onClick={() => { setTab(t.id); closePost(); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", background: active ? "#2563eb" : "var(--color-surface-raised)", border: `1px solid ${active ? "#2563eb" : "var(--color-border)"}`, borderRadius: 999, color: active ? "#fff" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: "pointer", transition: "all 0.15s", textAlign: "left" }}
										onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--color-surface-raised)"; }}
										onMouseLeave={e => { if (!active) e.currentTarget.style.background = "var(--color-surface-raised)"; }}>
										{t.icon}{t.label}
									</button>
								);
							})}
						</div>
					</div>
				)}
			</div>

			{/* FAB — draggable */}
			{(isMobile || isSplitMode) && !selectedPost && (
				<button
					ref={fabRef}
					onPointerDown={e => {
						const btn = fabRef.current; if (!btn) return;
						btn.setPointerCapture(e.pointerId);
						const rect = btn.getBoundingClientRect();
						fabDragRef.current = { cx: e.clientX, cy: e.clientY, l: rect.left, t: rect.top };
					}}
					onPointerMove={e => {
						const d = fabDragRef.current; if (!d) return;
						const dx = e.clientX - d.cx, dy = e.clientY - d.cy;
						if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
						const l = Math.max(0, Math.min(window.innerWidth - 54, d.l + dx));
						const t = Math.max(60, Math.min(window.innerHeight - 120, d.t + dy));
						setFabPos({ l, t });
					}}
					onPointerUp={e => {
						const d = fabDragRef.current; if (!d) return;
						const dx = e.clientX - d.cx, dy = e.clientY - d.cy;
						const moved = Math.abs(dx) > 6 || Math.abs(dy) > 6;
						fabDragRef.current = null;
						if (!moved) { setComposeOpen(true); return; }
						// snap to nearest horizontal edge
						setFabPos(prev => prev && ({ ...prev, l: prev.l + 27 < window.innerWidth / 2 ? 12 : window.innerWidth - 66 }));
					}}
					className="bg-surface-glass border border-border" style={fabPos
						? { position: "fixed", left: fabPos.l, top: fabPos.t, width: 54, height: 54, borderRadius: "50%", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "grab", boxShadow: "0 4px 18px rgba(0,0,0,0.45)", zIndex: 50, touchAction: "none", userSelect: "none" }
						: { position: "fixed", bottom: 78, right: 20, width: 54, height: 54, borderRadius: "50%", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "grab", boxShadow: "0 4px 18px rgba(0,0,0,0.45)", zIndex: 50, touchAction: "none", userSelect: "none" }}
				>
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
				</button>
			)}

			{/* Mobile compose sheet  */}
			{(isMobile || isSplitMode) && composeOpen && createPortal((
				<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 100, display: "flex", alignItems: "flex-end" }}
					onClick={e => { if (e.target === e.currentTarget) { setComposeOpen(false); setComposeText(""); setComposeMedia(null); } }}>
					<div className="bg-surface-raised" style={{ width: "100%", maxHeight: "92vh", overflowY: "auto", borderRadius: "20px 20px 0 0", padding: "16px 16px 48px", animation: "fadeUp 0.22s ease both", borderTop: "1px solid var(--color-border)" }}>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
							<button onClick={() => { setComposeOpen(false); setComposeText(""); setComposeMedia(null); }} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 15, padding: 0 }}>{i18n.t("common.cancel")}</button>
							<button onClick={() => { if ((composeText.trim() || composeMedia) && !uploading) { handlePost(composeText, composeMedia); setComposeText(""); setComposeMedia(null); setComposeOpen(false); } }}
								disabled={(!composeText.trim() && !composeMedia) || uploading}
								style={{ background	: (composeText.trim() || composeMedia) && !uploading ? "#2563eb" : "rgba(37,99,235,0.35)", border: "none", borderRadius: 20, padding: "7px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: (composeText.trim() || composeMedia) && !uploading ? "pointer" : "default", transition: "background 0.15s" }}>
								{uploading ? i18n.t("social.posting") : i18n.t("social.post")}
							</button>
						</div>
						<TownHallXImportPanel compact />
						<div style={{ display: "flex", gap: 12 }}>
							{(() => {
								const meCompose = getUser();
								return (
									<Avatar url={meCompose?.profile_pic_url} initials={(meCompose?.name || meCompose?.display_name || meCompose?.username || "Y").slice(0, 1).toUpperCase()} alt={meCompose?.name} size={40}
										color="#2563eb" style={{ background: "#2563eb", fontSize: 14, flexShrink: 0 }} />
								);
							})()}
							<textarea value={composeText} onChange={e => { if (e.target.value.length <= 280) setComposeText(e.target.value); }}
								placeholder={i18n.t("social.whatsHappening")} autoFocus
								className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 16, resize: "none", minHeight: 100, lineHeight: 1.55, caretColor: "#2563eb" }} rows={4} />
						</div>
						{composeMedia && composePreviewUrl && (
							<div style={{ position: "relative", marginTop: 12, marginLeft: 52 }}>
								{composeMedia.type?.startsWith("video")
									? <video src={composePreviewUrl} style={{ width: "100%", maxHeight: 220, borderRadius: 12, background: "#000", display: "block" }} muted />
									: <img src={composePreviewUrl} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 12, display: "block" }} />}
								<button onClick={() => setComposeMedia(null)} aria-label="Remove media" style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.65)", border: "none", color: "#fff", cursor: "pointer", fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
							</div>
						)}
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingLeft: 52, gap: 12, flexWrap: "wrap" }}>
							<input ref={composeFileRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={e => { setComposeMedia(e.target.files[0] || null); e.target.value = ""; }} />
							<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
								<button onClick={() => composeFileRef.current?.click()} aria-label={i18n.t("social.photoVideo")} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, minHeight: 44 }}>
									<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
									{i18n.t("social.photoVideo")}
								</button>
								<RecordVideoTrigger onFile={setComposeMedia} />
							</div>
							{composeText.length > 240 && (
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: composeText.length > 270 ? "#ef4444" : "var(--color-text-secondary)" }}>{280 - composeText.length}</span>
							)}
						</div>
					</div>
				</div>
			), document.body)}

			{/* Reply Modal */}
			{replyModalPost && (
				<ReplyModal
					post={replyModalPost}
					onClose={() => setReplyModalPost(null)}
					onSubmit={async (parentId, text, mediaFile) => {
						const target = replyModalPost;
						const apiParentId = townHallApiId({ id: parentId, post_id: parentId, _repostOf: target?._repostOf }) ?? townHallApiId(target);
						let mediaUrl = null, mediaType = null;
						if (mediaFile) {
							try {
								const res = await uploadTownHallMedia(mediaFile);
								mediaUrl = res.url;
								mediaType = res.media_type;
							} catch {
								notify({ title: i18n.t("common.error", "Error"), message: i18n.t("social.uploadFailedMessage") });
								return;
							}
						}
						try {
							if (!apiParentId) throw new Error("Invalid parent post");
							await (mediaUrl
								? createTownHallPostWithMedia(text, apiParentId, mediaUrl, mediaType)
								: createTownHallPost(text, apiParentId));
							setPosts(prev => prev.map(p => (p.id === parentId || townHallApiId(p) === apiParentId) ? { ...p, comments: (p.comments ?? 0) + 1 } : p));
							if (target) openPost(target);
						} catch (err) {
							notify({ title: i18n.t("common.error", "Error"), message: err?.response?.data?.message || i18n.t("social.replyFailed", "Could not post reply.") });
						}
					}}
				/>
			)}

			{/* Quote Modal */}
			{quoteModalPost && (
				<QuoteModal post={quoteModalPost} uploading={uploading} onClose={() => setQuoteModalPost(null)} onSubmit={handleQuotePost} />
			)}

			{/* Delete confirmation */}
			{pendingDelete && createPortal((
				<div onClick={() => !deleting && setPendingDelete(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 260, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
					<div onClick={e => e.stopPropagation()} className="bg-surface border border-border" style={{ borderRadius: 16, padding: 22, width: 340, maxWidth: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
						<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "0.03em", textTransform: "uppercase", margin: "0 0 8px" }}>{i18n.t("social.deletePost")}</p>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5, margin: "0 0 18px" }}>{i18n.t("social.deletePostConfirm")}</p>
						<div style={{ display: "flex", gap: 10 }}>
							<button onClick={() => setPendingDelete(null)} disabled={deleting} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, padding: "10px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: deleting ? "default" : "pointer" }}>{i18n.t("common.cancel")}</button>
							<button onClick={confirmDeletePost} disabled={deleting} style={{ flex: 1, padding: "10px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.5)", borderRadius: 10, color: "#ef4444", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: deleting ? "default" : "pointer" }}>{deleting ? i18n.t("common.deleting") : i18n.t("common.delete")}</button>
						</div>
					</div>
				</div>
			), document.body)}

			{/* Profile hover card (#379: no full-screen backdrop — it stole the pointer
			    off the avatar the instant the card opened, firing a spurious mouseleave
			    that dismissed the card ("flashes and disappears"). The card closes on its
			    own mouseleave / the avatar's leave timer, and an invisible bridge below
			    spans the gap so the cursor can travel from avatar into the card.) */}
			{activeProfilePost && createPortal((
				<div onMouseEnter={handleProfileCardEnter} onMouseLeave={handleProfileCardLeave}
					className="bg-surface-raised border border-border" style={{ position: "fixed", bottom: profileCardPos.bottom, left: profileCardPos.x, zIndex: 400, borderRadius: 18, padding: 20, width: 280, boxShadow: "0 -4px 40px rgba(0,0,0,0.95)", animation: "fadeUp 0.14s ease both" }}>
					{/* invisible hover bridge across the ~10px gap down to the avatar */}
					<div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: "100%", height: 16 }} />
					<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
						{/* Doc 2 avatar image */}
						<Avatar url={activeProfilePost.avatar_url} initials={activeProfilePost.avatar} alt={activeProfilePost.user} size={52}
							color={activeProfilePost.avatarColor} style={{ background: activeProfilePost.avatarColor, fontSize: 20 }} />
						<button onClick={() => { setActiveProfilePost(null); if (activeProfilePost.author_user_id) window.__profileTargetId = activeProfilePost.author_user_id; if (window.__nav) window.__nav("profile"); }} style={{ background: "#2563eb", border: "none", borderRadius: 20, padding: "7px 16px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>{i18n.t("social.viewProfile")}</button>
					</div>
					<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 3 }}>{activeProfilePost.user}</p>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 12 }}>{activeProfilePost.handle}</p>
					<div style={{ display: "flex", gap: 20, paddingTop: 10, borderTop: "1px solid var(--color-border-subtle)" }}>
						<div>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 1 }}>{hoverCounts ? fmtViews(hoverCounts.followers) : "—"}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("social.followers")}</p>
						</div>
						<div>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 1 }}>{hoverCounts ? fmtViews(hoverCounts.following) : "—"}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("videos.following")}</p>
						</div>
					</div>
				</div>
			), document.body)}
		</div>
	);
}

// #430: the profile reuses this so clicking a town-hall post there opens the REAL post view
// (like / repost / reply / views) instead of a bare comments sheet.
export { SocialPage, SocialPostDetailPage };