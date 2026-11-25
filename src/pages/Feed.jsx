import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { loadHls } from "../utils/livePlayback.js";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useViewport }  from "../hooks/useViewport.js";
import { Skel, SkeletonFeedPost, SkeletonFeedStory, SkeletonMediaGrid, SkeletonSearchRow }         from "../components/skeletons.jsx";
import { CommentsSheet, MediaPostModal, clickableProps, ExpandableText } from "../components/shared.jsx";
import { Avatar } from "../components/SafeImage.jsx";
import ImageCropModal from "../components/ImageCropModal.jsx";
import { timeAgo }      from "../utils/time.js";
import { commentAuthorName, commentAvatarUrl, commentTime, parseCommentListPayload, isCommentMutationOk } from "../utils/socialComments.js";
import {
  getFeed as apiFetchFeed,
  getStoryFeed,
  createStory,
  viewStory as apiViewStory,
  createPost,
  deletePost,
  updatePost,
  toggleBookmarkAPI,
  toggleLikeAPI,
  addCommentAPI,
  getCommentsAPI,
  deleteCommentAPI,
  updateCommentAPI,
  getVideoFeed,
  getPost,
  getExploreFeed,
  toggleFollowByUserId,
  getFollowing,
  getFollowSuggestions,
  getProfileByHandle,
  getFollowCounts,
  searchContent,
  getPostsByTag,
  getForYou,
  trackImpressions,
  sharePost,
  getLikedPosts,
  getBookmarkedPosts,
} from "../api/social";
// #439: share-to-DM actually sends now, instead of drawing a "Sent" tick that meant nothing.
import { openDmChannel, sendMessage, messageUser } from "../api/chat";
import { toggleCommentLike } from "../api/videos.js";
import { isViewingChatChannel } from "../utils/chatViewing.js";
import { subscribeChatEvents } from "../api/chatSocket.js";
import { connectSocket } from "../api/socket.js";
import { getUser } from "../store/auth.js";
import { trackAdEvent } from "../api/ads";
import { FEED_CACHE_KEY } from "../utils/clientVideoCache.js";
import ReportModal from "../components/ReportModal.jsx";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

function feedYourStoryEntry() {
  return { id: "s0", name: i18n.t("feed.yourStory"), initials: "Y", color: "#2563eb", hasStory: false };
}

// Sponsored-post CTA label per backend cta_text enum.
function adCtaLabel(cta) {
  const map = {
    LEARN_MORE: "feed.adCtaLearnMore",
    SHOP_NOW: "feed.adCtaShopNow",
    BOOK_NOW: "feed.adCtaBookNow",
    ORDER_NOW: "feed.adCtaOrderNow",
    SUBSCRIBE: "feed.adCtaSubscribe",
  };
  return i18n.t(map[cta] || "feed.adCtaLearnMore");
}

// Advertiser-controlled target_url is rendered into an href — only allow http(s)
// (reject javascript:/data:/vbscript:/file:/blob: to prevent XSS).
function isSafeHttpUrl(u) {
	try { const p = new URL(u, window.location.origin); return p.protocol === "http:" || p.protocol === "https:"; }
	catch { return false; }
}

// Feed media tile: fixed aspect shell stays dark for overlays, but a broken/purged
// URL must not leave a giant empty black hole — collapse the shell on error.
function FeedMediaTile({ imageSrc, isVid, aspectRatio, maxHeight, onClick, children }) {
  const [failed, setFailed] = useState(false);
  if (!imageSrc || failed) return null;
  return (
    <div
      onClick={onClick}
      style={{ position: "relative", width: "100%", aspectRatio, maxHeight, background: "#010103", borderRadius: 8, cursor: "pointer", overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", userSelect: "none" }}
    >
      {isVid
        ? <video src={imageSrc} controls playsInline style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} onError={() => setFailed(true)} />
        : <img src={imageSrc} loading="lazy" decoding="async" alt={i18n.t("feed.postAlt")} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setFailed(true)} />
      }
      {children}
    </div>
  );
}

// Fires a single sponsored-impression beacon when a shadow-post is mounted.
function AdImpression({ campaignId }) {
	useEffect(() => { if (campaignId) trackAdEvent(campaignId, "impression").catch(() => {}); }, [campaignId]);
	return null;
}
const TAB_ORDER       = ["forYou", "photos", "videos", "search", "saved", "liked"];

const sameFeedId = (a, b) => a != null && b != null && String(a) === String(b);
const matchesFeedPost = (x, id) => sameFeedId(x?.id, id) || sameFeedId(x?.social_post_id, id);
const postIsLiked = (p) => !!(p?.liked ?? p?.is_liked_by_me ?? (p?.social_interactions?.length > 0));
function parseLikeToggle(res) {
  const body = (res && typeof res === "object" && res.data && (res.data.action != null || typeof res.data.liked === "boolean"))
    ? res.data
    : res;
  if (!body || typeof body !== "object") return { liked: undefined, likes: undefined };
  const liked = body.action === "liked" || body.liked === true
    ? true
    : body.action === "unliked" || body.liked === false
      ? false
      : undefined;
  const likes = [body.newCount, body.likeCount, body.count, body.likes].find(n => typeof n === "number");
  return { liked, likes };
}

// Wraps a feed card and reports dwell-time / impressions to the recommendation
// engine. Calls onVisible when the card is ≥50% on screen and onHidden when it
// leaves (or unmounts), so the engine learns what content actually held attention.
function ImpressionCard({ contentType, contentId, source, onVisible, onHidden, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || contentId == null) return;
    const key  = `${contentType}:${contentId}`;
    const meta = { content_type: contentType, content_id: contentId, source };
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && e.intersectionRatio >= 0.5) onVisible(key, meta);
      else                                                onHidden(key, meta);
    }, { threshold: [0, 0.5, 1] });
    obs.observe(el);
    return () => { onHidden(key, meta); obs.disconnect(); };
  }, [contentType, contentId, source]);
  return <div ref={ref}>{children}</div>;
}

// Icons  ─────────────────────────────────────────────────────────────────────────────

