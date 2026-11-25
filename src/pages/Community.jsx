import { useState, useEffect, useRef } from "react";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { Skel, SkeletonListRow } from "../components/skeletons.jsx";
import { useDialog } from "../components/ConfirmDialog.jsx";
import { clickableProps } from "../components/shared.jsx";
import SpacesLauncher from "./Spaces.jsx";
import {
    getCommunities, getCommunity, joinCommunity, leaveCommunity,
    createCommunityPost, createCommunity,
    getCommunityPosts, getCommunityPost, voteCommunityPost,
    getCommunityPostComments, addCommunityPostComment,
    checkMembership, updateCommunity, deleteCommunity,
    deleteCommunityPost, updateCommunityPost,
    deleteComment, updateComment,
    toggleSavePost,
    voteComment,
    getCommunityByHandle, customizeCommunity, uploadCommunityBanner, uploadCommunityIcon,
    saveCommunityRules, saveCommunityFlair,
    getModerators, addModerator, removeModerator, getCommunityBans, banUser, unbanUser,
    reportToCommunity, getCommunityReports, resolveReport, moderatePost, blockUser, muteUser,
    getCommunityFeed,
    getCommunityAwards, givePostAward, giveCommentAward, getMyKarma,
    getCommunityAnalytics,
} from "../api/community";
import { getUser } from "../store/auth.js";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "../api/social";
import ImageCropModal from "../components/ImageCropModal.jsx";

// Line-style glyphs matching the app icon set (viewBox 0 0 24 24, stroke=currentColor).
function LockGlyph({ s = 12 }) {
    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>;
}
function RestrictedGlyph({ s = 12 }) {
    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/></svg>;
}
function EditGlyph({ s = 12 }) {
    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>;
}
function TrashGlyph({ s = 12 }) {
    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></svg>;
}
function ShieldGlyph({ s = 12 }) {
    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>;
}
function FlagGlyph({ s = 12 }) {
    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>;
}
function BanGlyph({ s = 12 }) {
    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/></svg>;
}
function PinGlyph({ s = 12 }) {
    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M9 2h6l-1 7 3 3v2H7v-2l3-3z"/></svg>;
}
function MuteGlyph({ s = 12 }) {
    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>;
}
function UpvoteGlyph({ s = 12 }) {
    return <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M12 5l7 7H5z"/></svg>;
}
function CommentGlyph({ s = 12 }) {
    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-9 8.5 9.5 9.5 0 0 1-4-.9L3 21l1.9-5A8.38 8.38 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/></svg>;
}
// Award icons (line-style, filled by currentColor via fill so they read at small sizes).
function StarGlyph({ s = 12 }) {
    return <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.8 5.8 21l1.6-7L2 9.2l7.1-.6z"/></svg>;
}
function HeartGlyph({ s = 12 }) {
    return <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-10-9.3C.6 8.9 2 6 5 6c2 0 3.2 1.2 4 2.3C9.8 7.2 11 6 13 6c3 0 4.4 2.9 3 5.7-2.5 4.7-10 9.3-10 9.3z" transform="translate(1)"/></svg>;
}
function GemGlyph({ s = 12 }) {
    return <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12l4 6-10 12L2 9z"/></svg>;
}
function RocketGlyph({ s = 12 }) {
    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13c-1.5 1.3-2 5-2 5s3.7-.5 5-2m6.5-3.5a8 8 0 0 0 2-8 8 8 0 0 0-8 2c-1.4 1.4-2.3 3.3-2.7 5L11 16c1.7-.4 3.6-1.3 5-2.5z"/><circle cx="14" cy="10" r="1.5" fill="currentColor"/></svg>;
}
function TrophyGlyph({ s = 12 }) {
    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h12v4a6 6 0 0 1-12 0z"/><path d="M6 6H3v2a3 3 0 0 0 3 3M18 6h3v2a3 3 0 0 1-3 3M9 20h6M12 14v6"/></svg>;
}
const AWARD_ICONS = { star: StarGlyph, heart: HeartGlyph, gem: GemGlyph, rocket: RocketGlyph, trophy: TrophyGlyph };
function AwardIcon({ icon, s = 12 }) { const G = AWARD_ICONS[icon] || StarGlyph; return <G s={s} />; }

// Row of award chips (icon + count) for a post/comment.
function AwardChips({ awards }) {
    if (!awards || !awards.length) return null;
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            {awards.map(a => (
                <span key={a.award_id} title={a.name} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 10, background: `${a.color}1f`, border: `1px solid ${a.color}44`, color: a.color, fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>
                    <AwardIcon icon={a.icon} s={11} />{a.count}
                </span>
            ))}
        </span>
    );
}

// Community type metadata — label + glyph component for the badge shown across cards/headers.
const COMMUNITY_TYPE_META = {
    public:     { label: "Public",     Glyph: null,            desc: "Anyone can view, post, and comment." },
    restricted: { label: "Restricted", Glyph: RestrictedGlyph, desc: "Anyone can view; only members post." },
    private:    { label: "Private",    Glyph: LockGlyph,       desc: "Only approved members can view and post." },
};

// Small pill badge for community type / NSFW, reused on cards + headers.
function CommunityBadge({ type, nsfw, accent = "#2563eb", size = "sm" }) {
    const meta = COMMUNITY_TYPE_META[type] || COMMUNITY_TYPE_META.public;
    const pad = size === "sm" ? "2px 7px" : "3px 9px";
    const fs  = size === "sm" ? 10 : 11;
    const Glyph = meta.Glyph;
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {type && type !== "public" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: pad, borderRadius: 20, fontSize: fs, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", color: accent, background: `${accent}1f`, border: `1px solid ${accent}44`, letterSpacing: "0.02em" }}>
                    {Glyph && <Glyph s={fs + 1} />}{meta.label}
                </span>
            )}
            {nsfw && (
                <span style={{ padding: pad, borderRadius: 20, fontSize: fs, fontWeight: 800, fontFamily: "'DM Sans', sans-serif", color: "#f87171", background: "rgba(248,113,113,0.14)", border: "1px solid rgba(248,113,113,0.4)", letterSpacing: "0.04em" }}>NSFW</span>
            )}
        </span>
    );
}

const SEED_COMMUNITIES = [
    { id: "c1", name: "s/StrugLocal",     desc: "Atlanta community — jobs, events, and local news",          members: 18400, color: "#2563eb", icon: "S" },
    { id: "c2", name: "s/FreelanceHub",   desc: "Tips, rates, and war stories from independent workers",      members: 54200, color: "#7c3aed", icon: "F" },
    { id: "c3", name: "s/FoodScene",      desc: "Restaurant reviews, recipes, and pop-up alerts",            members: 29800, color: "#f59e0b", icon: "F" },
    { id: "c4", name: "s/HousingMarket",  desc: "Listings, advice, and market trends in your city",          members: 12600, color: "#059669", icon: "H" },
    { id: "c5", name: "s/SideHustles",    desc: "Share income ideas, gig reviews, and passive-income tips",  members: 41300, color: "#dc2626", icon: "S" },
    { id: "c6", name: "s/CreativePros",   desc: "Designers, writers, and artists sharing work and feedback", members: 22700, color: "#db2777", icon: "C" },
    { id: "c7", name: "s/GadgetDrops",    desc: "Latest tech releases, deals, and teardown threads",         members: 35900, color: "#0891b2", icon: "G" },
    { id: "c8", name: "s/WellnessCorner", desc: "Mental health, fitness, and nutrition discussion",          members: 17200, color: "#65a30d", icon: "W" },
];

const SORT_TABS = [
    { id: "hot", label: i18n.t("community.sortHot") },
    { id: "new", label: i18n.t("community.sortNew") },
    { id: "top", label: i18n.t("community.sortTop") },
    { id: "saved", label: i18n.t("community.sortSaved") },
];

function sortPosts(posts, sort) {
    const copy = [...posts];
    if (sort === "new") return copy.sort((a, b) => (b.rawTime || 0) - (a.rawTime || 0));
    if (sort === "top") return copy.sort((a, b) => (b.ups || 0) - (a.ups || 0));
    return copy.sort((a, b) => ((b.ups || 0) + (b.comments || 0) * 2) - ((a.ups || 0) + (a.comments || 0) * 2));
}

// Normalise social_profiles (array) or social_profile (object) → handle string
function getHandle(author) {
    return (
        author?.social_profiles?.[0]?.handle ??
        author?.social_profile?.handle ??
        author?.username ?? 
        "member"
    );
}

// ─── Three-Dot Menu ───────────────────────────────────────────────────────────

