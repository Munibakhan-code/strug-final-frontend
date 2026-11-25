import { useState, useEffect, useRef, useCallback } from "react";
import i18n from "../i18n/index.js";
import { useTranslation } from "react-i18next";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { clickableProps, Tooltip } from "../components/shared.jsx";
import { Skel, SkeletonTownHallFeed, SkeletonMediaGrid, SkeletonCircle, SkeletonSearchRow } from "../components/skeletons.jsx";
import { getUser } from "../store/auth";
import { getMe, getMyReferralCode } from "../api/user";
import { reportProfile, getMyProfile, getUserPosts, getProfileByUserId, getProfileByHandle, getFollowers, getFollowing, isFollowingUser, updateProfileBanner, updateProfilePhoto, getLikedPosts, toggleFollowByUserId, toggleLikeAPI, toggleBookmarkAPI, deletePost, blockUser, muteUser, setPinnedPost, getMostViewedForUser, updateSocialProfile, getTrendingTags } from "../api/social";
import { getPlatformToday, getPlatformProfileContent, getPlatformBookOfDay, getPlatformWeather, getPlatformProfilePoll, votePlatformProfilePoll, clearPlatformProfilePollVote, getPlatformSidebarState, putPlatformSidebarState } from "../api/platform.js";
import { getSaves, toggleSave } from "../api/saves.js";
import { formatPlatformCount } from "../utils/formatPlatformCount.js";
import { mergeWorkStatusProfile, rollbackWorkStatusProfile } from "../utils/profileWorkStatus.js";
import {
	formatTrendingTagLabel,
	isEarlyAdopterFromJoinDate,
	resolveProfileJoinedAt,
	shouldShowEarlyAdopterBadge,
} from "../utils/profileWidgetHelpers.js";
import ImageCropModal from "../components/ImageCropModal.jsx";
import StoryHighlights from "../components/StoryHighlights.jsx";
import { messageUser } from "../api/chat";
import { getMyServiceListings } from "../api/services";
import { getVerticalProfileByUser } from "../api/verticalProfile.js";
// #430: reuse the app's REAL post views instead of rebuilding interaction on the profile.
import { FeedPostDetailPage } from "./Feed.jsx";
import { SocialPostDetailPage } from "./Social.jsx";
import { getBookingListings } from "../api/booking.js";
import { mediaUrls } from "../utils/mediaUrl.js";
import { getMySubscriptions, unsubscribeFromChannel, getLikedVideoIds, getVideo } from "../api/videos";
import { getWishlist, searchWishlistItems, addWishlistItem, removeWishlistItem, contributeToWishlist, claimWishlistItem } from "../api/wishlist";
import { getUserTownHallPosts, toggleTownHallLike, deleteTownHallPost, toggleTownHallRepost } from "../api/townhall";
import { Avatar, SafeImage } from "../components/SafeImage.jsx";
import { useDialog } from "../components/ConfirmDialog.jsx";
import { openMostViewedFromProfile } from "../utils/profileMostViewed.js";

// Only allow http(s) links from user-set profile fields — blocks javascript:/data: URIs.
function isSafeHttpUrl(u) {
	try { const p = new URL(u, window.location.origin); return p.protocol === "http:" || p.protocol === "https:"; }
	catch { return false; }
}

// Board #457/#453: a large number of profile-photo / cover-photo / media rows point at Azure blobs
// that were purged and now 404. A bare <img> paints the browser's broken-image icon, and the
// onError-display:none idiom used in a couple of spots here just leaves an empty box. Every image on
// this page now goes through SafeImage/Avatar, whose fallbacks are state-driven and therefore
// actually render — reusing, wherever one exists, the exact node the no-image case already showed.
function MediaPlaceholder({ style }) {
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-surface-raised)", ...style }}>
			<svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
				<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
			</svg>
		</div>
	);
}

/** Honest source chip so sample / local widgets are never mistaken for live platform data. */
function WidgetSourceHint({ kind = "sample" }) {
	const meta = {
		live: { label: "Live", color: "#4ade80", bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.35)" },
		local: { label: "On this device", color: "#94a3b8", bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.3)" },
		sample: { label: "Sample", color: "#fbbf24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.35)" },
		shortcuts: { label: "Shortcuts", color: "#93c5fd", bg: "rgba(147,197,253,0.12)", border: "rgba(147,197,253,0.3)" },
	}[kind] || { label: "Sample", color: "#fbbf24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.35)" };
	return (
		<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 999, padding: "2px 7px", flexShrink: 0 }}>
			{meta.label}
		</span>
	);
}

// #198 portfolio: when a provider is viewed via a vertical click-site (window.__profileVertical),
// show a tab with their OTHER listings in that vertical (cameo/fiverr/portfolio style), so users
// see all of a celebrity/influencer/artist's work — not just the generic social profile.
// Booking-engine verticals share one listings API + carry owner_id, so one fetch covers them.
const PORTFOLIO_BOOKING = {
	celebrity:  { vertical: "celebrity",  label: "Cameos",    nav: "celebrity",  unit: "per video" },
	influencer: { vertical: "influencer", label: "Packages",  nav: "influencer", unit: "per package" },
	artist:     { vertical: "artist",     label: "Portfolio", nav: "artists",    unit: "" },
	// #188: clicking "hosted by" on a temp-stay listing opens the host's professional
	// profile showing their stay listings. Prefer scoped `tempstay`; keep `hosting` as
	// a legacy alias for older deep links.
	tempstay:   { vertical: "tempstay",   label: "Listings",  nav: "tempstay",   unit: "per night" },
	hosting:    { vertical: "tempstay",   label: "Listings",  nav: "tempstay",   unit: "per night" },
};

// Town Hall posts live in a separate table from social_feed. Normalize one into the
// shape the profile's Posts/Images tabs already render, tagged with _source so the
// like/comment/delete handlers can route to the right API. (#6/#7)
function normalizeTownHallPost(th) {
	const prof = th.user?.social_profiles?.[0] ?? null;
	return {
		_source: "townhall",
		// #430: the detail view needs fields this normalizer drops (media_type, view_count,
		// reposts, author user_id), so keep the row it came from.
		_raw: th,
		post_id: `th_${th.post_id}`,
		th_id: th.post_id,
		created_at: th.created_at,
		caption_text: th.content,
		social_media_attachments: th.media_url
			? [{ media_url: th.media_url, media_type: th.media_type ?? null }]
			: [],
		like_count: th._count?.likes ?? 0,
		comment_count: th._count?.replies ?? 0,
		liked: !!th.liked,
		// Future scheduled_at => this post is queued, only the author sees it.
		scheduled_at: th.scheduled_at ?? null,
		social_profile: prof
			? { display_name: prof.display_name, handle: prof.handle, profile_pic_url: prof.profile_pic_url, is_verified: prof.is_verified }
			: null,
	};
}

function mergeProfilePosts(social, townhall) {
	const s = Array.isArray(social) ? social : [];
	const t = Array.isArray(townhall) ? townhall.map(normalizeTownHallPost) : [];
	return [...s, ...t].sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0));
}