const IconBack     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>;
const IconSearch   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
const IconImage    = () => <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>;
const IconPlay     = () => <svg width={24} height={24} viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3" /></svg>;
const IconMuteOn   = () => <svg width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" /></svg>;
const IconMuteOff  = () => <svg width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14" /></svg>;
const IconBell     = ({ size = 18 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>;
const IconPlus     = ({ size = 14 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
const IconEdit     = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
const IconTrash    = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>;
const IconLink     = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>;
const IconFlag     = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>;

const IconHeart    = ({ size = 22, filled, color }) => <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color || "#ef4444" : "none"} stroke={filled ? color || "#ef4444" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>;
const IconBookmark = ({ size = 22, filled }) => <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "#2563eb" : "none"} stroke={filled ? "#2563eb" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>;
const IconComment  = ({ size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
const IconShare    = ({ size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>;
const IconVerified = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 4 }}><path fill="#2563eb" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;

// Avatar — board #457/#453: the local implementation had no onError, so every purged Azure blob
// painted the browser's broken-image icon. It now comes from components/SafeImage.jsx, which falls
// back to the initials disc when the photo 404s. (Prop rename: imageUrl -> url.)

// PostOptionsMenu  ─────────────────────────────────────────────────────────────────────────────

function PostOptionsMenu({ post, isOwner, onClose, onEdit, onDelete, onReport }) {
  const items = isOwner
    ? [
        { id: "edit",     label: i18n.t("messages.edit"),      icon: <IconEdit size={18} />,  color: "var(--color-text-primary)", onClick: () => { onClose(); onEdit(post); } },
        { id: "delete",   label: i18n.t("ai.deleteChat"),    icon: <IconTrash size={18} />, color: "#ef4444",                onClick: () => { onClose(); onDelete(post.id); } },
        { id: "copylink", label: i18n.t("feed.copyLink"), icon: <IconLink size={18} />,  color: "var(--color-text-primary)", onClick: () => { navigator.clipboard?.writeText(`${window.location.origin}/post/${post.id}`).catch(() => {}); onClose(); } },
      ]
    : [
        { id: "copylink", label: i18n.t("feed.copyLink"), icon: <IconLink size={18} />, color: "var(--color-text-primary)", onClick: () => { navigator.clipboard?.writeText(`${window.location.origin}/post/${post.id}`).catch(() => {}); onClose(); } },
        { id: "report",   label: i18n.t("common.report"), icon: <IconFlag size={18} />, color: "#f59e0b",                onClick: () => { onClose(); onReport?.(post); } },
      ];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 390, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} />
      <div className="bg-surface-raised border border-border" style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, zIndex: 400, borderRadius: "20px 20px 0 0", borderBottom: "none", boxShadow: "0 -20px 60px rgba(0,0,0,0.8)", animation: "slideUp 0.22s cubic-bezier(0.34,1.2,0.64,1) both", overflow: "hidden" }}>
        <style>{`@keyframes slideUp { from { transform: translateX(-50%) translateY(100%); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }`}</style>

        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div className="bg-border" style={{ width: 36, height: 4, borderRadius: 2 }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px 16px", borderBottom: "1px solid var(--color-border-subtle)" }}>
          <Avatar initials={post.avatar} color={post.avatarColor} size={36} border url={post.avatarUrl} />
          <div>
            <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, margin: 0 }}>{post.user}</p>
            <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post.caption || i18n.t("feed.noCaption")}</p>
          </div>
        </div>

        <div style={{ padding: "8px 0" }}>
          {items.map((item, i) => (
            <button key={item.id} onClick={item.onClick} style={{ width: "100%", background: "none", border: "none", padding: "14px 20px", display: "flex", alignItems: "center", gap: 16, cursor: "pointer", color: item.color, fontFamily: "'DM Sans', sans-serif", fontWeight: item.id === "delete" ? 700 : 500, fontSize: 15, textAlign: "left", borderBottom: i < items.length - 1 ? "1px solid var(--color-border-subtle)" : "none" }} onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface)"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
              <span style={{ opacity: item.id === "delete" ? 1 : 0.7 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>

        <div style={{ padding: "0 16px 28px" }}>
          <button onClick={onClose} className="bg-surface border border-border text-text-secondary" style={{ width: "100%", borderRadius: 14, padding: "13px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
        </div>
      </div>
    </>
  );
}

// DeletePostConfirm  ─────────────────────────────────────────────────────────────────────────────

function DeletePostConfirm({ onCancel, onConfirm, deleting }) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 490, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ width: "88%", maxWidth: 340, borderRadius: 18, overflow: "hidden", animation: "fadeUp 0.2s ease both" }}>
        <div style={{ padding: "24px 20px 16px", textAlign: "center", borderBottom: "1px solid var(--color-border-subtle)" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <IconTrash size={22} />
          </div>
          <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "0.04em", margin: "0 0 6px" }}>{i18n.t("feed.deletePost")}</p>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0, lineHeight: 1.5 }}>{i18n.t("feed.deletePostConfirm")}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <button onClick={onConfirm} disabled={deleting} style={{ padding: "15px 20px", background: "none", border: "none", borderBottom: "1px solid var(--color-border-subtle)", color: "#ef4444", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.5 : 1 }}>
            {deleting ? i18n.t("common.deleting") : i18n.t("common.delete")}
          </button>
          <button onClick={onCancel} disabled={deleting} className="text-text-secondary" style={{ padding: "15px 20px", background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
        </div>
      </div>
    </div>
  );
}

// EditPostModal  ─────────────────────────────────────────────────────────────────────────────

function EditPostModal({ post, onClose, onSaved }) {
  const textareaRef = useRef(null);
  const [caption, setCaption] = useState(post.caption || "");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  useEffect(() => { setTimeout(() => textareaRef.current?.focus(), 100); }, []);

  const hasChanges = caption.trim() !== (post.caption || "").trim();

  async function handleSave() {
    if (!hasChanges || saving) return;
    setSaving(true);
    try {
      await updatePost(post.id, { caption_text: caption.trim() });
      onSaved(post.id, caption.trim());
      onClose();
    } catch {
      setError(i18n.t("feed.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const imageSrc = post.imageUrl || post.mediaUrl || null;

  return (
    <div onClick={() => { if (!saving) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 490, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "max(16px, env(safe-area-inset-top, 0px)) 16px max(16px, env(safe-area-inset-bottom, 0px))", boxSizing: "border-box" }}>
      <div onClick={e => e.stopPropagation()} className="bg-surface border border-border" style={{ width: "min(460px, 92%)", maxHeight: "calc(100dvh - 32px)", margin: "auto", borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", animation: "fadeUp 0.22s ease both" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid var(--color-border-subtle)", flexShrink: 0 }}>
          <button onClick={onClose} disabled={saving} className="text-text-secondary" style={{ background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 14, cursor: "pointer", padding: 0 }}>{i18n.t("common.cancel")}</button>
          <span className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 17, letterSpacing: "0.06em", textTransform: "uppercase" }}>{i18n.t("feed.editPost")}</span>
          <button onClick={handleSave} disabled={!hasChanges || saving} style={{ background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: hasChanges && !saving ? "#2563eb" : "rgba(37,99,235,0.35)", cursor: hasChanges && !saving ? "pointer" : "default", padding: 0 }}>
            {saving ? i18n.t("common.saving") : i18n.t("common.done")}
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {/* User info */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px 12px" }}>
          <Avatar initials={post.avatar} color={post.avatarColor} size={40} border url={post.avatarUrl} />
          <div>
            <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, margin: 0 }}>{post.user}</p>
            <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }}>{post.handle}</p>
          </div>
        </div>

        {/* Caption textarea */}
        <div style={{ padding: "0 20px 16px" }}>
          <textarea ref={textareaRef} value={caption} onChange={e => setCaption(e.target.value)} placeholder={i18n.t("feed.writeCaption")} rows={4} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, padding: "12px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 15, resize: "none", outline: "none", lineHeight: 1.6 }} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: caption.length > 2000 ? "#ef4444" : "var(--color-text-muted)" }}>{caption.length} / 2200</span>
          </div>
        </div>

        {/* Media preview (read-only) — the photo itself stays dark-scrimmed like any post media,
            regardless of theme, so the "media can't change" label reads over it either way. */}
        {imageSrc && (
          <div style={{ padding: "0 20px 20px" }}>
            <div className="border border-border" style={{ width: "100%", aspectRatio: "16/7", borderRadius: 10, overflow: "hidden", position: "relative" }}>
              <img src={imageSrc} loading="lazy" decoding="async" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.65 }} onError={e => e.currentTarget.style.display = "none"} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(255,255,255,0.55)", background: "rgba(0,0,0,0.4)", borderRadius: 6, padding: "4px 10px" }}>{i18n.t("feed.mediaCannotChange")}</span>
              </div>
            </div>
          </div>
        )}

        {error && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#ef4444", margin: "0 20px 16px", textAlign: "center" }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}

// StoryViewer  ─────────────────────────────────────────────────────────────────────────────

// Fullscreen, immersive story playback — a fixed black-backdrop overlay with media, progress
// bars and chrome composited directly over the story photo/video (same treatment as Social.jsx's
// FullscreenVideoOverlay). It stays dark regardless of theme: the surface underneath is always
// the story media itself, never the page background, so there is nothing here to theme.
export function StoryViewer({ initialStory, storyGroups, onClose }) {
  const [storyLinkCopied, setStoryLinkCopied] = useState(false);
  const [storyReply, setStoryReply] = useState("");
  const [storyReplySending, setStoryReplySending] = useState(false);
  const [storyReplyNotice, setStoryReplyNotice] = useState("");
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const playedMusicRef = useRef(null);
  const { isMobile } = useViewport();
  const [musicMuted, setMusicMuted] = useState(false);

  // State initialization
  const [userIndex, setUserIndex] = useState(() => {
    if (!storyGroups?.length) return 0;
    const idx = storyGroups.findIndex(g => g.stories?.some(s => s.story_id === initialStory?.story_id));
    return idx === -1 ? 0 : idx;
  });

  const [storyIndex, setStoryIndex] = useState(() => {
    if (!storyGroups?.length) return 0;
    const group = storyGroups.find(g => g.stories?.some(s => s.story_id === initialStory?.story_id));
    const idx = group?.stories?.findIndex(s => s.story_id === initialStory?.story_id);
    return (idx === -1 || idx === undefined) ? 0 : idx;
  });

  const [videoDuration, setVideoDuration] = useState(5);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMetadataLoaded, setIsMetadataLoaded] = useState(false);

  const currentGroup = storyGroups?.[userIndex] || { stories: [] };
  const current = currentGroup.stories?.[storyIndex] || initialStory;
  
  const mediaSrc = current?.media_url || current?.mediaUrl || null;
  const isVideo = current?.media_type === "video" || mediaSrc?.match(/\.(mp4|webm|mov|m4v)(\?|$)/i);
  const currentMusic = current?.music_url || null;

  useEffect(() => {
    if (current?.story_id) {
       // Mock function for API call
       if(typeof apiViewStory !== 'undefined') apiViewStory(current.story_id).catch(() => {});
    }
  }, [current?.story_id]);

  // ── Background music ──────────────────────────────────────────────────────
  // Load the track when the story (and thus music_url) changes. A run of frames
  // that share the same music_url keeps playing continuously — no restart.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!currentMusic) { try { a.pause(); } catch { /* noop */ } playedMusicRef.current = null; return; }
    if (playedMusicRef.current !== currentMusic) {
      a.src = currentMusic;
      try { a.currentTime = 0; } catch { /* noop */ }
      playedMusicRef.current = currentMusic;
    }
    a.loop = true;
  }, [currentMusic]);

  // Follow the story's play/pause (incl. press-and-hold) and the mute toggle.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !currentMusic) return;
    a.muted = musicMuted;
    if (isPlaying) a.play().catch(() => {}); else a.pause();
  }, [currentMusic, isPlaying, musicMuted]);

  // Stop audio when the viewer closes.
  useEffect(() => () => { try { audioRef.current?.pause(); } catch { /* noop */ } }, []);

  const advanceStory = useCallback(() => {
    if (storyIndex < currentGroup.stories.length - 1) {
      setStoryIndex(prev => prev + 1);
    } else if (userIndex < storyGroups.length - 1) {
      setUserIndex(prev => prev + 1);
      setStoryIndex(0);
    } else {
      onClose();
    }
    setVideoDuration(5);
    setIsMetadataLoaded(false);
  }, [userIndex, storyIndex, currentGroup, storyGroups, onClose]);

  // Auto-advance is driven by the active progress bar's animation (images) and
  // the <video> onEnded (video) — NOT a blind timer. That way pausing simply
  // freezes the bar (animationPlayState) and the video, holding the story in
  // place and resuming from exactly where it left off.

  const pauseStory = useCallback(() => {
    setIsPlaying(false);
    if (videoRef.current) videoRef.current.pause();
  }, []);
  const resumeStory = useCallback(() => {
    setIsPlaying(true);
    if (videoRef.current) videoRef.current.play().catch(() => {});
  }, []);
  const togglePlayPause = () => (isPlaying ? pauseStory() : resumeStory());

  // Press-and-hold to pause (Instagram-style). A short threshold distinguishes a
  // hold from a tap: only presses longer than 180ms pause, and the click that
  // follows such a hold is swallowed so releasing doesn't also switch stories.
  const holdTimer   = useRef(null);
  const isHolding   = useRef(false);
  const suppressTap = useRef(false);

  const handleHoldStart = () => {
    isHolding.current = false;
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => { isHolding.current = true; pauseStory(); }, 180);
  };
  const handleHoldEnd = () => {
    clearTimeout(holdTimer.current);
    if (isHolding.current) {
      isHolding.current = false;
      suppressTap.current = true; // the upcoming click came from a hold → ignore it
      resumeStory();
    }
  };
  // Wrap a tap-zone action so a hold-release doesn't trigger navigation.
  const tap = (fn) => () => {
    if (suppressTap.current) { suppressTap.current = false; return; }
    fn();
  };

  const sendStoryReply = async () => {
    const text = storyReply.trim();
    const userId = currentGroup.userId;
    if (!text || userId == null || storyReplySending) return;
    setStoryReplySending(true);
    setStoryReplyNotice("");
    try {
      await messageUser(userId, { initialMessage: text, navigate: false, sourceVertical: "social" });
      setStoryReply("");
      setStoryReplyNotice(i18n.t("feed.storyReplySent"));
      setTimeout(() => setStoryReplyNotice(""), 2500);
    } catch {
      setStoryReplyNotice(i18n.t("feed.storyReplyFailed"));
    } finally {
      setStoryReplySending(false);
    }
  };

  // Manual back-navigation: previous story in this group, else last story of the
  // previous person. At the very first story it just restarts the current one.
  const goPrev = useCallback(() => {
    if (storyIndex > 0) {
      setStoryIndex(prev => prev - 1);
    } else if (userIndex > 0) {
      const prevIdx = userIndex - 1;
      setUserIndex(prevIdx);
      setStoryIndex(Math.max(0, (storyGroups[prevIdx]?.stories?.length || 1) - 1));
    } else {
      setStoryIndex(0);
    }
    setVideoDuration(5);
    setIsMetadataLoaded(false);
  }, [userIndex, storyIndex, storyGroups]);

  // Keyboard: ←/→ to move between stories, Esc to close.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") advanceStory();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advanceStory, goPrev, onClose]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#09090b", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`
        @keyframes storyProgress { 
          from { transform: scaleX(0); } 
          to { transform: scaleX(1); } 
        }
      `}</style>
      
      {/* Background Blur */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${mediaSrc})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(60px) brightness(0.15)", zIndex: 1 }} />
      
      {/* Close Button */}
      <button onClick={onClose} style={{ position: "absolute", top: 24, right: 24, background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "50%", width: 44, height: 44, color: "#fff", fontSize: 16, cursor: "pointer", zIndex: 110 }}>✕</button>

      {/* Background music + mute toggle */}
      <audio ref={audioRef} />
      {currentMusic && (
        <button onClick={() => setMusicMuted(m => !m)} title={musicMuted ? i18n.t("feed.unmuteMusic") : i18n.t("feed.muteMusic")} style={{ position: "absolute", top: 24, right: 76, background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "50%", width: 44, height: 44, color: "#fff", fontSize: 16, cursor: "pointer", zIndex: 110 }}>{musicMuted ? "🔇" : "🎵"}</button>
      )}

      {/* Desktop prev/next chevrons (mobile uses the tap zones instead) */}
      {!isMobile && (
        <>
          <button onClick={goPrev} aria-label={i18n.t("feed.previousStory")} style={{ position: "absolute", top: "50%", left: "calc(50% - 252px)", transform: "translateY(-50%)", background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "50%", width: 44, height: 44, color: "#fff", fontSize: 22, lineHeight: 1, cursor: "pointer", zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
          <button onClick={advanceStory} aria-label={i18n.t("feed.nextStory")} style={{ position: "absolute", top: "50%", right: "calc(50% - 252px)", transform: "translateY(-50%)", background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "50%", width: 44, height: 44, color: "#fff", fontSize: 22, lineHeight: 1, cursor: "pointer", zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
        </>
      )}

      {/* Main Story Container */}
      <div style={{ width: "100%", maxWidth: 400, height: "100%", maxHeight: "calc(100vh - 32px)", borderRadius: 16, background: "#000", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.9)", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", zIndex: 5 }}>
        
        {/* Top Overlay */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "16px 16px 32px", background: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)", zIndex: 10 }}>
          
          {/* Progress Bars Container */}
          <div style={{ display: "flex", gap: "4px", height: 3, marginBottom: 12 }}>
            {currentGroup.stories.map((s, idx) => (
              <div key={s.story_id} style={{ flex: 1, background: "rgba(255,255,255,0.25)", borderRadius: 2, overflow: "hidden" }}>
                <div
                  onAnimationEnd={() => { if (idx === storyIndex && !isVideo) advanceStory(); }}
                  style={{
                  height: "100%",
                  background: "#fff",
                  transformOrigin: "left",
                  transform: idx < storyIndex ? "scaleX(1)" : (idx === storyIndex ? "scaleX(1)" : "scaleX(0)"),
                  width: "100%",
                  animation: idx === storyIndex && (!isVideo || isMetadataLoaded)
                    ? `storyProgress ${isVideo ? videoDuration : 5}s linear forwards`
                    : "none",
                  animationPlayState: isPlaying ? "running" : "paused"
                }} />
              </div>
            ))}
          </div>

          {/* Author Info */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#2563eb", overflow: "hidden" }}>
              <Avatar url={currentGroup.profilePicUrl || currentGroup.profile_pic_url} initials={currentGroup.name} color="#2563eb" size={32} />
            </div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "#fff", margin: 0 }}>{currentGroup.name}</p>
          </div>

          {/* Now-playing music label */}
          {current?.music_title && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, background: "rgba(0,0,0,0.35)", borderRadius: 14, padding: "4px 10px" }}>
              <span style={{ fontSize: 11 }}>🎵</span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>{current.music_title}</span>
            </div>
          )}
        </div>

        {/* Media */}
        {mediaSrc ? (
          isVideo ? (
            <video 
              ref={videoRef} 
              src={mediaSrc} 
              autoPlay
              playsInline
              muted={!!currentMusic}
              onLoadedMetadata={e => { const d = e.currentTarget.duration; if(d) setVideoDuration(d); setIsMetadataLoaded(true); }}
              onEnded={advanceStory}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : (
            <img
              src={mediaSrc}
              loading="lazy"
              decoding="async"

              style={{ width: "100%", height: "100%", objectFit: "contain" }}
              onLoad={() => { setVideoDuration(5); setIsMetadataLoaded(true); }} 
            />
          )
        ) : null}

        {/* Tap navigation zones: left third = previous, right third = next,
            middle = play/pause for video. Press-and-hold anywhere pauses.
            Sit above media (z8), below the progress/author (top) and reply
            (bottom) overlays (z10). */}
        {(() => {
          const holdProps = { onPointerDown: handleHoldStart, onPointerUp: handleHoldEnd, onPointerCancel: handleHoldEnd, onPointerLeave: handleHoldEnd };
          return (
            <>
              <div onClick={tap(goPrev)} {...holdProps} style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: "30%", zIndex: 8, cursor: "pointer" }} />
              <div onClick={tap(isVideo ? togglePlayPause : (() => {}))} {...holdProps} style={{ position: "absolute", top: 0, left: "30%", bottom: 0, width: "40%", zIndex: 8, cursor: isVideo ? "pointer" : "default" }} />
              <div onClick={tap(advanceStory)} {...holdProps} style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "30%", zIndex: 8, cursor: "pointer" }} />
            </>
          );
        })()}

        {/* Bottom Overlay */}
        <div onClick={e => e.stopPropagation()} style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "24px 16px 20px", background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)", zIndex: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <input
            value={storyReply}
            onChange={(e) => setStoryReply(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendStoryReply(); } }}
            placeholder={i18n.t("feed.replyToStory", { name: currentGroup.name })}
            disabled={!currentGroup.userId || storyReplySending}
            style={{ flex: 1, width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 24, padding: "10px 16px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 16, outline: "none" }}
          />
          {/* #439: navigator.share is undefined on desktop browsers, and there was no fallback —
              so on desktop this button did literally nothing. Copy the link instead. */}
          <button onClick={() => {
            if (navigator.share) { navigator.share({ title: i18n.t("feed.shareStoryTitle"), url: mediaSrc }).catch(() => {}); return; }
            navigator.clipboard?.writeText(mediaSrc).then(() => { setStoryLinkCopied(true); setTimeout(() => setStoryLinkCopied(false), 2000); }).catch(() => {});
          }} title={storyLinkCopied ? i18n.t("sellerDash.common.copied") : i18n.t("feed.copyLink")} style={{ background: storyLinkCopied ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%", width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}>
            {storyLinkCopied
              ? <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              : <IconLink size={16} />}
          </button>
          </div>
          {storyReplyNotice ? (
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: storyReplyNotice === i18n.t("feed.storyReplySent") ? "#86efac" : "#fca5a5", margin: 0, paddingLeft: 4 }}>{storyReplyNotice}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// StoryComposerModal ─────────────────────────────────────────────────────────────────────────────

// ── Story draft persistence ──────────────────────────────────────────────────
// Instagram-style "Save draft" on exit. Drafts are stored in IndexedDB (not
// localStorage) because they hold the original File blobs, so a resumed draft is
// FULLY editable (text/draw/stickers/photos), not a flattened image. One draft slot.
const STORY_DRAFT_DB = "strug_story_drafts";
const STORY_DRAFT_STORE = "drafts";
const STORY_DRAFT_KEY = "current";
function openStoryDraftDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(STORY_DRAFT_DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORY_DRAFT_STORE)) req.result.createObjectStore(STORY_DRAFT_STORE); };
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}
async function saveStoryDraft(data) {
  try {
    const db = await openStoryDraftDB();
    await new Promise((res, rej) => { const tx = db.transaction(STORY_DRAFT_STORE, "readwrite"); tx.objectStore(STORY_DRAFT_STORE).put(data, STORY_DRAFT_KEY); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    db.close(); return true;
  } catch { return false; }
}
async function loadStoryDraft() {
  try {
    const db = await openStoryDraftDB();
    const data = await new Promise((res, rej) => { const tx = db.transaction(STORY_DRAFT_STORE, "readonly"); const r = tx.objectStore(STORY_DRAFT_STORE).get(STORY_DRAFT_KEY); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    db.close(); return data || null;
  } catch { return null; }
}
async function clearStoryDraft() {
  try {
    const db = await openStoryDraftDB();
    await new Promise((res) => { const tx = db.transaction(STORY_DRAFT_STORE, "readwrite"); tx.objectStore(STORY_DRAFT_STORE).delete(STORY_DRAFT_KEY); tx.oncomplete = res; tx.onerror = res; });
    db.close();
  } catch { /* ignore */ }
}

// Fullscreen story editor (camera-roll picker, draw/text/sticker tools, canvas stage). Like
// StoryViewer, this is an immersive dark editing surface over the user's own media/canvas
// rather than page chrome, so it intentionally stays dark in both themes (same rationale as
// FullscreenVideoOverlay in Social.jsx).
export function StoryComposerModal({ onClose, onCreated }) {
  const { isMobile }  = useViewport();
  const fileInputRef  = useRef(null);
  const stageRef      = useRef(null);
  const drawCanvasRef = useRef(null);
  const drawingRef    = useRef(null); // in-progress freehand stroke
  const dragRef       = useRef(null); // { type, id } currently being dragged
  const textEditRef   = useRef(null); // focus target when editing selected text
  const musicInputRef = useRef(null); // hidden audio file picker
  const photoInputRef = useRef(null); // hidden picker for photos layered ONTO the current frame

  const [frames,      setFrames]      = useState([]); // { id, url, file, type, texts, stickers, strokes }
  const [storyCropSrc, setStoryCropSrc] = useState(null); // #124 — pending image awaiting crop
  const [active,      setActive]      = useState(0);
  const [mode,        setMode]        = useState("idle"); // 'idle' | 'draw'
  const [color,       setColor]       = useState("#ffffff");
  const [brush,       setBrush]       = useState(8);
  const [sel,         setSel]         = useState(null); // { type:'text'|'sticker', id }
  const [showEmoji,   setShowEmoji]   = useState(false);
  const [stageW,      setStageW]      = useState(0);
  const [uploading,   setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [musicFile,   setMusicFile]   = useState(null); // shared background track for the story
  const [musicName,   setMusicName]   = useState("");
  const [exitPrompt,  setExitPrompt]  = useState(false); // IG-style Exit/Save draft/Keep editing sheet
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false); // a saved draft was loaded on open

  const COLORS = ["#ffffff", "#000000", "#ef4444", "#f59e0b", "#facc15", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899"];
  const EMOJIS = ["😍","😂","🔥","✨","❤️","👍","🎉","😎","🥳","💯","🙌","😮","😭","🌈","⭐","☀️","🍕","🎵","💀","👀","🙏","😅","🤩","💪"];
  const uid = () => Math.random().toString(36).slice(2, 9);

  const frame   = frames[active] || null;
  const canEdit = !!frame && frame.type === "image";

  const updateFrame = (patch) =>
    setFrames(fs => fs.map((f, i) => (i === active ? { ...f, ...(typeof patch === "function" ? patch(f) : patch) } : f)));

  // ── Frames (multiple photos) ──────────────────────────────────────────────
  const addImageFrame = (file) => {
    setFrames(fs => [...fs, {
      id: uid(), url: URL.createObjectURL(file), file, type: "image",
      texts: [], stickers: [], strokes: [], photos: [],
    }]);
    setMode("idle"); setSel(null); setShowEmoji(false);
  };
  const handleFiles = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    // #124 — a single image goes through a crop/reposition step so it's framed to the 9:16
    // story canvas the way the user wants, instead of being blindly centre-cropped.
    if (files.length === 1 && files[0].type.startsWith("image")) {
      setStoryCropSrc(URL.createObjectURL(files[0]));
      setMode("idle"); setSel(null); setShowEmoji(false);
      return;
    }
    const added = files.map(file => ({
      id: uid(),
      url: URL.createObjectURL(file),
      file,
      type: file.type.startsWith("video") ? "video" : "image",
      texts: [], stickers: [], strokes: [], photos: [],
    }));
    setFrames(fs => [...fs, ...added]);
    setMode("idle"); setSel(null); setShowEmoji(false);
  };
  const removeFrame = (idx) => {
    setFrames(fs => fs.filter((_, i) => i !== idx));
    setActive(a => (a >= idx ? Math.max(0, a - 1) : a));
    setSel(null);
  };

  // ── Geometry ──────────────────────────────────────────────────────────────
  const stagePoint = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    const cx = (e.clientX ?? 0) - r.left;
    const cy = (e.clientY ?? 0) - r.top;
    return { x: Math.min(1, Math.max(0, cx / r.width)), y: Math.min(1, Math.max(0, cy / r.height)) };
  };

  // ── Drawing layer ──────────────────────────────────────────────────────────
  const strokeOnCtx = (ctx, s, W, H) => {
    if (!s.points.length) return;
    ctx.strokeStyle = s.color; ctx.lineWidth = Math.max(1, s.width * W); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    s.points.forEach((p, i) => (i ? ctx.lineTo(p.x * W, p.y * H) : ctx.moveTo(p.x * W, p.y * H)));
    if (s.points.length === 1) ctx.lineTo(s.points[0].x * W + 0.1, s.points[0].y * H + 0.1);
    ctx.stroke();
  };
  const redrawCanvas = () => {
    const cv = drawCanvasRef.current, st = stageRef.current;
    if (!cv || !st) return;
    const r = st.getBoundingClientRect();
    if (cv.width !== Math.round(r.width) || cv.height !== Math.round(r.height)) {
      cv.width = Math.round(r.width); cv.height = Math.round(r.height);
    }
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    (frames[active]?.strokes || []).forEach(s => strokeOnCtx(ctx, s, cv.width, cv.height));
  };
  useEffect(() => {
    const measure = () => { const st = stageRef.current; if (st) setStageW(st.getBoundingClientRect().width); redrawCanvas(); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, active, isMobile]);

  // ── Pointer routing on the stage (draw OR drag overlays) ────────────────────
  const onStageDown = (e) => {
    if (mode === "draw" && canEdit) {
      e.preventDefault();
      const r = stageRef.current.getBoundingClientRect();
      drawingRef.current = { color, width: brush / r.width, points: [stagePoint(e)] };
      return;
    }
    if (e.target?.dataset?.stagebg !== undefined) setSel(null); // tap empty → deselect
  };
  const onStageMove = (e) => {
    if (mode === "draw" && drawingRef.current) {
      e.preventDefault();
      drawingRef.current.points.push(stagePoint(e));
      const cv = drawCanvasRef.current;
      strokeOnCtx(cv.getContext("2d"), drawingRef.current, cv.width, cv.height);
      return;
    }
    if (dragRef.current) {
      e.preventDefault();
      const p = stagePoint(e); const { type, id } = dragRef.current;
      if (type === "text")       updateFrame(f => ({ texts:    f.texts.map(t => t.id === id ? { ...t, x: p.x, y: p.y } : t) }));
      else if (type === "photo") updateFrame(f => ({ photos: (f.photos || []).map(ph => ph.id === id ? { ...ph, x: p.x, y: p.y } : ph) }));
      else                       updateFrame(f => ({ stickers: f.stickers.map(s => s.id === id ? { ...s, x: p.x, y: p.y } : s) }));
    }
  };
  const onStageUp = () => {
    if (drawingRef.current) { const s = drawingRef.current; drawingRef.current = null; updateFrame(f => ({ strokes: [...f.strokes, s] })); }
    dragRef.current = null;
  };
  const onOverlayDown = (e, type, id) => {
    if (mode === "draw") return;
    e.stopPropagation();
    setSel({ type, id }); dragRef.current = { type, id };
  };

  // ── Tools: text / draw / sticker ────────────────────────────────────────────
  const addText = () => {
    if (!canEdit) return;
    setMode("idle"); setShowEmoji(false);
    const id = uid();
    updateFrame(f => ({ texts: [...f.texts, { id, value: i18n.t("feed.tapToEdit"), x: 0.5, y: 0.4, color, size: 0.07 }] }));
    setSel({ type: "text", id });
    setTimeout(() => textEditRef.current?.select?.(), 40);
  };
  const editSelText      = (value) => { if (sel?.type === "text") updateFrame(f => ({ texts: f.texts.map(t => t.id === sel.id ? { ...t, value } : t) })); };
  const setSelTextSize   = (size)  => { if (sel?.type === "text") updateFrame(f => ({ texts: f.texts.map(t => t.id === sel.id ? { ...t, size } : t) })); };
  const setSelStickerSz  = (size)  => { if (sel?.type === "sticker") updateFrame(f => ({ stickers: f.stickers.map(s => s.id === sel.id ? { ...s, size } : s) })); };
  const setSelPhotoSz    = (size)  => { if (sel?.type === "photo")   updateFrame(f => ({ photos: (f.photos || []).map(p => p.id === sel.id ? { ...p, size } : p) })); };
  const applyColor = (c) => {
    setColor(c);
    if (sel?.type === "text") updateFrame(f => ({ texts: f.texts.map(t => t.id === sel.id ? { ...t, color: c } : t) }));
  };
  const addSticker = (emoji) => {
    if (!canEdit) return;
    const id = uid();
    updateFrame(f => ({ stickers: [...f.stickers, { id, emoji, x: 0.5, y: 0.5, size: 0.16 }] }));
    setSel({ type: "sticker", id }); setShowEmoji(false); setMode("idle");
  };
  // Layer one or more photos ONTO the current frame (Instagram-style multi-photo
  // collage). Each becomes a draggable, resizable image overlay flattened on export.
  // The first added photo lands centered; subsequent ones cascade slightly so they
  // don't perfectly overlap. Photos require an image frame as the backdrop.
  const addPhotos = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length || !canEdit) return;
    const existing = (frame?.photos || []).length;
    let lastId = null;
    files.forEach((file, i) => {
      const id = uid(); lastId = id;
      const url = URL.createObjectURL(file);
      const n = existing + i;
      const offset = ((n % 4) - 1.5) * 0.06; // small cascade so stacked photos stay visible
      const img = new Image();
      img.onload = () => {
        const ar = img.naturalWidth / img.naturalHeight || 1;
        updateFrame(f => ({ photos: (f.photos || []).map(p => p.id === id ? { ...p, ar } : p) }));
      };
      img.src = url;
      updateFrame(f => ({ photos: [...(f.photos || []), { id, url, file, x: 0.5 + offset, y: 0.5 + offset, size: 0.5, ar: 1 }] }));
    });
    if (lastId) setSel({ type: "photo", id: lastId });
    setMode("idle"); setShowEmoji(false);
  };
  const undo = () => { if (mode === "draw") updateFrame(f => ({ strokes: f.strokes.slice(0, -1) })); };
  const deleteSel = () => {
    if (!sel) return;
    if (sel.type === "text")       updateFrame(f => ({ texts: f.texts.filter(t => t.id !== sel.id) }));
    else if (sel.type === "photo") updateFrame(f => ({ photos: (f.photos || []).filter(p => p.id !== sel.id) }));
    else                           updateFrame(f => ({ stickers: f.stickers.filter(s => s.id !== sel.id) }));
    setSel(null);
  };

  // ── Compositing: flatten media + drawings + text + stickers onto a canvas ───
  const loadImg = (url) => new Promise((res, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = rej; im.src = url; });
  const compositeFrame = async (f) => {
    const W = 1080, H = 1920;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    try {
      const img = await loadImg(f.url);
      const ir = img.width / img.height, tr = W / H;
      let dw, dh, dx, dy;
      if (ir > tr) { dh = H; dw = H * ir; dx = (W - dw) / 2; dy = 0; }
      else         { dw = W; dh = W / ir; dx = 0; dy = (H - dh) / 2; }
      ctx.drawImage(img, dx, dy, dw, dh);
    } catch { /* keep the black backdrop if the image can't be read */ }
    // Layered photo overlays (Instagram-style collage): each drawn at its normalized
    // center with a white border + soft shadow, like a photo sticker.
    for (const ph of (f.photos || [])) {
      try {
        const pim   = await loadImg(ph.url);
        const ar    = ph.ar || (pim.width / pim.height) || 1;
        const totalW = ph.size * W;          // element width incl. white border (matches on-screen)
        const b      = totalW * 0.025;       // 2.5% padding border, as in the live stage
        const pw     = totalW - 2 * b;        // inner image width
        const phh    = pw / ar;               // inner image height
        const totalH = phh + 2 * b;
        const lx = ph.x * W - totalW / 2, ly = ph.y * H - totalH / 2; // top-left of the white card
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = W * 0.02; ctx.shadowOffsetY = W * 0.008;
        ctx.fillStyle = "#fff";
        ctx.fillRect(lx, ly, totalW, totalH);
        ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.drawImage(pim, lx + b, ly + b, pw, phh);
        ctx.restore();
      } catch { /* skip an unreadable overlay */ }
    }
    f.strokes.forEach(s => strokeOnCtx(ctx, s, W, H));
    for (const t of f.texts) {
      const fsize = t.size * W;
      ctx.font = `bold ${fsize}px 'DM Sans', sans-serif`; ctx.fillStyle = t.color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = fsize * 0.14;
      const lines = String(t.value || "").split("\n"); const lh = fsize * 1.2; const top = t.y * H - (lines.length - 1) * lh / 2;
      lines.forEach((ln, i) => ctx.fillText(ln, t.x * W, top + i * lh));
      ctx.shadowBlur = 0;
    }
    for (const s of f.stickers) { ctx.font = `${s.size * W}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s.emoji, s.x * W, s.y * H); }
    return new Promise(res => c.toBlob(b => res(b), "image/jpeg", 0.92));
  };

  // ── Save to device ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!frame) return;
    const blob = frame.type === "video" ? frame.file : await compositeFrame(frame);
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `story_${Date.now()}.${frame.type === "video" ? "mp4" : "jpg"}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };

  // ── Share: upload every frame as a sequential story ─────────────────────────
  const handleShare = async () => {
    if (!frames.length) return;
    setUploading(true); setUploadError("");
    try {
      for (const f of frames) {
        let file;
        if (f.type === "video") file = f.file;
        else { const blob = await compositeFrame(f); file = new File([blob], `story_${Date.now()}.jpg`, { type: "image/jpeg" }); }
        const fd = new FormData(); fd.append("media", file);
        if (musicFile) { fd.append("music", musicFile); fd.append("music_title", musicName); }
        await createStory(fd);
      }
      await onCreated();
      await clearStoryDraft(); // a shared story is no longer a pending draft
      onClose();
    } catch (err) {
      console.error("❌ Story Upload Error:", err);
      setUploadError(i18n.t("feed.shareFailed", { message: err.response?.data?.message || err.message }));
    } finally { setUploading(false); }
  };

  // ── Exit / draft flow (Instagram-style back confirmation) ───────────────────
  const hasContent = frames.length > 0;
  // Intercept Back / backdrop: prompt only when there's work to lose.
  const requestClose = () => { if (uploading) return; if (hasContent) setExitPrompt(true); else onClose(); };
  const buildDraft = () => ({
    active,
    musicFile, musicName,
    frames: frames.map(f => ({
      type: f.type, file: f.file,
      texts: f.texts || [], stickers: f.stickers || [], strokes: f.strokes || [],
      photos: (f.photos || []).map(p => ({ file: p.file, x: p.x, y: p.y, size: p.size, ar: p.ar })),
    })),
  });
  const saveDraftAndExit = async () => {
    setSavingDraft(true);
    await saveStoryDraft(buildDraft());
    setSavingDraft(false);
    setExitPrompt(false);
    onClose();
  };
  const discardAndExit = async () => { setExitPrompt(false); await clearStoryDraft(); onClose(); };

  // Restore a saved draft when the composer opens (rehydrate File blobs → object URLs).
  useEffect(() => {
    let alive = true;
    (async () => {
      const draft = await loadStoryDraft();
      if (!alive || !draft?.frames?.length) return;
      setFrames(draft.frames.map(f => ({
        id: uid(), type: f.type, file: f.file, url: URL.createObjectURL(f.file),
        texts: f.texts || [], stickers: f.stickers || [], strokes: f.strokes || [],
        photos: (f.photos || []).map(p => ({ ...p, id: uid(), url: URL.createObjectURL(p.file) })),
      })));
      setActive(Math.min(draft.active || 0, draft.frames.length - 1));
      if (draft.musicFile) { setMusicFile(draft.musicFile); setMusicName(draft.musicName || ""); }
      setDraftRestored(true);
    })();
    return () => { alive = false; };
     
  }, []);
  const discardDraft = async () => { await clearStoryDraft(); setFrames([]); setActive(0); clearMusic(); setSel(null); setDraftRestored(false); };

  // ── Background music ──
  const handleMusic = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setMusicFile(f);
    setMusicName(f.name.replace(/\.[^.]+$/, "").slice(0, 60));
  };
  const clearMusic = () => { setMusicFile(null); setMusicName(""); };

  const selText    = sel?.type === "text"    ? frame?.texts.find(t => t.id === sel.id)    : null;
  const selSticker = sel?.type === "sticker" ? frame?.stickers.find(s => s.id === sel.id) : null;
  const selPhoto   = sel?.type === "photo"   ? (frame?.photos || []).find(p => p.id === sel.id) : null;

  const iconBtn = { background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%", width: 32, height: 32, color: "#fff", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
  const lbl     = { fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.5)" };
  const inp     = { width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 12px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none" };
  const thumb   = { width: "100%", height: "100%", objectFit: "cover" };
  // On mobile the tool rail now sits to the RIGHT of the canvas, so cap the
  // stage height such that canvas width (= height × 9/16) leaves room for the
  // ~64px rail + gap + padding next to it.
  // Two side columns flank the canvas now: frames strip (left) + tool rail (right).
  // Cap mobile stage height so canvas width leaves room for BOTH columns + gaps + padding.
  const stageH  = isMobile ? "min(56vh, calc((100vw - 140px) * 16 / 9))" : "min(72vh, 620px)";

  const TOOLS = [
    { id: "text",    label: i18n.t("feed.text"),    icon: "T",  on: addText,                                                                                  active: sel?.type === "text", needsImg: true },
    { id: "draw",    label: i18n.t("feed.draw"),    icon: "✎",  on: () => { setMode(m => m === "draw" ? "idle" : "draw"); setSel(null); setShowEmoji(false); }, active: mode === "draw",       needsImg: true },
    { id: "sticker", label: i18n.t("feed.sticker"), icon: "☺",  on: () => { setShowEmoji(v => !v); setMode("idle"); },                                          active: showEmoji,             needsImg: true },
    { id: "addphoto",label: i18n.t("messages.photo"),   icon: "🖼", on: () => photoInputRef.current?.click(),                                                       active: sel?.type === "photo", needsImg: true },
    { id: "music",   label: musicFile ? i18n.t("feed.musicAdded") : i18n.t("feed.music"), icon: "🎵", on: () => musicInputRef.current?.click(),                                  active: !!musicFile,           needsImg: false },
    { id: "photo",   label: i18n.t("catering.add"),     icon: "＋", on: () => fileInputRef.current?.click(),                                                        active: false,                 needsImg: false },
  ];

  return (
    <div onClick={requestClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.94)", backdropFilter: "blur(8px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? 0 : 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: isMobile ? "100%" : 500, height: isMobile ? "100%" : "auto", maxHeight: "100%", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: isMobile ? "14px 12px 18px" : 0, scrollbarWidth: "none" }}>
        {/* Instagram-style exit confirmation — bottom sheet on mobile, centered card on desktop */}
        {exitPrompt && (
          <div onClick={e => { e.stopPropagation(); if (!savingDraft) setExitPrompt(false); }}
            style={{ position: "fixed", inset: 0, zIndex: 220, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 16 }}>
            <div onClick={e => e.stopPropagation()}
              style={{ width: isMobile ? "100%" : 360, background: "#1b1d24", border: "1px solid rgba(255,255,255,0.1)", borderRadius: isMobile ? "18px 18px 0 0" : 18, padding: "20px 18px calc(20px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 -8px 40px rgba(0,0,0,0.5)" }}>
              <div style={{ textAlign: "center", marginBottom: 4 }}>
                <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, color: "#fff", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{i18n.t("feed.discardStory")}</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0 }}>{i18n.t("feed.saveDraftLater")}</p>
              </div>
              <button onClick={saveDraftAndExit} disabled={savingDraft}
                style={{ width: "100%", padding: "13px 0", background: "#2563eb", border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, cursor: savingDraft ? "default" : "pointer", opacity: savingDraft ? 0.6 : 1 }}>
                {savingDraft ? i18n.t("common.saving") : i18n.t("feed.saveDraft")}
              </button>
              <button onClick={discardAndExit} disabled={savingDraft}
                style={{ width: "100%", padding: "13px 0", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 12, color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, cursor: savingDraft ? "default" : "pointer" }}>
                {i18n.t("feed.exitStory")}
              </button>
              <button onClick={() => setExitPrompt(false)} disabled={savingDraft}
                style={{ width: "100%", padding: "13px 0", background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 15, cursor: savingDraft ? "default" : "pointer" }}>
                {i18n.t("feed.keepEditing")}
              </button>
            </div>
          </div>
        )}
        <input ref={fileInputRef} onChange={handleFiles} type="file" accept="image/*,video/*" multiple style={{ display: "none" }} />
        {storyCropSrc && (
          <ImageCropModal
            src={storyCropSrc}
            aspect={9 / 16}
            title={i18n.t("feed.adjustStory", { defaultValue: "Position your story" })}
            outWidth={1080}
            onCancel={() => { URL.revokeObjectURL(storyCropSrc); setStoryCropSrc(null); }}
            onConfirm={(file) => { URL.revokeObjectURL(storyCropSrc); setStoryCropSrc(null); addImageFrame(file); }}
          />
        )}
        <input ref={musicInputRef} onChange={handleMusic} type="file" accept="audio/*" style={{ display: "none" }} />
        <input ref={photoInputRef} onChange={addPhotos} type="file" accept="image/*" multiple style={{ display: "none" }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={requestClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            {i18n.t("common.back")}
          </button>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 16, color: "#fff", letterSpacing: "0.06em", textTransform: "uppercase" }}>{i18n.t("feed.newStory")}</span>
          <div style={{ display: "flex", gap: 6 }}>
            {sel && <button onClick={deleteSel} title={i18n.t("feed.deleteSelected")} style={iconBtn}>🗑</button>}
            {mode === "draw" && <button onClick={undo} title={i18n.t("feed.undoStroke")} style={iconBtn}>↶</button>}
            {frame && <button onClick={handleSave} title={i18n.t("feed.saveToDevice")} style={iconBtn}>⬇</button>}
          </div>
        </div>

        {/* Draft restored notice */}
        {draftRestored && frames.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "rgba(37,99,235,0.16)", border: "1px solid rgba(37,99,235,0.4)", borderRadius: 12, padding: "8px 12px" }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: "#dbeafe" }}>{i18n.t("feed.draftRestored")}</span>
            <button onClick={discardDraft} style={{ background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 8, padding: "5px 10px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>{i18n.t("feed.discard")}</button>
          </div>
        )}

        {frames.length === 0 ? (
          /* Empty state */
          <div onClick={() => fileInputRef.current?.click()} {...clickableProps(() => fileInputRef.current?.click())} aria-label="Upload moment media" style={{ aspectRatio: "9/16", height: stageH, width: "auto", maxWidth: "100%", margin: "0 auto", background: "rgba(255,255,255,0.05)", border: "2px dashed rgba(255,255,255,0.15)", borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 10 }}>
            <IconImage />
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.55)", margin: 0 }}>{i18n.t("feed.addPhotosVideo")}</p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(255,255,255,0.25)", margin: 0 }}>{i18n.t("feed.selectMultiple")}</p>
          </div>
        ) : (
          <>
            {/* ── Frames column (left) + stage (center) + tool rail (right) — Instagram style ── */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: isMobile ? 8 : 12, width: "100%" }}>
            {/* ── Frames strip (vertical, left of canvas) ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, maxHeight: stageH, overflowY: "auto", scrollbarWidth: "none", justifyContent: frames.length ? "flex-start" : "center" }}>
              {frames.map((f, idx) => (
                <div key={f.id} onClick={() => { setActive(idx); setSel(null); setMode("idle"); setShowEmoji(false); }}
                  style={{ position: "relative", flexShrink: 0, width: 46, height: 64, borderRadius: 8, overflow: "hidden", border: idx === active ? "2px solid #2563eb" : "2px solid rgba(255,255,255,0.15)", cursor: "pointer" }}>
                  {f.type === "video" ? <video src={f.url} muted style={thumb} /> : <img src={f.url} alt="" style={thumb} />}
                  <button onClick={e => { e.stopPropagation(); removeFrame(idx); }} style={{ position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: "50%", background: "rgba(0,0,0,0.65)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                </div>
              ))}
              <button onClick={() => fileInputRef.current?.click()} title={i18n.t("feed.addFrame")} style={{ flexShrink: 0, width: 46, height: 64, borderRadius: 8, border: "2px dashed rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", fontSize: 20, cursor: "pointer" }}>＋</button>
            </div>
            {/* ── Editor stage ── */}
            <div
              ref={stageRef} data-stagebg=""
              onPointerDown={onStageDown} onPointerMove={onStageMove} onPointerUp={onStageUp} onPointerLeave={onStageUp}
              style={{ position: "relative", aspectRatio: "9/16", height: stageH, width: "auto", maxWidth: "100%", background: "#000", borderRadius: 16, overflow: "hidden", touchAction: "none", flexShrink: 0, userSelect: "none" }}
            >
              {frame.type === "video"
                ? <video data-stagebg="" src={frame.url} autoPlay muted loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
                : <img data-stagebg="" src={frame.url} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />}

              {/* Layered photo overlays (multi-photo collage) — under the drawing/text layers */}
              {(frame.photos || []).map(ph => {
                const wPct = ph.size * 100;
                const isSel = sel?.type === "photo" && sel.id === ph.id;
                return (
                  <div key={ph.id}
                    onPointerDown={e => onOverlayDown(e, "photo", ph.id)}
                    style={{ position: "absolute", left: `${ph.x * 100}%`, top: `${ph.y * 100}%`, transform: "translate(-50%, -50%)", width: `${wPct}%`, cursor: "move", padding: "2.5%", background: "#fff", borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.45)", outline: isSel ? "2px dashed #2563eb" : "none", outlineOffset: 2, pointerEvents: mode === "draw" ? "none" : "auto", touchAction: "none" }}>
                    <img src={ph.url} alt="" draggable={false} style={{ display: "block", width: "100%", height: "auto", borderRadius: 2, pointerEvents: "none" }} />
                  </div>
                );
              })}

              {/* Freehand drawing layer */}
              <canvas ref={drawCanvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />

              {/* Text overlays */}
              {frame.texts.map(t => (
                <div key={t.id}
                  onPointerDown={e => onOverlayDown(e, "text", t.id)}
                  style={{ position: "absolute", left: `${t.x * 100}%`, top: `${t.y * 100}%`, transform: "translate(-50%, -50%)", color: t.color, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: `${Math.max(10, t.size * stageW)}px`, lineHeight: 1.2, whiteSpace: "pre-wrap", textAlign: "center", maxWidth: "92%", textShadow: "0 1px 6px rgba(0,0,0,0.5)", cursor: "move", padding: 3, borderRadius: 6, outline: sel?.type === "text" && sel.id === t.id ? "1px dashed rgba(255,255,255,0.7)" : "none", pointerEvents: mode === "draw" ? "none" : "auto", touchAction: "none" }}>
                  {t.value || " "}
                </div>
              ))}

              {/* Sticker overlays */}
              {frame.stickers.map(s => (
                <div key={s.id}
                  onPointerDown={e => onOverlayDown(e, "sticker", s.id)}
                  style={{ position: "absolute", left: `${s.x * 100}%`, top: `${s.y * 100}%`, transform: "translate(-50%, -50%)", fontSize: `${Math.max(16, s.size * stageW)}px`, lineHeight: 1, cursor: "move", userSelect: "none", outline: sel?.type === "sticker" && sel.id === s.id ? "1px dashed rgba(255,255,255,0.7)" : "none", borderRadius: 8, padding: 2, pointerEvents: mode === "draw" ? "none" : "auto", touchAction: "none" }}>
                  {s.emoji}
                </div>
              ))}

              {!canEdit && (
                <div style={{ position: "absolute", bottom: 10, left: 0, right: 0, textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(255,255,255,0.6)", pointerEvents: "none" }}>
                  {i18n.t("feed.textDrawPhotosOnly")}
                </div>
              )}
            </div>

            {/* ── Tool rail (vertical, right of canvas) ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 8 : 10, justifyContent: "center", flexShrink: 0 }}>
              {TOOLS.map(t => {
                const disabled = t.needsImg && !canEdit;
                const size = isMobile ? 52 : 56;
                return (
                  <button key={t.id} onClick={() => !disabled && t.on()} disabled={disabled} title={t.label}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, border: "none", borderRadius: 14, width: size, height: size, color: "#fff", fontFamily: "'DM Sans', sans-serif", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, background: t.active ? "#2563eb" : "rgba(255,255,255,0.08)", transition: "background 0.15s ease" }}>
                    <span style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{t.icon}</span>
                    <span style={{ fontSize: 9, lineHeight: 1 }}>{t.label}</span>
                  </button>
                );
              })}
            </div>
            </div>

            {/* ── Selected music chip ── */}
            {musicFile && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, alignSelf: "center", background: "rgba(37,99,235,0.18)", border: "1px solid rgba(37,99,235,0.4)", borderRadius: 20, padding: "6px 10px 6px 12px", maxWidth: "90%" }}>
                <span style={{ fontSize: 13 }}>🎵</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#dbeafe", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>{musicName || i18n.t("feed.audioTrack")}</span>
                <button onClick={clearMusic} title={i18n.t("feed.removeMusic")} style={{ background: "rgba(255,255,255,0.12)", border: "none", borderRadius: "50%", width: 18, height: 18, color: "#fff", fontSize: 10, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}>✕</button>
              </div>
            )}

            {/* ── Contextual controls ── */}
            {(mode === "draw" || selText) && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
                {COLORS.map(c => (
                  <button key={c} onClick={() => applyColor(c)} style={{ width: 24, height: 24, borderRadius: "50%", background: c, border: color === c ? "2px solid #2563eb" : "2px solid rgba(255,255,255,0.2)", cursor: "pointer", flexShrink: 0 }} />
                ))}
              </div>
            )}
            {mode === "draw" && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
                <span style={lbl}>{i18n.t("feed.brush")}</span>
                <input type="range" min={2} max={32} value={brush} onChange={e => setBrush(+e.target.value)} style={{ flex: 1, maxWidth: 220 }} />
              </div>
            )}
            {selText && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input ref={textEditRef} value={selText.value} onChange={e => editSelText(e.target.value)} placeholder={i18n.t("feed.typeYourText")} style={inp} />
                <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
                  <span style={lbl}>{i18n.t("feed.size")}</span>
                  <input type="range" min={0.03} max={0.16} step={0.005} value={selText.size} onChange={e => setSelTextSize(+e.target.value)} style={{ flex: 1, maxWidth: 220 }} />
                </div>
              </div>
            )}
            {selSticker && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
                <span style={lbl}>{i18n.t("feed.size")}</span>
                <input type="range" min={0.06} max={0.4} step={0.01} value={selSticker.size} onChange={e => setSelStickerSz(+e.target.value)} style={{ flex: 1, maxWidth: 220 }} />
              </div>
            )}
            {selPhoto && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
                <span style={lbl}>{i18n.t("feed.size")}</span>
                <input type="range" min={0.2} max={1} step={0.02} value={selPhoto.size} onChange={e => setSelPhotoSz(+e.target.value)} style={{ flex: 1, maxWidth: 220 }} />
                <button onClick={() => photoInputRef.current?.click()} title={i18n.t("feed.addAnotherPhoto")} style={{ ...iconBtn, width: "auto", borderRadius: 16, padding: "0 12px", fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>{i18n.t("feed.addPhoto")}</button>
              </div>
            )}
            {showEmoji && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4, maxHeight: 120, overflowY: "auto", padding: 8, background: "rgba(255,255,255,0.05)", borderRadius: 12 }}>
                {EMOJIS.map(em => (
                  <button key={em} onClick={() => addSticker(em)} style={{ fontSize: 22, background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 1 }}>{em}</button>
                ))}
              </div>
            )}

            {uploadError &&<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#ef4444", textAlign: "center", margin: 0 }}>{uploadError}</p>}

            {/* ── Share (centered pill) ── */}
            <button onClick={handleShare} disabled={!frames.length || uploading}
              style={{ alignSelf: "center", minWidth: 240, maxWidth: "100%", padding: "14px 48px", background: !frames.length ? "rgba(37,99,235,0.3)" : uploading ? "rgba(37,99,235,0.6)" : "#2563eb", border: "none", borderRadius: 999, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, cursor: !frames.length || uploading ? "not-allowed" : "pointer", transition: "background 0.2s ease", boxShadow: "0 6px 18px rgba(37,99,235,0.35)" }}>
              {uploading ? i18n.t("feed.sharing") : frames.length > 1 ? i18n.t("feed.shareStories", { count: frames.length }) : i18n.t("feed.shareStory")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// NewPostModal  ─────────────────────────────────────────────────────────────────────────────

function NewPostModal({ onClose, onPosted }) {
  const fileRef = useRef(null);
  const recordRef = useRef(null); // #357: native-camera video capture input (mobile)
  const [caption, setCaption] = useState("");
  const [media, setMedia] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null); 
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!media) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(media);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [media]);

  const canPost = !posting && (caption.trim() || media);
  const handleClose = () => { if (!posting) onClose(); };

  const handlePost = async () => {
    if (!canPost) return;
    setPosting(true); setError(""); setProgress(0);
    const fd = new FormData();
    if (caption.trim()) fd.append("caption_text", caption.trim());
    if (media) fd.append("media", media);
    const onProgress = e => setProgress(e.detail);
    window.addEventListener("upload:progress", onProgress);
    try {
      await createPost(fd);
      const isVideo = media?.type?.startsWith("video");
      onPosted(isVideo ? "video" : "photo", { underReview: isVideo });
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || i18n.t("feed.postFailed"));
    } finally {
      window.removeEventListener("upload:progress", onProgress);
      setPosting(false);
    }
  };

  return (
    <div onClick={handleClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 500, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "max(16px, env(safe-area-inset-top, 0px)) 16px max(16px, env(safe-area-inset-bottom, 0px))", boxSizing: "border-box" }}>
      <style>{`@keyframes composeSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div onClick={e => e.stopPropagation()} className="bg-surface border border-border" style={{ position: "relative", borderRadius: 20, width: "min(420px, 100%)", maxHeight: "calc(100dvh - 32px)", margin: "auto", display: "flex", flexDirection: "column", overflow: "hidden", animation: "fadeUp 0.2s ease both", boxSizing: "border-box" }}>

        {/* Uploading overlay — deliberately a dark scrim regardless of theme: it sits directly
            over the media preview beneath it, not the page. */}
        {posting && (
           <div style={{ position: "absolute", inset: 0, background: "rgba(10,10,14,0.88)", backdropFilter: "blur(6px)", borderRadius: 20, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
            <div style={{ position: "relative", width: 64, height: 64 }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.08)" }} />
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid transparent", borderTopColor: "#2563eb", animation: "composeSpin 0.75s linear infinite" }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, color: "#fff", textTransform: "uppercase" }}>{media?.type?.startsWith("video") ? i18n.t("feed.uploadingVideo") : i18n.t("feed.uploadingPhoto")}</p>
            </div>
           </div>
        )}

        {/* Header stays pinned so close is always reachable */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 12px", flexShrink: 0 }}>
          <h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, margin: 0 }}>{i18n.t("feed.newPost")}</h2>
          <button onClick={handleClose} className="text-text-secondary" style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 24px 24px" }}>
          {/* Media picker */}
          <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={e => setMedia(e.target.files[0] || null)} />
          {/* #357: capture=environment makes mobile open the camera to RECORD a clip
              (falls back to a normal picker on desktop, where capture is ignored). */}
          <input ref={recordRef} type="file" accept="video/*" capture="environment" style={{ display: "none" }} onChange={e => setMedia(e.target.files[0] || null)} />
          <div onClick={() => fileRef.current?.click()} {...clickableProps(() => fileRef.current?.click())} aria-label="Add photo or video" className="bg-surface-raised" style={{ width: "100%", height: "min(320px, 42dvh)", border: `2px dashed ${media ? "rgba(37,99,235,0.5)" : "var(--color-border)"}`, borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12, cursor: "pointer", overflow: "hidden" }}>
            {media && previewUrl
              ? media.type.startsWith("video")
                ? <video src={previewUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted autoPlay loop />
                : <img  src={previewUrl} loading="lazy" decoding="async" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <><span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{i18n.t("feed.tapToUpload")}</span></>
            }
          </div>

          {/* #357: record a video clip with the camera (TikTok-style), mobile-first */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <button onClick={() => fileRef.current?.click()} className="bg-surface-raised border border-border text-text-secondary" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, padding: "10px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              {i18n.t("feed.uploadMedia", { defaultValue: "Upload" })}
            </button>
            <button onClick={() => recordRef.current?.click()} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.4)", borderRadius: 10, padding: "10px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#60a5fa", cursor: "pointer" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
              {i18n.t("feed.recordVideo", { defaultValue: "Record video" })}
            </button>
          </div>

          {/* Caption */}
          <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder={i18n.t("feed.writeCaption")} rows={3} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "12px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, resize: "none", outline: "none", marginBottom: 16 }} />

          {error && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#ef4444", margin: "0 0 12px", textAlign: "center" }}>{error}</p>}

          <button disabled={!canPost} onClick={handlePost} style={{ width: "100%", background: posting ? "rgba(37,99,235,0.5)" : "#2563eb", border: "none", borderRadius: 12, padding: "13px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#fff", cursor: canPost ? "pointer" : "default" }}>
            {posting ? i18n.t("feed.sharing") : i18n.t("feed.shareStory")}
          </button>
        </div>
      </div>
    </div>
  );
}

// InstagramVideoCard ─────────────────────────────────────────────────────────────────────────────

function InstagramVideoCard({ reel, index, isMobile, reelHeartIdx, isMuted, onMuteToggle, onToggleSave, onOpenProfile, onShare, onToggleLike }) {
  // #444: the uploader's avatar/name/handle were plain text on every video surface — there was no
  // way to reach the creator's profile from a video. #439: the share buttons on this card were
  // drawn but had no onClick at all; when the card was rebuilt into InstagramVideoCard the share
  // wiring was never carried over, so sharing "stopped working" on Social.
  const openAuthor = (e) => { e.stopPropagation(); onOpenProfile?.(reel); };
  const shareReel  = (e) => { e.stopPropagation(); onShare?.(reel); };
  const videoRef     = useRef(null);
  const hlsRef       = useRef(null);
  const srcAttached  = useRef(false);
  const lastTapRef   = useRef(0);
  const [duration,      setDuration]      = useState(0);
  const [isPlaying,     setIsPlaying]     = useState(false);
  // Landscape videos in a portrait reel get badly center-cropped with object-fit:cover
  // ("videos not aligned on mobile", bug #88) — letterbox those with `contain`, keep
  // portrait/square clips full-bleed `cover` for the shorts look.
  const [fitMode,       setFitMode]       = useState("cover");
  const [localLiked,    setLocalLiked]    = useState(!!reel.liked);
  const [localLikesCount, setLocalLikesCount] = useState(reel.likes ?? 0);
  const [localSaved,    setLocalSaved]    = useState(reel.saved ?? false);
  useEffect(() => {
    setLocalLiked(!!reel.liked);
    if (typeof reel.likes === "number") setLocalLikesCount(reel.likes);
  }, [reel.liked, reel.likes]);
  const [commentsOpen,  setCommentsOpen]  = useState(false);
  const [comments,      setComments]      = useState([]);
  const [commentDraft,  setCommentDraft]  = useState("");

  const openComments = async e => {
    if (e) e.stopPropagation();
    setCommentsOpen(true);
    try {
      const data = await getCommentsAPI(reel.id);
      const arr  = Array.isArray(data) ? data : (data?.data ?? data?.comments ?? []);
      setComments(arr.map(c => {
        const name = commentAuthorName(c);
        return {
          id:          c.comment_id ?? c.id ?? Date.now(),
          user:        name,
          avatarUrl:   commentAvatarUrl(c),
          avatar:      name.slice(0, 2).toUpperCase(),
          avatarColor: "#2563eb",
          time:        commentTime(c),
          text:        c.text ?? c.content ?? "",
          likes:       c._count?.comment_likes ?? 0,
          liked:       !!c.liked,
        };
      }));
    } catch { /* noop */ }
  };

  const handleCommentLike = async (cm) => {
    if (!cm?.id || String(cm.id).startsWith("tmp-")) return;
    let wasLiked = false;
    setComments((prev) => prev.map((c) => {
      if (c.id !== cm.id) return c;
      wasLiked = !!c.liked;
      const liked = !wasLiked;
      return { ...c, liked, likes: Math.max(0, (c.likes ?? 0) + (liked ? 1 : -1)) };
    }));
    try {
      await toggleCommentLike(reel.id, cm.id);
    } catch {
      setComments((prev) => prev.map((c) => {
        if (c.id !== cm.id) return c;
        return { ...c, liked: wasLiked, likes: Math.max(0, (c.likes ?? 0) + (wasLiked ? 1 : -1)) };
      }));
    }
  };

  const submitReelComment = async () => {
    const text = commentDraft.trim();
    if (!text) return;
    const tempId = `tmp-${Date.now()}`;
    setCommentDraft("");
    setComments(prev => [{ id: tempId, user: i18n.t("common.you"), avatar: "Y", avatarColor: "#2563eb", time: i18n.t("common.justNow"), text, likes: 0, liked: false }, ...prev]);
    try {
      const res = await addCommentAPI(reel.id, { text });
      const created = res?.data ?? res;
      if (created?.comment_id) {
        setComments(prev => prev.map(c => c.id === tempId ? {
          ...c,
          id: created.comment_id,
          user: commentAuthorName(created) || c.user,
          text: created.text ?? text,
        } : c));
      }
    } catch {
      setComments(prev => prev.filter(c => c.id !== tempId));
    }
  };

  const mappedComments = comments;
  // Mobile → bottom sheet; desktop → Instagram zoom-in modal.
  const commentsUI = isMobile ? (
    <CommentsSheet
      open={commentsOpen}
      onClose={() => setCommentsOpen(false)}
      comments={mappedComments}
      draft={commentDraft}
      onDraftChange={setCommentDraft}
      onSubmit={submitReelComment}
      onReply={cm => setCommentDraft(`@${cm.user} `)}
      onToggleLike={handleCommentLike}
      // #439: shared.jsx renders a share button here and calls onShare?.() — which was undefined
      // for reels, so it silently did nothing.
      onShare={() => onShare?.(reel)}
    />
  ) : (
    <MediaPostModal
      open={commentsOpen}
      onClose={() => setCommentsOpen(false)}
      onShare={() => onShare?.(reel)}
      media={{ url: reel.videoUrl, isVideo: true, fallbackBg: reel.gradient }}
      author={{ avatar: reel.avatar, avatarColor: reel.avatarColor, avatarUrl: reel.avatarUrl, name: reel.user, handle: reel.handle, verified: reel.verified }}
      caption={reel.caption}
      comments={mappedComments}
      liked={localLiked}
      likes={localLikesCount}
      saved={localSaved}
      onToggleLike={e => handleLike(e)}
      onToggleSave={() => { setLocalSaved(v => !v); if (onToggleSave) onToggleSave(reel.id); }}
      draft={commentDraft}
      onDraftChange={setCommentDraft}
      onSubmit={submitReelComment}
      onReply={cm => setCommentDraft(`@${cm.user} `)}
      onCommentLike={handleCommentLike}
    />
  );

  const fmt = s => { if (!s || isNaN(s)) return "0:00"; const m = Math.floor(s / 60), sec = Math.floor(s % 60); return `${m}:${sec < 10 ? "0" : ""}${sec}`; };
  const formattedLikes = localLikesCount >= 1000 ? `${(localLikesCount / 1000).toFixed(1)}K` : localLikesCount;

  // Attach the playable source. Feed/For-You URLs are HLS (.m3u8) manifests — a plain
  // <video src=".m3u8"> renders a permanent BLACK SCREEN on Chrome/Edge/Firefox (they
  // can't decode HLS natively) and never loads (bug #87). Use hls.js like the Videos page
  // does, with a native fallback for Safari (native HLS) and non-HLS sources.
  const attachSource = useCallback(() => {
    const el = videoRef.current;
    if (!el || !reel.videoUrl || srcAttached.current) return;
    srcAttached.current = true;
    const url = reel.videoUrl;
    loadHls().then((Hls) => {
      if (!el.isConnected || hlsRef.current) return;
      if (url.includes(".m3u8") && Hls.isSupported()) {
        const hls = new Hls({ startFragPrefetch: true, maxBufferLength: 30, maxMaxBufferLength: 60, backBufferLength: 30 });
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(el);
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) { hls.startLoad(); }
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); }
          else { try { hls.destroy(); } catch { /* noop */ } hlsRef.current = null; el.src = url; }
        });
      } else {
        el.src = url;
      }
    });
  }, [reel.videoUrl]);

  // Destroy the hls.js instance on unmount so detached players stop pulling fragments.
  useEffect(() => () => {
    if (hlsRef.current) { try { hlsRef.current.destroy(); } catch { /* noop */ } hlsRef.current = null; }
  }, []);

  // Lazy-load: only attach the source + play once the card is actually in view. Mounting
  // every reel's <video> with autoPlay+preload at once fanned out many simultaneous loads
  // and starved the visible clip (4-5 min loads, bug #87). The observer now drives loading.
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { attachSource(); vid.play().catch(() => {}); setIsPlaying(true); }
      else                       { vid.pause(); setIsPlaying(false); }
    }, { threshold: 0.4 });
    observer.observe(vid);
    return () => observer.disconnect();
  }, [attachSource]);

  // #438: "videos on social take a long time to load and play". The observer above only started
  // fetching once the card was already 40% on screen, so every clip paid a cold start — manifest,
  // then init segment, then first fragment — while the user stared at it. Warm the source up one
  // viewport early so the fragments are already arriving by the time it's in view.
  //
  // This deliberately does NOT go back to loading everything at once (that was bug #87, where the
  // fan-out starved the visible clip and loads took minutes): only cards within one viewport of
  // the current one warm up, and the observer disconnects after firing once. Playback is still
  // gated on the 0.4-threshold observer above — warming buffers, it does not play.
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const warm = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      attachSource();
      warm.disconnect();
    }, { rootMargin: "100% 0px", threshold: 0 });
    warm.observe(vid);
    return () => warm.disconnect();
  }, [attachSource]);

  // Letterbox landscape clips so nothing is cropped off-center on mobile (bug #88).
  const onLoadedMeta = e => {
    const v = e.currentTarget;
    setDuration(v.duration);
    if (v.videoWidth && v.videoHeight) setFitMode(v.videoWidth > v.videoHeight * 1.1 ? "contain" : "cover");
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) { videoRef.current.pause(); setIsPlaying(false); }
    else           { videoRef.current.play().catch(() => {}); setIsPlaying(true); }
  };

  const handleLike = async e => {
    if (e) e.stopPropagation();
    const prev = { liked: localLiked, count: localLikesCount };
    setLocalLiked(!localLiked);
    setLocalLikesCount(c => localLiked ? Math.max(0, c - 1) : c + 1);
    try {
      if (onToggleLike) {
        await Promise.resolve(onToggleLike(reel.id));
        return;
      }
      const res = await toggleLikeAPI(reel.id);
      const parsed = parseLikeToggle(res);
      if (parsed.liked != null) setLocalLiked(parsed.liked);
      if (typeof parsed.likes === "number") setLocalLikesCount(parsed.likes);
    } catch {
      setLocalLiked(prev.liked);
      setLocalLikesCount(prev.count);
    }
  };

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) handleLike();
    else togglePlay();
    lastTapRef.current = now;
  };

  const MuteBtn = () => (
    <button onClick={e => { e.stopPropagation(); onMuteToggle(); }} style={{ background: "rgba(0,0,0,0.55)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
      {isMuted ? <IconMuteOn /> : <IconMuteOff />}
    </button>
  );

  // Per-video fullscreen. The home document-fullscreen toggle is a no-op on iOS Safari
  // (no Fullscreen API on a div), so the only fullscreen that works on phones is on the
  // <video> itself via webkitEnterFullscreen (bug #88). Fall back to the element Fullscreen
  // API on Android/desktop.
  const enterFullscreen = e => {
    if (e) e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (typeof v.webkitEnterFullscreen === "function") { try { v.webkitEnterFullscreen(); } catch { /* noop */ } return; }
    const req = v.requestFullscreen || v.webkitRequestFullscreen || v.mozRequestFullScreen || v.msRequestFullscreen;
    if (req) { try { const r = req.call(v); if (r && typeof r.catch === "function") r.catch(() => {}); } catch { /* noop */ } }
  };
  const FsBtn = () => (
    <button onClick={enterFullscreen} title={i18n.t("app.enterFullscreen", { defaultValue: "Fullscreen" })} style={{ background: "rgba(0,0,0,0.55)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
    </button>
  );

  if (isMobile) {
    return (
      <>
      {/* Mobile: full-bleed TikTok-style video with every control (mute, fullscreen, caption,
          like/comment/share/save) composited directly over the clip — same treatment as
          LiveWatchPage's video surface, so this whole block stays dark chrome in both themes. */}
      <div style={{ height: "100dvh", scrollSnapAlign: "start", scrollSnapStop: "always", position: "relative", overflow: "hidden", background: "#000" }} onClick={handleTap}>
        {reel.videoUrl && <video ref={videoRef} preload="none" muted={isMuted} loop playsInline poster={reel.thumb || undefined} onLoadedMetadata={onLoadedMeta} style={{ width: "100%", height: "100%", objectFit: fitMode, position: "absolute", inset: 0 }} />}
        {reelHeartIdx === index && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5, pointerEvents: "none" }}><IconHeart size={90} filled color="#ef4444" /></div>}
        {!isPlaying && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 4, pointerEvents: "none" }}><div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(0,0,0,0.4)", border: "2px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}><IconPlay /></div></div>}
        <div style={{ position: "absolute", top: 75, left: 14, zIndex: 10, background: "rgba(0,0,0,0.65)", borderRadius: 5, padding: "3px 9px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, color: "#fff" }}>{fmt(duration) || "0:30"}</div>
        <div style={{ position: "absolute", top: 75, right: 14, zIndex: 10, display: "flex", flexDirection: "column", gap: 10 }}><MuteBtn /><FsBtn /></div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "45%", background: "linear-gradient(to top, rgba(0,0,0,0.9), transparent)", pointerEvents: "none", zIndex: 2 }} />
        <div style={{ position: "absolute", bottom: 80, left: 16, right: 72, zIndex: 3, pointerEvents: "none" }}>
          <div onClick={openAuthor} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, pointerEvents: "auto", cursor: "pointer", width: "fit-content" }}>
            <Avatar initials={reel.avatar} color={reel.avatarColor || "#2563eb"} size={36} border url={reel.avatarUrl} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, color: "#fff" }}>{reel.handle}</span>
            {reel.verified && <IconVerified />}
          </div>
          <ExpandableText
            text={reel.caption}
            lines={3}
            pill={false}
            className=""
            style={{ fontSize: 14, color: "rgba(255,255,255,0.9)", lineHeight: 1.45, pointerEvents: "auto" }}
          />
        </div>
        <div style={{ position: "absolute", right: 14, bottom: 90, zIndex: 3, display: "flex", flexDirection: "column", gap: 22, alignItems: "center" }}>
          <button onClick={handleLike} style={{ background: "none", border: "none", color: localLiked ? "#ef4444" : "#fff", display: "flex", flexDirection: "column", alignItems: "center", fontSize: 12, fontWeight: 600, gap: 4, cursor: "pointer" }}><IconHeart size={28} filled={localLiked} />{formattedLikes}</button>
          <button onClick={openComments} style={{ background: "none", border: "none", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", fontSize: 12, fontWeight: 600, gap: 4, cursor: "pointer" }}><IconComment size={28} />{reel.comments || 0}</button>
          <button onClick={shareReel} style={{ background: "none", border: "none", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", fontSize: 12, fontWeight: 600, gap: 4, cursor: "pointer" }}><IconShare size={28} />{i18n.t("common.share")}</button>
          <button onClick={e => { e.stopPropagation(); setLocalSaved(v => !v); if (onToggleSave) onToggleSave(reel.id); }} style={{ background: "none", border: "none", color: localSaved ? "#2563eb" : "#fff", display: "flex", flexDirection: "column", alignItems: "center", fontSize: 12, fontWeight: 600, gap: 4, cursor: "pointer" }}>
            <IconBookmark size={28} filled={localSaved} />{i18n.t("feed.save")}
          </button>
        </div>
      </div>
      {commentsUI}
      </>
    );
  }

  return (
    <>
    <div style={{ width: "100%", maxWidth: 480, borderBottom: "1px solid var(--color-border)", margin: "0 auto 32px", paddingBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0 4px" }}>
        <div onClick={openAuthor} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
          <Avatar initials={reel.avatar} color={reel.avatarColor || "#2563eb"} size={36} border url={reel.avatarUrl} />
          <div>
            <span className="text-text-primary" style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>{reel.user}{reel.verified && <IconVerified size={14} />}</span>
            <span className="text-text-secondary" style={{ fontSize: 12 }}>{reel.handle}</span>
          </div>
        </div>
        <span className="text-text-secondary" style={{ fontSize: 12 }}>• {fmt(duration)}</span>
      </div>
      {/* Video surface: the mute toggle and paused-state play badge are composited directly over
          the clip, so they stay dark chrome regardless of theme (same as the mobile card above). */}
      <div className="border border-border" style={{ position: "relative", width: "100%", borderRadius: 12, overflow: "hidden", background: "#000", aspectRatio: "4/5" }}>
        <video ref={videoRef} onLoadedMetadata={onLoadedMeta} preload="none" poster={reel.thumb || undefined} loop playsInline muted={isMuted} onClick={togglePlay} style={{ width: "100%", height: "100%", objectFit: fitMode, cursor: "pointer" }} />
        <div style={{ position: "absolute", bottom: 16, right: 16, zIndex: 10 }}><MuteBtn /></div>
        {!isPlaying && <div onClick={togglePlay} {...clickableProps(togglePlay)} aria-label="Play video" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.15)", cursor: "pointer" }}><div style={{ background: "rgba(0,0,0,0.6)", borderRadius: "50%", width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center" }}><IconPlay /></div></div>}
      </div>
      <div style={{ padding: "14px 0 2px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
          <button onClick={handleLike} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: localLiked ? "#ef4444" : "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 5 }}><IconHeart size={22} filled={localLiked} /></button>
          <button onClick={openComments} className="text-text-secondary" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}><IconComment size={22} /></button>
          <button onClick={shareReel} className="text-text-secondary" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}><IconShare size={22} /></button>
          <button onClick={() => { setLocalSaved(v => !v); if (onToggleSave) onToggleSave(reel.id); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: localSaved ? "#2563eb" : "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 5, marginLeft: "auto" }}><IconBookmark size={22} filled={localSaved} /></button>
        </div>
        <div className="text-text-primary" style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{i18n.t("feed.likesCount", { count: formattedLikes })}</div>
        <ExpandableText
          text={reel.caption}
          prefix={<span style={{ fontWeight: 700, marginRight: 8 }}>{reel.user}</span>}
          lines={3}
          className="text-text-primary"
          style={{ fontSize: 14 }}
        />
      </div>
    </div>
    {commentsUI}
    </>
  );
}

// Windowed reel feeds ───────────────────────────────────────────────────────────────────────
// Mounting EVERY reel's <video> at once (the feed returns hundreds) exhausts the mobile
// renderer's memory/decoder budget — the tab silently dies mid-load with no JS error, so no
// ErrorBoundary fires ("loads then crash", bug #89). These renderers keep the number of
// mounted <video> elements bounded regardless of how many reels the feed returns.

// Mobile: fixed full-screen (100dvh) snap reels → true windowing. Only a small slice around
// the active index is mounted; spacer divs of the off-window height preserve scroll position
// and snap so scrolling feels unchanged.
function MobileReelFeed({ reels, reelHeartIdx, videosMuted, setVideosMuted, toggleReelSave, onOpenProfile, onShare, onToggleLike }) {
  const ref = useRef(null);
  const [active, setActive] = useState(0);
  const [itemH, setItemH] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 800));
  useEffect(() => {
    const measure = () => { const el = ref.current; if (el && el.clientHeight) setItemH(el.clientHeight); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const BEHIND = 2, AHEAD = 4;
  const start = Math.max(0, active - BEHIND);
  const end   = Math.min(reels.length, active + AHEAD + 1);
  const onScroll = () => {
    const el = ref.current; if (!el) return;
    const idx = Math.round(el.scrollTop / (el.clientHeight || itemH));
    if (idx !== active && idx >= 0 && idx < reels.length) setActive(idx);
  };
  return (
    <div ref={ref} onScroll={onScroll} style={{ position: "absolute", inset: 0, overflowY: "scroll", scrollSnapType: "y mandatory", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
      {start > 0 && <div style={{ height: start * itemH }} />}
      {reels.slice(start, end).map((r, j) => {
        const i = start + j;
        return <InstagramVideoCard key={`mobile_reel_${r.id ?? i}_${i}`} reel={r} index={i} isMobile={true} reelHeartIdx={reelHeartIdx} isMuted={videosMuted} onMuteToggle={() => setVideosMuted(v => !v)} onToggleSave={toggleReelSave} onOpenProfile={onOpenProfile} onShare={onShare} onToggleLike={onToggleLike} />;
      })}
      {end < reels.length && <div style={{ height: (reels.length - end) * itemH }} />}
    </div>
  );
}

// Desktop: variable-height column → incremental render (grow as a bottom sentinel approaches).
// Caps the initial mount; the lazy per-card source attach keeps only in-view videos loading.
function DesktopReelList({ reels, reelHeartIdx, videosMuted, setVideosMuted, toggleReelSave, onOpenProfile, onShare, onToggleLike }) {
  const [count, setCount] = useState(8);
  const sentinel = useRef(null);
  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setCount(c => Math.min(reels.length, c + 8)); }, { rootMargin: "1000px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [reels.length]);
  return (
    <div style={{ display: "flex", flexDirection: "column", paddingTop: 20, paddingBottom: 24 }}>
      {reels.slice(0, count).map((r, i) => <InstagramVideoCard key={`reel_${r.id ?? i}_${i}`} reel={r} index={i} isMobile={false} reelHeartIdx={reelHeartIdx} isMuted={videosMuted} onMuteToggle={() => setVideosMuted(v => !v)} onToggleSave={toggleReelSave} onOpenProfile={onOpenProfile} onShare={onShare} onToggleLike={onToggleLike} />)}
      {count < reels.length && <div ref={sentinel} style={{ height: 1 }} />}
    </div>
  );
}

// ShareModal  ─────────────────────────────────────────────────────────────────────────────

// #457: "copy" and "twitter" reuse the same faint neutral bg as the surrounding chrome (rather
// than a brand color), so their icon must follow the theme too — a hardcoded white stroke/fill
// would vanish once that bg becomes a light surface (fixed-white-on-themed-bg trap).
const SHARE_PLATFORMS = [
  { id: "copy",      labelKey: "feed.copyLink", bg: "var(--color-surface-raised)",    icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> },
  { id: "whatsapp",  labelKey: "feed.shareWhatsApp",  bg: "rgba(37,211,102,0.15)",     icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.998 2C6.476 2 2 6.477 2 12.001a9.956 9.956 0 0 0 1.392 5.14L2 22l4.98-1.38A9.945 9.945 0 0 0 12 22c5.522 0 10-4.478 10-10.001C22 6.477 17.522 2 11.998 2z"/></svg> },
  { id: "facebook",  labelKey: "feed.shareFacebook",  bg: "rgba(24,119,242,0.15)",     icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="#1877F2"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg> },
  { id: "twitter",   label: "X",         bg: "var(--color-surface-raised)",    icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="var(--color-text-primary)"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
  { id: "email",     labelKey: "feed.shareEmail",     bg: "rgba(79,70,229,0.15)",      icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
];

function ShareModal({ post, posts, onClose }) {
  const [search,     setSearch]     = useState("");
  const [sent,       setSent]       = useState({});
  const [linkCopied, setLinkCopied] = useState(false);

  // #439: the contact row used to be built from every author in the feed and clicking one just
  // flipped local state to draw a "Sent" tick — no DM was ever sent. Only offer people we can
  // actually deliver to (we need their user_id to open a DM channel), and actually send.
  const contacts = useMemo(() => {
    const seen = new Set();
    return posts.reduce((acc, p) => {
      const userId = p.authorUserId ?? null;
      if (p.user && userId != null && !seen.has(userId)) {
        seen.add(userId);
        acc.push({ id: userId, name: p.user, handle: p.handle || `@${p.user.toLowerCase().replace(/\s+/g, "")}`, avatar: p.avatar || p.user.substring(0, 2).toUpperCase(), color: p.avatarColor || "#2563eb" });
      }
      return acc;
    }, []);
  }, [posts]);

  const filtered = search.trim()
    ? contacts.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.handle.toLowerCase().includes(search.toLowerCase()))
    : contacts;

  const shareUrl = `${window.location.origin}/post/${post.id}`;

  // Record the share so the count is real. Fire-and-forget: a failed analytics write must never
  // block the share the user actually asked for.
  const recordShare = () => { if (post.id != null) sharePost(post.id).catch(() => {}); };

  const sendToContact = async (c) => {
    if (sent[c.id] === "sending" || sent[c.id] === "done") return;
    setSent(v => ({ ...v, [c.id]: "sending" }));
    try {
      const channel = await openDmChannel(c.id, { sourceVertical: "social" });
      const channelId = channel?.channel_id ?? channel?.id ?? channel?.data?.channel_id;
      if (!channelId) throw new Error("no channel");
      await sendMessage(channelId, shareUrl);
      recordShare();
      setSent(v => ({ ...v, [c.id]: "done" }));
    } catch {
      // Show the failure instead of a tick that lies about having sent it.
      setSent(v => ({ ...v, [c.id]: "failed" }));
    }
  };

  const handlePlatform = id => {
    if (id === "copy") {
      navigator.clipboard?.writeText(shareUrl).catch(() => {});
      setLinkCopied(true);
      recordShare();
      setTimeout(() => setLinkCopied(false), 2000);
      return;
    }
    const url  = encodeURIComponent(shareUrl);
    const text = encodeURIComponent(post.caption || i18n.t("feed.shareDefaultText"));
    const map  = { whatsapp: `https://wa.me/?text=${text}%20${url}`, facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`, twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`, email: `mailto:?subject=${text}&body=${url}` };
    if (map[id]) { window.open(map[id], "_blank", "noopener,noreferrer"); recordShare(); }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 300, backdropFilter: "blur(8px)" }} />
      <div className="bg-surface-raised border border-border" style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "92%", maxWidth: 440, zIndex: 301, borderRadius: 16, display: "flex", flexDirection: "column", maxHeight: "75vh", overflow: "hidden", boxShadow: "0 24px 50px rgba(0,0,0,0.9)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--color-border-subtle)" }}>
          <div style={{ width: 14 }} />
          <span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15 }}>{i18n.t("common.share")}</span>
          <button onClick={onClose} className="text-text-primary" style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", padding: 0 }}>✕</button>
        </div>

        {/* Search */}
        <div className="bg-surface" style={{ margin: "14px 16px 10px", display: "flex", alignItems: "center", gap: 10, borderRadius: 10, padding: "10px 14px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={i18n.t("messages.search")} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }} />
        </div>

        {/* Contacts */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px 10px", padding: "16px", overflowY: "auto", maxHeight: 340, scrollbarWidth: "none" }}>
          {filtered.map(c => {
            const state = sent[c.id];
            const done  = state === "done";
            const label = done ? i18n.t("feed.sent") : state === "failed" ? i18n.t("common.retry") : c.name;
            return (
              <div key={c.id} onClick={() => sendToContact(c)} {...clickableProps(() => sendToContact(c))} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", opacity: state === "sending" ? 0.55 : 1 }}>
                <div style={{ position: "relative" }}>
                  <div style={{ width: 64, height: 64, borderRadius: "50%", background: `linear-gradient(135deg, ${c.color}, var(--color-surface-raised))`, border: done ? "2px solid #2563eb" : state === "failed" ? "2px solid #ef4444" : "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16, color: "#fff" }}>{String(c.avatar || "?").substring(0, 2).toUpperCase()}</div>
                  {done && <div style={{ position: "absolute", bottom: 0, right: 0, width: 20, height: 20, borderRadius: "50%", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--color-surface-raised)" }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><polyline points="20 6 9 17 4 12"/></svg></div>}
                </div>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 500, color: done ? "#2563eb" : state === "failed" ? "#ef4444" : "var(--color-text-primary)", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>{label}</span>
              </div>
            );
          })}
        </div>

        {/* Platform buttons */}
        <div className="bg-surface" style={{ borderTop: "1px solid var(--color-border-subtle)", padding: "14px 16px 20px" }}>
          <div style={{ display: "flex", gap: 16, overflowX: "auto", scrollbarWidth: "none" }}>
            {SHARE_PLATFORMS.map(p => (
              <div key={p.id} onClick={() => handlePlatform(p.id)} {...clickableProps(() => handlePlatform(p.id))} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0 }}>
                <div className="border border-border-subtle" style={{ width: 48, height: 48, borderRadius: "50%", background: p.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {p.id === "copy" && linkCopied ? <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> : p.icon}
                </div>
                <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textAlign: "center", whiteSpace: "nowrap" }}>{p.id === "copy" && linkCopied ? i18n.t("sellerDash.common.copied") : p.id === "copy" ? i18n.t("feed.copyLink") : p.labelKey ? i18n.t(p.labelKey) : p.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// FeedPostDetailPage  ─────────────────────────────────────────────────────────────────────────────

function FeedPostDetailPage({ post, onBack, onToggleLike, onToggleSave, onShare, onFollow }) {
  const { isMobile } = useViewport();
  const [linkCopied,   setLinkCopied]   = useState(false);
  const [comments,     setComments]     = useState([]);
  const [commentText,  setCommentText]  = useState("");
  const [replyingTo,   setReplyingTo]   = useState(null);
  const [showEmojiBar, setShowEmojiBar] = useState(false);
  const [doubleTapHeart, setDoubleTapHeart] = useState(false);
  const [localLiked,   setLocalLiked]   = useState(!!post.liked);
  const [localLikes,   setLocalLikes]   = useState(post.likes ?? 0);
  useEffect(() => {
    setLocalLiked(!!post.liked);
    if (typeof post.likes === "number") setLocalLikes(post.likes);
  }, [post.liked, post.likes]);
  const inputRef    = useRef(null);
  const lastTapRef  = useRef(0);
  const QUICK_EMOJIS = ["❤️","😂","🔥","😍","😮","👏","💯","🙌"];

  const imageSrc = post.imageUrl || post.mediaUrl || post.media_url || post.social_media_attachments?.[0]?.media_url || null;
  const isVideo  = !!imageSrc?.match(/\.(mp4|webm|mov|m4v)(\?|$)/i);

  useEffect(() => {
    if (!post?.id) return;
    getCommentsAPI(post.id).then(data => {
      const arr = Array.isArray(data) ? data : (data?.data ?? data?.comments ?? []);
      setComments(arr.map(c => {
        // social_comments stores the time as `timestamp`, and the author name lives on the
        // joined profile as display_name (handle is the @slug). Reading created_at/user_name
        // here made every comment render as "User · just now".
        const name = commentAuthorName(c);
        return {
          id:          c.comment_id ?? c.id ?? Date.now(),
          user:        name,
          handle:      c.social_profile?.handle ? `@${c.social_profile.handle}` : "@user",
          avatar:      name.slice(0, 2).toUpperCase(),
          avatarColor: ["#7c3aed","#0891b2","#059669","#d97706","#dc2626"][Math.abs(name.charCodeAt(0) || 0) % 5],
          text:        c.text ?? c.content ?? "",
          time:        commentTime(c),
          likes:       c._count?.likes ?? 0,
        };
      }));
    }).catch(() => {});
  }, [post?.id]);

  function submitComment() {
    const txt = commentText.trim();
    if (!txt) return;
    const prefix = replyingTo ? `@${replyingTo} ` : "";
    const body = prefix + txt;
    const tempId = `tmp-${Date.now()}`;
    setComments(prev => [{ id: tempId, user: i18n.t("common.you"), handle: "@you", avatar: "Y", avatarColor: "#2563eb", text: body, time: i18n.t("common.justNow"), likes: 0 }, ...prev]);
    setCommentText(""); setReplyingTo(null); setShowEmojiBar(false);
    addCommentAPI(post.id, { text: body })
      .then((res) => {
        const created = res?.data ?? res;
        if (created?.comment_id) {
          setComments(prev => prev.map(c => c.id === tempId ? {
            ...c,
            id: created.comment_id,
            user: commentAuthorName(created) || c.user,
            handle: created.social_profile?.handle ? `@${created.social_profile.handle}` : c.handle,
            text: created.text ?? body,
          } : c));
        }
      })
      .catch(() => {
        setComments(prev => prev.filter(c => c.id !== tempId));
      });
  }

  function handleDoubleTap() {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      if (!localLiked) { setLocalLiked(true); setLocalLikes(n => n + 1); onToggleLike(post.id); }
      setDoubleTapHeart(true);
      setTimeout(() => setDoubleTapHeart(false), 1100);
    }
    lastTapRef.current = now;
  }

  // ── render helpers ──────────────────────────────────────────────────────────
  // These are called as functions, NOT mounted as <Components />. They close over this
  // component's state, so as JSX elements they would get a fresh type identity on every
  // render and React would unmount + remount their whole subtree. That is fatal for the
  // media node: the <video> re-requested its src and lost currentTime every time comments
  // loaded (the "flash") and on every keystroke in the comment box (the "freeze") — #441.
  // Calling them inlines the elements into this tree, so the <video> is reconciled by
  // position and survives re-renders.

  const renderCommentRow = (c) => (
    <div key={c.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
      <Avatar initials={c.avatar} color={c.avatarColor} size={32} border />
      <div style={{ flex: 1, minWidth: 0 }}>
        <ExpandableText
          text={c.text}
          prefix={<span className="text-text-primary" style={{ fontWeight: 700, marginRight: 6 }}>{c.user}</span>}
          lines={4}
          className="text-text-primary"
          style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 5 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{c.time}</span>
          <button onClick={() => { setReplyingTo(c.user); setCommentText(`@${c.user} `); setTimeout(() => inputRef.current?.focus(), 80); }} className="text-text-secondary" style={{ background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>{i18n.t("common.reply")}</button>
        </div>
      </div>
    </div>
  );

  const renderCommentBar = () => (
    <div className="bg-surface" style={{ borderTop: "1px solid var(--color-border)", padding: "10px 16px 14px", flexShrink: 0 }}>
      {replyingTo && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: "5px 12px", background: "rgba(37,99,235,0.1)", borderRadius: 8, borderLeft: "3px solid #2563eb" }}>
          <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("feed.replyingTo", { handle: replyingTo })}</span>
          <button onClick={() => { setReplyingTo(null); setCommentText(""); }} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
        </div>
      )}
      {showEmojiBar && (
        <div style={{ display: "flex", gap: 4, marginBottom: 8, overflowX: "auto", scrollbarWidth: "none" }}>
          {QUICK_EMOJIS.map(e => <button key={e} onClick={() => setCommentText(t => t + e)} className="bg-surface-raised" style={{ border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 20, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}>{e}</button>)}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {(() => {
          const me = getUser();
          return (
            <Avatar
              initials={(me?.display_name ?? me?.username ?? "Y").slice(0, 2).toUpperCase()}
              color="#2563eb"
              size={32}
              url={me?.profile_pic_url || me?.avatarUrl || null}
              border={false}
            />
          );
        })()}
        <div className="bg-surface-raised border border-border" style={{ flex: 1, borderRadius: 24, display: "flex", alignItems: "center", padding: "0 14px", gap: 8 }}>
          <input ref={inputRef} value={commentText} maxLength={2000} onChange={e => setCommentText(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), submitComment())} placeholder={i18n.t("pinboard.addComment")} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 14, padding: "10px 0", caretColor: "#2563eb" }} />
          <button onClick={() => setShowEmojiBar(v => !v)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 0, lineHeight: 1, opacity: showEmojiBar ? 1 : 0.5 }}>😊</button>
        </div>
        {commentText.trim() && <button onClick={submitComment} style={{ background: "#2563eb", border: "none", borderRadius: 20, padding: "8px 16px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer", flexShrink: 0 }}>{i18n.t("common.post")}</button>}
      </div>
    </div>
  );

  const renderActionsBar = () => (
    <div style={{ padding: "12px 16px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 8 }}>
        <button onClick={() => {
          const prevLiked = localLiked;
          const prevCount = localLikes;
          const n = !localLiked;
          setLocalLiked(n);
          setLocalLikes(c => n ? c + 1 : Math.max(0, c - 1));
          Promise.resolve(onToggleLike(post.id)).catch(() => { setLocalLiked(prevLiked); setLocalLikes(prevCount); });
        }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: localLiked ? "#ef4444" : "var(--color-text-secondary)" }}>
          <IconHeart size={24} filled={localLiked} />
        </button>
        <button onClick={() => setTimeout(() => inputRef.current?.focus(), 80)} className="text-text-secondary" style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          <IconComment size={24} />
        </button>
        {/* #439: this used to call navigator.share WITHOUT a url (so the link was lost — it shared
            a bare title + caption), and on desktop, where navigator.share is undefined, it fell
            back to a clipboard write with no feedback at all, which reads as a dead button. Prefer
            the real share sheet when the host gives us one; otherwise copy and SAY so. */}
        <button onClick={() => {
          if (onShare) { onShare(post); return; }
          const url = `${window.location.origin}/post/${post.id}`;
          if (navigator.share) { navigator.share({ title: post.user, text: post.caption ?? "", url }).catch(() => {}); return; }
          navigator.clipboard?.writeText(url).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }).catch(() => {});
        }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: linkCopied ? "#22c55e" : "var(--color-text-secondary)" }}>
          <IconShare size={24} />
        </button>
        <button onClick={() => onToggleSave(post.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: post.saved ? "#2563eb" : "var(--color-text-secondary)", marginLeft: "auto" }}>
          <IconBookmark size={24} filled={post.saved} />
        </button>
      </div>
      <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{i18n.t("feed.likesCount", { count: localLikes.toLocaleString() })}</p>
      <ExpandableText
        text={post.caption}
        prefix={<span style={{ fontWeight: 700, marginRight: 6 }}>{post.handle}</span>}
        lines={4}
        className="text-text-primary"
        style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 4 }}
      />
      {post.created_at && <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{timeAgo(post.created_at)}</span>}
    </div>
  );

  // Post media: photo/video surface — stays dark regardless of theme (rule 3), same as every
  // other post/story media surface in this file (the double-tap heart burst needs a dark
  // backdrop to read against either way).
  const renderMediaSection = (s) => (
    <div style={{ position: "relative", background: "#000", ...s }} onClick={handleDoubleTap}>
      {imageSrc
        ? (isVideo
            ? <video src={imageSrc} controls playsInline style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
            : <img src={imageSrc} loading="lazy" decoding="async" alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} onError={e => { e.currentTarget.style.display = "none"; }} />)
        : <div style={{ width: "100%", height: "100%", minHeight: 200, background: post.gradient || "linear-gradient(135deg,#1e3a5f,#0f2744)" }} />}
      {doubleTapHeart && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", overflow: "hidden" }}>
          {/* ripple ring */}
          <div style={{ position: "absolute", width: 80, height: 80, borderRadius: "50%", border: "2px solid rgba(239,68,68,0.55)", animation: "heartBurstRipple 0.55s ease-out both" }} />
          {/* central heart */}
          <svg width={100} height={100} viewBox="0 0 24 24" fill="#ef4444" style={{ position: "absolute", animation: "heartBurstCenter 0.65s cubic-bezier(0.34,1.56,0.64,1) both", filter: "drop-shadow(0 0 22px #ef4444cc)" }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          {/* satellite hearts */}
          {[[-52,10],[52,10],[-26,-50],[26,-50],[0,-60]].map(([dx,dy],i) => (
            <svg key={i} width={i%2===0?20:16} height={i%2===0?20:16} viewBox="0 0 24 24" fill="#ef4444"
              style={{ position: "absolute", left: `calc(50% + ${dx}px)`, top: `calc(50% + ${dy}px)`, transform: "translate(-50%,-50%)", animation: `heartBurstFloat ${0.62+i*0.04}s ease ${i*55}ms both`, filter: "drop-shadow(0 0 5px #ef444488)" }}>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          ))}
        </div>
      )}
    </div>
  );

  // ── MOBILE: post media as backdrop + comments in the 75% bottom sheet ─────────
  if (isMobile) {
    return (
      <>
        <div className="bg-bg" style={{ position: "fixed", inset: 0, zIndex: 120, display: "flex", flexDirection: "column" }}>
          {/* Sticky header */}
          <div className="bg-bg" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--color-border-subtle)", flexShrink: 0 }}>
            <button onClick={onBack} className="text-text-primary" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <Avatar initials={post.avatar} color={post.avatarColor} size={28} border url={post.avatarUrl} />
            <span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, flex: 1 }}>{post.handle}</span>
            {post.verified && <IconVerified size={14} />}
            {onFollow ? <button type="button" onClick={() => onFollow(post)} style={{ background: "#2563eb", border: "none", borderRadius: 16, padding: "5px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>{i18n.t("common.follow")}</button> : null}
          </div>
          {/* Post media + actions (peeks above the comments sheet) */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {renderMediaSection({ width: "100%", aspectRatio: "1/1" })}
            {renderActionsBar()}
            {post.caption && (
              <div style={{ padding: "4px 16px 16px" }}>
                <ExpandableText
                  text={post.caption}
                  prefix={<span style={{ fontWeight: 700, marginRight: 6 }}>{post.handle}</span>}
                  lines={4}
                  className="text-text-primary"
                  style={{ fontSize: 13, lineHeight: 1.5 }}
                />
              </div>
            )}
          </div>
        </div>
        {/* Comments as the standard 75% bottom sheet; closing returns to the feed */}
        <CommentsSheet
          open
          onClose={onBack}
          comments={comments.map(c => ({
            id: c.id,
            user: c.user,
            avatar: c.avatar,
            avatarColor: c.avatarColor,
            avatarUrl: c.avatarUrl,
            time: c.time,
            text: c.text,
            // No client-side comment-like state any more: nothing persisted it, so the
            // counter only ever moved in the current tab. Show what the server reports.
            likes: c.likes ?? 0,
            liked: false,
          }))}
          draft={commentText}
          onDraftChange={setCommentText}
          onSubmit={submitComment}
          onReply={cm => { setReplyingTo(cm.user); setCommentText(`@${cm.user} `); }}
          onToggleLike={() => {}}
        />
      </>
    );
  }

  // ── DESKTOP: Instagram side-by-side ──────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: 108, overflow: "hidden" }}>
      <div style={{ padding: "14px 48px 0 0", flexShrink: 0 }}>
        <button onClick={onBack} className="bg-surface-raised text-text-secondary" style={{ border: "none", borderRadius: 8, padding: "7px 14px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
          <IconBack /> Back
        </button>
      </div>
      <div className="bg-surface border border-border" style={{ flex: 1, display: "flex", overflow: "hidden", borderRadius: 16, maxWidth: 960, width: "100%", margin: "0 auto 32px" }}>
        {/* Left: media */}
        <div style={{ flex: "0 0 54%", background: "#000", borderRight: "1px solid var(--color-border-subtle)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {renderMediaSection({ width: "100%", height: "100%", maxHeight: "80vh" })}
        </div>
        {/* Right: details + comments */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Author header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--color-border-subtle)", flexShrink: 0 }}>
            <Avatar initials={post.avatar} color={post.avatarColor} size={36} border url={post.avatarUrl} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13 }}>{post.handle}</span>
                {post.verified && <IconVerified size={14} />}
              </div>
              <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{post.created_at ? timeAgo(post.created_at) : ""}</span>
            </div>
            {onFollow ? <button type="button" onClick={() => onFollow(post)} style={{ background: "#2563eb", border: "none", borderRadius: 16, padding: "5px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>{i18n.t("common.follow")}</button> : null}
          </div>
          {/* Scrollable: caption + comments */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
            <div style={{ display: "flex", gap: 10, padding: "14px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
              <Avatar initials={post.avatar} color={post.avatarColor} size={32} border url={post.avatarUrl} />
              <ExpandableText
                text={post.caption}
                prefix={<span style={{ fontWeight: 700, marginRight: 6 }}>{post.handle}</span>}
                lines={6}
                className="text-text-primary"
                style={{ fontSize: 13, lineHeight: 1.5 }}
              />
            </div>
            {comments.length === 0 && <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, padding: "24px 0", textAlign: "center" }}>{i18n.t("feed.noCommentsYet")}</p>}
            {comments.map(c => renderCommentRow(c))}
            <div style={{ height: 12 }} />
          </div>
          {/* Actions */}
          <div style={{ borderTop: "1px solid var(--color-border-subtle)", flexShrink: 0 }}>
            {renderActionsBar()}
          </div>
          {renderCommentBar()}
        </div>
      </div>
    </div>
  );
}

// ── Instagram-style 3-col grid (Saved / Liked tabs) ──────────────────────────

function FeedInstaGrid({ items = [], title, onSelect, emptyLabel }) {
  const [filter, setFilter] = useState("all");
  const filtered = items.filter(p =>
    filter === "post"  ? !p.imageUrl && !p.videoUrl && !p.media_url :
    filter === "video" ? !!(p.videoUrl || p.media_type === "video") :
    true
  );
  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ padding: "20px 0 14px", textAlign: "center" }}>
        <h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>{title}</h2>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", paddingBottom: 16 }}>
        {[{ id: "all", label: i18n.t("events.categories.all") }, { id: "post", label: i18n.t("social.post") }, { id: "video", label: i18n.t("messages.video") }].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={filter === f.id ? "text-text-primary" : "text-text-secondary"} style={{ padding: "6px 20px", borderRadius: 20, border: `1.5px solid ${filter === f.id ? "var(--color-text-primary)" : "var(--color-border)"}`, background: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
            {f.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="text-text-muted" style={{ textAlign: "center", padding: "60px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
          {items.length === 0 ? emptyLabel : i18n.t("feed.noFilterMatch")}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
          {/* A `Math.random()` key fallback used to sit on the tile below. It produced a fresh
              key on every render, so React unmounted and remounted every keyless tile each pass —
              restarting <video> elements and re-fetching images. The list index is stable. */}
          {filtered.map((p, gridIdx) => {
            const src = p.imageUrl || p.mediaUrl || p.media_url || null;
            const isVid = !!(p.videoUrl || p.media_type === "video");
            return (
              // Grid tile: real media fills it edge-to-edge; the no-media fallback is a dark
              // gradient card (rule 3, matches MediaPlaceholder in Social.jsx) so it still reads
              // as a media tile rather than a themed page surface.
              <div key={p.id ?? `idx-${gridIdx}`} onClick={() => onSelect && onSelect(p)} {...clickableProps(() => onSelect && onSelect(p))} aria-label={p.caption || i18n.t("feed.viewPost", { defaultValue: "View post" })} style={{ position: "relative", paddingBottom: "125%", cursor: "pointer", overflow: "hidden", background: "#0d1421" }}>
                {src ? (
                  isVid
                    ? <video src={src} muted playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    : <img loading="lazy" decoding="async" src={src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg,${p.avatarColor ?? "#2563eb"}28,#0d1421)`, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 8 }}>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "rgba(255,255,255,0.75)", lineHeight: 1.4, margin: 0, display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.caption ?? ""}</p>
                  </div>
                )}
                {isVid && (
                  <div style={{ position: "absolute", top: 5, right: 5, pointerEvents: "none" }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="#fff" opacity={0.9}><polygon points="5,3 19,12 5,21"/></svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// FeedPage  ─────────────────────────────────────────────────────────────────────────────

// A /post/:id deep link should open its post exactly once per app session. Module-scoped
// (not component state) so it survives FeedPage remounts when switching tabs; it resets on a
// full page reload, which is correct — a fresh load of /post/:id should open the post again.
let deepLinkConsumed = false;

// The "Welcome to Strug" follow onboarding must show ONCE per account — for a new
// user the first time only. We persist a per-user flag in localStorage so it never
// reappears on refresh (previously it was component state that reset every reload).
function feedOnboardKey() {
  const me = getUser();
  const id = me?.user_id ?? me?.profile_id ?? me?.id;
  return id != null ? `strug_feed_onboarded_${id}` : null;
}
function hasSeenFeedOnboarding() {
  try { const k = feedOnboardKey(); return k ? localStorage.getItem(k) === "1" : false; } catch { return false; }
}
function markFeedOnboardingSeen() {
  try { const k = feedOnboardKey(); if (k) localStorage.setItem(k, "1"); } catch { /* storage unavailable */ }
}
function isRecentlyCreatedAccount(user, maxAgeMs = 1000 * 60 * 60 * 24 * 3) {
  const raw = user?.created_at ?? user?.createdAt ?? user?.social_created_at ?? user?.socialCreatedAt;
  if (!raw) return false;
  const createdAt = new Date(raw).getTime();
  return Number.isFinite(createdAt) && Date.now() - createdAt >= 0 && Date.now() - createdAt <= maxAgeMs;
}

function FeedPage({ initialPostId = null, authReady = true }) {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("feed");
  const { isMobile } = useViewport();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [posts,   setPosts]   = useState([]);
  const [reels,   setReels]   = useState([]);
  const [stories, setStories] = useState([feedYourStoryEntry()]);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [tab,          setTab]          = useState("photos");
  const [gridFilter,   setGridFilter]   = useState("all");
  const [libraryPosts, setLibraryPosts] = useState([]); // server Saved/Liked library
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [viewStory,    setViewStory]    = useState(null);
  const [showStoryComposer, setShowStoryComposer] = useState(false);
  const [showCompose,  setShowCompose]  = useState(false);
  const [underReviewNotice, setUnderReviewNotice] = useState(false);
  const [shareModal,   setShareModal]   = useState(null);
  const [isNavVisible, setIsNavVisible] = useState(true);
  const [mobileHeaderCompact, setMobileHeaderCompact] = useState(false);

  // ── Post CRUD modals ──────────────────────────────────────────────────────
  const [postOptionsMenu,  setPostOptionsMenu]  = useState(null);
  const [reportPostTarget, setReportPostTarget] = useState(null);
  const [editPostModal,    setEditPostModal]    = useState(null);
  const [deletePostTarget, setDeletePostTarget] = useState(null);
  const [deletingPost,     setDeletingPost]     = useState(false);

  // ── Comments ──────────────────────────────────────────────────────────────
  const [expandedComments,     setExpandedComments]     = useState(new Set());
  const [commentInputs,        setCommentInputs]        = useState({});
  const [postCommentsData,     setPostCommentsData]     = useState({});
  const [editingCommentId,     setEditingCommentId]     = useState(null);
  const [editText,             setEditText]             = useState("");
  const [deleteCommentTarget,  setDeleteCommentTarget]  = useState(null);
  const [showAllCommentsPostId, setShowAllCommentsPostId] = useState(null);
  const [commentsSheetPostId,  setCommentsSheetPostId]  = useState(null); // mobile bottom sheet
  const [commentsModalPostId,  setCommentsModalPostId]  = useState(null); // desktop zoom-in modal

  // ── Misc ──────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCat,     setSearchCat]     = useState("top"); // top | people | videos | posts | tags
  const [searchResults, setSearchResults] = useState({ profiles: [], tags: [] }); // from discovery API
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeTag,     setActiveTag]     = useState(null);  // hashtag drilled into
  const [tagPosts,      setTagPosts]      = useState([]);
  const [tagLoading,    setTagLoading]    = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState(new Set());
  const [followedSuggestions,  setFollowedSuggestions]  = useState(new Set());
  // Accounts the current user already follows (user_id / profile_id / @handle keys),
  // loaded from the backend so "Suggested for you" never re-recommends them.
  const [followingKeys,        setFollowingKeys]        = useState(new Set());
  // Server-side "who to follow" — public profiles you don't follow, ranked by popularity.
  // Used as the primary source for the suggestion strip so discovery doesn't dry up once
  // you've followed everyone in your own feed. (bug #67)
  const [serverSuggestions,    setServerSuggestions]    = useState([]);

  // ── "For You" personalized recommendations ──
  const [forYouItems,   setForYouItems]   = useState([]);
  const [forYouCursor,  setForYouCursor]  = useState(0);
  const [forYouLoading, setForYouLoading] = useState(false);
  const [forYouReady,   setForYouReady]   = useState(false);
  const forYouSentinel = useRef(null);

  // ── Dwell / impression capture (feeds the recommendation engine) ──
  const impressionBuf = useRef(new Map()); // key -> { content_type, content_id, source, dwell_ms, completed }
  const dwellStart    = useRef(new Map()); // key -> timestamp when the card became visible
  const [onboardingDismissed,  setOnboardingDismissed]  = useState(hasSeenFeedOnboarding); // sticky once seen (per-user)
  const [followsNobody,        setFollowsNobody]        = useState(false); // new account → force follow onboarding
  const [reelHeartIdx, setReelHeartIdx] = useState(null);
  const [tagsOverlayPostId, setTagsOverlayPostId] = useState(null); // single-tap → show tagged profiles
  const [heartBurstPostId,  setHeartBurstPostId]  = useState(null); // double-tap → like animation
  const [videosMuted,  setVideosMuted]  = useState(true);

  const me          = getUser();
  const meUserId    = me?.user_id ?? me?.id ?? null;
  const meProfileId = me?.profile_id ?? null;
  const meAvatarUrl = me?.profile_pic_url ?? null;
  const meInitials  = (me?.display_name ?? me?.username ?? "Y").slice(0, 2).toUpperCase();

  const lastScrollRef = useRef(0);
  const mobileCompactRef = useRef(false);
  const swipeStartRef = useRef({ x: 0, y: 0 });
  const mediaTapRef       = useRef({});   // postId → last tap timestamp (single vs double-tap)
  const singleTapTimerRef = useRef(null); // pending single-tap action, cancelled on double-tap

  // Seed the in-memory cache from sessionStorage so a hard refresh paints the last
  // feed instantly (then we revalidate in the background) instead of waiting on /home.
  const cache        = useRef(null);
  if (cache.current === null) {
    let cachedPosts = [];
    try { const raw = sessionStorage.getItem(FEED_CACHE_KEY); if (raw) cachedPosts = JSON.parse(raw); } catch { /* ignore */ }
    cache.current = { posts: Array.isArray(cachedPosts) ? cachedPosts : [], reels: [], stories: [feedYourStoryEntry()] };
  }
  const sentinelRef  = useRef(null);
  const [nextCursor,   setNextCursor]   = useState(null);
  const [loadingMore,  setLoadingMore]  = useState(false);
  // True once the first /home fetch has resolved. Until then we keep the skeleton up
  // rather than flashing the empty "No posts" state while the request is still in flight.
  const [feedReady,    setFeedReady]    = useState(() => cache.current.posts.length > 0);
  const [storiesReady, setStoriesReady] = useState(() => cache.current.stories.length > 1);
  const [commentsLoading, setCommentsLoading] = useState({});

  useEffect(() => {
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && nextCursor && !loadingMore) {
        setLoadingMore(true);
        loadFeed(nextCursor).finally(() => setLoadingMore(false));
      }
    }, { threshold: 0.1 });

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [nextCursor, loadingMore]);

  // ── Data fetchers ──────────────────────────────────────────────────────────

  const loadStories = async () => {
    try {
      const res   = await getStoryFeed();
      const items = res?.data ?? res;
      if (!Array.isArray(items)) return;

      const apiStories = items.map((group, i) => {
        const sorted      = [...(group.stories || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const first       = sorted[0];
        const profile     = group.profile ?? {};
        const displayName = profile.display_name || profile.handle || i18n.t("common.defaultUser");
        return {
          id:            profile.profile_id ?? first?.profile_id ?? `story_${i}`,
          userId:        profile.user_id ?? null,
          name:          displayName,
          initials:      displayName.slice(0, 2).toUpperCase(),
          color:         "#2563eb",
          hasStory:      group.hasUnseen ?? true,
          profilePicUrl: profile.profile_pic_url ?? null,
          mediaUrl:      first?.media_url ?? null,
          media_url:     first?.media_url ?? null,
          media_type:    first?.media_type ?? "image",
          stories:       sorted,
        };
      });

      setStories([feedYourStoryEntry(), ...apiStories]);
    } catch (err) { console.error("Story fetch error:", err); }
    finally { setStoriesReady(true); }
  };

  const mapLibraryPost = (p, { liked = false, saved = false } = {}) => {
    const att = p.social_media_attachments?.[0];
    const isVid = att?.media_type === "video" || p.media_type === "video";
    return {
      id:              p.social_post_id ?? p.id,
      user:            p.social_profile?.display_name ?? i18n.t("common.defaultUser"),
      handle:          p.social_profile?.handle ? `@${p.social_profile.handle}` : "@user",
      avatarUrl:       p.social_profile?.profile_pic_url ?? null,
      avatar:          (p.social_profile?.display_name ?? "U").slice(0, 2).toUpperCase(),
      avatarColor:     "#2563eb",
      caption:         p.caption_text ?? "",
      imageUrl:        isVid ? null : (att?.media_url || p.media_url || null),
      videoUrl:        isVid ? (att?.media_url || p.media_url || null) : null,
      media_type:      isVid ? "video" : "image",
      authorProfileId: p.profile_id ?? p.social_profile?.profile_id,
      authorUserId:    p.social_profile?.user_id,
      verified:        p.social_profile?.is_verified ?? false,
      created_at:      p.created_at ?? null,
      likes:           p._count?.social_interactions ?? 0,
      comments:        p._count?.social_comments ?? 0,
      liked:           liked || p.liked || false,
      saved:           saved || p.saved || false,
      _kind:           isVid ? "video" : "post",
    };
  };

  useEffect(() => {
    if (tab !== "saved" && tab !== "liked") return;
    let cancelled = false;
    (async () => {
      setLibraryLoading(true);
      try {
        const res = tab === "saved" ? await getBookmarkedPosts() : await getLikedPosts();
        const raw = Array.isArray(res) ? res : (res?.data ?? []);
        if (cancelled) return;
        setLibraryPosts(raw.filter(Boolean).map(p => mapLibraryPost(p, {
          liked: tab === "liked",
          saved: tab === "saved",
        })));
      } catch (err) {
        console.error("Library fetch error:", err);
        if (!cancelled) setLibraryPosts([]);
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab]);

  const loadFeed = async (cursor = null) => {
    try {
      // #366: pass the cursor as an OBJECT — getFeed forwards it to axios `{ params }`,
      // which serialises objects (…?cursor=123) but mangles a raw "?cursor=123" string,
      // so the backend never received a clean cursor and pagination stalled after page 1.
      const res   = await apiFetchFeed(cursor ? { cursor } : undefined);
      const items = res?.data ?? [];
      if (!Array.isArray(items)) { setPosts([]); return; }

      const mapped = items
        // Keep sponsored shadow-posts (rendered as ads); still drop video attachments.
        .filter(p => !p.social_media_attachments?.some(a => a.media_type === "video"))
        .map(p => ({
          id:              p.social_post_id ?? p.id,
          user:            p.social_profile?.display_name ?? i18n.t("common.defaultUser"),
          handle:          p.social_profile?.handle ? `@${p.social_profile.handle}` : "@user",
          avatarUrl:       p.social_profile?.profile_pic_url ?? null,
          avatar:          (p.social_profile?.display_name ?? "U").slice(0, 2).toUpperCase(),
          avatarColor:     "#2563eb",
          caption:         p.caption_text ?? "",
          imageUrl:        p.social_media_attachments?.[0]?.media_url || p.mediaUrl || p.media_url || null,
          authorProfileId: p.profile_id ?? p.social_profile?.profile_id,
          authorUserId:    p.social_profile?.user_id,
          verified:        p.social_profile?.is_verified ?? false,
          created_at:      p.created_at ?? null,
          likes:           p._count?.social_interactions ?? 0,
          comments:        p._count?.social_comments ?? 0,
          liked:           postIsLiked(p),
          saved:           p.bookmarks?.length > 0,
          // Sponsored shadow-post fields injected by the ad engine.
          is_ad:           p.is_ad ?? false,
          campaign_id:     p.campaign_id ?? null,
          cta_text:        p.cta_text ?? null,
          target_url:      p.target_url ?? null,
        }));

      // First load → replace posts. Paginating → append (deduped by id so overlapping
      // cursor pages don't create duplicate React keys).
      setPosts(prev => {
        if (!cursor) return mapped;
        const seen = new Set(prev.map(p => p.id));
        return [...prev, ...mapped.filter(p => !seen.has(p.id))];
      });
      setNextCursor(res.nextCursor ?? null);

      // Only cache the first page — in memory and (for instant refresh) in sessionStorage
      if (!cursor) {
        cache.current.posts = mapped;
        try { sessionStorage.setItem(FEED_CACHE_KEY, JSON.stringify(mapped.slice(0, 20))); } catch { /* quota / private mode */ }
      }

    } catch (err) { console.error("Feed error:", err); }
    finally { if (!cursor) setFeedReady(true); } // first page resolved → stop the skeleton
  };

  const loadReels = async () => {
    try {
      const res   = await getVideoFeed();
      const items = res?.data ?? [];
      setReels(items.map(v => ({
        id:          v.id ?? v.social_post_id,
        // The video feed returns the author under `channel` and the playable URL as
        // `processed_video_url` (HLS / SAS-wrapped raw). Previously this mapping read
        // social_profile / media_url, so videos had no avatar/name (bug #9) and a null
        // src that rendered as a broken/blank player (bug #11).
        user:        v.user ?? v.channel?.display_name ?? v.social_profile?.display_name ?? i18n.t("common.defaultUser"),
        handle:      v.handle ?? (v.channel?.handle ? `@${v.channel.handle}` : (v.social_profile?.handle ? `@${v.social_profile.handle}` : "@user")),
        avatarUrl:   v.channel?.profile_pic_url ?? v.social_profile?.profile_pic_url ?? null,
        avatar:      (v.user ?? v.channel?.display_name ?? v.social_profile?.display_name ?? "U").slice(0, 2).toUpperCase(),
        avatarColor: "#2563eb",
        // #444: the author ids were never mapped through here (the post mapper in loadFeed does map
        // them), so a video card had no way to identify its uploader and the avatar/name couldn't
        // link anywhere. The handle is the fallback when a row carries no id.
        authorUserId:    v.social_profile?.user_id ?? v.channel?.user_id ?? null,
        authorProfileId: v.profile_id ?? v.social_profile?.profile_id ?? null,
        caption:     v.caption_text ?? v.caption ?? v.title ?? "",
        videoUrl:    v.videoUrl ?? v.processed_video_url ?? v.hls_url ?? v.media_url ?? v.social_media_attachments?.[0]?.media_url ?? null,
        thumb:       v.thumb ?? v.thumbnail_url ?? v.thumbnail ?? null,
        likes:       v.likes ?? v.likes_count ?? v._count?.social_interactions ?? 0,
        // `a ?? b?.length > 0` already yields a boolean on the right-hand side (undefined > 0
        // is false), so the trailing `?? false` these used to carry was unreachable.
        liked:       v.liked ?? v.social_interactions?.length > 0,
        saved:       v.saved ?? v.bookmarks?.length > 0,
        comments:    v.comments_count ?? v._count?.social_comments ?? 0,
        verified:    v.social_profile?.is_verified ?? false,
      })));
    } catch (err) { console.error("Video feed error:", err); }
  };

  // ── Impression / dwell tracking ──
  const recordVisible = useCallback((key) => {
    if (!dwellStart.current.has(key)) dwellStart.current.set(key, Date.now());
  }, []);
  const recordHidden = useCallback((key, meta) => {
    const t0 = dwellStart.current.get(key);
    if (!t0) return;
    dwellStart.current.delete(key);
    const dwell = Date.now() - t0;
    if (dwell < 300) return; // ignore flickers / fast scroll-past
    const e = impressionBuf.current.get(key) || { ...meta, dwell_ms: 0, completed: false };
    e.dwell_ms += dwell;
    if (dwell > 2500) e.completed = true; // lingered → treat as a meaningful view
    impressionBuf.current.set(key, e);
  }, []);
  const flushImpressions = useCallback(() => {
    for (const key of [...dwellStart.current.keys()]) recordHidden(key, {});
    const items = [...impressionBuf.current.values()].filter(x => x.content_id != null);
    if (!items.length) return;
    impressionBuf.current.clear();
    trackImpressions(items).catch(() => {});
  }, [recordHidden]);

  // Personalized "For You" feed — posts + videos from creators you don't follow.
  const loadForYou = async (offset = 0) => {
    if (forYouLoading) return;
    setForYouLoading(true);
    try {
      const res   = await getForYou({ limit: 12, offset });
      const items = (res?.data ?? []).map(it => {
        if (it.content_type === "video") {
          return {
            _kind:       "video",
            id:          it.id ?? it.video_id,
            user:        it.user ?? i18n.t("feed.defaultCreator"),
            handle:      it.handle ?? "@creator",
            avatarUrl:       it.social_profile?.profile_pic_url
                   ?? it.profile_pic_url
                   ?? it.avatarUrl
                   ?? null,
            avatar:          (it.social_profile?.display_name ?? it.display_name ?? "U").slice(0, 2).toUpperCase(),
            avatarColor: "#2563eb",
            // #444: same omission as loadReels — the For-You video branch dropped the author ids
            // while the post branch below kept them, so only videos had an unclickable uploader.
            authorUserId:    it.social_profile?.user_id ?? it.channel?.user_id ?? null,
            authorProfileId: it.profile_id ?? it.social_profile?.profile_id ?? null,
            caption:     it.title ?? "",
            videoUrl:    it.videoUrl ?? it.hls_url ?? null,
            thumb:       it.thumb ?? it.thumbnail_url ?? it.thumbnail ?? null,
            likes:       it.metrics?.likes ?? 0,
            liked:       false,
            saved:       false,
            comments:    0,
            verified:    false,
            isRecommended: true,
            recReason:   it.rec_reason,
          };
        }
        return {
          _kind:           "post",
          id:              it.social_post_id ?? it.id,
          user:            it.social_profile?.display_name ?? i18n.t("common.defaultUser"),
          handle:          it.social_profile?.handle ? `@${it.social_profile.handle}` : "@user",
          avatarUrl:       it.social_profile?.profile_pic_url
                   ?? it.profile_pic_url
                   ?? it.avatarUrl
                   ?? null,
          avatar:          (it.social_profile?.display_name ?? it.display_name ?? "U").slice(0, 2).toUpperCase(),
          avatarColor:     "#2563eb",
          caption:         it.caption_text ?? "",
          imageUrl:        it.social_media_attachments?.[0]?.media_url || it.mediaUrl || it.media_url || null,
          authorProfileId: it.profile_id ?? it.social_profile?.profile_id,
          authorUserId:    it.social_profile?.user_id,
          verified:        it.social_profile?.is_verified ?? false,
          created_at:      it.created_at ?? null,
          likes:           it._count?.social_interactions ?? 0,
          comments:        it._count?.social_comments ?? 0,
          liked:           postIsLiked(it),
          saved:           it.bookmarks?.length > 0,
          isRecommended:   true,
          recReason:       it.rec_reason,
        };
      });
      setForYouItems(prev => offset ? [...prev, ...items] : items);
      setForYouCursor(res?.nextCursor ?? null);
    } catch (err) { console.error("For You error:", err); }
    finally { setForYouLoading(false); setForYouReady(true); }
  };

  // Load the set of accounts the current user already follows, so suggestions
  // can exclude them (otherwise a just-followed profile reappears on refresh).
  const loadFollowing = async () => {
    try {
      const me = getUser();
      const myProfId = me?.profile_id;
      if (!myProfId) return;
      const res   = await getFollowing(myProfId);
      const items = res?.data ?? res;
      if (!Array.isArray(items)) return;
      const keys = new Set();
      items.forEach(f => {
        if (f.user_id    != null) keys.add(String(f.user_id));
        if (f.profile_id != null) keys.add(String(f.profile_id));
        if (f.handle)             { keys.add(f.handle); keys.add(`@${f.handle}`); }
      });
      setFollowingKeys(keys);
    } catch { /* non-fatal — suggestions just won't be pre-filtered */ }
  };

  // Load server-ranked "who to follow" suggestions (public profiles you don't follow yet).
  const loadSuggestions = async () => {
    try {
      const res   = await getFollowSuggestions(12);
      const items = res?.data ?? res;
      if (!Array.isArray(items)) return;
      setServerSuggestions(items.map(pr => {
        const name = pr.display_name || pr.handle || "";
        return {
          handle:          pr.handle,
          user:            name,
          avatar:          (name || "?")[0].toUpperCase(),
          avatarUrl:       pr.profile_pic_url || null,
          avatarColor:     "#2563eb",
          authorUserId:    pr.user_id,
          authorProfileId: pr.profile_id,
          // #449: real mutual connections (people you follow who also follow them), from the
          // server. Absent/0 for most accounts — the strip renders no mutual line at all then.
          mutualCount:     pr.mutual_count ?? 0,
          mutuals:         Array.isArray(pr.mutuals) ? pr.mutuals : [],
        };
      }));
    } catch { /* non-fatal — falls back to feed-derived authors */ }
  };

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Show cached data instantly (zero flicker on re-visit)
    if (cache.current.posts.length)   setPosts(cache.current.posts);
    if (cache.current.reels.length)   setReels(cache.current.reels);
    if (cache.current.stories.length > 1) setStories(cache.current.stories);
  }, []);

  useEffect(() => {
    // Wait until the app has restored the session (refresh cookie → access token) before firing
    // these authenticated calls. React runs child mount effects BEFORE the App's bootAuth effect,
    // so on a hard load / new tab this batch would otherwise go out before the token exists, 401,
    // and the feed would render its empty "Welcome to Strug" state though the user is logged in.
    if (!authReady) return;
    Promise.allSettled([loadStories(), loadFeed(), loadReels(), loadFollowing(), loadSuggestions()]);
  }, [authReady]);  

  useEffect(() => { window.dispatchEvent(new CustomEvent("strug:view-change")); }, [tab]);

  // Lazily load "For You" the first time the tab is opened.
  useEffect(() => {
    if (tab === "forYou" && !forYouReady && !forYouLoading) loadForYou(0);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll for the "For You" feed.
  useEffect(() => {
    if (tab !== "forYou" || !forYouSentinel.current) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && forYouCursor != null && !forYouLoading) loadForYou(forYouCursor);
    }, { rootMargin: "600px" });
    obs.observe(forYouSentinel.current);
    return () => obs.disconnect();
  }, [tab, forYouCursor, forYouLoading, forYouReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush captured dwell/impressions periodically and when the tab is hidden/closed.
  useEffect(() => {
    const iv = setInterval(flushImpressions, 12000);
    const onVisibility = () => { if (document.hidden) flushImpressions(); };
    window.addEventListener("beforeunload", flushImpressions);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(iv);
      window.removeEventListener("beforeunload", flushImpressions);
      document.removeEventListener("visibilitychange", onVisibility);
      flushImpressions();
    };
  }, [flushImpressions]);

  // New-account check: zero follows alone does not mean "new" because an aged account
  // can be added through the multi-account switcher with no follows yet. Only recently
  // created accounts get forced through setup, and the counts API is profile-scoped.
  useEffect(() => {
    setOnboardingDismissed(hasSeenFeedOnboarding());
    setFollowsNobody(false);
    if (!authReady || !meProfileId) return;
    if (!isRecentlyCreatedAccount(getUser()) || hasSeenFeedOnboarding()) return;
    getFollowCounts(meProfileId)
      .then(res => {
        const c = (res?.data ?? res)?._count?.following ?? 0;
        setFollowsNobody(c === 0);
        // Anyone who already follows someone is an established user — record that they're
        // past onboarding so the welcome screen can never reappear (e.g. if they later
        // unfollow everyone). New users (follows nobody) keep seeing it until they finish.
        if (c > 0) { markFeedOnboardingSeen(); setOnboardingDismissed(true); }
      })
      .catch(() => {});
  }, [authReady, meUserId, meProfileId]);

  // Debounced universal search → profiles + hashtags from the discovery API.
  // Posts & videos are matched locally from what's already loaded (the API doesn't
  // return content rows). Drilling into a hashtag is handled separately (openTag).
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchResults({ profiles: [], tags: [] }); setSearchLoading(false); return; }
    setSearchLoading(true);
    let alive = true;
    const t = setTimeout(() => {
      searchContent(q)
        .then(res => { if (!alive) return; const d = res?.data ?? res ?? {}; setSearchResults({ profiles: d.profiles ?? [], tags: d.tags ?? [] }); })
        .catch(() => { if (alive) setSearchResults({ profiles: [], tags: [] }); })
        .finally(() => { if (alive) setSearchLoading(false); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [searchQuery]);

  // Reset hashtag drill-down whenever the query changes or the user leaves the search tab.
  useEffect(() => { setActiveTag(null); setTagPosts([]); }, [searchQuery, tab]);

  // ── Helpers: ownership ────────────────────────────────────────────────────

  function isPostOwner(post) {
    const u = getUser();
    if (!u) return false;
    const profileId = u.profile_id || u.id;
    const userId    = u.user_id ?? u.id;
    const handle    = u.handle ? `@${u.handle}` : null;
    if (post.authorProfileId && profileId) return String(post.authorProfileId) === String(profileId);
    if (post.authorUserId    && userId)    return String(post.authorUserId)    === String(userId);
    if (post.ownerProfileId  && profileId) return String(post.ownerProfileId)  === String(profileId);
    if (handle && post.handle)             return handle.toLowerCase() === post.handle.toLowerCase();
    return false;
  }

  // ── Helpers: post CRUD ────────────────────────────────────────────────────

  function handleSaveEditedPost(postId, newCaption) {
    setPosts(p => p.map(x => x.id === postId ? { ...x, caption: newCaption } : x));
  }

  async function handleConfirmDeletePost() {
    if (!deletePostTarget) return;
    const id = deletePostTarget;
    const snapshot = posts;
    setDeletingPost(true); setDeletePostTarget(null);
    setPosts(p => p.filter(x => x.id !== id));
    try {
      await deletePost(id);
    } catch (err) {
      console.error(err);
      setPosts(snapshot);
    } finally {
      setDeletingPost(false);
    }
  }

  // ── Helpers: interactions ─────────────────────────────────────────────────

  function toggleLike(id) {
    const apply = (updater) => {
      setPosts(p => p.map(x => matchesFeedPost(x, id) ? updater(x) : x));
      setForYouItems(p => Array.isArray(p) ? p.map(x => matchesFeedPost(x, id) ? updater(x) : x) : p);
      setLibraryPosts(p => p.map(x => matchesFeedPost(x, id) ? updater(x) : x));
      setTagPosts(p => p.map(x => matchesFeedPost(x, id) ? updater(x) : x));
      setReels(r => r.map(x => matchesFeedPost(x, id) ? updater(x) : x));
      setSelectedPost(prev => prev && matchesFeedPost(prev, id) ? updater(prev) : prev);
      if (cache.current?.posts?.length) {
        cache.current.posts = cache.current.posts.map(x => matchesFeedPost(x, id) ? updater(x) : x);
      }
    };
    apply(x => ({ ...x, liked: !x.liked, likes: Math.max(0, (x.likes ?? 0) + (x.liked ? -1 : 1)) }));
    toggleLikeAPI(id)
      .then(res => {
        const { liked, likes } = parseLikeToggle(res);
        if (liked == null && likes == null) return;
        apply(x => ({
          ...x,
          liked: liked ?? x.liked,
          likes: typeof likes === "number" ? likes : x.likes,
        }));
      })
      .catch(() => apply(x => ({ ...x, liked: !x.liked, likes: Math.max(0, (x.likes ?? 0) + (x.liked ? -1 : 1)) })));
  }

  // Instagram-style tagged profiles for a post: the author plus any @mentions in the
  // caption. Authors navigate by id; mentions navigate by handle (resolved on the profile page).
  function getTaggedProfiles(post) {
    const tagged = [];
    const authorId = post.authorUserId ?? post.authorProfileId;
    if (authorId) tagged.push({ key: `a-${authorId}`, label: post.handle, kind: "id", value: authorId });
    const seen = new Set([(post.handle || "").replace(/^@/, "").toLowerCase()]);
    for (const m of (post.caption || "").match(/@[a-zA-Z0-9_.]+/g) || []) {
      const handle = m.slice(1);
      const lc = handle.toLowerCase();
      if (seen.has(lc)) continue;
      seen.add(lc);
      tagged.push({ key: `m-${lc}`, label: `@${handle}`, kind: "handle", value: handle });
    }
    return tagged;
  }

  function navToTagged(t) {
    if (t.kind === "id") { window.__profileTargetId = t.value; }
    else { delete window.__profileTargetId; window.__pendingHandle = t.value; }
    window.__nav?.("profile");
  }

  // #444: open the uploader's profile from a video. Prefer the author id, but fall back to the
  // handle — the video-feed rows always carry one, and UserProfile already resolves a pending
  // handle to a profile. Without the fallback, older rows that don't send an author id would be
  // silently unclickable, which is the bug we're fixing.
  function openReelAuthor(reel) {
    if (!reel) return;
    const navId = reel.authorUserId ?? reel.authorProfileId ?? null;
    if (navId != null) { navToTagged({ kind: "id", value: navId }); return; }
    const handle = String(reel.handle ?? "").replace(/^@/, "").trim();
    if (handle) navToTagged({ kind: "handle", value: handle });
  }

  // Single tap → open the post; double tap → like it (Instagram).
  // The single-tap action is deferred briefly so a following second tap can cancel it.
  //
  // #456: a single tap used to reveal the tagged-profiles overlay and NOTHING ELSE — and it bailed
  // out early when the post had no tagged profiles, which is most posts. So clicking a post on
  // Social genuinely did nothing. The only thing that opened a post was a narrow strip of the author
  // row. Tapping the post now opens the isolated post view (media + comments + actions), which is
  // what the reporter asked for and what Instagram does. Tagged profiles are still reachable — the
  // little tag badge on the media is a real button now instead of a decoration.
  function handleMediaTap(post) {
    const now = Date.now();
    const last = mediaTapRef.current[post.id] || 0;
    if (now - last < 300) {
      mediaTapRef.current[post.id] = 0;
      if (singleTapTimerRef.current) { clearTimeout(singleTapTimerRef.current); singleTapTimerRef.current = null; }
      setTagsOverlayPostId(null);
      if (!post.liked) toggleLike(post.id);
      setHeartBurstPostId(post.id);
      setTimeout(() => setHeartBurstPostId(id => (id === post.id ? null : id)), 800);
    } else {
      mediaTapRef.current[post.id] = now;
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = setTimeout(() => {
        singleTapTimerRef.current = null;
        setSelectedPost(post);
      }, 320); // > double-tap window so a second tap always cancels this first
    }
  }

  // ── Search interactions ───────────────────────────────────────────────────

  function openSearchProfile(prof) {
    const navId = prof.user_id ?? prof.profile_id;
    if (!navId) return;
    delete window.__pendingHandle;
    window.__profileTargetId = navId;
    window.__nav?.("profile");
  }

  // A video search result reuses the post-detail viewer; map the reel so its
  // video URL is picked up by FeedPostDetailPage's media resolver.
  function openVideoResult(reel) {
    setSelectedPost({ ...reel, imageUrl: reel.videoUrl ?? reel.media_url ?? reel.imageUrl });
  }

  // Drill into a hashtag → fetch its posts from the discovery API.
  async function openTag(tagName) {
    const name = String(tagName || "").replace(/^#/, "");
    if (!name) return;
    setActiveTag(name);
    setTagLoading(true);
    try {
      const res  = await getPostsByTag(name);
      const list = Array.isArray(res) ? res : (res?.data ?? []);
      setTagPosts(list.map(p => ({
        id:              p.social_post_id ?? p.id,
        user:            p.social_profile?.display_name ?? i18n.t("common.defaultUser"),
        handle:          p.social_profile?.handle ? `@${p.social_profile.handle}` : "@user",
        avatarUrl:       p.social_profile?.profile_pic_url ?? null,
        avatar:          (p.social_profile?.display_name ?? "U").slice(0, 2).toUpperCase(),
        avatarColor:     "#2563eb",
        caption:         p.caption_text ?? "",
        imageUrl:        p.social_media_attachments?.[0]?.media_url || p.mediaUrl || p.media_url || null,
        authorProfileId: p.profile_id ?? p.social_profile?.profile_id,
        authorUserId:    p.social_profile?.user_id,
        verified:        p.social_profile?.is_verified ?? false,
        created_at:      p.created_at ?? null,
        likes:           p._count?.social_interactions ?? 0,
        comments:        p._count?.social_comments ?? 0,
        liked:           false,
        saved:           false,
      })));
    } catch { setTagPosts([]); }
    finally { setTagLoading(false); }
  }

  function toggleSave(id) {
    const apply = (saved) => {
      setPosts(p => p.map(x => (x.id === id || x.social_post_id === id) ? { ...x, saved } : x));
      setForYouItems(p => Array.isArray(p) ? p.map(x => (x.id === id || x.social_post_id === id) ? { ...x, saved } : x) : p);
      setReels(r => r.map(x => x.id === id ? { ...x, saved } : x));
    };
    setPosts(p => p.map(x => (x.id === id || x.social_post_id === id) ? { ...x, saved: !x.saved } : x));
    setForYouItems(p => Array.isArray(p) ? p.map(x => (x.id === id || x.social_post_id === id) ? { ...x, saved: !x.saved } : x) : p);
    toggleBookmarkAPI(id)
      .then(res => apply(!!res.saved))
      .catch(() => {
        setPosts(p => p.map(x => (x.id === id || x.social_post_id === id) ? { ...x, saved: !x.saved } : x));
        setForYouItems(p => Array.isArray(p) ? p.map(x => (x.id === id || x.social_post_id === id) ? { ...x, saved: !x.saved } : x) : p);
      });
  }

  function toggleReelSave(id) {
    setReels(r => r.map(x => x.id === id ? { ...x, saved: !x.saved } : x));
    toggleBookmarkAPI(id).catch(() => setReels(r => r.map(x => x.id === id ? { ...x, saved: !x.saved } : x)));
  }

  // ── Helpers: comments ─────────────────────────────────────────────────────

  async function fetchComments(postId) {
    if (!postId || Object.prototype.hasOwnProperty.call(postCommentsData, postId) || commentsLoading[postId]) return;
    setCommentsLoading(prev => ({ ...prev, [postId]: true }));
    try {
      const data = await getCommentsAPI(postId);
      setPostCommentsData(prev => ({ ...prev, [postId]: parseCommentListPayload(data) }));
    } catch (err) {
      console.error("Comments fetch error:", err);
      setPostCommentsData(prev => ({ ...prev, [postId]: prev[postId] ?? [] }));
    } finally {
      setCommentsLoading(prev => ({ ...prev, [postId]: false }));
    }
  }

  async function toggleExpand(postId) {
    setExpandedComments(prev => { const n = new Set(prev); n.has(postId) ? n.delete(postId) : n.add(postId); return n; });
    if (!expandedComments.has(postId)) await fetchComments(postId);
  }

  // Mobile: open the Instagram-style comments bottom sheet, fetching if needed.
  async function openCommentsSheet(postId) {
    setCommentsSheetPostId(postId);
    await fetchComments(postId);
  }

  // Desktop: open the Instagram-style zoom-in modal, fetching if needed.
  async function openCommentsModal(postId) {
    setCommentsModalPostId(postId);
    await fetchComments(postId);
  }

  async function handleAddComment(postId) {
    const text = commentInputs[postId]?.trim();
    if (!text) return;
    try {
      const data = await addCommentAPI(postId, { text });
      if (isCommentMutationOk(data)) {
        const created = data?.data ?? data;
        setPostCommentsData(prev => ({ ...prev, [postId]: [created, ...(prev[postId] || [])] }));
        setCommentInputs(prev => ({ ...prev, [postId]: "" }));
        // The card's comment count comes from the server's _count and was never touched
        // here, so commenting appeared to do nothing until a full refetch.
        bumpCommentCount(postId, +1);
      }
    } catch (err) { console.error(err); }
  }

  // Keep the count on the post/reel card in step with the comment list.
  function bumpCommentCount(postId, delta) {
    const apply = p => (p.id === postId ? { ...p, comments: Math.max(0, (p.comments ?? 0) + delta) } : p);
    setPosts(prev => prev.map(apply));
    setReels(prev => prev.map(apply));
  }

  async function handleSaveCommentEdit(postId, commentId) {
    if (!editText.trim()) return;
    try {
      const res = await updateCommentAPI(commentId, { text: editText });
      if (res.successful) {
        setPostCommentsData(prev => ({ ...prev, [postId]: (prev[postId] || []).map(c => c.comment_id === commentId ? { ...c, text: editText } : c) }));
        setEditingCommentId(null);
      }
    } catch (err) { console.error(err); }
  }

  async function confirmDeleteComment() {
    if (!deleteCommentTarget) return;
    const { postId, commentId } = deleteCommentTarget;
    try {
      const res = await deleteCommentAPI(commentId);
      if (res.successful) {
        setPostCommentsData(prev => ({ ...prev, [postId]: (prev[postId] || []).filter(c => c.comment_id !== commentId) }));
        bumpCommentCount(postId, -1);
      }
    } catch (err) { console.error(err); }
    setDeleteCommentTarget(null);
  }

  // ── Helpers: scroll / swipe / anim ───────────────────────────────────────

  const handleFeedScroll = e => {
    const top = e.currentTarget.scrollTop;
    if (isMobile) {
      const compact = top > 72;
      if (compact !== mobileCompactRef.current) {
        mobileCompactRef.current = compact;
        setMobileHeaderCompact(compact);
      }
      return;
    }
    // #366: don't collapse the header on scroll on mobile. Animating the header's
    // max-height 400px↔0 on every scroll-direction flip reflowed the whole feed
    // ("blinks each time you scroll") and the state write forced a full re-render
    // of the large FeedPage (the lag). Native scroll still works untouched.
    if (Math.abs(top - lastScrollRef.current) < 10) return;
    setIsNavVisible(top <= lastScrollRef.current || top <= 50);
    lastScrollRef.current = top;
  };

  const handleSwipeStart = e => {
    swipeStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      // Gestures that begin inside a horizontal scroller (e.g. the "Suggested
      // for you" cards or the story bar) must scroll that strip, not switch tabs.
      skip: !!e.target.closest?.("[data-noswipe]"),
    };
  };
  const handleSwipeEnd   = e => {
    if (swipeStartRef.current?.skip) return;
    // Search tab has its own vertical-scrolling results + search bar; tab-swiping
    // here causes accidental jumps to the videos tab, so disable it entirely.
    if (tab === "search") return;
    const dx = e.changedTouches[0].clientX - swipeStartRef.current.x;
    const dy = e.changedTouches[0].clientY - swipeStartRef.current.y;
    // Require a strongly horizontal gesture: dominant on the X axis and clearly
    // larger than any vertical movement, so diagonal scrolls don't switch tabs.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
    const idx = TAB_ORDER.indexOf(tab);
    if (dx < 0 && idx < TAB_ORDER.length - 1) setTab(TAB_ORDER[idx + 1]);
    if (dx > 0 && idx > 0)                    setTab(TAB_ORDER[idx - 1]);
  };

  const playAnim = (el, name, dur = 380) => {
    if (!el) return;
    el.style.animation = "none"; el.offsetHeight;
    el.style.animation = `${name} ${dur}ms cubic-bezier(0.34,1.56,0.64,1) both`;
    setTimeout(() => { el.style.animation = ""; }, dur);
  };

  // Hide the mobile bottom nav while the fullscreen feed video tab is open
  useEffect(() => {
    const immersive = isMobile && tab === "videos";
    window.dispatchEvent(new CustomEvent("strug:immersive-media", { detail: immersive }));
    return () => { if (immersive) window.dispatchEvent(new CustomEvent("strug:immersive-media", { detail: false })); };
  }, [isMobile, tab]);

  // ── Story bar click ────────────────────────────────────────────────────────

  const handleStoryClick = (story, index) => {
    if (index === 0) { setShowStoryComposer(true); return; }
    const target = story.stories?.[0]
      ? { ...story, ...story.stories[0], stories: story.stories }
      : story;
    setViewStory(target);
  };

  // Deep link: /post/:postId — fetch and open on mount.
  // Fetch a single post by id and open its detail view — shared by the cold-load deep link and
  // the in-app notification deep link (#472).
  const openFeedPostById = useCallback((id) => {
    if (id == null) return;
    getPost(id).then(data => {
      const p = data?.data ?? data;
      if (!p) return;
      const mapped = {
        id:              p.social_post_id ?? p.id,
        user:            p.social_profile?.display_name ?? i18n.t("common.defaultUser"),
        handle:          p.social_profile?.handle ? `@${p.social_profile.handle}` : "@user",
        avatarUrl:       p.social_profile?.profile_pic_url ?? null,
        avatar:          (p.social_profile?.display_name ?? "U").slice(0, 2).toUpperCase(),
        avatarColor:     "#2563eb",
        caption:         p.caption_text ?? "",
        imageUrl:        p.social_media_attachments?.[0]?.media_url ?? p.media_url ?? null,
        authorProfileId: p.profile_id ?? p.social_profile?.profile_id,
        authorUserId:    p.social_profile?.user_id,
        verified:        p.social_profile?.is_verified ?? false,
        created_at:      p.created_at ?? null,
        likes:           p._count?.social_interactions ?? 0,
        comments:        p._count?.social_comments ?? 0,
        liked:           !!(p.liked ?? (p.social_interactions?.length > 0)),
        saved:           !!(p.saved ?? (p.bookmarks?.length > 0)),
      };
      setPosts(prev => prev.some(x => x.id === mapped.id) ? prev : [mapped, ...prev]);
      setSelectedPost(mapped);
    }).catch(() => {});
  }, []);

  // initialPostId is a ref captured once at app load and reused on every FeedPage mount,
  // so without this guard, tapping "Social" (which remounts FeedPage) would re-open the
  // originally-linked post every time. Consume it once per app session via a module flag —
  // a URL check is unreliable because App.jsx normalizes /post/:id → /feed before mount.
  useEffect(() => {
    if (!initialPostId || deepLinkConsumed) return;
    deepLinkConsumed = true;
    openFeedPostById(initialPostId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // #472: a notification for one of your posts opens THAT post. App.jsx stashes the id in
  // window.__feedOpenPostId and fires strug:open-notification-target. Read it on mount (arrived
  // here from another page) AND on the event (already on Feed — no remount). Consume-once.
  useEffect(() => {
    const consume = () => {
      const id = window.__feedOpenPostId;
      if (id == null) return;
      delete window.__feedOpenPostId;
      openFeedPostById(id);
    };
    consume();
    window.addEventListener("strug:open-notification-target", consume);
    return () => window.removeEventListener("strug:open-notification-target", consume);
  }, [openFeedPostById]);

  // Sync URL with post detail: /post/:id when viewing, /feed when back
  useEffect(() => {
    if (selectedPost) {
      if (!window.location.pathname.startsWith(`/post/${selectedPost.id}`)) {
        window.history.pushState({ nav: "feed", postId: selectedPost.id }, "", `/post/${selectedPost.id}`);
      }
    } else if (/^\/post\//.test(window.location.pathname)) {
      window.history.pushState({ nav: "feed" }, "", "/feed");
    }
  }, [selectedPost]);

  // Clear post detail when user navigates back via browser history
  useEffect(() => {
    const onPop = () => {
      if (!/^\/post\//.test(window.location.pathname)) setSelectedPost(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // ── Early return: post detail ──────────────────────────────────────────────

  if (selectedPost) {
    return <FeedPostDetailPage post={posts.find(p => p.id === selectedPost.id) || selectedPost} onBack={() => setSelectedPost(null)} onToggleLike={toggleLike} onToggleSave={toggleSave} onShare={setShareModal} />;
  }

  // ── renderPost ─────────────────────────────────────────────────────────────

  function renderPost(post, i) {
    const sz       = isMobile ? 22 : 22;
    const imageSrc = post.imageUrl || post.mediaUrl || post.media_url || post.social_media_attachments?.[0]?.media_url || null;
    // Sponsored shadow-posts carry synthetic ids — disable engagement/navigation;
    // only the CTA link is actionable.
    const adMode   = !!post.is_ad;

    const navToProfile = e => {
      e.stopPropagation();
      if (adMode) return;
      const navId = post.authorUserId ?? post.authorProfileId;
      if (navId) { window.__profileTargetId = navId; window.__nav?.("profile"); }
    };

    return (
      <div key={post.id} style={{ borderBottom: "1px solid var(--color-border)", marginBottom: isMobile ? 4 : 8, paddingBottom: isMobile ? 2 : 4, animation: `fadeUp 0.35s ease ${i * 50}ms both` }}>

        {adMode && <AdImpression campaignId={post.campaign_id} />}

        {/* Recommendation label — shown for blended/For-You suggestions */}
        {post.isRecommended && (
          <div className="text-text-secondary" style={{ display: "flex", alignItems: "center", gap: 6, padding: isMobile ? "6px 0 0" : "8px 0 0", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600 }}>
            <span style={{ color: "#4f5bf5" }}>✦</span>
            <span>{post.recReason || i18n.t("feed.suggestedForYou")}</span>
          </div>
        )}

        {/* Author row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "8px 0" : "12px 0 10px" }}>
          <div onClick={navToProfile} {...((post.authorUserId ?? post.authorProfileId) ? clickableProps(navToProfile) : {})} aria-label={(post.authorUserId ?? post.authorProfileId) ? i18n.t("feed.viewProfile", { defaultValue: "View profile" }) : undefined} style={{ cursor: (post.authorUserId ?? post.authorProfileId) ? "pointer" : "default", flexShrink: 0 }}>
            <Avatar initials={post.avatar} color={post.avatarColor} size={isMobile ? 30 : 36} border url={post.avatarUrl} />
          </div>
          <div style={{ flex: 1, cursor: adMode ? "default" : "pointer" }} onClick={() => { if (!adMode) setSelectedPost(post); }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span onClick={navToProfile} {...((!adMode && (post.authorUserId ?? post.authorProfileId)) ? clickableProps(navToProfile) : {})} className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 12 : 13, cursor: (!adMode && (post.authorUserId ?? post.authorProfileId)) ? "pointer" : "default" }}>{adMode ? post.user : post.handle}</span>
              {post.verified && <IconVerified size={16} />}
              {adMode && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 5, padding: "1px 7px", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{i18n.t("feed.sponsored")}</span>}
            </div>
          </div>
          {!adMode && <button onClick={e => { e.stopPropagation(); setPostOptionsMenu(post); }} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, padding: "8px 11px", borderRadius: 8, lineHeight: 1, letterSpacing: 2 }} onMouseEnter={e => { e.currentTarget.style.background = "var(--color-surface-raised)"; e.currentTarget.style.color = "var(--color-text-primary)"; }} onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}>···</button>}
        </div>

        {/* Media — single tap shows tagged profiles, double tap likes (Instagram-style) */}
        {imageSrc && (() => {
          const isVid       = imageSrc.match(/\.(mp4|webm|mov|m4v)(\?|$)/i);
          const tagged      = getTaggedProfiles(post);
          const showingTags = tagsOverlayPostId === post.id;
          return (
            <FeedMediaTile
              imageSrc={imageSrc}
              isVid={!!isVid}
              aspectRatio={post.aspect === "portrait" ? "4/5" : post.aspect === "landscape" ? "16/9" : "1/1"}
              maxHeight={isMobile ? 480 : 620}
              onClick={() => {
                if (adMode) {
                  // The sponsored image is itself a click-through to the advertiser.
                  if (isSafeHttpUrl(post.target_url)) {
                    if (post.campaign_id) trackAdEvent(post.campaign_id, "click").catch(() => {});
                    window.open(post.target_url, "_blank", "noopener,noreferrer");
                  }
                  return;
                }
                if (!isVid) handleMediaTap(post);
              }}
            >
              {/* Double-tap like burst */}
              {heartBurstPostId === post.id && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                  <svg width={96} height={96} viewBox="0 0 24 24" fill="#fff" style={{ animation: "socialLikePop 0.6s ease both", filter: "drop-shadow(0 2px 16px rgba(0,0,0,0.45))" }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </div>
              )}

              {/* Single-tap tag indicator (bottom-left chip) */}
              {/* #456: tapping the media opens the post now, so this badge has to be the way in to
                  the tagged-profiles overlay. It used to be pointerEvents:"none" decoration. */}
              {!showingTags && tagged.length > 0 && !isVid && (
                <div
                  onClick={e => { e.stopPropagation(); setTagsOverlayPostId(post.id); }}
                  title={i18n.t("feed.tagged")}
                  style={{ position: "absolute", left: 12, bottom: 12, width: 26, height: 26, borderRadius: "50%", background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", animation: "fadeUp 0.3s ease both" }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                </div>
              )}

              {/* Tagged-profiles overlay (revealed on single tap) */}
              {showingTags && (
                <div onClick={e => { e.stopPropagation(); setTagsOverlayPostId(null); }} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 14, gap: 8, animation: "fadeUp 0.2s ease both" }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: 0.6 }}>{i18n.t("feed.tagged")}</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {tagged.map(t => (
                      <button key={t.key} onClick={e => { e.stopPropagation(); navToTagged(t); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 20, padding: "6px 12px", cursor: "pointer", maxWidth: "100%" }}>
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </FeedMediaTile>
          );
        })()}

        {/* Actions + caption */}
        <div style={{ padding: isMobile ? "6px 0" : "10px 0" }}>
          {adMode ? (
            isSafeHttpUrl(post.target_url) && (
              <a href={post.target_url} target="_blank" rel="noopener noreferrer nofollow sponsored"
                onClick={() => { if (post.campaign_id) trackAdEvent(post.campaign_id, "click").catch(() => {}); }}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 6, background: "rgba(37,99,235,0.14)", border: "1px solid rgba(37,99,235,0.45)", borderRadius: 10, padding: "9px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#60a5fa", textDecoration: "none" }}>
                {adCtaLabel(post.cta_text)}
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
              </a>
            )
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 2 : 8, marginBottom: 6, marginLeft: -8 }}>
            <button onClick={e => { e.stopPropagation(); toggleLike(post.id); playAnim(e.currentTarget.querySelector("svg"), post.liked ? "socialTap" : "socialLikePop"); }} style={{ background: "none", border: "none", padding: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: post.liked ? "#ef4444" : "var(--color-text-secondary)" }}>
              <IconHeart size={sz} filled={post.liked} />
            </button>
            <button onClick={e => { isMobile ? openCommentsSheet(post.id) : openCommentsModal(post.id); playAnim(e.currentTarget.querySelector("svg"), "socialTap", 280); }} style={{ background: "none", border: "none", padding: 8, cursor: "pointer", color: (isMobile ? commentsSheetPostId === post.id : commentsModalPostId === post.id) ? "#2563eb" : "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 5 }}>
              <IconComment size={sz} />
              {post.comments > 0 && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>{post.comments}</span>}
            </button>
            <button onClick={e => { setShareModal(post); playAnim(e.currentTarget.querySelector("svg"), "socialTap", 280); }} className="text-text-secondary" style={{ background: "none", border: "none", padding: 8, cursor: "pointer" }}>
              <IconShare size={sz} />
            </button>
            <button onClick={e => { e.stopPropagation(); toggleSave(post.id); playAnim(e.currentTarget.querySelector("svg"), post.saved ? "socialTap" : "socialSavePop"); }} style={{ background: "none", border: "none", padding: 8, cursor: "pointer", marginLeft: "auto", color: post.saved ? "#2563eb" : "var(--color-text-secondary)" }}>
              <IconBookmark size={sz} filled={post.saved} />
            </button>
            </div>
          )}

          {!adMode && <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 12 : 13, marginBottom: 3 }}>{i18n.t("feed.likesCount", { count: (post.likes ?? 0).toLocaleString() })}</p>}
          {post.caption && (
            <ExpandableText
              text={post.caption}
              prefix={<span style={{ fontWeight: 700, marginRight: 6, color: "var(--color-text-primary)" }}>{adMode ? post.user : post.handle}</span>}
              lines={3}
              onOpen={adMode ? undefined : () => setSelectedPost(post)}
              style={{ fontSize: isMobile ? 12 : 13 }}
            />
          )}

          {!adMode && post.comments > 0 && (
            <p onClick={() => isMobile ? openCommentsSheet(post.id) : openCommentsModal(post.id)} className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 4, cursor: "pointer" }}>
              {i18n.t("feed.viewAllComments", { count: post.comments })}
            </p>
          )}

          {/* Expanded comments */}
          {expandedComments.has(post.id) && (
            <div style={{ marginTop: 10, borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
                <input type="text" placeholder={i18n.t("pinboard.addComment")} maxLength={2000} value={commentInputs[post.id] || ""} onChange={e => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))} onKeyDown={e => e.key === "Enter" && handleAddComment(post.id)} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, borderRadius: 6, padding: "6px 10px", fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
                <button onClick={() => handleAddComment(post.id)} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{i18n.t("common.post")}</button>
              </div>

              {(() => {
                const currentUser          = getUser();
                const currentUserProfileId = currentUser?.profile_id || currentUser?.id;
                const allComments          = postCommentsData[post.id] || [];
                const commentsPending      = expandedComments.has(post.id) && !Object.prototype.hasOwnProperty.call(postCommentsData, post.id);
                const showAll              = showAllCommentsPostId === post.id;
                const visible              = showAll ? allComments : allComments.slice(0, 5);

                return (
                  <>
                    {commentsPending && Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                        <Skel w={26} h={26} r={13} />
                        <div style={{ flex: 1 }}><Skel w="70%" h={11} r={5} style={{ marginBottom: 5 }} /><Skel w="40%" h={10} r={5} /></div>
                      </div>
                    ))}
                    {visible.map(c => (
                      <div key={c.comment_id} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                        <div className="bg-surface-raised text-text-primary" style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 9, flexShrink: 0 }}>
                          {commentAuthorName(c).slice(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {editingCommentId === c.comment_id ? (
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <input type="text" value={editText} onChange={e => setEditText(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSaveCommentEdit(post.id, c.comment_id)} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, borderRadius: 4, padding: "3px 8px", fontSize: 12, outline: "none" }} />
                              <button onClick={() => handleSaveCommentEdit(post.id, c.comment_id)} style={{ background: "none", border: "none", color: "#22c55e", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{i18n.t("common.save")}</button>
                              <button onClick={() => setEditingCommentId(null)} className="text-text-secondary" style={{ background: "none", border: "none", fontSize: 11, cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
                            </div>
                          ) : (
                            <ExpandableText
                              text={c.text}
                              prefix={<span className="text-text-primary" style={{ fontWeight: 700, marginRight: 6 }}>{commentAuthorName(c)}</span>}
                              lines={3}
                              style={{ fontSize: 12, lineHeight: 1.45 }}
                            />
                          )}
                        </div>
                        {c.profile_id === currentUserProfileId && editingCommentId !== c.comment_id && (
                          <div style={{ display: "flex", gap: 10, marginLeft: 4 }}>
                            <button onClick={() => { setEditingCommentId(c.comment_id); setEditText(c.text); }} className="text-text-muted" style={{ background: "none", border: "none", fontSize: 11, cursor: "pointer" }}>{i18n.t("common.edit")}</button>
                            <button onClick={() => setDeleteCommentTarget({ postId: post.id, commentId: c.comment_id })} style={{ background: "none", border: "none", color: "#ef444499", fontSize: 11, cursor: "pointer" }}>{i18n.t("common.delete")}</button>
                          </div>
                        )}
                      </div>
                    ))}
                    {allComments.length > 5 && (
                      <button onClick={() => setShowAllCommentsPostId(showAllCommentsPostId === post.id ? null : post.id)} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 12, cursor: "pointer", padding: 0, marginTop: 4 }}>
                        {showAll ? i18n.t("common.showLess") : i18n.t("common.more", { count: allComments.length - 5 })}
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── renderTabContent ───────────────────────────────────────────────────────

  function renderTabContent() {
    // Keep the skeleton until the page-load tick AND the first feed fetch land, so the
    // empty "No posts" state never flashes while /home is still loading. Search is
    // independent of the feed, so it isn't gated on feedReady.
    if (!feedReady && tab !== "search" && tab !== "forYou") {
      return Array.from({ length: 4 }).map((_, i) => (
        <SkeletonFeedPost key={i} mediaH={isMobile ? (i % 2 === 0 ? 220 : 160) : (i % 2 === 0 ? 320 : 240)} />
      ));
    }

    if (tab === "forYou") {
      // Personalized recommendations — posts + videos from creators you don't
      // follow, learned from your engagement. Each card reports dwell time back
      // to the engine via ImpressionCard so the feed keeps adapting.
      if (!forYouReady && forYouItems.length === 0) {
        return Array.from({ length: 4 }).map((_, i) => (
          <SkeletonFeedPost key={i} mediaH={isMobile ? 220 : 320} />
        ));
      }
      if (forYouItems.length === 0) {
        return <EmptyState label={i18n.t("feed.emptyForYou")} />;
      }
      return (
        <>
          {forYouItems.map((item, i) => (
            <ImpressionCard
              key={`fy_${item._kind}_${item.id}_${i}`}
              contentType={item._kind === "video" ? "video" : "post"}
              contentId={item.id}
              source="foryou"
              onVisible={recordVisible}
              onHidden={recordHidden}
            >
              {item._kind === "video"
                ? <InstagramVideoCard reel={item} index={i} isMobile={isMobile} reelHeartIdx={reelHeartIdx} isMuted={videosMuted} onMuteToggle={() => setVideosMuted(v => !v)} onToggleLike={() => toggleLike(item.id)} onToggleSave={toggleReelSave} onOpenProfile={openReelAuthor} onShare={setShareModal} />
                : renderPost(item, i)}
            </ImpressionCard>
          ))}

          <div ref={forYouSentinel} style={{ height: 1 }} />

          {forYouLoading && forYouItems.length > 0 && (
            <div style={{ padding: "20px 0 40px", display: "flex", flexDirection: "column", gap: 16 }}>
              {[1, 2].map(i => <SkeletonFeedPost key={i} mediaH={220} />)}
            </div>
          )}

          {forYouCursor == null && forYouItems.length > 0 && !forYouLoading && (
            <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, textAlign: "center", padding: "24px 0 48px" }}>
              {i18n.t("feed.forYouEnd")}
            </p>
          )}
        </>
      );
    }

    if (tab === "photos") {
      // Build "Suggested for you" from unique authors in the feed, excluding the
      // current user (you can't follow / shouldn't be suggested yourself — and
      // your own profile has no "Back" affordance).
      const me        = getUser();
      const myUserId  = me?.user_id ?? me?.id;
      const myProfId  = me?.profile_id ?? me?.id;
      const isSelf    = p => (p.authorUserId != null && String(p.authorUserId) === String(myUserId))
                          || (p.authorProfileId != null && String(p.authorProfileId) === String(myProfId));
      // Already following? Match on any identifier the backend returned.
      const isFollowed = p => followingKeys.has(String(p.authorUserId))
                           || followingKeys.has(String(p.authorProfileId))
                           || (p.handle && followingKeys.has(p.handle));
      const uniqueAuthors = posts
        .filter((p, i, a) => a.findIndex(x => x.handle === p.handle) === i)
        .filter(p => !isSelf(p))
        .filter(p => !isFollowed(p));
      // Prefer server-ranked "who to follow" (keeps producing new people once you've
      // followed everyone in your own feed); fall back to feed-derived authors. (bug #67)
      const suggestionSource = serverSuggestions.length > 0 ? serverSuggestions : uniqueAuthors;
      const suggestedUsers = suggestionSource
        .filter(p => !isSelf(p))
        .filter(p => !isFollowed(p))
        .filter(p => !dismissedSuggestions.has(p.handle))
        .slice(0, 8);

      const CARD_W   = isMobile ? 188 : 220;
      const CARD_PAD = 16;
      const AVATAR   = CARD_W - CARD_PAD * 2;

      const suggestedStrip = suggestedUsers.length > 0 ? (
        <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 20, margin: 0 }}>{i18n.t("feed.suggestedForYou")}</p>
            <button onClick={() => setTab("search")} style={{ background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#4f5bf5", cursor: "pointer", padding: "6px 8px", margin: "0 -8px" }}>{i18n.t("common.seeAll")}</button>
          </div>
          <div data-noswipe style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {suggestedUsers.map((p, i) => {
              const isFollowing = followedSuggestions.has(p.handle);
              // #449: this line used to be fabricated — mutualCount was (i % 3) + 1 and the avatar
              // was an unrelated author lifted from the feed, so an account with no connections at
              // all was still told "2 mutuals". Both now come from the server, and when there are
              // no real mutuals (the common case) the line is simply not rendered.
              const mutualCount = p.mutualCount ?? 0;
              const mutual      = p.mutuals?.[0] ?? null;
              const navId       = p.authorUserId ?? p.authorProfileId;
              const openProfile = () => { if (navId) { window.__profileTargetId = navId; window.__nav?.("profile"); } };
              return (
                <div key={p.handle ?? i} onClick={openProfile} className="bg-surface-raised" style={{ position: "relative", flexShrink: 0, width: CARD_W, borderRadius: 20, padding: CARD_PAD, display: "flex", flexDirection: "column", alignItems: "center", cursor: navId ? "pointer" : "default" }}>
                  <button
                    onClick={e => { e.stopPropagation(); setDismissedSuggestions(prev => new Set(prev).add(p.handle)); }}
                    aria-label={i18n.t("feed.dismissSuggestion")}
                    className="text-text-primary" style={{ position: "absolute", top: 10, right: 10, background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0, zIndex: 2 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                  <div style={{ width: AVATAR, height: AVATAR, borderRadius: "50%", overflow: "hidden", marginBottom: 14, background: p.avatarColor || "#2563eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Avatar url={p.avatarUrl} initials={p.avatar} color={p.avatarColor} size={AVATAR} alt={p.user} />
                  </div>
                  <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 18, margin: 0, textAlign: "center", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.user}</p>
                  {mutualCount > 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, marginBottom: 16 }}>
                      <div style={{ width: 26, height: 26, borderRadius: "50%", overflow: "hidden", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Avatar url={mutual?.profile_pic_url} initials={(mutual?.display_name || mutual?.handle || "?")[0].toUpperCase()} color="#2563eb" size={26} />
                      </div>
                      <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>{i18n.t("feed.mutualCount", { count: mutualCount })}</span>
                    </div>
                  ) : (
                    // Keep the card height stable whether or not a suggestion has mutuals.
                    <div style={{ height: 8, marginBottom: 16 }} />
                  )}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      if (p.authorUserId == null) return;
                      const was = followedSuggestions.has(p.handle);
                      setFollowedSuggestions(prev => { const n = new Set(prev); n.has(p.handle) ? n.delete(p.handle) : n.add(p.handle); return n; });
                      toggleFollowByUserId(p.authorUserId).catch(() => {
                        setFollowedSuggestions(prev => {
                          const n = new Set(prev);
                          if (was) n.add(p.handle); else n.delete(p.handle);
                          return n;
                        });
                      });
                    }}
                    // isFollowing's idle bg is now themed, so its text must follow the theme too
                    // (fixed-white-on-themed-bg trap) — the "Follow" state keeps its accent bg + white text.
                    style={{ width: "100%", background: isFollowing ? "var(--color-surface)" : "#4f5bf5", border: "none", borderRadius: 12, padding: "13px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16, color: isFollowing ? "var(--color-text-primary)" : "#fff", cursor: "pointer", transition: "background 0.15s" }}>
                    {isFollowing ? i18n.t("common.following") : i18n.t("common.follow")}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null;

      // Brand-new account only. Aged accounts can legitimately have zero/empty feed
      // state, especially when added through the multi-account switcher, so don't
      // force them through setup again just because the feed has no rows yet.
      if (followsNobody && !onboardingDismissed) {
        return <FeedOnboarding onDone={async () => { markFeedOnboardingSeen(); setOnboardingDismissed(true); setFollowsNobody(false); await loadFeed(); }} />;
      }

      // Inject strip after 2nd post
      const photoPosts = posts.length === 0
        ? [<EmptyState key="e" label={i18n.t("feed.emptyFollowing")} />]
        : posts.map((p, i) => (
            <ImpressionCard key={p.id} contentType="post" contentId={p.id} source="home" onVisible={recordVisible} onHidden={recordHidden}>
              {renderPost(p, i)}
            </ImpressionCard>
          ));
      const withSuggested = suggestedStrip && photoPosts.length > 2
        ? [...photoPosts.slice(0, 2), <div key="suggested">{suggestedStrip}</div>, ...photoPosts.slice(2)]
        : photoPosts;

      return (
      <>
        {withSuggested}

        {/* Invisible sentinel — triggers next page when scrolled into view */}
        <div ref={sentinelRef} style={{ height: 1 }} />

        {/* Loading indicator */}
        {loadingMore && (
          <div style={{ padding: "20px 0 40px", display: "flex", flexDirection: "column", gap: 16 }}>
            {[1, 2].map(i => <SkeletonFeedPost key={i} mediaH={220} />)}
          </div>
        )}

        {/* End of feed message */}
        {!nextCursor && posts.length > 0 && !loadingMore && (
          <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, textAlign: "center", padding: "24px 0 48px" }}>
            {i18n.t("feed.caughtUp")}
          </p>
        )}
      </>
      );
    }

    if (tab === "videos" && !isMobile) return <DesktopReelList reels={reels} reelHeartIdx={reelHeartIdx} videosMuted={videosMuted} setVideosMuted={setVideosMuted} toggleReelSave={toggleReelSave} onOpenProfile={openReelAuthor} onShare={setShareModal} onToggleLike={toggleLike} />;

    if (tab === "search") {
      const q          = searchQuery.trim().toLowerCase();
      const hasQuery   = q.length > 0;
      const matchText  = (...vals) => vals.some(v => (v || "").toLowerCase().includes(q));
      const postHits   = hasQuery ? posts.filter(p => matchText(p.caption, p.handle, p.user)) : [];
      const videoHits  = hasQuery ? reels.filter(r => matchText(r.caption, r.handle, r.user)) : [];
      const profiles   = searchResults.profiles ?? [];
      const tags       = searchResults.tags ?? [];
      const totalHits  = profiles.length + tags.length + postHits.length + videoHits.length;

      const muted    = "var(--color-text-muted)";
      const emptyMsg = txt => <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: muted, textAlign: "center", marginTop: 40 }}>{txt}</p>;
      const sectionHead = (label, onSeeAll) => (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "8px 0 10px" }}>
          <span className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</span>
          {onSeeAll && <button onClick={onSeeAll} style={{ background: "none", border: "none", color: "#4f5bf5", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 }}>{i18n.t("common.seeAll")}</button>}
        </div>
      );

      const ProfileRow = prof => (
        <button key={prof.profile_id ?? prof.user_id ?? prof.handle} onClick={() => openSearchProfile(prof)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", background: "none", border: "none", padding: "8px 4px", cursor: "pointer", textAlign: "left" }}>
          <div style={{ width: 46, height: 46, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Avatar url={prof.profile_pic_url} initials={prof.display_name ?? prof.handle ?? "U"} color="#2563eb" size={46} style={{ fontSize: 16 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>@{prof.handle}</span>
              {prof.is_verified && <IconVerified size={14} />}
            </div>
            <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{prof.display_name}</span>
          </div>
        </button>
      );

      const TagRow = t => (
        <button key={t.tag_id ?? t.name} onClick={() => openTag(t.name)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", background: "none", border: "none", padding: "8px 4px", cursor: "pointer", textAlign: "left" }}>
          <div style={{ width: 46, height: 46, borderRadius: "50%", flexShrink: 0, background: "rgba(79,91,245,0.15)", border: "1px solid rgba(79,91,245,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, color: "#7c87ff" }}>#</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>#{t.name}</span>
            <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{(t.post_count ?? 0).toLocaleString()} posts</span>
          </div>
        </button>
      );

      // Video result thumb: media fills it edge-to-edge, and the caption/play-badge overlays
      // composited on top need a dark backdrop — stays dark regardless of theme (rule 3), same
      // as the other media-grid tiles in this file.
      const videoThumb = (r, idx) => {
        const src = r.videoUrl || r.media_url || r.imageUrl || null;
        return (
          <div key={r.id ?? idx} onClick={() => openVideoResult(r)} style={{ position: "relative", paddingBottom: "133%", cursor: "pointer", overflow: "hidden", background: "#0d1421", borderRadius: 4 }}>
            {src
              ? <video src={src} muted playsInline preload="metadata" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              : <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg,${r.avatarColor ?? "#2563eb"}28,#0d1421)` }} />}
            <div style={{ position: "absolute", top: 6, right: 6, pointerEvents: "none" }}><svg width={14} height={14} viewBox="0 0 24 24" fill="#fff" opacity={0.95}><polygon points="5,3 19,12 5,21"/></svg></div>
            <div style={{ position: "absolute", left: 6, right: 6, bottom: 6, pointerEvents: "none" }}><span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.8)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{r.handle}</span></div>
          </div>
        );
      };
      const videoGrid = list => <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3 }}>{list.map(videoThumb)}</div>;

      const CATS = [
        { id: "top",    label: i18n.t("feed.searchTop") },
        { id: "people", label: i18n.t("feed.searchPeople") },
        { id: "videos", label: i18n.t("videos.title") },
        { id: "posts",  label: i18n.t("feed.searchPosts") },
        { id: "tags",   label: i18n.t("feed.searchTags") },
      ];

      return (
        <div style={{ paddingBottom: 24 }}>
          {/* Search bar */}
          <div className="bg-surface-raised border border-border" style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
            <IconSearch />
            <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: isMobile ? 16 : 14, fontFamily: "'DM Sans', sans-serif" }} />
            {searchLoading && <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--color-border)", borderTopColor: "#4f5bf5", animation: "spin 0.7s linear infinite" }} />}
            {searchQuery && <button onClick={() => setSearchQuery("")} className="text-text-muted" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 0 }}>✕</button>}
          </div>

          {!hasQuery ? emptyMsg(i18n.t("feed.searchHint")) : (
            <>
              {/* Category filter pills — active pill keeps its accent bg + white text; the idle
                  pill's bg is themed, so its text must follow the theme too (fixed-white-on-
                  themed-bg trap). */}
              <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", marginBottom: 16, paddingBottom: 2 }}>
                {CATS.map(c => (
                  <button key={c.id} onClick={() => { setSearchCat(c.id); setActiveTag(null); }} style={{ padding: "7px 16px", borderRadius: 20, background: searchCat === c.id ? "#2563eb" : "var(--color-surface-raised)", border: searchCat === c.id ? "none" : "1px solid var(--color-border)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: searchCat === c.id ? "#fff" : "var(--color-text-secondary)", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>{c.label}</button>
                ))}
              </div>

              {/* Hashtag drill-down — overrides the category content */}
              {activeTag ? (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <button onClick={() => setActiveTag(null)} className="text-text-primary" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}><IconBack /></button>
                    <span className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22 }}>#{activeTag}</span>
                  </div>
                  {tagLoading ? Array.from({ length: 3 }).map((_, i) => <SkeletonFeedPost key={i} mediaH={200} />) : tagPosts.length === 0 ? emptyMsg(i18n.t("feed.tagNoPosts", { tag: activeTag })) : tagPosts.map(renderPost)}
                </div>
              ) : (
                <>
                  {/* TOP — blended preview of every category */}
                  {searchCat === "top" && (
                    totalHits === 0 ? (searchLoading ? (
                      <div>
                        {Array.from({ length: 4 }).map((_, i) => <SkeletonSearchRow key={i} />)}
                        <SkeletonFeedPost mediaH={180} />
                      </div>
                    ) : emptyMsg(i18n.t("feed.searchNoResults", { query: searchQuery }))) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {profiles.length > 0 && (<div>{sectionHead(i18n.t("feed.searchSectionPeople"), profiles.length > 3 ? () => setSearchCat("people") : null)}{profiles.slice(0, 3).map(ProfileRow)}</div>)}
                        {tags.length > 0 && (<div>{sectionHead(i18n.t("feed.searchSectionHashtags"), tags.length > 3 ? () => setSearchCat("tags") : null)}{tags.slice(0, 3).map(TagRow)}</div>)}
                        {videoHits.length > 0 && (<div>{sectionHead(i18n.t("feed.searchSectionVideos"), videoHits.length > 6 ? () => setSearchCat("videos") : null)}{videoGrid(videoHits.slice(0, 6))}</div>)}
                        {postHits.length > 0 && (<div>{sectionHead(i18n.t("feed.searchSectionPosts"), null)}{postHits.map(renderPost)}</div>)}
                      </div>
                    )
                  )}

                  {searchCat === "people" && (profiles.length === 0 ? (searchLoading ? Array.from({ length: 6 }).map((_, i) => <SkeletonSearchRow key={i} />) : emptyMsg(i18n.t("feed.searchNoPeople"))) : <div>{profiles.map(ProfileRow)}</div>)}

                  {searchCat === "videos" && (videoHits.length === 0 ? emptyMsg(i18n.t("feed.searchNoVideos")) : videoGrid(videoHits))}

                  {searchCat === "posts" && (postHits.length === 0 ? (searchLoading ? Array.from({ length: 3 }).map((_, i) => <SkeletonFeedPost key={i} mediaH={180} />) : emptyMsg(i18n.t("feed.searchNoPosts"))) : postHits.map(renderPost))}

                  {searchCat === "tags" && (tags.length === 0 ? (searchLoading ? Array.from({ length: 5 }).map((_, i) => <SkeletonSearchRow key={i} />) : emptyMsg(i18n.t("feed.searchNoHashtags"))) : <div>{tags.map(TagRow)}</div>)}
                </>
              )}
            </>
          )}
        </div>
      );
    }

    if (tab === "saved" || tab === "liked") {
      const isSaved = tab === "saved";
      const allItems = libraryPosts.length
        ? libraryPosts
        : [
            ...posts.filter(p => isSaved ? p.saved : p.liked).map(p => ({ ...p, _kind: "post" })),
            ...reels.filter(r => isSaved ? r.saved : r.liked).map(r => ({ ...r, _kind: "video" })),
          ];
      const visibleItems = allItems.filter(p =>
        gridFilter === "post"  ? p._kind === "post" :
        gridFilter === "video" ? p._kind === "video" :
        true
      );
      return (
        <div style={{ paddingBottom: 24 }}>
          <div style={{ padding: "20px 0 14px", textAlign: "center" }}>
            <h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>{isSaved ? i18n.t("social.saved") : i18n.t("feed.liked")}</h2>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", paddingBottom: 16 }}>
            {[
              { id: "all", label: i18n.t("feed.filterAll") },
              { id: "post", label: i18n.t("feed.filterPost") },
              { id: "video", label: i18n.t("feed.filterVideo") },
            ].map(f => (
              <button key={f.id} onClick={() => setGridFilter(f.id)} className={gridFilter === f.id ? "text-text-primary" : "text-text-secondary"} style={{ padding: "6px 20px", borderRadius: 20, border: `1.5px solid ${gridFilter === f.id ? "var(--color-text-primary)" : "var(--color-border)"}`, background: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
                {f.label}
              </button>
            ))}
          </div>
          {libraryLoading ? (
            <SkeletonMediaGrid count={9} cols={3} />
          ) : visibleItems.length === 0 ? (
            <div className="text-text-muted" style={{ textAlign: "center", padding: "60px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
              {i18n.t(
                isSaved
                  ? (gridFilter === "video" ? "feed.emptySavedVideos" : gridFilter === "post" ? "feed.emptySavedPosts" : "feed.emptySavedItems")
                  : (gridFilter === "video" ? "feed.emptyLikedVideos" : gridFilter === "post" ? "feed.emptyLikedPosts" : "feed.emptyLikedItems")
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
              {visibleItems.map((p, idx) => {
                const isVid = p._kind === "video" || !!(p.videoUrl || p.media_type === "video");
                const src   = (isVid ? p.videoUrl : p.imageUrl) || p.imageUrl || p.mediaUrl || p.media_url || p.videoUrl || null;
                // Videos store their URL in videoUrl; map it into imageUrl so the detail
                // viewer (which reads imageUrl/media_url) can play it.
                const openItem = () => setSelectedPost(isVid ? { ...p, imageUrl: p.videoUrl ?? p.media_url ?? src } : p);
                return (
                  <div key={p.id ?? idx} onClick={openItem} {...clickableProps(openItem)} aria-label={p.caption || i18n.t("feed.viewPost", { defaultValue: "View post" })} style={{ position: "relative", paddingBottom: "125%", cursor: "pointer", overflow: "hidden", background: "#0d1421" }}>
                    {src ? (
                      isVid
                        ? <video src={src} muted playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                        : <img loading="lazy" decoding="async" src={src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg,${p.avatarColor ?? "#2563eb"}28,#0d1421)`, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 8 }}>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "rgba(255,255,255,0.75)", lineHeight: 1.4, margin: 0, display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.caption ?? ""}</p>
                      </div>
                    )}
                    {isVid && <div style={{ position: "absolute", top: 5, right: 5, pointerEvents: "none" }}><svg width={13} height={13} viewBox="0 0 24 24" fill="#fff" opacity={0.9}><polygon points="5,3 19,12 5,21"/></svg></div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 32, overflow: "hidden", position: "relative" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 680, width: "100%", margin: "0 auto", overflow: "hidden", minHeight: 0, position: "relative" }}>

        {/* ── Header ──
            #451: "as you scroll on mobile, the stuff and container at the top should disappear
            so the user has a full view of the social."

            On mobile the header now lives INSIDE the scroll container, so it simply scrolls away
            with the content and comes back when you scroll up. That is deliberate: #366 tried to
            collapse it by animating max-height 400px<->0 on every scroll-direction flip, which
            reflowed the whole feed ("blinks each time you scroll") and forced a re-render of the
            very large FeedPage on every scroll event (the lag) — so it was disabled on mobile
            entirely, which is why the header never went away. Letting it scroll costs no
            animation, no reflow and no state write, so it cannot bring that bug back.

            Desktop keeps the existing collapse-on-scroll behaviour. */}
        {!isMobile && (
          <div className="bg-bg" style={{ overflow: "hidden", maxHeight: isNavVisible ? "400px" : "0px", opacity: isNavVisible ? 1 : 0, transition: "max-height 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s linear", flexShrink: 0 }}>
          <div style={{ padding: "20px 16px 0" }}>

            {/* Title + actions */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 24, letterSpacing: "0.04em", textTransform: "uppercase" }}>{i18n.t("feed.landingTitle")}</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => setShowCompose(true)} style={{ background: "#2563eb", border: "none", borderRadius: 20, padding: "8px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <IconPlus /> {i18n.t("social.post")}
                </button>
              </div>
            </div>

            {/* Stories bar. The "no story yet" ring/badge borders deliberately match the page
                background (not a themed border token) so the avatar disc reads as a cutout
                floating on the page, in both themes. */}
            <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 16, scrollbarWidth: "none" }}>
              {!storiesReady ? Array.from({ length: 7 }).map((_, i) => <SkeletonFeedStory key={i} />) : stories.map((story, i) => (
                <button key={story.id} onClick={() => handleStoryClick(story, i)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0, padding: 0, animation: `fadeUp 0.3s ease ${i * 40}ms both` }}>
                  <div style={{ width: 60, height: 60, borderRadius: "50%", padding: 3, background: story.hasStory ? `linear-gradient(135deg, ${story.color}, #ec4899)` : "var(--color-border)", position: "relative" }}>
                    <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: story.hasStory ? story.color : "var(--color-surface-raised)", border: "2px solid var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                      <Avatar url={story.profilePicUrl} initials={story.initials} color={story.color || "#2563eb"} size="100%" alt={story.name} style={{ fontSize: 14, background: "transparent" }} />
                    </div>
                    {i === 0 && !story.hasStory && <div style={{ position: "absolute", bottom: 0, right: 0, width: 18, height: 18, borderRadius: "50%", background: "#2563eb", border: "2px solid var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><IconPlus size={8} /></div>}
                  </div>
                  <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, maxWidth: 60, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{i === 0 ? i18n.t("feed.yourStory") : story.name}</span>
                </button>
              ))}
            </div>

            {/* Tab pills — active pill keeps its accent bg + white text; the idle pill's bg is
                themed, so its text must follow the theme too (fixed-white-on-themed-bg trap). */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", marginBottom: 16, paddingBottom: 2 }}>
              {[{ id: "forYou", label: i18n.t("videos.forYou") }, { id: "photos", label: i18n.t("tempstay.photos") }, { id: "videos", label: i18n.t("videos.title") }, { id: "search", label: i18n.t("messages.search") }, { id: "saved", label: i18n.t("social.saved") }, { id: "liked", label: i18n.t("feed.liked") }].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "8px 18px", borderRadius: 20, background: tab === t.id ? "#2563eb" : "var(--color-surface-raised)", border: tab === t.id ? "none" : "1px solid var(--color-border)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: tab === t.id ? "#fff" : "var(--color-text-secondary)", cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap", flexShrink: 0 }}>{t.label}</button>
              ))}
            </div>
          </div>
          </div>
        )}

        {/* ── Tab content ── */}
        <div onScroll={handleFeedScroll} onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd} style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
          {/* #451: on mobile the header scrolls away with the feed. */}
          {isMobile && (
            <div className="bg-bg" style={{ position: "sticky", top: 0, zIndex: 20, flexShrink: 0, borderBottom: mobileHeaderCompact ? "1px solid var(--color-border-subtle)" : undefined }}>
          <div style={{ padding: mobileHeaderCompact ? "8px 16px 0" : "20px 16px 0" }}>

            {!mobileHeaderCompact && (
            <>
            {/* Title + actions */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 24, letterSpacing: "0.04em", textTransform: "uppercase" }}>{i18n.t("feed.landingTitle")}</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => setShowCompose(true)} style={{ background: "#2563eb", border: "none", borderRadius: 20, padding: "8px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <IconPlus /> {i18n.t("social.post")}
                </button>
              </div>
            </div>

            {/* Stories bar. The "no story yet" ring/badge borders deliberately match the page
                background (not a themed border token) so the avatar disc reads as a cutout
                floating on the page, in both themes. */}
            <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 16, scrollbarWidth: "none" }}>
              {!storiesReady ? Array.from({ length: 7 }).map((_, i) => <SkeletonFeedStory key={i} />) : stories.map((story, i) => (
                <button key={story.id} onClick={() => handleStoryClick(story, i)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0, padding: 0, animation: `fadeUp 0.3s ease ${i * 40}ms both` }}>
                  <div style={{ width: 60, height: 60, borderRadius: "50%", padding: 3, background: story.hasStory ? `linear-gradient(135deg, ${story.color}, #ec4899)` : "var(--color-border)", position: "relative" }}>
                    <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: story.hasStory ? story.color : "var(--color-surface-raised)", border: "2px solid var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                      <Avatar url={story.profilePicUrl} initials={story.initials} color={story.color || "#2563eb"} size="100%" alt={story.name} style={{ fontSize: 14, background: "transparent" }} />
                    </div>
                    {i === 0 && !story.hasStory && <div style={{ position: "absolute", bottom: 0, right: 0, width: 18, height: 18, borderRadius: "50%", background: "#2563eb", border: "2px solid var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><IconPlus size={8} /></div>}
                  </div>
                  <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, maxWidth: 60, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{i === 0 ? i18n.t("feed.yourStory") : story.name}</span>
                </button>
              ))}
            </div>
            </>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: mobileHeaderCompact ? 8 : 0 }}>
              {mobileHeaderCompact && (
                <>
                  <h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 16, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0, flexShrink: 0 }}>{i18n.t("feed.landingTitle")}</h2>
                  <button onClick={() => setShowCompose(true)} style={{ marginLeft: "auto", background: "#2563eb", border: "none", borderRadius: 20, padding: "6px 14px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <IconPlus /> {i18n.t("social.post")}
                  </button>
                </>
              )}
            </div>

            {/* Tab pills — active pill keeps its accent bg + white text; the idle pill's bg is
                themed, so its text must follow the theme too (fixed-white-on-themed-bg trap). */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", marginBottom: 16, paddingBottom: 2 }}>
              {[{ id: "forYou", label: i18n.t("videos.forYou") }, { id: "photos", label: i18n.t("tempstay.photos") }, { id: "videos", label: i18n.t("videos.title") }, { id: "search", label: i18n.t("messages.search") }, { id: "saved", label: i18n.t("social.saved") }, { id: "liked", label: i18n.t("feed.liked") }].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "8px 18px", borderRadius: 20, background: tab === t.id ? "#2563eb" : "var(--color-surface-raised)", border: tab === t.id ? "none" : "1px solid var(--color-border)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: tab === t.id ? "#fff" : "var(--color-text-secondary)", cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap", flexShrink: 0 }}>{t.label}</button>
              ))}
            </div>
          </div>
            </div>
          )}
          {renderTabContent()}
        </div>
      </div>

      {/* ── Mobile fullscreen videos — immersive reel feed, stays dark chrome regardless of
          theme (rule 3), matching InstagramVideoCard's mobile card above. ── */}
      {tab === "videos" && isMobile && (
        <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 150 }}>
          <button onClick={() => setTab("photos")} style={{ position: "absolute", top: 20, left: 16, zIndex: 10, display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 20, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <IconBack /> {i18n.t("feed.landingTitle")}
          </button>
          <MobileReelFeed reels={reels} reelHeartIdx={reelHeartIdx} videosMuted={videosMuted} setVideosMuted={setVideosMuted} toggleReelSave={toggleReelSave} onOpenProfile={openReelAuthor} onShare={setShareModal} onToggleLike={toggleLike} />
        </div>
      )}

      {/* ── Modals ── */}

      {viewStory && stories && stories.length > 0 && ( <StoryViewer initialStory={viewStory} storyGroups={stories} onClose={() => setViewStory(null)} />)}
      {showStoryComposer && ( <StoryComposerModal onClose={() => setShowStoryComposer(false)} onCreated={loadStories}  />)}
      {showCompose  && <NewPostModal onClose={() => setShowCompose(false)} onPosted={(type, extra) => { Promise.all([loadFeed(), loadReels()]); if (extra?.underReview) { setUnderReviewNotice(true); setTab("photos"); } else { setTab(type === "video" ? "videos" : "photos"); } }} />}
      {underReviewNotice && (
        <div role="status" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 90, background: "#0f172a", color: "#fff", borderRadius: 12, padding: "12px 16px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, maxWidth: 360, textAlign: "center", boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
          {i18n.t("feed.videoUnderReview", "Your video was submitted for review. It will appear in Videos after approval.")}
          <button type="button" onClick={() => setUnderReviewNotice(false)} style={{ marginLeft: 10, background: "none", border: "none", color: "#93b8fb", cursor: "pointer", fontWeight: 700 }}>OK</button>
        </div>
      )}
      {shareModal   && <ShareModal post={shareModal} posts={posts} onClose={() => setShareModal(null)} />}

      <CommentsSheet
        open={isMobile && commentsSheetPostId != null}
        onClose={() => setCommentsSheetPostId(null)}
        loading={commentsSheetPostId != null && !Object.prototype.hasOwnProperty.call(postCommentsData, commentsSheetPostId)}
        comments={(postCommentsData[commentsSheetPostId] || []).map(c => {
          const name = commentAuthorName(c);
          const baseLikes = c._count?.comment_likes ?? c._count?.likes ?? 0;
          return {
            id:          c.comment_id,
            user:        name,
            handle:      c.social_profile?.handle,
            avatarUrl:   commentAvatarUrl(c),
            avatar:      name.slice(0, 2).toUpperCase(),
            avatarColor: "#2563eb",
            time:        commentTime(c),
            text:        c.text ?? c.content ?? "",
            likes:       baseLikes,
            liked:       false,
          };
        })}
        draft={commentInputs[commentsSheetPostId] || ""}
        onDraftChange={v => setCommentInputs(prev => ({ ...prev, [commentsSheetPostId]: v }))}
        onSubmit={() => handleAddComment(commentsSheetPostId)}
        onReply={cm => setCommentInputs(prev => ({ ...prev, [commentsSheetPostId]: `@${cm.user} ` }))}
        onToggleLike={() => {}}
        onShare={() => { const p = posts.find(x => x.id === commentsSheetPostId); if (p) setShareModal(p); }}
      />

      {(() => {
        const mp = posts.find(p => p.id === commentsModalPostId);
        if (!mp) return null;
        const src = mp.imageUrl || mp.mediaUrl || mp.media_url || mp.social_media_attachments?.[0]?.media_url || null;
        const isVid = !!src?.match(/\.(mp4|webm|mov|m4v)(\?|$)/i);
        return (
          <MediaPostModal
            open={!isMobile && commentsModalPostId != null}
            onClose={() => setCommentsModalPostId(null)}
            meAvatarUrl={meAvatarUrl}
            meInitials={meInitials}   
            media={{ url: src, isVideo: isVid, fallbackBg: mp.gradient }}
            author={{ avatar: mp.avatar, avatarColor: mp.avatarColor, avatarUrl: mp.avatarUrl, name: mp.user, handle: mp.handle, verified: mp.verified, time: mp.time }}
            caption={mp.caption}
            loading={!Object.prototype.hasOwnProperty.call(postCommentsData, commentsModalPostId)}
            comments={(postCommentsData[commentsModalPostId] || []).map(c => {
              const name = commentAuthorName(c);
              const baseLikes = c._count?.comment_likes ?? c._count?.likes ?? 0;
              return {
                id:          c.comment_id,
                user:        name,
                avatarUrl:   commentAvatarUrl(c),
                avatar:      name.slice(0, 2).toUpperCase(),
                avatarColor: "#2563eb",
                time:        commentTime(c),
                text:        c.text ?? c.content ?? "",
                likes:       baseLikes,
                liked:       false,
              };
            })}
            liked={mp.liked}
            likes={mp.likes ?? 0}
            saved={mp.saved}
            time={mp.created_at ? timeAgo(mp.created_at) : ""}
            onToggleLike={() => toggleLike(mp.id)}
            onToggleSave={() => toggleSave(mp.id)}
            onShare={() => setShareModal(mp)}
            draft={commentInputs[commentsModalPostId] || ""}
            onDraftChange={v => setCommentInputs(prev => ({ ...prev, [commentsModalPostId]: v }))}
            onSubmit={() => handleAddComment(commentsModalPostId)}
            onReply={cm => setCommentInputs(prev => ({ ...prev, [commentsModalPostId]: `@${cm.user} ` }))}
          />
        );
      })()}

      {postOptionsMenu && <PostOptionsMenu post={postOptionsMenu} isOwner={isPostOwner(postOptionsMenu)} onClose={() => setPostOptionsMenu(null)} onEdit={setEditPostModal} onDelete={setDeletePostTarget} onReport={setReportPostTarget} />}
      <ReportModal
        open={!!reportPostTarget}
        onClose={() => setReportPostTarget(null)}
        targetType="POST"
        targetId={reportPostTarget?.id ?? reportPostTarget?.social_post_id}
        title={i18n.t("common.report")}
      />
      {editPostModal   && <EditPostModal post={editPostModal} onClose={() => setEditPostModal(null)} onSaved={handleSaveEditedPost} />}
      {deletePostTarget && <DeletePostConfirm onCancel={() => setDeletePostTarget(null)} onConfirm={handleConfirmDeletePost} deleting={deletingPost} />}

      {deleteCommentTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setDeleteCommentTarget(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-surface border border-border" style={{ borderRadius: 16, padding: 24, width: 300, display: "flex", flexDirection: "column", gap: 16 }}>
            <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, margin: 0 }}>{i18n.t("feed.deleteComment")}</p>
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>{i18n.t("feed.cannotUndo")}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteCommentTarget(null)} className="bg-surface-raised text-text-secondary" style={{ flex: 1, padding: "10px 0", border: "none", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
              <button onClick={confirmDeleteComment} style={{ flex: 1, padding: "10px 0", background: "#ef4444", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{i18n.t("common.delete")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// EmptyState (tiny shared helper) ─────────────────────────────────────────────────────────────────────────────

function EmptyState({ icon, label }) {
  return (
    <div className="text-text-muted" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 64 }}>
      {icon}
      <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{label}</p>
    </div>
  );
}

// FeedOnboarding ── shown when a (typically new) account has an empty feed. ──────
// Instagram-style "follow accounts to build your feed": pins the official Strug
// account (resolved by handle), then suggested accounts pulled from the explore
// feed (popular authors you don't yet follow). Following is a real API call.
const STRUG_HANDLE_CANDIDATES = ["strug", "strugofficial", "strug_official", "strughq", "strugapp"];

function FeedOnboarding({ onDone }) {
  const { isMobile } = useViewport();
  const [accounts, setAccounts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [followed, setFollowed] = useState(new Set()); // user_ids followed during onboarding
  const [busy,     setBusy]     = useState(new Set());  // user_ids with an in-flight toggle
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const me       = getUser();
      const myUserId = me?.user_id ?? me?.id;
      const seen     = new Set();
      const list     = [];

      // 1) Pin the official Strug account if we can resolve one of its candidate handles.
      for (const h of STRUG_HANDLE_CANDIDATES) {
        try {
          const res  = await getProfileByHandle(h);
          const prof = res?.data ?? res;
          const uid  = prof?.user_id ?? prof?.id;
          if (prof && uid && String(uid) !== String(myUserId)) {
            seen.add(String(uid));
            list.push({ userId: uid, handle: prof.handle ?? h, name: prof.display_name ?? i18n.t("common.brandName"), avatarUrl: prof.profile_pic_url ?? null, verified: prof.is_verified ?? true, official: true, blurb: i18n.t("feed.officialAccountBlurb") });
            break;
          }
        } catch { /* handle not found — try the next candidate */ }
      }

      // 2) Suggested accounts = popular authors from the explore feed.
      try {
        const res   = await getExploreFeed();
        const posts = Array.isArray(res) ? res : (res?.data ?? []);
        const freq  = {};
        for (const p of posts) {
          const prof = p.social_profile;
          const uid  = prof?.user_id;
          if (!prof || !uid || String(uid) === String(myUserId)) continue;
          const key = String(uid);
          freq[key] = (freq[key] || 0) + 1;
          if (seen.has(key)) continue;
          seen.add(key);
          list.push({ userId: uid, handle: prof.handle ?? "user", name: prof.display_name ?? prof.handle ?? i18n.t("common.defaultUser"), avatarUrl: prof.profile_pic_url ?? null, verified: prof.is_verified ?? false, official: false, _key: key });
        }
        // Order suggested (non-pinned) by popularity, keeping the pinned Strug account first.
        const pinned = list.filter(a => a.official);
        const rest   = list.filter(a => !a.official).sort((a, b) => (freq[b._key] || 0) - (freq[a._key] || 0));
        if (alive) setAccounts([...pinned, ...rest].slice(0, 12));
      } catch {
        if (alive) setAccounts(list);
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  async function toggle(acc) {
    const key = String(acc.userId);
    if (busy.has(key)) return;
    setBusy(prev => new Set(prev).add(key));
    const wasFollowed = followed.has(key);
    setFollowed(prev => { const n = new Set(prev); wasFollowed ? n.delete(key) : n.add(key); return n; });
    try { await toggleFollowByUserId(acc.userId); }
    catch { setFollowed(prev => { const n = new Set(prev); wasFollowed ? n.add(key) : n.delete(key); return n; }); } // revert on failure
    finally { setBusy(prev => { const n = new Set(prev); n.delete(key); return n; }); }
  }

  const followCount = followed.size;
  const canContinue = followCount > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", maxWidth: 560, margin: "0 auto", width: "100%", padding: isMobile ? "12px 0 40px" : "28px 0 60px" }}>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", margin: "0 auto 16px", background: "linear-gradient(135deg,#4f5bf5,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        </div>
        <h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "0.03em", textTransform: "uppercase", margin: "0 0 6px" }}>{i18n.t("feed.welcomeTitle")}</h2>
        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: "0 auto", maxWidth: 360, lineHeight: 1.5 }}>{i18n.t("feed.onboardingHint")}</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px" }}>
              <Skel w={48} h={48} r={24} /><div style={{ flex: 1 }}><Skel w={140} h={12} r={6} style={{ marginBottom: 8 }} /><Skel w={90} h={10} r={5} /></div><Skel w={88} h={34} r={10} />
            </div>
          ))
        ) : accounts.length === 0 ? (
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, textAlign: "center", padding: "30px 0" }}>{i18n.t("feed.noOnboardingSuggestions")}</p>
        ) : accounts.map(acc => {
          const key        = String(acc.userId);
          const isFollowing = followed.has(key);
          const isBusy      = busy.has(key);
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: "1px solid var(--color-border-subtle)" }}>
              <button onClick={() => { window.__profileTargetId = acc.userId; window.__nav?.("profile"); }} style={{ width: 48, height: 48, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: acc.official ? "linear-gradient(135deg,#4f5bf5,#7c3aed)" : "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer", padding: 0 }}>
                <Avatar url={acc.avatarUrl} initials={acc.name || acc.handle || "U"} size={48} style={{ fontSize: 17, background: "transparent" }} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{acc.name}</span>
                  {acc.verified && <IconVerified size={14} />}
                </div>
                <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{acc.official ? acc.blurb : `@${acc.handle}`}</span>
              </div>
              {/* isFollowing's idle bg is now themed, so its text/border must follow the theme
                  too (fixed-white-on-themed-bg trap) — the "Follow" state keeps its accent bg. */}
              <button onClick={() => toggle(acc)} disabled={isBusy} style={{ flexShrink: 0, minWidth: 92, background: isFollowing ? "var(--color-surface-raised)" : "#4f5bf5", border: isFollowing ? "1px solid var(--color-border)" : "none", borderRadius: 10, padding: "9px 14px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: isFollowing ? "var(--color-text-primary)" : "#fff", cursor: isBusy ? "default" : "pointer", opacity: isBusy ? 0.6 : 1, transition: "background 0.15s" }}>
                {isFollowing ? i18n.t("common.following") : i18n.t("common.follow")}
              </button>
            </div>
          );
        })}
      </div>

      {!loading && (
        <div style={{ position: "sticky", bottom: 0, background: "linear-gradient(180deg, transparent, var(--color-bg) 38%)", paddingTop: 20, marginTop: 4 }}>
          <button onClick={async () => { setFinishing(true); await onDone(); }} disabled={!canContinue || finishing} style={{ width: "100%", background: canContinue ? "#2563eb" : "var(--color-surface-raised)", border: "none", borderRadius: 14, padding: "15px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16, color: canContinue ? "#fff" : "var(--color-text-secondary)", cursor: canContinue && !finishing ? "pointer" : "default", transition: "background 0.15s" }}>
            {finishing ? i18n.t("feed.buildingFeed") : canContinue ? `${i18n.t("common.next")}${followCount > 0 ? ` (${followCount})` : ""}` : i18n.t("feed.followAtLeastOne")}
          </button>
          <button onClick={async () => { setFinishing(true); await onDone(); }} disabled={finishing} className="text-text-secondary" style={{ width: "100%", background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "12px 0 2px" }}>
            {i18n.t("feed.skipForNow")}
          </button>
        </div>
      )}
    </div>
  );
}

export { FeedPage, FeedPostDetailPage };