function ThreeDotMenu({ items, style }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        function onOut(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
        document.addEventListener("mousedown", onOut);
        return () => document.removeEventListener("mousedown", onOut);
    }, [open]);

    return (
        <div ref={ref} style={{ position: "relative", flexShrink: 0, ...style }}>
            <button
                onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
                className="text-text-secondary" style={{ background: open ? "var(--color-surface-raised)" : "none", border: "none", cursor: "pointer", padding: "3px 7px", borderRadius: 6, fontSize: 17, letterSpacing: 1, lineHeight: 1, display: "flex", alignItems: "center", transition: "background 0.12s" }}
                onMouseEnter={e => { if (!open) e.currentTarget.style.background = "var(--color-surface-raised)"; }}
                onMouseLeave={e => { if (!open) e.currentTarget.style.background = "none"; }}
            >•••</button>
            {open && (
                <div className="bg-surface-raised border border-border" style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", borderRadius: 10, overflow: "hidden", zIndex: 200, minWidth: 160, boxShadow: "0 8px 32px rgba(0,0,0,0.55)" }}>
                    {items.map((item, i) => (
                        <button
                            key={i}
                            onClick={e => { e.stopPropagation(); setOpen(false); item.onClick(e); }}
                            style={{
                                width: "100%", display: "flex", alignItems: "center", gap: 10,
                                padding: "10px 14px", background: "none", border: "none",
                                textAlign: "left", cursor: "pointer",
                                fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                                color: item.danger ? "#f87171" : "var(--color-text-secondary)",
                                transition: "background 0.1s",
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = item.danger ? "rgba(248,113,113,0.1)" : "var(--color-surface-raised)"}
                            onMouseLeave={e => e.currentTarget.style.background = "none"}
                        >
                            <span style={{ fontSize: 15, flexShrink: 0 }}>{item.icon}</span>
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function CommunitySidebar({ community, onCreatePost, joined, onJoin, onBack, notify, onCommunityUpdate, onCommunityDelete }) {
    const currentUserId = getUser()?.user_id;
    // Accept either field name — the API returns created_by; list/active mappings expose creator_id.
    const ownerId = community.creator_id ?? community.created_by;
    const isOwner = !!ownerId && String(ownerId) === String(currentUserId);

    const [karma, setKarma] = useState(null);
    useEffect(() => { getMyKarma().then(r => setKarma(r?.data ?? null)).catch(() => {}); }, []);

    const ALL_POST_TYPES = ["text", "link", "image", "poll"];
    const [showEdit, setShowEdit]     = useState(false);
    const [editForm, setEditForm]     = useState({
        name: community.name, description: community.desc,
        handle: community.handle || "", type: community.type || "public",
        nsfw: !!community.nsfw, color: community.color || "#2563eb",
        allowed_post_types: community.allowed_post_types || ALL_POST_TYPES,
        require_flair: !!community.require_flair,
    });
    const [editLoading, setEditLoading] = useState(false);
    const [editMsg, setEditMsg]         = useState("");
    const [banner, setBanner]           = useState(community.banner_url || null);
    const [iconUrl, setIconUrl]         = useState(community.icon_url || null);
    const [rules, setRules]             = useState(community.rules || []);
    const [flairs, setFlairs]           = useState(community.flairs || []);
    const [crop, setCrop]               = useState(null); // { field, src }
    const bannerInput = useRef(null);
    const iconInput   = useRef(null);

    function openEdit() {
        setEditForm({
            name: community.name, description: community.desc,
            handle: community.handle || "", type: community.type || "public",
            nsfw: !!community.nsfw, color: community.color || "#2563eb",
            allowed_post_types: community.allowed_post_types || ALL_POST_TYPES,
            require_flair: !!community.require_flair,
        });
        setBanner(community.banner_url || null);
        setIconUrl(community.icon_url || null);
        setRules((community.rules || []).map(r => ({ title: r.title, description: r.description || "" })));
        setFlairs((community.flairs || []).map(f => ({ flair_id: f.flair_id, label: f.label, color: f.color })));
        setEditMsg("");
        setShowEdit(true);
    }

    function togglePostType(t) {
        setEditForm(f => {
            const has = f.allowed_post_types.includes(t);
            let next = has ? f.allowed_post_types.filter(x => x !== t) : [...f.allowed_post_types, t];
            if (next.length === 0) next = ["text"]; // never allow zero types
            return { ...f, allowed_post_types: next };
        });
    }

    function pickImage(field, e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setCrop({ field, src: URL.createObjectURL(file) });
        e.target.value = ""; // allow re-selecting the same file
    }

    async function handleCropConfirm(file) {
        const field = crop?.field;
        setCrop(null);
        if (!field) return;
        try {
            const res = field === "banner"
                ? await uploadCommunityBanner(community.id, file)
                : await uploadCommunityIcon(community.id, file);
            const url = field === "banner" ? res?.banner_url : res?.icon_url;
            if (field === "banner") setBanner(url); else setIconUrl(url);
            onCommunityUpdate?.({ ...community, [field === "banner" ? "banner_url" : "icon_url"]: url });
        } catch (err) {
            notify?.({ title: i18n.t("community.errorTitle"), message: err?.response?.data?.message || i18n.t("community.failedUpdateCommunity") });
        }
    }

    async function handleDelete() {
        if (!confirm(i18n.t("community.confirmDeleteCommunity"))) return;
        try {
            await deleteCommunity(community.id);
            onCommunityDelete?.();
        } catch {
            notify?.({ title: i18n.t("community.errorTitle"), message: i18n.t("community.failedDeleteCommunity") });
        }
    }

    async function handleEditSave() {
        if (!editForm.name.trim()) return;
        setEditLoading(true); setEditMsg("");
        try {
            if (editForm.name.trim() !== community.name) {
                await updateCommunity(community.id, { name: editForm.name.trim() });
            }
            const res = await customizeCommunity(community.id, {
                description: editForm.description.trim(),
                handle: editForm.handle.trim() || undefined,
                type: editForm.type,
                nsfw: editForm.nsfw,
                color: editForm.color,
                allowed_post_types: editForm.allowed_post_types,
                require_flair: editForm.require_flair,
            });
            const c = res?.data ?? res;
            // Persist rules + flair (separate endpoints). Capture the saved flair rows (with ids).
            let savedRules = rules.filter(r => r.title.trim());
            let savedFlairs = flairs.filter(f => f.label.trim());
            try {
                const rr = await saveCommunityRules(community.id, savedRules);
                savedRules = rr?.data ?? savedRules;
            } catch { /* keep local */ }
            try {
                const fr = await saveCommunityFlair(community.id, savedFlairs);
                savedFlairs = fr?.data ?? savedFlairs;
            } catch { /* keep local */ }
            onCommunityUpdate?.({
                ...community,
                name: editForm.name.trim(),
                desc: editForm.description.trim(),
                icon: editForm.name.trim()[0].toUpperCase(),
                handle: c.handle ?? editForm.handle.trim(),
                type: c.type ?? editForm.type,
                nsfw: c.nsfw ?? editForm.nsfw,
                color: c.color ?? editForm.color,
                banner_url: banner,
                icon_url: iconUrl,
                allowed_post_types: c.allowed_post_types ?? editForm.allowed_post_types,
                require_flair: c.require_flair ?? editForm.require_flair,
                rules: savedRules,
                flairs: savedFlairs,
            });
            setShowEdit(false);
        } catch (err) {
            setEditMsg(err?.response?.data?.message || i18n.t("community.failedUpdateCommunity"));
        }
        setEditLoading(false);
    }

    return (
        <div style={{ width: 260, flexShrink: 0 }}>
            {/* About card */}
            <div className="bg-surface-raised border border-border" style={{ borderRadius: 16, overflow: "hidden", marginBottom: 14 }}>
                <div style={{
                    padding: "12px 16px",
                    background: `linear-gradient(135deg, ${community.color}22 0%, transparent 100%)`,
                    borderBottom: "1px solid var(--color-border-subtle)",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                    <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 14, letterSpacing: "0.05em" }}>{i18n.t("community.aboutCommunity")}</p>
                    {isOwner && (
                        <ThreeDotMenu items={[
                            { icon: <EditGlyph s={15} />, label: i18n.t("common.edit"), onClick: openEdit },
                            { icon: <TrashGlyph s={15} />, label: i18n.t("common.delete"), danger: true, onClick: handleDelete },
                        ]} />
                    )}
                </div>
                <div style={{ padding: "12px 16px" }}>
                    {community.handle && (
                        <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: (community.type && community.type !== "public") || community.nsfw ? 8 : 12 }}>s/{community.handle}</p>
                    )}
                    {((community.type && community.type !== "public") || community.nsfw) && (
                        <div style={{ marginBottom: 12 }}><CommunityBadge type={community.type} nsfw={community.nsfw} accent={community.color} /></div>
                    )}
                    <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>{community.desc}</p>
                    <div style={{ display: "flex", gap: 16, marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid var(--color-border-subtle)" }}>
                        <div>
                            <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16 }}>{(community.members || 0).toLocaleString()}</p>
                            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("messages.members")}</p>
                        </div>
                        <div>
                            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16, color: "#22c55e" }}>
                                {Math.max(1, Math.floor((community.members || 0) * (0.03 + ((community.id?.charCodeAt?.(1) ?? 3) % 5) * 0.01))).toLocaleString()}
                            </p>
                            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("events.online")}</p>
                        </div>
                        {karma && (
                            <div>
                                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16, color: "#f59e0b", display: "flex", alignItems: "center", gap: 4 }}><StarGlyph s={13} />{(karma.total || 0).toLocaleString()}</p>
                                <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("community.yourKarma", { defaultValue: "Your reputation" })}</p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onCreatePost}
                        style={{ width: "100%", background: "#2563eb", border: "none", borderRadius: 20, padding: "9px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer", marginBottom: 8 }}
                    >{i18n.t("community.createPost")}</button>
                    <button
                        onClick={onJoin}
                        style={{
                            width: "100%",
                            background: joined ? "rgba(5,150,105,0.1)" : "none",
                            border: `1px solid ${joined ? "rgba(5,150,105,0.4)" : "var(--color-border)"}`,
                            borderRadius: 20, padding: "9px 0",
                            fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13,
                            color: joined ? "#22c55e" : "var(--color-text-secondary)",
                            cursor: "pointer", transition: "all 0.15s",
                        }}
                    >{joined ? i18n.t("community.joined") : i18n.t("community.joinCommunity")}</button>
                </div>
            </div>

            {/* Rules card — custom rules when set, else the platform defaults */}
            {(() => {
                const customRules = Array.isArray(community.rules) ? community.rules : [];
                const rows = customRules.length
                    ? customRules.map(r => ({ title: r.title, description: r.description }))
                    : [i18n.t("community.ruleRespectful"), i18n.t("community.ruleNoSpam"), i18n.t("community.ruleOnTopic"), i18n.t("community.ruleNoMisinfo"), i18n.t("community.ruleNoHarassment")].map(t => ({ title: t, description: null }));
                return (
                    <div className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: "14px 16px" }}>
                        <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: "0.06em", marginBottom: 10 }}>{i18n.t("community.communityRules")}</p>
                        {rows.map((rule, i) => (
                            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: community.color, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                                <span>
                                    <span className="text-text-secondary" style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, lineHeight: 1.4 }}>{rule.title}</span>
                                    {rule.description && <span className="text-text-muted" style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 11, lineHeight: 1.4, marginTop: 2 }}>{rule.description}</span>}
                                </span>
                            </div>
                        ))}
                    </div>
                );
            })()}

            {/* Customize modal */}
            {showEdit && (
                // Full-screen modal backdrop: deliberate dark scrim over page content regardless of theme
                // (same call as the modal backdrops elsewhere in the app), so left hardcoded.
                <div
                    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
                    onClick={() => setShowEdit(false)}
                >
                    <div onClick={e => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ borderRadius: 18, padding: "26px 30px", width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto" }}>
                        <p className="text-text-primary" style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 18 }}>{i18n.t("community.customize", { defaultValue: "Customize community" })}</p>

                        {/* Banner + icon preview with upload buttons — the banner itself can be an arbitrary
                            uploaded photo (or a color gradient fallback), so the edit button's scrim/border/text
                            and the icon's cutout ring stay hardcoded dark regardless of theme for legibility,
                            same reasoning as the hero photo treatment in Hub.jsx. */}
                        <div className="border border-border" style={{ position: "relative", height: 96, borderRadius: 12, marginBottom: 44, background: banner ? `center/cover no-repeat url(${banner})` : `linear-gradient(135deg, ${editForm.color}55, ${editForm.color}18)` }}>
                            <button onClick={() => bannerInput.current?.click()} style={{ position: "absolute", top: 8, right: 8, display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}><EditGlyph s={12} />{i18n.t("community.editBanner", { defaultValue: "Banner" })}</button>
                            <div style={{ position: "absolute", left: 16, bottom: -28, width: 56, height: 56, borderRadius: "50%", background: iconUrl ? `center/cover no-repeat url(${iconUrl})` : editForm.color, border: "3px solid #13151c", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, color: "#fff" }}>
                                {!iconUrl && (editForm.name.trim()[0] || "C").toUpperCase()}
                                <button onClick={() => iconInput.current?.click()} style={{ position: "absolute", right: -6, bottom: -6, width: 22, height: 22, borderRadius: "50%", background: "#2563eb", border: "2px solid #13151c", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}><EditGlyph s={11} /></button>
                            </div>
                            <input ref={bannerInput} type="file" accept="image/*" onChange={e => pickImage("banner", e)} style={{ display: "none" }} />
                            <input ref={iconInput} type="file" accept="image/*" onChange={e => pickImage("icon", e)} style={{ display: "none" }} />
                        </div>

                        {[[i18n.t("community.name"), "name", i18n.t("community.name")], [i18n.t("community.description"), "description", i18n.t("community.whatsOnMind")]].map(([label, key, ph]) => (
                            <div key={key} style={{ marginBottom: 14 }}>
                                <p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
                                {key === "description" ? (
                                    <textarea value={editForm[key]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph} rows={3}
                                        className="bg-surface border border-border text-text-primary" style={{ width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", resize: "none", boxSizing: "border-box", caretColor: "#2563eb" }} />
                                ) : (
                                    <input value={editForm[key]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph}
                                        className="bg-surface border border-border text-text-primary" style={{ width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box", caretColor: "#2563eb" }} />
                                )}
                            </div>
                        ))}

                        {/* Handle */}
                        <div style={{ marginBottom: 14 }}>
                            <p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{i18n.t("community.handle", { defaultValue: "Handle" })}</p>
                            <div className="bg-surface border border-border" style={{ display: "flex", alignItems: "center", borderRadius: 10, padding: "0 12px" }}>
                                <span className="text-text-muted" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>s/</span>
                                <input value={editForm.handle} onChange={e => setEditForm(f => ({ ...f, handle: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") }))} maxLength={30} placeholder="my_community"
                                    className="text-text-primary" style={{ flex: 1, padding: "10px 6px", background: "none", border: "none", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", caretColor: "#2563eb" }} />
                            </div>
                        </div>

                        {/* Type */}
                        <div style={{ marginBottom: 14 }}>
                            <p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{i18n.t("community.type", { defaultValue: "Community type" })}</p>
                            {["public", "restricted", "private"].map(tp => (
                                <label key={tp} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", marginBottom: 6, borderRadius: 10, cursor: "pointer", background: editForm.type === tp ? "rgba(37,99,235,0.12)" : "var(--color-surface-raised)", border: `1px solid ${editForm.type === tp ? "rgba(37,99,235,0.4)" : "var(--color-border)"}` }}>
                                    <input type="radio" name="ctype" checked={editForm.type === tp} onChange={() => setEditForm(f => ({ ...f, type: tp }))} style={{ marginTop: 2, accentColor: "#2563eb" }} />
                                    <span>
                                        <span className="text-text-primary" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>
                                            {COMMUNITY_TYPE_META[tp].Glyph && (() => { const G = COMMUNITY_TYPE_META[tp].Glyph; return <G s={13} />; })()}
                                            {COMMUNITY_TYPE_META[tp].label}
                                        </span>
                                        <span className="text-text-secondary" style={{ display: "block", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{COMMUNITY_TYPE_META[tp].desc}</span>
                                    </span>
                                </label>
                            ))}
                        </div>

                        {/* Post settings — allowed post types + require flair */}
                        <div style={{ marginBottom: 14 }}>
                            <p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{i18n.t("community.postTypes", { defaultValue: "Allowed post types" })}</p>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                                {ALL_POST_TYPES.map(t => {
                                    const on = editForm.allowed_post_types.includes(t);
                                    return (
                                        <button key={t} onClick={() => togglePostType(t)} className={on ? "text-text-primary" : "text-text-secondary"} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", textTransform: "capitalize", background: on ? "rgba(37,99,235,0.2)" : "var(--color-surface-raised)", border: `1px solid ${on ? "rgba(37,99,235,0.5)" : "var(--color-border)"}` }}>{t}</button>
                                    );
                                })}
                            </div>
                            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                                <input type="checkbox" checked={editForm.require_flair} onChange={e => setEditForm(f => ({ ...f, require_flair: e.target.checked }))} style={{ accentColor: "#2563eb" }} />
                                <span className="text-text-secondary" style={{ fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("community.requireFlair", { defaultValue: "Require a tag on every post" })}</span>
                            </label>
                        </div>

                        {/* Post flair manager */}
                        <div style={{ marginBottom: 14 }}>
                            <p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{i18n.t("community.flairs", { defaultValue: "Post tags" })}</p>
                            {flairs.map((f, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                    <input type="color" value={f.color} onChange={e => setFlairs(list => list.map((x, j) => j === i ? { ...x, color: e.target.value } : x))} className="border border-border" style={{ width: 30, height: 28, background: "none", borderRadius: 6, cursor: "pointer", padding: 0, flexShrink: 0 }} />
                                    <input value={f.label} onChange={e => setFlairs(list => list.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} maxLength={30} placeholder={i18n.t("community.flairLabel", { defaultValue: "Tag label" })} className="bg-surface border border-border text-text-primary" style={{ flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", caretColor: "#2563eb" }} />
                                    <button onClick={() => setFlairs(list => list.filter((_, j) => j !== i))} style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, color: "#f87171", width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><TrashGlyph s={13} /></button>
                                </div>
                            ))}
                            <button onClick={() => setFlairs(list => [...list, { label: "", color: editForm.color }])} className="bg-surface-raised text-text-secondary" style={{ marginTop: 2, border: "1px dashed var(--color-border)", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", width: "100%" }}>+ {i18n.t("community.addFlair", { defaultValue: "Add tag" })}</button>
                        </div>

                        {/* Rules editor */}
                        <div style={{ marginBottom: 16 }}>
                            <p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{i18n.t("community.communityRules")}</p>
                            {rules.map((r, i) => (
                                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: editForm.color, fontWeight: 700, paddingTop: 9 }}>{i + 1}.</span>
                                    <div style={{ flex: 1 }}>
                                        <input value={r.title} onChange={e => setRules(list => list.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} placeholder={i18n.t("community.ruleTitle", { defaultValue: "Rule" })} className="bg-surface border border-border text-text-primary" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box", marginBottom: 5, caretColor: "#2563eb" }} />
                                        <input value={r.description} onChange={e => setRules(list => list.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder={i18n.t("community.ruleDesc", { defaultValue: "Description (optional)" })} className="bg-surface border border-border text-text-secondary" style={{ width: "100%", padding: "7px 12px", borderRadius: 8, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box", caretColor: "#2563eb" }} />
                                    </div>
                                    <button onClick={() => setRules(list => list.filter((_, j) => j !== i))} style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, color: "#f87171", width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, alignSelf: "flex-start", marginTop: 2 }}><TrashGlyph s={13} /></button>
                                </div>
                            ))}
                            {rules.length < 15 && (
                                <button onClick={() => setRules(list => [...list, { title: "", description: "" }])} className="bg-surface-raised text-text-secondary" style={{ marginTop: 2, border: "1px dashed var(--color-border)", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", width: "100%" }}>+ {i18n.t("community.addRule", { defaultValue: "Add rule" })}</button>
                            )}
                        </div>

                        {/* Accent color + NSFW */}
                        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                                <span className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>{i18n.t("community.accent", { defaultValue: "Accent" })}</span>
                                <input type="color" value={editForm.color} onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))} className="border border-border" style={{ width: 34, height: 26, background: "none", borderRadius: 6, cursor: "pointer", padding: 0 }} />
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginLeft: "auto" }}>
                                <input type="checkbox" checked={editForm.nsfw} onChange={e => setEditForm(f => ({ ...f, nsfw: e.target.checked }))} style={{ accentColor: "#f87171" }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#f87171", fontFamily: "'DM Sans', sans-serif" }}>NSFW (18+)</span>
                            </label>
                        </div>

                        {editMsg && <p style={{ color: "#f87171", fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}>{editMsg}</p>}
                        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                            <button onClick={handleEditSave} disabled={editLoading} style={{ flex: 1, padding: "11px 0", background: "#2563eb", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", opacity: editLoading ? 0.7 : 1 }}>{editLoading ? i18n.t("account.saving") : i18n.t("account.saveChanges")}</button>
                            <button onClick={() => setShowEdit(false)} className="bg-surface-raised text-text-secondary" style={{ flex: 1, padding: "11px 0", border: "none", borderRadius: 10, fontSize: 13, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Crop modal for banner / icon */}
            {crop && (
                <ImageCropModal
                    src={crop.src}
                    aspect={crop.field === "banner" ? 3 / 1 : 1}
                    outWidth={crop.field === "banner" ? 1500 : 400}
                    title={crop.field === "banner" ? i18n.t("community.cropBanner", { defaultValue: "Adjust banner" }) : i18n.t("community.cropIcon", { defaultValue: "Adjust icon" })}
                    onCancel={() => setCrop(null)}
                    onConfirm={handleCropConfirm}
                />
            )}
        </div>
    );
}

// ─── Post Detail ───────────────────────────────────────────────────────────────

function PostDetailPage({ post: initialPost, community, joined, onJoin, onBack, onCompose, notify, onPostDeleted, onPostUpdated, onCommunityUpdate, onCommunityDelete, onAward }) {
    const { isMobile }  = useViewport();
    const loading       = usePageLoad(150);
    const currentUserId = getUser()?.user_id;

    const [post, setPost]           = useState(initialPost);
    const [newComment, setNewComment]   = useState("");
    const [votes, setVotes]             = useState(initialPost.ups);
    const [voted, setVoted]             = useState(initialPost.user_vote ?? 0);
    const [submitted, setSubmitted]     = useState(false);
    const [comments, setComments]       = useState([]);
    const [commentVotes, setCommentVotes] = useState({});
    const [shareToast, setShareToast]   = useState(false);
    const [saved, setSaved]             = useState(initialPost.is_saved ?? false);
    const [replyingTo, setReplyingTo]   = useState(null);
    const [replyText, setReplyText]     = useState("");
    const [replies, setReplies]         = useState({});

    // Edit post
    const [showEditPost, setShowEditPost]     = useState(false);
    const [editPostTitle, setEditPostTitle]   = useState(initialPost.title);
    const [editPostBody, setEditPostBody]     = useState(initialPost.body);
    const [editPostLoading, setEditPostLoading] = useState(false);

    // Edit comment (inline)
    const [editingComment, setEditingComment] = useState(null);
    const [editCommentText, setEditCommentText] = useState("");

    // Load comments
    useEffect(() => {
        if (!post?.id) return;
        getCommunityPostComments(post.id)
            .then(data => {
                const list = Array.isArray(data) ? data : (data?.data ?? []);
                const mapped = list.map(c => ({
                    id:        c.comment_id ?? c.id,
                    author:    getHandle(c.author),
                    avatar:    c.author?.social_profiles?.[0]?.profile_pic_url || null,
                    initials:  getHandle(c.author)[0].toUpperCase(),
                    author_id: c.user_id ?? c.author?.user_id,
                    color:     "#2563eb",
                    time:      c.created_at ? new Date(c.created_at).toLocaleDateString() : "",
                    text:      c.content ?? "",
                    ups:       c.upvotes || 0,
                    voted:     c.user_vote || 0,
                    parent_id: c.parent_id ?? null,
                }));

                const topLevel = mapped.filter(c => !c.parent_id);
                const replyMap = {};
                mapped.filter(c => !!c.parent_id).forEach(r => {
                    if (!replyMap[r.parent_id]) replyMap[r.parent_id] = [];
                    replyMap[r.parent_id].push(r);
                });

                setComments(topLevel);
                setReplies(replyMap);
                setCommentVotes(Object.fromEntries(mapped.map(c => [c.id, { ups: c.ups, voted: c.voted }])));
            })
            .catch(() => { setComments([]); setCommentVotes({}); });
}, [post?.id]);

    function handleShare(commentId) {
        const shareUrl = `${window.location.origin}/community/post/${commentId}`;
        navigator.clipboard?.writeText(shareUrl).then(() => {
            setShareToast(true);
            setTimeout(() => setShareToast(false), 2000);
        }).catch((err) => {
            console.error("Failed to copy: ", err);
        });
    }

    function handlePostVote(dir) {
        const dirVal = dir === "up" ? 1 : -1;
        const prev   = { votes, voted };
        if (voted === dirVal) { setVoted(0); setVotes(v => v - dirVal); }
        else { setVotes(v => v + (voted !== 0 ? dirVal * 2 : dirVal)); setVoted(dirVal); }
        voteCommunityPost(post.id, dirVal).catch(() => { setVotes(prev.votes); setVoted(prev.voted); });
    }

    async function handleDeletePost() {
        if (!confirm(i18n.t("community.confirmDeletePost"))) return;
        try {
            await deleteCommunityPost(post.id);
            onPostDeleted?.(post.id);
        } catch {
            notify?.({ title: i18n.t("community.errorTitle"), message: i18n.t("community.failedDeletePost") });
        }
    }

    async function handleSaveEditPost() {
        setEditPostLoading(true);
        try {
            await updateCommunityPost(post.id, { title: editPostTitle.trim(), content: editPostBody.trim() });
            const updates = { title: editPostTitle.trim(), body: editPostBody.trim() };
            setPost(p => ({ ...p, ...updates }));
            onPostUpdated?.(post.id, updates);
            setShowEditPost(false);
        } catch {
            notify?.({ title: i18n.t("community.errorTitle"), message: i18n.t("community.failedUpdatePost") });
        }
        setEditPostLoading(false);
    }

    async function handleDeleteComment(commentId) {
        try {
            await deleteComment(commentId); 
            setComments(prev => prev.filter(c => c.id !== commentId));
        } catch (err) {
            console.error("Delete failed:", err);
        }
    }

    async function handleSaveEditComment(commentId) {
        const text = editCommentText.trim();
        if (!text) return;
        try {
            await updateComment(post.id, commentId, { content: text });
            setComments(prev => prev.map(c => c.id === commentId ? { ...c, text } : c));
            setEditingComment(null);
            setEditCommentText("");
        } catch {
            notify?.({ title: i18n.t("community.errorTitle"), message: i18n.t("community.failedUpdateComment") });
        }
    }

    // submitReply — parent_id pass karo
    function submitReply(commentId) {
        if (!replyText.trim()) return;
        const text = replyText.trim();
        const tempId = Date.now();
        const currentUser = getUser();
        
        // Optimistic UI
        setReplies(prev => ({
            ...prev,
            [commentId]: [
                ...(prev[commentId] ?? []),
                { 
                    id: tempId, 
                    author: currentUser?.username ?? "you", 
                    avatar: null, 
                    initials: (currentUser?.username?.[0] ?? "Y").toUpperCase(), 
                    color: "#2563eb", 
                    text, 
                    time: "now" 
                },
            ],
        }));
        setReplyText("");
        setReplyingTo(null);

        if (post?.id) {
            addCommunityPostComment(post.id, { 
                content: text, 
                parent_id: commentId  // ← YEH ADD KARO
            }).catch(() => {
                setReplies(prev => ({
                    ...prev,
                    [commentId]: (prev[commentId] ?? []).filter(r => r.id !== tempId),
                }));
            });
        }
    }

    function submitComment() {
        if (!newComment.trim()) return;
        const text = newComment.trim();
        const nc = { id: Date.now(), author: "you", avatar: null, initials: "YO", author_id: currentUserId, color: "#2563eb", text, time: "now", ups: 0 };
        setComments(prev => [nc, ...prev]);
        setCommentVotes(prev => ({ ...prev, [nc.id]: { ups: 0, voted: null } }));
        setNewComment(""); setSubmitted(true);
        setTimeout(() => setSubmitted(false), 2000);
        if (post?.id) addCommunityPostComment(post.id, { content: text }).catch(() => {});
    }

    async function handleVoteComment(id, dirVal) {
        const prevVote = commentVotes[id]?.voted || 0;
        const prevUps = commentVotes[id]?.ups || 0;
        
        setCommentVotes(prev => {
            const current = prev[id] || { ups: 0, voted: 0 };
            const newVoted = (current.voted === dirVal) ? 0 : dirVal;
            const newUps = current.ups + (newVoted - current.voted);
            return { ...prev, [id]: { ups: newUps, voted: newVoted } };
        });

        // API Call
        try {
            await voteComment(id, dirVal);
        } catch (err) {
            setCommentVotes(prev => ({ ...prev, [id]: { ups: prevUps, voted: prevVote } }));
        }
    }

    if (loading) return (
        <div style={{ flex: 1, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
            <div style={{ maxWidth: 860, margin: "0 auto", paddingTop: 32 }}>
                <Skel w={160} h={16} r={6} style={{ marginBottom: 24 }} />
                <Skel w="100%" h={120} r={16} style={{ marginBottom: 24 }} />
                {[...Array(3)].map((_, i) => <SkeletonListRow key={i} />)}
            </div>
        </div>
    );

    const isPostAuthor = !!post.author_id && post.author_id === currentUserId;

    return (
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
            <div style={{ maxWidth: 860, margin: "0 auto", width: "100%", paddingTop: 28, paddingBottom: 24, display: "flex", gap: 24 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 14, padding: "6px 8px", marginLeft: -8 }}>← Back to {community.name}</button>

                    {/* Post card */}
                    <div className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: 24, marginBottom: 20 }}>
                        <div style={{ display: "flex", gap: 16 }}>
                            {/* Vote column */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 36 }}>
                                <button onClick={() => handlePostVote("up")} style={{ background: voted === 1 ? "rgba(245,158,11,0.15)" : "none", border: "none", cursor: "pointer", color: voted === 1 ? "#f59e0b" : "var(--color-text-secondary)", padding: "8px 10px", fontSize: 16, borderRadius: 6, transition: "all 0.12s" }}>▲</button>
                                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: voted === 1 ? "#f59e0b" : voted === -1 ? "#dc2626" : "var(--color-text-secondary)" }}>{votes}</span>
                                <button onClick={() => handlePostVote("down")} style={{ background: voted === -1 ? "rgba(220,38,38,0.15)" : "none", border: "none", cursor: "pointer", color: voted === -1 ? "#dc2626" : "var(--color-text-secondary)", padding: "8px 10px", fontSize: 16, borderRadius: 6, transition: "all 0.12s" }}>▼</button>
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                {/* Header row: meta + three-dot */}
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                                            {post.flair && (typeof post.flair === "object"
                                                ? <span style={{ background: `${post.flair.color}26`, border: `1px solid ${post.flair.color}55`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: post.flair.color }}>{post.flair.label}</span>
                                                : <span style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: "#60a5fa" }}>{post.flair}</span>)}
                                            {post.is_spoiler && <span style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 4, padding: "1px 7px", fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 800, color: "#f59e0b", letterSpacing: "0.04em" }}>{i18n.t("community.spoiler", { defaultValue: "SPOILER" }).toUpperCase()}</span>}
                                            {post.is_nsfw && <span style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.4)", borderRadius: 4, padding: "1px 7px", fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 800, color: "#f87171", letterSpacing: "0.04em" }}>NSFW</span>}
                                            <AwardChips awards={post.awards} />
                                        </div>
                                        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>Posted by @{post.author} · {post.time}</p>
                                    </div>
                                    {(() => {
                                        const items = [];
                                        if (isPostAuthor) {
                                            items.push({ icon: <EditGlyph s={15} />, label: i18n.t("feed.editPost"), onClick: () => { setEditPostTitle(post.title); setEditPostBody(post.body); setShowEditPost(true); } });
                                            items.push({ icon: <TrashGlyph s={15} />, label: i18n.t("common.delete"), danger: true, onClick: handleDeletePost });
                                        } else {
                                            items.push({ icon: <StarGlyph s={15} />, label: i18n.t("community.giveAward", { defaultValue: "Give award" }), onClick: () => onAward?.(post.id) });
                                        }
                                        return <ThreeDotMenu items={items} />;
                                    })()}
                                </div>
                                <h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.02em", marginBottom: 12, lineHeight: 1.2 }}>{post.title}</h2>
                                <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>{post.body}</p>
                                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                                    <button onClick={() => handleShare(post.id)} className="text-text-secondary" style={{ background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer", padding: "7px 8px", margin: "-4px -2px", display: "flex", alignItems: "center", gap: 5 }}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>{i18n.t("community.share")}
                                    </button>
                                    <button
                                        onClick={() => {
                                            const prev = saved;
                                            const next = !saved;
                                            setSaved(next);
                                            onPostUpdated?.(post.id, { is_saved: next });
                                            toggleSavePost(post.id).catch(() => {
                                                setSaved(prev);
                                                onPostUpdated?.(post.id, { is_saved: prev });
                                            });
                                        }}
                                        style={{ background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: saved ? "#2563eb" : "var(--color-text-secondary)", cursor: "pointer", padding: "7px 8px", margin: "-4px -2px", display: "flex", alignItems: "center", gap: 5 }}
                                    >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill={saved ? "#2563eb" : "none"} stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>{saved ? i18n.t("community.saved") : i18n.t("community.save")}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Edit post modal */}
                    {showEditPost && (
                        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowEditPost(false)}>
                            <div onClick={e => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ borderRadius: 18, padding: 28, width: "min(540px,90vw)" }}>
                                <h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, marginBottom: 16, letterSpacing: "0.03em", textTransform: "uppercase" }}>{i18n.t("feed.editPost")}</h3>
                                <input
                                    value={editPostTitle} onChange={e => setEditPostTitle(e.target.value)}
                                    placeholder={i18n.t("community.titleOptional")}
                                    className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 10, padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 10, caretColor: "#2563eb" }}
                                />
                                <textarea
                                    value={editPostBody} onChange={e => setEditPostBody(e.target.value)}
                                    rows={5}
                                    className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 12, padding: 14, fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 16, caretColor: "#2563eb" }}
                                    onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"}
                                    onBlur={e => e.target.style.borderColor = "var(--color-border)"}
                                />
                                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                                    <button onClick={() => setShowEditPost(false)} className="border border-border text-text-secondary" style={{ padding: "9px 18px", background: "none", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
                                    <button onClick={handleSaveEditPost} disabled={editPostLoading || !editPostBody.trim()} style={{ padding: "9px 22px", background: "#2563eb", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: (editPostLoading || !editPostBody.trim()) ? 0.6 : 1 }}>{editPostLoading ? i18n.t("account.saving") : i18n.t("common.save")}</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Comment box */}
                    <div className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: 20, marginBottom: 20 }}>
                        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{i18n.t("community.commentAsYou")}</p>
                        <textarea
                            value={newComment} onChange={e => setNewComment(e.target.value)}
                            placeholder={i18n.t("community.thoughtsPlaceholder")}
                            className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", minHeight: 90, borderRadius: 10, padding: "12px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", resize: "vertical", boxSizing: "border-box", caretColor: "#2563eb" }}
                            onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"}
                            onBlur={e => e.target.style.borderColor = "var(--color-border)"}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                            <button onClick={submitComment} disabled={!newComment.trim()} style={{ background: submitted ? "#059669" : "#2563eb", border: "none", borderRadius: 10, padding: "9px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: newComment.trim() ? "pointer" : "default", opacity: newComment.trim() ? 1 : 0.5, transition: "all 0.2s" }}>{submitted ? i18n.t("community.posted") : i18n.t("common.reply")}</button>
                        </div>
                    </div>

                    {/* Comments list */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {comments.length === 0 && <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "24px 0" }}>{i18n.t("community.noCommentsFirst")}</p>}
                        {comments.map(c => {
                            const cv = commentVotes[c.id] || { ups: c.ups, voted: null };
                            const isCommentAuthor = !!c.author_id && c.author_id === currentUserId;
                            const isEditing = editingComment === c.id;

                            return (
                                <div key={c.id} className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 12, padding: "14px 16px", animation: "fadeUp 0.2s ease both" }}>
                                    {/* Comment header */}
                                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                                        <div style={{ 
                                            width: 28, height: 28, borderRadius: "50%", 
                                            background: c.avatar ? "transparent" : c.color, 
                                            display: "flex", alignItems: "center", justifyContent: "center", 
                                            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, 
                                            fontSize: 12, color: "#fff", flexShrink: 0,
                                            overflow: "hidden" 
                                        }}>
                                            {c.avatar ? (
                                                <img 
                                                    src={c.avatar} 
                                                    alt={c.author} 
                                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                    onError={(e) => { e.target.style.display = 'none'; }} // Agar image load na ho, toh initials dikha dega
                                                />
                                            ) : (
                                                c.initials
                                            )}
                                        </div>
                                        <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>@{c.author}</span>
                                        <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{c.time}</span>
                                        <div style={{ marginLeft: "auto" }}>
                                            {isCommentAuthor && !isEditing && (
                                                <ThreeDotMenu items={[
                                                    { icon: <EditGlyph s={15} />, label: i18n.t("common.edit"),   onClick: () => { setEditingComment(c.id); setEditCommentText(c.text); } },
                                                    { icon: <TrashGlyph s={15} />, label: i18n.t("common.delete"), danger: true, onClick: () => handleDeleteComment(c.id) },
                                                ]} />
                                            )}
                                        </div>
                                    </div>

                                    {/* Comment body — normal or edit mode */}
                                    {isEditing ? (
                                        <div>
                                            <textarea
                                                value={editCommentText} onChange={e => setEditCommentText(e.target.value)}
                                                rows={3} autoFocus
                                                className="bg-surface-raised text-text-primary" style={{ width: "100%", border: "1px solid rgba(37,99,235,0.45)", borderRadius: 8, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", caretColor: "#2563eb", marginBottom: 8 }}
                                            />
                                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                                <button onClick={() => { setEditingComment(null); setEditCommentText(""); }} className="border border-border text-text-secondary" style={{ padding: "5px 14px", background: "none", borderRadius: 7, fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
                                                <button onClick={() => handleSaveEditComment(c.id)} disabled={!editCommentText.trim()} style={{ padding: "5px 14px", background: "#2563eb", border: "none", borderRadius: 7, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, cursor: editCommentText.trim() ? "pointer" : "default", opacity: editCommentText.trim() ? 1 : 0.5 }}>{i18n.t("common.save")}</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.6, marginBottom: 10 }}>{c.text}</p>
                                            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                                                    <button
                                                        onClick={() => handleVoteComment(c.id, 1)} 
                                                        style={{
                                                            background: cv.voted === 1 ? "rgba(245,158,11,0.15)" : "none",
                                                            border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                                                            color: cv.voted === 1 ? "#f59e0b" : "var(--color-text-secondary)",
                                                            cursor: "pointer", padding: "8px 9px", borderRadius: 4, transition: "all 0.12s",
                                                        }}
                                                    >▲</button>

                                                    <span style={{
                                                        fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700,
                                                        color: cv.voted === 1 ? "#f59e0b" : cv.voted === -1 ? "#dc2626" : "var(--color-text-secondary)",
                                                        minWidth: 24, textAlign: "center", userSelect: "none",
                                                    }}>{cv.ups}</span>
                                                    
                                                    <button
                                                        onClick={() => handleVoteComment(c.id, -1)}
                                                        style={{
                                                            background: cv.voted === -1 ? "rgba(220,38,38,0.12)" : "none",
                                                            border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                                                            color: cv.voted === -1 ? "#dc2626" : "var(--color-text-secondary)",
                                                            cursor: "pointer", padding: "8px 9px", borderRadius: 4, transition: "all 0.12s",
                                                        }}
                                                    >▼</button>
                                                </div>
                                                <button onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)} style={{ background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: replyingTo === c.id ? "#2563eb" : "var(--color-text-muted)", cursor: "pointer", padding: 0 }}>{i18n.t("common.reply")}</button>
                                                <button onClick={() => handleShare(c.id)} className="text-text-muted" style={{ background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer", padding: "7px 8px", margin: "0 -4px" }}>{i18n.t("community.share")}</button>
                                            </div>
                                        </>
                                    )}

                                    {/* Reply box */}
                                    {replyingTo === c.id && (
                                        <div style={{ marginTop: 12, paddingLeft: 16, borderLeft: "2px solid rgba(37,99,235,0.3)" }}>
                                            <textarea
                                                value={replyText} onChange={e => setReplyText(e.target.value)}
                                                placeholder={`Reply to @${c.author}…`} rows={2}
                                                className="bg-surface-raised text-text-primary" style={{ width: "100%", border: "1px solid rgba(37,99,235,0.35)", borderRadius: 8, padding: "8px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", caretColor: "#2563eb" }}
                                            />
                                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
                                                <button onClick={() => { setReplyingTo(null); setReplyText(""); }} className="border border-border text-text-secondary" style={{ padding: "5px 14px", background: "none", borderRadius: 7, fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
                                                <button onClick={() => submitReply(c.id)} disabled={!replyText.trim()} style={{ padding: "5px 14px", background: "#2563eb", border: "none", borderRadius: 7, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, cursor: replyText.trim() ? "pointer" : "default", opacity: replyText.trim() ? 1 : 0.5 }}>{i18n.t("common.reply")}</button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Nested replies */}
                                    {(replies[c.id] ?? []).length > 0 && (
                                        <div style={{ marginTop: 10, paddingLeft: 16, borderLeft: "2px solid var(--color-border-subtle)", display: "flex", flexDirection: "column", gap: 8 }}>
                                            {(replies[c.id] ?? []).map(r => (
                                                <div key={r.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                                                    <div style={{
                                                        width: 22, height: 22, borderRadius: "50%",
                                                        background: r.avatar ? "transparent" : r.color,
                                                        display: "flex", alignItems: "center", justifyContent: "center",
                                                        fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                                                        fontSize: 10, color: "#fff", flexShrink: 0, overflow: "hidden"
                                                    }}>
                                                        {r.avatar
                                                            ? <img src={r.avatar} alt={r.author} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = 'none'; }} />
                                                            : r.initials ?? r.author?.[0]?.toUpperCase() ?? "?"
                                                        }
                                                    </div>
                                                    <div>
                                                        <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600 }}>@{r.author}</span>
                                                        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginTop: 2, lineHeight: 1.5 }}>{r.text}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {!isMobile && (
                    <CommunitySidebar
                        community={community}
                        onCreatePost={onCompose}
                        joined={joined}
                        onJoin={onJoin}
                        onBack={onBack}
                        notify={notify}
                        onCommunityUpdate={onCommunityUpdate}
                        onCommunityDelete={onCommunityDelete}
                    />
                )}
            </div>

            {shareToast && (
                <div className="bg-surface-raised border border-border text-text-primary" style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", borderRadius: 12, padding: "12px 24px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, zIndex: 90, display: "flex", alignItems: "center", gap: 8, animation: "fadeUp 0.2s ease both" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {i18n.t("community.linkCopied")}
                </div>
            )}
        </div>
    );
}

// ─── Mod Tools ─────────────────────────────────────────────────────────────────

const modInput = { width: "100%", padding: "9px 12px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-primary)", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box", caretColor: "#2563eb" };
const modBtn = (bg, color, border) => ({ padding: "6px 12px", background: bg, border: `1px solid ${border}`, borderRadius: 8, color, fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" });

function ModToolsPanel({ community, onClose, notify, onModerated }) {
    const canPosts = community.viewer_is_owner || (community.viewer_perms || []).some(p => p === "all" || p === "manage_posts");
    const canUsers = community.viewer_is_owner || (community.viewer_perms || []).some(p => p === "all" || p === "manage_users");
    const canSettings = community.viewer_is_owner || (community.viewer_perms || []).some(p => p === "all" || p === "manage_settings");
    const [tab, setTab]         = useState(canPosts ? "queue" : (canSettings ? "analytics" : "mods"));
    const [reports, setReports] = useState(null);
    const [mods, setMods]       = useState(null);
    const [bans, setBans]       = useState(null);
    const [analytics, setAnalytics] = useState(null);
    const [newMod, setNewMod]   = useState("");
    const [banForm, setBanForm] = useState({ username: "", reason: "" });
    const [busy, setBusy]       = useState(false);

    useEffect(() => {
        if (tab === "queue" && reports === null) getCommunityReports(community.id).then(r => setReports(r?.data || [])).catch(() => setReports([]));
        if (tab === "mods" && mods === null) getModerators(community.id).then(r => setMods(r?.data || [])).catch(() => setMods([]));
        if (tab === "bans" && bans === null) getCommunityBans(community.id).then(r => setBans(r?.data || [])).catch(() => setBans([]));
        if (tab === "analytics" && analytics === null) getCommunityAnalytics(community.id).then(r => setAnalytics(r?.data || {})).catch(() => setAnalytics({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    async function handleReport(report, action) {
        setBusy(true);
        try {
            if (action === "remove" && report.post_id) { await moderatePost(report.post_id, "remove"); await resolveReport(community.id, report.id, "actioned"); onModerated?.(report.post_id, { is_removed: true }); }
            else await resolveReport(community.id, report.id, action === "remove" ? "actioned" : "dismissed");
            setReports(rs => rs.filter(r => r.id !== report.id));
        } catch (e) { notify?.({ title: "Error", message: e?.response?.data?.message || "Action failed." }); }
        setBusy(false);
    }
    async function handleAddMod() {
        if (!newMod.trim()) return;
        setBusy(true);
        try { await addModerator(community.id, newMod.trim(), ["all"]); setNewMod(""); const r = await getModerators(community.id); setMods(r?.data || []); }
        catch (e) { notify?.({ title: "Error", message: e?.response?.data?.message || "Couldn't add moderator." }); }
        setBusy(false);
    }
    async function handleRemoveMod(userId) {
        try { await removeModerator(community.id, userId); setMods(ms => ms.filter(m => m.user.user_id !== userId)); }
        catch (e) { notify?.({ title: "Error", message: e?.response?.data?.message || "Couldn't remove moderator." }); }
    }
    async function handleBan() {
        if (!banForm.username.trim()) return;
        setBusy(true);
        try { await banUser(community.id, { username: banForm.username.trim(), reason: banForm.reason.trim() || undefined }); setBanForm({ username: "", reason: "" }); const r = await getCommunityBans(community.id); setBans(r?.data || []); }
        catch (e) { notify?.({ title: "Error", message: e?.response?.data?.message || "Couldn't ban user." }); }
        setBusy(false);
    }
    async function handleUnban(userId) {
        try { await unbanUser(community.id, userId); setBans(bs => bs.filter(b => b.user_id !== userId)); }
        catch (e) { notify?.({ title: "Error", message: e?.response?.data?.message || "Couldn't unban." }); }
    }

    const tabs = [canPosts && { id: "queue", label: i18n.t("community.modQueue", { defaultValue: "Queue" }) }, canSettings && { id: "analytics", label: i18n.t("community.analytics", { defaultValue: "Analytics" }) }, canUsers && { id: "mods", label: i18n.t("community.moderators", { defaultValue: "Moderators" }) }, canUsers && { id: "bans", label: i18n.t("community.bans", { defaultValue: "Bans" }) }].filter(Boolean);

    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 320, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ borderRadius: 18, padding: "24px 26px", width: "100%", maxWidth: tab === "analytics" ? 680 : 560, maxHeight: "86vh", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <span style={{ color: community.color }}><ShieldGlyph s={20} /></span>
                    <p className="text-text-primary" style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>{i18n.t("community.modTools", { defaultValue: "Mod tools" })}</p>
                </div>
                <div className="bg-surface-raised" style={{ display: "flex", gap: 6, marginBottom: 16, borderRadius: 10, padding: 4 }}>
                    {tabs.map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)} className={tab === t.id ? "text-text-primary" : "text-text-secondary"} style={{ flex: 1, padding: "8px 10px", background: tab === t.id ? "rgba(37,99,235,0.2)" : "none", border: "none", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{t.label}</button>
                    ))}
                </div>
                <div style={{ overflowY: "auto", flex: 1 }}>
                    {tab === "analytics" && (analytics === null ? <p style={ghost}>Loading…</p> : <AnalyticsView data={analytics} color={community.color} />)}
                    {tab === "queue" && (reports === null ? <p style={ghost}>Loading…</p> : reports.length === 0 ? <p style={ghost}>{i18n.t("community.queueEmpty", { defaultValue: "No open reports." })}</p> : reports.map(r => (
                        <div key={r.id} style={modCard}>
                            <p className="text-text-secondary" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{r.target_type.toUpperCase()} · {i18n.t("community.reportedBy", { defaultValue: "reported by" })} @{r.reporter?.handle || r.reporter?.username || r.reporter_id}</p>
                            {r.post && <p className="text-text-primary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, marginBottom: 3 }}>{r.post.title || r.post.content?.slice(0, 80)}{r.post.is_removed ? " · [removed]" : ""}</p>}
                            {r.comment && <p className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", marginBottom: 3 }}>“{r.comment.content?.slice(0, 100)}”</p>}
                            {r.target_user && <p className="text-text-primary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", marginBottom: 3 }}>@{r.target_user.handle || r.target_user.username}</p>}
                            <p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 8 }}>{i18n.t("community.reason", { defaultValue: "Reason" })}: {r.reason}</p>
                            <div style={{ display: "flex", gap: 8 }}>
                                {r.post_id && !r.post?.is_removed && <button disabled={busy} onClick={() => handleReport(r, "remove")} style={modBtn("rgba(248,113,113,0.14)", "#f87171", "rgba(248,113,113,0.35)")}>{i18n.t("community.removePost", { defaultValue: "Remove post" })}</button>}
                                <button disabled={busy} onClick={() => handleReport(r, "dismiss")} style={modBtn("var(--color-surface-raised)", "var(--color-text-secondary)", "var(--color-border)")}>{i18n.t("community.dismiss", { defaultValue: "Dismiss" })}</button>
                            </div>
                        </div>
                    )))}
                    {tab === "mods" && (
                        <>
                            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                                <input value={newMod} onChange={e => setNewMod(e.target.value)} placeholder={i18n.t("community.addModByUsername", { defaultValue: "Add moderator by username" })} style={modInput} />
                                <button disabled={busy || !newMod.trim()} onClick={handleAddMod} style={modBtn("#2563eb", "#fff", "#2563eb")}>{i18n.t("community.add", { defaultValue: "Add" })}</button>
                            </div>
                            {mods === null ? <p style={ghost}>Loading…</p> : mods.map(m => (
                                <div key={m.user.user_id} style={{ ...modCard, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <div>
                                        <p className="text-text-primary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>@{m.user.handle || m.user.username || m.user.user_id}{m.is_owner ? ` · ${i18n.t("community.owner", { defaultValue: "Owner" })}` : ""}</p>
                                        <p className="text-text-secondary" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{(m.permissions || []).join(", ")}</p>
                                    </div>
                                    {!m.is_owner && canUsers && <button onClick={() => handleRemoveMod(m.user.user_id)} style={modBtn("rgba(248,113,113,0.14)", "#f87171", "rgba(248,113,113,0.35)")}>{i18n.t("common.remove", { defaultValue: "Remove" })}</button>}
                                </div>
                            ))}
                        </>
                    )}
                    {tab === "bans" && (
                        <>
                            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                                <input value={banForm.username} onChange={e => setBanForm(f => ({ ...f, username: e.target.value }))} placeholder={i18n.t("community.banByUsername", { defaultValue: "Ban by username" })} style={modInput} />
                                <button disabled={busy || !banForm.username.trim()} onClick={handleBan} style={modBtn("rgba(248,113,113,0.14)", "#f87171", "rgba(248,113,113,0.35)")}>{i18n.t("community.ban", { defaultValue: "Ban" })}</button>
                            </div>
                            <input value={banForm.reason} onChange={e => setBanForm(f => ({ ...f, reason: e.target.value }))} placeholder={i18n.t("community.banReason", { defaultValue: "Reason (optional)" })} style={{ ...modInput, marginBottom: 14 }} />
                            {bans === null ? <p style={ghost}>Loading…</p> : bans.length === 0 ? <p style={ghost}>{i18n.t("community.noBans", { defaultValue: "No banned users." })}</p> : bans.map(b => (
                                <div key={b.user_id} style={{ ...modCard, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <div>
                                        <p className="text-text-primary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>@{b.user.handle || b.user.username || b.user_id}</p>
                                        {b.reason && <p className="text-text-secondary" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{b.reason}</p>}
                                    </div>
                                    <button onClick={() => handleUnban(b.user_id)} style={modBtn("var(--color-surface-raised)", "var(--color-text-secondary)", "var(--color-border)")}>{i18n.t("community.unban", { defaultValue: "Unban" })}</button>
                                </div>
                            ))}
                        </>
                    )}
                </div>
                <button onClick={onClose} className="bg-surface-raised text-text-secondary" style={{ marginTop: 16, padding: "10px 0", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>{i18n.t("common.close", { defaultValue: "Close" })}</button>
            </div>
        </div>
    );
}
const ghost = { fontSize: 13, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", textAlign: "center", padding: "24px 0" };
const modCard = { background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "12px 14px", marginBottom: 10 };

// Community admin analytics (#269) — stat tiles + activity/growth charts + top posts.
function StatTile({ label, value, sub, accent }) {
    return (
        <div className="bg-surface-raised border border-border" style={{ borderRadius: 10, padding: "12px 14px" }}>
            <p style={{ fontSize: 22, fontWeight: 800, color: accent || "var(--color-text-primary)", fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1, margin: 0 }}>{value}</p>
            <p className="text-text-secondary" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginTop: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
            {sub != null && <p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>{sub}</p>}
        </div>
    );
}

// Daily activity — posts (accent) stacked over comments (muted). 30 points.
function ActivityChart({ series, color }) {
    const W = 620, H = 120, pad = 4;
    const max = Math.max(1, ...series.map(d => d.posts + d.comments));
    const bw = (W - pad * 2) / series.length;
    return (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 120, display: "block" }}>
            {series.map((d, i) => {
                const x = pad + i * bw;
                const ph = (d.posts / max) * (H - 8);
                const ch = (d.comments / max) * (H - 8);
                const bar = Math.max(1.5, bw - 2);
                return (
                    <g key={d.date}>
                        <rect x={x} y={H - ch} width={bar} height={ch} fill="var(--color-text-muted)" rx={1} />
                        <rect x={x} y={H - ch - ph} width={bar} height={ph} fill={color || "#ec4899"} rx={1} />
                    </g>
                );
            })}
        </svg>
    );
}

// Member growth — cumulative line + area. 30 points.
function GrowthChart({ series, color }) {
    const W = 620, H = 120, pad = 4;
    const vals = series.map(d => d.total_members);
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = Math.max(1, max - min);
    const x = (i) => pad + (i * (W - pad * 2)) / Math.max(1, series.length - 1);
    const y = (v) => (H - 8) - ((v - min) / span) * (H - 20) + 6;
    const pts = series.map((d, i) => `${x(i).toFixed(1)},${y(d.total_members).toFixed(1)}`);
    const area = `M${pad},${H} L${pts.join(" L")} L${W - pad},${H} Z`;
    return (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 120, display: "block" }}>
            <path d={area} fill={color || "#ec4899"} fillOpacity={0.12} />
            <polyline points={pts.join(" ")} fill="none" stroke={color || "#ec4899"} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

function ChartCard({ title, legend, children }) {
    return (
        <div style={{ ...modCard, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <p className="text-text-secondary" style={{ fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>{title}</p>
                {legend && <div style={{ display: "flex", gap: 12 }}>{legend.map(l => <span key={l.label} className="text-text-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}><span style={{ width: 9, height: 9, borderRadius: 2, background: l.color }} />{l.label}</span>)}</div>}
            </div>
            {children}
        </div>
    );
}

function AnalyticsView({ data, color }) {
    const o = data?.overview;
    const series = data?.series || [];
    const top = data?.top_posts || [];
    if (!o) return <p style={ghost}>{i18n.t("community.analyticsEmpty", { defaultValue: "No analytics available." })}</p>;
    const t = (k, dv) => i18n.t(k, { defaultValue: dv });
    return (
        <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
                <StatTile label={t("community.members", "Members")} value={o.members.toLocaleString()} sub={`+${o.new_members_30d} ${t("community.last30", "in 30d")}`} accent={color} />
                <StatTile label={t("community.activeUsers", "Active (30d)")} value={o.active_users_30d.toLocaleString()} />
                <StatTile label={t("community.upvoteRate", "Upvote rate")} value={o.upvote_rate == null ? "—" : `${o.upvote_rate}%`} />
                <StatTile label={t("community.posts", "Posts")} value={o.total_posts.toLocaleString()} sub={`+${o.posts_30d} ${t("community.last30", "in 30d")}`} />
                <StatTile label={t("community.comments", "Comments")} value={o.total_comments.toLocaleString()} sub={`+${o.comments_30d} ${t("community.last30", "in 30d")}`} />
                <StatTile label={t("community.avgUpvotes", "Avg upvotes/post")} value={o.avg_upvotes_per_post} sub={`${o.avg_comments_per_post} ${t("community.avgComments", "comments/post")}`} />
            </div>
            <ChartCard title={t("community.activity30", "Activity — last 30 days")} legend={[{ label: t("community.posts", "Posts"), color: color || "#ec4899" }, { label: t("community.comments", "Comments"), color: "var(--color-text-muted)" }]}>
                <ActivityChart series={series} color={color} />
            </ChartCard>
            <ChartCard title={t("community.memberGrowth", "Member growth")}>
                <GrowthChart series={series} color={color} />
            </ChartCard>
            <ChartCard title={t("community.topPosts", "Top posts")}>
                {top.length === 0 ? <p style={{ ...ghost, padding: "8px 0" }}>{t("community.noPosts", "No posts yet.")}</p> : top.map((p, i) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: i ? "1px solid var(--color-border-subtle)" : "none" }}>
                        <span className="text-text-muted" style={{ fontSize: 13, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", width: 16 }}>{i + 1}</span>
                        <p className="text-text-primary" style={{ flex: 1, fontSize: 13, fontFamily: "'DM Sans', sans-serif", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: color || "#ec4899", fontFamily: "'DM Sans', sans-serif", fontWeight: 700 }}><UpvoteGlyph s={12} />{p.upvotes}</span>
                        <span className="text-text-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}><CommentGlyph s={12} />{p.comments}</span>
                    </div>
                ))}
            </ChartCard>
        </div>
    );
}

// Small reusable report modal (reason prompt) used for post/comment/user reports.
function ReportModal({ title, onSubmit, onClose }) {
    const [reason, setReason] = useState("");
    const [busy, setBusy]     = useState(false);
    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 340, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: 24, width: "100%", maxWidth: 400 }}>
                <p className="text-text-primary" style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 14 }}>{title}</p>
                <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder={i18n.t("community.reportReason", { defaultValue: "Why are you reporting this?" })} rows={3} style={{ ...modInput, resize: "none", marginBottom: 14 }} />
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button onClick={onClose} style={modBtn("var(--color-surface-raised)", "var(--color-text-secondary)", "var(--color-border)")}>{i18n.t("common.cancel")}</button>
                    <button disabled={busy || !reason.trim()} onClick={async () => { setBusy(true); try { await onSubmit(reason.trim()); } finally { setBusy(false); } }} style={{ ...modBtn("#2563eb", "#fff", "#2563eb"), opacity: reason.trim() ? 1 : 0.5 }}>{i18n.t("community.submitReport", { defaultValue: "Submit report" })}</button>
                </div>
            </div>
        </div>
    );
}

// Human text for a notification by type.
function notifText(n) {
    const who = n.sender?.handle ? `@${n.sender.handle}` : "Someone";
    switch (n.type) {
        case "community_comment": return `${who} ${i18n.t("community.notifCommented", { defaultValue: "commented on your post" })}`;
        case "community_reply":   return `${who} ${i18n.t("community.notifReplied", { defaultValue: "replied to your comment" })}`;
        case "like":              return `${who} ${i18n.t("community.notifLiked", { defaultValue: "liked your post" })}`;
        case "comment":           return `${who} ${i18n.t("community.notifCommented", { defaultValue: "commented on your post" })}`;
        case "follow":            return `${who} ${i18n.t("community.notifFollowed", { defaultValue: "started following you" })}`;
        case "mention":           return `${who} ${i18n.t("community.notifMentioned", { defaultValue: "mentioned you" })}`;
        default:                  return `${who} · ${n.type}`;
    }
}
const COMMUNITY_NOTIF_TYPES = ["community_comment", "community_reply"];

// Unified inbox — surfaces the user's notifications (replies, mentions, community, …). #266
function InboxPanel({ onOpenPost, onClose, onUnreadChange }) {
    const [tab, setTab]     = useState("all"); // all | unread
    const [items, setItems] = useState(null);
    const [busy, setBusy]   = useState(false);

    useEffect(() => {
        getNotifications().then(res => {
            const list = res?.data ?? [];
            setItems(list);
            onUnreadChange?.(res?.unreadCount ?? list.filter(n => !n.is_read).length);
        }).catch(() => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handleClick(n) {
        if (!n.is_read) {
            markNotificationRead(n.notification_id).catch(() => {});
            setItems(list => list.map(x => x.notification_id === n.notification_id ? { ...x, is_read: true } : x));
            onUnreadChange?.((items || []).filter(x => !x.is_read && x.notification_id !== n.notification_id).length);
        }
        if (COMMUNITY_NOTIF_TYPES.includes(n.type) && n.target_id) { onOpenPost?.(n.target_id); onClose?.(); }
    }
    async function handleMarkAll() {
        setBusy(true);
        try { await markAllNotificationsRead(); setItems(list => (list || []).map(x => ({ ...x, is_read: true }))); onUnreadChange?.(0); }
        catch { /* noop */ } finally { setBusy(false); }
    }

    const shown = (items || []).filter(n => tab === "all" || !n.is_read);
    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 320, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ borderRadius: 18, padding: "22px 24px", width: "100%", maxWidth: 480, maxHeight: "86vh", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <p className="text-text-primary" style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>{i18n.t("community.inbox", { defaultValue: "Inbox" })}</p>
                    <button onClick={handleMarkAll} disabled={busy} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>{i18n.t("community.markAllRead", { defaultValue: "Mark all read" })}</button>
                </div>
                <div className="bg-surface-raised" style={{ display: "flex", gap: 6, marginBottom: 14, borderRadius: 10, padding: 4 }}>
                    {[["all", i18n.t("community.all", { defaultValue: "All" })], ["unread", i18n.t("community.unread", { defaultValue: "Unread" })]].map(([id, label]) => (
                        <button key={id} onClick={() => setTab(id)} className={tab === id ? "text-text-primary" : "text-text-secondary"} style={{ flex: 1, padding: "8px 10px", background: tab === id ? "rgba(37,99,235,0.2)" : "none", border: "none", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{label}</button>
                    ))}
                </div>
                <div style={{ overflowY: "auto", flex: 1 }}>
                    {items === null ? <p style={ghost}>Loading…</p> : shown.length === 0 ? <p style={ghost}>{tab === "unread" ? i18n.t("community.inboxAllCaughtUp", { defaultValue: "You're all caught up." }) : i18n.t("community.inboxEmpty", { defaultValue: "No notifications yet." })}</p> : shown.map(n => (
                        <button key={n.notification_id} onClick={() => handleClick(n)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "11px 12px", marginBottom: 6, borderRadius: 10, background: n.is_read ? "var(--color-surface-raised)" : "rgba(37,99,235,0.1)", border: `1px solid ${n.is_read ? "var(--color-border-subtle)" : "rgba(37,99,235,0.25)"}`, cursor: "pointer" }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: n.sender?.profile_pic_url ? `center/cover no-repeat url(${n.sender.profile_pic_url})` : "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>{!n.sender?.profile_pic_url && (n.sender?.handle?.[0]?.toUpperCase() || "?")}</div>
                            <span className="text-text-primary" style={{ flex: 1, fontSize: 13, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4 }}>{notifText(n)}</span>
                            {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563eb", flexShrink: 0 }} />}
                        </button>
                    ))}
                </div>
                <button onClick={onClose} className="bg-surface-raised text-text-secondary" style={{ marginTop: 14, padding: "10px 0", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>{i18n.t("common.close", { defaultValue: "Close" })}</button>
            </div>
        </div>
    );
}

// Award picker — loads the community's available awards (platform + custom) and grants one.
function AwardPickerModal({ community, onPick, onClose }) {
    const [awards, setAwards] = useState(null);
    const [busy, setBusy]     = useState(false);
    useEffect(() => { getCommunityAwards(community.id).then(r => setAwards(r?.data || [])).catch(() => setAwards([])); }, [community.id]);
    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 340, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: 24, width: "100%", maxWidth: 400 }}>
                <p className="text-text-primary" style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 14 }}>{i18n.t("community.giveAward", { defaultValue: "Give an award" })}</p>
                {awards === null ? <p style={ghost}>Loading…</p> : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        {awards.map(a => (
                            <button key={a.award_id} disabled={busy} onClick={async () => { setBusy(true); try { await onPick(a); } finally { setBusy(false); } }}
                                className="bg-surface-raised text-text-primary" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, border: `1px solid ${a.color}55`, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700 }}>
                                <span style={{ color: a.color }}><AwardIcon icon={a.icon} s={18} /></span>{a.name}
                            </button>
                        ))}
                    </div>
                )}
                <button onClick={onClose} className="bg-surface-raised text-text-secondary" style={{ marginTop: 16, width: "100%", padding: "10px 0", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
            </div>
        </div>
    );
}

// ─── Community Feed ────────────────────────────────────────────────────────────

function CommunityFeedPage({ community: initialCommunity, onBack, initialJoined, onJoinChange, onCommunityUpdate: onCommunityUpdateProp, onCommunityDelete: onCommunityDeleteProp, initialPostId }) {
    const { isMobile } = useViewport();
    const loading = usePageLoad(150);
    const currentUserId = getUser()?.user_id;

    const [community, setCommunity]       = useState(initialCommunity);
    const [allPosts, setAllPosts]         = useState([]);
    const [communityDialog, { notify }]   = useDialog();
    const [selectedPost, setSelectedPost] = useState(null);
    const [votes, setVotes]               = useState({});
    const [voted, setVoted]               = useState({});
    const [savedPosts, setSavedPosts]     = useState({});
    const [shareToast, setShareToast]     = useState(false);
    const [showCompose, setShowCompose]   = useState(false);
    const [composeText, setComposeText]   = useState("");
    const [composeTitle, setComposeTitle] = useState("");
    const [composeFlair, setComposeFlair] = useState("");
    const [composeSpoiler, setComposeSpoiler] = useState(false);
    const [composeNsfw, setComposeNsfw]   = useState(false);
    const [composeMsg, setComposeMsg]     = useState("");
    const [composeLoading, setComposeLoading] = useState(false);
    const [joined, setJoined]             = useState(initialJoined ?? false);
    const [sort, setSort]                 = useState("hot");

    // Edit post (from feed cards)
    const [editingFeedPost, setEditingFeedPost]   = useState(null);
    const [editFeedTitle, setEditFeedTitle]       = useState("");
    const [editFeedBody, setEditFeedBody]         = useState("");
    const [editFeedLoading, setEditFeedLoading]   = useState(false);
    const [showModTools, setShowModTools]         = useState(false);
    const [reportTarget, setReportTarget]         = useState(null); // { type, post_id?, comment_id?, target_user_id?, title }
    const [awardTarget, setAwardTarget]           = useState(null); // { type: "post"|"comment", id }

    // Verify membership (server-side truth)
    useEffect(() => {
        checkMembership(community.id)
            .then(res => setJoined(res.joined))
            .catch(() => {});
    }, [community.id]);

    // Hydrate full community detail (rules, flairs, post settings) — the list payload omits them.
    useEffect(() => {
        getCommunity(community.id)
            .then(raw => {
                const c = raw?.data ?? raw;
                if (!c || raw?.locked) return;
                setCommunity(prev => ({
                    ...prev,
                    desc: c.description ?? prev.desc,
                    rules: c.rules ?? [],
                    flairs: c.flairs ?? [],
                    allowed_post_types: c.allowed_post_types ?? ["text", "link", "image", "poll"],
                    require_flair: !!c.require_flair,
                    banner_url: c.banner_url ?? prev.banner_url,
                    icon_url: c.icon_url ?? prev.icon_url,
                    type: c.type ?? prev.type,
                    nsfw: c.nsfw ?? prev.nsfw,
                    handle: c.handle ?? prev.handle,
                    viewer_is_owner: !!c.viewer_is_owner,
                    viewer_is_mod: !!c.viewer_is_mod,
                    viewer_perms: c.viewer_perms ?? [],
                    open_report_count: c.open_report_count ?? 0,
                }));
            })
            .catch(() => {});
    }, [community.id]);

    useEffect(() => { window.dispatchEvent(new CustomEvent("strug:view-change")); }, [selectedPost]);

    // Keep URL in sync with open/closed post
    useEffect(() => {
        try {
            if (selectedPost) {
                window.history.pushState({ nav: "community", postId: selectedPost.id }, "", `/community/post/${selectedPost.id}`);
            } else {
                const cur = window.location.pathname;
                if (cur.startsWith("/community/post/")) {
                    window.history.pushState({ nav: "community", communityId: community.id }, "", `/community/${community.id}`);
                }
            }
        } catch { /* noop */ }
    }, [selectedPost, community.id]);

    function handleShare(postId) {
        const shareUrl = `${window.location.origin}/community/post/${postId}`;
        navigator.clipboard?.writeText(shareUrl).then(() => {
            setShareToast(true);
            setTimeout(() => setShareToast(false), 2000);
        }).catch(() => {});
    }

    function toggleSave(postId) {
        const isCurrentlySaved = !!savedPosts[postId];
        const next = !isCurrentlySaved;
        setSavedPosts(prev => ({ ...prev, [postId]: next }));
        setAllPosts(prev => prev.map(p => p.id === postId ? { ...p, is_saved: next } : p)); // ← ADD
        toggleSavePost(postId).catch(() => {
            setSavedPosts(prev => ({ ...prev, [postId]: isCurrentlySaved }));
            setAllPosts(prev => prev.map(p => p.id === postId ? { ...p, is_saved: isCurrentlySaved } : p)); // ← ADD rollback
            notify?.({ title: i18n.t("community.errorTitle"), message: i18n.t("community.failedSavePost") });
        });
    }

    // Load posts — and auto-open the deep-linked post once they arrive
    const didOpenInitialPost = useRef(false);
    useEffect(() => {
        getCommunityPosts(community.id)
            .then(data => {
                const items = Array.isArray(data) ? data : (data?.data ?? []);
                const mapped = items.map(p => ({
                    id:        p.community_post_id ?? p.id,
                    title:     p.title ?? p.content?.slice(0, 80) ?? "",
                    body:      p.content ?? "",
                    author:    getHandle(p.author),
                    author_id: p.user_id ?? p.author?.user_id,
                    author_profile_id: p.author?.social_profiles?.[0]?.profile_id ?? null,
                    time:      p.created_at ? new Date(p.created_at).toLocaleDateString() : "",
                    rawTime:   p.created_at ? new Date(p.created_at).getTime() : 0,
                    ups:       p.upvotes ?? 0,
                    comments:  p._count?.comments ?? 0,
                    is_saved:  p.is_saved ?? false,
                    user_vote: p.user_vote ?? 0,
                    flair:     p.flair ? { label: p.flair.label, color: p.flair.color } : null,
                    is_spoiler: !!p.is_spoiler,
                    is_nsfw:    !!p.is_nsfw,
                }));
                setAllPosts(mapped);
                setVotes(Object.fromEntries(mapped.map(p => [p.id, p.ups])));
                setVoted(Object.fromEntries(mapped.map(p => [p.id, p.user_vote])));
                setSavedPosts(Object.fromEntries(mapped.map(p => [p.id, !!p.is_saved])));
                // Auto-open deep-linked post
                if (initialPostId && !didOpenInitialPost.current) {
                    didOpenInitialPost.current = true;
                    const pid = parseInt(initialPostId);
                    const found = mapped.find(p => p.id === pid);
                    if (found) {
                        setSelectedPost(found);
                    } else {
                        // Not in the current page — fetch directly
                        getCommunityPost(pid).then(raw => {
                            const r = raw?.data ?? raw;
                            if (!r) return;
                            setSelectedPost({
                                id:        r.social_post_id ?? r.community_post_id ?? pid,
                                title:     r.title ?? r.caption_text?.slice(0, 80) ?? "",
                                body:      r.content ?? r.caption_text ?? "",
                                author:    getHandle(r.social_profile ?? r.author),
                                time:      r.created_at ? new Date(r.created_at).toLocaleDateString() : "",
                                ups:       r.upvotes ?? 0,
                                comments:  r._count?.social_comments ?? r._count?.comments ?? 0,
                                flair:     null,
                            });
                        }).catch(() => {});
                    }
                }
            })
            .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [community.id]);

    function handleVote(postId, dirVal) {
        const prevVotes = votes[postId] ?? 0;
        const prevVoted = voted[postId] ?? 0;
        if (prevVoted === dirVal) {
            setVoted(v => ({ ...v, [postId]: 0 }));
            setVotes(v => ({ ...v, [postId]: v[postId] - dirVal }));
        } else {
            const delta = prevVoted !== 0 ? dirVal * 2 : dirVal;
            setVoted(v => ({ ...v, [postId]: dirVal }));
            setVotes(v => ({ ...v, [postId]: v[postId] + delta }));
        }
        voteCommunityPost(postId, dirVal).catch(() => {
            setVotes(v => ({ ...v, [postId]: prevVotes }));
            setVoted(v => ({ ...v, [postId]: prevVoted }));
        });
    }

    function handleJoinToggle() {
        const next = !joined;
        setJoined(next);
        onJoinChange?.(community.id, next);
        const fn = next ? joinCommunity : leaveCommunity;
        fn(community.id).catch(() => {
            setJoined(!next);
            onJoinChange?.(community.id, !next);
        });
    }

    async function handleDeleteFeedPost(postId) {
        if (!confirm(i18n.t("community.confirmDeletePost"))) return;
        try {
            await deleteCommunityPost(postId);
            setAllPosts(prev => prev.filter(p => p.id !== postId));
        } catch {
            notify({ title: i18n.t("community.errorTitle"), message: i18n.t("community.failedDeletePost") });
        }
    }

    // Mod actions on a post (remove/restore/lock/unlock/pin/unpin).
    async function handleModeratePost(postId, action) {
        try {
            await moderatePost(postId, action);
            setAllPosts(prev => prev.map(p => p.id === postId ? {
                ...p,
                ...(action === "remove" ? { is_removed: true } : action === "restore" ? { is_removed: false } : {}),
                ...(action === "lock" ? { is_locked: true } : action === "unlock" ? { is_locked: false } : {}),
                ...(action === "pin" ? { is_pinned: true } : action === "unpin" ? { is_pinned: false } : {}),
            } : p));
        } catch (e) {
            notify?.({ title: i18n.t("community.errorTitle"), message: e?.response?.data?.message || "Action failed." });
        }
    }

    async function handleGiveAward(award) {
        if (!awardTarget) return;
        try {
            const res = awardTarget.type === "comment"
                ? await giveCommentAward(awardTarget.id, award.award_id)
                : await givePostAward(awardTarget.id, award.award_id);
            const awards = res?.data || [];
            if (awardTarget.type === "post") {
                setAllPosts(prev => prev.map(p => p.id === awardTarget.id ? { ...p, awards } : p));
                setSelectedPost(prev => prev && prev.id === awardTarget.id ? { ...prev, awards } : prev);
            }
            setAwardTarget(null);
            notify?.({ title: i18n.t("community.awarded", { defaultValue: "Award given" }), message: i18n.t("community.awardGiven", { defaultValue: `You gave the ${award.name} award.` }) });
        } catch (e) {
            notify?.({ title: i18n.t("community.errorTitle"), message: e?.response?.data?.message || "Failed to give award." });
        }
    }

    async function submitReport(reason) {
        if (!reportTarget) return;
        try {
            await reportToCommunity(community.id, { target_type: reportTarget.type, post_id: reportTarget.post_id, comment_id: reportTarget.comment_id, target_user_id: reportTarget.target_user_id, reason });
            setReportTarget(null);
            notify?.({ title: i18n.t("community.reported", { defaultValue: "Reported" }), message: i18n.t("community.reportThanks", { defaultValue: "Thanks — the mods will review this." }) });
        } catch (e) {
            notify?.({ title: i18n.t("community.errorTitle"), message: e?.response?.data?.message || "Report failed." });
        }
    }

    async function handleBlock(userId) {
        try { const r = await blockUser(userId); notify?.({ title: i18n.t("community.done", { defaultValue: "Done" }), message: r?.action === "blocked" ? i18n.t("community.userBlocked", { defaultValue: "User blocked." }) : i18n.t("community.userUnblocked", { defaultValue: "User unblocked." }) }); }
        catch (e) { notify?.({ title: i18n.t("community.errorTitle"), message: e?.response?.data?.message || "Failed." }); }
    }
    async function handleMute(userId) {
        try { const r = await muteUser(userId); notify?.({ title: i18n.t("community.done", { defaultValue: "Done" }), message: r?.action === "muted" ? i18n.t("community.userMuted", { defaultValue: "User muted." }) : i18n.t("community.userUnmuted", { defaultValue: "User unmuted." }) }); }
        catch (e) { notify?.({ title: i18n.t("community.errorTitle"), message: e?.response?.data?.message || "Failed." }); }
    }

    async function handleSaveEditFeedPost() {
        setEditFeedLoading(true);
        try {
            await updateCommunityPost(editingFeedPost.id, { title: editFeedTitle.trim(), content: editFeedBody.trim() });
            setAllPosts(prev => prev.map(p => p.id === editingFeedPost.id ? { ...p, title: editFeedTitle.trim(), body: editFeedBody.trim() } : p));
            setEditingFeedPost(null);
        } catch {
            notify({ title: i18n.t("community.errorTitle"), message: i18n.t("community.failedUpdatePost") });
        }
        setEditFeedLoading(false);
    }

    async function handleCommunityPost() {
        if (!composeText.trim()) return;
        if (community.require_flair && !composeFlair) { setComposeMsg(i18n.t("community.flairRequired", { defaultValue: "This community requires a tag on every post." })); return; }
        setComposeLoading(true); setComposeMsg("");
        try {
            const res = await createCommunityPost({
                caption_text: composeText.trim(),
                title:        composeTitle.trim() || null,
                community_id: community.id,
                flair_id:     composeFlair || undefined,
                is_spoiler:   composeSpoiler,
                is_nsfw:      composeNsfw,
            });
            const p = res?.data;
            const pickedFlair = (community.flairs || []).find(f => String(f.flair_id) === String(composeFlair));
            const newPost = {
                id:        p?.community_post_id ?? p?.id ?? Date.now(),
                title:     composeTitle.trim() || composeText.trim().slice(0, 80),
                body:      composeText.trim(),
                author:    "you",
                author_id: currentUserId,
                time:      "now",
                rawTime:   Date.now(),
                ups:       0,
                comments:  0,
                user_vote: 0,
                flair:     p?.flair ? { label: p.flair.label, color: p.flair.color } : (pickedFlair ? { label: pickedFlair.label, color: pickedFlair.color } : null),
                is_spoiler: composeSpoiler,
                is_nsfw:    composeNsfw,
            };
            setAllPosts(prev => [newPost, ...prev]);
            setVotes(v => ({ ...v, [newPost.id]: 0 }));
            setVoted(v => ({ ...v, [newPost.id]: 0 }));
            setComposeText(""); setComposeTitle(""); setComposeFlair(""); setComposeSpoiler(false); setComposeNsfw(false); setShowCompose(false);
        } catch (err) {
            setComposeMsg(err?.response?.data?.message || "");
            notify({ title: i18n.t("community.cantPost"), message: err?.response?.data?.message || i18n.t("community.postProfileRequired") });
        } finally { setComposeLoading(false); }
    }

    // Handlers passed down from CommunityPage
    function handleCommunityUpdate(updated) {
        setCommunity(updated);
        onCommunityUpdateProp?.(updated);
    }
    function handleCommunityDelete() {
        onCommunityDeleteProp?.();
    }

    const sortedPosts = sort === "saved"
        ? allPosts.filter(p => !!savedPosts[p.id])
        : sortPosts(allPosts, sort);

    if (loading) return (
        <>
            {communityDialog}
            <div style={{ flex: 1, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
                <div style={{ maxWidth: 860, margin: "0 auto", paddingTop: 28 }}>
                    <Skel w={140} h={16} r={6} style={{ marginBottom: 20 }} />
                    <div style={{ display: "flex", gap: 16, marginBottom: 24 }}><Skel w={52} h={52} r={26} /><div><Skel w={180} h={24} r={6} style={{ marginBottom: 6 }} /><Skel w={220} h={14} r={6} /></div></div>
                    {[...Array(4)].map((_, i) => <SkeletonListRow key={i} />)}
                </div>
            </div>
        </>
    );

    return (
        <>
            {communityDialog}

            {/* ── Post detail view ── */}
            {selectedPost && (
                <PostDetailPage
                    post={selectedPost}
                    community={community}
                    joined={joined}
                    onJoin={handleJoinToggle}
                    onBack={() => setSelectedPost(null)}
                    onCompose={() => { setSelectedPost(null); setShowCompose(true); }}
                    notify={notify}
                    onPostDeleted={(postId) => { setAllPosts(prev => prev.filter(p => p.id !== postId)); setSelectedPost(null); }}
                    onPostUpdated={(postId, updates) => {
                        setAllPosts(prev => prev.map(p => p.id === postId ? { ...p, ...updates } : p));
                        if ("is_saved" in updates) { 
                            setSavedPosts(prev => ({ ...prev, [postId]: !!updates.is_saved }));
                        }
                    }}
                    onCommunityUpdate={handleCommunityUpdate}
                    onCommunityDelete={handleCommunityDelete}
                    onAward={(postId) => setAwardTarget({ type: "post", id: postId })}
                />
            )}

            {/* ── Feed view ── */}
            {!selectedPost && (
                <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
                    <div style={{ maxWidth: 860, margin: "0 auto", width: "100%", paddingTop: 28, paddingBottom: 24, display: "flex", gap: 24 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "6px 8px", marginLeft: -8 }}>{i18n.t("community.allCommunities")}</button>

                            {/* Community header */}
                            <div className="border border-border-subtle" style={{ background: `linear-gradient(135deg, ${community.color}18 0%, transparent 80%)`, borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
                                {community.banner_url && (
                                    <div style={{ height: 120, background: `center/cover no-repeat url(${community.banner_url})` }} />
                                )}
                                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "16px 20px" }}>
                                    {/* Icon ring border is hardcoded dark only when overlapping the banner photo
                                        (arbitrary user-uploaded image) so the cutout reads regardless of theme. */}
                                    <div style={{ width: 48, height: 48, borderRadius: "50%", background: community.icon_url ? `center/cover no-repeat url(${community.icon_url})` : community.color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, color: "#fff", flexShrink: 0, ...(community.banner_url ? { marginTop: -40, border: "3px solid #0d1421" } : {}) }}>{!community.icon_url && community.icon}</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                            <h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "0.03em", marginBottom: 2 }}>{community.name}</h2>
                                            <CommunityBadge type={community.type} nsfw={community.nsfw} accent={community.color} size="md" />
                                        </div>
                                        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
                                            {community.handle ? `s/${community.handle} · ` : ""}{(community.members || 0).toLocaleString()} {i18n.t("community.members")}
                                        </p>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                                        {community.viewer_is_mod && (
                                            <button onClick={() => setShowModTools(true)} title={i18n.t("community.modTools", { defaultValue: "Mod tools" })} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 20, padding: "7px 12px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: "#60a5fa", cursor: "pointer" }}>
                                                <ShieldGlyph s={14} />{i18n.t("community.mod", { defaultValue: "Mod" })}
                                                {community.open_report_count > 0 && <span style={{ position: "absolute", top: -6, right: -6, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 8, background: "#f87171", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{community.open_report_count}</span>}
                                            </button>
                                        )}
                                        <button onClick={() => setShowCompose(true)} style={{ background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 20, padding: "7px 14px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: "#60a5fa", cursor: "pointer" }}>{i18n.t("community.postButton")}</button>
                                        <button onClick={handleJoinToggle} style={{ background: joined ? "rgba(5,150,105,0.1)" : community.color, border: joined ? "1px solid rgba(5,150,105,0.3)" : "none", borderRadius: 20, padding: "7px 14px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: joined ? "#22c55e" : "#fff", cursor: "pointer", transition: "all 0.15s" }}>{joined ? i18n.t("community.joined") : i18n.t("community.join")}</button>
                                    </div>
                                </div>
                            </div>

                            {/* Sort tabs */}
                            <div className="bg-surface-raised border border-border-subtle" style={{ display: "flex", marginBottom: 16, borderRadius: 12, overflow: "hidden" }}>
                                {SORT_TABS.map(t => (
                                    <button key={t.id} onClick={() => setSort(t.id)} className={sort === t.id ? "text-text-primary" : "text-text-secondary"} style={{ flex: 1, padding: "9px 12px", background: sort === t.id ? "var(--color-surface-raised)" : "none", border: "none", borderRight: "1px solid var(--color-border-subtle)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: sort === t.id ? 700 : 500, cursor: "pointer", transition: "all 0.15s" }}>{t.label}</button>
                                ))}
                            </div>

                            {/* Compose modal */}
                            {showCompose && (
                                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowCompose(false)}>
                                    <div onClick={e => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ borderRadius: 18, padding: 28, width: "min(540px,90vw)" }}>
                                        <h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, marginBottom: 16, letterSpacing: "0.03em", textTransform: "uppercase" }}>{i18n.t("community.postTo")} {community.name}</h3>
                                        <input value={composeTitle} onChange={e => setComposeTitle(e.target.value)} placeholder={i18n.t("community.titleOptional")} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 10, padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 10, caretColor: "#2563eb" }} />
                                        <textarea value={composeText} onChange={e => setComposeText(e.target.value)} placeholder={i18n.t("community.whatsOnMind")} rows={5} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 12, padding: 14, fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 14, caretColor: "#2563eb" }} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "var(--color-border)"} />

                                        {/* Flair picker — shown when the community has flairs (required if community.require_flair) */}
                                        {(community.flairs || []).length > 0 && (
                                            <div style={{ marginBottom: 12 }}>
                                                <p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{i18n.t("community.flair", { defaultValue: "Tag" })}{community.require_flair ? " *" : ""}</p>
                                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                                    {community.flairs.map(f => {
                                                        const active = String(composeFlair) === String(f.flair_id);
                                                        return (
                                                            <button key={f.flair_id} onClick={() => setComposeFlair(active ? "" : f.flair_id)} style={{ padding: "4px 11px", borderRadius: 20, fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", color: active ? "#fff" : f.color, background: active ? f.color : `${f.color}1f`, border: `1px solid ${f.color}${active ? "" : "55"}` }}>{f.label}</button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Spoiler / NSFW tags */}
                                        <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
                                            <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
                                                <input type="checkbox" checked={composeSpoiler} onChange={e => setComposeSpoiler(e.target.checked)} style={{ accentColor: "#f59e0b" }} />
                                                <span style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("community.spoiler", { defaultValue: "Spoiler" })}</span>
                                            </label>
                                            <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
                                                <input type="checkbox" checked={composeNsfw} onChange={e => setComposeNsfw(e.target.checked)} style={{ accentColor: "#f87171" }} />
                                                <span style={{ fontSize: 12, fontWeight: 800, color: "#f87171", fontFamily: "'DM Sans', sans-serif" }}>NSFW</span>
                                            </label>
                                        </div>
                                        {composeMsg && <p style={{ color: "#f87171", fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}>{composeMsg}</p>}
                                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                                            <button onClick={() => setShowCompose(false)} className="border border-border text-text-secondary" style={{ padding: "9px 18px", background: "none", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
                                            <button onClick={handleCommunityPost} disabled={composeLoading || !composeText.trim()} style={{ padding: "9px 22px", background: "#2563eb", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: (composeLoading || !composeText.trim()) ? 0.6 : 1 }}>{composeLoading ? i18n.t("community.posting") : i18n.t("social.post")}</button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Mod tools panel */}
                            {showModTools && community.viewer_is_mod && (
                                <ModToolsPanel community={community} notify={notify} onClose={() => setShowModTools(false)} onModerated={(postId, patch) => setAllPosts(prev => prev.map(p => p.id === postId ? { ...p, ...patch } : p))} />
                            )}

                            {/* Report modal */}
                            {reportTarget && (
                                <ReportModal
                                    title={reportTarget.type === "post" ? i18n.t("community.reportPost", { defaultValue: "Report post" }) : i18n.t("community.report", { defaultValue: "Report" })}
                                    onSubmit={submitReport}
                                    onClose={() => setReportTarget(null)}
                                />
                            )}

                            {/* Award picker */}
                            {awardTarget && (
                                <AwardPickerModal community={community} onPick={handleGiveAward} onClose={() => setAwardTarget(null)} />
                            )}

                            {/* Edit post modal (from feed card) */}
                            {editingFeedPost && (
                                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setEditingFeedPost(null)}>
                                    <div onClick={e => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ borderRadius: 18, padding: 28, width: "min(540px,90vw)" }}>
                                        <h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, marginBottom: 16, letterSpacing: "0.03em", textTransform: "uppercase" }}>{i18n.t("feed.editPost")}</h3>
                                        <input value={editFeedTitle} onChange={e => setEditFeedTitle(e.target.value)} placeholder={i18n.t("community.titleOptional")} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 10, padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 10, caretColor: "#2563eb" }} />
                                        <textarea value={editFeedBody} onChange={e => setEditFeedBody(e.target.value)} rows={5} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 12, padding: 14, fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 16, caretColor: "#2563eb" }} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
                                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                                            <button onClick={() => setEditingFeedPost(null)} className="border border-border text-text-secondary" style={{ padding: "9px 18px", background: "none", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
                                            <button onClick={handleSaveEditFeedPost} disabled={editFeedLoading || !editFeedBody.trim()} style={{ padding: "9px 22px", background: "#2563eb", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: (editFeedLoading || !editFeedBody.trim()) ? 0.6 : 1 }}>{editFeedLoading ? i18n.t("account.saving") : i18n.t("common.save")}</button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Posts list */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {sortedPosts.length === 0 && !loading && (
                                    <div style={{ textAlign: "center", padding: "48px 0" }}>
                                        <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 12 }}>
                                            {sort === "saved" ? i18n.t("community.noSavedPosts") : i18n.t("social.noPostsYet")}
                                        </p>
                                        <button onClick={() => setShowCompose(true)} style={{ background: "#2563eb", border: "none", borderRadius: 20, padding: "9px 22px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>{i18n.t("community.beFirstToPost")}</button>
                                    </div>
                                )}
                                {sortedPosts.map((post, i) => {
                                    const v      = votes[post.id] ?? post.ups;
                                    const vState = voted[post.id] ?? 0;
                                    const isAuthor = !!post.author_id && post.author_id === currentUserId;
                                    return (
                                        <div
                                            key={post.id}
                                            className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: 16, cursor: "pointer", transition: "all 0.15s", animation: `fadeUp 0.3s ease ${i * 35}ms both` }}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.background = "var(--color-surface-raised)"; }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--color-border-subtle)"; e.currentTarget.style.background = "var(--color-surface)"; }}
                                        >
                                            <div style={{ display: "flex", gap: 12 }}>
                                                {/* Vote column */}
                                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 32 }}>
                                                    <button onClick={e => { e.stopPropagation(); handleVote(post.id, 1); }} style={{ background: vState === 1 ? "rgba(245,158,11,0.15)" : "none", border: "none", cursor: "pointer", color: vState === 1 ? "#f59e0b" : "var(--color-text-muted)", padding: "8px 9px", fontSize: 14, borderRadius: 5, transition: "all 0.12s" }}>▲</button>
                                                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: vState === 1 ? "#f59e0b" : vState === -1 ? "#dc2626" : "var(--color-text-secondary)" }}>{v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}</span>
                                                    <button onClick={e => { e.stopPropagation(); handleVote(post.id, -1); }} style={{ background: vState === -1 ? "rgba(220,38,38,0.12)" : "none", border: "none", cursor: "pointer", color: vState === -1 ? "#dc2626" : "var(--color-text-muted)", padding: "8px 9px", fontSize: 14, borderRadius: 5, transition: "all 0.12s" }}>▼</button>
                                                </div>

                                                {/* Post body */}
                                                <div style={{ flex: 1, minWidth: 0 }} onClick={() => setSelectedPost(post)}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                                                        {((community.pinned_post_ids || []).includes(post.id) || post.is_pinned) && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: community.color, fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 700 }}><PinGlyph s={12} />{i18n.t("community.pinned", { defaultValue: "Pinned" })}</span>}
                                                        {post.flair && <span style={{ background: `${post.flair.color}1f`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: post.flair.color }}>{post.flair.label}</span>}
                                                        {post.is_removed && <span style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.4)", borderRadius: 4, padding: "1px 7px", fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 800, color: "#f87171", letterSpacing: "0.04em" }}>{i18n.t("community.removedTag", { defaultValue: "REMOVED" })}</span>}
                                                        {post.is_locked && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "#f59e0b", fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 800 }}><LockGlyph s={11} />{i18n.t("community.locked", { defaultValue: "LOCKED" })}</span>}
                                                        {post.is_spoiler && <span style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 4, padding: "1px 7px", fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 800, color: "#f59e0b", letterSpacing: "0.04em" }}>{i18n.t("community.spoiler", { defaultValue: "SPOILER" }).toUpperCase()}</span>}
                                                        {post.is_nsfw && <span style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.4)", borderRadius: 4, padding: "1px 7px", fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 800, color: "#f87171", letterSpacing: "0.04em" }}>NSFW</span>}
                                                        <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>@{post.author} · {post.time}</span>
                                                        <AwardChips awards={post.awards} />
                                                    </div>
                                                    <h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 17, letterSpacing: "0.02em", marginBottom: 6, lineHeight: 1.2 }}><span onClick={(e) => { e.stopPropagation(); setSelectedPost(post); }} {...clickableProps(() => setSelectedPost(post))} aria-label={`View post: ${post.title}`} style={{ cursor: "pointer" }}>{post.title}</span></h3>
                                                    <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginBottom: 10, filter: (post.is_spoiler || post.is_nsfw) ? "blur(5px)" : "none" }}>{post.body}</p>
                                                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                                                        <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                                                            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                                                            {post.comments} {i18n.t("community.comments")}
                                                        </span>
                                                        <button onClick={e => { e.stopPropagation(); handleShare(post.id); }} className="text-text-muted" style={{ background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer", padding: "7px 8px", margin: "0 -4px" }}>{i18n.t("community.share")}</button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleSave(post.id);
                                                            }}
                                                            style={{
                                                                background: "none",
                                                                border: "none",
                                                                fontFamily: "'DM Sans', sans-serif",
                                                                fontSize: 13,
                                                                color: savedPosts[post.id] ? "#2563eb" : "var(--color-text-secondary)",
                                                                cursor: "pointer",
                                                                padding: "7px 6px",
                                                                margin: "0 -4px",
                                                                display: "flex",
                                                                alignItems: "center",
                                                                gap: 5,
                                                            }}
                                                        >
                                                            <svg
                                                                width="13" height="13" viewBox="0 0 24 24"
                                                                fill={savedPosts[post.id] ? "#2563eb" : "none"}
                                                                stroke="currentColor"
                                                                strokeWidth="2"
                                                            >
                                                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                                                            </svg>
                                                            {savedPosts[post.id] ? i18n.t("community.saved") : i18n.t("community.save")}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Three-dot menu: author edit/delete, mod actions, report + block/mute */}
                                                {(() => {
                                                    const isMod = community.viewer_is_mod;
                                                    const isPinned = (community.pinned_post_ids || []).includes(post.id) || post.is_pinned;
                                                    const items = [];
                                                    if (isAuthor) {
                                                        items.push({ icon: <EditGlyph s={15} />, label: i18n.t("feed.editPost"), onClick: () => { setEditFeedTitle(post.title); setEditFeedBody(post.body); setEditingFeedPost(post); } });
                                                        items.push({ icon: <TrashGlyph s={15} />, label: i18n.t("common.delete"), danger: true, onClick: () => handleDeleteFeedPost(post.id) });
                                                    }
                                                    if (isMod) {
                                                        items.push({ icon: <FlagGlyph s={15} />, label: post.is_removed ? i18n.t("community.restore", { defaultValue: "Restore" }) : i18n.t("community.removePost", { defaultValue: "Remove" }), onClick: () => handleModeratePost(post.id, post.is_removed ? "restore" : "remove") });
                                                        items.push({ icon: <LockGlyph s={15} />, label: post.is_locked ? i18n.t("community.unlock", { defaultValue: "Unlock" }) : i18n.t("community.lock", { defaultValue: "Lock" }), onClick: () => handleModeratePost(post.id, post.is_locked ? "unlock" : "lock") });
                                                        items.push({ icon: <PinGlyph s={15} />, label: isPinned ? i18n.t("community.unpin", { defaultValue: "Unpin" }) : i18n.t("community.pin", { defaultValue: "Pin" }), onClick: () => handleModeratePost(post.id, isPinned ? "unpin" : "pin") });
                                                    }
                                                    if (!isAuthor) {
                                                        items.push({ icon: <StarGlyph s={15} />, label: i18n.t("community.giveAward", { defaultValue: "Give award" }), onClick: () => setAwardTarget({ type: "post", id: post.id }) });
                                                        items.push({ icon: <FlagGlyph s={15} />, label: i18n.t("community.report", { defaultValue: "Report" }), onClick: () => setReportTarget({ type: "post", post_id: post.id, title: post.title }) });
                                                        if (post.author_profile_id) {
                                                            items.push({ icon: <BanGlyph s={15} />, label: i18n.t("community.blockUser", { defaultValue: "Block user" }), onClick: () => handleBlock(post.author_profile_id) });
                                                            items.push({ icon: <MuteGlyph s={15} />, label: i18n.t("community.muteUser", { defaultValue: "Mute user" }), onClick: () => handleMute(post.author_profile_id) });
                                                        }
                                                    }
                                                    if (!items.length) return null;
                                                    return (
                                                    <div style={{ alignSelf: "flex-start", paddingTop: 2 }}>
                                                        <ThreeDotMenu items={items} />
                                                    </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {!isMobile && (
                            <CommunitySidebar
                                community={community}
                                onCreatePost={() => setShowCompose(true)}
                                joined={joined}
                                onJoin={handleJoinToggle}
                                onBack={onBack}
                                notify={notify}
                                onCommunityUpdate={handleCommunityUpdate}
                                onCommunityDelete={handleCommunityDelete}
                            />
                        )}
                    </div>
                </div>
            )}

            {shareToast && (
                <div className="bg-surface-raised border border-border text-text-primary" style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", borderRadius: 12, padding: "12px 24px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, zIndex: 90, display: "flex", alignItems: "center", gap: 8, animation: "fadeUp 0.2s ease both" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {i18n.t("community.linkCopied")}
                </div>
            )}
        </>
    );
}


// ─── Community List ────────────────────────────────────────────────────────────

function CommunityPage({ initialCommunityId, initialCommunityPostId, initialCommunityHandle } = {}) {
    const { isMobile } = useViewport();
    const { t, landingTitle, searchPlaceholder } = usePageI18n("community");
    const loading = usePageLoad();
    const [activeCommunity, setActiveCommunity] = useState(null);
    const [communities, setCommunities]         = useState(SEED_COMMUNITIES);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createForm, setCreateForm]           = useState({ name: "", description: "", category: "General", handle: "", type: "public", nsfw: false });
    const [createLoading, setCreateLoading]     = useState(false);
    const [createMsg, setCreateMsg]             = useState("");
    const [joinedIds, setJoinedIds]             = useState(new Set());
    const [searchQ, setSearchQ]                 = useState("");
    const [landingTab, setLandingTab]           = useState("home"); // home | popular | all | communities
    const [feedSort, setFeedSort]               = useState("hot");
    const [feedPosts, setFeedPosts]             = useState(null);
    const [feedLoading, setFeedLoading]         = useState(false);
    const [pendingPostId, setPendingPostId]     = useState(null);
    const [showInbox, setShowInbox]             = useState(false);
    const [inboxUnread, setInboxUnread]         = useState(0);

    // Unread notification count for the inbox badge.
    useEffect(() => {
        getNotifications().then(res => setInboxUnread(res?.unreadCount ?? (res?.data || []).filter(n => !n.is_read).length)).catch(() => {});
    }, []);

    // Open a community post from a notification (resolve its community, then open at the post).
    async function openNotifPost(postId) {
        try {
            const raw = await getCommunityPost(postId);
            const post = raw?.data ?? raw;
            const cid = post?.community_id;
            if (!cid) return;
            const craw = await getCommunity(cid);
            const c = craw?.data ?? craw;
            if (!c) return;
            openCommunity({ id: c.community_id, name: c.name, desc: c.description || "", members: c.members ?? 0, color: c.color || "#2563eb", icon: c.icon || (c.name?.[0] || "C").toUpperCase(), icon_url: c.icon_url || null, handle: c.handle, creator_id: c.created_by }, postId);
        } catch { /* noop */ }
    }

    useEffect(() => { window.dispatchEvent(new CustomEvent("strug:view-change")); }, [activeCommunity]);

    // Load the cross-community feed when a feed tab / sort changes (#265).
    useEffect(() => {
        if (activeCommunity || landingTab === "communities") return;
        let cancelled = false;
        setFeedLoading(true);
        getCommunityFeed(landingTab, feedSort)
            .then(res => { if (!cancelled) setFeedPosts(res?.data ?? []); })
            .catch(() => { if (!cancelled) setFeedPosts([]); })
            .finally(() => { if (!cancelled) setFeedLoading(false); });
        return () => { cancelled = true; };
    }, [landingTab, feedSort, activeCommunity]);

    // Open a community (from a card or a feed post), optionally at a specific post.
    function openCommunity(c, postId = null) {
        setPendingPostId(postId);
        setActiveCommunity(c);
        try {
            const path = postId ? `/community/post/${postId}` : `/community/${c.id}`;
            window.history.pushState({ nav: "community", communityId: c.id, postId }, "", path);
        } catch { /* noop */ }
    }

    /* Popstate: browser back from /community/:id → close community */
    useEffect(() => {
        const handler = () => {
            if (!/^\/community\//.test(window.location.pathname)) setActiveCommunity(null);
        };
        window.addEventListener('popstate', handler);
        return () => window.removeEventListener('popstate', handler);
    }, []);

    // Fetch communities — backend now returns is_member for logged-in users
    const didDeepLink = useRef(false);
    useEffect(() => {
        getCommunities()
            .then(data => {
                const items = Array.isArray(data) ? data : (data?.data ?? []);
                if (items.length === 0) return;
                const mapped = items.map(c => ({
                    id:         c.community_id,
                    name:       c.name,
                    desc:       c.description || "",
                    members:    c.members ?? c._count?.members ?? 0,
                    color:      c.color   || "#2563eb",
                    icon:       c.icon    || c.name[0].toUpperCase(),
                    creator_id: c.created_by,
                    handle:     c.handle,
                    type:       c.type || "public",
                    nsfw:       !!c.nsfw,
                    banner_url: c.banner_url || null,
                    icon_url:   c.icon_url || null,
                }));
                setCommunities(mapped);
                // Populate join state from server
                setJoinedIds(new Set(items.filter(c => c.is_member).map(c => c.community_id)));
                // Handle deep link — open specific community or look up community for a post
                if (didDeepLink.current) return;
                if (initialCommunityHandle) {
                    didDeepLink.current = true;
                    const found = mapped.find(c => c.handle && c.handle.toLowerCase() === String(initialCommunityHandle).toLowerCase());
                    if (found) { setActiveCommunity(found); return; }
                    getCommunityByHandle(initialCommunityHandle).then(raw => {
                        const c = raw?.data ?? raw;
                        if (!c) return;
                        setActiveCommunity({ id: c.community_id, name: c.name, desc: c.description || "", members: c.members ?? 0, color: c.color || "#2563eb", icon: c.icon || (c.name?.[0] || "C").toUpperCase(), creator_id: c.created_by, handle: c.handle, type: c.type || "public", nsfw: !!c.nsfw, banner_url: c.banner_url || null, icon_url: c.icon_url || null });
                    }).catch(() => {});
                } else if (initialCommunityId) {
                    didDeepLink.current = true;
                    const found = mapped.find(c => String(c.id) === String(initialCommunityId));
                    if (found) { setActiveCommunity(found); return; }
                    // Not in list — fetch directly
                    getCommunity(initialCommunityId).then(raw => {
                        const c = raw?.data ?? raw;
                        if (!c) return;
                        setActiveCommunity({ id: c.community_id, name: c.name, desc: c.description || "", members: c.members ?? 0, color: c.color || "#2563eb", icon: c.icon || c.name[0].toUpperCase(), creator_id: c.created_by, handle: c.handle, type: c.type || "public", nsfw: !!c.nsfw, banner_url: c.banner_url || null, icon_url: c.icon_url || null });
                    }).catch(() => {});
                } else if (initialCommunityPostId) {
                    didDeepLink.current = true;
                    // Fetch the post to discover its community_id, then open that community
                    getCommunityPost(parseInt(initialCommunityPostId)).then(raw => {
                        const post = raw?.data ?? raw;
                        if (!post?.community_id) return;
                        const cid = post.community_id;
                        const found = mapped.find(c => String(c.id) === String(cid));
                        if (found) { setActiveCommunity(found); return; }
                        // Not in the loaded list — fetch it so creator_id is populated (else owner can't delete)
                        getCommunity(cid).then(raw2 => {
                            const c2 = raw2?.data ?? raw2;
                            setActiveCommunity(c2
                                ? { id: c2.community_id, name: c2.name, desc: c2.description || "", members: c2.members ?? 0, color: c2.color || "#2563eb", icon: c2.icon || (c2.name?.[0] || "C").toUpperCase(), creator_id: c2.created_by, handle: c2.handle, type: c2.type || "public", nsfw: !!c2.nsfw, banner_url: c2.banner_url || null, icon_url: c2.icon_url || null }
                                : { id: cid, name: `Community`, desc: "", members: 0, color: "#2563eb", icon: "C", creator_id: null });
                        }).catch(() => setActiveCommunity({ id: cid, name: `Community`, desc: "", members: 0, color: "#2563eb", icon: "C", creator_id: null }));
                    }).catch(() => {});
                }
            })
            .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function handleJoinChange(id, isJoined) {
        setJoinedIds(prev => {
            const n = new Set(prev);
            isJoined ? n.add(id) : n.delete(id);
            return n;
        });
    }

    function handleCommunityUpdate(updated) {
        setCommunities(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
        setActiveCommunity(updated);
    }

    function handleCommunityDelete() {
        if (activeCommunity) {
            setCommunities(prev => prev.filter(c => c.id !== activeCommunity.id));
            setJoinedIds(prev => { const n = new Set(prev); n.delete(activeCommunity.id); return n; });
        }
        setActiveCommunity(null);
    }

    async function handleCreateCommunity() {
        if (!createForm.name.trim()) { setCreateMsg("Community name is required."); return; }
        setCreateLoading(true); setCreateMsg("");
        try {
            const res = await createCommunity({
                name: createForm.name, description: createForm.description, category: createForm.category,
                handle: createForm.handle || undefined, type: createForm.type, nsfw: createForm.nsfw,
            });
            const c   = res?.data ?? res;
            const newC = {
                id:         c.community_id ?? `c${Date.now()}`,
                name:       c.name ?? createForm.name,
                desc:       c.description ?? createForm.description,
                members:    1,
                color:      c.color || "#2563eb",
                icon:       c.icon  || createForm.name[0].toUpperCase(),
                creator_id: c.created_by ?? c.creator_id,
                handle:     c.handle,
                type:       c.type || createForm.type,
                nsfw:       c.nsfw ?? createForm.nsfw,
                banner_url: c.banner_url || null,
                icon_url:   c.icon_url || null,
            };
            setCommunities(prev => [newC, ...prev]);
            setJoinedIds(prev => new Set([...prev, newC.id]));
            setShowCreateModal(false);
            setActiveCommunity(newC);
        } catch (e) {
            setCreateMsg(e?.response?.data?.message ?? i18n.t("community.failedCreateCommunity"));
        }
        setCreateLoading(false);
    }
    if (activeCommunity) return (
        <CommunityFeedPage
            community={activeCommunity}
            onBack={() => {
                setActiveCommunity(null);
                try { window.history.pushState({ nav: "community" }, "", "/community"); } catch { /* noop */ }
            }}
            initialJoined={joinedIds.has(activeCommunity.id)}
            onJoinChange={handleJoinChange}
            onCommunityUpdate={handleCommunityUpdate}
            onCommunityDelete={handleCommunityDelete}
            initialPostId={initialCommunityPostId || pendingPostId}
        />
    );

    const filtered = searchQ.trim()
        ? communities.filter(c => c.name.toLowerCase().includes(searchQ.toLowerCase()) || c.desc.toLowerCase().includes(searchQ.toLowerCase()))
        : communities;

    return (<>
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
            <div style={{ maxWidth: 1060, margin: "0 auto", width: "100%" }}>
                <div style={{ paddingTop: 28, paddingBottom: 8 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 16, textAlign: "center" }}>
                        <h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, letterSpacing: "0.03em", marginBottom: 0 }}>{landingTitle}</h2>
                        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>{t("community.landingDesc")}</p>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <button onClick={() => { setCreateForm({ name: "", description: "", category: "General", handle: "", type: "public", nsfw: false }); setCreateMsg(""); setShowCreateModal(true); }} style={{ background: "#2563eb", border: "none", borderRadius: 20, padding: "9px 22px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>{t("community.createCommunity")}</button>
                            <SpacesLauncher />
                            <button onClick={() => setShowInbox(true)} title={t("community.inbox", { defaultValue: "Inbox" })} className="bg-surface-raised border border-border text-text-secondary" style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 20, padding: "9px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
                                {t("community.inbox", { defaultValue: "Inbox" })}
                                {inboxUnread > 0 && <span style={{ position: "absolute", top: -5, right: -5, minWidth: 17, height: 17, padding: "0 4px", borderRadius: 9, background: "#f87171", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{inboxUnread > 99 ? "99+" : inboxUnread}</span>}
                            </button>
                        </div>
                    </div>
                    <div className="bg-surface-raised border border-border" style={{ borderRadius: 20, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", marginBottom: 16, touchAction: "manipulation" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 16, caretColor: "#2563eb" }} />
                    </div>

                    {/* Feed vs Communities tabs (#265) */}
                    <div style={{ display: "flex", gap: 6, marginBottom: searchQ.trim() ? 24 : 16, overflowX: "auto" }}>
                        {[["home", t("community.tabHome", { defaultValue: "Home" })], ["popular", t("community.tabPopular", { defaultValue: "Popular" })], ["all", t("community.tabAll", { defaultValue: "All" })], ["communities", t("community.tabCommunities", { defaultValue: "Communities" })]].map(([id, label]) => (
                            <button key={id} onClick={() => setLandingTab(id)} className={landingTab === id ? "text-text-primary" : "text-text-secondary"} style={{ padding: "8px 16px", borderRadius: 20, border: "1px solid " + (landingTab === id ? "rgba(37,99,235,0.5)" : "var(--color-border)"), background: landingTab === id ? "rgba(37,99,235,0.18)" : "var(--color-surface-raised)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>{label}</button>
                        ))}
                    </div>

                    {/* Sort tabs — only for feed tabs */}
                    {landingTab !== "communities" && !searchQ.trim() && (
                        <div className="bg-surface-raised border border-border-subtle" style={{ display: "flex", marginBottom: 20, borderRadius: 12, overflow: "hidden", maxWidth: 320 }}>
                            {[["hot", t("community.sortHotShort", { defaultValue: "Trending" })], ["new", t("community.sortNewShort", { defaultValue: "New" })], ["top", t("community.sortTopShort", { defaultValue: "Top" })]].map(([id, label]) => (
                                <button key={id} onClick={() => setFeedSort(id)} className={feedSort === id ? "text-text-primary" : "text-text-secondary"} style={{ flex: 1, padding: "8px 12px", background: feedSort === id ? "var(--color-surface-raised)" : "none", border: "none", borderRight: "1px solid var(--color-border-subtle)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: feedSort === id ? 700 : 500, cursor: "pointer" }}>{label}</button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Feed list (home/popular/all). Search always shows the communities grid. */}
                {landingTab !== "communities" && !searchQ.trim() && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 24, maxWidth: 720 }}>
                        {feedLoading || feedPosts === null ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="bg-surface-raised border border-border" style={{ borderRadius: 14, padding: 16 }}>
                                    <Skel w="40%" h={11} r={5} style={{ marginBottom: 8 }} /><Skel w="80%" h={15} r={6} style={{ marginBottom: 6 }} /><Skel w="95%" h={11} r={5} />
                                </div>
                            ))
                        ) : feedPosts.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "48px 20px" }}>
                                <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 6 }}>{landingTab === "home" ? t("community.homeEmpty", { defaultValue: "Join some communities to build your Home feed." }) : t("community.feedEmpty", { defaultValue: "No posts yet." })}</p>
                                {landingTab === "home" && <button onClick={() => setLandingTab("all")} style={{ marginTop: 6, background: "#2563eb", border: "none", borderRadius: 20, padding: "8px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>{t("community.exploreAll", { defaultValue: "Explore all communities" })}</button>}
                            </div>
                        ) : feedPosts.map((p, i) => {
                            const cm = p.community || {};
                            const title = p.title || p.content?.slice(0, 90) || "";
                            const blur = p.is_spoiler || p.is_nsfw;
                            return (
                                <div key={p.community_post_id} onClick={() => openCommunity({ id: cm.community_id, name: cm.name, desc: "", members: 0, color: cm.color || "#2563eb", icon: cm.icon || (cm.name?.[0] || "C").toUpperCase(), icon_url: cm.icon_url || null, handle: cm.handle, creator_id: null }, p.community_post_id)}
                                    {...clickableProps(() => openCommunity({ id: cm.community_id, name: cm.name, desc: "", members: 0, color: cm.color || "#2563eb", icon: cm.icon || (cm.name?.[0] || "C").toUpperCase(), icon_url: cm.icon_url || null, handle: cm.handle, creator_id: null }, p.community_post_id))}
                                    className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: 16, cursor: "pointer", transition: "all 0.15s", animation: `fadeUp 0.3s ease ${i * 30}ms both`, display: "flex", gap: 12 }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.background = "var(--color-surface-raised)"; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--color-border-subtle)"; e.currentTarget.style.background = "var(--color-surface)"; }}
                                >
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 30 }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.user_vote === 1 ? "#f59e0b" : "var(--color-text-muted)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5l7 7H5z"/></svg>
                                        <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700 }}>{(p.upvotes ?? 0) >= 1000 ? ((p.upvotes) / 1000).toFixed(1) + "k" : (p.upvotes ?? 0)}</span>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                                            <div style={{ width: 18, height: 18, borderRadius: "50%", background: cm.icon_url ? `center/cover no-repeat url(${cm.icon_url})` : (cm.color || "#2563eb"), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 10, color: "#fff", flexShrink: 0 }}>{!cm.icon_url && cm.icon}</div>
                                            <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700 }}>s/{cm.handle}</span>
                                            {p.flair && <span style={{ background: `${p.flair.color}1f`, borderRadius: 4, padding: "1px 7px", fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: p.flair.color }}>{p.flair.label}</span>}
                                            {p.is_nsfw && <span style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.4)", borderRadius: 4, padding: "0 6px", fontSize: 9, fontFamily: "'DM Sans', sans-serif", fontWeight: 800, color: "#f87171" }}>NSFW</span>}
                                            <AwardChips awards={p.awards} />
                                        </div>
                                        <h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 17, letterSpacing: "0.02em", marginBottom: 5, lineHeight: 1.2 }}>{title}</h3>
                                        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginBottom: 8, filter: blur ? "blur(5px)" : "none" }}>{p.content}</p>
                                        <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
                                            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                                            {p._count?.comments ?? 0} {t("community.comments")}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {(landingTab === "communities" || searchQ.trim()) && (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(290px, 1fr))", gap: 14, paddingBottom: 24 }}>
                    {loading ? Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: 20, animation: `fadeUp 0.3s ease ${i * 50}ms both` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                                <div className="skel" style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0 }} />
                                <div style={{ flex: 1 }}><Skel w="70%" h={14} r={6} style={{ marginBottom: 6 }} /><Skel w="50%" h={11} r={5} /></div>
                            </div>
                            <Skel w="90%" h={11} r={5} style={{ marginBottom: 4 }} /><Skel w="60%" h={11} r={5} />
                        </div>
                    )) : filtered.map((c, i) => (
                        <div
                            key={c.id}
                            onClick={() => openCommunity(c)}
                            className="bg-surface border border-border-subtle" style={{ borderRadius: 16, padding: 18, cursor: "pointer", transition: "all 0.15s", animation: `fadeUp 0.35s ease ${i * 45}ms both`, display: "flex", flexDirection: "column" }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = `${c.color}55`; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.background = "var(--color-surface-raised)"; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--color-border-subtle)"; e.currentTarget.style.transform = "none"; e.currentTarget.style.background = "var(--color-surface)"; }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                                <div style={{ width: 44, height: 44, borderRadius: "50%", background: c.color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, color: "#fff", flexShrink: 0 }}>{c.icon}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                        <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><span onClick={(e) => { e.stopPropagation(); openCommunity(c); }} {...clickableProps(() => openCommunity(c))} aria-label={`Open ${c.name} community`} style={{ cursor: "pointer" }}>{c.name}</span></p>
                                        <CommunityBadge type={c.type} nsfw={c.nsfw} accent={c.color} />
                                    </div>
                                    <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{(c.members || 0).toLocaleString()} {t("members")}</p>
                                </div>
                            </div>
                            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5, flex: 1, marginBottom: 14 }}>{c.desc}</p>

                            {joinedIds.has(c.id) ? (
                                <button
                                    onClick={e => { e.stopPropagation(); openCommunity(c); }}
                                    style={{ padding: "8px", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "#22c55e", cursor: "pointer" }}
                                >{t("joined")}</button>
                            ) : (
                                <button
                                    onClick={e => {
                                        e.stopPropagation();
                                        setJoinedIds(prev => new Set([...prev, c.id]));
                                        joinCommunity(c.id).catch(() => setJoinedIds(prev => { const n = new Set(prev); n.delete(c.id); return n; }));
                                    }}
                                    style={{ padding: "8px", background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.25)", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "#60a5fa", cursor: "pointer", transition: "all 0.15s" }}
                                    onMouseEnter={e => e.currentTarget.style.background = "rgba(37,99,235,0.16)"}
                                    onMouseLeave={e => e.currentTarget.style.background = "rgba(37,99,235,0.08)"}
                                >{t("community.joinCommunity")}</button>
                            )}
                        </div>
                    ))}
                </div>
                )}
            </div>
        </div>

        {showInbox && (
            <InboxPanel onClose={() => setShowInbox(false)} onOpenPost={openNotifPost} onUnreadChange={setInboxUnread} />
        )}

        {showCreateModal && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                <div className="bg-surface-raised border border-border" style={{ borderRadius: 18, padding: "28px 32px", width: "100%", maxWidth: 440 }}>
                    <p className="text-text-primary" style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 20 }}>{t("createCommunityTitle")}</p>
                    {[[t("name"), "name", "e.g. s/Photography"], [t("description"), "description", t("whatsOnMind")]].map(([label, key, placeholder]) => (
                        <div key={key} style={{ marginBottom: 14 }}>
                            <p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
                            <input value={createForm[key]} onChange={e => setCreateForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} className="bg-surface border border-border text-text-primary" style={{ width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box", caretColor: "#2563eb" }} />
                        </div>
                    ))}
                    <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                        <div style={{ flex: 1 }}>
                            <p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{i18n.t("common.filter")}</p>
                            <select value={createForm.category} onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))} className="bg-surface border border-border text-text-primary" style={{ width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }}>
                                {["General", "Local", "Tech", "Food", "Sports", "Finance", "Entertainment", "Health"].map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div style={{ flex: 1 }}>
                            <p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{i18n.t("community.type", { defaultValue: "Type" })}</p>
                            <select value={createForm.type} onChange={e => setCreateForm(f => ({ ...f, type: e.target.value }))} className="bg-surface border border-border text-text-primary" style={{ width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }}>
                                {["public", "restricted", "private"].map(tp => <option key={tp} value={tp}>{COMMUNITY_TYPE_META[tp].label}</option>)}
                            </select>
                        </div>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, cursor: "pointer" }}>
                        <input type="checkbox" checked={createForm.nsfw} onChange={e => setCreateForm(f => ({ ...f, nsfw: e.target.checked }))} style={{ accentColor: "#f87171" }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#f87171", fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("community.markNsfw", { defaultValue: "Mark as NSFW (18+)" })}</span>
                    </label>
                    {createMsg && <p style={{ color: "#f87171", fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}>{createMsg}</p>}
                    <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={handleCreateCommunity} disabled={createLoading} style={{ flex: 1, padding: "11px 0", background: "#2563eb", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", opacity: createLoading ? 0.7 : 1 }}>{createLoading ? t("creating") : t("create")}</button>
                        <button onClick={() => setShowCreateModal(false)} className="bg-surface-raised text-text-secondary" style={{ flex: 1, padding: "11px 0", border: "none", borderRadius: 10, fontSize: 13, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
                    </div>
                </div>
            </div>
        )}
    </>);
}

export { CommunityPage };