// A post attachment is a video when its media_type says so or its URL is a video/HLS file.
// Rendering a video URL inside an <img> showed a broken component on the profile (bug #11).
function isVideoAtt(att) {
	if (!att) return false;
	const t = att.media_type ?? att.type ?? "";
	if (/video/i.test(t)) return true;
	return /\.(mp4|webm|mov|m4v|m3u8)(\?|#|$)/i.test(att.media_url ?? "");
}

const WORK_STATUSES = ["available_for_work", "open_to_opportunities", "hiring"];

const EXPLORE_FEATURES = [
	{ label: "Videos",    nav: "videos",    bg: "#7c3aed", d: "M23 7 16 12 23 17 23 7", d2: "M1 5h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H1" },
	{ label: "Live",      nav: "live",      bg: "#ef4444", d: "M5.26 5.26A10 10 0 1 0 19 19", d2: "M12 8v4l3 3" },
	{ label: "Community", nav: "community", bg: "#2563eb", d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
	{ label: "Shop",      nav: "shop",      bg: "#0891b2", d: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z", d2: "M3 6h18M16 10a4 4 0 0 1-8 0" },
	{ label: "Services",  nav: "services",  bg: "#f59e0b", d: "M13 2 3 14h9l-1 8 10-12h-9l1-8z" },
	{ label: "Events",    nav: "events",    bg: "#ec4899", d: "M8 2v4M16 2v4M3 10h18", d2: "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" },
];

const SPIN_COLORS_FALLBACK = ["#8b5cf6", "#2563eb", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

const ALL_LEFT_WIDGETS = [
	{ id: "did-you-know",      label: "Did You Know?",      locked: true },
	{ id: "explore",           label: "Explore Features" },
	{ id: "whats-new",         label: "What's New" },
	{ id: "trending",          label: "Trending" },
	{ id: "community-poll",    label: "Community Poll",     ownOnly: true },
	{ id: "quote-of-day",      label: "Quote of the Day" },
	{ id: "spin-wheel",        label: "Spin the Wheel" },
	{ id: "book-rec",          label: "Book Recommendation" },
	{ id: "platform-news",     label: "Platform News" },
	{ id: "feature-spotlight", label: "Feature Spotlight" },
];
const ALL_RIGHT_WIDGETS = [
	{ id: "about",           label: "About",           locked: true },
	{ id: "profile-stats",   label: "Profile Stats",   locked: true },
	{ id: "achievements",    label: "Achievements" },
	{ id: "quick-actions",   label: "Quick Actions",   ownOnly: true },
	{ id: "subscriptions",   label: "Subscriptions",   ownOnly: true },
	{ id: "daily-challenge", label: "Daily Challenge", ownOnly: true },
	{ id: "daily-goals",     label: "Daily Goals",     ownOnly: true },
	{ id: "sticky-notes",    label: "Sticky Notes",    ownOnly: true },
	{ id: "calendar",        label: "Calendar" },
	{ id: "anniversary",     label: "Anniversary" },
	{ id: "weather",         label: "Weather" },
];
const DEFAULT_LEFT_WIDGETS  = ["did-you-know"];
const DEFAULT_RIGHT_WIDGETS = ["about", "profile-stats", "quick-actions"];

function AnimatedCount({ value, visible }) {
	const [displayed, setDisplayed] = useState(0);
	useEffect(() => {
		if (!visible) { setDisplayed(0); return; }
		const end = Number(value) || 0;
		if (end === 0) { setDisplayed(0); return; }
		let cur = 0;
		const step = Math.max(1, Math.ceil(end / 40));
		const iv = setInterval(() => {
			cur = Math.min(cur + step, end);
			setDisplayed(cur);
			if (cur >= end) clearInterval(iv);
		}, 20);
		return () => clearInterval(iv);
	}, [visible, value]);
	return displayed.toLocaleString();
}

// /video-social/liked returns ids only, so each liked video costs one hydration request. Cap the
// fan-out — the Videos page's own Liked tab uses the same ceiling.
const LIKED_VIDEO_LIMIT = 24;

function UserProfilePage({ onNavigate, isSplitMode = false }) {
	const { t } = useTranslation();
	const { isMobile, isTablet: _isTablet } = useViewport();
	const isTablet = _isTablet || isSplitMode;
	const loading = usePageLoad(150);
	const [profileDialog, { notify: notifyProfile }] = useDialog();
	const [messageBusy, setMessageBusy] = useState(false);
	const [tab, setTab] = useState("Posts");
	const [profileLinkCopied, setProfileLinkCopied] = useState(false);
	const [refCopied, setRefCopied] = useState(false);
	// PROFILE-P13: referral code — fetch it if the cached user object doesn't have one,
	// instead of showing a perpetual t("userProfile.generating") placeholder.
	const [fetchedRefCode, setFetchedRefCode] = useState(null);
	const [refCodeChecked, setRefCodeChecked] = useState(false);
	// #422: optimistic pin state. `undefined` = defer to the server's value on the profile;
	// `null` = explicitly unpinned in this session; an object = just pinned in this session.
	const [pinnedOverride, setPinnedOverride] = useState(undefined);
	const [pinBusy, setPinBusy] = useState(false);
	const [mostViewed, setMostViewed] = useState(null);
	// #430: the post the visitor opened from this profile, rendered as the real post view.
	const [detailPost, setDetailPost] = useState(null);
	const [userData, setUserData] = useState(() => getUser());
	const [socialProfile, setSocialProfile] = useState(null);
	const [bannerUrl, setBannerUrl] = useState(null);
	const bannerInputRef = useRef(null);
	const [bannerError, setBannerError] = useState("");
	// #161/#125 — open a crop/reposition step before uploading the banner instead of
	// uploading the raw file (which the browser then hard-crops with object-fit).
	const [bannerCropSrc, setBannerCropSrc] = useState(null);
	function handleBannerChange(e) {
		const f = e.target.files?.[0];
		if (!f) return;
		if (!f.type?.startsWith("image/")) { setBannerError(t("userProfile.chooseImageFile")); return; }
		if (f.size > 5 * 1024 * 1024) { setBannerError(t("userProfile.imageTooLarge")); return; }
		setBannerError("");
		setBannerCropSrc(URL.createObjectURL(f));
		e.target.value = ""; // allow re-picking the same file
	}
	async function uploadBannerFile(f) {
		const prev = bannerUrl; // revert to this if the upload fails
		const local = URL.createObjectURL(f);
		setBannerUrl(local);
		try {
			const result = await updateProfileBanner(f);
			if (result?.banner_url) { setBannerUrl(result.banner_url); URL.revokeObjectURL(local); }
		} catch {
			setBannerUrl(prev);
			URL.revokeObjectURL(local);
			setBannerError(t("userProfile.coverUploadFailed"));
		}
	}
	// PROFILE-Q6: inline profile-photo (avatar) change on the profile page.
	const avatarInputRef = useRef(null);
	async function handleAvatarChange(e) {
		const f = e.target.files?.[0];
		if (!f) return;
		if (!f.type?.startsWith("image/")) { setBannerError(t("userProfile.chooseImageFile")); return; }
		if (f.size > 5 * 1024 * 1024) { setBannerError(t("userProfile.imageTooLarge")); return; }
		setBannerError("");
		const local = URL.createObjectURL(f);
		setSocialProfile(prev => prev ? { ...prev, profile_pic_url: local } : prev);
		try {
			const result = await updateProfilePhoto(f);
			const url = result?.profile_pic_url;
			if (url) {
				setSocialProfile(prev => prev ? { ...prev, profile_pic_url: url } : prev);
				setUserData(prev => ({ ...prev, profile_pic_url: url }));
				// Let the dashboard avatar / other listeners refresh too.
				window.dispatchEvent(new CustomEvent("strug:user-updated", { detail: { profile_pic_url: url } }));
			}
		} catch {
			setBannerError(t("userProfile.photoUpdateFailed"));
		} finally {
			URL.revokeObjectURL(local);
		}
	}
	const [userPosts, setUserPosts] = useState([]);
	const [postsReady, setPostsReady] = useState(false);
	const [userServices, setUserServices] = useState([]);
	const [verticalListings, setVerticalListings] = useState([]);
	const [likedPosts, setLikedPosts] = useState([]);
	const [likedVideos, setLikedVideos] = useState([]);
	const [subscriptionChannels, setSubscriptionChannels] = useState([]);
	const [moreMenuOpen, setMoreMenuOpen] = useState(false);
	const [moreMenuMsg, setMoreMenuMsg] = useState("");
	const moreMenuRef = useRef(null);
	const [followListModal, setFollowListModal] = useState(null); // "followers" | "following" | null
	const [followList, setFollowList] = useState([]);
	const [followListLoading, setFollowListLoading] = useState(false);
	const [isFollowing, setIsFollowing] = useState(false);
	const [accountPrivate, setAccountPrivate] = useState(false);
	const [followLoading, setFollowLoading] = useState(false);
	const [profileError, setProfileError] = useState(false);
	// PROFILE-Q1: post interactions (like / comment / delete) on the Posts tab.
	const [deleteTarget, setDeleteTarget] = useState(null); // post id pending delete confirm
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState("");
	const followListCacheRef = useRef({});
	const myId = getUser()?.user_id ?? getUser()?.id;
	// Sidebar state
	const [dykIndex, setDykIndex] = useState(0);
	const [dykFading, setDykFading] = useState(false);
	const [platformTips, setPlatformTips] = useState([]);
	const [platformStats, setPlatformStats] = useState(null);
	const [platformStatsLoading, setPlatformStatsLoading] = useState(true);
	const [trendingTags, setTrendingTags] = useState([]);
	const [trendingLoading, setTrendingLoading] = useState(false);
	const [workStatusMenuOpen, setWorkStatusMenuOpen] = useState(false);
	const [workStatusSaving, setWorkStatusSaving] = useState(false);
	const [workStatusError, setWorkStatusError] = useState("");
	const [pollVote, setPollVote] = useState(null);
	const [pollMeta, setPollMeta] = useState({ question: '', options: [], tallies: {} });
	const [pollBusy, setPollBusy] = useState(false);
	const [challengeDone, setChallengeDone] = useState(false);
	const [profileContent, setProfileContent] = useState(null);
	const [bookOfDay, setBookOfDay] = useState(null);
	const [bookInReadingList, setBookInReadingList] = useState(false);
	const [bookSaveBusy, setBookSaveBusy] = useState(false);
	const [weather, setWeather] = useState(null);
	const [weatherLoading, setWeatherLoading] = useState(false);
	const [weatherError, setWeatherError] = useState('');
	const sidebarPersistTimer = useRef(null);
	const [statsVisible, setStatsVisible] = useState(false);
	// Callback ref, not useRef: the Profile Stats card mounts only after the profile data
	// resolves, so a mount-time effect reading statsRef.current found null and — with []
	// deps — never ran again. A callback ref fires whenever the node actually appears.
	const [statsNode, setStatsNode] = useState(null);
	const dykTimerRef = useRef(null);
	const [quoteIndex, setQuoteIndex] = useState(0);
	const [quoteFading, setQuoteFading] = useState(false);
	const [spinAngle, setSpinAngle] = useState(0);
	const [spinning, setSpinning] = useState(false);
	const [spinResult, setSpinResult] = useState(null);
	const [goals, setGoals] = useState([false, false, false]);
	const [stickyText, setStickyText] = useState("");
	const [dailyGoalsLabels, setDailyGoalsLabels] = useState(["Reply to a friend", "Upload something", "Finish your Journal"]);
	const [dailyChallengeText, setDailyChallengeText] = useState("Share your profile link with a friend today.");
	// Wishlist state
	const [wishlistItems, setWishlistItems] = useState([]);
	const [wishlistLoading, setWishlistLoading] = useState(false);
	const [wishlistLoaded, setWishlistLoaded] = useState(false);
	const [addItemModal, setAddItemModal] = useState(false);
	const [addItemSearch, setAddItemSearch] = useState("");
	const [addItemResults, setAddItemResults] = useState([]);
	const [addItemSearching, setAddItemSearching] = useState(false);
	const [addItemType, setAddItemType] = useState("all");
	const [addItemPending, setAddItemPending] = useState(null); // item being confirmed
	const [addingItem, setAddingItem] = useState(false);
	const [contributeModal, setContributeModal] = useState(null); // wishlist_item object
	const [removeConfirmItem, setRemoveConfirmItem] = useState(null); // wishlist_item pending remove
	const [removeLoading, setRemoveLoading] = useState(false);
	const [contributeAmount, setContributeAmount] = useState("");
	const [contributeNote, setContributeNote] = useState("");
	const [contributing, setContributing] = useState(false);
	const [contributeMsg, setContributeMsg] = useState("");
	const [claiming, setClaiming] = useState(null); // itemId being claimed

	// ── Profile Insights widget (right panel) — profile-contextual, rotates every 60s ──
	const DISCOVER_INTERVAL = 60000;
	const [discoverIdx, setDiscoverIdx]     = useState(0);
	const [discoverProgress, setDiscoverProgress] = useState(0);
	const [walletBalance, setWalletBalance] = useState(null);
		const [leftWidgets, setLeftWidgets] = useState(() => {
		try { const v = JSON.parse(localStorage.getItem("strug_sidebar_left") || "null"); return Array.isArray(v) ? v : DEFAULT_LEFT_WIDGETS; } catch { return DEFAULT_LEFT_WIDGETS; }
	});
	const [rightWidgets, setRightWidgets] = useState(() => {
		try { const v = JSON.parse(localStorage.getItem("strug_sidebar_right") || "null"); return Array.isArray(v) ? v : DEFAULT_RIGHT_WIDGETS; } catch { return DEFAULT_RIGHT_WIDGETS; }
	});
	const [widgetPickerSide, setWidgetPickerSide] = useState(null);
	const [widgetLimitMsg, setWidgetLimitMsg] = useState(null);
	const widgetPickerRef = useRef(null);
	function removeWidget(side, id) {
		if (side === "left") {
			setLeftWidgets(prev => {
				const next = prev.filter(w => w !== id);
				try { localStorage.setItem("strug_sidebar_left", JSON.stringify(next)); } catch {}
				return next;
			});
		} else {
			setRightWidgets(prev => {
				const next = prev.filter(w => w !== id);
				try { localStorage.setItem("strug_sidebar_right", JSON.stringify(next)); } catch {}
				return next;
			});
		}
	}
	function addWidget(side, id) {
		const MAX = 4;
		if (side === "left") {
			setLeftWidgets(prev => {
				if (prev.includes(id)) return prev;
				if (prev.length >= MAX) { setWidgetLimitMsg("left"); setTimeout(() => setWidgetLimitMsg(null), 2500); return prev; }
				const next = [...prev, id];
				try { localStorage.setItem("strug_sidebar_left", JSON.stringify(next)); } catch {}
				return next;
			});
		} else {
			setRightWidgets(prev => {
				if (prev.includes(id)) return prev;
				if (prev.length >= MAX) { setWidgetLimitMsg("right"); setTimeout(() => setWidgetLimitMsg(null), 2500); return prev; }
				const next = [...prev, id];
				try { localStorage.setItem("strug_sidebar_right", JSON.stringify(next)); } catch {}
				return next;
			});
		}
		setWidgetPickerSide(null);
	}
	// Reveal the stat counters once the card scrolls into view.
	//
	// This used to read statsRef.current inside a []-deps effect. The card renders only after the
	// profile loads, so on mount the ref was still null, the effect bailed, and — having no deps —
	// it never ran again. The observer was therefore never attached, statsVisible stayed false, and
	// AnimatedCount hard-resets to 0 when visible is false. Result: the rail read 0 / 0 / 0 forever
	// while the (unanimated) mobile stat block showed the real numbers (board #410).
	//
	// Keying the effect on the NODE fixes it: it re-runs the moment the card actually mounts. The
	// no-IntersectionObserver fallback just shows the numbers rather than hiding them at 0.
	useEffect(() => {
		if (!statsNode) return;
		if (typeof IntersectionObserver === "undefined") { setStatsVisible(true); return; }
		const obs = new IntersectionObserver(([entry]) => {
			if (entry.isIntersecting) { setStatsVisible(true); obs.disconnect(); }
		}, { threshold: 0.3 });
		obs.observe(statsNode);
		return () => obs.disconnect();
	}, [statsNode]);

	const postKey = (p) => p.post_id ?? p.social_post_id ?? p.id;
	const isLiked = (p) => typeof p?.liked === "boolean" ? p.liked : !!(p?.is_liked ?? p?.is_liked_by_me ?? (p?.social_interactions?.length > 0));
	const likeCountOf = (p) => p.like_count ?? p.likes ?? p._count?.social_interactions ?? 0;
	const matchesProfilePost = (p, target) => {
		if (!p || !target) return false;
		if (p._source && target._source && p._source !== target._source) return false;
		const thA = p.th_id ?? (p._source === "townhall" ? p.id : null);
		const thB = target.th_id ?? (target._source === "townhall" ? target.id : null);
		if (thA != null && thB != null && String(thA) === String(thB)) return true;
		const ids = (x) => [x.social_post_id, x.post_id, x.id].filter(v => v != null).map(v => String(v).replace(/^th_/, ""));
		const as = ids(p);
		const bs = ids(target);
		return as.some(id => bs.includes(id));
	};
	// #422: the profile merges two sources (social_feed + town hall), so an id alone is ambiguous —
	// post 3 exists in BOTH tables. Every pin reference carries its type.
	//
	// #446 ("unable to pin a post from town hall"): the merged list namespaces a town hall post's
	// post_id as the STRING "th_123" so the two sources can't collide as React keys. This ref must
	// carry the real numeric id instead — the API takes {post_id, post_type}, and Number("th_123")
	// is NaN, so the pin request 400'd and the button silently snapped back. The same mismatch also
	// meant a stored town hall pin could never be found again ("th_123" !== 123 in samePost), so
	// this one line fixes both the write and the read. postKey() keeps the prefix — it's the React
	// key for the merged list and must stay unique across the two tables.
	const postRef = (p) => ({
		id: p._source === "townhall" ? p.th_id : (p.social_post_id ?? p.post_id ?? p.id),
		type: p._source === "townhall" ? "townhall" : "social",
	});
	// #430: clicking a post (or a photo) on a profile used to do almost nothing — a photo opened a
	// dumb lightbox with no link back to the post at all, and a post opened a bare comments sheet
	// with no media, no like, no repost, no view count. The app already HAS proper post views; the
	// profile just wasn't using them. Open the real one, picking the right view per source.
	const openPostDetail = useCallback((p) => {
		if (!p) return;
		if (p._source === "townhall") {
			const th = p._raw ?? {};
			const sp = th.user?.social_profiles?.[0] ?? null;
			const name = sp?.display_name ?? th.user?.name ?? "User";
			setDetailPost({
				type: "townhall",
				post: {
					id: p.th_id,
					author_user_id: th.user?.user_id ?? null,
					author_profile_id: sp?.profile_id ?? null,
					user: name,
					handle: `@${sp?.handle ?? th.user?.username ?? "user"}`,
					avatar: name.slice(0, 1).toUpperCase(),
					avatar_url: sp?.profile_pic_url ?? null,
					avatarColor: "#2563eb",
					time: th.created_at ? new Date(th.created_at).toLocaleDateString() : "now",
					created_at: th.created_at ?? null,
					text: th.content ?? "",
					media_url: th.media_url ?? null,
					media_type: th.media_type ?? null,
					hls_url: th.hls_url ?? null,
					thumbnail_url: th.thumbnail_url ?? null,
					poll: th.poll ?? (Array.isArray(th.poll_options) && th.poll_options.length ? {
						options: th.poll_options.map(o => ({
							option_id: o.option_id,
							text: o.option_text || o.text,
							votes_count: o._count?.votes ?? o.votes_count ?? 0,
						})),
						total_votes: th.poll_options.reduce((s, o) => s + (o._count?.votes ?? o.votes_count ?? 0), 0),
						voted_option_id: th.poll?.voted_option_id ?? null,
					} : null),
					pinned_product: th.pinned_product ?? null,
					is_sensitive: !!th.is_sensitive,
					_quotedPost: th.quote_post ? {
						id: th.quote_post.post_id,
						text: th.quote_post.content,
						media_url: th.quote_post.media_url,
						media_type: th.quote_post.media_type,
					} : null,
					likes: th._count?.likes ?? 0,
					comments: th._count?.replies ?? 0,
					reposts: th._count?.reposts ?? 0,
					views: th.view_count ?? 0,
					liked: !!(th.liked ?? th.is_liked_by_me),
					saved: !!th.saved,
					reposted: !!th.reposted,
					verified: sp?.is_verified ?? false,
				},
			});
			return;
		}
		const sp = p.social_profile ?? null;
		const name = sp?.display_name ?? "User";
		setDetailPost({
			type: "social",
			post: {
				id: p.social_post_id ?? p.post_id ?? p.id,
				user: name,
				handle: sp?.handle ? `@${sp.handle}` : "@user",
				avatarUrl: sp?.profile_pic_url ?? null,
				avatar: name.slice(0, 2).toUpperCase(),
				avatarColor: "#2563eb",
				caption: p.caption_text ?? p.content ?? "",
				imageUrl: p.social_media_attachments?.[0]?.media_url ?? p.media_url ?? null,
				authorProfileId: p.profile_id ?? sp?.profile_id,
				authorUserId: sp?.user_id,
				verified: sp?.is_verified ?? false,
				created_at: p.created_at ?? null,
				likes: likeCountOf(p),
				comments: commentCountOf(p),
				liked: !!p.liked,
				saved: !!p.saved,
			},
		});
	 
	}, []);

	const samePost = (p, ref) => {
		const r = postRef(p);
		return String(r.id) === String(ref.id) && r.type === ref.type;
	};
	const commentCountOf = (p) => p.comment_count ?? p.comments ?? p._count?.social_comments ?? 0;
	// Load a profile's posts from BOTH social_feed and Town Hall, normalize and merge
	// them so a user's Town Hall posts/images show on their profile too (#6/#7).
	function loadProfilePosts(userId, guard) {
		setPostsReady(false);
		// Town Hall posts are paginated server-side (#42): a single request caps at 100,
		// so page through until a short page comes back to surface ALL of a user's posts
		// (previously profiles silently stopped at 50). Bounded to avoid runaway loops.
		const PAGE = 100, MAX_PAGES = 30;
		const fetchAllTownHall = async () => {
			const all = [];
			for (let page = 1; page <= MAX_PAGES; page++) {
				let arr;
				try {
					const v = await getUserTownHallPosts(userId, page, PAGE);
					arr = Array.isArray(v) ? v : (v?.data ?? []);
				} catch { break; }
				all.push(...arr);
				if (arr.length < PAGE) break;
			}
			return all;
		};
		Promise.allSettled([getUserPosts(userId), fetchAllTownHall()]).then(([s, t]) => {
			if (guard && !guard()) return;
			const socialPayload = s.status === "fulfilled" ? s.value : null;
			const social = Array.isArray(socialPayload) ? socialPayload : (socialPayload?.data ?? []);
			const town = t.status === "fulfilled" ? (Array.isArray(t.value) ? t.value : []) : [];
			setUserPosts(mergeProfilePosts(social, town));
			if (socialPayload?.private) setAccountPrivate(true);
			else setAccountPrivate(false);
			setPostsReady(true);
		}).catch(() => {
			if (guard && !guard()) return;
			setUserPosts([]);
			setPostsReady(true);
		});
	}
	// Optimistic like toggle (mirrors Feed.jsx); flips again on error to revert.
	// Town Hall posts toggle through their own like endpoint.
	function toggleLike(post, nextLiked) {
		if (!post) return Promise.resolve();
		const wanted = typeof nextLiked === "boolean" ? nextLiked : !isLiked(post);
		const apply = (liked) => {
			const patchRow = (p) => {
				const was = isLiked(p);
				const delta = was === liked ? 0 : (liked ? 1 : -1);
				return { ...p, liked, like_count: Math.max(0, likeCountOf(p) + delta), likes: Math.max(0, likeCountOf(p) + delta) };
			};
			setUserPosts(prev => prev.map(p => matchesProfilePost(p, post) ? patchRow(p) : p));
			setDetailPost(prev => {
				if (!prev?.post) return prev;
				const dp = prev.post;
				const same = String(dp.id) === String(post.th_id)
					|| String(dp.id) === String(post.social_post_id ?? post.post_id ?? post.id)
					|| matchesProfilePost(dp, post);
				if (!same) return prev;
				const was = isLiked(dp);
				const delta = was === liked ? 0 : (liked ? 1 : -1);
				return { ...prev, post: { ...dp, liked, likes: Math.max(0, (dp.likes ?? likeCountOf(dp)) + delta) } };
			});
		};
		apply(wanted);
		const isTownHall = post._source === "townhall" || post.th_id != null;
		const req = isTownHall
			? toggleTownHallLike(post.th_id ?? post.id)
			: toggleLikeAPI(post.social_post_id ?? post.post_id ?? post.id);
		return req.catch((err) => { apply(!wanted); throw err; });
	}
	// #430: openComments/submitComment (the bare comments sheet) removed — a post now opens
	// the app's real post view, which owns its own comment thread and composer.

	function confirmDelete() {
		const id = deleteTarget;
		if (!id) return;
		const post = userPosts.find(p => postKey(p) === id);
		setDeleting(true);
		setDeleteError("");
		// Q7: remove from the UI only after the server confirms — previously it removed
		// optimistically and swallowed errors, so a failed delete looked successful and the
		// post reappeared on refresh. On failure, keep the post and surface the error.
		// Town Hall posts delete through their own endpoint.
		const del = post?._source === "townhall" ? deleteTownHallPost(post.th_id) : deletePost(id);
		del
			.then(() => { setUserPosts(prev => prev.filter(p => postKey(p) !== id)); setDeleteTarget(null); })
			.catch(() => { setDeleteError("Couldn't delete the post. Please try again."); })
			.finally(() => setDeleting(false));
	}
	// Target user whose profile we're viewing (null = own profile). Seeded from
	// window.__profileTargetId (set by in-app "View Profile" nav, which remounts
	// this page via profileKey) and updated by the /@handle resolver below.
	// Held in state so the async handle resolution actually triggers a re-render.
	const [targetUserId, setTargetUserId] = useState(() => {
		const t = window.__profileTargetId;
		const me = getUser()?.user_id ?? getUser()?.id;
		if (t && String(t) === String(me)) { delete window.__profileTargetId; return null; }
		return t ?? null;
	});
	// PROFILE-bleed (#198/#242): when a provider icon is clicked from a vertical page, the
	// nav sets window.__profileVertical so we render that provider's PER-VERTICAL identity
	// (vertical_profile) instead of their generic Social profile. Consumed once per mount
	// (the page remounts on each "View Profile" nav); absent = generic profile (Social/DMs).
	const [profileVertical] = useState(() => {
		const v = window.__profileVertical || null;
		delete window.__profileVertical;
		return v;
	});
	// PROFILE-P1: while a /@handle deep link is still resolving to a user_id, gate the
	// own-profile loaders so their (async) responses can't render/clobber the page before
	// we know whose profile this is. Seeded true on a cold load of a /@handle URL.
	const [handleResolving, setHandleResolving] = useState(() => !!window.__pendingHandle);
	// Mirror of the active target so late-resolving promises can detect they're stale
	// (rapid follower-row hops, or an own-profile fetch that lands after a target switch).
	const targetRef = useRef(targetUserId);
	useEffect(() => { targetRef.current = targetUserId; }, [targetUserId]);
	const isCurrentTarget = (t) => String(targetRef.current ?? "") === String(t ?? "");
	// Resolve /@handle deep link → user_id via the social profile (reachable for
	// every user, not just channel owners), then drive state to re-render.
	useEffect(() => {
		const handle = window.__pendingHandle;
		if (!handle) { setHandleResolving(false); return; }
		delete window.__pendingHandle;
		getProfileByHandle(handle)
			.then(d => {
				const userId = d?.data?.user_id ?? d?.user_id ?? null;
				if (!userId) return;
				window.history.replaceState({ nav: "profile" }, "", `/@${handle}`);
				if (String(userId) === String(myId)) { window.__profileTargetId = null; setTargetUserId(null); }
				else { window.__profileTargetId = userId; setTargetUserId(userId); }
			})
			.catch(() => {})
			.finally(() => setHandleResolving(false));
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const isViewingOther = targetUserId && String(targetUserId) !== String(myId);
	// PROFILE-P6: Services / Likes / Subscriptions are own-account views (no per-user
	// backend feed for them yet) — hide them when viewing someone else so the tabs aren't
	// dead/misleading. Posts / Images / Tagged remain.
	// PROFILE-Q4: "Tagged" was a permanent empty stub — drop it until the feature exists.
	// #198 portfolio tab (provider's other listings in the clicked vertical), shown first.
	const portfolioCfg = (isViewingOther && profileVertical) ? PORTFOLIO_BOOKING[profileVertical] : null;
	const tabs = isViewingOther
		? (portfolioCfg ? [portfolioCfg.label, "Posts", "Images", "Wishlist"] : ["Posts", "Images", "Wishlist"])
		: ["Posts", "Images", "Services", "Likes", "Subscriptions", "Wishlist"];
	useEffect(() => {
		// PROFILE-P1: don't load anything until a pending /@handle deep link has resolved,
		// so an own-profile fetch can't land first and clobber the target's data.
		if (handleResolving) return;
		const reqTarget = targetUserId; // capture; guards below drop stale responses
		if (isViewingOther) {
			// PROFILE-015 + PROFILE-005 + PROFILE-004: reset stale state before new API calls
			setIsFollowing(false);
			setBannerUrl(null);
			setTab('Posts');
			setSocialProfile(null);
			setVerticalListings([]);
			setUserPosts([]);
			setUserServices([]);
			setProfileError(false);
			setWishlistLoaded(false);
			setWishlistItems([]);
			getProfileByUserId(targetUserId).then(d => {
				if (!isCurrentTarget(reqTarget)) return;
				const p = d?.data ?? d;
				if (p) {
					setSocialProfile({ ...p, follower_count: p._count?.followers ?? 0, following_count: p._count?.following ?? 0 });
					// PROFILE-P4: render the target's banner (backend now returns banner_url on by-user).
					setBannerUrl(p.banner_url ?? null);
					// PROFILE-bleed (#198/#242): overlay the provider's per-vertical identity when
					// arriving from a vertical page. Additive — any field the vertical hasn't set
					// inherits the generic value, so this never blanks the profile. Falls back
					// silently to the generic profile on error.
					if (profileVertical) {
						getVerticalProfileByUser(targetUserId, profileVertical).then(vd => {
							if (!isCurrentTarget(reqTarget)) return;
							const v = vd?.data ?? vd;
							if (!v) return;
							setSocialProfile(prev => prev ? {
								...prev,
								display_name: v.display_name ?? prev.display_name,
								bio: v.bio ?? prev.bio,
								profile_pic_url: v.profile_pic_url ?? prev.profile_pic_url,
								handle: v.handle ?? prev.handle,
								business_name: v.business_name ?? prev.business_name,
								website: v.website ?? prev.website,
								location: v.location ?? prev.location,
							} : prev);
							if (v.banner_url) setBannerUrl(v.banner_url);
						}).catch(() => {});
					}
					// #198 portfolio: load this provider's other listings in the clicked vertical
					// so the profile showcases all their work (cameo/fiverr style).
					if (PORTFOLIO_BOOKING[profileVertical]) {
						const pcfg = PORTFOLIO_BOOKING[profileVertical];
						setTab(pcfg.label);
						getBookingListings({ vertical: pcfg.vertical }).then(res => {
							if (!isCurrentTarget(reqTarget)) return;
							const arr = Array.isArray(res) ? res : (res?.data ?? []);
							const mine = arr.filter(l => String(l.owner_id ?? l.user_id ?? "") === String(targetUserId));
							setVerticalListings(mine.map(l => {
								const imgs = mediaUrls(l.images);
								return {
									id: l.booking_listing_id ?? l.id,
									title: l.title || "Listing",
									desc: l.description || "",
									price: Number(l.price) || 0,
									image: imgs[0] || null,
									location: l.location || "",
								};
							}));
						}).catch(() => {});
					}
					// Replace (not push) the /profile placeholder with /@handle so navigating to
					// a user's profile leaves a single history entry — Back then returns to the
					// page the user actually came from, not the intermediate /profile.
					const h = p.handle;
					if (h && !window.location.pathname.startsWith(`/@${h}`)) {
						window.history.replaceState({ nav: "profile" }, "", `/@${h}`);
					}
					// Check if current user is following this profile
					const profId = p.profile_id;
					if (profId) {
						// PROFILE-P9: authoritative single-relationship check (was a capped
						// followers-list scan that missed the viewer beyond the first 100).
						isFollowingUser(profId).then(res => {
							if (!isCurrentTarget(reqTarget)) return;
							setIsFollowing(res?.requested ? "requested" : !!res?.following);
						}).catch(() => {});
					}
				}
			}).catch(() => { if (isCurrentTarget(reqTarget)) setProfileError(true); });
			loadProfilePosts(targetUserId, () => isCurrentTarget(reqTarget));
		} else {
			const uid = getUser()?.user_id; if (uid) getMe(uid).then(d => { if (!isCurrentTarget(reqTarget)) return; const fresh = Array.isArray(d) ? d[0] : d; if (fresh) setUserData(prev => { const merged = { ...prev, ...fresh }; if (!fresh.profile_pic_url && prev.profile_pic_url) merged.profile_pic_url = prev.profile_pic_url; return merged; }); }).catch(() => {});
			getMyProfile().then(d => {
				if (!isCurrentTarget(reqTarget)) return;
				const p = d?.data ?? d;
				if (p) {
					setSocialProfile({ ...p, follower_count: p.follower_count ?? p._count?.followers ?? 0, following_count: p.following_count ?? p._count?.following ?? 0 }); if (p.banner_url) setBannerUrl(p.banner_url);
					// Replace the generic /profile placeholder with /@handle for your OWN profile
					// too, so a copied link points straight at your shareable username URL
					// (app.strug.ca/@handle) instead of the generic /profile. Mirrors the
					// other-user branch above; replaceState keeps a single history entry.
					const h = p.handle;
					if (h && !window.location.pathname.startsWith(`/@${h}`)) {
						window.history.replaceState({ nav: "profile" }, "", `/@${h}`);
					}
				}
			}).catch(() => {});
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [targetUserId, handleResolving]);
	useEffect(() => {
		if (handleResolving || isViewingOther) return;
		const uid = getUser()?.id ?? getUser()?.user_id;
		if (!uid) return;
		loadProfilePosts(uid);
		getMyServiceListings().then(d => {
			const list = Array.isArray(d) ? d : (d?.data ?? []);
			setUserServices(list);
		}).catch(() => {});
		getLikedPosts().then(d => {
			const list = Array.isArray(d) ? d : (d?.data ?? []);
			setLikedPosts(list);
		}).catch(() => {});
		// #435: the Likes tab used to be a blue "Liked Videos" banner that just bounced you to the
		// Videos section. Show the actual videos. /video-social/liked returns bare ids, so hydrate
		// them — capped, same as the Videos page's own liked list, to bound the request fan-out.
		getLikedVideoIds().then(async ids => {
			if (!Array.isArray(ids) || ids.length === 0) { setLikedVideos([]); return; }
			const settled = await Promise.allSettled(ids.slice(0, LIKED_VIDEO_LIMIT).map(id => getVideo(id)));
			setLikedVideos(
				settled
					.filter(r => r.status === "fulfilled" && r.value)
					.map(r => r.value)
					// A liked video the creator has since deleted comes back without an id — drop it
					// rather than render a dead tile.
					.filter(v => (v.video_id ?? v.id) != null),
			);
		}).catch(() => {});
		getMySubscriptions().then(data => {
			const list = Array.isArray(data) ? data : (data?.data ?? []);
			setSubscriptionChannels(list.map(ch => ({
				channelId: ch.channel_id ?? ch.id,
				name: ch.channel_name ?? ch.name ?? "Channel",
				handle: ch.handle ?? ch.channel_handle ?? "",
				thumb: ch.channel_photo ?? ch.photo ?? ch.avatar_url ?? null,
				avatar: (ch.channel_name ?? ch.name ?? "C")[0].toUpperCase(),
				subscribers: ch.subscriber_count ?? 0,
			})));
		}).catch(() => {});
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [targetUserId, handleResolving]);

	// Wishlist: fetch when tab becomes active (lazy-load)
	useEffect(() => {
		if (tab !== "Wishlist" || wishlistLoaded) return;
		const uid = targetUserId ?? myId;
		if (!uid) return;
		setWishlistLoading(true);
		getWishlist(uid)
			.then(data => { setWishlistItems(Array.isArray(data) ? data : []); setWishlistLoaded(true); })
			.catch(() => { setWishlistItems([]); setWishlistLoaded(true); })
			.finally(() => setWishlistLoading(false));
	 
	}, [tab, targetUserId, myId, wishlistLoaded]);

	// Wishlist search debounce
	useEffect(() => {
		if (!addItemModal) return;
		if (!addItemSearch.trim() && addItemType === "all") { setAddItemResults([]); return; }
		setAddItemSearching(true);
		const t = setTimeout(() => {
			searchWishlistItems(addItemSearch.trim(), addItemType === "all" ? "" : addItemType)
				.then(r => { setAddItemResults(Array.isArray(r) ? r : []); })
				.catch(() => setAddItemResults([]))
				.finally(() => setAddItemSearching(false));
		}, 400);
		return () => clearTimeout(t);
	 
	}, [addItemSearch, addItemType, addItemModal]);

	// Profile Insights widget: fetch wallet balance for own profile
	useEffect(() => {
		if (isViewingOther) return;
		import('../api/client.js').then(({ default: client }) => {
			client.get('/wallet/me').then(r => setWalletBalance(parseFloat(r.data?.balance ?? 0))).catch(() => {});
		});
	 
	}, [isViewingOther]);

	// Profile Insights widget: rotate every 60s
	useEffect(() => {
		if (isMobile) return;
		let elapsed = 0;
		const TICK = 600;
		const NUM_SLIDES = 4;
		const id = setInterval(() => {
			elapsed += TICK;
			setDiscoverProgress(Math.min(100, Math.round((elapsed / DISCOVER_INTERVAL) * 100)));
			if (elapsed >= DISCOVER_INTERVAL) {
				elapsed = 0;
				setDiscoverProgress(0);
				setDiscoverIdx(prev => (prev + 1) % NUM_SLIDES);
			}
		}, TICK);
		return () => clearInterval(id);
	 
	}, [isMobile]);

	useEffect(() => {
		if (!moreMenuOpen) return;
		const handler = (e) => { if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) setMoreMenuOpen(false); };
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [moreMenuOpen]);
	useEffect(() => {
		if (isViewingOther) return;
		const handler = (e) => {
			if (e.detail) {
				setUserData(prev => ({ ...prev, ...e.detail }));
				const patch = {};
				if (e.detail.profile_pic_url) patch.profile_pic_url = e.detail.profile_pic_url;
				if (e.detail.name) patch.display_name = e.detail.name;
				if (e.detail.bio) patch.bio = e.detail.bio;
				if (Object.keys(patch).length) setSocialProfile(prev => prev ? { ...prev, ...patch } : prev);
			}
			getMyProfile().then(d => { const p = d?.data ?? d; if (p) { setSocialProfile({ ...p, follower_count: p.follower_count ?? p._count?.followers ?? 0, following_count: p.following_count ?? p._count?.following ?? 0 }); if (p.banner_url) setBannerUrl(p.banner_url); } }).catch(() => {});
		};
		window.addEventListener("strug:user-updated", handler);
		return () => window.removeEventListener("strug:user-updated", handler);
	}, [isViewingOther]);
	// #422: the "most viewed" item — a video, a town hall post, or a social post, whichever the
	// backend says has the most views. Public, so it renders on anyone's profile.
	useEffect(() => {
		const uid = isViewingOther ? targetUserId : myId;
		if (!uid) { setMostViewed(null); return; }
		let cancelled = false;
		getMostViewedForUser(uid)
			.then((d) => { if (!cancelled) setMostViewed(d); })
			.catch(() => { if (!cancelled) setMostViewed(null); });
		return () => { cancelled = true; };
	}, [isViewingOther, targetUserId, myId]);

	// PROFILE-P13: if no referral code is cached on the user, fetch it once.
	useEffect(() => {
		if (isViewingOther || refCodeChecked) return;
		if (userData?.ref_code) { setRefCodeChecked(true); return; }
		setRefCodeChecked(true);
		getMyReferralCode()
			.then(d => {
				const code = d?.ref_code ?? d?.code ?? d?.data?.ref_code ?? d?.data?.code ?? null;
				if (code) setFetchedRefCode(code);
			})
			.catch(() => {});
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isViewingOther, userData?.ref_code]);

	// Platform Today + Did You Know tips from live backend aggregates
	useEffect(() => {
		let alive = true;
		setPlatformStatsLoading(true);
		getPlatformToday()
			.then((data) => {
				if (!alive || !data) return;
				setPlatformStats({
					active_sellers: data.active_sellers ?? 0,
					orders_today: data.orders_today ?? 0,
					live_streams: data.live_streams ?? 0,
					videos_watched_today: data.videos_watched_today ?? 0,
				});
				const tips = Array.isArray(data.tips) ? data.tips : [];
				setPlatformTips(tips);
				setDykIndex(0);
			})
			.catch(() => {
				if (!alive) return;
				setPlatformStats(null);
				setPlatformTips([]);
			})
			.finally(() => { if (alive) setPlatformStatsLoading(false); });
		return () => { alive = false; };
	}, []);

	// Trending tags from public discovery API (only when the widget is enabled)
	useEffect(() => {
		if (!leftWidgets.includes("trending")) return undefined;
		let alive = true;
		setTrendingLoading(true);
		getTrendingTags()
			.then((res) => {
				if (!alive) return;
				const rows = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
				setTrendingTags(rows.filter((t) => t && (t.name || t.tag_name)));
			})
			.catch(() => { if (alive) setTrendingTags([]); })
			.finally(() => { if (alive) setTrendingLoading(false); });
		return () => { alive = false; };
	}, [leftWidgets]);

	// Curated profile sidebar content + book of day + weather + poll
	useEffect(() => {
		let alive = true;
		getPlatformProfileContent()
			.then((data) => {
				if (!alive || !data) return;
				setProfileContent(data);
				if (Array.isArray(data.daily_goals) && data.daily_goals.length) setDailyGoalsLabels(data.daily_goals);
				if (data.daily_challenge?.text) setDailyChallengeText(data.daily_challenge.text);
				const quotes = Array.isArray(data.quotes) ? data.quotes : [];
				if (quotes.length) setQuoteIndex((i) => i % quotes.length);
			})
			.catch(() => {});
		getPlatformBookOfDay()
			.then((book) => { if (alive && book) setBookOfDay(book); })
			.catch(() => {});
		setWeatherLoading(true);
		getPlatformWeather()
			.then((w) => { if (!alive) return; setWeather(w || null); setWeatherError(''); })
			.catch(() => { if (!alive) return; setWeather(null); setWeatherError('Weather unavailable'); })
			.finally(() => { if (alive) setWeatherLoading(false); });
		getPlatformProfilePoll()
			.then((poll) => {
				if (!alive || !poll) return;
				setPollMeta({
					question: poll.question || '',
					options: Array.isArray(poll.options) ? poll.options : [],
					tallies: poll.tallies || {},
				});
				setPollVote(poll.my_vote || null);
			})
			.catch(() => {});
		return () => { alive = false; };
	}, []);

	// Reading-list membership for book of the day (own profile / signed-in)
	useEffect(() => {
		if (!bookOfDay?.id || isViewingOther || !myId) {
			setBookInReadingList(false);
			return undefined;
		}
		let alive = true;
		getSaves('book')
			.then((res) => {
				if (!alive) return;
				const items = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
				setBookInReadingList(items.some((i) => String(i.entity_id) === String(bookOfDay.id)));
			})
			.catch(() => { if (alive) setBookInReadingList(false); });
		return () => { alive = false; };
	}, [bookOfDay?.id, isViewingOther, myId]);

	// Sync sticky / goals / challenge from the server on own profile
	useEffect(() => {
		if (isViewingOther || !myId) return undefined;
		let alive = true;
		getPlatformSidebarState()
			.then((state) => {
				if (!alive || !state) return;
				setStickyText(typeof state.sticky_text === 'string' ? state.sticky_text : '');
				setGoals(Array.isArray(state.goals) ? state.goals.map(Boolean).slice(0, 3) : [false, false, false]);
				const today = new Date().toDateString();
				setChallengeDone(state.challenge_done_date === today);
			})
			.catch(() => {});
		return () => { alive = false; };
	}, [isViewingOther, myId]);

	const persistSidebarState = useCallback((patch) => {
		if (isViewingOther || !myId) return;
		clearTimeout(sidebarPersistTimer.current);
		sidebarPersistTimer.current = setTimeout(() => {
			putPlatformSidebarState({
				sticky_text: patch.sticky_text ?? stickyText,
				goals: patch.goals ?? goals,
				challenge_done_date: patch.challenge_done_date !== undefined
					? patch.challenge_done_date
					: (challengeDone ? new Date().toDateString() : null),
			}).catch(() => {});
		}, 400);
	}, [isViewingOther, myId, stickyText, goals, challengeDone]);

	const toggleReadingList = async () => {
		if (!bookOfDay?.id || bookSaveBusy || isViewingOther || !myId) return;
		setBookSaveBusy(true);
		try {
			const res = await toggleSave('book', String(bookOfDay.id), {
				title: bookOfDay.title,
				sub: bookOfDay.author,
				accent: bookOfDay.color,
			});
			setBookInReadingList(!!res?.saved);
		} catch {
			/* keep prior state */
		} finally {
			setBookSaveBusy(false);
		}
	};

	// DYK auto-rotation every 9 seconds
	useEffect(() => {
		if (platformTips.length < 2) return undefined;
		dykTimerRef.current = setInterval(() => {
			setDykFading(true);
			setTimeout(() => { setDykIndex(i => (i + 1) % platformTips.length); setDykFading(false); }, 300);
		}, 9000);
		return () => clearInterval(dykTimerRef.current);
	}, [platformTips.length]);


	const displayName = socialProfile?.display_name || userData?.name || "Your Name";
	// PROFILE-P15: don't derive a handle from the email local-part (PII leak); fall back to
	// the username, then a neutral placeholder.
	const handle = socialProfile?.handle || userData?.username || "yourhandle";
	const bio = socialProfile?.bio || "";
	// #436: opt-in "available for work" status. Absent for almost everyone — render nothing then.
	const workStatus = socialProfile?.work_status || null;
	const dykTip = platformTips[dykIndex] || null;
	const quotesList = Array.isArray(profileContent?.quotes) ? profileContent.quotes : [];
	const activeQuote = quotesList[quoteIndex] || profileContent?.quote_of_day || null;
	const featureSpotlight = profileContent?.feature_spotlight || null;
	const whatsNewItems = Array.isArray(profileContent?.whats_new) ? profileContent.whats_new : [];
	const platformNewsItems = Array.isArray(profileContent?.platform_news) ? profileContent.platform_news : [];
	const spinItems = Array.isArray(profileContent?.spin_items) && profileContent.spin_items.length
		? profileContent.spin_items
		: ['Movie Night', 'Game Night', 'Go Outside', 'Call a Friend', 'Cook Something', 'Read a Book'];
	const spinColors = Array.isArray(profileContent?.spin_colors) && profileContent.spin_colors.length
		? profileContent.spin_colors
		: SPIN_COLORS_FALLBACK;
	const bookCard = bookOfDay;
	const pollOptions = Array.isArray(pollMeta.options) && pollMeta.options.length ? pollMeta.options : [];
	const pollQuestion = pollMeta.question || 'Which Strug feature do you use most?';
	// Join date for the profile being viewed (not the signed-in viewer when peeking at others).
	const profileJoinedAt = resolveProfileJoinedAt({
		socialCreatedAt: socialProfile?.created_at,
		userCreatedAt: userData?.created_at,
		isViewingOther,
	});
	const isEarlyAdopter = isEarlyAdopterFromJoinDate(profileJoinedAt);
	const showEarlyAdopterBadge = shouldShowEarlyAdopterBadge(profileJoinedAt);

	const setWorkStatus = async (next) => {
		if (workStatusSaving || isViewingOther) return;
		setWorkStatusSaving(true);
		setWorkStatusError("");
		const prevProfile = socialProfile;
		setSocialProfile((p) => mergeWorkStatusProfile(p, next, null));
		setWorkStatusMenuOpen(false);
		try {
			const res = await updateSocialProfile({ work_status: next });
			const updated = res?.data ?? res;
			setSocialProfile((p) => mergeWorkStatusProfile(p, next, updated && typeof updated === "object" ? updated : null));
		} catch {
			setSocialProfile(rollbackWorkStatusProfile(prevProfile));
			setWorkStatusError(t("userProfile.workStatusSaveFailed", { defaultValue: "Couldn't update work status. Try again." }));
		} finally {
			setWorkStatusSaving(false);
		}
	};
	const followerCount = socialProfile?.follower_count ?? socialProfile?.followers_count ?? 0;
	const followingCount = socialProfile?.following_count ?? socialProfile?.followings_count ?? 0;
	// #10: the "Posts" number must match the posts actually shown. The grid (userPosts)
	// is the deduplicated union of ALL the user's published social_feed posts AND their
	// Town Hall posts. The old server `_count.posts` counted ONLY social_feed rows
	// (including unpublished drafts, and excluding Town Hall), so it never matched the
	// grid. Count the rendered set instead.
	const postCount = userPosts.length;
	// #422: the pinned post is now the one the OWNER chose, not a guess. It used to be derived
	// client-side as the most-liked post — and since posts arrive newest-first, a tie (everything
	// at 0 likes) just kept the latest one, which is exactly what the report complained about.
	// The choice lives on the profile (pinned_post_id/pinned_post_type) and is served publicly,
	// so a visitor sees the same pin the owner set. Nothing pinned => no card, which is what
	// "unpin" has to mean.
	const pinnedRef = pinnedOverride !== undefined
		? pinnedOverride
		: (socialProfile?.pinned_post_id
			? { id: socialProfile.pinned_post_id, type: socialProfile.pinned_post_type || "social" }
			: null);
	const pinnedPost = pinnedRef ? userPosts.find((p) => samePost(p, pinnedRef)) ?? null : null;
	const pinnedText = pinnedPost ? (pinnedPost.caption_text ?? pinnedPost.content ?? pinnedPost.caption ?? pinnedPost.text ?? "") : "";
	// #440: "pinned videos, images, etc should show a preview of the content". They didn't: the
	// pinned card fed whatever media_url it found straight into an <img>, so pinning a video put an
	// .mp4/.m3u8 in an image tag, decoding failed, and the onError handler hid the element — leaving
	// a pinned card with no preview at all. Same class of bug isVideoAtt() was added for (#11).
	const pinnedAtt = pinnedPost?.social_media_attachments?.[0] ?? null;
	const pinnedMedia = pinnedAtt?.media_url ?? pinnedPost?.media_url ?? undefined;
	const pinnedIsVideo = pinnedAtt ? isVideoAtt(pinnedAtt) : pinnedPost?.media_type === "video";
	// Town hall videos carry a real poster; social attachments have no thumbnail column, so those
	// fall back to <video preload="metadata">, which paints the first frame without streaming.
	const pinnedPoster = pinnedPost?._raw?.thumbnail_url ?? null;
	// #422: pin / unpin one of your own posts. Optimistic, and reverts if the server refuses
	// (the endpoint rejects pinning a post you don't own).
	const togglePin = useCallback(async (post) => {
		if (pinBusy) return;
		const ref = postRef(post);
		const currentlyPinned = !!pinnedPost && samePost(post, postRef(pinnedPost));
		const next = currentlyPinned ? null : ref;
		const prev = pinnedOverride;
		setPinnedOverride(next);
		setPinBusy(true);
		try {
			await setPinnedPost(next ? next.id : null, next ? next.type : "social");
		} catch {
			setPinnedOverride(prev); // server said no — put it back
		} finally {
			setPinBusy(false);
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pinBusy, pinnedOverride, pinnedPost]);

	// #423: the referral code is public. When viewing someone else it MUST come from their
	// profile payload — userData is always the signed-in user, so reading it here would print
	// your own code on their page.
	const refCode = isViewingOther
		? (socialProfile?.ref_code || null)
		: (userData?.ref_code || fetchedRefCode);
	const joinedDate = profileJoinedAt && !Number.isNaN(profileJoinedAt.getTime())
		? profileJoinedAt.toLocaleDateString("en-US", { month: "long", year: "numeric" })
		: null;
	const imagePosts = userPosts.filter(p => p.social_media_attachments?.length || p.media_url || p.image_url || p.media_urls?.length);

	// #430: a post opened from this profile renders the app's actual post view — the same one the
	// Feed and Town Hall use — so it has media, like, save/repost, comments and view count, rather
	// than the stripped-down comments sheet the profile used to show.
	if (detailPost) {
		const back = () => setDetailPost(null);
		if (detailPost.type === "townhall") {
			// SocialPostDetailPage persists its own like/bookmark via toggleSavePost / toggleTownHallLike; repost is a callback.
			return (
				<SocialPostDetailPage
					post={detailPost.post}
					onBack={back}
					onRepost={(p) => { if (p?.id) toggleTownHallRepost(p.id).catch(() => {}); }}
					onLike={(p, next) => {
						const target = userPosts.find(x => String(x.th_id) === String(p.id) || String(postKey(x)) === String(p.id));
						if (target) return toggleLike(target, next);
						return toggleLike({ ...p, _source: "townhall", th_id: p.id }, next);
					}}
				/>
			);
		}
		// FeedPostDetailPage keeps its own optimistic like state and hands us the post ID to
		// persist — so route it through the profile's existing handler, which also keeps the
		// profile's post list in step.
		return (
			<FeedPostDetailPage
				post={detailPost.post}
				onBack={back}
				onToggleLike={(id) => {
					const target = userPosts.find((x) =>
						String(postKey(x)) === String(id)
						|| String(x.social_post_id) === String(id)
						|| String(x.post_id) === String(id)
						|| String(x.id) === String(id)
					);
					if (target) return toggleLike(target);
					return toggleLikeAPI(id);
				}}
				onToggleSave={() => {
					const id = detailPost.post.id;
					toggleBookmarkAPI(id).catch(() => {});
				}}
			/>
		);
	}

	if (loading) return (
		<div style={{ minHeight: "100dvh", paddingLeft: isMobile ? 16 : 108 }} className="bg-bg">
			<Skel w="100%" h={210} r={0} />
			<div style={{ padding: isMobile ? "0 16px" : "0 40px" }}>
				<Skel w={96} h={96} r="50%" style={{ marginTop: -48, border: "4px solid var(--color-bg)" }} />
				<Skel w={220} h={26} r={8} style={{ marginTop: 14 }} />
				<Skel w={160} h={14} r={6} style={{ marginTop: 8 }} />
				<div style={{ display: "flex", gap: 18, marginTop: 16, marginBottom: 24 }}>
					<Skel w={72} h={14} r={6} />
					<Skel w={72} h={14} r={6} />
					<Skel w={72} h={14} r={6} />
				</div>
				<div style={{ display: "flex", gap: 16, marginBottom: 22 }}>
					{Array.from({ length: 5 }).map((_, i) => <SkeletonCircle key={i} />)}
				</div>
				<SkeletonTownHallFeed count={3} />
			</div>
		</div>
	);

	// PROFILE-007: 404 / error state for other-user profiles
	if (isViewingOther && profileError && !socialProfile) return (
		<div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, paddingLeft: isMobile ? 16 : 108 }} className="bg-bg">
			<svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
			<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.04em" }} className="text-text-primary">{t("userProfile.notFoundTitle")}</p>
			<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }} className="text-text-secondary">{t("userProfile.notFoundBody")}</p>
			<button onClick={() => { delete window.__profileTargetId; onNavigate?.('home'); }} style={{ padding: "9px 22px", background: "#2563eb", border: "none", borderRadius: 20, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{t("userProfile.goHome")}</button>
		</div>
	);

	return (
		<>
		<style>{`
			@keyframes sbPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.55;transform:scale(0.82)}}
			@keyframes sbFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
			@keyframes sbShimmer{0%{background-position:-200% center}100%{background-position:200% center}}
			@keyframes sbGlow{0%,100%{box-shadow:0 0 10px 2px rgba(139,92,246,0.18)}50%{box-shadow:0 0 24px 8px rgba(139,92,246,0.5)}}
			@keyframes sbBorderBreath{0%,100%{opacity:0.82}50%{opacity:1}}
		`}</style>
		<div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }} className="bg-bg">
			{isViewingOther && (
				// Floats over the cover photo, so it keeps a fixed dark glass background + white
				// text/border regardless of theme — it needs to read the same on any photo behind it.
				<button onClick={() => {
						delete window.__profileTargetId;
						// Return to the actual previous page via browser history (nav pushes
						// history state). Fall back to home only if there's nothing to go back to.
						const here = window.location.pathname;
						window.history.back();
						setTimeout(() => { if (window.location.pathname === here) onNavigate?.('home'); }, 120);
					}} aria-label={t("common.back")} style={{ position: "absolute", top: 16, left: isMobile ? 16 : 108, zIndex: 20, display: "flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "6px 14px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", backdropFilter: "blur(8px)" }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>{t("common.back")}
				</button>
			)}
			{/* Cover photo — full width, extends behind sidebar */}
			{/* #457 cover photos: the banner gradient is now ALWAYS on the container rather than only when
			    bannerUrl is null. A loaded banner covers it completely (100%×100%, objectFit cover), so
			    the rendered result is unchanged — but when the blob 404s, SafeImage swaps in the same
			    dot-grid node the no-banner case uses and the gradient behind it is already there, so a
			    broken banner is indistinguishable from no banner instead of a broken-image icon. */}
			{/* Cover placeholder gradient + dot-grid fallback stay a fixed dark navy/blue regardless of
			    theme — a loaded photo covers them completely, and the no-photo/404 state needs to read
			    as a photo backdrop, not a plain page panel. The "Change cover" pill sitting on top is a
			    dark glass chip for legibility over whatever photo is behind it, so it also stays fixed
			    (mirrors the hero-photo treatment in Hub.jsx). */}
			<div style={{ height: 210, background: "linear-gradient(135deg,#1e3a5f 0%,#0f2744 50%,#2563eb30 100%)", position: "relative", overflow: "hidden" }}>
				<SafeImage loading="lazy" decoding="async" src={bannerUrl} alt="Cover" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
					fallback={<div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />} />
				<div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(to top, var(--color-bg), transparent)" }} />
				{!isViewingOther && (
					<>
						<input ref={bannerInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleBannerChange} />
						<button onClick={() => bannerInputRef.current?.click()} aria-label="Change cover photo" style={{ position: "absolute", bottom: 16, right: 16, display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", backdropFilter: "blur(6px)" }}>
							<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
							{t("userProfile.changeCover")}
						</button>
						{bannerError && <div role="alert" style={{ position: "absolute", bottom: 16, left: isMobile ? 16 : 120, padding: "6px 12px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, color: "#fca5a5", fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{bannerError}</div>}
					</>
				)}
			</div>

			{/* Content area — clears nav sidebar; 3-column flex on desktop */}
			<div style={{ padding: isMobile ? "0 16px" : "0 20px 0 108px" }}>
			<div style={{ display: !isMobile && !isTablet ? "flex" : "block", gap: 44, alignItems: "flex-start", maxWidth: !isMobile && !isTablet ? 1360 : 880, margin: "0 auto" }}>

			{/* ── LEFT SIDEBAR (desktop only) ── */}
			{!isMobile && !isTablet && (
				<div style={{ width: 238, flexShrink: 0, position: "sticky", top: 20, alignSelf: "flex-start", marginTop: 20, maxHeight: "calc(100vh - 40px)" }}>
				<aside style={{ display: "flex", flexDirection: "column", paddingTop: 3, paddingBottom: 24 }}>

					{/* Did You Know — tips from GET /platform/today */}
					<div
						onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px var(--color-shadow)"; }}
						onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
						style={{ borderRadius: 14, padding: "14px 16px", marginBottom: 12, transition: "transform 0.2s, box-shadow 0.2s" }} className="bg-surface-raised border border-border">
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
								<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em" }} className="text-text-secondary">Did You Know?</span>
								<WidgetSourceHint kind="live" />
							</div>
							{platformTips.length > 1 && (
							<div style={{ display: "flex", gap: 2 }}>
								<button type="button" aria-label="Previous tip" onClick={() => { setDykFading(true); setTimeout(() => { setDykIndex(i => (i - 1 + platformTips.length) % platformTips.length); setDykFading(false); }, 200); }} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 5px", borderRadius: 4, fontSize: 15, lineHeight: 1 }} className="text-text-muted">‹</button>
								<button type="button" aria-label="Next tip" onClick={() => { setDykFading(true); setTimeout(() => { setDykIndex(i => (i + 1) % platformTips.length); setDykFading(false); }, 200); }} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 5px", borderRadius: 4, fontSize: 15, lineHeight: 1 }} className="text-text-muted">›</button>
							</div>
							)}
						</div>
						<div style={{ opacity: dykFading ? 0 : 1, transition: "opacity 0.3s", minHeight: 68 }}>
							{platformStatsLoading ? (
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.55, margin: 0 }} className="text-text-muted">Loading…</p>
							) : dykTip ? (
								<>
									<div style={{ width: 28, height: 28, borderRadius: 8, background: `${dykTip.color || "#2563eb"}22`, border: `1px solid ${dykTip.color || "#2563eb"}44`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
										<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={dykTip.color || "#2563eb"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
									</div>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.55, margin: 0 }} className="text-text-secondary">{dykTip.text}</p>
								</>
							) : (
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.55, margin: 0 }} className="text-text-muted">Platform tips will appear when stats are available.</p>
							)}
						</div>
						{platformTips.length > 1 && (
						<div style={{ display: "flex", gap: 4, marginTop: 10, justifyContent: "center" }}>
							{platformTips.map((_, di) => (
								<button type="button" key={di} aria-label={`Tip ${di + 1}`} onClick={() => { setDykFading(true); setTimeout(() => { setDykIndex(di); setDykFading(false); }, 200); }} style={{ width: di === dykIndex ? 16 : 6, height: 6, borderRadius: 3, background: di === dykIndex ? "#2563eb" : "var(--color-border)", border: "none", cursor: "pointer", padding: 0, transition: "width 0.2s, background 0.2s" }} />
							))}
						</div>
						)}
					</div>

					{/* Explore Features — optional widget */}
					{leftWidgets.includes("explore") && (
					<div
						onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px var(--color-shadow)"; }}
						onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
						style={{ borderRadius: 14, padding: "14px 16px", marginBottom: 12, transition: "transform 0.2s, box-shadow 0.2s" }} className="bg-surface-raised border border-border">
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
								<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }} className="text-text-secondary">Explore</p>
								<WidgetSourceHint kind="shortcuts" />
							</div>
							<Tooltip text="Remove widget"><button aria-label="Remove widget" onClick={() => removeWidget("left", "explore")} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 4, display: "flex", alignItems: "center", lineHeight: 1 }} className="text-text-muted"><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></Tooltip>
						</div>
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
							{EXPLORE_FEATURES.map(f => (
								<button key={f.nav} onClick={() => onNavigate?.(f.nav)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", borderRadius: 9, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, textAlign: "left", transition: "background 0.15s, color 0.15s" }} className="bg-surface-raised border border-border-subtle text-text-secondary"
									onMouseEnter={e => { e.currentTarget.style.background = "rgba(37,99,235,0.14)"; e.currentTarget.style.color = "#93c5fd"; }}
									onMouseLeave={e => { e.currentTarget.style.background = "var(--color-surface-raised)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}>
									<div style={{ width: 18, height: 18, borderRadius: 5, background: f.bg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
										<svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={f.d}/>{f.d2 && <path d={f.d2}/>}</svg>
									</div>
									{f.label}
								</button>
							))}
						</div>
					</div>
					)}

					{/* #10: Pinned post — real top post, replaces placeholder filler on the left. */}
					{pinnedPost && (
						<div
							// #440: clicking the pinned card only switched to the Posts tab and left you to
							// find the post yourself. Open it.
							onClick={() => openPostDetail(pinnedPost)}
							onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px var(--color-shadow)"; }}
							onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
							style={{ cursor: "pointer", background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.28)", borderRadius: 14, padding: "14px 16px", marginBottom: 12, transition: "transform 0.2s, box-shadow 0.2s" }}>
							<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
								<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
								<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 13, color: "rgba(96,165,250,0.95)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Pinned Post</span>
								{/* #422: unpin — only the owner sees this. */}
								{!isViewingOther && (
									<button
										onClick={(e) => { e.stopPropagation(); togglePin(pinnedPost); }}
										disabled={pinBusy}
										title="Unpin this post"
										style={{ marginLeft: "auto", background: "none", border: "none", cursor: pinBusy ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 6 }} className="text-text-secondary"
									>
										Unpin
									</button>
								)}
							</div>
							{pinnedMedia && (
								<div style={{ position: "relative", width: "100%", height: 120, borderRadius: 10, overflow: "hidden", marginBottom: 8, background: pinnedIsVideo ? "#000" : "var(--color-surface-raised)" }}>
									{pinnedIsVideo ? (
										<>
											{/* A dead poster blob falls through to the <video> first-frame path, which is exactly
											    what a post with no poster already does. */}
											<SafeImage loading="lazy" decoding="async" src={pinnedPoster} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
												fallback={<video src={pinnedMedia} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />} />
											{/* Play-button scrim + icon stay a fixed dark tint / white triangle regardless of
											    theme — it sits on the video thumbnail itself, not the page. Same treatment
											    on every play overlay below. */}
											<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.18)", pointerEvents: "none" }}>
												<svg width={26} height={26} viewBox="0 0 24 24" fill="rgba(255,255,255,0.92)" stroke="none" style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.5))" }}><polygon points="6 4 20 12 6 20 6 4" /></svg>
											</div>
										</>
									) : (
										<SafeImage loading="lazy" decoding="async" src={pinnedMedia} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
											fallback={<MediaPlaceholder style={{ width: "100%", height: "100%" }} />} />
									)}
								</div>
							)}
							{pinnedText && (
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5, margin: "0 0 8px", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }} className="text-text-secondary">{pinnedText}</p>
							)}
							<div style={{ display: "flex", gap: 16, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }} className="text-text-secondary">
								<span style={{ display: "flex", alignItems: "center", gap: 5 }}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>{likeCountOf(pinnedPost)}</span>
								<span style={{ display: "flex", alignItems: "center", gap: 5 }}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>{commentCountOf(pinnedPost)}</span>
							</div>
						</div>
					)}
					{/* #422: most viewed — the single most-watched thing this user has published, across
					    the whole platform: a video from the Videos section, a town hall post, or a
					    social post. Sits directly under the pinned card, as requested. */}
					{mostViewed && (
						<div
							onClick={() => openMostViewedFromProfile(mostViewed, onNavigate)}
							onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px var(--color-shadow)"; }}
							onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
							style={{ cursor: "pointer", background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.28)", borderRadius: 14, padding: "14px 16px", marginBottom: 12, transition: "transform 0.2s, box-shadow 0.2s" }}>
							<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
								<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
								<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 13, color: "rgba(192,132,252,0.95)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Most Viewed</span>
								<span style={{ marginLeft: "auto", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: "rgba(192,132,252,0.8)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
									{mostViewed.type === "video" ? "Video" : mostViewed.type === "townhall" ? "Town Hall" : "Post"}
								</span>
							</div>
							{mostViewed.image && (
								<div style={{ width: "100%", height: 120, borderRadius: 10, overflow: "hidden", marginBottom: 8 }} className="bg-surface-raised">
									<SafeImage loading="lazy" decoding="async" src={mostViewed.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
										fallback={<MediaPlaceholder style={{ width: "100%", height: "100%" }} />} />
								</div>
							)}
							{mostViewed.text && (
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5, margin: "0 0 8px", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }} className="text-text-secondary">{mostViewed.text}</p>
							)}
							<div style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }} className="text-text-secondary">
								<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
								{mostViewed.views.toLocaleString()} {mostViewed.views === 1 ? "view" : "views"}
							</div>
						</div>
					)}
					{/* What's New — optional widget */}
					{leftWidgets.includes("whats-new") && (
					<div
						onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px var(--color-shadow)"; }}
						onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
						style={{ borderRadius: 14, padding: "14px 16px", marginBottom: 12, transition: "transform 0.2s, box-shadow 0.2s" }} className="bg-surface-raised border border-border">
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
								<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }} className="text-text-secondary">{"What's New"}</p>
								<WidgetSourceHint kind="live" />
							</div>
							<Tooltip text="Remove widget"><button aria-label="Remove widget" onClick={() => removeWidget("left", "whats-new")} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 4, display: "flex", alignItems: "center", lineHeight: 1 }} className="text-text-muted"><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></Tooltip>
						</div>
						<div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
							{whatsNewItems.map((item, wi) => (
								<div key={wi} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
									<div style={{ width: 6, height: 6, borderRadius: "50%", background: "#2563eb", flexShrink: 0, marginTop: 5 }} />
									<div>
										<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5, margin: 0 }} className="text-text-secondary">{item.text}</p>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }} className="text-text-muted">{item.date}</span>
									</div>
								</div>
							))}
						</div>
					</div>
					)}

					{/* Trending — live tags from GET /social-discovery/trending-tags */}
					{leftWidgets.includes("trending") && (
					<div
						onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px var(--color-shadow)"; }}
						onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
						style={{ borderRadius: 14, padding: "14px 16px", marginBottom: 12, transition: "transform 0.2s, box-shadow 0.2s" }} className="bg-surface-raised border border-border">
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
								<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }} className="text-text-secondary">Trending</p>
								<WidgetSourceHint kind="live" />
							</div>
							<Tooltip text="Remove widget"><button aria-label="Remove widget" onClick={() => removeWidget("left", "trending")} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 4, display: "flex", alignItems: "center", lineHeight: 1 }} className="text-text-muted"><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></Tooltip>
						</div>
						<div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
							{trendingLoading ? (
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }} className="text-text-muted">Loading…</span>
							) : trendingTags.length === 0 ? (
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }} className="text-text-muted">No trending tags yet.</span>
							) : trendingTags.map((tag) => {
								const label = formatTrendingTagLabel(tag);
								return (
									<button
										type="button"
										key={tag.tag_id || label}
										onClick={() => onNavigate?.("community")}
										title={tag.post_count != null ? `${tag.post_count} posts` : undefined}
										style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "#60a5fa", background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 20, padding: "5px 11px", cursor: "pointer", transition: "background 0.15s" }}
										onMouseEnter={e => { e.currentTarget.style.background = "rgba(37,99,235,0.22)"; }}
										onMouseLeave={e => { e.currentTarget.style.background = "rgba(37,99,235,0.1)"; }}
									>
										{label}
									</button>
								);
							})}
						</div>
					</div>
					)}

					{/* Community Poll — optional widget, own profile only */}
					{leftWidgets.includes("community-poll") && !isViewingOther && (
						<div
							onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px var(--color-shadow)"; }}
							onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
							style={{ borderRadius: 14, padding: "14px 16px", marginBottom: 12, transition: "transform 0.2s, box-shadow 0.2s" }} className="bg-surface-raised border border-border">
							<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
								<div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
									<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }} className="text-text-secondary">Community Poll</p>
									<WidgetSourceHint kind="live" />
								</div>
								<Tooltip text="Remove widget"><button aria-label="Remove widget" onClick={() => removeWidget("left", "community-poll")} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 4, display: "flex", alignItems: "center", lineHeight: 1 }} className="text-text-muted"><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></Tooltip>
							</div>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5, marginBottom: 10 }} className="text-text-secondary">{pollQuestion}</p>
							{pollVote ? (
								<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
									{pollOptions.map(opt => (
										<div key={opt} style={{ padding: "7px 12px", borderRadius: 8, background: opt === pollVote ? "rgba(37,99,235,0.18)" : "var(--color-surface-raised)", border: `1px solid ${opt === pollVote ? "rgba(37,99,235,0.38)" : "var(--color-border-subtle)"}`, display: "flex", alignItems: "center", gap: 8 }}>
											{opt === pollVote && <svg width={9} height={9} viewBox="0 0 24 24" fill="#2563eb"><circle cx="12" cy="12" r="10"/></svg>}
											<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: opt === pollVote ? "#93c5fd" : "var(--color-text-secondary)", fontWeight: opt === pollVote ? 700 : 400 }}>{opt}</span>
										</div>
									))}
									<button disabled={pollBusy} onClick={async () => { setPollBusy(true); try { await clearPlatformProfilePollVote(); const poll = await getPlatformProfilePoll(); if (poll) { setPollMeta({ question: poll.question || '', options: Array.isArray(poll.options) ? poll.options : [], tallies: poll.tallies || {} }); setPollVote(poll.my_vote || null); } else { setPollVote(null); } } catch {} finally { setPollBusy(false); } }} style={{ marginTop: 4, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 10, textAlign: "left", padding: 0 }} className="text-text-muted">Change vote</button>
								</div>
							) : (
								<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
									{pollOptions.map(opt => (
										<button key={opt} disabled={pollBusy} onClick={async () => { setPollBusy(true); try { await votePlatformProfilePoll(opt); const poll = await getPlatformProfilePoll(); if (poll) { setPollMeta({ question: poll.question || '', options: Array.isArray(poll.options) ? poll.options : [], tallies: poll.tallies || {} }); setPollVote(poll.my_vote || null); } else { setPollVote(opt); } } catch {} finally { setPollBusy(false); } }} style={{ padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "left", transition: "background 0.15s" }} className="bg-surface-raised border border-border text-text-secondary"
											onMouseEnter={e => { e.currentTarget.style.background = "rgba(37,99,235,0.12)"; e.currentTarget.style.borderColor = "rgba(37,99,235,0.3)"; }}
											onMouseLeave={e => { e.currentTarget.style.background = "var(--color-surface-raised)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}>
											{opt}
										</button>
									))}
								</div>
							)}
						</div>
					)}

					{/* Quote of the Day */}
					{leftWidgets.includes("quote-of-day") && (
						<div onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 8px 24px var(--color-shadow)";}} onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}} style={{background:"linear-gradient(135deg,rgba(139,92,246,0.18) 0%,rgba(10,10,20,0.95) 100%)",border:"1px solid rgba(139,92,246,0.3)",borderRadius:14,padding:"14px 16px",marginBottom:12,transition:"transform 0.2s,box-shadow 0.2s",position:"relative",overflow:"hidden"}}>
							<div style={{position:"absolute",top:-10,left:8,fontFamily:"Georgia,serif",fontSize:64,color:"rgba(139,92,246,0.12)",lineHeight:1,pointerEvents:"none",userSelect:"none"}}>"</div>
							<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
								<div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
									<span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:13,color:"rgba(139,92,246,0.9)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Quote of the Day</span>
									<WidgetSourceHint kind="live" />
								</div>
								<div style={{display:"flex",alignItems:"center",gap:4}}>
									<Tooltip text="Refresh"><button aria-label="Refresh" onClick={()=>{ if (!quotesList.length) return; setQuoteFading(true);setTimeout(()=>{setQuoteIndex(i=>(i+1)%quotesList.length);setQuoteFading(false);},220);}} style={{background:"rgba(139,92,246,0.15)",border:"1px solid rgba(139,92,246,0.3)",borderRadius:6,cursor:"pointer",color:"rgba(139,92,246,0.9)",fontSize:14,padding:"2px 7px",lineHeight:1.4,fontFamily:"'DM Sans',sans-serif"}}>↻</button></Tooltip>
									<Tooltip text="Remove widget"><button aria-label="Remove widget" onClick={()=>removeWidget("left","quote-of-day")} style={{background:"none",border:"none",cursor:"pointer",padding:"2px 4px",borderRadius:4,display:"flex",alignItems:"center",lineHeight:1}} className="text-text-secondary" onMouseEnter={e=>{e.currentTarget.style.color="#f87171";}} onMouseLeave={e=>{e.currentTarget.style.color="var(--color-text-muted)";}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></Tooltip>
								</div>
							</div>
							<div style={{opacity:quoteFading?0:1,transition:"opacity 0.22s",minHeight:70}}>
								<p style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,lineHeight:1.6,margin:"0 0 8px",fontStyle:"italic"}} className="text-text-secondary">"{activeQuote?.text || '…'}"</p>
								<span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:"rgba(139,92,246,0.7)",fontWeight:600}}>{activeQuote?.author || ''}</span>
							</div>
						</div>
					)}

					{/* Feature Spotlight */}
					{leftWidgets.includes("feature-spotlight") && featureSpotlight && (
						<div onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 8px 24px var(--color-shadow)";}} onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}} style={{border:`1px solid ${(featureSpotlight?.accent||"#2563eb")}44`,borderRadius:14,padding:"14px 16px",marginBottom:12,transition:"transform 0.2s,box-shadow 0.2s",animation:"sbBorderBreath 3s ease-in-out infinite"}} className="bg-surface-raised">
							<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
								<div style={{display:"flex",alignItems:"center",gap:7}}>
									<div style={{width:8,height:8,borderRadius:"50%",background:(featureSpotlight?.accent||"#2563eb"),animation:"sbPulse 2s ease-in-out infinite",flexShrink:0}}/>
									<span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:13,textTransform:"uppercase",letterSpacing:"0.06em"}} className="text-text-secondary">Feature Spotlight</span>
									<WidgetSourceHint kind="live" />
								</div>
								<Tooltip text="Remove widget"><button aria-label="Remove widget" onClick={()=>removeWidget("left","feature-spotlight")} style={{background:"none",border:"none",cursor:"pointer",padding:"2px 4px",borderRadius:4,display:"flex",alignItems:"center",lineHeight:1}} className="text-text-secondary" onMouseEnter={e=>{e.currentTarget.style.color="#f87171";}} onMouseLeave={e=>{e.currentTarget.style.color="var(--color-text-muted)";}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></Tooltip>
							</div>
							<p style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:18,margin:"0 0 5px",letterSpacing:"0.01em"}} className="text-text-primary">{featureSpotlight?.name||"…"}</p>
							<p style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,lineHeight:1.55,margin:"0 0 12px"}} className="text-text-secondary">{featureSpotlight?.desc||""}</p>
							<button onClick={()=>onNavigate?.(featureSpotlight?.nav)} style={{padding:"7px 14px",background:(featureSpotlight?.accent||"#2563eb"),border:"none",borderRadius:8,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700,color:"#fff",transition:"opacity 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.opacity="0.82";}} onMouseLeave={e=>{e.currentTarget.style.opacity="1";}}>Explore →</button>
						</div>
					)}

					{/* Platform News */}
					{leftWidgets.includes("platform-news") && (
						<div onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 8px 24px var(--color-shadow)";}} onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}} style={{borderRadius:14,padding:"14px 16px",marginBottom:12,transition:"transform 0.2s,box-shadow 0.2s"}} className="bg-surface-raised border border-border">
							<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
									<div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
										<span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:13,textTransform:"uppercase",letterSpacing:"0.06em"}} className="text-text-secondary">Platform News</span>
										<WidgetSourceHint kind="live" />
									</div>
									<Tooltip text="Remove widget"><button aria-label="Remove widget" onClick={()=>removeWidget("left","platform-news")} style={{background:"none",border:"none",cursor:"pointer",padding:"2px 4px",borderRadius:4,display:"flex",alignItems:"center",lineHeight:1}} className="text-text-secondary" onMouseEnter={e=>{e.currentTarget.style.color="#f87171";}} onMouseLeave={e=>{e.currentTarget.style.color="var(--color-text-muted)";}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></Tooltip>
								</div>
							<div style={{display:"flex",flexDirection:"column",gap:9}}>
								{platformNewsItems.map((item,ni)=>(
									<div key={ni} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
										<div style={{width:7,height:7,borderRadius:"50%",background:ni===0?"#22c55e":"var(--color-border)",flexShrink:0,marginTop:5,animation:ni===0?"sbDotBlink 1.8s ease-in-out infinite":undefined}}/>
										<div style={{flex:1}}>
											<p style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,lineHeight:1.5,margin:0}} className="text-text-secondary">{item.text}</p>
											<span style={{fontFamily:"'DM Sans',sans-serif",fontSize:10}} className="text-text-muted">{item.date}</span>
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Book Recommendation — this card keeps its bespoke dark navy gradient card and
					    off-white illustration/text regardless of theme (like the sidebar widgets below with
					    the same treatment): it is a themed decorative panel, not a plain surface card, and
					    the book illustration's shading only reads correctly against a dark backdrop. */}
					{leftWidgets.includes("book-rec") && bookCard && (
						<div onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow=`0 8px 28px ${bookCard?.color||"#f59e0b"}33`;}} onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}} style={{background:`linear-gradient(145deg,${bookCard?.color||"#f59e0b"}14 0%,rgba(10,10,20,0.97) 65%)`,border:`1px solid ${bookCard?.color||"#f59e0b"}30`,borderRadius:14,overflow:"hidden",marginBottom:12,transition:"transform 0.2s,box-shadow 0.2s"}}>
							{/* Header */}
							<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px 0"}}>
								<div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
									<span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:13,color:"rgba(255,255,255,0.55)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Recommended Read</span>
										<WidgetSourceHint kind="live" />
								</div>
								<Tooltip text="Remove widget"><button aria-label="Remove widget" onClick={()=>removeWidget("left","book-rec")} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.55)",padding:"2px 4px",borderRadius:4,display:"flex",alignItems:"center",lineHeight:1}} onMouseEnter={e=>{e.currentTarget.style.color="#f87171";}} onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.45)";}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></Tooltip>
							</div>
							{/* Book illustration hero */}
							<div style={{position:"relative",padding:"14px 0 6px",display:"flex",justifyContent:"center",alignItems:"center",minHeight:80}}>
								{/* Colour glow blob */}
								<div style={{position:"absolute",width:72,height:72,borderRadius:"50%",background:bookCard?.color||"#f59e0b",opacity:0.18,filter:"blur(22px)",top:"50%",left:"50%",transform:"translate(-50%,-50%)",animation:"sbAnnivGlow 3.5s ease-in-out infinite"}}/>
								{/* Sparkle dots */}
								<div style={{position:"absolute",top:10,left:"28%",width:5,height:5,borderRadius:"50%",background:bookCard?.color||"#f59e0b",opacity:0.75,animation:"sbFloat 2.4s ease-in-out infinite"}}/>
								<div style={{position:"absolute",top:18,right:"24%",width:3,height:3,borderRadius:"50%",background:bookCard?.color||"#f59e0b",opacity:0.5,animation:"sbFloat 3.1s ease-in-out infinite 0.7s"}}/>
								<div style={{position:"absolute",bottom:8,left:"22%",width:3,height:3,borderRadius:"50%",background:"#fff",opacity:0.35,animation:"sbFloat 2.8s ease-in-out infinite 1.2s"}}/>
								<div style={{position:"absolute",bottom:12,right:"20%",width:4,height:4,borderRadius:"50%",background:bookCard?.color||"#f59e0b",opacity:0.4,animation:"sbFloat 2s ease-in-out infinite 0.3s"}}/>
								{/* Open book SVG */}
								<svg width={76} height={58} viewBox="0 0 76 58" style={{animation:"sbFloat 3.2s ease-in-out infinite",filter:`drop-shadow(0 0 14px ${bookCard?.color||"#f59e0b"}99)`,position:"relative",zIndex:1}}>
									{/* Shadow/base */}
									<ellipse cx="38" cy="52" rx="24" ry="3.5" fill="rgba(0,0,0,0.35)"/>
									{/* Left page */}
									<path d={`M38 7 C28 5 13 9 8 13 L8 47 C13 43 28 39 38 41 Z`} fill={bookCard?.color||"#f59e0b"} opacity="0.82"/>
									{/* Right page (slightly lighter/different shade) */}
									<path d={`M38 7 C48 5 63 9 68 13 L68 47 C63 43 48 39 38 41 Z`} fill={bookCard?.color||"#f59e0b"} opacity="0.48"/>
									{/* Spine crease */}
									<path d="M38 7 L38 41" stroke="rgba(0,0,0,0.45)" strokeWidth="1.5"/>
									{/* Left page text lines */}
									<line x1="14" y1="21" x2="33" y2="19" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" strokeLinecap="round"/>
									<line x1="14" y1="26" x2="33" y2="24" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" strokeLinecap="round"/>
									<line x1="14" y1="31" x2="33" y2="29" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" strokeLinecap="round"/>
									<line x1="14" y1="36" x2="28" y2="34" stroke="rgba(255,255,255,0.14)" strokeWidth="1.2" strokeLinecap="round"/>
									{/* Right page text lines */}
									<line x1="43" y1="19" x2="62" y2="21" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" strokeLinecap="round"/>
									<line x1="43" y1="24" x2="62" y2="26" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" strokeLinecap="round"/>
									<line x1="43" y1="29" x2="62" y2="31" stroke="rgba(255,255,255,0.14)" strokeWidth="1.2" strokeLinecap="round"/>
									<line x1="43" y1="34" x2="56" y2="36" stroke="rgba(255,255,255,0.1)" strokeWidth="1.2" strokeLinecap="round"/>
								</svg>
							</div>
							{/* Content */}
							<div style={{padding:"2px 16px 14px"}}>
								<div style={{height:1,background:`linear-gradient(90deg,transparent,${bookCard?.color||"#f59e0b"}88,transparent)`,marginBottom:10,animation:"sbShimmer 2.8s linear infinite",backgroundSize:"200% 100%"}}/>
								<p style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:17,color:"#fff",margin:"0 0 2px",letterSpacing:"0.01em"}}>{bookCard?.title||"…"}</p>
								<p style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:bookCard?.color||"#f59e0b",fontWeight:700,margin:"0 0 8px",letterSpacing:"0.02em"}}>{bookCard?.author||""}</p>
								<p style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"rgba(255,255,255,0.6)",lineHeight:1.6,margin:"0 0 12px",fontStyle:"italic"}}>"{bookCard?.summary||""}"</p>
								{!isViewingOther && myId && bookCard?.savable !== false && (
								<button type="button" disabled={bookSaveBusy || !bookCard?.id} onClick={toggleReadingList} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"5px 12px",background:`${bookCard?.color||"#f59e0b"}20`,border:`1px solid ${bookCard?.color||"#f59e0b"}44`,borderRadius:8,fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700,color:bookCard?.color||"#f59e0b",cursor:bookSaveBusy?"wait":"pointer",letterSpacing:"0.02em",opacity:bookSaveBusy?0.7:1}}>
									<svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
									{bookInReadingList ? "In reading list" : "Add to reading list"}
								</button>
								)}
								{(isViewingOther || !myId) && (
								<button type="button" onClick={() => onNavigate?.("books")} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"5px 12px",background:`${bookCard?.color||"#f59e0b"}20`,border:`1px solid ${bookCard?.color||"#f59e0b"}44`,borderRadius:8,fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700,color:bookCard?.color||"#f59e0b",cursor:"pointer",letterSpacing:"0.02em"}}>
									<svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
									Browse Books
								</button>
								)}
							</div>
						</div>
					)}

					{/* Spin the Wheel */}
					{leftWidgets.includes("spin-wheel") && (
						<div onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 8px 24px var(--color-shadow)";}} onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}} style={{borderRadius:14,padding:"14px 16px",marginBottom:12,transition:"transform 0.2s,box-shadow 0.2s",textAlign:"center"}} className="bg-surface-raised border border-border">
							<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
									<div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
										<span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:13,textTransform:"uppercase",letterSpacing:"0.06em"}} className="text-text-secondary">Spin the Wheel</span>
										<WidgetSourceHint kind="live" />
									</div>
									<Tooltip text="Remove widget"><button aria-label="Remove widget" onClick={()=>removeWidget("left","spin-wheel")} style={{background:"none",border:"none",cursor:"pointer",padding:"2px 4px",borderRadius:4,display:"flex",alignItems:"center",lineHeight:1}} className="text-text-secondary" onMouseEnter={e=>{e.currentTarget.style.color="#f87171";}} onMouseLeave={e=>{e.currentTarget.style.color="var(--color-text-muted)";}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></Tooltip>
								</div>
							<div style={{position:"relative",width:140,height:140,margin:"0 auto 12px"}}>
								<div style={{width:140,height:140,borderRadius:"50%",transform:`rotate(${spinAngle}deg)`,transition:spinning?`transform ${3.5}s cubic-bezier(0.17,0.67,0.12,0.99)`:"none",position:"relative",overflow:"hidden"}}>
									<svg width={140} height={140} viewBox="0 0 140 140">
										{spinItems.map((_,si)=>{
											const angle=360/spinItems.length;
											const startRad=(si*angle-90)*Math.PI/180;
											const endRad=((si+1)*angle-90)*Math.PI/180;
											const x1=70+65*Math.cos(startRad);
											const y1=70+65*Math.sin(startRad);
											const x2=70+65*Math.cos(endRad);
											const y2=70+65*Math.sin(endRad);
											const mx=70+38*Math.cos((startRad+endRad)/2);
											const my=70+38*Math.sin((startRad+endRad)/2);
											return (
												<g key={si}>
													<path d={`M70,70 L${x1},${y1} A65,65 0 0,1 ${x2},${y2} Z`} fill={spinColors[si]} opacity={0.85}/>
													<text x={mx} y={my} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={8} fontFamily="'DM Sans',sans-serif" fontWeight={700} style={{pointerEvents:"none"}}>{spinItems[si].split(" ")[0]}</text>
												</g>
											);
										})}
										{/* Hub cap stays a fixed dark disc regardless of theme — it needs to read as a
										    contrasting center against the bright wheel-slice colors on all sides, not
										    blend with the page. */}
										<circle cx={70} cy={70} r={10} fill="#0a0a0e" stroke="rgba(255,255,255,0.15)" strokeWidth={1.5}/>
									</svg>
								</div>
								<div style={{position:"absolute",top:-4,left:"50%",transform:"translateX(-50%)",width:0,height:0,borderLeft:"7px solid transparent",borderRight:"7px solid transparent",borderTop:"14px solid var(--color-text-primary)",filter:"drop-shadow(0 2px 4px rgba(0,0,0,0.5))"}}/>
							</div>
							{spinResult && !spinning && <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,margin:"0 0 10px",animation:"sbFadeUp 0.4s ease both"}} className="text-text-primary">{spinResult}</p>}
							<button disabled={spinning} onClick={()=>{
								if(spinning)return;
								const extra=2880+Math.floor(Math.random()*360);
								const next=spinAngle+extra;
								setSpinAngle(next);
								setSpinning(true);
								setSpinResult(null);
								setTimeout(()=>{
									const normalized=((next%360)+360)%360;
									const idx=Math.floor(((360-normalized)%360)/(360/spinItems.length))%spinItems.length;
									setSpinResult(spinItems[idx]);
									setSpinning(false);
								},3600);
							}} style={{padding:"8px 20px",background:spinning?"var(--color-surface-raised)":"linear-gradient(135deg,#8b5cf6,#6d28d9)",border:"none",borderRadius:9,cursor:spinning?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700,color:spinning?"var(--color-text-primary)":"#fff",transition:"opacity 0.15s",opacity:spinning?0.6:1}}>
								{spinning?"Spinning…":"Spin"}
							</button>
						</div>
					)}

					{/* ── Platform Today widget (live aggregates from GET /platform/today) ── */}
					<div style={{ borderRadius: 16, padding: "12px 14px 14px", marginBottom: 10 }} className="bg-surface-raised border border-border">
						<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
							<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }} className="text-text-muted">Platform Today</p>
							<WidgetSourceHint kind="live" />
						</div>
						{[
							{ label: "Active Sellers", value: formatPlatformCount(platformStats?.active_sellers), icon: "🏪" },
							{ label: "Orders",         value: formatPlatformCount(platformStats?.orders_today), icon: "📦" },
							{ label: "Live Streams",   value: formatPlatformCount(platformStats?.live_streams), icon: "🔴" },
							{ label: "Videos Watched", value: formatPlatformCount(platformStats?.videos_watched_today), icon: "🎬" },
						].map((s, i) => (
							<div key={s.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: i < 3 ? "1px solid var(--color-border-subtle)" : "none" }}>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }} className="text-text-secondary">
									<span style={{ fontSize: 13 }} aria-hidden="true">{s.icon}</span>{s.label}
								</span>
								<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 14, color: "#60a5fa" }}>{platformStatsLoading ? "…" : s.value}</span>
							</div>
						))}
					</div>

					{/* Customize widgets — left sidebar */}
					<div ref={widgetPickerSide === "left" ? widgetPickerRef : null} style={{ position: "relative" }}>
						{widgetPickerSide === "left" && (
							<div style={{ borderRadius: 12, padding: "12px 14px", marginBottom: 10 }} className="bg-surface-raised border border-border">
								<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }} className="text-text-muted">Add a widget</p>
								{widgetLimitMsg === "left" && (
									<div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.3)", borderRadius: 8, marginBottom: 8, animation: "sbFadeUp 0.25s ease both" }}>
										<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#fb923c", fontWeight: 600 }}>Max 4 widgets per side</span>
									</div>
								)}
								{ALL_LEFT_WIDGETS.filter(w => !w.locked && !leftWidgets.includes(w.id) && (!w.ownOnly || !isViewingOther)).length === 0 ? (
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }} className="text-text-muted">All widgets added</p>
								) : (
									<div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
										{ALL_LEFT_WIDGETS.filter(w => !w.locked && !leftWidgets.includes(w.id) && (!w.ownOnly || !isViewingOther)).map(w => (
											<button key={w.id} onClick={() => addWidget("left", w.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "left", transition: "background 0.15s" }} className="bg-surface-raised border border-border text-text-secondary"
												onMouseEnter={e => { e.currentTarget.style.background = "rgba(37,99,235,0.12)"; }}
												onMouseLeave={e => { e.currentTarget.style.background = "var(--color-surface-raised)"; }}>
												<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
												{w.label}
											</button>
										))}
									</div>
								)}
							</div>
						)}
						<button onClick={() => setWidgetPickerSide(prev => prev === "left" ? null : "left")}
							style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", padding: "9px 12px", border: "1px dashed var(--color-border)", borderRadius: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, transition: "background 0.15s, border-color 0.15s, color 0.15s" }} className="bg-surface-raised text-text-muted"
							onMouseEnter={e => { e.currentTarget.style.background = "rgba(37,99,235,0.08)"; e.currentTarget.style.borderColor = "rgba(37,99,235,0.3)"; e.currentTarget.style.color = "#93c5fd"; }}
							onMouseLeave={e => { e.currentTarget.style.background = "var(--color-surface-raised)"; e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.color = "var(--color-text-muted)"; }}>
							<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
							Customize widgets
						</button>
					</div>


				</aside>
				</div>
			)}

			{/* ── CENTER CONTENT ── */}
			<div style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--color-border-subtle)", borderRight: "1px solid var(--color-border-subtle)", paddingLeft: 20, paddingRight: 20 }}>

				{/* Avatar row + action buttons */}
				<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
					{/* Avatar */}
					{(() => {
						// BUG #31: when viewing another user's photoless profile, never fall back to
						// the current viewer's avatar — that leaked the viewer's photo onto the profile.
						const photoUrl = isViewingOther
							? (socialProfile?.profile_pic_url || null)
							: (socialProfile?.profile_pic_url || userData?.profile_pic_url || null);
						return (
							<div onClick={!isViewingOther ? () => avatarInputRef.current?.click() : undefined} {...(!isViewingOther ? clickableProps(() => avatarInputRef.current?.click()) : {})} aria-label={!isViewingOther ? "Change profile photo" : undefined} style={{ width: 106, height: 106, borderRadius: "50%", background: "linear-gradient(135deg,#2563eb,#60a5fa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, border: "4px solid var(--color-bg)", marginTop: -53, flexShrink: 0, position: "relative", zIndex: 1, boxShadow: "0 4px 24px rgba(37,99,235,0.3)", overflow: "hidden", cursor: !isViewingOther ? "pointer" : "default" }}>
								{/* #457: display:none on error left this as a blank blue disc. Avatar fills the existing
								    ring (the container keeps the border/shadow/upload overlay) and falls back to the
								    user's initials on the same gradient when the photo is missing OR 404s. */}
								<Avatar key={photoUrl} url={photoUrl} initials={displayName} alt="Profile" size={106}
									style={{ width: "100%", height: "100%", background: "transparent", fontSize: 38 }} />
								{/* PROFILE-Q6: change-avatar affordance on own profile. The hover scrim + icon
							    stay a fixed dark overlay regardless of theme — it sits directly on the
							    user's own photo and needs to read the same on any photo. */}
								{!isViewingOther && (
									<>
										<input ref={avatarInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
										<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", opacity: 0, transition: "opacity 0.15s" }}
											onMouseEnter={e => e.currentTarget.style.opacity = 1}
											onMouseLeave={e => e.currentTarget.style.opacity = 0}>
											<svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
										</div>
									</>
								)}
								{/* PROFILE-P8: presence dot only on own profile (no real presence signal for
								   other users), and only if activity-status sharing isn't disabled. */}
								{!isViewingOther && socialProfile?.show_activity_status !== false && (
									<div style={{ position: "absolute", bottom: 6, right: 6, width: 14, height: 14, borderRadius: "50%", background: "#22c55e", border: "2px solid var(--color-bg)" }} />
								)}
							</div>
						);
					})()}
					{/* Action buttons — pushed down so they're clearly below the cover */}
					<div style={{ display: "flex", flexDirection: (isMobile || isSplitMode) ? "column" : "row", gap: 8, paddingTop: 14, alignItems: (isMobile || isSplitMode) ? "stretch" : "center" }}>
						{!isViewingOther && <button onClick={() => onNavigate("settings")} style={{ padding: "8px 18px", borderRadius: 20, fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", textAlign: "center" }} className="bg-surface-raised border border-border text-text-primary">{t("userProfile.editProfile")}</button>}
						{!isViewingOther && <button onClick={() => onNavigate("recruiter")} style={{ padding: "8px 18px", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.4)", borderRadius: 20, color: "#93b8fb", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", textAlign: "center" }}>Affiliate</button>}
						{isViewingOther && (
							<button onClick={async () => {
								if (followLoading) return;
								setFollowLoading(true);
								try {
									const result = await toggleFollowByUserId(targetUserId);
									const action = result?.action ?? (isFollowing === true ? "unfollowed" : "followed");
									setIsFollowing(action === "requested" ? "requested" : action === "followed");
									if (action === "followed" || action === "unfollowed") {
										setSocialProfile(prev => prev ? { ...prev, follower_count: (prev.follower_count ?? 0) + (action === "followed" ? 1 : -1) } : prev);
									}
								} catch { /* keep prior follow state */ }
								setFollowLoading(false);
							}} style={{ padding: "8px 20px", background: isFollowing ? "var(--color-surface-raised)" : "#2563eb", border: isFollowing ? "1px solid var(--color-border)" : "none", borderRadius: 20, color: isFollowing ? "var(--color-text-primary)" : "#fff", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: followLoading ? "default" : "pointer", opacity: followLoading ? 0.7 : 1, textAlign: "center" }}>
								{followLoading ? "…" : isFollowing === "requested" ? t("social.requested", "Requested") : isFollowing ? t("userProfile.followingLabel") : t("userProfile.follow")}
							</button>
						)}
						{isViewingOther && <button data-testid="message-btn" aria-label="Message this user" disabled={messageBusy || targetUserId == null} onClick={async () => {
							if (messageBusy) return;
							if (targetUserId == null) {
								notifyProfile({ title: t("common.error", "Error"), message: t("userProfile.messageNeedId", "Could not message this user.") });
								return;
							}
							setMessageBusy(true);
							try {
								await messageUser(targetUserId, { sourceVertical: "social" });
							} catch (err) {
								notifyProfile({
									title: t("common.error", "Error"),
									message: err?.response?.data?.message || err?.message || t("userProfile.messageFailed", "Could not start a conversation."),
								});
							} finally {
								setMessageBusy(false);
							}
						}} style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: messageBusy ? "default" : "pointer", flexShrink: 0, opacity: messageBusy ? 0.6 : 1, minHeight: 36, minWidth: 36 }} className="bg-surface-raised border border-border">
							<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
						</button>}
						{isViewingOther && (
						<div ref={moreMenuRef} style={{ position: "relative" }}>
							<button onClick={() => { setMoreMenuOpen(o => !o); setMoreMenuMsg(""); }} aria-label="More options" aria-haspopup="menu" aria-expanded={moreMenuOpen} style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }} className="bg-surface-raised border border-border">
								<svg width={16} height={16} viewBox="0 0 24 24" fill="var(--color-text-secondary)"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
							</button>
							{moreMenuOpen && (
								<div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, borderRadius: 12, overflow: "hidden", zIndex: 50, minWidth: 160, boxShadow: "0 8px 32px var(--color-shadow)" }} className="bg-surface-raised border border-border">
									{moreMenuMsg ? (
										<div style={{ padding: "12px 16px", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }} className="text-text-secondary">{moreMenuMsg}</div>
									) : (
										[
											{ label: i18n.t("userProfile.block"), action: async () => {
												const pid = socialProfile?.profile_id ?? socialProfile?.id;
												if (!pid) { setMoreMenuMsg("Couldn't block"); return; }
												setMoreMenuMsg("Blocking…");
												try {
													const res = await blockUser(pid);
													setMoreMenuMsg(res?.action === "unblocked" ? "Unblocked" : "Blocked");
													if (res?.action !== "unblocked") setTimeout(() => { delete window.__profileTargetId; onNavigate?.('home'); }, 800);
												} catch { setMoreMenuMsg("Couldn't block"); }
											} },
											{ label: i18n.t("messages.mute"), action: async () => {
												const pid = socialProfile?.profile_id ?? socialProfile?.id;
												if (!pid) { setMoreMenuMsg("Couldn't mute"); return; }
												setMoreMenuMsg("Muting…");
												try {
													const res = await muteUser(pid);
													setMoreMenuMsg(res?.action === "unmuted" ? "Unmuted" : "Muted");
												} catch { setMoreMenuMsg("Couldn't mute"); }
											} },
											{ label: i18n.t("userProfile.report"), action: async () => {
												const targetProfileId = socialProfile?.profile_id ?? socialProfile?.id;
												if (!targetProfileId) { setMoreMenuMsg("Couldn't report"); return; }
												setMoreMenuMsg("Reporting…");
												try { await reportProfile(targetProfileId); setMoreMenuMsg("Reported"); }
												catch { setMoreMenuMsg("Couldn't report"); }
											} },
										].map(item => (
											<div key={item.label} onClick={item.action} {...clickableProps(item.action)}
												style={{ padding: "11px 16px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: item.label === "Report" ? "#f87171" : "var(--color-text-secondary)", cursor: "pointer", borderBottom: "1px solid var(--color-border-subtle)" }}
												onMouseEnter={e => e.currentTarget.style.background = "var(--color-border-subtle)"}
												onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
												{item.label}
											</div>
										))
									)}
								</div>
							)}
						</div>
						)}
					</div>
				</div>

				{/* Name + bio */}
				<div style={{ marginBottom: 16 }}>
					<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
						<h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, letterSpacing: "0.02em", textTransform: "uppercase" }} className="text-text-primary">{displayName}</h1>
						{socialProfile?.is_verified && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6, background: "#22c55e22", color: "#22c55e" }}>{i18n.t("common.verified")}</span>}
					</div>
					<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 10 }} className="text-text-muted">@{handle}</p>
					{bio ? <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.55, maxWidth: 520, marginBottom: 12 }} className="text-text-secondary">{bio}</p> : null}
					{workStatus ? (
						<div style={{ position: "relative", display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 6, marginBottom: 12 }}>
							<button
								type="button"
								disabled={isViewingOther || workStatusSaving}
								onClick={() => { if (!isViewingOther) setWorkStatusMenuOpen((o) => !o); }}
								aria-haspopup="menu"
								aria-expanded={workStatusMenuOpen}
								style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 999, padding: "5px 12px", cursor: isViewingOther ? "default" : "pointer" }}
							>
								<span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#4ade80" }}>{t(`account.workStatusOptions.${workStatus}`)}</span>
								{!isViewingOther && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#86efac", marginLeft: 2 }}>▾</span>}
							</button>
							{!isViewingOther && workStatusMenuOpen && (
								<div role="menu" style={{ position: "absolute", top: "100%", left: 0, zIndex: 20, marginTop: 6, minWidth: 220, borderRadius: 12, padding: 6, boxShadow: "0 12px 32px var(--color-shadow)" }} className="bg-surface-raised border border-border">
									{WORK_STATUSES.map((s) => (
										<button key={s} type="button" role="menuitem" disabled={workStatusSaving} onClick={() => setWorkStatus(s)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderRadius: 8, background: s === workStatus ? "rgba(34,197,94,0.12)" : "transparent", color: s === workStatus ? "#4ade80" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
											{t(`account.workStatusOptions.${s}`)}
										</button>
									))}
									<button type="button" role="menuitem" disabled={workStatusSaving} onClick={() => setWorkStatus(null)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderRadius: 8, background: "transparent", color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
										{t("account.workStatusNone")}
									</button>
								</div>
							)}
							{workStatusError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#f87171", margin: 0 }}>{workStatusError}</p>}
						</div>
					) : !isViewingOther ? (
						<div style={{ position: "relative", display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 6, marginBottom: 12 }}>
							<button
								type="button"
								disabled={workStatusSaving}
								onClick={() => setWorkStatusMenuOpen((o) => !o)}
								aria-haspopup="menu"
								aria-expanded={workStatusMenuOpen}
								style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(37,99,235,0.10)", border: "1px solid rgba(37,99,235,0.28)", borderRadius: 999, padding: "5px 12px", cursor: "pointer" }}
							>
								<span style={{ width: 7, height: 7, borderRadius: "50%", background: "#60a5fa", flexShrink: 0 }} />
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#93c5fd" }}>{t("userProfile.setWorkStatus", { defaultValue: "Set work status" })}</span>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#93c5fd" }}>▾</span>
							</button>
							{workStatusMenuOpen && (
								<div role="menu" style={{ position: "absolute", top: "100%", left: 0, zIndex: 20, marginTop: 6, minWidth: 220, borderRadius: 12, padding: 6, boxShadow: "0 12px 32px var(--color-shadow)" }} className="bg-surface-raised border border-border">
									{WORK_STATUSES.map((s) => (
										<button key={s} type="button" role="menuitem" disabled={workStatusSaving} onClick={() => setWorkStatus(s)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderRadius: 8, background: "transparent", color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
											{t(`account.workStatusOptions.${s}`)}
										</button>
									))}
								</div>
							)}
							{workStatusError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#f87171", margin: 0 }}>{workStatusError}</p>}
						</div>
					) : null}
					{/* Meta pills */}
					<div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 14, justifyContent: (isMobile || isSplitMode) ? "center" : "flex-start" }}>
						<button
							onClick={() => {
								navigator.clipboard?.writeText(`${window.location.origin}/@${handle}`);
								setProfileLinkCopied(true);
								setTimeout(() => setProfileLinkCopied(false), 2000);
							}}
							style={{ display: "flex", alignItems: "center", gap: 5, color: profileLinkCopied ? "#22c55e" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, background: "none", border: "none", cursor: "pointer", padding: "6px 8px", margin: "-4px -4px", transition: "color 0.2s" }}
						>
							{profileLinkCopied
								? <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
								: <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
							}
							{profileLinkCopied ? "Copied!" : `/@${handle}`}
						</button>
						{joinedDate && (
							<div style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }} className="text-text-secondary">
								<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
								Joined {joinedDate}
							</div>
						)}
					</div>
					{/* Stats — hidden on desktop (shown in right sidebar Profile Stats widget) */}
					<div style={{ display: (!isMobile && !isTablet) ? "none" : "flex", gap: 20, flexWrap: "wrap", justifyContent: (isMobile || isSplitMode) ? "center" : "flex-start" }}>
						{[[String(followingCount), "Following"], [String(followerCount), "Followers"], [String(postCount), "Posts"]].map(([val, label]) => {
							const isClickable = label === "Following" || label === "Followers";
							const profileId = socialProfile?.id ?? socialProfile?.profile_id;
							return (
							<div key={label} style={{ display: "flex", gap: 5, alignItems: "baseline", cursor: isClickable ? "pointer" : "default", padding: isClickable ? "8px 6px" : 0, margin: isClickable ? "-8px -6px" : 0 }}
								onClick={isClickable && profileId ? async () => {
									const type = label === "Following" ? "following" : "followers";
									setFollowListModal(type);
									// PROFILE-014: use cache if available
									const cacheKey = type + "_" + (targetUserId ?? "own");
									if (followListCacheRef.current[cacheKey]) {
										setFollowList(followListCacheRef.current[cacheKey]);
										setFollowListLoading(false);
										return;
									}
									setFollowList([]);
									setFollowListLoading(true);
									try {
										const fn = type === "following" ? getFollowing : getFollowers;
										const data = await fn(profileId);
										const list = Array.isArray(data) ? data : (data?.data ?? []);
										followListCacheRef.current[cacheKey] = list;
										setFollowList(list);
									} catch { setFollowList([]); }
									setFollowListLoading(false);
								} : undefined}
								onMouseEnter={isClickable ? e => e.currentTarget.querySelector("span:first-child").style.textDecoration = "underline" : undefined}
								onMouseLeave={isClickable ? e => e.currentTarget.querySelector("span:first-child").style.textDecoration = "none" : undefined}>
								<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18 }} className="text-text-primary">{val}</span>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }} className="text-text-secondary">{label}</span>
							</div>
							);
						})}
					</div>
					{/* Referral code — public (#423). Shown on anyone's profile so a visitor can pick
					    it up; hidden only when the code genuinely isn't there to show. */}
					{(!isViewingOther || refCode) && (<div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, padding: "10px 16px", background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 12, width: (isMobile || isSplitMode) ? "100%" : "fit-content" }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
						<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }} className="text-text-secondary">{i18n.t(isViewingOther ? "userProfile.referralCode" : "userProfile.yourReferralCode")}</span>
						{refCode ? (
							<>
								<span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#60a5fa", letterSpacing: "0.08em" }}>{refCode}</span>
								<button onClick={() => { navigator.clipboard?.writeText(refCode); setRefCopied(true); setTimeout(() => setRefCopied(false), 2000); }} style={{ background: "none", border: "none", cursor: "pointer", color: refCopied ? "#22c55e" : "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 4, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, padding: "7px 8px", borderRadius: 6, transition: "color 0.2s" }}>
									{refCopied ? <><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>{i18n.t("userProfile.copied")}</> : <><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>{i18n.t("userProfile.copy")}</>}
								</button>
							</>
						) : (
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }} className="text-text-muted">{refCodeChecked ? "Not available yet" : "Loading…"}</span>
						)}
					</div>)}
				</div>

				{/* #467 Profile Story Highlights — permanent curated story collections, shown as
				    circular bubbles below the profile info. Own-profile shows the add/edit affordances. */}
				{socialProfile?.profile_id && (
					<StoryHighlights
						profileId={socialProfile.profile_id}
						isOwner={!isViewingOther}
						ownerPic={socialProfile?.profile_pic_url}
						isMobile={isMobile || isSplitMode}
					/>
				)}

				{/* Tabs */}
				<div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--color-border)", marginBottom: 24, overflowX: "auto", scrollbarWidth: "none" }}>
					{tabs.map(t => (
						<button key={t} onClick={() => setTab(t)} style={{ padding: isMobile ? "11px 14px" : "12px 18px", background: "transparent", border: "none", borderBottom: tab === t ? "2px solid #2563eb" : "2px solid transparent", fontSize: isMobile ? 13 : 14, fontWeight: tab === t ? 700 : 500, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", transition: "all 0.15s", marginBottom: -1, whiteSpace: "nowrap", flexShrink: 0 }} className={tab === t ? "text-text-primary" : "text-text-secondary"}>{t}</button>
					))}
				</div>

				{/* Posts tab — real posts from API */}
				{tab === "Posts" && (
					<div style={{ maxWidth: 600, display: "flex", flexDirection: "column", gap: 0 }}>
						{!postsReady ? (
							<SkeletonTownHallFeed count={3} />
						) : userPosts.length === 0 ? (
							<div style={{ padding: "48px 0", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }} className="text-text-muted">{i18n.t("social.noPostsYet")}</div>
						) : userPosts.map((p, i) => {
							const timeAgo = p.created_at ? new Date(p.created_at).toLocaleDateString() : "";
							const likeCount = likeCountOf(p);
							const commentCount = commentCountOf(p);
							const liked = isLiked(p);
							const postAtt = p.social_media_attachments?.[0];
							const postImg = postAtt?.media_url;
							const postIsVideo = isVideoAtt(postAtt);
							return (
								<div key={p.post_id ?? p.id ?? i} style={{ borderBottom: "1px solid var(--color-border-subtle)", padding: "18px 0", display: "flex", gap: 12, animation: `fadeUp 0.3s ease ${i*40}ms both` }}>
									<Avatar url={socialProfile?.profile_pic_url} initials={displayName} size={42}
										style={{ background: "linear-gradient(135deg,#2563eb,#60a5fa)", fontSize: 17 }} />
									<div style={{ flex: 1 }}>
										<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
											<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14 }} className="text-text-primary">{displayName}</span>
											<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }} className="text-text-muted">@{handle} · {timeAgo}</span>
											{p.scheduled_at && new Date(p.scheduled_at) > new Date() && (
												<span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 20, padding: "2px 9px" }}>
													<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
													Scheduled · {new Date(p.scheduled_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
												</span>
											)}
										</div>
										{/* #430 — clicking the post opens the REAL post view (media, like, repost, comments,
				    views), not a bare comments sheet. */}
										<p onClick={() => openPostDetail(p)} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.55, marginBottom: 12, cursor: "pointer" }} className="text-text-secondary">{p.caption_text ?? p.content ?? p.caption ?? p.text ?? ""}</p>
										{postImg && (postIsVideo
											? <video src={postImg} controls playsInline preload="metadata" style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: 10, marginBottom: 10, background: "#000" }} />
											: <SafeImage loading="lazy" decoding="async" src={postImg} alt="" onClick={() => openPostDetail(p)} style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: 10, marginBottom: 10, cursor: "pointer" }}
												fallback={<MediaPlaceholder style={{ width: "100%", height: 180, borderRadius: 10, marginBottom: 10 }} />} />)}
										<div style={{ display: "flex", gap: 28, alignItems: "center" }}>
											{/* PROFILE-Q1: comment — opens the comments sheet */}
											<button onClick={() => openPostDetail(p)} aria-label="Comments" style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer", padding: "6px 6px", margin: "-6px 0" }} className="text-text-muted"
												onMouseEnter={e => e.currentTarget.style.color = "#60a5fa"} onMouseLeave={e => e.currentTarget.style.color = "var(--color-text-muted)"}>
												<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>{commentCount}
											</button>
											{/* PROFILE-Q1: like toggle */}
											<button onClick={() => toggleLike(p)} aria-label={liked ? "Unlike" : "Like"} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: liked ? "#ef4444" : "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer", padding: "6px 6px", margin: "-6px 0" }}>
												<svg width={16} height={16} viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>{likeCount}
											</button>
											{/* #422: pin / unpin this post — this is how the owner CHOOSES the pinned post. */}
											{!isViewingOther && (() => {
												const isPinned = !!pinnedPost && samePost(p, postRef(pinnedPost));
												return (
													<button
														onClick={(e) => { e.stopPropagation(); togglePin(p); }}
														disabled={pinBusy}
														aria-label={isPinned ? "Unpin this post" : "Pin this post to your profile"}
														title={isPinned ? "Unpin from profile" : "Pin to profile"}
														style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: isPinned ? "#60a5fa" : "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: pinBusy ? "default" : "pointer", padding: 8, margin: -8 }}
														onMouseEnter={e => { if (!isPinned) e.currentTarget.style.color = "#60a5fa"; }}
														onMouseLeave={e => { if (!isPinned) e.currentTarget.style.color = "var(--color-text-muted)"; }}
													>
														<svg width={15} height={15} viewBox="0 0 24 24" fill={isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
														{isPinned ? "Pinned" : "Pin"}
													</button>
												);
											})()}
											{/* PROFILE-Q1: delete own post */}
											{!isViewingOther && (
												<button onClick={() => setDeleteTarget(postKey(p))} aria-label="Delete post" style={{ display: "flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 8, margin: -8 }} className="text-text-muted"
													onMouseEnter={e => e.currentTarget.style.color = "#ef4444"} onMouseLeave={e => e.currentTarget.style.color = "var(--color-text-muted)"}>
													<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
												</button>
											)}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}

				{/* #198 portfolio tab — provider's other listings in the clicked vertical */}
				{portfolioCfg && tab === portfolioCfg.label && (
					<div style={{ maxWidth: 900 }}>
						{verticalListings.length === 0 ? (
							<div style={{ padding: "48px 0", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }} className="text-text-muted">No listings yet</div>
						) : (
							<div style={{ display: "grid", gridTemplateColumns: (isMobile || isSplitMode) ? "1fr 1fr" : "repeat(3, 1fr)", gap: 16 }}>
								{verticalListings.map((l, i) => (
									<div key={l.id ?? i} onClick={() => { if (portfolioCfg.nav) onNavigate?.(portfolioCfg.nav); }} {...(portfolioCfg.nav ? clickableProps(() => onNavigate?.(portfolioCfg.nav)) : {})} style={{ borderRadius: 14, overflow: "hidden", cursor: portfolioCfg.nav ? "pointer" : "default", animation: `fadeUp 0.3s ease ${i*40}ms both` }} className="bg-surface border border-border-subtle">
										<div style={{ height: 140, background: l.image ? `center/cover no-repeat url(${l.image})` : "linear-gradient(135deg,#0c1a2e,#2563eb)" }} />
										<div style={{ padding: "12px 14px" }}>
											<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-text-primary">{l.title}</p>
											{l.desc && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.5, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }} className="text-text-secondary">{l.desc}</p>}
											{l.price > 0 && <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18 }} className="text-text-primary">${l.price}<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: 11 }} className="text-text-secondary"> {portfolioCfg.unit}</span></p>}
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				)}

				{/* Images tab — posts with media */}
				{tab === "Images" && (
					<div style={{ maxWidth: 680 }}>
					{!postsReady ? (
						<SkeletonMediaGrid count={9} cols={isMobile ? 2 : 3} />
					) : imagePosts.length === 0 ? (
						<div style={{ padding: "48px 0", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }} className="text-text-muted">{t("userProfile.noPhotoPosts")}</div>
					) : (
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : isTablet ? "repeat(2,1fr)" : "repeat(3,1fr)", gap: 3 }}>
							{imagePosts.map((p, i) => {
								const imgSrc = p.social_media_attachments?.[0]?.media_url ?? p.media_url ?? p.image_url ?? (p.media_urls?.[0]);
								const gridIsVideo = isVideoAtt(p.social_media_attachments?.[0]);
								return (
									<div key={p.post_id ?? p.id ?? i} style={{ position: "relative", aspectRatio: "1/1", borderRadius: 4, overflow: "hidden", cursor: "pointer", animation: `fadeUp 0.3s ease ${i*40}ms both` }} className="bg-surface">
										{imgSrc && (gridIsVideo
											? <video src={imgSrc} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover", background: "#000" }} />
											: <SafeImage loading="lazy" decoding="async" src={imgSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
												fallback={<MediaPlaceholder style={{ width: "100%", height: "100%" }} />} />)}
										<button type="button" onClick={() => openPostDetail(p)} aria-label="View post" style={{ position: "absolute", inset: 0, background: "transparent", border: "none", padding: 0, cursor: "pointer" }} />
										{/* Floats over the photo grid thumbnail, so it keeps a fixed dark chip +
										    white icon regardless of theme (same treatment as the play-button
										    overlays below and the cover-photo controls above). */}
										{!isViewingOther && (
										<button onClick={e => { e.stopPropagation(); setDeleteTarget(postKey(p)); }} aria-label="Delete post" style={{ position: "absolute", top: 6, right: 6, width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}>
												<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
											</button>
										)}
									</div>
								);
							})}
						</div>
					)}
					</div>
				)}

				{tab === "Services" && !isViewingOther && (
					<div>
						{userServices.length === 0 ? (
							<div style={{ padding: "48px 0", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }} className="text-text-muted">{t("userProfile.noServicesListed")}</div>
						) : (
							<div style={{ display: "grid", gridTemplateColumns: (isMobile || isSplitMode) ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
								{userServices.map((svc, i) => {
									const title = svc.service_name ?? svc.title ?? svc.name ?? "Service";
									const category = svc.service_type_name ?? svc.category ?? svc.service_category?.name ?? "";
									const price = svc.price ?? svc.base_price;
									const rating = svc.rating ?? svc.average_rating;
									const coverImg = svc.cover_image ?? svc.image_url ?? svc.thumbnail;
									return (
										<div key={svc.service_id ?? svc.id ?? i} style={{ borderRadius: 12, overflow: "hidden", animation: `fadeUp 0.3s ease ${i*40}ms both` }} className="bg-surface border border-border">
											<SafeImage loading="lazy" decoding="async" src={coverImg} alt={title} style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
												fallback={(
													<div style={{ width: "100%", height: 140, background: "linear-gradient(135deg,#1e2a4a,#0f172a)", display: "flex", alignItems: "center", justifyContent: "center" }}>
														<svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
													</div>
												)} />
											<div style={{ padding: "14px 16px" }}>
												{category && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{category}</div>}
												<div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 6 }} className="text-text-primary">{title}</div>
												<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
													{price != null && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: "#4ade80" }}>${Number(price).toFixed(2)}</div>}
													{rating != null && (
														<div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }} className="text-text-secondary">
															<svg width={12} height={12} viewBox="0 0 24 24" fill="#facc15" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
															{Number(rating).toFixed(1)}
														</div>
													)}
												</div>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				)}

				{tab === "Likes" && !isViewingOther && (
					<div>
						{/* #435: this tab used to be a blue "Liked Videos" banner plus flat, dead post
						    cards. Both liked videos and liked posts now render their actual content and
						    open the real view — the banner was also what made a click land on the Videos
						    category instead of the post (#450). */}
						{likedVideos.length > 0 && (
							<div style={{ marginBottom: 26 }}>
								<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
									<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
										<svg width={14} height={14} viewBox="0 0 24 24" fill="#ef4444" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13 }} className="text-text-primary">{t("userProfile.likedVideos")}</span>
									</div>
									<button onClick={() => { window.__videosInitialTab = "liked"; onNavigate?.("videos"); }}
										style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, padding: 0 }} className="text-text-secondary">
										{t("common.seeAll")}
									</button>
								</div>
								<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 10 }}>
									{likedVideos.map((v, i) => {
										const vid = v.video_id ?? v.id;
										// Hand the id to the Videos page, which opens it on mount (same handoff
										// the "See all" button uses for the tab).
										const openVideo = () => { window.__videosOpenVideoId = vid; onNavigate?.("videos"); };
										return (
											<div key={vid} onClick={openVideo} {...clickableProps(openVideo)} style={{ cursor: "pointer", animation: `fadeUp 0.3s ease ${i * 30}ms both` }}>
												<div style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", background: "#0d1421" }} className="border border-border-subtle">
													<SafeImage loading="lazy" decoding="async" src={v.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
														fallback={<div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#1e3a5f,#0f2744)" }} />} />
													<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.18)" }}>
														<svg width={26} height={26} viewBox="0 0 24 24" fill="rgba(255,255,255,0.92)" stroke="none" style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.5))" }}><polygon points="6 4 20 12 6 20 6 4" /></svg>
													</div>
												</div>
												<div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginTop: 7, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }} className="text-text-primary">{v.title ?? ""}</div>
												<div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginTop: 2 }} className="text-text-secondary">{v.channel?.display_name ?? ""}</div>
											</div>
										);
									})}
								</div>
							</div>
						)}
						{likedPosts.length === 0 && likedVideos.length === 0 ? (
							<div style={{ padding: "48px 0", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }} className="text-text-muted">{t("userProfile.noLikedPosts")}</div>
						) : (
							<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
								{likedPosts.map((p, i) => {
									const prof = p.social_profile ?? null;
									const att = p.social_media_attachments?.[0] ?? null;
									const imgSrc = att?.media_url ?? p.media_url ?? p.image_url ?? p.media_urls?.[0];
									// A liked video post used to be forced through an <img>, which just drew a
									// broken box. Trust the attachment's media_type, falling back to the file
									// extension for rows that predate it.
									const isVideoMedia = att?.media_type === "video" || !!imgSrc?.match(/\.(mp4|webm|mov|m4v)(\?|$)/i);
									const text = p.caption_text ?? p.content ?? p.text ?? p.caption ?? "";
									const author = prof?.display_name ?? prof?.handle ?? p.author_name ?? p.user?.name ?? p.display_name ?? "User";
									const avatarPic = prof?.profile_pic_url ?? null;
									const authorUserId = prof?.user_id ?? null;
									// #450: the whole card used to navigate to the AUTHOR (and did nothing at
									// all when the author's user_id was missing — the "random" part of the bug).
									// Open the post itself; the author is still reachable from the header.
									const goToAuthor = (e) => {
										e.stopPropagation();
										if (authorUserId) { window.__profileTargetId = authorUserId; onNavigate?.("profile"); }
									};
									return (
										<div key={p.social_post_id ?? p.post_id ?? p.id ?? i} onClick={() => openPostDetail(p)} {...clickableProps(() => openPostDetail(p))} style={{ borderRadius: 12, padding: "14px 16px", display: "flex", gap: 12, cursor: "pointer", animation: `fadeUp 0.3s ease ${i*40}ms both` }} className="bg-surface border border-border-subtle">
											<Avatar url={avatarPic} initials={author} size={36} onClick={goToAuthor}
												style={{ background: "linear-gradient(135deg,#2563eb,#60a5fa)", fontSize: 14, cursor: authorUserId ? "pointer" : "default" }} />
											<div style={{ flex: 1, minWidth: 0 }}>
												<div onClick={goToAuthor} style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 4, display: "inline-block", cursor: authorUserId ? "pointer" : "default" }} className="text-text-primary">{author}</div>
												{text && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5, marginBottom: imgSrc ? 8 : 0, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }} className="text-text-secondary">{text}</div>}
												{imgSrc && (isVideoMedia ? (
													<div style={{ position: "relative", borderRadius: 8, overflow: "hidden", background: "#000" }}>
														{/* preload="metadata" paints the first frame as a poster without
														    streaming the clip; the real player opens in the post detail. */}
														<video src={imgSrc} muted playsInline preload="metadata" style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block" }} />
														<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.18)", pointerEvents: "none" }}>
															<svg width={30} height={30} viewBox="0 0 24 24" fill="rgba(255,255,255,0.92)" stroke="none" style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.5))" }}><polygon points="6 4 20 12 6 20 6 4" /></svg>
														</div>
													</div>
												) : (
													<SafeImage loading="lazy" decoding="async" src={imgSrc} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 8, display: "block" }}
														fallback={<MediaPlaceholder style={{ width: "100%", height: 140, borderRadius: 8 }} />} />
												))}
												<div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10 }}>
													<span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "#ef4444" }}>
														<svg width={14} height={14} viewBox="0 0 24 24" fill="#ef4444" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
														{likeCountOf(p)}
													</span>
													<span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }} className="text-text-secondary">
														<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
														{commentCountOf(p)}
													</span>
												</div>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				)}

				{tab === "Subscriptions" && !isViewingOther && (
					<div>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 20 }} className="text-text-secondary">{subscriptionChannels.length} channel{subscriptionChannels.length !== 1 ? "s" : ""} subscribed</p>
						{subscriptionChannels.length === 0 ? (
							<div style={{ padding: "48px 0", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }} className="text-text-muted">No subscriptions yet. Subscribe to a channel from any video page.</div>
						) : (
							<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
								{subscriptionChannels.map(ch => (
									<div key={ch.channelId} style={{ borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }} className="bg-surface-raised border border-border">
										<div style={{ width: 48, height: 48, borderRadius: "50%", background: "#2563eb", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, color: "#fff", flexShrink: 0 }}>
											<SafeImage loading="lazy" decoding="async" src={ch.thumb} alt={ch.name} style={{ width: "100%", height: "100%", objectFit: "cover" }}
												fallback={ch.avatar} />
										</div>
										<div style={{ flex: 1 }}>
											<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 2 }} className="text-text-primary">{ch.name}</p>
											{ch.handle && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 2 }} className="text-text-secondary">@{ch.handle}</p>}
											<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }} className="text-text-secondary">{ch.subscribers.toLocaleString()} subscribers</p>
										</div>
										<button onClick={async () => {
											const removed = ch;
											setSubscriptionChannels(prev => prev.filter(c => c.channelId !== ch.channelId));
											try {
												await unsubscribeFromChannel(ch.channelId);
											} catch {
												// PROFILE-010: revert on error
												setSubscriptionChannels(prev => [...prev, removed]);
											}
										}} style={{ padding: "8px 16px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer", flexShrink: 0 }} className="bg-surface-raised border border-border text-text-secondary">{i18n.t("videos.unsubscribe")}</button>
									</div>
								))}
							</div>
						)}
					</div>
				)}

				{/* ── WISHLIST TAB ── */}
				{tab === "Wishlist" && (
					<div>
						{/* Header row */}
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
							<div>
								<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, textTransform: "uppercase", letterSpacing: "0.04em", margin: 0 }} className="text-text-primary">
									{isViewingOther ? `${displayName.split(" ")[0]}'s Wishlist` : "My Wishlist"}
								</p>
								{!wishlistLoading && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 3 }} className="text-text-muted">{wishlistItems.filter(i => i.status !== "removed").length} items · anyone can gift these</p>}
							</div>
							{!isViewingOther && (
								<button onClick={() => { setAddItemModal(true); setAddItemSearch(""); setAddItemResults([]); setAddItemPending(null); setAddItemType("all"); }}
									style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", background: "linear-gradient(135deg,#2563eb,#3b82f6)", border: "none", borderRadius: 20, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
									<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
									Add Item
								</button>
							)}
						</div>

						{wishlistLoading ? (
							<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14 }}>
								{[1,2,3].map(i => <div key={i} style={{ height: 220, borderRadius: 16 }} className="bg-surface-raised border border-border-subtle" />)}
							</div>
						) : wishlistItems.length === 0 ? (
							<div style={{ padding: "64px 0", textAlign: "center" }}>
								<div style={{ fontSize: 40, marginBottom: 14 }}>🎁</div>
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 8 }} className="text-text-muted">{isViewingOther ? "No wishlist items yet" : "Your wishlist is empty"}</p>
								{!isViewingOther && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }} className="text-text-muted">Add items from Strug — friends can gift them or chip in</p>}
							</div>
						) : (
							<div style={{ display: "grid", gridTemplateColumns: (isMobile || isSplitMode) ? "1fr 1fr" : "repeat(auto-fill,minmax(210px,1fr))", gap: 14 }}>
								{wishlistItems.map(item => {
									const isFunded = item.status === "funded";
									const isClaimed = item.status === "claimed";
									const pct = item.progress_pct ?? 0;
									const raised = item.total_contributed ?? 0;
									const price = item.price ?? 0;
									const accentColor = isFunded ? "#22c55e" : isClaimed ? "#8b5cf6" : "#2563eb";
									return (
										<div key={item.wishlist_item_id} style={{ border: `1px solid ${isFunded ? "rgba(34,197,94,0.25)" : "var(--color-border)"}`, borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }} className="bg-surface-raised">
											{/* Image */}
											{/* Gradient stays on the tile unconditionally: a loaded image covers it, and a 404'd one
											    now falls back to the same emoji-on-gradient the no-image case shows. */}
											<div style={{ height: 120, background: "linear-gradient(135deg,rgba(37,99,235,0.15),rgba(139,92,246,0.1))", position: "relative", overflow: "hidden", flexShrink: 0 }}>
												<SafeImage loading="lazy" decoding="async" src={item.image_url} alt={item.title} style={{ width: "100%", height: "100%", objectFit: "cover" }}
													fallback={<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>{item.item_type === "food" ? "🍔" : item.item_type === "booking" ? "🏠" : item.item_type === "product" ? "🛍️" : "🎁"}</div>} />
												{/* Status badge */}
												{(isFunded || isClaimed) && (
													<div style={{ position: "absolute", top: 8, right: 8, padding: "3px 8px", background: isClaimed ? "rgba(139,92,246,0.9)" : "rgba(34,197,94,0.9)", borderRadius: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: "0.05em" }}>
														{isClaimed ? "Claimed" : "Funded!"}
													</div>
												)}
												{/* Type chip */}
												<div style={{ position: "absolute", top: 8, left: 8, padding: "2px 7px", background: "rgba(0,0,0,0.6)", borderRadius: 5, fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
													{item.item_type}
												</div>
											</div>

											{/* Body */}
											<div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
												<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }} className="text-text-primary">{item.title}</p>
												<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 17, color: accentColor }}>CAD ${parseFloat(price).toFixed(2)}</p>

												{/* Progress bar */}
												<div>
													<div style={{ height: 5, borderRadius: 3, overflow: "hidden", marginBottom: 5 }} className="bg-surface-raised">
														<div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${accentColor},${accentColor}99)`, borderRadius: 3, transition: "width 0.6s ease" }} />
													</div>
													<div style={{ display: "flex", justifyContent: "space-between" }}>
														<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10 }} className="text-text-secondary">${parseFloat(raised).toFixed(2)} raised</span>
														<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10 }} className="text-text-secondary">{pct}%</span>
													</div>
												</div>

												{/* Contributor avatars */}
												{item.contributor_count > 0 && (
													<div style={{ display: "flex", alignItems: "center", gap: 5 }}>
														<div style={{ display: "flex" }}>
															{(item.recent_contributors ?? []).slice(0, 4).map((c, ci) => {
																const p = c.profile;
																return (
																	<div key={ci} style={{ width: 20, height: 20, borderRadius: "50%", border: "1.5px solid var(--color-bg)", background: "linear-gradient(135deg,#2563eb,#60a5fa)", marginLeft: ci > 0 ? -6 : 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff" }}>
																		<SafeImage src={p?.profile_pic_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
																			fallback={p?.display_name?.[0] ?? "?"} />
																	</div>
																);
															})}
														</div>
														<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10 }} className="text-text-muted">{item.contributor_count} gift{item.contributor_count !== 1 ? "s" : ""}</span>
													</div>
												)}

												{/* CTA */}
												{!isViewingOther && isFunded && (
													<button onClick={async () => {
														if (claiming === item.wishlist_item_id) return;
														setClaiming(item.wishlist_item_id);
														try {
															const res = await claimWishlistItem(item.wishlist_item_id);
															setWishlistItems(prev => prev.map(i => i.wishlist_item_id === item.wishlist_item_id ? { ...i, status: "claimed" } : i));
															alert(`🎉 CAD $${parseFloat(res.credited ?? 0).toFixed(2)} added to your wallet!`);
														} catch { /* noop */ } finally { setClaiming(null); }
													}} style={{ marginTop: "auto", width: "100%", padding: "9px 0", background: "linear-gradient(135deg,#22c55e,#16a34a)", border: "none", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 800, color: "#fff", cursor: claiming === item.wishlist_item_id ? "default" : "pointer", opacity: claiming === item.wishlist_item_id ? 0.7 : 1 }}>
														{claiming === item.wishlist_item_id ? "Claiming…" : "🎉 Claim to Wallet"}
													</button>
												)}
												{isViewingOther && !isClaimed && (
													<button onClick={() => { setContributeModal(item); setContributeAmount(""); setContributeNote(""); setContributeMsg(""); }}
														style={{ marginTop: "auto", width: "100%", padding: "9px 0", background: isFunded ? "var(--color-surface-raised)" : "linear-gradient(135deg,#2563eb,#3b82f6)", border: isFunded ? "1px solid var(--color-border)" : "none", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: isFunded ? "var(--color-text-primary)" : "#fff", cursor: "pointer" }}>
														{isFunded ? "View contributions" : "Gift / Chip in"}
													</button>
												)}

												{/* Remove from wishlist — own profile, not yet claimed */}
												{!isViewingOther && !isClaimed && (
													<button onClick={() => setRemoveConfirmItem(item)}
														style={{ marginTop: 4, width: "100%", padding: "7px 0", background: "transparent", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, color: "rgba(239,68,68,0.7)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, transition: "border-color 0.15s, color 0.15s" }}
														onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(239,68,68,0.6)"; e.currentTarget.style.color = "#ef4444"; }}
														onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(239,68,68,0.25)"; e.currentTarget.style.color = "rgba(239,68,68,0.7)"; }}>
														<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
															<polyline points="3 6 5 6 21 6"/>
															<path d="M19 6l-1 14H6L5 6"/>
															<path d="M10 11v6M14 11v6"/>
															<path d="M9 6V4h6v2"/>
														</svg>
														Remove
													</button>
												)}
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				)}

			</div>{/* closes center content */}

			{/* ── RIGHT SIDEBAR (desktop only) ── */}
			{!isMobile && !isTablet && (
				<div style={{ width: 238, flexShrink: 0, position: "sticky", top: 20, alignSelf: "flex-start", marginTop: 20, maxHeight: "calc(100vh - 40px)" }}>
				<aside className="sb-scroll" style={{ maxHeight: "calc(100vh - 40px)", overflowY: "auto", scrollbarWidth: "thin", display: "flex", flexDirection: "column", paddingTop: 3, paddingBottom: 24 }}>

					{/* About — handle/joined/location/website only; bio lives in the center column */}
					<div
						onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px var(--color-shadow)"; }}
						onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
						style={{ borderRadius: 14, padding: "14px 16px", marginBottom: 12, transition: "transform 0.2s, box-shadow 0.2s" }} className="bg-surface-raised border border-border">
						<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }} className="text-text-secondary">About</p>
						<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
							<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
								<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }} className="text-text-secondary">@{handle}</span>
							</div>
							{joinedDate && (
								<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
									<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }} className="text-text-secondary">Joined {joinedDate}</span>
								</div>
							)}
							{socialProfile?.location && (
								<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
									<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }} className="text-text-secondary">{socialProfile.location}</span>
								</div>
							)}
							{socialProfile?.website && (
								<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
									<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
									<a href={isSafeHttpUrl(socialProfile.website) ? socialProfile.website : undefined} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#60a5fa", textDecoration: "none", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{socialProfile.website.replace(/^https?:\/\//, "")}</a>
								</div>
							)}
						</div>
					</div>

					{/* Profile Stats */}
					<div ref={setStatsNode}
						onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px var(--color-shadow)"; }}
						onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
						style={{ borderRadius: 14, padding: "14px 16px", marginBottom: 12, transition: "transform 0.2s, box-shadow 0.2s" }} className="bg-surface-raised border border-border">
						<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }} className="text-text-secondary">Profile Stats</p>
						{/* minmax(0, 1fr), NOT 1fr: a bare `1fr` is minmax(auto, 1fr), so a track can never shrink
						    below its own min-content. "FOLLOWERS" + the chevron sets a ~80px floor per tile, and
						    3 of those plus gaps + card padding exceed the sidebar, so the third tile overflowed
						    the card and the POSTS box rendered clipped. minmax(0, …) lets the tracks share the
						    available width instead of overflowing it. */}
						<div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, textAlign: "center" }}>
							{[
								{ label: "Followers", value: followerCount, type: "followers" },
								{ label: "Following", value: followingCount, type: "following" },
								{ label: "Posts", value: postCount, type: null },
							].map(stat => {
								const profileId = socialProfile?.id ?? socialProfile?.profile_id;
								const clickable = stat.type && profileId;
								return (
								<div key={stat.label}
									onClick={clickable ? async () => {
										setFollowListModal(stat.type);
										const cacheKey = stat.type + "_" + (targetUserId ?? "own");
										if (followListCacheRef.current[cacheKey]) {
											setFollowList(followListCacheRef.current[cacheKey]);
											setFollowListLoading(false);
											return;
										}
										setFollowList([]);
										setFollowListLoading(true);
										try {
											const fn = stat.type === "following" ? getFollowing : getFollowers;
											const data = await fn(profileId);
											const list = Array.isArray(data) ? data : (data?.data ?? []);
											followListCacheRef.current[cacheKey] = list;
											setFollowList(list);
										} catch { setFollowList([]); }
										setFollowListLoading(false);
									} : undefined}
									onMouseEnter={clickable ? e => { e.currentTarget.style.background = "rgba(37,99,235,0.12)"; e.currentTarget.style.borderColor = "rgba(37,99,235,0.35)"; } : undefined}
									onMouseLeave={clickable ? e => { e.currentTarget.style.background = "var(--color-surface-raised)"; e.currentTarget.style.borderColor = "var(--color-border-subtle)"; } : undefined}
									style={{ padding: "10px 4px", borderRadius: 9, cursor: clickable ? "pointer" : "default", transition: "background 0.15s, border-color 0.15s", position: "relative", minWidth: 0, overflow: "hidden" }} className="bg-surface-raised border border-border-subtle">
									<div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, lineHeight: 1 }} className="text-text-primary">
										<AnimatedCount value={stat.value} visible={statsVisible} />
									</div>
									{/* 9px, not 10px: with the chevron out of flow a tile gives the label its full
									    ~56px, and "FOLLOWERS" measures 61px at 10px. 9px brings it to ~52px so English
									    sits comfortably. The ellipsis stays as a safety net — these labels are
									    translated, and e.g. German "ABONNENTEN" is longer than anything English has,
									    so no fixed width survives i18n. */}
									<div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginTop: 3, minWidth: 0 }}>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.02em", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-text-secondary">{stat.label}</span>
										{/* The chevron is positioned OUT of the label row rather than sitting in it.
										    It used to be a flex sibling, with an invisible 9px spacer on Posts so the
										    labels "centred identically" — but that spacer pushed the Posts text left of
										    true centre, AND cost every tile 10px (chevron + gap) of a 56px budget while
										    "FOLLOWERS" needs 61px, which is what forced the ellipsis. Taking it out of
										    flow fixes the centring and the truncation together. */}
										{clickable && (
											<svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round"
												style={{ position: "absolute", top: 6, right: 5, opacity: 0.75 }}>
												<polyline points="9 18 15 12 9 6"/>
											</svg>
										)}
									</div>
								</div>
								);
							})}
						</div>
					</div>

					{/* Quick Actions — optional widget, own profile only */}
					{rightWidgets.includes("quick-actions") && !isViewingOther && (
					<div
						onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px var(--color-shadow)"; }}
						onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
						style={{ borderRadius: 14, padding: "14px 16px", marginBottom: 12, transition: "transform 0.2s, box-shadow 0.2s" }} className="bg-surface-raised border border-border">
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
								<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }} className="text-text-secondary">Quick Actions</p>
								<WidgetSourceHint kind="shortcuts" />
							</div>
							<Tooltip text="Remove widget"><button aria-label="Remove widget" onClick={() => removeWidget("right", "quick-actions")} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 4, display: "flex", alignItems: "center", lineHeight: 1 }} className="text-text-muted"><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></Tooltip>
						</div>
						<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
							{[
								{ label: "Post to Community", nav: "community", color: "#2563eb", icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
								{ label: "Go Live", nav: "live", color: "#ef4444", icon: "M15 10l4.55-2.28A1 1 0 0 1 21 8.73v6.54a1 1 0 0 1-1.45.91L15 14M1 8.73A2 2 0 0 1 3 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8.73z" },
								{ label: "Upload a Video", nav: "videos", color: "#8b5cf6", icon: "M23 7 16 12 23 17V7zM1 5h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H1" },
								{ label: "Order Food", nav: "food", color: "#f59e0b", icon: "M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3" },
								{ label: "Shop on Strug", nav: "shop", color: "#10b981", icon: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" },
							].map(action => (
								<button key={action.label} onClick={() => onNavigate(action.nav)}
									style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 9, cursor: "pointer", textAlign: "left", transition: "background 0.15s, border-color 0.15s", width: "100%" }} className="bg-surface-raised border border-border-subtle"
									onMouseEnter={e => { e.currentTarget.style.background = `${action.color}15`; e.currentTarget.style.borderColor = `${action.color}40`; }}
									onMouseLeave={e => { e.currentTarget.style.background = "var(--color-surface-raised)"; e.currentTarget.style.borderColor = "var(--color-border-subtle)"; }}>
									<div style={{ width: 28, height: 28, borderRadius: 8, background: `${action.color}20`, border: `1px solid ${action.color}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
										<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={action.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
											{action.icon.split("M").filter(Boolean).map((seg, i) => <path key={i} d={"M" + seg} />)}
										</svg>
									</div>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }} className="text-text-secondary">{action.label}</span>
									<svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" style={{ marginLeft: "auto", flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
								</button>
							))}
						</div>
					</div>
					)}

					{/* Subscriptions — optional widget, own profile only */}
					{rightWidgets.includes("subscriptions") && !isViewingOther && subscriptionChannels.length > 0 && (
					<div
						onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px var(--color-shadow)"; }}
						onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
						style={{ borderRadius: 14, padding: "14px 16px", marginBottom: 12, transition: "transform 0.2s, box-shadow 0.2s" }} className="bg-surface-raised border border-border">
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
							<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }} className="text-text-secondary">Subscriptions</p>
							<Tooltip text="Remove widget"><button aria-label="Remove widget" onClick={() => removeWidget("right", "subscriptions")} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 4, display: "flex", alignItems: "center", lineHeight: 1 }} className="text-text-muted"><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></Tooltip>
						</div>
						<div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
							{subscriptionChannels.slice(0, 4).map(ch => (
								<div key={ch.channelId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
									<div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", fontWeight: 700, overflow: "hidden" }}>
										<SafeImage src={ch.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
											fallback={ch.name?.[0]?.toUpperCase() ?? "?"} />
									</div>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-text-primary">{ch.name}</div>
										<div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }} className="text-text-muted">{ch.subscribers?.toLocaleString()} subscribers</div>
									</div>
									<button onClick={() => onNavigate("live")} style={{ padding: "4px 9px", background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 7, fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: "#a78bfa", cursor: "pointer", flexShrink: 0 }}>Watch</button>
								</div>
							))}
							{subscriptionChannels.length > 4 && (
								<button onClick={() => setTab("Subscriptions")} style={{ padding: "7px 12px", background: "none", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer", textAlign: "center" }} className="border border-border text-text-secondary">
									+{subscriptionChannels.length - 4} more channels
								</button>
							)}
						</div>
					</div>
					)}

					{/* Achievements — optional widget */}
					{rightWidgets.includes("achievements") && (
					<div
						onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px var(--color-shadow)"; }}
						onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
						style={{ borderRadius: 14, padding: "14px 16px", marginBottom: 12, transition: "transform 0.2s, box-shadow 0.2s" }} className="bg-surface-raised border border-border">
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
								<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }} className="text-text-secondary">Achievements</p>
								<WidgetSourceHint kind="live" />
							</div>
							<Tooltip text="Remove widget"><button aria-label="Remove widget" onClick={() => removeWidget("right", "achievements")} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 4, display: "flex", alignItems: "center", lineHeight: 1 }} className="text-text-muted"><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></Tooltip>
						</div>
						<div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
							{[
								showEarlyAdopterBadge
									? { color: "#f59e0b", svg: <svg width={13} height={13} viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, label: "Early Adopter", desc: "Joined during beta", earned: isEarlyAdopter }
									: null,
								{ color: "#2563eb", svg: <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>, label: "Content Creator", desc: "Posted your first piece", earned: postCount > 0 },
								{ color: "#8b5cf6", svg: <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, label: "Socialite", desc: "Gained 10+ followers", earned: followerCount >= 10 },
								{ color: "#10b981", svg: <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>, label: "Networker", desc: "Following 5+ people", earned: followingCount >= 5 },
								{ color: "#22c55e", svg: <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>, label: "Verified", desc: "Identity confirmed", earned: !!socialProfile?.is_verified },
							].filter(Boolean).map(a => (
								<div key={a.label} style={{ display: "flex", gap: 10, alignItems: "center", opacity: a.earned ? 1 : 0.32 }}>
									<div style={{ width: 30, height: 30, borderRadius: 8, background: a.earned ? `${a.color}1a` : "var(--color-surface-raised)", border: `1px solid ${a.earned ? `${a.color}44` : "var(--color-border)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{a.svg}</div>
									<div>
										<div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700 }} className={a.earned ? "text-text-primary" : "text-text-secondary"}>{a.label}</div>
										<div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }} className="text-text-muted">{a.desc}</div>
									</div>
								</div>
							))}
						</div>
					</div>
					)}

					{/* Daily Challenge — optional widget, own profile only */}
					{rightWidgets.includes("daily-challenge") && !isViewingOther && (
						<div
							onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px var(--color-shadow)"; }}
							onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
							style={{ border: "1px solid rgba(37,99,235,0.2)", borderRadius: 14, padding: "14px 16px", marginBottom: 12, transition: "transform 0.2s, box-shadow 0.2s" }} className="bg-surface-raised">
							<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
								<div style={{ display: "flex", alignItems: "center", gap: 7 }}>
									<svg width={13} height={13} viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
									<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }} className="text-text-secondary">Daily Challenge</p>
									<WidgetSourceHint kind="live" />
								</div>
								<Tooltip text="Remove widget"><button aria-label="Remove widget" onClick={() => removeWidget("right", "daily-challenge")} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 4, display: "flex", alignItems: "center", lineHeight: 1 }} className="text-text-muted"><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></Tooltip>
							</div>
							{challengeDone ? (
								<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 9 }}>
									<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#22c55e", fontWeight: 600 }}>Completed today!</span>
								</div>
							) : (
								<>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5, marginBottom: 10 }} className="text-text-secondary">{dailyChallengeText}</p>
									<button onClick={() => {
										navigator.clipboard?.writeText(`${window.location.origin}/@${handle}`);
										const today = new Date().toDateString();
										setChallengeDone(true);
										persistSidebarState({ challenge_done_date: today });
									}} style={{ width: "100%", padding: "9px 12px", background: "linear-gradient(135deg,#2563eb,#3b82f6)", border: "none", borderRadius: 9, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer", letterSpacing: "0.02em" }}>
										Copy &amp; Share Link
									</button>
								</>
							)}
						</div>
					)}

					{/* Daily Goals */}
					{rightWidgets.includes("daily-goals") && !isViewingOther && (
						<div onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 8px 24px var(--color-shadow)";}} onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}} style={{borderRadius:14,padding:"14px 16px",marginBottom:12,transition:"transform 0.2s,box-shadow 0.2s"}} className="bg-surface-raised border border-border">
							<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
								<div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
									<span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:13,textTransform:"uppercase",letterSpacing:"0.06em"}} className="text-text-secondary">Today's Goals</span>
									<WidgetSourceHint kind="live" />
								</div>
								<div style={{display:"flex",alignItems:"center",gap:6}}>
									{goals.every(Boolean)&&<span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:"#22c55e",fontWeight:700}}>All done!</span>}
									<Tooltip text="Remove widget"><button aria-label="Remove widget" onClick={()=>removeWidget("right","daily-goals")} style={{background:"none",border:"none",cursor:"pointer",padding:"2px 4px",borderRadius:4,display:"flex",alignItems:"center",lineHeight:1}} className="text-text-secondary" onMouseEnter={e=>{e.currentTarget.style.color="#f87171";}} onMouseLeave={e=>{e.currentTarget.style.color="var(--color-text-muted)";}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></Tooltip>
								</div>
							</div>
							<div style={{display:"flex",flexDirection:"column",gap:7}}>
								{dailyGoalsLabels.map((label,gi)=>(
									<button key={gi} onClick={()=>{const next=[...goals];next[gi]=!next[gi];setGoals(next);persistSidebarState({ goals: next });}} style={{display:"flex",alignItems:"center",gap:10,background:"none",border:"none",cursor:"pointer",padding:"6px 8px",borderRadius:8,transition:"background 0.15s",textAlign:"left"}} onMouseEnter={e=>{e.currentTarget.style.background="var(--color-surface-raised)";}} onMouseLeave={e=>{e.currentTarget.style.background="none";}}>
										<div style={{width:18,height:18,borderRadius:5,border:`1.5px solid ${goals[gi]?"#22c55e":"var(--color-border)"}`,background:goals[gi]?"rgba(34,197,94,0.15)":"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"}}>
											{goals[gi]&&<svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{animation:"sbBounce 0.3s ease both"}}><polyline points="20 6 9 17 4 12"/></svg>}
										</div>
										<span style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,textDecoration:goals[gi]?"line-through":"none",transition:"all 0.2s"}} className={goals[gi] ? "text-text-muted" : "text-text-primary"}>{label}</span>
									</button>
								))}
							</div>
						</div>
					)}

					{/* Sticky Notes — fixed dark amber-tinted card regardless of theme; see the Book
					    Recommendation comment above for why these accent-gradient widgets stay dark. */}
					{rightWidgets.includes("sticky-notes") && !isViewingOther && (
						<div onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,0.4)";}} onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}} style={{background:"linear-gradient(135deg,rgba(251,191,36,0.08) 0%,rgba(10,10,20,0.95) 100%)",border:"1px solid rgba(251,191,36,0.2)",borderRadius:14,padding:"14px 16px",marginBottom:12,transition:"transform 0.2s,box-shadow 0.2s"}}>
							<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
								<div style={{display:"flex",alignItems:"center",gap:7}}>
									<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="rgba(251,191,36,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
									<span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:13,color:"rgba(251,191,36,0.8)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Notes</span>
									<WidgetSourceHint kind="live" />
								</div>
								<Tooltip text="Remove widget"><button aria-label="Remove widget" onClick={()=>removeWidget("right","sticky-notes")} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.55)",padding:"2px 4px",borderRadius:4,display:"flex",alignItems:"center",lineHeight:1}} onMouseEnter={e=>{e.currentTarget.style.color="#f87171";}} onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.45)";}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></Tooltip>
							</div>
							<textarea value={stickyText} onChange={e=>{const v=e.target.value;setStickyText(v);persistSidebarState({ sticky_text: v });}} placeholder="Jot something down…" rows={4} style={{width:"100%",background:"transparent",border:"none",outline:"none",resize:"none",fontFamily:"'DM Sans',sans-serif",fontSize:13,color:"rgba(255,255,255,0.75)",lineHeight:1.6,padding:0,boxSizing:"border-box",caretColor:"#fbbf24"}}/>
						</div>
					)}

					{/* Calendar */}
					{rightWidgets.includes("calendar") && (()=>{
						const today=new Date();
						const dayNames=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
						const monthNames=["January","February","March","April","May","June","July","August","September","October","November","December"];
						const firstDay=new Date(today.getFullYear(),today.getMonth(),1).getDay();
						const daysInMonth=new Date(today.getFullYear(),today.getMonth()+1,0).getDate();
						const cells=[];
						for(let i=0;i<firstDay;i++)cells.push(null);
						for(let d=1;d<=daysInMonth;d++)cells.push(d);
						while(cells.length%7!==0)cells.push(null);
						return(
							<div onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 8px 24px var(--color-shadow)";}} onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}} style={{borderRadius:14,padding:"14px 16px",marginBottom:12,transition:"transform 0.2s,box-shadow 0.2s"}} className="bg-surface-raised border border-border">
								<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
									<div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
										<span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:13,textTransform:"uppercase",letterSpacing:"0.06em"}} className="text-text-secondary">{monthNames[today.getMonth()]} {today.getFullYear()}</span>
										<WidgetSourceHint kind="local" />
									</div>
									<div style={{display:"flex",alignItems:"center",gap:6}}>
										<span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:22,color:"#2563eb"}}>{today.getDate()}</span>
										<Tooltip text="Remove widget"><button aria-label="Remove widget" onClick={()=>removeWidget("right","calendar")} style={{background:"none",border:"none",cursor:"pointer",padding:"2px 4px",borderRadius:4,display:"flex",alignItems:"center",lineHeight:1}} className="text-text-secondary" onMouseEnter={e=>{e.currentTarget.style.color="#f87171";}} onMouseLeave={e=>{e.currentTarget.style.color="var(--color-text-muted)";}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></Tooltip>
									</div>
								</div>
								<div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
									{dayNames.map(d=><div key={d} style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,textAlign:"center",paddingBottom:3}} className="text-text-muted">{d}</div>)}
								</div>
								<div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
									{cells.map((d,ci)=>(
										<div key={ci} style={{height:20,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:4,background:d===today.getDate()?"#2563eb":undefined,fontFamily:"'DM Sans',sans-serif",fontSize:10,color:d===today.getDate()?"#fff":d?"var(--color-text-secondary)":"transparent",fontWeight:d===today.getDate()?700:400}}>
											{d||""}
										</div>
									))}
								</div>
							</div>
						);
					})()}

					{/* Account Anniversary — fixed dark amber-tinted card regardless of theme; see the Book
					    Recommendation comment above. */}
					{rightWidgets.includes("anniversary") && (()=>{
						const joined = profileJoinedAt && !Number.isNaN(profileJoinedAt.getTime()) ? profileJoinedAt : null;
						const now=new Date();
						const years=joined?Math.floor((now-joined)/(1000*60*60*24*365)):null;
						const months=joined?Math.floor(((now-joined)%(1000*60*60*24*365))/(1000*60*60*24*30)):null;
						const label=years>0?`${years} Year${years>1?"s":""}`:`${months??0} Month${(months??0)!==1?"s":""}`;
						return(
							<div onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";}} onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";}} style={{background:"linear-gradient(135deg,rgba(251,191,36,0.1) 0%,rgba(10,10,20,0.95) 100%)",border:"1px solid rgba(251,191,36,0.25)",borderRadius:14,padding:"14px 16px",marginBottom:12,transition:"transform 0.2s",animation:"sbAnnivGlow 3.5s ease-in-out infinite",textAlign:"center"}}>
								<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
									<div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
										<span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:13,color:"rgba(251,191,36,0.8)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Anniversary</span>
										<WidgetSourceHint kind="live" />
									</div>
									<Tooltip text="Remove widget"><button aria-label="Remove widget" onClick={()=>removeWidget("right","anniversary")} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.55)",padding:"2px 4px",borderRadius:4,display:"flex",alignItems:"center",lineHeight:1}} onMouseEnter={e=>{e.currentTarget.style.color="#f87171";}} onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.45)";}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></Tooltip>
								</div>
								{joined ? (
									<>
										<p style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"rgba(255,255,255,0.55)",margin:"0 0 4px"}}>You've been with us</p>
										<p style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:28,color:"#fbbf24",margin:"0 0 4px",lineHeight:1}}>{label}</p>
										<p style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"rgba(255,255,255,0.55)",margin:0}}>Thanks for being here</p>
									</>
								) : (
									<p style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"rgba(255,255,255,0.55)",margin:0}}>Join date not available for this profile.</p>
								)}
							</div>
						);
					})()}

					{/* Weather — live via GET /platform/weather (Open-Meteo proxy) */}
					{rightWidgets.includes("weather") && (
						<div onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,0.4)";}} onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}} style={{background:"linear-gradient(135deg,rgba(37,99,235,0.12) 0%,rgba(10,10,20,0.95) 100%)",border:"1px solid rgba(37,99,235,0.2)",borderRadius:14,padding:"14px 16px",marginBottom:12,transition:"transform 0.2s,box-shadow 0.2s"}}>
							<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
									<div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
										<span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:13,color:"rgba(255,255,255,0.5)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Weather</span>
										<WidgetSourceHint kind="live" />
									</div>
									<Tooltip text="Remove widget"><button aria-label="Remove widget" onClick={()=>removeWidget("right","weather")} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.55)",padding:"2px 4px",borderRadius:4,display:"flex",alignItems:"center",lineHeight:1}} onMouseEnter={e=>{e.currentTarget.style.color="#f87171";}} onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.45)";}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></Tooltip>
								</div>
							{weatherLoading ? (
								<p style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:"rgba(255,255,255,0.55)",margin:0}}>Loading…</p>
							) : weather ? (
								<div style={{display:"flex",alignItems:"center",gap:14}}>
									<div style={{animation:"sbRotateSun 12s linear infinite",filter:"drop-shadow(0 0 8px rgba(251,191,36,0.5))"}}>
										<svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
									</div>
									<div>
										<p style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:32,color:"#fff",margin:0,lineHeight:1}}>{weather.temperature_c}°C</p>
										<p style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"rgba(255,255,255,0.5)",margin:"2px 0 0"}}>{weather.condition} · {weather.city}</p>
									</div>
								</div>
							) : (
								<p style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:"rgba(255,255,255,0.55)",margin:0,lineHeight:1.5}}>
									{weatherError || "Weather unavailable right now."}
								</p>
							)}
						</div>
					)}

					{/* ── Profile Insights widget — context-aware, rotates every 60s ── */}
					{(() => {
						// Slides differ based on whose profile you're viewing
						const othersSlides = [
							{ id: "listings",  label: "Their Listings",   icon: "🛍️" },
							{ id: "posts",     label: "Recent Posts",      icon: "📝" },
							{ id: "services",  label: "Their Services",    icon: "⚡" },
							{ id: "connect",   label: "Connect",           icon: "🤝" },
						];
						const ownSlides = [
							{ id: "wallet",    label: "Your Wallet",       icon: "💰" },
							{ id: "listings",  label: "Your Listings",     icon: "🛍️" },
							{ id: "posts",     label: "Recent Activity",   icon: "📝" },
							{ id: "tips",      label: "Grow Your Profile", icon: "💡" },
						];
						const slides = isViewingOther ? othersSlides : ownSlides;
						const slide = slides[discoverIdx % slides.length];

						// Data from already-loaded state
						const allListings = [...verticalListings.slice(0, 3), ...userServices.slice(0, 3)].slice(0, 3);
						const recentPosts = userPosts.slice(0, 3);

						return (
							<div style={{ borderRadius: 16, overflow: "hidden", marginBottom: 10 }} className="bg-surface-raised border border-border">
								{/* Header */}
								<div style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--color-border-subtle)" }}>
									<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
										<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.07em" }} className="text-text-secondary">
											{slide.icon} {slide.label}
										</span>
										<div style={{ display: "flex", gap: 4 }}>
											{slides.map((_, i) => (
												<button key={i} onClick={() => { setDiscoverIdx(i); setDiscoverProgress(0); }}
													style={{ width: i === discoverIdx % slides.length ? 16 : 6, height: 6, borderRadius: 3, background: i === discoverIdx % slides.length ? "#2563eb" : "var(--color-border)", border: "none", cursor: "pointer", padding: 0, transition: "width 0.3s ease, background 0.3s ease" }} />
											))}
										</div>
									</div>
									<div style={{ height: 2, borderRadius: 2, overflow: "hidden" }} className="bg-surface-raised">
										<div style={{ height: "100%", width: `${discoverProgress}%`, background: "linear-gradient(90deg,#2563eb,#60a5fa)", borderRadius: 2, transition: "width 0.6s linear" }} />
									</div>
								</div>

								{/* Slide content */}
								<div key={slide.id + discoverIdx} style={{ padding: "10px 14px 12px", animation: "fadeUp 0.28s ease both" }}>

									{/* Listings — own or other */}
									{slide.id === "listings" && (
										allListings.length > 0 ? (
											<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
												{allListings.map((l, i) => (
													<div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderBottom: i < allListings.length - 1 ? "1px solid var(--color-border-subtle)" : "none" }}>
														<div style={{ width: 40, height: 40, borderRadius: 9, background: "rgba(37,99,235,0.12)", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
															<SafeImage src={l.image_url ?? l.images?.[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} fallback="🛍️" />
														</div>
														<div style={{ flex: 1, minWidth: 0 }}>
															<p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-text-primary">{l.title ?? l.name ?? "Listing"}</p>
															{(l.price ?? l.base_price) && <p style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 13, color: "#2563eb" }}>CAD ${parseFloat(l.price ?? l.base_price).toFixed(2)}</p>}
														</div>
													</div>
												))}
											</div>
										) : (
											<p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, textAlign: "center", padding: "12px 0" }} className="text-text-muted">
												{isViewingOther ? "No listings yet" : "You have no active listings"}
											</p>
										)
									)}

									{/* Recent posts */}
									{slide.id === "posts" && (
										recentPosts.length > 0 ? (
											<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
												{recentPosts.map((p, i) => (
													<div key={i} style={{ padding: "7px 0", borderBottom: i < recentPosts.length - 1 ? "1px solid var(--color-border-subtle)" : "none" }}>
														<p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, lineHeight: 1.45, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }} className="text-text-secondary">
															{p.content ?? p.text ?? "Post"}
														</p>
														<p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, marginTop: 4 }} className="text-text-muted">
															{p.like_count ?? 0} likes · {p.comment_count ?? 0} comments
														</p>
													</div>
												))}
											</div>
										) : (
											<p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, textAlign: "center", padding: "12px 0" }} className="text-text-muted">{(accountPrivate || (socialProfile?.is_private && isFollowing !== true && isViewingOther)) ? t("userProfile.privateAccount", "This account is private. Follow to see their posts.") : "No posts yet"}</p>
										)
									)}

									{/* Services (others only) */}
									{slide.id === "services" && (
										userServices.length > 0 ? (
											<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
												{userServices.slice(0, 3).map((s, i) => (
													<div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderBottom: i < Math.min(userServices.length, 3) - 1 ? "1px solid var(--color-border-subtle)" : "none" }}>
														<div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(139,92,246,0.15)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⚡</div>
														<div style={{ flex: 1, minWidth: 0 }}>
															<p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-text-primary">{s.title ?? s.service_name ?? "Service"}</p>
															{s.base_price && <p style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 12, color: "#8b5cf6" }}>From CAD ${parseFloat(s.base_price).toFixed(2)}</p>}
														</div>
													</div>
												))}
											</div>
										) : (
											<p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, textAlign: "center", padding: "12px 0" }} className="text-text-muted">No services listed</p>
										)
									)}

									{/* Connect CTA (others only) */}
									{slide.id === "connect" && (
										<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
											<div style={{ display: "flex", gap: 14, justifyContent: "center", marginBottom: 4 }}>
												<div style={{ textAlign: "center" }}>
													<p style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 22 }} className="text-text-primary">{followerCount}</p>
													<p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11 }} className="text-text-secondary">Followers</p>
												</div>
												<div style={{ width: 1 }} className="bg-surface-raised" />
												<div style={{ textAlign: "center" }}>
													<p style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 22 }} className="text-text-primary">{postCount}</p>
													<p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11 }} className="text-text-secondary">Posts</p>
												</div>
											</div>
											<p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, textAlign: "center", lineHeight: 1.5 }} className="text-text-secondary">
												{isFollowing ? `You follow @${handle}` : `Follow @${handle} to see their posts in your feed`}
											</p>
										</div>
									)}

									{/* Wallet summary (own only) */}
									{slide.id === "wallet" && (
										<div style={{ textAlign: "center", padding: "8px 0" }}>
											<p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, marginBottom: 6 }} className="text-text-secondary">Available Balance</p>
											<p style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 32, color: "#22c55e", letterSpacing: "0.02em" }}>
												{walletBalance !== null ? `CAD $${walletBalance.toFixed(2)}` : "—"}
											</p>
											<p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, marginTop: 6 }} className="text-text-muted">Strug Wallet</p>
										</div>
									)}

									{/* Profile tips (own only) */}
									{slide.id === "tips" && (
										<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
											{[
												{ done: !!bio,                  label: "Add a bio" },
												{ done: !!socialProfile?.profile_pic_url, label: "Set a profile photo" },
												{ done: followerCount >= 1,     label: "Get your first follower" },
												{ done: postCount >= 1,         label: "Make your first post" },
												{ done: !!socialProfile?.location, label: "Add your location" },
											].filter((_, i) => i < 4).map((tip, i) => (
												<div key={i} style={{ display: "flex", alignItems: "center", gap: 10, opacity: tip.done ? 0.4 : 1 }}>
													<div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${tip.done ? "#22c55e" : "var(--color-border)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
														{tip.done && <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
													</div>
													<p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, textDecoration: tip.done ? "line-through" : "none" }} className={tip.done ? "text-text-muted" : "text-text-primary"}>{tip.label}</p>
												</div>
											))}
										</div>
									)}
								</div>
							</div>
						);
					})()}

					{/* Customize widgets — right sidebar */}
					<div ref={widgetPickerSide === "right" ? widgetPickerRef : null} style={{ position: "relative" }}>
						{widgetPickerSide === "right" && (
							<div style={{ borderRadius: 12, padding: "12px 14px", marginBottom: 10 }} className="bg-surface-raised border border-border">
								<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }} className="text-text-muted">Add a widget</p>
								{widgetLimitMsg === "right" && (
									<div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.3)", borderRadius: 8, marginBottom: 8, animation: "sbFadeUp 0.25s ease both" }}>
										<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#fb923c", fontWeight: 600 }}>Max 4 widgets per side</span>
									</div>
								)}
								{ALL_RIGHT_WIDGETS.filter(w => !w.locked && !rightWidgets.includes(w.id) && (!w.ownOnly || !isViewingOther)).length === 0 ? (
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }} className="text-text-muted">All widgets added</p>
								) : (
									<div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
										{ALL_RIGHT_WIDGETS.filter(w => !w.locked && !rightWidgets.includes(w.id) && (!w.ownOnly || !isViewingOther)).map(w => (
											<button key={w.id} onClick={() => addWidget("right", w.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "left", transition: "background 0.15s" }} className="bg-surface-raised border border-border text-text-secondary"
												onMouseEnter={e => { e.currentTarget.style.background = "rgba(37,99,235,0.12)"; }}
												onMouseLeave={e => { e.currentTarget.style.background = "var(--color-surface-raised)"; }}>
												<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
												{w.label}
											</button>
										))}
									</div>
								)}
							</div>
						)}
						<button onClick={() => setWidgetPickerSide(prev => prev === "right" ? null : "right")}
							style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", padding: "9px 12px", border: "1px dashed var(--color-border)", borderRadius: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, transition: "background 0.15s, border-color 0.15s, color 0.15s" }} className="bg-surface-raised text-text-muted"
							onMouseEnter={e => { e.currentTarget.style.background = "rgba(37,99,235,0.08)"; e.currentTarget.style.borderColor = "rgba(37,99,235,0.3)"; e.currentTarget.style.color = "#93c5fd"; }}
							onMouseLeave={e => { e.currentTarget.style.background = "var(--color-surface-raised)"; e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.color = "var(--color-text-muted)"; }}>
							<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
							Customize widgets
						</button>
					</div>


				</aside>
				</div>
			)}

			</div>{/* closes flex row */}
			</div>{/* closes outer padding div */}

			{/* #430: the bare CommentsSheet and the standalone image lightbox that used to live here
			    are gone. A post — or a photo — now opens the app's REAL post view (media, like,
			    save/repost, comments, view count), which is what the reporter was asking for. */}
			{bannerCropSrc && (
				<ImageCropModal
					src={bannerCropSrc}
					aspect={3}
					title={t("userProfile.adjustBanner", { defaultValue: "Adjust banner" })}
					onCancel={() => { URL.revokeObjectURL(bannerCropSrc); setBannerCropSrc(null); }}
					onConfirm={(file) => { URL.revokeObjectURL(bannerCropSrc); setBannerCropSrc(null); uploadBannerFile(file); }}
				/>
			)}

			{/* PROFILE-Q1: delete-post confirm */}
			{deleteTarget && (
				<div onClick={() => !deleting && (setDeleteTarget(null), setDeleteError(""))} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 250, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
					<div onClick={e => e.stopPropagation()} style={{ borderRadius: 16, padding: "24px 22px", maxWidth: 340, width: "100%", textAlign: "center" }} className="bg-surface-raised border border-border">
						<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "0.03em", marginBottom: 8 }} className="text-text-primary">{i18n.t("feed.deletePost")}</p>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: deleteError ? 12 : 20 }} className="text-text-secondary">{i18n.t("userProfile.deleteConfirm")}</p>
						{deleteError && <p role="alert" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#f87171", marginBottom: 16 }}>{deleteError}</p>}
						<div style={{ display: "flex", gap: 10 }}>
							<button onClick={() => { setDeleteTarget(null); setDeleteError(""); }} disabled={deleting} style={{ flex: 1, padding: "10px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }} className="bg-surface-raised border border-border text-text-primary">{i18n.t("common.cancel")}</button>
							<button onClick={confirmDelete} disabled={deleting} style={{ flex: 1, padding: "10px", background: "#dc2626", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.7 : 1 }}>{deleting ? "Deleting…" : "Delete"}</button>
						</div>
					</div>
				</div>
			)}

			{/* ── REMOVE WISHLIST ITEM CONFIRM MODAL ── */}
			{removeConfirmItem && (
				<div onClick={() => { if (!removeLoading) { setRemoveConfirmItem(null); setRemoveLoading(false); } }}
					style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
					<div onClick={e => e.stopPropagation()}
						style={{ borderRadius: 18, padding: "28px 24px 22px", width: "100%", maxWidth: 360, animation: "fadeUp 0.22s ease both", textAlign: "center" }} className="bg-surface-raised border border-border">
						{/* Trash icon */}
						<div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
							<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
							</svg>
						</div>
						<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.03em" }} className="text-text-primary">
							Remove item?
						</p>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, marginBottom: 12 }} className="text-text-secondary">
							"{removeConfirmItem.title}"
						</p>
						{/* Gift-credit notice when contributions exist */}
						{parseFloat(removeConfirmItem.total_contributed ?? 0) > 0 ? (
							<div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.22)", borderRadius: 10, padding: "10px 12px", marginBottom: 20, textAlign: "left" }}>
								<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M20 12v10H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#22c55e", lineHeight: 1.45, margin: 0 }}>
									CAD ${parseFloat(removeConfirmItem.total_contributed).toFixed(2)} in gifts will be <strong>credited to your wallet</strong> — contributions are non-refundable gifts.
								</p>
							</div>
						) : (
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 20 }} className="text-text-muted">
								This item will be permanently removed from your wishlist.
							</p>
						)}
						<div style={{ display: "flex", gap: 10 }}>
							<button onClick={() => { setRemoveConfirmItem(null); setRemoveLoading(false); }} disabled={removeLoading}
								style={{ flex: 1, padding: "11px 0", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, cursor: removeLoading ? "default" : "pointer" }} className="bg-surface-raised border border-border text-text-secondary">
								Keep it
							</button>
							<button disabled={removeLoading} onClick={async () => {
								setRemoveLoading(true);
								try {
									await removeWishlistItem(removeConfirmItem.wishlist_item_id);
									setWishlistItems(prev => prev.filter(i => i.wishlist_item_id !== removeConfirmItem.wishlist_item_id));
									setRemoveConfirmItem(null);
								} catch { /* noop */ } finally { setRemoveLoading(false); }
							}} style={{ flex: 1, padding: "11px 0", background: removeLoading ? "rgba(239,68,68,0.4)" : "#ef4444", border: "none", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, color: "#fff", cursor: removeLoading ? "default" : "pointer", transition: "background 0.15s" }}>
								{removeLoading ? "Removing…" : "Remove"}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* ── ADD WISHLIST ITEM MODAL ── */}
			{addItemModal && (
				<div onClick={() => { setAddItemModal(false); setAddItemPending(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
					<div onClick={e => e.stopPropagation()} style={{ borderRadius: 20, width: isMobile ? "92vw" : 520, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }} className="bg-surface-raised border border-border">
						{/* Header */}
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 14px", borderBottom: "1px solid var(--color-border)", flexShrink: 0 }}>
							<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, textTransform: "uppercase", letterSpacing: "0.04em" }} className="text-text-primary">
								{addItemPending ? "Confirm item" : "Add to Wishlist"}
							</span>
							<button onClick={() => { setAddItemModal(false); setAddItemPending(null); }} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }} className="text-text-secondary">
								<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
							</button>
						</div>

						{addItemPending ? (
							/* Confirm step */
							<div style={{ padding: 20, overflowY: "auto" }}>
								<div style={{ display: "flex", gap: 14, marginBottom: 20, padding: 14, borderRadius: 12 }} className="bg-surface-raised border border-border">
									<SafeImage src={addItemPending.image_url} alt="" style={{ width: 72, height: 72, borderRadius: 10, objectFit: "cover", flexShrink: 0 }}
										fallback={<div style={{ width: 72, height: 72, borderRadius: 10, background: "rgba(37,99,235,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0 }}>{addItemPending.type === "food" ? "🍔" : addItemPending.type === "booking" ? "🏠" : "🛍️"}</div>} />
									<div style={{ flex: 1, minWidth: 0 }}>
										<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 4 }} className="text-text-primary">{addItemPending.title}</p>
										<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, color: "#2563eb" }}>CAD ${parseFloat(addItemPending.price).toFixed(2)}</p>
										<span style={{ padding: "2px 8px", background: "rgba(37,99,235,0.15)", borderRadius: 5, fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.05em" }}>{addItemPending.type}</span>
									</div>
								</div>
								<div style={{ display: "flex", gap: 10 }}>
									<button onClick={() => setAddItemPending(null)} style={{ flex: 1, padding: "11px 0", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }} className="bg-surface-raised border border-border text-text-secondary">Back</button>
									<button onClick={async () => {
										if (addingItem) return;
										setAddingItem(true);
										try {
											const newItem = await addWishlistItem({ item_type: addItemPending.type ?? "custom", item_ref_id: addItemPending.ref_id ?? null, title: addItemPending.title, description: addItemPending.description ?? null, image_url: addItemPending.image_url ?? null, price: addItemPending.price });
											setWishlistItems(prev => [{ ...newItem, total_contributed: 0, progress_pct: 0, contributor_count: 0, recent_contributors: [] }, ...prev]);
											setAddItemModal(false);
											setAddItemPending(null);
											setTab("Wishlist");
										} catch (e) { alert(e?.response?.data?.error ?? "Failed to add item"); }
										finally { setAddingItem(false); }
									}} style={{ flex: 2, padding: "11px 0", background: "linear-gradient(135deg,#2563eb,#3b82f6)", border: "none", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, color: "#fff", cursor: addingItem ? "default" : "pointer", opacity: addingItem ? 0.7 : 1 }}>
										{addingItem ? "Adding…" : "Add to Wishlist 🎁"}
									</button>
								</div>
							</div>
						) : (
							<div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
								{/* Search bar */}
								<div style={{ padding: "14px 20px 10px", flexShrink: 0 }}>
									<div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, marginBottom: 12 }} className="bg-surface-raised border border-border">
										<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
										<input autoFocus value={addItemSearch} onChange={e => setAddItemSearch(e.target.value)} placeholder="Search products, food, experiences…" style={{ flex: 1, background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }} className="text-text-primary" />
									</div>
									{/* Category filter */}
									<div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 4 }}>
										{[["all", "All"], ["product", "🛍 Shop"], ["food", "🍔 Food"], ["booking", "🏠 Experiences"]].map(([val, label]) => (
											<button key={val} onClick={() => setAddItemType(val)} style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${addItemType === val ? "#2563eb" : "var(--color-border)"}`, background: addItemType === val ? "rgba(37,99,235,0.2)" : "transparent", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: addItemType === val ? 700 : 500, color: addItemType === val ? "#60a5fa" : "var(--color-text-secondary)", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>{label}</button>
										))}
									</div>
								</div>

								{/* Results */}
								<div style={{ overflowY: "auto", flex: 1, padding: "0 20px 20px" }}>
									{addItemSearching ? (
										<div style={{ padding: 32, textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }} className="text-text-muted">Searching…</div>
									) : addItemResults.length === 0 ? (
										<div style={{ padding: "24px 0", textAlign: "center" }}>
											<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 16 }} className="text-text-muted">{addItemSearch ? "No results found" : "Search above or add a custom item"}</p>
											<button onClick={() => setAddItemPending({ type: "custom", title: addItemSearch || "My wish", price: 10, image_url: null, description: null })} style={{ padding: "9px 20px", borderRadius: 20, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }} className="bg-surface-raised border border-border text-text-secondary">+ Add custom item</button>
										</div>
									) : (
										<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
											{addItemResults.map((r, ri) => (
												<div key={ri} onClick={() => setAddItemPending(r)} {...clickableProps(() => setAddItemPending(r))}
													style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 12, cursor: "pointer", transition: "background 0.15s" }} className="bg-surface-raised border border-border-subtle"
													onMouseEnter={e => e.currentTarget.style.background = "rgba(37,99,235,0.1)"}
													onMouseLeave={e => e.currentTarget.style.background = "var(--color-surface-raised)"}>
													<div style={{ width: 48, height: 48, borderRadius: 10, background: "rgba(37,99,235,0.15)", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
														<SafeImage loading="lazy" src={r.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
															fallback={r.type === "food" ? "🍔" : r.type === "booking" ? "🏠" : "🛍️"} />
													</div>
													<div style={{ flex: 1, minWidth: 0 }}>
														<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-text-primary">{r.title}</p>
														<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }} className="text-text-secondary">CAD ${parseFloat(r.price).toFixed(2)} · {r.type}</p>
													</div>
													<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
												</div>
											))}
										</div>
									)}
								</div>
							</div>
						)}
					</div>
				</div>
			)}

			{/* ── CONTRIBUTE / GIFT MODAL ── */}
			{contributeModal && (
				<div onClick={() => { setContributeModal(null); setContributeMsg(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
					<div onClick={e => e.stopPropagation()} style={{ borderRadius: 20, width: isMobile ? "92vw" : 420, overflow: "hidden" }} className="bg-surface-raised border border-border">
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 14px", borderBottom: "1px solid var(--color-border)" }}>
							<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, textTransform: "uppercase", letterSpacing: "0.04em" }} className="text-text-primary">Gift this item</span>
							<button onClick={() => { setContributeModal(null); setContributeMsg(""); }} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }} className="text-text-secondary">
								<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
							</button>
						</div>
						<div style={{ padding: 20 }}>
							{/* Item preview */}
							<div style={{ display: "flex", gap: 12, marginBottom: 20, padding: 12, borderRadius: 12 }} className="bg-surface-raised">
								<div style={{ width: 56, height: 56, borderRadius: 10, background: "rgba(37,99,235,0.15)", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
									<SafeImage src={contributeModal.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} fallback="🎁" />
								</div>
								<div style={{ flex: 1, minWidth: 0 }}>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-text-primary">{contributeModal.title}</p>
									<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 16, color: "#2563eb", marginTop: 2 }}>CAD ${parseFloat(contributeModal.price).toFixed(2)}</p>
									{/* Progress */}
									<div style={{ marginTop: 6 }}>
										<div style={{ height: 4, borderRadius: 3, overflow: "hidden" }} className="bg-surface-raised">
											<div style={{ height: "100%", width: `${contributeModal.progress_pct ?? 0}%`, background: "linear-gradient(90deg,#2563eb,#3b82f6)", borderRadius: 3 }} />
										</div>
										<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, marginTop: 3 }} className="text-text-muted">
											${parseFloat(contributeModal.total_contributed ?? 0).toFixed(2)} raised of ${parseFloat(contributeModal.price).toFixed(2)} · {contributeModal.progress_pct ?? 0}%
										</p>
									</div>
								</div>
							</div>

							{/* Quick amount chips */}
							{(() => {
								const remaining = Math.max(0, parseFloat(contributeModal.price) - parseFloat(contributeModal.total_contributed ?? 0));
								const chips = [5, 10, 20, remaining].filter((v, i, a) => v > 0 && a.indexOf(v) === i).slice(0, 4);
								return (
									<div>
										<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 8, fontWeight: 600 }} className="text-text-secondary">CHOOSE AMOUNT (CAD)</p>
										<div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
											{chips.map(chip => (
												<button key={chip} onClick={() => setContributeAmount(String(chip.toFixed(2)))}
													style={{ flex: 1, padding: "8px 0", background: parseFloat(contributeAmount) === chip ? "rgba(37,99,235,0.25)" : "var(--color-surface-raised)", border: `1px solid ${parseFloat(contributeAmount) === chip ? "#2563eb" : "var(--color-border)"}`, borderRadius: 10, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 14, color: parseFloat(contributeAmount) === chip ? "#60a5fa" : "var(--color-text-secondary)", cursor: "pointer" }}>
													${chip === remaining ? `${chip.toFixed(2)} 🎯` : chip}
												</button>
											))}
										</div>
										<input type="number" min="1" step="0.01" value={contributeAmount} onChange={e => setContributeAmount(e.target.value)} placeholder="Or enter custom amount" style={{ width: "100%", padding: "10px 14px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 12 }} className="bg-surface-raised border border-border text-text-primary" />
										<input type="text" value={contributeNote} onChange={e => setContributeNote(e.target.value)} placeholder="Leave a note (optional)" maxLength={200} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 16 }} className="bg-surface-raised border border-border text-text-primary" />
									</div>
								);
							})()}

							{contributeMsg ? (
								<div style={{ padding: "12px 16px", background: contributeMsg.includes("🎉") ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${contributeMsg.includes("🎉") ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`, borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: contributeMsg.includes("🎉") ? "#22c55e" : "#f87171", marginBottom: 12 }}>{contributeMsg}</div>
							) : null}

							<div style={{ display: "flex", gap: 10 }}>
								<button onClick={() => { setContributeModal(null); setContributeMsg(""); }} style={{ flex: 1, padding: "12px 0", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }} className="bg-surface-raised border border-border text-text-secondary">Cancel</button>
								<button onClick={async () => {
									const amt = parseFloat(contributeAmount);
									if (!amt || amt <= 0) { setContributeMsg("Enter a valid amount"); return; }
									if (contributing) return;
									setContributing(true);
									setContributeMsg("");
									try {
										const res = await contributeToWishlist(contributeModal.wishlist_item_id, amt, contributeNote.trim() || null);
										setWishlistItems(prev => prev.map(i => i.wishlist_item_id === contributeModal.wishlist_item_id
											? { ...i, total_contributed: res.total_contributed, progress_pct: res.progress_pct, status: res.fully_funded ? "funded" : i.status, contributor_count: (i.contributor_count ?? 0) + 1 }
											: i));
										setContributeMsg(res.fully_funded ? `🎉 Fully funded! ${displayName.split(" ")[0]} can now claim it.` : `🎁 Thanks! $${amt.toFixed(2)} sent. ${res.progress_pct}% funded.`);
										setContributeAmount("");
										setContributeNote("");
									} catch (e) { setContributeMsg(e?.response?.data?.error ?? "Insufficient wallet balance. Top up first."); }
									finally { setContributing(false); }
								}} style={{ flex: 2, padding: "12px 0", background: "linear-gradient(135deg,#2563eb,#3b82f6)", border: "none", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, color: "#fff", cursor: contributing ? "default" : "pointer", opacity: contributing ? 0.7 : 1 }}>
									{contributing ? "Sending…" : `🎁 Gift $${parseFloat(contributeAmount || 0).toFixed(2)}`}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Followers / Following list modal */}
			{followListModal && (
				<div onClick={() => setFollowListModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
					<div onClick={e => e.stopPropagation()} style={{ borderRadius: 16, width: isMobile ? "90vw" : 400, maxHeight: "70vh", display: "flex", flexDirection: "column", overflow: "hidden" }} className="bg-surface-raised border border-border">
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 14px", borderBottom: "1px solid var(--color-border)" }}>
							<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, textTransform: "uppercase", letterSpacing: "0.04em" }} className="text-text-primary">{followListModal === "following" ? "Following" : "Followers"}</span>
							<button onClick={() => setFollowListModal(null)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} className="text-text-secondary">
								<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
							</button>
						</div>
						<div style={{ overflowY: "auto", flex: 1 }}>
							{followListLoading ? (
								<div style={{ padding: "8px 16px" }}>{Array.from({ length: 6 }).map((_, i) => <SkeletonSearchRow key={i} />)}</div>
							) : followList.length === 0 ? (
								<div style={{ padding: 32, textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }} className="text-text-muted">No {followListModal} yet</div>
							) : followList.map((item, i) => {
								const name = item.display_name || item.name || item.username || "User";
								const handle = item.handle || item.username || "";
								const photo = item.profile_pic_url || null;
								const goToUser = () => {
										const uid = item.user_id;
										if (!uid) return;
										setFollowListModal(null);
										const goingToSelf = String(uid) === String(myId);
										window.__profileTargetId = goingToSelf ? null : uid;
										setTargetUserId(goingToSelf ? null : uid);
										try { document.querySelector('[style*="overflow-y: auto"]')?.scrollTo?.(0, 0); } catch { /* noop */ }
									};
								return (
									<div key={item.id ?? item.user_id ?? i} onClick={goToUser} {...clickableProps(goToUser)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid var(--color-border-subtle)", cursor: "pointer" }}
										onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-raised)"}
										onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
										<div style={{ width: 42, height: 42, borderRadius: "50%", background: "linear-gradient(135deg,#2563eb,#60a5fa)", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
											<SafeImage loading="lazy" decoding="async" src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
												fallback={name[0]?.toUpperCase()} />
										</div>
										<div>
											<div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14 }} className="text-text-primary">{name}</div>
											{handle && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }} className="text-text-secondary">@{handle}</div>}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				</div>
			)}
		</div>
		{profileDialog}
		</>
	);
}


export { UserProfilePage };
