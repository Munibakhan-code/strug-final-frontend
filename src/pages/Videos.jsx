import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import i18n from "../i18n/index.js";
import ReportModal from "../components/ReportModal.jsx";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import { VIDEO_SECTION_DEFS, buildVideoChips, chipIdFromState, chipSelectionToState } from "../utils/videoChips.js";
import { FIXED_CHIP_IDS } from "../utils/videoChipRanking.js";
import { buildChipSignals, resolveStableChipOrder } from "../utils/videoChipSignals.js";
import { createPortal } from "react-dom";

function shuffleArray(arr) { return [...arr].sort(() => Math.random() - 0.5); }
import { MOBILE_MAX, useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { useModalHistoryEntry } from "../hooks/useModalHistoryEntry.js";
import { SearchIcon } from "../components/icons.jsx";
import { useDialog } from "../components/ConfirmDialog.jsx";
import { Skel, SkeletonVideoCard, SkeletonCircle, SkeletonHeading, SkeletonBubble } from "../components/skeletons.jsx";
import { CommentsSheet, Tooltip, clickableProps } from "../components/shared.jsx";
import VideoCategoryBar from "../components/videos/VideoCategoryBar.jsx";
import VideoSectionTabs from "../components/videos/VideoSectionTabs.jsx";
import RelatedVideosRail from "../components/videos/RelatedVideosRail.jsx";
import SaveToPlaylistSheet, { PlaylistCard, PlaylistsShelf } from "../components/videos/SaveToPlaylistSheet.jsx";
import WatchEdgeDrawer from "../components/videos/WatchEdgeDrawer.jsx";
import VideosMobileBottomNav from "../components/videos/VideosMobileBottomNav.jsx";
import { VIDEOS_MOBILE_DOCK_BOTTOM, VIDEOS_MOBILE_NAV_HEIGHT } from "../utils/videosMobileChrome.js";
import VideosExplorePanel from "../components/videos/VideosExplorePanel.jsx";
import DesktopVideoEndScreen from "../components/videos/DesktopVideoEndScreen.jsx";
import ViewerAnalyticsPanel from "../components/videos/ViewerAnalyticsPanel.jsx";
import CreatorModalViewport from "../components/creator/CreatorModalViewport.jsx";
import { SlideOutPanel, SlideOutEdgeTab } from "../components/SlideOutPanel.jsx";
import { stackEdgeTabTop, edgeTabHeightPx } from "../utils/verticalEdgeDrawerConfig.js";
import { DEMO_CHANNEL_OVERLAP, DEMO_FRIEND_ACTIVITY, DEMO_HISTORY, DEMO_SUB_UPLOADS } from "../utils/friendCircleDemo.js";
import { DRAWER_SUB_UPLOAD_CAP, formatFriendNameList, friendActivityAtMs } from "../utils/friendCircle.js";
import { BADGE_TABS, badgeLabel, circleRowMarkers, creatorChoiceRowMarkers, maxMarker, readSeenMarkers, subsRowMarkers, unseenCount, watchedIdSet, withoutWatched, writeSeenMarker } from "../utils/videosDrawerBadges.js";
import { tabUnseenLabel } from "../utils/videosDrawerBadgeCopy.js";
import { getMyConversations, openDmChannel, sendMessage } from "../api/chat";
import { getVideoFeed, getHomeFeed, getVideo, getShorts, getVideoRecommendations, getMyChannel, getChannelByHandle, createChannel, getVideoComments, addVideoComment, deleteVideoComment, toggleCommentLike, toggleVideoLike, toggleVideoDislike, getLikedVideoIds, subscribeToChannel, unsubscribeFromChannel, getChannelSubscriptionStatus, recordVideoView, recordWatchProgress, getWatchResume, getWatchHistory, getWatchLater, toggleWatchLater, getMySubscriptions, getSubscriptionUploads, getSubscriptionCreatorPicks, createCreatorPick, getPlaylists, getChannelPlaylists, createPlaylist, addVideoToPlaylist, removeVideoFromPlaylist, searchVideos, suggestVideos, getFriendVideoActivity, getFriendVideoActivityPage, getFriendChannelOverlap, getChipSignals, logVideoSearch } from "../api/videos";
import {
	filterShareTargets,
	buildVideoSharePayload,
	mapConversationsToShareTargets,
} from "../utils/videoShareTargets.js";
import { MOBILE_WATCH_TYPE } from "../utils/mobileWatchTypography.js";
import { getAuthUserId } from "../store/auth.js";
import { enqueueUpload, onVideoCreated } from "../utils/uploadManager.js";
import { DraftCloseDialog, DraftStatus } from "../components/creator/VideoDrafts.jsx";
import { useVideoDrafts } from "../hooks/useVideoDrafts.js";
import { deleteVideoDraft } from "../utils/videoDrafts.js";
import { addToPlayQueue, readPlayQueue, shiftPlayQueue, writePlayQueue } from "../utils/videoPlayQueue.js";
import { timeAgo } from "../utils/time.js";
import { formatCount } from "../utils/format.js";
import { setPageMeta, resetPageMeta } from "../utils/pageMeta.js";
import { SafeImage } from "../components/SafeImage.jsx";
import { recordListen, markMixSynced, syncYourMix, videoIdOf, mixNameForCategory, isMixPlaylist } from "../utils/listenMix.js";
import { hlsPlayerConfig, resumeStartPosition, qualityChoicesFromLevels, autoQualityLabel } from "../utils/hlsPlayback.js";
import { browserSupportsNativeHls, loadHls, shouldUseHlsJs, shouldUseNativeHls } from "../utils/livePlayback.js";
import { cachedPlayback, rememberPlayback } from "../utils/videoPlaybackCache.js";
import { watchedFeedShelves } from "../utils/watchedFeedShelves.js";
import { diversifyByChannel } from "../utils/diversifyByChannel.js";
import { unwrapHomeFeedResponse } from "../utils/homeFeed.js";
import { displayVideoTitle } from "../utils/videoTitle.js";
import { fmtVideoDuration } from "../utils/videoDuration.js";
import { buildMatchedChannels } from "../utils/videoSearch.js";
import { mapCreatorChoiceShelf, canRecommendVideoToSubscribers, canRecommendChannelToSubscribers } from "../utils/creatorChoice.js";

function videoUntitled() { return i18n.t("videos.untitled"); }
function videoTitleOf(raw) { return displayVideoTitle(raw, videoUntitled()); }
function videoCategoryGeneral() { return i18n.t("videos.categoryGeneral"); }
function fmtVideoViews(n) { return `${formatCount(n)} ${i18n.t("videos.views")}`; }
function fmtVideoSubscribers(n) { return `${formatCount(n)} ${i18n.t("videos.subscribers")}`; }

function fmtVideoCount(n) { return i18n.t("videos.videoCount", { count: n }); }

const UPLOAD_LABEL_STYLE = {
	fontFamily: "'DM Sans', sans-serif",
	fontSize: 12,
	fontWeight: 600,
	textTransform: "uppercase",
	letterSpacing: "0.08em",
};

function UploadLabeledField({ label, htmlFor, children }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
			<label htmlFor={htmlFor} className="text-text-secondary" style={UPLOAD_LABEL_STYLE}>{label}</label>
			{children}
		</div>
	);
}

function UploadChipRow({ label, name, options, value, onChange, disabled }) {
	return (
		<div role="radiogroup" aria-label={label} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
			<span className="text-text-secondary" style={UPLOAD_LABEL_STYLE}>{label}</span>
			<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
				{options.map(([val, text]) => {
					const on = Object.is(value, val);
					return (
						<button
							key={`${name}-${String(val)}`}
							type="button"
							role="radio"
							aria-checked={on}
							disabled={disabled}
							onClick={() => { if (!disabled) onChange(val); }}
							className={on ? "text-text-primary" : "text-text-secondary"}
							style={{
								padding: "8px 12px",
								borderRadius: 8,
								border: on ? "1px solid #2563eb" : "1px solid var(--color-border)",
								background: on ? "rgba(37,99,235,0.14)" : "var(--color-surface)",
								fontFamily: "'DM Sans', sans-serif",
								fontSize: 13,
								fontWeight: on ? 700 : 500,
								cursor: disabled ? "default" : "pointer",
								lineHeight: 1.2,
							}}
						>{text}</button>
					);
				})}
			</div>
		</div>
	);
}

// `HTMLMediaElement.play()` returns a Promise in current browsers, while older WebViews and media
// test doubles may return void. Both are valid; only attach rejection handling to a thenable.
function safePlay(media, onError = () => {}) {
	try {
		const result = media?.play?.();
		if (result && typeof result.catch === "function") result.catch(onError);
	} catch (error) {
		onError(error);
	}
}

// Horizontal padding for titles and chrome on a phone. Home thumbs go edge-to-edge;
// this gutter is only for the text row under the thumbnail.
const MOBILE_GUTTER_PX = 16;
const VIDEO_FEED_GRID = "repeat(auto-fill, minmax(max(300px, calc((100% - 60px) / 4)), 1fr))";

// A phone turned sideways is ~800–950px WIDE, past useViewport's 767px mobile breakpoint, so
// `isMobile` reads false for exactly as long as the video is in landscape. The rotate-to-fullscreen
// handlers below must not be gated on it, or the listener that exits fullscreen unregisters the
// moment the phone turns. The SHORT side of the screen still reads "phone" in either orientation.
const isPhoneScreen = () =>
	typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) <= MOBILE_MAX;

// True while the video is fullscreen ONLY because the phone was turned. Module scope rather than a
// ref on purpose: crossing the breakpoint above re-renders the page into its desktop tree and
// remounts the player, and a ref went down with it — so the rotate BACK found nothing to undo and
// the video stayed fullscreen with no way out.
let orientationDrivenFs = false;

// Extract a list from any feed/list API response shape. Video v2 switched feeds + shorts to
// keyset pagination → `{ data: { items, next_cursor } }`; older/other endpoints return
// `{ data: [...] }` or a bare array. Reading `data` as an array (the old assumption) silently
// yielded an empty list on the v2 shape, so /videos rendered headings with NO cards. This
// handles every shape and is backward-compatible.
// The hls.js-vs-native gate lives in utils/livePlayback.js now. It used to be duplicated here,
// which is how the two copies drifted apart; there is one definition and one test for it.
function listFrom(resp) {
  if (Array.isArray(resp)) return resp;
  const d = resp?.data;
  if (Array.isArray(d)) return d;
  return d?.items ?? resp?.items ?? resp?.videos ?? d?.videos ?? [];
}

function pageFrom(resp) {
	const data = resp?.data ?? resp ?? {};
	return {
		items: listFrom(resp),
		hasMore: data?.has_more === true || resp?.has_more === true,
		nextCursor: data?.next_cursor ?? resp?.next_cursor ?? null,
	};
}

// Normalize a raw API video
// the watch page renders. Critically it flattens the `channel` OBJECT into a
// `channel` STRING: rendering the raw channel object as a React child throws
// React error #31 and crashes the whole page — which is exactly what happened
// on /v/:id deep links, where the raw video bypassed the feed mappers.
function mapApiVideo(v) {
	if (!v || typeof v !== "object" || Array.isArray(v)) return v;
	const ch = v.channel && typeof v.channel === "object" ? v.channel : null;
	const channelName = ch?.display_name ?? ch?.name ?? (typeof v.channel === "string" ? v.channel : i18n.t("feed.defaultCreator"));
	return {
		...v,
		id: v.video_id ?? v.id,
		videoId: v.video_id ?? v.videoId ?? v.id,
		title: videoTitleOf(v.title),
		description: v.description ?? v.desc ?? "",
		channel: channelName,
		avatar: (channelName || "C")[0].toUpperCase(),
		channel_id: ch?.channel_id ?? v.channel_id ?? null,
		channel_description: ch?.description ?? ch?.bio ?? v.channel_description ?? null,
		subscriber_count: ch?.subscriber_count ?? ch?.subscribers ?? v.subscriber_count ?? 0,
		likes_count: v.likes_count ?? v.like_count ?? 0,
		dislikes_count: v.dislikes_count ?? v.dislike_count ?? 0,
		views_count: v.views_count ?? 0,
		views: fmtVideoViews(v.views_count ?? 0),
		ago: v.created_at ? timeAgo(v.created_at) : v.ago ?? "",
		duration: v.duration_sec ? fmtVideoDuration(v.duration_sec) : v.duration ?? "",
		category: v.category || videoCategoryGeneral(),
		processed_video_url: v.hls_url ?? v.processed_video_url ?? null,
		thumbnail_url: v.thumbnail_url ?? null,
		thumb: v.thumbnail_url ?? v.thumb ?? "linear-gradient(135deg, #1e3a5f, #0f2744)",
		profile_pic_url: ch?.profile_pic_url ?? v.profile_pic_url ?? null,
		handle: ch?.handle ?? v.handle ?? null,
	};
}

function mapPlaylist(pl) {
	const row = pl?.playlist_id != null || pl?.id != null ? pl : (pl?.data ?? pl);
	return {
		id: row?.playlist_id ?? row?.id,
		name: row?.name,
		is_public: !!row?.is_public,
		videos: (row?.videos ?? []).map(mapApiVideo),
	};
}

// Normalize a /video/shorts row into the shape the shorts grid + ShortsPlayer expect. Shared
// by the mount fetch (all shorts) and the browse-by-category fetch so both lists, and the
// fullscreen player they feed, stay structurally identical.
function mapApiShort(s) {
	return {
		id: s.video_id,
		title: displayVideoTitle(s.title, 'Short'),
		channel: s.channel?.display_name ?? 'Creator',
		channel_id: s.channel?.channel_id ?? null,
		handle: s.channel?.handle ?? null,
		profile_pic_url: s.channel?.profile_pic_url ?? null,
		avatar: (s.channel?.display_name ?? 'C')[0].toUpperCase(),
		views: formatCount(s.views_count ?? 0),
		likes_count: s.likes_count ?? 0,
		duration: s.duration_sec ? `0:${String(s.duration_sec % 60).padStart(2, '0')}` : '0:30',
		processed_video_url: s.hls_url ?? s.processed_video_url ?? null,
		thumb: s.thumbnail_url ?? 'linear-gradient(135deg, #3a1a1a, #2a0f0f)',
	};
}

// /video-engagement/history rows wrap the video in an `entry` that also carries `watched_at`.
// Shared by the Library "Watch History" tab and the browse bar's "Watch History" chip so both
// render identical cards from one mapping.
function mapWatchHistory(data) {
	return listFrom(data)
		.map(entry => ({ entry, v: entry.video ?? entry }))
		.filter(({ v }) => v.video_id != null && (!v.status || v.status === 'safe' || v.status === 'ready'))
		.map(({ entry, v }) => ({
			...mapApiVideo(v),
			ago: entry.watched_at ? timeAgo(entry.watched_at) : (v.created_at ? timeAgo(v.created_at) : ''),
		}));
}

// In-place-safe Fisher-Yates shuffle (returns a new array) — backs the "Mix" filter, which is
// a deliberately varied sample of the latest feed rather than any single ordering.
function shuffleVideos(arr) {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

function videoKey(v) {
	return v?.id ?? v?.videoId ?? v?.video_id ?? null;
}

// Map a /video/recommendations row into the Up Next rail item shape. Shared by the initial
// fetch and the infinite-scroll "load more" pages so both render identically (#347/#350).
function mapRelatedItem(v) {
	return {
		id: v.video_id,
		title: videoTitleOf(v.title),
		channel: v.channel?.display_name ?? 'Creator',
		avatar: (v.channel?.display_name ?? 'C')[0].toUpperCase(),
		views: fmtVideoViews(v.views_count ?? 0),
		ago: v.created_at ? timeAgo(v.created_at) : '',
		duration: v.duration_sec ? `${Math.floor(v.duration_sec / 60)}:${String(v.duration_sec % 60).padStart(2, '0')}` : '',
		section: 'popular', category: v.category || videoCategoryGeneral(), videoId: v.video_id,
		thumb: v.thumbnail_url ?? 'linear-gradient(135deg, #1e3a5f, #0f2744)',
	};
}

/**
 * Last-resort fill when /recommendations 404s (demo IDs) or the network fails.
 * Production ranking lives on the backend hybrid Up Next ranker.
 */
async function fetchUpNextFallback({ excludeId, category, channelId, limit = 20 }) {
	const attempts = [];
	const cat = typeof category === "string" && category.trim() && category !== "General" ? category.trim() : null;
	if (cat) attempts.push({ category: cat, sort: "latest", limit });
	if (channelId != null && Number.isFinite(Number(channelId))) {
		attempts.push({ channel_id: Number(channelId), include_shorts: false, sort: "latest", limit });
	}
	attempts.push({ sort: "trending", limit });
	attempts.push({ sort: "popular", limit });
	attempts.push({ sort: "latest", limit });

	const exclude = new Set(
		[excludeId, Number(excludeId)].filter((id) => id != null && id !== "" && !Number.isNaN(Number(id))),
	);

	for (const params of attempts) {
		try {
			const data = await getVideoFeed(params);
			const raw = listFrom(data).filter((v) => v.video_type !== "shorts");
			const fresh = [];
			const seen = new Set(exclude);
			for (const v of raw) {
				const id = v.video_id;
				if (id == null || seen.has(id) || seen.has(Number(id))) continue;
				seen.add(id);
				fresh.push(mapRelatedItem(v));
			}
			if (fresh.length) return shuffleVideos(fresh);
		} catch {
			/* try next pool */
		}
	}
	return [];
}

function resolveVideoId(v) {
	const raw = v?.video_id ?? v?.id ?? v?.videoId;
	if (raw == null || raw === "" || String(raw) === "undefined") return null;
	return raw;
}

function hasVideoIdentity(v) {
	if (!v || typeof v !== "object" || Array.isArray(v)) return false;
	const pid = v.public_id;
	if (pid != null && pid !== "" && String(pid) !== "undefined") return true;
	return resolveVideoId(v) != null;
}

function isValidVideoRouteToken(tok) {
	if (tok == null || tok === "" || tok === "undefined" || tok === "null") return false;
	return true;
}

// Canonical share/route path for a video: /v/{public_id}-{slug}. Falls back to the
// numeric id when public_id is absent (e.g. an unbackfilled row). The slug is
// decorative — the backend resolves a video by its leading token (public_id or id).
function videoPath(v) {
	const pid = v?.public_id;
	if (pid != null && pid !== "" && String(pid) !== "undefined") {
		return v?.slug ? `/v/${pid}-${v.slug}` : `/v/${pid}`;
	}
	const num = resolveVideoId(v);
	if (num == null) return null;
	return `/v/${num}`;
}

// Canonical share/route path for a creator channel: /c/{handle} (preferred, user-facing) or
// /c/{channel_id} when the object carries no handle. Restored via getChannelByHandle for a handle,
// or straight into a { channel_id } for a numeric key. (#113 — clicking through to a channel kept
// /videos, so channels had no shareable/back-restorable URL.)
function channelIdOf(ch) {
	if (!ch) return null;
	const explicit = ch.channel_id ?? ch.channelId;
	if (explicit != null && explicit !== "") return explicit;
	// mapApiVideo puts the video_id on `id` / `videoId` — never treat a watch row as a channel id.
	if (ch.video_id != null || ch.videoId != null) return null;
	return ch.id ?? null;
}

function channelPath(ch) {
	if (!ch) return null;
	const handle = ch.handle ?? ch.channel_handle ?? null;
	if (handle) return `/c/${String(handle).replace(/^@/, "")}`;
	const id = channelIdOf(ch);
	return id != null ? `/c/${id}` : null;
}

const VIDEO_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#2563eb", match: null, img: "/img/cat/video/All.jpg" },
	// "General" is what the backend stamps on any upload left on the "Auto — detect from video"
	// option (prisma: `category String? @default("General")`), so it holds a real and probably large
	// slice of the catalogue — 3 of the 5 videos on staging. It leads the categories rather than
	// trailing them because it is the broadest of them, not an afterthought.
	{ id: "general", labelKey: "videos.categoryGeneral", color: "#64748b", match: "General" },
	{ id: "music", labelKey: "events.categories.music", color: "#7c3aed", match: "Music", img: "/img/cat/video/Music.png" },
	{ id: "gaming", labelKey: "videos.categoryGaming", color: "#059669", match: "Gaming", img: "/img/cat/video/Gaming.png" },
	{ id: "sports", labelKey: "events.categories.sports", color: "#dc2626", match: "Sports", img: "/img/cat/video/Sports.png" },
	{ id: "news", labelKey: "videos.categoryNews", color: "#d97706", match: "News", img: "/img/cat/video/News.png" },
	{ id: "entertainment", labelKey: "discounts.categories.entertainment", color: "#db2777", match: "Entertainment", img: "/img/cat/video/Entertainment.png" },
	{ id: "education", labelKey: "videos.categoryEducation", color: "#0891b2", match: "Education", img: "/img/cat/video/Education.png" },
	{ id: "tech", labelKey: "meet.categories.tech", color: "#65a30d", match: "Tech", img: "/img/cat/video/Tech.jpg" },
	{ id: "comedy", labelKey: "events.categories.comedy", color: "#f59e0b", match: "Comedy", img: "/img/cat/video/Comedy.png" },
	{ id: "travel", labelKey: "discounts.categories.travel", color: "#0d9488", match: "Travel", img: "/img/cat/video/Travel.jpg" },
	// `match` is the literal the backend stores in video.category (a free-form String column, so no
	// migration is needed for a new one) — it must stay in lockstep with the upload form's category
	// <select>, or creators can never file anything under the chip and it stays empty forever.
	{ id: "food", labelKey: "discounts.categories.food", color: "#ea580c", match: "Food" },
	{ id: "fitness", labelKey: "meet.categories.fitness", color: "#16a34a", match: "Fitness" },
];

// The upload form's category options, derived from the chips rather than repeated as a literal.
// They were two hand-maintained lists, so a chip could be added without a matching upload option —
// and that chip could then never be filled by a creator, leaving it permanently empty. Deriving
// makes that drift impossible. "General" is excluded: it is what the backend stamps on the
// "Auto — detect from video" choice, not something a creator picks by hand.
const UPLOAD_CATEGORY_OPTIONS = VIDEO_CATEGORY_DEFS
	.filter((c) => c.match && c.id !== "general")
	.map((c) => c.match);

function FeaturedVideoCard({ video, onClick }) {
	const [hov, setHov] = useState(false);
	const hasThumbnail = video.thumb && video.thumb.startsWith("http");
	const previewUrl = video.processed_video_url ?? null;
	const featVidRef = useRef(null);
	const featHlsRef = useRef(null);
	useEffect(() => {
		const el = featVidRef.current;
		if (!el || !previewUrl || hasThumbnail) return;
		let cancelled = false;
		if (previewUrl.includes('.m3u8') && shouldUseNativeHls(el)) {
			el.src = previewUrl;
			el.play().catch(() => {});
			return () => { cancelled = true; el.pause(); el.src = ""; };
		}
		loadHls().then((Hls) => {
			if (cancelled || !el) return;
			if (previewUrl.includes('.m3u8') && shouldUseHlsJs(el, Hls)) {
				const hls = new Hls({ startFragPrefetch: true, maxBufferLength: 8 });
				featHlsRef.current = hls;
				hls.loadSource(previewUrl);
				hls.attachMedia(el);
				hls.on(Hls.Events.ERROR, function(_evt, data) { if (data.fatal) { hls.destroy(); featHlsRef.current = null; el.src = previewUrl || ''; } });
			} else {
				el.src = previewUrl;
			}
			el.play().catch(() => {});
		});
		return () => { cancelled = true; if (featHlsRef.current) { featHlsRef.current.destroy(); featHlsRef.current = null; } el.pause(); el.src = ""; };
	}, [previewUrl, hasThumbnail]);
	return (
		<div onClick={onClick} {...clickableProps(onClick)} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
			style={{ width: "100%", borderRadius: 16, overflow: "hidden", cursor: "pointer", marginBottom: 32,
				boxShadow: hov ? "0 20px 60px rgba(0,0,0,0.7)" : "0 4px 24px rgba(0,0,0,0.5)",
				transform: hov ? "translateY(-2px)" : "none", transition: "all 0.25s", animation: "fadeUp 0.4s ease both",
			}}>
			{/* Thumbnail/video surface with its title-and-channel scrim overlay — same treatment as
			    Feed's post media (rule 3): it's a media surface, not page chrome, so it stays dark
			    regardless of theme. */}
			<div style={{ position: "relative", width: "100%", height: 320, background: "#0d1421", overflow: "hidden" }}>
				{hasThumbnail ? (
					// #457: a purged thumbnail blob 404s — fall back to the same gradient the
					// no-thumbnail case already renders, rather than a broken-image icon.
					<SafeImage loading="lazy" decoding="async" src={video.thumb} alt={video.title}
						style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%" }}
						fallback={<div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #1e3a5f, #0f2744)" }} />} />
				) : previewUrl ? (
					<video ref={featVidRef} muted playsInline loop style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
				) : (
					<div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #1e3a5f, #0f2744)" }} />
				)}
				{/* Dark overlay */}
				<div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(6,8,16,0.95) 0%, rgba(6,8,16,0.3) 50%, transparent 100%)" }} />
				{/* Play overlay on hover */}
				{hov && (
					<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
						<div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
							<svg width={28} height={28} viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
						</div>
					</div>
				)}
				{/* Info overlay */}
				<div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "20px 24px" }}>
					<p style={{ fontSize: 11, fontWeight: 600, color: "#2563eb", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>{i18n.t("common.featured")}</p>
					<h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(20px, 2.5vw, 32px)", color: "#fff", letterSpacing: "0.03em", marginBottom: 8 }}>{video.title}</h2>
					<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
						<div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.15)",
							border: "1px solid rgba(255,255,255,0.18)", display: "flex", alignItems: "center",
							justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff",
							fontFamily: "'Barlow Condensed', sans-serif", overflow: "hidden", position: "relative" }}>
							<span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{video.avatar}</span>
							{/* #457: state-driven fallback — on a 404 the <img> unmounts entirely and the
							    initials span underneath shows through. */}
							<SafeImage loading="lazy" decoding="async" src={video.profile_pic_url}
								alt={video.channel}
								fallback={null}
								style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
						</div>
						<span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontFamily: "'DM Sans', sans-serif" }}>{video.channel}</span>
						<span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif" }}>·</span>
						<span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif" }}>{video.views}</span>
					</div>
				</div>
			</div>
		</div>
	);
}

// Playable URLs resolved for hover previews, keyed by video id. /video/feed does not return
// hls_url — only /video/play/:id does — so a card has to ask for it, and asking once per card per
// session is enough. Module-level so it survives cards unmounting as the grid re-renders.
const hoverPreviewUrls = new Map();

/**
 * The three-dot menu on a video card.
 *
 * Share, Watch later, and Add to queue act on their own. Save to playlist needs the page modal.
 * Recommend to subscribers is creator-only (own channel + other creators' videos).
 */
function VideoCardMenu({ video, onAddToPlaylist, onAddToQueue, saved, onToggleSaved, onShare, onRecommend, myChannelId, onOpenChange }) {
	const [open, setOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	// Captured on open rather than read during render: the menu is portalled to <body>, so it needs
	// the button's viewport position, and reading a ref while rendering is not allowed.
	const [rect, setRect] = useState(null);
	const btnRef = useRef(null);
	const openedAt = useRef(0);
	const videoId = video.videoId ?? video.id ?? null;
	const canRecommend = onRecommend && canRecommendVideoToSubscribers(video, myChannelId);

	const items = [
		{
			id: "share",
			label: copied ? i18n.t("videos.linkCopied") : i18n.t("common.share"),
			icon: <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />,
			// Opens the same share dialog the watch page uses — the networks, the copyable link and
			// the timestamp option. Copying straight to the clipboard is only the fallback for
			// callers that have not wired a dialog up.
			run: () => {
				if (onShare) { onShare(video); return; }
				try { navigator.clipboard?.writeText(`${window.location.origin}${videoPath(video)}`); } catch { /* denied */ }
				setCopied(true);
				setTimeout(() => { setCopied(false); setOpen(false); onOpenChange?.(false); }, 1200);
			},
			keepOpen: !onShare,
		},
		{
			id: "watchlater",
			label: saved ? i18n.t("videos.removeFromWatchLater") : i18n.t("videos.watchLater"),
			icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
			run: () => onToggleSaved?.(videoId),
		},
		onAddToQueue && {
			id: "queue",
			label: i18n.t("videos.addToQueue"),
			icon: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
			run: () => onAddToQueue(video),
		},
		onAddToPlaylist && {
			id: "playlist",
			label: i18n.t("videos.saveToPlaylist"),
			icon: <><path d="M3 6h13M3 12h13M3 18h9" /><path d="M18 12v8M22 16h-8" /></>,
			run: () => onAddToPlaylist(video),
		},
		canRecommend && {
			id: "recommend",
			label: i18n.t("videos.recommendToSubscribers", { defaultValue: "Recommend to subscribers" }),
			icon: <><path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.8 5.6 21.2 8 14 2 9.2h7.6z" /></>,
			run: () => onRecommend(video),
		},
	].filter(Boolean);

	return (
		<>
			<button
				ref={btnRef}
				type="button"
				aria-label={i18n.t("videos.moreActions", { defaultValue: "More actions" })}
				aria-expanded={open}
				data-testid="video-card-menu"
				onClick={(e) => {
					// Desktop still wraps the ⋮ in an <a href> in some callers; preventDefault so
					// the browser cannot follow the card link. On phones the button sits outside
					// the <a>, but stopPropagation still keeps the card from opening.
					e.preventDefault();
					e.stopPropagation();
					const next = !open;
					if (next) {
						openedAt.current = Date.now();
						setRect(btnRef.current?.getBoundingClientRect() ?? null);
					}
					// onOpenChange must NOT run inside a setState updater — that updates the parent
					// while this component is rendering and drops the open state on mobile/tests.
					setOpen(next);
					onOpenChange?.(next);
				}}
				style={{
					flexShrink: 0,
					width: 40,
					height: 40,
					minWidth: 40,
					borderRadius: "50%",
					border: "none",
					// Always slightly visible so the control is findable — transparent + muted
					// currentColor was vanishing into the dark feed on some phones.
					background: open ? "var(--color-wash-3, rgba(128,128,128,0.22))" : "var(--color-wash-2, rgba(128,128,128,0.14))",
					cursor: "pointer",
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					padding: 0,
					margin: 0,
					color: "var(--color-text-primary, #f5f5f5)",
					WebkitTapHighlightColor: "transparent",
					appearance: "none",
					WebkitAppearance: "none",
					position: "relative",
					zIndex: 6,
				}}
			>
				{/* Explicit fill — never rely on inherited currentColor alone (phones were
				    painting these the same tone as the feed background). */}
				<svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
					<circle cx="12" cy="5" r="2.4" fill="var(--color-text-primary, #f5f5f5)" />
					<circle cx="12" cy="12" r="2.4" fill="var(--color-text-primary, #f5f5f5)" />
					<circle cx="12" cy="19" r="2.4" fill="var(--color-text-primary, #f5f5f5)" />
				</svg>
			</button>
			{open && rect && createPortal(
				<>
					{/* Guarded against the ghost click from the button's own touch event, same as the
					    Library popup above. */}
					<div onClick={() => { if (Date.now() - openedAt.current > 100) { setOpen(false); onOpenChange?.(false); } }} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />
					<div
						className="bg-surface-raised border border-border"
						style={{
							position: "fixed", zIndex: 9999, borderRadius: 12, padding: 6, minWidth: 208,
							boxShadow: "0 12px 40px var(--color-shadow)",
							top: Math.min(rect.bottom + 6, window.innerHeight - 8 - items.length * 44),
							left: Math.max(8, Math.min(rect.right - 208, window.innerWidth - 216)),
						}}
					>
						{items.map((item) => (
							<button
								key={item.id}
								type="button"
								onClick={(e) => { e.preventDefault(); e.stopPropagation(); item.run(); if (!item.keepOpen) { setOpen(false); onOpenChange?.(false); } }}
								className="text-text-primary"
								style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 12px", borderRadius: 8, background: "transparent", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, textAlign: "left" }}
								onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-surface)"; }}
								onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
							>
								<svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">{item.icon}</svg>
								{item.label}
							</button>
						))}
					</div>
				</>,
				document.body,
			)}
		</>
	);
}

function VideoCard({ video, delay, onClick, style: outerStyle, onAddToPlaylist, onAddToQueue, savedIds, onToggleSaved, onShare, onRecommend, myChannelId, progressById, mobileBleed = false, shelf = false, onChannelClick }) {
	const [hov, setHov] = useState(false);
	// Reaching for the three dots means hovering the card, which would otherwise start the preview
	// underneath the menu the pointer is on its way to.
	const [menuOpen, setMenuOpen] = useState(false);
	const { isMobile } = useViewport();
	const bleed = isMobile && mobileBleed && !shelf;
	const previewRef = useRef(null);
	const hlsRef = useRef(null);
	const videoId = video.videoId ?? video.id ?? null;
	// Feed rows carry no playable URL, so a preview needs one fetched. Seeded from the cache when
	// this card has been hovered before.
	const [fetchedUrl, setFetchedUrl] = useState(() => (videoId != null ? hoverPreviewUrls.get(videoId) ?? null : null));
	const previewUrl = video.processed_video_url ?? fetchedUrl ?? null;
	const watchedFraction = (videoId != null && progressById?.get(videoId)) || 0;

	// Hover INTENT, not hover: a pointer crossing the grid on its way somewhere else shouldn't
	// fire a request per card it passes over. YouTube waits about this long too.
	useEffect(() => {
		// `has` rather than a truthy check: a video with no playable URL yet (still transcoding)
		// caches as null, so hovering it repeatedly doesn't refire the request every time.
		if (isMobile || !hov || menuOpen || previewUrl || videoId == null || hoverPreviewUrls.has(videoId)) return undefined;
		let cancelled = false;
		const t = setTimeout(() => {
			getVideo(videoId)
				.then((raw) => {
					if (cancelled) return;
					const url = raw ? raw.hls_url ?? raw.processed_video_url ?? null : null;
					hoverPreviewUrls.set(videoId, url);
					if (url) setFetchedUrl(url);
				})
				.catch(() => { /* preview is a nicety — a failure just leaves the thumbnail */ });
		}, 500);
		return () => { cancelled = true; clearTimeout(t); };
	}, [hov, menuOpen, previewUrl, videoId, isMobile]);

	useEffect(() => {
		if (isMobile || !hov || menuOpen || !previewUrl || !previewRef.current) return;
		const el = previewRef.current;
		let cancelled = false;
		if (previewUrl.includes('.m3u8') && shouldUseNativeHls(el)) {
			el.src = previewUrl;
			el.play().catch(() => {});
			return () => { cancelled = true; el.pause(); el.src = ""; };
		}
		loadHls().then((Hls) => {
			if (cancelled || !el) return;
			if (previewUrl.includes('.m3u8') && shouldUseHlsJs(el, Hls)) {
				const hls = new Hls({ startFragPrefetch: true, maxBufferLength: 5, maxMaxBufferLength: 10 });
				hls.loadSource(previewUrl);
				hls.attachMedia(el);
				hls.on(Hls.Events.ERROR, function(_evt, data) { if (data.fatal) { hls.destroy(); el.src = previewUrl || ''; } });
				hlsRef.current = hls;
			} else {
				el.src = previewUrl;
			}
			el.play().catch(() => {});
		});
		return () => {
			el.pause();
			if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
			el.src = "";
		};
	}, [hov, menuOpen, previewUrl, isMobile]);

	const hasThumbnail = video.thumb && video.thumb.startsWith("http");
	const openVideo = (e) => {
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		e.preventDefault();
		onClick?.(e);
	};
	// Avatar / channel name open the creator page (YouTube-style). They used to sit inside the
	// same <a> as the title, so every profile tap opened the video instead.
	const canOpenChannel = typeof onChannelClick === "function"
		&& (channelIdOf(video) != null || (video.handle != null && String(video.handle).length > 0));
	const channelHref = canOpenChannel ? (channelPath(video) || "#") : null;
	const openChannelFromCard = (e) => {
		if (!canOpenChannel) return;
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		e.preventDefault();
		e.stopPropagation();
		onChannelClick(video);
	};
	const avatarEl = (
		<div className="bg-surface-raised border border-border text-text-primary" style={{ width: bleed ? 36 : 34, height: bleed ? 36 : 34, borderRadius: "50%", flexShrink: 0,
			display: "flex", alignItems: "center", justifyContent: "center",
			fontSize: 13, fontWeight: 700,
			fontFamily: "'Barlow Condensed', sans-serif", overflow: "hidden", position: "relative" }}>
			<span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{video.avatar}</span>
			<SafeImage loading="lazy" decoding="async" src={video.profile_pic_url}
				alt={video.channel}
				fallback={null}
				style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
		</div>
	);

	// Root is a <div>, not an <a>: a <button> (the three-dot menu) inside an <a> is invalid HTML,
	// and mobile browsers drop or ignore that nested button — which is why the ⋮ vanished on phone
	// while desktop still showed it. Thumb / title open the video; avatar / channel open the creator.
	return (
		<div
			onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
			style={{ display: "block", width: isMobile ? "100%" : 280, minWidth: 0, maxWidth: "100%", boxSizing: "border-box", alignSelf: "start", animation: `fadeUp 0.35s ease ${delay}ms both`, flexShrink: 0, position: "relative", ...outerStyle }}
		>
			{/* Phone: native aspect-ratio box. Desktop: padding-bottom box.
			    Thumb is cover inside that frame so the still actually paints; the frame cannot grow. */}
			<a
				href={videoPath(video) ?? "#"}
				onClick={openVideo}
				style={{ display: "block", textDecoration: "none", color: "inherit", cursor: "pointer" }}
			>
				<div data-testid="video-card-media" style={{
					// The feed owns the available phone width. Keeping media card-relative prevents
					// horizontal shelves from widening or shifting cards in installed mobile apps.
					...(bleed
						? { width: "100%", maxWidth: "100%", aspectRatio: "16 / 9" }
						: { width: "100%", height: 0, paddingBottom: "56.25%" }),
					boxSizing: "border-box",
					flexShrink: 0,
					borderRadius: bleed ? 8 : 12,
					position: "relative",
					overflow: "hidden",
					background: "#000",
					transform: !isMobile && hov ? "translateY(-3px)" : "none",
					boxShadow: isMobile ? "none" : (hov ? "0 12px 36px rgba(0,0,0,0.55)" : "0 2px 12px rgba(0,0,0,0.35)"),
					transition: isMobile ? undefined : "all 0.2s",
				}}>
					{hasThumbnail ? (
						<>
							{/* Thumbnails are not all 16:9. `cover` fills the frame by cutting the picture's
							    edges off, and sizing the frame to the picture instead is what made cards
							    grow tall. Neither is needed: the frame keeps the height it already had,
							    the still sits inside it whole, and a blurred, over-scaled copy of itself
							    fills whatever an off-ratio picture leaves over. Same thing YouTube does. */}
							<SafeImage
								aria-hidden="true"
								loading="lazy"
								decoding="async"
								src={video.thumb}
								alt=""
								fallback={null}
								style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block", filter: "blur(18px)", transform: "scale(1.2)", opacity: 0.55 }}
							/>
							<SafeImage
								loading="lazy"
								decoding="async"
								src={video.thumb}
								alt=""
								fallback={null}
								style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%", objectFit: "contain", objectPosition: "center", display: "block" }}
							/>
						</>
					) : (
						<div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(135deg, #1e3a5f, #0f2744)" }} />
					)}
					{/* Silent hover preview (desktop only) */}
					{hov && !isMobile && !menuOpen && previewUrl && (
						<video ref={previewRef} muted playsInline loop style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 1 }} />
					)}
					{hov && !isMobile && (
						<div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
							<div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.2)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
								<svg width={18} height={18} viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
							</div>
						</div>
					)}
					{watchedFraction > 0.02 && (
						<div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, background: "rgba(255,255,255,0.3)", zIndex: 3 }}>
							<div style={{ width: `${Math.min(100, watchedFraction * 100)}%`, height: "100%", background: "#2563eb" }} />
						</div>
					)}
					{video.duration && (
						<div style={{ position: "absolute", bottom: bleed ? 6 : 8, right: bleed ? 6 : 8, zIndex: 4, background: "rgba(0,0,0,0.8)", color: "#fff", fontSize: bleed ? 12 : 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", padding: bleed ? "3px 6px" : "2px 6px", borderRadius: 4, whiteSpace: "nowrap", lineHeight: 1.2, letterSpacing: "0.02em" }}>{video.duration}</div>
					)}
					{(video.is_short === true || video.video_type === 'shorts') && !video.is_processing && !video.is_failed && (
						<div style={{ position: "absolute", top: 8, left: 8, background: "rgba(236,39,57,0.92)", color: "#fff", fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", fontFamily: "'DM Sans', sans-serif", padding: "3px 8px", borderRadius: 6, textTransform: "uppercase", zIndex: 3 }}>Clip</div>
					)}
					{(video.is_failed || video.is_processing) && (
						<div style={{ position: "absolute", top: 8, left: 8, background: video.is_failed ? "rgba(220,38,38,0.92)" : "rgba(202,138,4,0.92)", color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", padding: "3px 8px", borderRadius: 6, display: "flex", alignItems: "center", gap: 5, zIndex: 3 }}>
							<span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", opacity: video.is_failed ? 1 : 0.9, animation: video.is_failed ? "none" : "pulse 1.4s ease-in-out infinite" }} />
							{video.is_failed ? i18n.t("videos.processingFailed") : i18n.t("videos.processingEllipsis")}
						</div>
					)}
				</div>
			</a>
			{/* Info row — avatar + channel name → creator; title → video. Nested <a> is invalid, so
			    these are siblings rather than one big link wrapping everything. */}
			<div style={{ display: "flex", flexDirection: "row", gap: bleed ? 12 : 10, marginTop: 10, marginBottom: bleed ? 14 : 0, alignItems: "flex-start", width: "100%", boxSizing: "border-box", ...(bleed ? { paddingLeft: MOBILE_GUTTER_PX, paddingRight: 8 } : {}) }}>
				{!shelf && (
					canOpenChannel ? (
						<a
							href={channelHref}
							onClick={openChannelFromCard}
							aria-label={video.channel ? String(video.channel) : i18n.t("videos.channelHome", { defaultValue: "Channel" })}
							data-testid="video-card-channel-avatar"
							style={{ display: "block", flexShrink: 0, textDecoration: "none", color: "inherit", cursor: "pointer" }}
						>
							{avatarEl}
						</a>
					) : avatarEl
				)}
				<div style={{ minWidth: 0, flex: "1 1 0%", overflow: "hidden", paddingTop: 1, paddingRight: 4 }}>
					<a
						href={videoPath(video) ?? "#"}
						onClick={openVideo}
						style={{ display: "block", textDecoration: "none", color: "inherit", cursor: "pointer" }}
					>
						<p className="text-text-primary" style={{ fontSize: bleed ? 14 : 13, fontWeight: bleed ? 500 : 600, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.35, whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word", width: "100%", margin: "0 0 4px", ...(bleed ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }) }}>{video.title}</p>
					</a>
					{bleed || shelf ? (
						<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", margin: 0, lineHeight: 1.35, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
							{canOpenChannel && video.channel ? (
								<a
									href={channelHref}
									onClick={openChannelFromCard}
									data-testid="video-card-channel-name"
									style={{ color: "inherit", textDecoration: "none", cursor: "pointer" }}
								>
									{video.channel}
								</a>
							) : (video.channel || null)}
							{video.channel && (video.views || video.ago) ? " · " : null}
							{[video.views, video.ago].filter(Boolean).join(" · ")}
						</p>
					) : (
						<>
							{canOpenChannel && video.channel ? (
								<a
									href={channelHref}
									onClick={openChannelFromCard}
									data-testid="video-card-channel-name"
									className="text-text-secondary"
									style={{ display: "block", fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 2, textDecoration: "none", cursor: "pointer", width: "fit-content", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
								>
									{video.channel}
								</a>
							) : (
								<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 2 }}>{video.channel}</p>
							)}
							<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", margin: 0 }}>{video.views} · {video.ago}</p>
						</>
					)}
				</div>
				{/* Reserved column — never shrink, so the ⋮ cannot be crushed off-screen by a long title. */}
				<div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} style={{ flex: "0 0 40px", width: 40, minWidth: 40, marginTop: -2, position: "relative", zIndex: 5 }}>
					<VideoCardMenu
						video={video}
						onAddToPlaylist={onAddToPlaylist}
						onAddToQueue={onAddToQueue}
						saved={savedIds ? savedIds.has(video.videoId ?? video.id) : false}
						onToggleSaved={onToggleSaved}
						onShare={onShare}
						onRecommend={onRecommend}
						myChannelId={myChannelId}
						onOpenChange={setMenuOpen}
					/>
				</div>
			</div>
		</div>
	);
}

/**
 * A row of clips that scrolls sideways, dropped between the video shelves the way YouTube puts a
 * Shorts row into its feed. It takes the place of the old full-width featured video, which ate a
 * screenful to show one thing.
 *
 * `startIndex` is where this shelf's slice begins in the shorts list, so two shelves on the same
 * page show different clips and a click still opens the right one in the player.
 */
function VideoClipsShelf({ label, clips, startIndex = 0, onOpen, cardActions, inset = true }) {
	const { isMobile } = useViewport();
	const scrollRef = useRef(null);
	const [edges, setEdges] = useState({ left: false, right: false });
	const measure = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
	}, []);
	useEffect(() => {
		const el = scrollRef.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, [measure, clips]);
	if (!clips || clips.length === 0) return null;
	const scrollBy = (dir) => {
		const el = scrollRef.current;
		if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
	};
	return (
		<div style={{ marginBottom: 36 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, ...(isMobile && inset ? { paddingLeft: MOBILE_GUTTER_PX, paddingRight: MOBILE_GUTTER_PX } : {}) }}>
				<svg width={18} height={18} viewBox="0 0 24 24" fill="#2563eb" aria-hidden="true">
					<path d="M10 3.5 6.2 5.7a4.3 4.3 0 0 0 0 7.5l1.6.9-1.6.9a4.3 4.3 0 0 0 0 7.5L10 20.5V3.5Z" opacity="0.55" />
					<path d="M14 3.5v17l3.8-2.2a4.3 4.3 0 0 0 0-7.5l-1.6-.9 1.6-.9a4.3 4.3 0 0 0 0-7.5L14 3.5Z" />
				</svg>
				<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>{label}</h3>
			</div>
			{/* Arrows overlay the row instead of sitting beside it: mounting one beside it would
			    narrow the scroller and create the very overflow that justified showing it. */}
			<div style={{ position: "relative" }}>
				<div
					ref={scrollRef}
					onScroll={measure}
					className="strug-share-row"
					style={{ display: "flex", gap: 12, overflowX: "auto", scrollbarWidth: "none", scrollSnapType: "x proximity", paddingBottom: 4, ...(isMobile && inset ? { paddingLeft: MOBILE_GUTTER_PX, paddingRight: MOBILE_GUTTER_PX } : {}) }}
				>
					{clips.map((s, i) => (
						<div
							key={s.id ?? `clip-${i}`}
							onClick={() => onOpen?.(startIndex + i)}
							{...clickableProps(() => onOpen?.(startIndex + i))}
							aria-label={i18n.t("videos.playShort", { defaultValue: "Play clip" })}
							style={{ flex: "0 0 auto", width: isMobile ? 132 : 158, cursor: "pointer", scrollSnapAlign: "start" }}
						>
							{/* Thumbnail is video media — stays dark regardless of theme (rule 3). */}
							<div style={{ width: "100%", paddingBottom: "177%", borderRadius: 14, position: "relative", ...(s.thumb?.startsWith?.("http") ? { backgroundImage: `url(${s.thumb})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: s.thumb || "linear-gradient(135deg,#1e3a5f,#0f2744)" }) }}>
								<div style={{ position: "absolute", bottom: 8, left: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>
									{typeof s.views === "number" ? fmtVideoViews(s.views) : `${s.views} ${i18n.t("videos.views")}`}
								</div>
							</div>
							{/* Same three-dot menu the video cards carry. The wrapper swallows the click so
							    reaching for the menu does not start the clip playing. */}
							<div style={{ display: "flex", alignItems: "flex-start", gap: 2, marginTop: 8 }}>
								<p className="text-text-primary" style={{ flex: 1, minWidth: 0, overflow: "hidden", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", textOverflow: "ellipsis", overflowWrap: "break-word", whiteSpace: "normal" }}>{s.title}</p>
								<div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} style={{ flexShrink: 0 }}>
									<VideoCardMenu
										video={s}
										onAddToPlaylist={cardActions?.onAddToPlaylist}
										saved={cardActions?.savedIds ? cardActions.savedIds.has(s.id ?? s.videoId) : false}
										onToggleSaved={cardActions?.onToggleSaved}
										onShare={cardActions?.onShare}
										onRecommend={cardActions?.onRecommend}
										myChannelId={cardActions?.myChannelId}
									/>
								</div>
							</div>
						</div>
					))}
				</div>
				{!isMobile && [["left", edges.left, -1], ["right", edges.right, 1]].map(([side, shown, dir]) => shown && (
					<button
						key={side}
						type="button"
						aria-label={i18n.t(dir < 0 ? "common.previous" : "common.next")}
						onClick={() => scrollBy(dir)}
						className="bg-surface-raised border border-border text-text-primary"
						style={{ position: "absolute", top: "38%", [side]: -6, width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 18px var(--color-shadow)", padding: 0 }}
					>
						<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
							<polyline points={dir < 0 ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
						</svg>
					</button>
				))}
			</div>
		</div>
	);
}

/**
 * Horizontal watched rail on the mobile home feed. Compact 16:9 cards (not full-bleed) so the
 * next title peeks in and the row can swipe. Renders nothing when `videos` is empty, so a new
 * viewer never sees a bare "Watched" heading.
 */
function WatchedVideosShelf({ label, videos, onVideoClick, cardActions, onSeeAll }) {
	const { isMobile } = useViewport();
	if (!videos || videos.length === 0) return null;
	// Wide enough to read, narrow enough that the next title peeks in and the row can swipe.
	const cardW = isMobile ? "min(248px, 72vw)" : 240;
	return (
		<div style={{ marginBottom: 28 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, ...(isMobile ? { paddingLeft: MOBILE_GUTTER_PX, paddingRight: MOBILE_GUTTER_PX } : {}) }}>
				<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-primary" aria-hidden="true">
					<circle cx="12" cy="12" r="10" />
					<polyline points="12 6 12 12 16 14" />
				</svg>
				<h3 className="text-text-primary" style={{ flex: 1, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>{label}</h3>
				{onSeeAll && (
					<button
						type="button"
						onClick={onSeeAll}
						className="text-text-secondary"
						style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}
					>
						{i18n.t("common.seeAll")}
					</button>
				)}
			</div>
			<div
				className="strug-share-row"
				style={{ display: "flex", gap: 12, overflowX: "auto", scrollbarWidth: "none", scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain", paddingBottom: 4, paddingLeft: isMobile ? MOBILE_GUTTER_PX : 0, paddingRight: isMobile ? 40 : 0 }}
			>
				{videos.map((video, i) => (
					<div key={video.id ?? `watched-${i}`} style={{ flex: "0 0 auto", width: cardW, scrollSnapAlign: "start" }}>
						<VideoCard
							video={video}
							delay={i * 40}
							onClick={onVideoClick ? () => onVideoClick(video) : undefined}
							style={{ width: "100%" }}
							shelf
							{...cardActions}
						/>
					</div>
				))}
			</div>
		</div>
	);
}

/** Desktop watch drawer rows — videos and channel profiles with recommender attribution.
 *  Optional mutual-friend subscriber banner (same signal as Your Circle) sits above the list. */
function CreatorChoiceDrawerList({ items, onVideoSelect, onChannelSelect, channelOverlap, channelOverlapLoading, channelName, hasMore = false, loadingMore = false, onLoadMore }) {
	const overlapNames = formatFriendNameList(channelOverlap);
	const channelLabel =
		typeof channelName === "string"
			? channelName
			: (channelName?.display_name ?? channelName?.name ?? null);

	if (!items?.length && !channelOverlapLoading && !(channelOverlap?.length > 0)) {
		return (
			<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 12px" }}>
				{i18n.t("videos.creatorsChoiceEmpty")}
			</p>
		);
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
			{channelOverlapLoading ? (
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 2px" }}>
					{i18n.t("common.loading", { defaultValue: "Loading…" })}
				</p>
			) : channelOverlap?.length > 0 && channelLabel ? (
				<div
					className="bg-wash-2 border border-border-subtle"
					style={{ borderRadius: 10, padding: "8px 10px", marginBottom: 2 }}
				>
					<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, margin: "0 0 2px" }}>
						{i18n.t("videos.edgeDrawer.channelOverlapTitle", { channel: channelLabel })}
					</p>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0 }}>
						{i18n.t("videos.edgeDrawer.channelOverlapBody", {
							count: channelOverlap.length,
							names: overlapNames,
						})}
					</p>
				</div>
			) : null}

			{!items?.length ? (
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "24px 12px" }}>
					{i18n.t("videos.creatorsChoiceEmpty")}
				</p>
			) : items.map((item) => {
				const recommender = item.recommender?.name
					? i18n.t("videos.recommendedBy", { name: item.recommender.name })
					: null;
				const note = typeof item.note === "string" && item.note.trim() ? item.note.trim() : null;

				if (item.kind === "video") {
					const v = item.video;
					return (
						<button
							key={item.pickId ?? `cc-v-${v.id}`}
							type="button"
							onClick={() => onVideoSelect?.(v)}
							style={{ display: "flex", gap: 10, width: "100%", padding: 0, border: "none", background: "transparent", cursor: "pointer", textAlign: "left", alignItems: "flex-start" }}
						>
							<div
								style={{
									width: 120,
									height: 68,
									borderRadius: 6,
									flexShrink: 0,
									...(v.thumb?.startsWith?.("http")
										? { backgroundImage: `url(${v.thumb})`, backgroundSize: "cover", backgroundPosition: "center" }
										: { background: "linear-gradient(135deg,#1e3a5f,#0f2744)" }),
								}}
							/>
							<div style={{ flex: 1, minWidth: 0 }}>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: MOBILE_WATCH_TYPE.historyTitle.fontSize, fontWeight: MOBILE_WATCH_TYPE.historyTitle.fontWeight, lineHeight: MOBILE_WATCH_TYPE.historyTitle.lineHeight, margin: "0 0 4px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
									{v.title}
								</p>
								{recommender && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: MOBILE_WATCH_TYPE.historyMeta.fontSize, margin: "0 0 2px" }}>{recommender}</p>}
								{note && <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: MOBILE_WATCH_TYPE.historyMeta.fontSize, margin: "0 0 2px", fontStyle: "italic" }}>{note}</p>}
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: MOBILE_WATCH_TYPE.historyMeta.fontSize, margin: 0 }}>{v.channel}</p>
							</div>
						</button>
					);
				}

				const ch = item.channel;
				return (
					<button
						key={item.pickId ?? `cc-c-${ch.channelId}`}
						type="button"
						onClick={() => onChannelSelect?.(ch)}
						style={{ display: "flex", gap: 10, width: "100%", padding: 0, border: "none", background: "transparent", cursor: "pointer", textAlign: "left", alignItems: "center" }}
					>
						<div
							className="bg-surface-raised text-text-primary"
							style={{
								width: 52,
								height: 52,
								borderRadius: "50%",
								flexShrink: 0,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontFamily: "'Barlow Condensed', sans-serif",
								fontWeight: 700,
								fontSize: 18,
								overflow: "hidden",
								...(ch.profile_pic_url?.startsWith?.("http")
									? { backgroundImage: `url(${ch.profile_pic_url})`, backgroundSize: "cover", backgroundPosition: "center" }
									: {}),
							}}
						>
							{!ch.profile_pic_url?.startsWith?.("http") ? ch.avatar : null}
						</div>
						<div style={{ flex: 1, minWidth: 0 }}>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: MOBILE_WATCH_TYPE.historyTitle.fontSize, fontWeight: MOBILE_WATCH_TYPE.historyTitle.fontWeight, margin: "0 0 4px" }}>{ch.name}</p>
							{recommender && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: MOBILE_WATCH_TYPE.historyMeta.fontSize, margin: "0 0 2px" }}>{recommender}</p>}
							{note && <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: MOBILE_WATCH_TYPE.historyMeta.fontSize, margin: 0, fontStyle: "italic" }}>{note}</p>}
						</div>
					</button>
				);
			})}
			{hasMore && onLoadMore ? (
				<button type="button" disabled={loadingMore} onClick={onLoadMore} className="text-text-primary border border-border-subtle bg-surface-raised" style={{ minHeight: 44, borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, cursor: loadingMore ? "wait" : "pointer", opacity: loadingMore ? 0.65 : 1 }}>
					{loadingMore ? i18n.t("common.loading") : i18n.t("common.loadMore")}
				</button>
			) : null}
		</div>
	);
}

/** How often the closed tabs re-check for a new pick / upload / friend watch. */
const DRAWER_BADGE_POLL_MS = 120_000;
// Returning to the tab fires focus AND visibilitychange, and closing a panel re-runs the effect.
// Without a floor each of those was another full round of four requests.
const DRAWER_BADGE_MIN_GAP_MS = 15_000;

/**
 * Unseen counts for Choice / Subs / Circle, shared by the desktop edge tabs and the phone's Explore
 * sheet — the two are the same surface on different screens, so they must count the same way.
 *
 * `enabled` keeps only one caller polling (the drawer on a pointer device, the page on a phone) and
 * `paused` stops while an open panel is loading that tab's own list.
 */
function useDrawerUnseenBadges({ enabled, paused, sessionWatchedIds }) {
	// Read every render, so signing in (or switching account) restarts the poll and reloads that
	// account's markers instead of leaving the tabs blank until the next remount.
	const authUserId = getAuthUserId();
	// What the last poll found behind the closed tabs (null = that request failed, so the badge
	// keeps whatever it was showing rather than clearing news the viewer never saw).
	const [badgeSource, setBadgeSource] = useState({ creatorChoice: null, subs: null, circle: null });
	// Markers the viewer has already seen, per badge tab. Mirrors localStorage so a click updates
	// the badge without waiting for the next poll.
	const [seenMarkers, setSeenMarkers] = useState(() => readSeenMarkers(getAuthUserId()));
	// The poll seeds from what we hold, not from a fresh storage read: with localStorage blocked
	// (private mode) a re-read always says "never seeded" and the badge could never fire.
	const seenRef = useRef(seenMarkers);
	useEffect(() => { seenRef.current = seenMarkers; }, [seenMarkers]);
	// Videos already watched according to the server's history; merged with whatever was played in
	// this session so a row leaves the tab the moment it is played.
	const [historyWatchedIds, setHistoryWatchedIds] = useState(() => new Set());

	// Another account on the same device has its own markers.
	useEffect(() => {
		setSeenMarkers(readSeenMarkers(authUserId));
	}, [authUserId]);

	// Poll the three signals so a tab can say something arrived before it is opened. Runs only for
	// a signed-in viewer, and picks straight back up when the window regains focus.
	useEffect(() => {
		const userId = authUserId;
		if (!enabled || !userId || paused) return undefined;
		let alive = true;
		let lastPollAt = 0;
		const poll = () => {
			// A tab the viewer cannot see has nothing to announce; the focus listener catches up.
			if (document.visibilityState === "hidden") return;
			if (Date.now() - lastPollAt < DRAWER_BADGE_MIN_GAP_MS) return;
			lastPollAt = Date.now();
			Promise.allSettled([
				getSubscriptionCreatorPicks({}),
				getSubscriptionUploads({ limit: DRAWER_SUB_UPLOAD_CAP }),
				getFriendVideoActivity(),
				getWatchHistory({ limit: 50 }),
			]).then(([picks, uploads, circle, history]) => {
				if (!alive) return;
				if (import.meta.env?.DEV) {
					// A silently failed poll looks exactly like "no news", so at least say so here.
					for (const [name, settled] of [["picks", picks], ["uploads", uploads], ["circle", circle], ["history", history]]) {
						if (settled.status === "rejected") console.warn(`[videos] badge poll ${name} failed`, settled.reason);
					}
				}
				if (history.status === "fulfilled") {
					setHistoryWatchedIds(watchedIdSet(mapWatchHistory(history.value)));
				}
				const fetched = {
					creatorChoice: picks.status === "fulfilled" ? mapCreatorChoiceShelf(picks.value, mapApiVideo) : null,
					subs: uploads.status === "fulfilled" ? listFrom(uploads.value) : null,
					circle: circle.status === "fulfilled" ? listFrom(circle.value) : null,
				};
				// A failed request keeps the rows it already had, so a badge never clears on news
				// the viewer has not looked at yet.
				setBadgeSource((prev) => ({
					creatorChoice: fetched.creatorChoice ?? prev.creatorChoice,
					subs: fetched.subs ?? prev.subs,
					circle: fetched.circle ?? prev.circle,
				}));
				// First sight of an account: everything already there counts as seen, so the tabs
				// open quiet and only badge what turns up afterwards. A tab that was EMPTY is seeded
				// at 0 — still "seen", so the first row to arrive badges instead of being swallowed.
				let seen = seenRef.current;
				for (const tab of BADGE_TABS) {
					if (!fetched[tab] || seen[tab] != null) continue;
					const markers = tab === "creatorChoice"
						? creatorChoiceRowMarkers(fetched[tab])
						: tab === "subs"
							? subsRowMarkers(fetched[tab])
							: circleRowMarkers(fetched[tab], friendActivityAtMs);
					seen = writeSeenMarker(userId, tab, maxMarker(markers), undefined, seen);
				}
				if (seen !== seenRef.current) setSeenMarkers(seen);
			});
		};
		poll();
		const timer = setInterval(poll, DRAWER_BADGE_POLL_MS);
		const onFocus = () => { if (document.visibilityState !== "hidden") poll(); };
		window.addEventListener("focus", onFocus);
		document.addEventListener("visibilitychange", onFocus);
		return () => {
			alive = false;
			clearInterval(timer);
			window.removeEventListener("focus", onFocus);
			document.removeEventListener("visibilitychange", onFocus);
		};
	}, [enabled, paused, authUserId]);

	// One watched set for the lists and the counts: the server's history plus this session's plays,
	// so a video played a second ago is gone from the tab before the next poll confirms it.
	const watchedAllIds = useMemo(
		() => watchedIdSet([], [...historyWatchedIds, ...(sessionWatchedIds ?? [])]),
		[historyWatchedIds, sessionWatchedIds],
	);

	const markers = useMemo(() => ({
		creatorChoice: badgeSource.creatorChoice
			? creatorChoiceRowMarkers(withoutWatched(badgeSource.creatorChoice, watchedAllIds))
			: null,
		subs: badgeSource.subs ? subsRowMarkers(withoutWatched(badgeSource.subs, watchedAllIds)) : null,
		circle: badgeSource.circle
			? circleRowMarkers(withoutWatched(badgeSource.circle, watchedAllIds), friendActivityAtMs)
			: null,
	}), [badgeSource, watchedAllIds]);

	const counts = useMemo(() => ({
		creatorChoice: markers.creatorChoice ? unseenCount(markers.creatorChoice, seenMarkers.creatorChoice) : 0,
		subs: markers.subs ? unseenCount(markers.subs, seenMarkers.subs) : 0,
		circle: markers.circle ? unseenCount(markers.circle, seenMarkers.circle) : 0,
	}), [markers, seenMarkers]);

	// Opening a tab is the viewer seeing it: the badge clears and the marker moves up so the same
	// rows never announce themselves twice.
	// Marks the newest row BEHIND the tab, not the newest unwatched one: stopping at the newest
	// unwatched row left the watched rows above it unseen, so they badged again once they aged out
	// of the history payload. Without a signed-in id there is nowhere to record it — the shared,
	// un-namespaced key would leak into the next session — so it is left alone.
	const markSeen = useCallback((tab) => {
		if (!authUserId) return;
		const rows = badgeSource[tab];
		if (!rows) return;
		const allMarkers = tab === "creatorChoice"
			? creatorChoiceRowMarkers(rows)
			: tab === "subs"
				? subsRowMarkers(rows)
				: circleRowMarkers(rows, friendActivityAtMs);
		setSeenMarkers((prev) => writeSeenMarker(authUserId, tab, maxMarker(allMarkers), undefined, prev));
	}, [badgeSource, authUserId]);

	return { counts, watchedAllIds, markSeen };
}

/** Desktop/tablet edge drawer (History / Creator's Choice / Subs / Circle) for the whole Videos
 *  section — not only the watch page. State lives here so open tab + panel survive browse ↔ channel
 *  ↔ playlist ↔ docked playback navigation. */
function VideosSectionEdgeDrawer({ excludeVideoId, overlapChannelId, channelName, sessionWatchedIds, onPickVideo, onPickChannel }) {
	const { isMobile } = useViewport();
	const [panelOpen, setPanelOpen] = useState(false);
	const [panelTab, setPanelTab] = useState("history");
	const [panelHistory, setPanelHistory] = useState([]);
	const [panelHistoryLoading, setPanelHistoryLoading] = useState(false);
	const [panelHistoryCursor, setPanelHistoryCursor] = useState(null);
	const [panelHistoryHasMore, setPanelHistoryHasMore] = useState(false);
	const [panelHistoryLoadingMore, setPanelHistoryLoadingMore] = useState(false);
	const [channelOverlap, setChannelOverlap] = useState([]);
	const [channelOverlapLoading, setChannelOverlapLoading] = useState(false);
	const [panelSubs, setPanelSubs] = useState([]);
	const [panelSubsLoading, setPanelSubsLoading] = useState(false);
	const [panelSubsCursor, setPanelSubsCursor] = useState(null);
	const [panelSubsHasMore, setPanelSubsHasMore] = useState(false);
	const [panelSubsLoadingMore, setPanelSubsLoadingMore] = useState(false);
	const [friendActivity, setFriendActivity] = useState([]);
	const [friendActivityLoading, setFriendActivityLoading] = useState(false);
	const [friendActivityCursor, setFriendActivityCursor] = useState(null);
	const [friendActivityHasMore, setFriendActivityHasMore] = useState(false);
	const [friendActivityLoadingMore, setFriendActivityLoadingMore] = useState(false);
	const [panelCreatorChoice, setPanelCreatorChoice] = useState([]);
	const [panelCreatorChoiceLoading, setPanelCreatorChoiceLoading] = useState(false);
	const [panelCreatorChoiceCursor, setPanelCreatorChoiceCursor] = useState(null);
	const [panelCreatorChoiceHasMore, setPanelCreatorChoiceHasMore] = useState(false);
	const [panelCreatorChoiceLoadingMore, setPanelCreatorChoiceLoadingMore] = useState(false);
	// Pauses while the drawer is open: the open tab loads its own list.
	const { counts: badgeCounts, watchedAllIds, markSeen } = useDrawerUnseenBadges({
		enabled: !isMobile,
		paused: panelOpen,
		sessionWatchedIds,
	});

	useEffect(() => {
		if (isMobile && panelOpen) setPanelOpen(false);
	}, [isMobile, panelOpen]);

	// The open tab shows the same rows the badge counted. History is left alone: it is the watched
	// list, so filtering watched videos out of it would empty it.
	const visibleCreatorChoice = useMemo(() => withoutWatched(panelCreatorChoice, watchedAllIds), [panelCreatorChoice, watchedAllIds]);
	const visibleSubs = useMemo(() => withoutWatched(panelSubs, watchedAllIds), [panelSubs, watchedAllIds]);
	const visibleFriendActivity = useMemo(() => withoutWatched(friendActivity, watchedAllIds), [friendActivity, watchedAllIds]);

	const openPanelTab = useCallback((tab) => {
		setPanelTab(tab);
		setPanelOpen(true);
		markSeen(tab);
	}, [markSeen]);

	const loadPanelHistoryPage = useCallback(async (cursor = null) => {
		if (cursor) setPanelHistoryLoadingMore(true);
		else setPanelHistoryLoading(true);
		try {
			const response = await getWatchHistory({ limit: 20, ...(cursor ? { cursor } : {}) });
			const mapped = mapWatchHistory(response);
			setPanelHistory((current) => {
				const next = cursor ? [...current, ...mapped] : mapped;
				const seen = new Set();
				return next.filter((video) => {
					const id = String(video.id ?? video.videoId ?? "");
					if (!id || seen.has(id)) return false;
					seen.add(id);
					return true;
				});
			});
			setPanelHistoryCursor(response?.next_cursor ?? null);
			setPanelHistoryHasMore(response?.has_more === true && !!response?.next_cursor);
		} catch (err) {
			if (import.meta.env.DEV) console.warn("[videos] watch-history failed", err?.response?.status || err?.message || err);
			if (!cursor) setPanelHistory(import.meta.env.DEV ? DEMO_HISTORY : []);
		} finally {
			if (cursor) setPanelHistoryLoadingMore(false);
			else setPanelHistoryLoading(false);
		}
	}, []);

	useEffect(() => {
		if (isMobile || !panelOpen || panelTab !== "history") return undefined;
		loadPanelHistoryPage();
		return undefined;
	}, [panelOpen, panelTab, isMobile, loadPanelHistoryPage]);

	useEffect(() => {
		if (isMobile || !panelOpen || panelTab !== "creatorChoice") return undefined;
		if (!getAuthUserId()) {
			setPanelCreatorChoiceLoading(false);
			setPanelCreatorChoice([]);
			return undefined;
		}
		let alive = true;
		setPanelCreatorChoiceLoading(true);
		const exclude = excludeVideoId != null && Number.isFinite(Number(excludeVideoId)) ? Number(excludeVideoId) : undefined;
		getSubscriptionCreatorPicks({ limit: 20, ...(exclude != null ? { exclude } : {}) })
			.then((data) => {
				if (!alive) return;
				setPanelCreatorChoice(mapCreatorChoiceShelf(data, mapApiVideo));
				setPanelCreatorChoiceCursor(data?.next_cursor ?? null);
				setPanelCreatorChoiceHasMore(data?.has_more === true && !!data?.next_cursor);
			})
			.catch(() => { if (alive) setPanelCreatorChoice([]); })
			.finally(() => { if (alive) setPanelCreatorChoiceLoading(false); });
		return () => { alive = false; };
	}, [panelOpen, panelTab, isMobile, excludeVideoId]);

	useEffect(() => {
		let alive = true;
		if (isMobile || !getAuthUserId() || !panelOpen || panelTab !== "circle") {
			setFriendActivity([]);
			setFriendActivityLoading(false);
			return undefined;
		}
		const excludeId = excludeVideoId != null && Number.isFinite(Number(excludeVideoId)) ? Number(excludeVideoId) : undefined;
		setFriendActivityLoading(true);
		getFriendVideoActivityPage({ limit: 16, ...(excludeId ? { exclude: excludeId } : {}) })
			.then((response) => {
				if (!alive) return;
				const list = Array.isArray(response?.data) ? response.data : [];
				setFriendActivity(list.length ? list : (import.meta.env.DEV ? DEMO_FRIEND_ACTIVITY : []));
				setFriendActivityCursor(response?.next_cursor ?? null);
				setFriendActivityHasMore(response?.has_more === true && !!response?.next_cursor);
			})
			.catch((err) => {
				if (import.meta.env.DEV) {
					console.warn("[videos] friend-activity failed", err?.response?.status || err?.message || err);
				}
				if (alive) setFriendActivity(import.meta.env.DEV ? DEMO_FRIEND_ACTIVITY : []);
			})
			.finally(() => { if (alive) setFriendActivityLoading(false); });
		return () => { alive = false; };
	}, [excludeVideoId, panelOpen, panelTab, isMobile]);

	const loadMoreFriendActivity = async () => {
		if (!friendActivityCursor || friendActivityLoadingMore) return;
		setFriendActivityLoadingMore(true);
		try {
			const exclude = excludeVideoId != null && Number.isFinite(Number(excludeVideoId)) ? Number(excludeVideoId) : undefined;
			const response = await getFriendVideoActivityPage({ limit: 16, cursor: friendActivityCursor, ...(exclude ? { exclude } : {}) });
			const rows = Array.isArray(response?.data) ? response.data : [];
			setFriendActivity(current => {
				const seen = new Set(current.map(item => String(item.video_id)));
				return [...current, ...rows.filter(item => !seen.has(String(item.video_id)))];
			});
			setFriendActivityCursor(response?.next_cursor ?? null);
			setFriendActivityHasMore(response?.has_more === true && !!response?.next_cursor);
		} finally {
			setFriendActivityLoadingMore(false);
		}
	};

	useEffect(() => {
		let alive = true;
		if (isMobile || !panelOpen || (panelTab !== "circle" && panelTab !== "creatorChoice") || !overlapChannelId) {
			setChannelOverlap([]);
			setChannelOverlapLoading(false);
			return undefined;
		}
		if (!getAuthUserId()) {
			setChannelOverlap([]);
			setChannelOverlapLoading(false);
			return undefined;
		}
		setChannelOverlapLoading(true);
		getFriendChannelOverlap(overlapChannelId)
			.then((data) => {
				if (!alive) return;
				const list = Array.isArray(data) ? data : [];
				setChannelOverlap(list.length ? list : (import.meta.env.DEV ? DEMO_CHANNEL_OVERLAP : []));
			})
			.catch(() => {
				if (alive) setChannelOverlap(import.meta.env.DEV ? DEMO_CHANNEL_OVERLAP : []);
			})
			.finally(() => { if (alive) setChannelOverlapLoading(false); });
		return () => { alive = false; };
	}, [panelOpen, panelTab, overlapChannelId, isMobile]);

	useEffect(() => {
		let alive = true;
		if (isMobile || !panelOpen || panelTab !== "subs") return undefined;
		if (!getAuthUserId()) {
			setPanelSubsLoading(false);
			setPanelSubs([]);
			return undefined;
		}
		setPanelSubsLoading(true);
		const exclude = excludeVideoId != null && Number.isFinite(Number(excludeVideoId)) ? Number(excludeVideoId) : undefined;
		getSubscriptionUploads({
			limit: DRAWER_SUB_UPLOAD_CAP,
			...(exclude != null ? { exclude } : {}),
		})
			.then((data) => {
				if (!alive) return;
				const mapped = listFrom(data).map((raw) => {
					const v = mapApiVideo(raw);
					return {
						...v,
						isNewUpload: raw.is_new === true || raw.isNewUpload === true,
					};
				});
				setPanelSubs(mapped);
				setPanelSubsCursor(data?.next_cursor ?? null);
				setPanelSubsHasMore(data?.has_more === true && !!data?.next_cursor);
			})
			.catch((err) => {
				if (import.meta.env.DEV) {
					console.warn("[videos] subscription-uploads failed", err?.response?.status || err?.message || err);
				}
				if (alive) setPanelSubs(import.meta.env.DEV ? DEMO_SUB_UPLOADS : []);
			})
			.finally(() => { if (alive) setPanelSubsLoading(false); });
		return () => { alive = false; };
	}, [panelOpen, panelTab, isMobile, excludeVideoId]);

	const loadMorePanelCreatorChoice = async () => {
		if (!panelCreatorChoiceCursor || panelCreatorChoiceLoadingMore) return;
		setPanelCreatorChoiceLoadingMore(true);
		try {
			const exclude = excludeVideoId != null && Number.isFinite(Number(excludeVideoId)) ? Number(excludeVideoId) : undefined;
			const data = await getSubscriptionCreatorPicks({ limit: 20, cursor: panelCreatorChoiceCursor, ...(exclude ? { exclude } : {}) });
			const rows = mapCreatorChoiceShelf(data, mapApiVideo);
			setPanelCreatorChoice(current => {
				const keyOf = item => `${item.kind}:${item.pickId ?? item.video?.id ?? item.channel?.channelId}`;
				const seen = new Set(current.map(keyOf));
				return [...current, ...rows.filter(item => !seen.has(keyOf(item)))];
			});
			setPanelCreatorChoiceCursor(data?.next_cursor ?? null);
			setPanelCreatorChoiceHasMore(data?.has_more === true && !!data?.next_cursor);
		} finally {
			setPanelCreatorChoiceLoadingMore(false);
		}
	};

	const loadMorePanelSubs = async () => {
		if (!panelSubsCursor || panelSubsLoadingMore) return;
		setPanelSubsLoadingMore(true);
		try {
			const exclude = excludeVideoId != null && Number.isFinite(Number(excludeVideoId)) ? Number(excludeVideoId) : undefined;
			const data = await getSubscriptionUploads({ limit: DRAWER_SUB_UPLOAD_CAP, cursor: panelSubsCursor, ...(exclude ? { exclude } : {}) });
			const rows = listFrom(data).map(raw => ({ ...mapApiVideo(raw), isNewUpload: raw.is_new === true || raw.isNewUpload === true }));
			setPanelSubs(current => {
				const seen = new Set(current.map(item => String(item.id ?? item.videoId)));
				return [...current, ...rows.filter(item => !seen.has(String(item.id ?? item.videoId)))];
			});
			setPanelSubsCursor(data?.next_cursor ?? null);
			setPanelSubsHasMore(data?.has_more === true && !!data?.next_cursor);
		} finally {
			setPanelSubsLoadingMore(false);
		}
	};

	if (isMobile) return null;

	return (
		<>
			<SlideOutEdgeTab
				open={panelOpen && panelTab === "history"}
				onClick={() => openPanelTab("history")}
				top={stackEdgeTabTop(0, 5)}
				height={edgeTabHeightPx()}
				label={i18n.t("videos.edgeDrawer.history")}
				ariaLabel={i18n.t("videos.edgeDrawer.history")}
			/>
			<SlideOutEdgeTab
				open={panelOpen && panelTab === "creatorChoice"}
				onClick={() => openPanelTab("creatorChoice")}
				top={stackEdgeTabTop(1, 5)}
				height={edgeTabHeightPx()}
				label={i18n.t("videos.edgeDrawer.creatorChoice")}
				ariaLabel={tabUnseenLabel(i18n.t("videos.creatorsChoice"), badgeCounts.creatorChoice)}
				badge={badgeLabel(badgeCounts.creatorChoice)}
			/>
			<SlideOutEdgeTab
				open={panelOpen && panelTab === "subs"}
				onClick={() => openPanelTab("subs")}
				top={stackEdgeTabTop(2, 5)}
				height={edgeTabHeightPx()}
				label={i18n.t("videos.edgeDrawer.subs")}
				ariaLabel={tabUnseenLabel(i18n.t("videos.edgeDrawer.subs"), badgeCounts.subs)}
				badge={badgeLabel(badgeCounts.subs)}
			/>
			<SlideOutEdgeTab
				open={panelOpen && panelTab === "circle"}
				onClick={() => openPanelTab("circle")}
				top={stackEdgeTabTop(3, 5)}
				height={edgeTabHeightPx()}
				label={i18n.t("videos.edgeDrawer.circleShort", { defaultValue: "Circle" })}
				ariaLabel={tabUnseenLabel(i18n.t("videos.edgeDrawer.circle"), badgeCounts.circle)}
				badge={badgeLabel(badgeCounts.circle)}
			/>
			<SlideOutEdgeTab
				open={panelOpen && panelTab === "analytics"}
				onClick={() => openPanelTab("analytics")}
				top={stackEdgeTabTop(4, 5)}
				height={edgeTabHeightPx()}
				label="Insights"
				ariaLabel="Viewing Insights"
			/>
			<SlideOutPanel
				open={panelOpen}
				onClose={() => setPanelOpen(false)}
				// The drawer sits over a page that owns its own scroller, so locking the body here
				// only cost the page its scrollbar — it never came back after the drawer closed.
				lockScroll={false}
				title={
					panelTab === "history"
						? i18n.t("videos.edgeDrawer.history")
						: panelTab === "analytics"
							? "Viewing Insights"
							: panelTab === "subs"
								? i18n.t("videos.edgeDrawer.subsPanelTitle")
								: panelTab === "creatorChoice"
									? i18n.t("videos.creatorsChoice")
									: i18n.t("videos.edgeDrawer.circle")
				}
				titleVariant="content"
				width={400}
			>
				{panelTab === "analytics" ? (
					<ViewerAnalyticsPanel />
				) : panelTab === "creatorChoice" ? (
					panelCreatorChoiceLoading ? (
						<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 12px" }}>
							{i18n.t("common.loading", { defaultValue: "Loading…" })}
						</p>
					) : (
						<CreatorChoiceDrawerList
							items={visibleCreatorChoice}
							hasMore={panelCreatorChoiceHasMore}
							loadingMore={panelCreatorChoiceLoadingMore}
							onLoadMore={loadMorePanelCreatorChoice}
							channelOverlap={channelOverlap}
							channelOverlapLoading={channelOverlapLoading}
							channelName={channelName}
							onVideoSelect={(v) => {
								setPanelOpen(false);
								onPickVideo?.(v);
							}}
							onChannelSelect={(ch) => {
								setPanelOpen(false);
								onPickChannel?.({
									channel_id: ch.channelId,
									display_name: ch.name,
									handle: ch.handle,
									profile_pic_url: ch.profile_pic_url,
								});
							}}
						/>
					)
				) : (
					<WatchEdgeDrawer
						activeTab={panelTab}
						historyLoading={panelHistoryLoading}
						historyItems={panelHistory}
						hasMore={panelTab === "history" ? panelHistoryHasMore : panelTab === "circle" ? friendActivityHasMore : panelTab === "subs" ? panelSubsHasMore : false}
						loadingMore={panelTab === "history" ? panelHistoryLoadingMore : panelTab === "circle" ? friendActivityLoadingMore : panelSubsLoadingMore}
						onLoadMore={panelTab === "history" ? () => panelHistoryCursor && loadPanelHistoryPage(panelHistoryCursor) : panelTab === "circle" ? loadMoreFriendActivity : loadMorePanelSubs}
						friendActivityLoading={friendActivityLoading}
						friendActivity={visibleFriendActivity}
						channelOverlap={channelOverlap}
						channelOverlapLoading={channelOverlapLoading}
						channelName={channelName}
						subsLoading={panelSubsLoading}
						subsItems={visibleSubs}
						onPickVideo={(v) => {
							setPanelOpen(false);
							onPickVideo?.(v);
						}}
					/>
				)}
			</SlideOutPanel>
		</>
	);
}

/**
 * `interleave` drops something full-width into the grid every few rows: the clips shelves on the
 * landing page. `rowGaps` cycles, so the shelves are not evenly spaced and the page does not read
 * as a pattern, while staying in the same place on every render.
 */
function VideoSection({ label, videos, onVideoClick, cardActions, interleave }) {
	const { isMobile } = useViewport();
	// An empty shelf renders nothing rather than a bare heading over blank space — otherwise a
	// section with no videos (e.g. no popular clips yet) reads as a broken/half-loaded page.
	if (!videos || videos.length === 0) return null;
	return (
		<div style={{ marginBottom: isMobile ? 28 : 36, width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", overflowX: isMobile ? "hidden" : undefined }}>
			{label && <h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20,  letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 16, ...(isMobile ? { paddingLeft: MOBILE_GUTTER_PX, paddingRight: MOBILE_GUTTER_PX } : {}) }}>{label}</h3>}
			<div data-testid="video-section-grid" style={{ display: "grid", width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : VIDEO_FEED_GRID, gap: isMobile ? 16 : 20 }}>
				{videos.flatMap((video, i) => {
					const card = <VideoCard key={video.id ?? video.videoId ?? `vc-${i}`} video={video} delay={i * 40} onClick={onVideoClick ? () => onVideoClick(video) : undefined} style={{ width: "100%" }} {...cardActions} mobileBleed={isMobile} />;
					const shelfIndex = interleave?.breakAt.indexOf(i + 1) ?? -1;
					if (shelfIndex < 0) return [card];
					const node = interleave.render(shelfIndex);
					// minWidth 0 is what keeps the row honest. A `1fr` track is at least min-content wide,
					// and a sideways-scrolling shelf reports its min-content as every clip laid out end
					// to end — so without this the single mobile column stretched to the shelf's whole
					// scroll width (measured on production: a 1460px column on a 360px screen). Every
					// card was then drawn about four screens wide, which is what pushed the duration
					// badge in its corner off the side of the phone.
					return node ? [card, <div key={`interleave-${shelfIndex}`} style={{ gridColumn: "1 / -1", minWidth: 0 }}>{node}</div>] : [card];
				})}
			</div>
		</div>
	);
}

// Shorts <video> wrapper. Mirrors NativeVideoPlayer's HLS strategy: attach hls.js where
// supported, fall back to native HLS (Safari/iOS) / plain MP4 otherwise. Without this a
// `.m3u8` short renders blank on Chrome/Firefox/Android (no native HLS). The underlying
// <video> element is forwarded via assignRef so the player's play/pause refs keep working.
function ShortVideo({ src, assignRef, active = true, ...rest }) {
	const ref = useRef(null);
	useEffect(() => {
		const el = ref.current;
		// audit F1: only the active short attaches a player. Neighbouring rows may stay mounted as
		// lightweight thumbnail/preload shells, but must never own a media source or call play().
		// Previously EVERY short in the list mounted its own hls.js instance and
		// kept fetching fragments in the background — the "pause others" effect only pauses, it
		// doesn't stop hls.js loading, and the native/MP4 branch returned no cleanup — so a long
		// shorts list fanned out N concurrent fragment downloads, leaked instances, and bled audio.
		if (!el || !src || !active) return undefined;
		// Feed rows often arrive without hls_url; once /video/play hydrates it the <video> mounts
		// after the parent's play effect already ran. Kick play when this source is actually ready
		// so the first tap on a clip starts playback without a second tap.
		const kickPlay = () => { el.play().catch(() => {}); };
		// Native HLS (Safari/iOS) or a plain MP4 source — detach on cleanup so an off-screen short
		// stops buffering/decoding instead of streaming in the background. Also the fallback when
		// the lazily-loaded hls.js chunk never resolves, so the clip plays instead of sitting blank.
		const attachNative = () => {
			el.src = src;
			if (el.readyState >= 2) kickPlay();
			else el.addEventListener('loadeddata', kickPlay, { once: true });
		};
		const detachNative = () => {
			el.removeEventListener('loadeddata', kickPlay);
			try { el.pause(); el.removeAttribute('src'); el.load(); } catch { /* element gone */ }
		};

		if (!src.includes('.m3u8')) {
			attachNative();
			return detachNative;
		}
		if (shouldUseNativeHls(el)) {
			attachNative();
			return detachNative;
		}

		// hls.js is a lazy chunk, so the gate can only run once the constructor is in hand.
		let cancelled = false;
		let hlsInst = null;
		let wentNative = false;
		loadHls().then((Hls) => {
			if (cancelled || !el) return;
			if (!shouldUseHlsJs(el, Hls)) { wentNative = true; attachNative(); return; }
			hlsInst = new Hls({ startFragPrefetch: true, maxBufferLength: 8, maxMaxBufferLength: 30 });
			hlsInst.loadSource(src);
			hlsInst.attachMedia(el);
			hlsInst.on(Hls.Events.MANIFEST_PARSED, kickPlay);
			hlsInst.on(Hls.Events.ERROR, (_, data) => {
				if (!data.fatal) return;
				if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hlsInst.startLoad();
				else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hlsInst.recoverMediaError();
				else hlsInst.destroy();
			});
		}).catch(() => { if (!cancelled) { wentNative = true; attachNative(); } });
		return () => {
			cancelled = true;
			hlsInst?.destroy();
			if (wentNative) detachNative();
		};
	}, [src, active]);
	return <video ref={el => { ref.current = el; assignRef?.(el); }} {...rest} />;
}

function ShortsPlayer({ shorts, startIndex, onClose, onChannelClick, prefetchSrc = {}, hasMore = false, loadingMore = false, onLoadMore }) {
	const { isMobile } = useViewport();
	const [idx, setIdx] = useState(startIndex);
	// audit F5: engagement state is keyed by video_id, NOT array index. A background refetch of
	// `shorts` can reorder the list, and index-keyed state would then attach a like/save to the
	// wrong video. vidOf() resolves a short's stable id.
	const vidOf = (s) => s?.video_id ?? s?.id;
	const [liked, setLiked] = useState({});            // vid -> bool
	const [likeCounts, setLikeCounts] = useState(() => {
		const m = {};
		shorts.forEach(s => { const v = vidOf(s); if (v != null) m[v] = s.likes_count ?? 0; });
		return m;
	});
	const [saved, setSaved] = useState({});            // vid -> bool
	const [saveBusy, setSaveBusy] = useState({});      // vid -> bool
	const [commentsOpen, setCommentsOpen] = useState(false);
	const [shareOpen, setShareOpen] = useState(false);
	const [comment, setComment] = useState("");
	const [shortComments, setShortComments] = useState([]);
	const [commentCounts, setCommentCounts] = useState({});   // vid -> count
	const [paused, setPaused] = useState(false);
	// GET /video/shorts omits hls_url (same feed SELECT as /video/feed — see bug #461), so a
	// short arrives with processed_video_url === null and the <video> was never even mounted:
	// every short rendered as a still thumbnail that could not play. Hydrate the visible short
	// and its neighbours from the play payload, exactly like selectVideo() does for long-form.
	const [hydratedSrc, setHydratedSrc] = useState({});
	const srcOf = (s) => s?.processed_video_url ?? hydratedSrc[vidOf(s)] ?? prefetchSrc[vidOf(s)] ?? null;
	const containerRef = useRef(null);
	const videoRefs = useRef(shorts.map(() => ({ current: null })));
	// Cursor pagination appends clips without remounting this player. Keep one stable ref holder
	// per item so newly appended clips can mount, hydrate and play like the initial page.
	if (videoRefs.current.length !== shorts.length) {
		videoRefs.current = shorts.map((_, i) => videoRefs.current[i] ?? { current: null });
	}
	const lastTapRef = useRef(0);
	const [doubleTapHeart, setDoubleTapHeart] = useState(false);
	const [subs, setSubs] = useState({}); // channelId -> subscribed bool
	const [subBusy, setSubBusy] = useState(false);

	// Keep the immersive mobile feed continuous without downloading the whole clips
	// catalogue up front. Loading begins before the viewer reaches the final card.
	useEffect(() => {
		if (hasMore && !loadingMore && idx >= shorts.length - 3) onLoadMore?.();
	}, [hasMore, idx, loadingMore, onLoadMore, shorts.length]);

	// Fetch subscription status for the current short's channel
	useEffect(() => {
		const chId = shorts[idx]?.channel_id;
		if (!chId || subs[chId] !== undefined) return;
		getChannelSubscriptionStatus(chId).then(d => setSubs(s => ({ ...s, [chId]: !!d?.subscribed }))).catch(() => {});
	}, [idx, shorts, subs]);

	async function toggleFollow(chId) {
		if (!chId || subBusy) return;
		setSubBusy(true);
		const wasSubbed = !!subs[chId];
		setSubs(s => ({ ...s, [chId]: !wasSubbed })); // optimistic
		try {
			if (wasSubbed) await unsubscribeFromChannel(chId);
			else await subscribeToChannel(chId);
		} catch { setSubs(s => ({ ...s, [chId]: wasSubbed })); } // revert on failure
		setSubBusy(false);
	}

	// Seed the liked state from the server so already-liked shorts show as liked.
	useEffect(() => {
		getLikedVideoIds().then(ids => {
			if (!Array.isArray(ids) || !ids.length) return;
			const set = new Set(ids);
			setLiked(prev => { const next = { ...prev }; shorts.forEach(s => { const v = vidOf(s); if (v != null && set.has(v)) next[v] = true; }); return next; });
		}).catch(() => {});
	 
	}, [shorts]);

	// Toggle a like with optimistic count update + rollback on failure.
	function toggleLike(i) {
		const vid = vidOf(shorts[i]);
		if (vid == null) return;
		const wasLiked = !!liked[vid];
		setLiked(v => ({ ...v, [vid]: !wasLiked }));
		setLikeCounts(c => ({ ...c, [vid]: Math.max(0, (c[vid] ?? 0) + (wasLiked ? -1 : 1)) }));
		toggleVideoLike(vid).catch(() => {
			setLiked(v => ({ ...v, [vid]: wasLiked }));
			setLikeCounts(c => ({ ...c, [vid]: Math.max(0, (c[vid] ?? 0) + (wasLiked ? 1 : -1)) }));
		});
	}

	// Like via double-tap (only fires a like, never an unlike, matching the heart-flash UX).
	function likeViaDoubleTap(i) {
		const vid = vidOf(shorts[i]);
		if (vid == null || liked[vid]) return;
		toggleLike(i);
	}

	// Toggle Watch Later for a short (server-backed, optimistic).
	function toggleSave(i) {
		const vid = vidOf(shorts[i]);
		if (vid == null || saveBusy[vid]) return;
		const wasSaved = !!saved[vid];
		setSaved(v => ({ ...v, [vid]: !wasSaved }));
		setSaveBusy(b => ({ ...b, [vid]: true }));
		toggleWatchLater(vid)
			.catch(() => setSaved(v => ({ ...v, [vid]: wasSaved })))
			.finally(() => setSaveBusy(b => ({ ...b, [vid]: false })));
	}

	// Hide the mobile bottom nav while the immersive shorts player is open
	useEffect(() => {
		window.dispatchEvent(new CustomEvent("strug:immersive-media", { detail: true }));
		return () => window.dispatchEvent(new CustomEvent("strug:immersive-media", { detail: false }));
	}, []);

	// Play the current short, pause all others. Depends on the hydrated src too: /video/shorts
	// omits hls_url, so the first paint has no <video> and this effect used to no-op until the
	// viewer tapped again after hydrate mounted the element.
	const currentSrc = srcOf(shorts[idx]);
	useEffect(() => {
		if (!currentSrc) return undefined;
		let cancelled = false;
		const playCurrent = () => {
			if (cancelled) return;
			videoRefs.current.forEach((ref, i) => {
				const el = ref?.current;
				if (!el) return;
				if (i === idx) {
					el.play().catch(() => {});
				} else {
					el.pause();
				}
			});
		};
		playCurrent();
		const raf = requestAnimationFrame(playCurrent);
		const t = setTimeout(playCurrent, 120);
		return () => { cancelled = true; cancelAnimationFrame(raf); clearTimeout(t); };
	}, [idx, currentSrc]);

	// Hydrate the playable URL for the current short and its immediate neighbours (so a swipe
	// lands on an already-resolved source instead of a frozen thumbnail).
	useEffect(() => {
		[idx - 1, idx, idx + 1].forEach(i => {
			const s = shorts[i];
			const vid = vidOf(s);
			if (!s || vid == null) return;
			if (s.processed_video_url || hydratedSrc[vid] !== undefined) return;
			getVideo(vid).then(full => {
				const url = full?.hls_url ?? full?.processed_video_url ?? null;
				setHydratedSrc(prev => (prev[vid] !== undefined ? prev : { ...prev, [vid]: url }));
			}).catch(() => {
				setHydratedSrc(prev => (prev[vid] !== undefined ? prev : { ...prev, [vid]: null }));
			});
		});
	}, [idx, shorts, hydratedSrc]);

	useEffect(() => {
		if (!commentsOpen) return;
		const vid = shorts[idx]?.video_id ?? shorts[idx]?.id;
		if (!vid) return;
		getVideoComments(vid).then(data => {
			const list = listFrom(data);
			// The author and the time were placeholders ("User", a literal "recently") even though
			// the API returns both — which is what made shorts comments look like a dead mock.
			setShortComments(list.map(c => ({
				id: c.comment_id,
				user: c.user?.name ?? c.user?.username ?? i18n.t("common.defaultUser"),
				text: c.content,
				ago: c.created_at ? timeAgo(c.created_at) : i18n.t("common.justNow"),
			})));
			setCommentCounts(prev => ({ ...prev, [vid]: list.length }));
		}).catch(() => {});
	}, [commentsOpen, idx, shorts]);

	useEffect(() => {
		const el = containerRef.current;
		requestAnimationFrame(() => { if (el) el.scrollTop = startIndex * el.clientHeight; });
	}, [startIndex]);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		// Only advance once scrolling SETTLES on a new short. Without this, a continuous scroll
		// (notably middle-click / "centre of mouse" autoscroll) fires dozens of times a second and
		// rips through many shorts at once. Debounced settle-detection snaps to the resting index.
		let settleTimer = null;
		const onScroll = () => {
			if (settleTimer) clearTimeout(settleTimer);
			settleTimer = setTimeout(() => {
				const i = Math.round(el.scrollTop / el.clientHeight);
				if (i !== idx) { setPaused(false); setIdx(i); setCommentsOpen(false); setShareOpen(false); }
			}, 90);
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => { el.removeEventListener("scroll", onScroll); if (settleTimer) clearTimeout(settleTimer); };
	}, [idx]);

	useEffect(() => {
		const handler = e => {
			const el = containerRef.current;
			if (!el) return;
			if (e.key === "ArrowUp") el.scrollBy({ top: -el.clientHeight, behavior: "smooth" });
			else if (e.key === "ArrowDown") el.scrollBy({ top: el.clientHeight, behavior: "smooth" });
			else if (e.key === "Escape") { if (commentsOpen) setCommentsOpen(false); else if (shareOpen) setShareOpen(false); else onClose(); }
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [commentsOpen, shareOpen, onClose]);

	const actionBtn = (color) => ({
		display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
		background: "none", border: "none", cursor: "pointer",
		fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
		color: color || "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.9)",
	});

	// ── Fullscreen TikTok/Reels-style shorts feed — immersive video chrome composited directly
	// over the clip (controls, captions, like/comment/share/save), stays dark regardless of
	// theme (rule 3), matching Feed.jsx's InstagramVideoCard mobile reel + mobile fullscreen
	// reel feed. ──
	return (
		<div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 200 }}>
			{/* Back */}
			<button onClick={onClose} style={{ position: "absolute", top: 20, left: isMobile ? 16 : 96, zIndex: 210, display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 20, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
				<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
				Videos
			</button>
			{/* Desktop up/down navigation arrows */}
			{!isMobile && (() => {
				const go = dir => { const el = containerRef.current; if (el) el.scrollBy({ top: dir * el.clientHeight, behavior: "smooth" }); };
				const arrowStyle = disabled => ({ width: 48, height: 48, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.3 : 1, display: "flex", alignItems: "center", justifyContent: "center", transition: "opacity 0.15s, background 0.15s" });
				const atFirst = idx <= 0, atLast = idx >= shorts.length - 1;
				return (
					<div style={{ position: "absolute", right: "calc(50% - 290px)", top: "50%", transform: "translateY(-50%)", zIndex: 210, display: "flex", flexDirection: "column", gap: 16 }}>
						<button aria-label="Previous clip" disabled={atFirst} onClick={() => go(-1)} style={arrowStyle(atFirst)}>
							<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
						</button>
						<button aria-label="Next clip" disabled={atLast} onClick={() => go(1)} style={arrowStyle(atLast)}>
							<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
						</button>
					</div>
				);
			})()}

			{/* Scroll snap container */}
			<div ref={containerRef} onMouseDown={e => { if (e.button === 1) e.preventDefault(); }} style={{ position: "absolute", inset: 0, overflowY: "scroll", scrollSnapType: "y mandatory" }}>
				{shorts.map((s, i) => (
					<div key={s.id || i} style={{ height: "100dvh", scrollSnapAlign: "start", scrollSnapStop: "always", position: "relative", overflow: "hidden" }}>
						{/* Blurred bg */}
						<div style={{ position: "absolute", inset: 0, ...(s.thumb?.startsWith?.("http") ? { backgroundImage: `url(${s.thumb})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: s.thumb || "linear-gradient(135deg,#1e3a5f,#0f2744)" }), filter: "blur(40px)", opacity: 0.55, transform: "scale(1.15)" }} />

						{isMobile ? (
							/* ── TikTok mobile layout ── */
							<>
								{/* Video or thumbnail fallback. Only mount the <video> for shorts near the current
					 index — mobile browsers cap concurrent HTMLMediaElements (~16); mounting one per
					 short (lists up to 50) exhausted the decoder budget and crashed the tab (#384).
					 Far shorts fall back to the thumbnail below. */}
								{srcOf(s) && Math.abs(i - idx) <= 2 ? (
									<ShortVideo
										active={i === idx}
										assignRef={el => { if (videoRefs.current[i]) videoRefs.current[i].current = el; }}
										src={srcOf(s)}
										loop playsInline muted={false}
										onClick={() => {
											const now = Date.now();
											const delta = now - lastTapRef.current;
											lastTapRef.current = now;
											if (delta < 300) {
												// double-tap → like (fires the like API, not just local state)
												likeViaDoubleTap(i);
												setDoubleTapHeart(true);
												setTimeout(() => setDoubleTapHeart(false), 800);
												return;
											}
											const el = videoRefs.current[i]?.current;
											if (!el) return;
											if (el.paused) { el.play().catch(() => {}); setPaused(false); }
											else { el.pause(); setPaused(true); }
										}}
										style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
									/>
								) : (
									<div style={{ position: "absolute", inset: 0, ...(s.thumb?.startsWith?.("http") ? { backgroundImage: `url(${s.thumb})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: s.thumb || "linear-gradient(135deg,#1e3a5f,#0f2744)" }) }} />
								)}
								{/* Double-tap heart flash */}
								{doubleTapHeart && i === idx && (
									<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, pointerEvents: "none", animation: "socialLikePop 0.5s ease both" }}>
										<svg width={90} height={90} viewBox="0 0 24 24" fill="#ef4444" opacity={0.9}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
									</div>
								)}
								{/* Pause overlay — tap to play/pause */}
								{srcOf(s) && paused && i === idx && (
									<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, pointerEvents: "none" }}>
										<div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "2px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
											<svg width={24} height={24} viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3"/></svg>
										</div>
									</div>
								)}
								{/* Duration */}
								<div style={{ position: "absolute", top: 14, left: 14, zIndex: 2, background: "rgba(0,0,0,0.7)", borderRadius: 5, padding: "3px 9px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, color: "#fff" }}>{s.duration}</div>
								{/* Bottom gradient */}
								<div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "55%", background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, transparent 100%)", pointerEvents: "none", zIndex: 2 }} />
								{/* Author + caption */}
								<div style={{ position: "absolute", bottom: 40, left: 16, right: 80, zIndex: 3 }}>
									<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
										<div onClick={() => onChannelClick?.({ channelId: s.channel_id, name: s.channel, handle: s.handle, avatar: s.avatar, thumb: null, subscriber_count: null })} {...(onChannelClick ? clickableProps(() => onChannelClick({ channelId: s.channel_id, name: s.channel, handle: s.handle, avatar: s.avatar, thumb: null, subscriber_count: null })) : {})} aria-label={onChannelClick ? s.channel : undefined} style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "2px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff", fontFamily: "'Barlow Condensed', sans-serif", flexShrink: 0, overflow: "hidden", cursor: onChannelClick ? "pointer" : "default" }}>
											<SafeImage loading="lazy" decoding="async" src={s.profile_pic_url} alt={s.channel} style={{ width: "100%", height: "100%", objectFit: "cover" }} fallback={s.avatar} />
										</div>
										<span onClick={() => onChannelClick?.({ channelId: s.channel_id, name: s.channel, handle: s.handle, avatar: s.avatar, thumb: null, subscriber_count: null })} {...(onChannelClick ? clickableProps(() => onChannelClick({ channelId: s.channel_id, name: s.channel, handle: s.handle, avatar: s.avatar, thumb: null, subscriber_count: null })) : {})} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, color: "#fff", cursor: onChannelClick ? "pointer" : "default" }}>{s.channel}</span>
										<button onClick={() => toggleFollow(s.channel_id)} disabled={subBusy} style={{ padding: "3px 12px", background: subs[s.channel_id] ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 14, color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: subBusy ? "default" : "pointer", opacity: subBusy ? 0.6 : 1 }}>{subs[s.channel_id] ? i18n.t("common.following") : i18n.t("common.follow")}</button>
									</div>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: "#fff", lineHeight: 1.45, marginBottom: 4 }}>{s.title}</p>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{typeof s.views === "number" ? fmtVideoViews(s.views) : `${s.views} ${i18n.t("videos.views")}`}</p>
								</div>
								{/* Right-side actions */}
								<div style={{ position: "absolute", right: 14, bottom: 44, zIndex: 3, display: "flex", flexDirection: "column", gap: 22, alignItems: "center" }}>
									<button onClick={() => toggleLike(i)} style={actionBtn(liked[vidOf(s)] ? "#ef4444" : "#fff")}>
										<svg width={28} height={28} viewBox="0 0 24 24" fill={liked[vidOf(s)] ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
										{likeCounts[vidOf(s)] > 0 ? formatCount(likeCounts[vidOf(s)]) : i18n.t("common.like")}
									</button>
									<button onClick={() => { setShareOpen(false); setCommentsOpen(v => !v); }} style={actionBtn()}>
										<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
										{commentCounts[vidOf(s)] > 0 ? formatCount(commentCounts[vidOf(s)]) : i18n.t("common.comment")}
									</button>
									<button onClick={() => { setCommentsOpen(false); setShareOpen(v => !v); }} style={actionBtn()}>
										<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
										{i18n.t("common.share")}
									</button>
									<button onClick={() => toggleSave(i)} style={actionBtn(saved[vidOf(s)] ? "#a78bfa" : "#fff")}>
										<svg width={28} height={28} viewBox="0 0 24 24" fill={saved[vidOf(s)] ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
										{i18n.t("common.save")}
									</button>
								</div>
							</>
						) : (
							/* ── Vertical clips desktop layout ── */
							<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
								<div style={{ display: "flex", alignItems: "flex-end", gap: 20 }}>
									{/* Video card */}
									{/* #464: match a standard vertical-clip aspect ratio. This was width-driven and
									    capped at 360px, so on a laptop the player sat small in the middle of a mostly
									    empty screen. Drive it from the viewport HEIGHT instead (the 9:16 card is
									    height-bound) and let the width follow from the aspect ratio. */}
									<div style={{ height: "min(calc(100dvh - 96px), 880px)", width: "auto", aspectRatio: "9/16", ...(s.thumb?.startsWith?.("http") ? { backgroundImage: `url(${s.thumb})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: s.thumb || "linear-gradient(135deg,#1e3a5f,#0f2744)" }), borderRadius: 20, overflow: "hidden", position: "relative", boxShadow: "0 24px 80px rgba(0,0,0,0.8)" }}>
										{srcOf(s) && Math.abs(i - idx) <= 2 ? (
											<ShortVideo
												active={i === idx}
												assignRef={el => { if (videoRefs.current[i]) videoRefs.current[i].current = el; }}
												src={srcOf(s)}
												loop playsInline
												onClick={() => {
													const el = videoRefs.current[i]?.current;
													if (!el) return;
													if (el.paused) { el.play().catch(() => {}); setPaused(false); }
													else { el.pause(); setPaused(true); }
												}}
												style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }}
											/>
										) : (
											<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
												<div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(0,0,0,0.5)", border: "2px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
													<svg width={24} height={24} viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3"/></svg>
												</div>
											</div>
										)}
										<div style={{ position: "absolute", top: 14, right: 14, background: "rgba(0,0,0,0.7)", borderRadius: 5, padding: "3px 9px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, color: "#fff" }}>{s.duration}</div>
										<div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "60px 16px 18px", background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)" }}>
											<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
												<div onClick={() => onChannelClick?.({ channelId: s.channel_id, name: s.channel, handle: s.handle, avatar: s.avatar, thumb: null, subscriber_count: null })} {...(onChannelClick ? clickableProps(() => onChannelClick({ channelId: s.channel_id, name: s.channel, handle: s.handle, avatar: s.avatar, thumb: null, subscriber_count: null })) : {})} aria-label={onChannelClick ? s.channel : undefined} style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#fff", fontFamily: "'Barlow Condensed', sans-serif", flexShrink: 0, overflow: "hidden", cursor: onChannelClick ? "pointer" : "default" }}>
													<SafeImage loading="lazy" decoding="async" src={s.profile_pic_url} alt={s.channel} style={{ width: "100%", height: "100%", objectFit: "cover" }} fallback={s.avatar} />
												</div>
												<span onClick={() => onChannelClick?.({ channelId: s.channel_id, name: s.channel, handle: s.handle, avatar: s.avatar, thumb: null, subscriber_count: null })} {...(onChannelClick ? clickableProps(() => onChannelClick({ channelId: s.channel_id, name: s.channel, handle: s.handle, avatar: s.avatar, thumb: null, subscriber_count: null })) : {})} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#fff", cursor: onChannelClick ? "pointer" : "default" }}>{s.channel}</span>
												<button onClick={() => toggleFollow(s.channel_id)} disabled={subBusy} style={{ padding: "4px 12px", background: subs[s.channel_id] ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 14, color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: subBusy ? "default" : "pointer", opacity: subBusy ? 0.6 : 1 }}>{subs[s.channel_id] ? i18n.t("common.following") : i18n.t("common.follow")}</button>
											</div>
											<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: "#fff", lineHeight: 1.4, marginBottom: 4 }}>{s.title}</p>
											<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{typeof s.views === "number" ? fmtVideoViews(s.views) : `${s.views} ${i18n.t("videos.views")}`}</p>
										</div>
									</div>
									{/* Action buttons */}
									<div style={{ display: "flex", flexDirection: "column", gap: 24, alignItems: "center", paddingBottom: 20 }}>
										<button onClick={() => toggleLike(i)} style={actionBtn(liked[vidOf(s)] ? "#ef4444" : "#fff")}>
											<svg width={26} height={26} viewBox="0 0 24 24" fill={liked[vidOf(s)] ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
											{likeCounts[vidOf(s)] > 0 ? formatCount(likeCounts[vidOf(s)]) : i18n.t("common.like")}
										</button>
										<button onClick={() => { setShareOpen(false); setCommentsOpen(v => !v); }} style={actionBtn()}>
											<svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
											{commentCounts[vidOf(s)] > 0 ? formatCount(commentCounts[vidOf(s)]) : i18n.t("common.comment")}
										</button>
										<button onClick={() => { setCommentsOpen(false); setShareOpen(v => !v); }} style={actionBtn()}>
											<svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
											{i18n.t("common.share")}
										</button>
										<button onClick={() => toggleSave(i)} style={actionBtn(saved[vidOf(s)] ? "#a78bfa" : "#fff")}>
											<svg width={26} height={26} viewBox="0 0 24 24" fill={saved[vidOf(s)] ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
											{i18n.t("common.save")}
										</button>
									</div>
								</div>
							</div>
						)}
					</div>
				))}
			</div>

			{/* Comments panel */}
			<CommentsSheet
				open={commentsOpen}
				onClose={() => setCommentsOpen(false)}
				comments={shortComments.map((c, ci) => ({
					id: c.id ?? ci,
					user: c.user,
					avatar: (c.user?.[0] ?? "U").toUpperCase(),
					avatarColor: "#1e3a5f",
					time: c.ago,
					text: c.text,
					likes: 0,
					liked: false,
				}))}
				draft={comment}
				onDraftChange={setComment}
				onSubmit={async () => {
					const text = comment.trim();
					if (!text) return;
					setComment("");
					const vid = shorts[idx]?.video_id ?? shorts[idx]?.id;
					if (vid == null) return;
					// Optimistic row, reconciled against the real comment_id — and dropped again if
					// the POST fails, so a comment that never saved can't linger as a ghost that
					// vanishes on the next open.
					const tempId = `local_${Date.now()}`;
					setShortComments(prev => [{ id: tempId, user: i18n.t("common.you"), text, ago: i18n.t("common.justNow") }, ...prev]);
					setCommentCounts(prev => ({ ...prev, [vid]: (prev[vid] ?? 0) + 1 }));
					try {
						const res = await addVideoComment(vid, text);
						const real = res?.data;
						if (real?.comment_id != null) {
							setShortComments(prev => prev.map(c => (c.id === tempId ? { ...c, id: real.comment_id, text: real.content ?? c.text } : c)));
						}
					} catch {
						setShortComments(prev => prev.filter(c => c.id !== tempId));
						setCommentCounts(prev => ({ ...prev, [vid]: Math.max(0, (prev[vid] ?? 1) - 1) }));
					}
				}}
				onReply={cm => setComment(`@${cm.user} `)}
			/>

			{/* Share panel — same internal + external share sheet as watch page */}
			{shareOpen && (
				<VideoShareDialog video={shorts[idx]} onClose={() => setShareOpen(false)} />
			)}
		</div>
	);
}

function PlaylistDetailPage({ playlist, onBack, onVideoClick, onAddToPlaylist, onRemoveVideo }) {
	const { isMobile } = useViewport();
	const videos = playlist.videos ?? [];
	const [shuffled, setShuffled] = useState(false);
	const [shuffledVideos, setShuffledVideos] = useState(videos);
	const [rowMenu, setRowMenu] = useState(null);
	const displayed = shuffled ? shuffledVideos : videos;
	const mix = isMixPlaylist(playlist.name);
	const cover = videos.find((v) => v.thumb?.startsWith?.("http"))?.thumb;
	function toggleShuffle() {
		setShuffled(v => {
			if (!v) setShuffledVideos(shuffleArray(videos));
			return !v;
		});
	}
	const playAt = (index) => {
		const list = displayed;
		const v = list[index];
		if (v) onVideoClick?.(v, list);
	};
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0 }}>
			<div style={{
				...(cover
					? { backgroundImage: `linear-gradient(rgba(0,0,0,0.5),rgba(0,0,0,0.72)),url(${cover})`, backgroundSize: "cover", backgroundPosition: "center" }
					: { background: "linear-gradient(135deg,#1e3a5f,#0f2744)" }),
				padding: `${isMobile ? "28px 16px 24px" : "40px 40px 32px 108px"}`,
				borderBottom: "1px solid rgba(255,255,255,0.08)",
				flexShrink: 0,
			}}>
				<button type="button" onClick={onBack} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 20, padding: 0 }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					{i18n.t("videos.playlists")}
				</button>
				<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "flex-end", gap: isMobile ? 16 : 28 }}>
					<div style={{
						width: isMobile ? "100%" : 220,
						maxWidth: isMobile ? 280 : 220,
						aspectRatio: "16 / 9",
						borderRadius: 12,
						overflow: "hidden",
						flexShrink: 0,
						boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
						...(cover ? { backgroundImage: `url(${cover})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: "rgba(0,0,0,0.35)" }),
					}} />
					<div style={{ flex: 1, minWidth: 0 }}>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.65)", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 6px" }}>
							{mix ? i18n.t("videos.mixPlaylist", { defaultValue: "Mix" }) : i18n.t("videos.playlist", { defaultValue: "Playlist" })}
						</p>
						<h1 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: isMobile ? 22 : 32, color: "#fff", margin: "0 0 8px", lineHeight: 1.2 }}>{playlist.name}</h1>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 16 }}>{fmtVideoCount(videos.length)}</p>
						<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
							<button type="button" disabled={!videos.length} onClick={() => playAt(0)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", background: "#fff", border: "none", borderRadius: 24, color: "#111", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: videos.length ? "pointer" : "default", opacity: videos.length ? 1 : 0.5 }}>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
								{i18n.t("videos.playAll")}
							</button>
							<button type="button" disabled={!videos.length} onClick={toggleShuffle} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", background: shuffled ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 24, color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: videos.length ? "pointer" : "default" }}>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>
								{shuffled ? i18n.t("videos.shuffled") : i18n.t("videos.shuffle")}
							</button>
						</div>
					</div>
				</div>
			</div>
			<div className="bg-bg" style={{ padding: `${isMobile ? "8px 8px 40px 8px" : "8px 40px 40px 108px"}` }}>
				{displayed.map((v, i) => (
					<div key={videoIdOf(v) ?? `pl-${i}`} onClick={() => playAt(i)}
						style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 14, padding: isMobile ? "10px 8px" : "12px 8px", cursor: "pointer", borderRadius: 10 }}
						onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-raised)"}
						onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
						<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, width: 22, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
						<div style={{ width: isMobile ? 128 : 148, height: isMobile ? 72 : 84, borderRadius: 8, ...(v.thumb?.startsWith?.("http") ? { backgroundImage: `url(${v.thumb})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: v.thumb || "linear-gradient(135deg,#1e3a5f,#0f2744)" }), flexShrink: 0, position: "relative", overflow: "hidden" }}>
							{v.duration && <div style={{ position: "absolute", bottom: 4, right: 6, background: "rgba(0,0,0,0.75)", borderRadius: 3, padding: "1px 5px", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, color: "#fff" }}>{v.duration}</div>}
						</div>
						<div style={{ flex: 1, minWidth: 0 }}>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, margin: "0 0 4px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{v.title}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.channel}{v.views ? ` · ${v.views}` : ""}</p>
						</div>
						<div style={{ position: "relative", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
							<button
								type="button"
								aria-label={i18n.t("videos.moreActions", { defaultValue: "More actions" })}
								onClick={() => setRowMenu((cur) => cur === i ? null : i)}
								className="text-text-muted"
								style={{ width: 36, height: 36, borderRadius: "50%", background: "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
							>
								<svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
							</button>
							{rowMenu === i && (
								<div className="bg-surface-raised border border-border" style={{ position: "absolute", right: 0, top: "100%", zIndex: 8, minWidth: 200, borderRadius: 12, padding: 6, boxShadow: "0 8px 28px var(--color-shadow)" }}>
									<button type="button" onClick={() => { setRowMenu(null); onAddToPlaylist?.(v); }} className="text-text-primary" style={{ display: "block", width: "100%", padding: "10px 12px", background: "none", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, borderRadius: 8 }}>
										{i18n.t("videos.saveToPlaylist")}
									</button>
									{onRemoveVideo ? (
									<button type="button" onClick={() => { setRowMenu(null); onRemoveVideo(v); }} className="text-text-primary" style={{ display: "block", width: "100%", padding: "10px 12px", background: "none", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, borderRadius: 8, color: "#ef4444" }}>
										{i18n.t("videos.removeFromPlaylist", { defaultValue: "Remove from playlist" })}
									</button>
									) : null}
								</div>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// The custom video player: <video> element, scrubber, volume/speed/quality controls, end-screen
// overlay, tap-to-seek surfaces. All of it is video player chrome composited directly over the
// playing clip — stays dark regardless of theme (rule 3), same treatment as ShortsPlayer above
// and Feed.jsx's InstagramVideoCard/StoryViewer.
function NativeVideoPlayer({ src, style, autoplayNext, poster, endScreenItems = [], onSelectEndScreen, onSkipNext, onSkipPrevious, autoplayOn, onToggleAutoplay, isMiniPlayer = false, onVideoReady, hydrating = false, mediaTitle, mediaArtist, theater = false, onToggleTheater, startAtSec = 0, autoPlay = true, hideChrome = false }) {
	const ref = useRef(null);
	const hlsRef = useRef(null);
	const { isMobile } = useViewport();
	const [qualityLevels, setQualityLevels] = useState([]);
	const [currentQuality, setCurrentQuality] = useState(-1);
	const [showQualityMenu, setShowQualityMenu] = useState(false);
	const [settingsPane, setSettingsPane] = useState('menu'); // 'menu' | 'speed' | 'quality'
	const [autoHeight, setAutoHeight] = useState(0);
	const showQualityMenuRef = useRef(false);
	showQualityMenuRef.current = showQualityMenu;
	const [loadError, setLoadError] = useState(false);
	// End screen: when a clip finishes, overlay a grid of suggestions over the
	// player (custom controls). If autoplay is on (autoplayNext provided) we run a
	// cancelable "Playing next in N" countdown that advances to the top suggestion.
	// Reset whenever the src changes.
	const [ended, setEnded] = useState(false);
	const [countdown, setCountdown] = useState(null);
	const [seekFlash, setSeekFlash] = useState(null); // 'left' | 'right'
	const dblTapRef = useRef({ t: 0, side: null });
	const lastScrubRef = useRef(0);
	// Custom player controls (replacing the buggy native <video controls>).
	const containerRef = useRef(null);
	const barRef = useRef(null);
	const volRef = useRef(null);
	const hideT = useRef(null);
	const tapT = useRef(null);
	const toggleFsRef = useRef(null);
	const setSpeedRef = useRef(null); // #270: lets the keydown handler drive playback speed
	const [paused, setPaused] = useState(true);
	const [cur, setCur] = useState(0);
	const [dur, setDur] = useState(0);
	const [buf, setBuf] = useState(0);
	const [muted, setMuted] = useState(false);
	const [vol, setVol] = useState(1);
	const [rate, setRate] = useState(1);
	const rateRef = useRef(1);
	rateRef.current = rate;
	const applyRate = () => {
		const el = ref.current;
		const r = rateRef.current;
		if (!el || !Number.isFinite(r) || r <= 0) return;
		if (el.playbackRate !== r) el.playbackRate = r;
	};
	const [pseudoFs, setPseudoFs] = useState(false); // iOS CSS fullscreen (keeps custom controls)
	const [ctrls, setCtrls] = useState(true);
	const [loop, setLoop] = useState(false); // #270: repeat single video
	useEffect(() => {
		if (ref.current) onVideoReady?.(ref.current);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	useEffect(() => {
		if (!autoPlay) return undefined;
		safePlay(ref.current);
		return undefined;
	}, [autoPlay, src]);
	const startAtRef = useRef(startAtSec);
	startAtRef.current = startAtSec;
	const appliedStartRef = useRef(-1);
	useEffect(() => {
		if (!ref.current || !src) return;
		setLoadError(false);
		setEnded(false);
		setCountdown(null);
		let cancelled = false;
		const startPos = resumeStartPosition(startAtRef.current);
		appliedStartRef.current = startPos;
		// Native path: iOS/Safari (native HLS) and any browser where hls.js is unsupported.
		// Hand the URL to the element and restore the resume point once metadata lands.
		const playNatively = () => {
			// Media fragment: iOS starts at the resume point instead of pulling 0:00 first and then
			// seeking, which cost a second load pass on every reopen. The listener below still
			// covers browsers that ignore the fragment.
			ref.current.src = startPos > 0 ? `${src}#t=${Math.floor(startPos)}` : src;
			setQualityLevels([]);
			setAutoHeight(0);
			applyRate();
			if (startPos > 0) {
				const el = ref.current;
				const seek = () => {
					const t = resumeStartPosition(startAtRef.current, el.duration);
					if (t > 0) el.currentTime = t;
				};
				if (el.readyState >= 1) seek();
				else el.addEventListener('loadedmetadata', seek, { once: true });
			}
		};
		if (src.includes('.m3u8')) {
			if (shouldUseNativeHls(ref.current)) {
				playNatively();
				return () => { cancelled = true; setQualityLevels([]); setCurrentQuality(-1); setAutoHeight(0); };
			}
			// hls.js is loaded on demand (vendor-hls chunk). The support gate needs the module
			// itself, so it can only run once the import resolves.
			loadHls().then((Hls) => {
				if (cancelled || !ref.current) return;
				if (!shouldUseHlsJs(ref.current, Hls)) { playNatively(); return; }
				// Phone vs desktop ABR/buffer live in hlsPlayerConfig. startPosition is the resume
				// point so a reopened video does not download 0:00 and then jump.
				const hls = new Hls(hlsPlayerConfig({ isMobile, startPosition: startPos }));
				hlsRef.current = hls;
				hls.loadSource(src);
				hls.attachMedia(ref.current);
				// Attaching resets playbackRate to 1 while the speed chips still read as selected,
				// so re-apply it on attach, on manifest and after a media-error recovery.
				hls.on(Hls.Events.MEDIA_ATTACHED, applyRate);
				hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
					setQualityLevels(qualityChoicesFromLevels(data.levels));
					setCurrentQuality(-1);
					applyRate();
				});
				hls.on(Hls.Events.LEVELS_UPDATED, () => {
					setQualityLevels(qualityChoicesFromLevels(hls.levels));
				});
				hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
					const h = Number(hls.levels?.[data.level]?.height);
					setAutoHeight(Number.isFinite(h) && h > 0 ? h : 0);
				});
				// Recover from transient errors; surface a fallback UI only on unrecoverable fatal errors
				hls.on(Hls.Events.ERROR, (_, data) => {
					if (!data.fatal) return;
					if (data.type === Hls.ErrorTypes.NETWORK_ERROR) { hls.startLoad(); }
					else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); applyRate(); }
					else { hls.destroy(); hlsRef.current = null; setLoadError(true); }
				});
			}).catch(() => { if (!cancelled && ref.current) playNatively(); });
		} else {
			playNatively();
		}
		return () => { cancelled = true; if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } setQualityLevels([]); setCurrentQuality(-1); setAutoHeight(0); };
	// isMobile is read at attach time only. Rotating the phone must not tear the stream down.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [src]);
	// A later /resume value (other device) should jump only if we have not already started.
	// It must not call hls.startLoad(t): that aborts the fragments already in flight and restarts
	// the whole load, which is why reopening a watched video took seconds longer than a first play.
	// Seeking gets to the same place and keeps the buffered start.
	useEffect(() => {
		const t = resumeStartPosition(startAtSec);
		if (t < 0 || t === appliedStartRef.current) return;
		const v = ref.current;
		if (!v || v.currentTime > 5) return;
		appliedStartRef.current = t;
		const seek = () => {
			const el = ref.current;
			if (!el || el.currentTime > 5) return;
			const at = resumeStartPosition(t, el.duration);
			if (at > 0) el.currentTime = at;
		};
		if (v.readyState >= 1) { seek(); return undefined; }
		v.addEventListener('loadedmetadata', seek, { once: true });
		return () => v.removeEventListener('loadedmetadata', seek);
	}, [startAtSec]);
	// Mini strip is ~88px wide. Leaving capLevelToPlayerSize on would drop to a tiny rung, then
	// expanding back to full screen has to re-fetch. Keep the watch-page quality while docked.
	useEffect(() => {
		if (hlsRef.current) hlsRef.current.capLevelToPlayerSize = false;
	}, [isMiniPlayer]);
	// PiP: on desktop, enter picture-in-picture when user navigates away from videos
	useEffect(() => {
		if (isMobile || !document.pictureInPictureEnabled) return;
		const handler = (e) => {
			const { from } = e.detail ?? {};
			if (from === "videos" && ref.current && !ref.current.paused) {
				ref.current.requestPictureInPicture().catch(() => {});
			}
		};
		window.addEventListener("strug:will-nav", handler);
		return () => window.removeEventListener("strug:will-nav", handler);
	}, [isMobile]);
	// Exit PiP when navigating back to videos
	useEffect(() => {
		if (isMobile || !document.pictureInPictureEnabled) return;
		const handler = (e) => {
			const { to } = e.detail ?? {};
			if (to === "videos" && document.pictureInPictureElement) {
				document.exitPictureInPicture().catch(() => {});
			}
		};
		window.addEventListener("strug:will-nav", handler);
		return () => window.removeEventListener("strug:will-nav", handler);
	}, [isMobile]);
	// Fullscreen auto-rotate (bug #103 "rotate button does not work in mobile"):
	// the native fullscreen button is what users tap to "rotate" the video, but we
	// only ever UNLOCKED orientation on exit — nothing rotated the player to
	// landscape on enter, so on mobile fullscreen stayed portrait. Lock to landscape
	// when entering fullscreen on a phone, and release the lock on exit. Wrapped in
	// try/catch because orientation.lock rejects/throws on desktop + unsupported
	// browsers (and iOS, where webkitEnterFullscreen handles rotation itself).
	useEffect(() => {
		const onFsChange = () => {
			const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
			if (inFs && isPhoneScreen() && !orientationDrivenFs && screen.orientation?.lock) {
				try { screen.orientation.lock('landscape').catch(() => {}); } catch { /* unsupported */ }
			} else if (!inFs) {
				orientationDrivenFs = false;
				if (screen.orientation?.unlock) { try { screen.orientation.unlock(); } catch { /* unsupported */ } }
			}
		};
		document.addEventListener('fullscreenchange', onFsChange);
		document.addEventListener('webkitfullscreenchange', onFsChange);
		return () => {
			document.removeEventListener('fullscreenchange', onFsChange);
			document.removeEventListener('webkitfullscreenchange', onFsChange);
		};
	}, []);
	// #473 item 3: rotate the phone to landscape → fullscreen the playing video; rotate back to
	// portrait → exit. Best-effort: some mobile engines block programmatic fullscreen outside a
	// tap, but most (Chrome Android) treat the user's own rotate as a gesture. Unlike the
	// fullscreen button, this path leaves the orientation UNLOCKED so a rotate back can exit.
	useEffect(() => {
		const isLandscape = () => {
			const t = screen.orientation?.type || '';
			if (t) return t.startsWith('landscape');
			return typeof window.matchMedia === 'function' && window.matchMedia('(orientation: landscape)').matches;
		};
		const onOrient = () => {
			if (!isPhoneScreen()) return;
			const v = ref.current;
			const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement || pseudoFs);
			if (isLandscape()) {
				if (!inFs && v && !v.paused && !isMiniPlayer) {
					orientationDrivenFs = true;
					toggleFsRef.current?.();
				}
			} else if (inFs && orientationDrivenFs) {
				orientationDrivenFs = false;
				if (document.fullscreenElement || document.webkitFullscreenElement) {
					(document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
				}
				// Clear the CSS fallback too, not only real fullscreen: a rejected duplicate request
				// can leave both on, and exiting one of them pinned the player over the page.
				setPseudoFs(false);
			}
		};
		window.addEventListener('orientationchange', onOrient);
		screen.orientation?.addEventListener?.('change', onOrient);
		return () => {
			window.removeEventListener('orientationchange', onOrient);
			screen.orientation?.removeEventListener?.('change', onOrient);
		};
	}, [pseudoFs, isMiniPlayer]);
	// Keyboard controls act on the player only: ←/→ seek ∓5s, ↑/↓ volume ±5%.
	// Arrow keys never navigate to another video.
	useEffect(() => {
		const onKey = (e) => {
			const v = ref.current;
			if (!v) return;
			const t = e.target;
			if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return;
			switch (e.key) {
				case 'ArrowLeft':
					e.preventDefault();
					v.currentTime = Math.max(0, v.currentTime - 5);
					break;
				case 'ArrowRight':
					e.preventDefault();
					v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 5);
					break;
				case 'ArrowUp':
					e.preventDefault();
					v.muted = false;
					v.volume = Math.min(1, Math.round((v.volume + 0.05) * 100) / 100);
					break;
				case 'ArrowDown':
					e.preventDefault();
					v.volume = Math.max(0, Math.round((v.volume - 0.05) * 100) / 100);
					break;
				case ' ':
				case 'k': case 'K':
					// #270: k mirrors space (standard player shortcut) — play/pause.
					e.preventDefault();
					if (v.paused) v.play().catch(() => {}); else v.pause();
					break;
				case 'j': case 'J':
					// #270: jump back 10s (standard player shortcut).
					e.preventDefault();
					v.currentTime = Math.max(0, v.currentTime - 10);
					break;
				case 'l': case 'L':
					// #270: jump forward 10s (standard player shortcut).
					e.preventDefault();
					v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 10);
					break;
				case '<': case ',':
					// #270: slow down playback in 0.25 steps (min 0.25x).
					e.preventDefault();
					setSpeedRef.current?.(Math.max(0.25, Math.round((v.playbackRate - 0.25) * 100) / 100));
					break;
				case '>': case '.':
					// #270: speed up playback in 0.25 steps (max 2x).
					e.preventDefault();
					setSpeedRef.current?.(Math.min(2, Math.round((v.playbackRate + 0.25) * 100) / 100));
					break;
				case '0': case '1': case '2': case '3': case '4':
				case '5': case '6': case '7': case '8': case '9':
					// #270: seek to N*10% of the video (number-row seek).
					if (Number.isFinite(v.duration) && v.duration > 0) {
						e.preventDefault();
						v.currentTime = (Number(e.key) / 10) * v.duration;
					}
					break;
				case 'm': case 'M':
					e.preventDefault();
					v.muted = !v.muted;
					break;
				case 'f': case 'F':
					e.preventDefault();
					toggleFsRef.current?.();
					break;
				case 'Escape':
					if (showQualityMenuRef.current) {
						e.preventDefault();
						setShowQualityMenu(false);
						break;
					}
					setPseudoFs(false);
					break;
				default:
					break;
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);
	// #344 (best-effort): wire the MediaSession API so lock-screen / notification / OS
	// media controls (play, pause, ±10s seek, seek-to) drive the player. This is the
	// closest a web app can get to "keeps playing in the background" — actual background
	// <video> playback is blocked by mobile browsers, but audio + these controls persist
	// on browsers that honour MediaSession. No-ops where the API is absent.
	useEffect(() => {
		const ms = navigator.mediaSession;
		if (!ms) return undefined;
		try {
			if (window.MediaMetadata) {
				ms.metadata = new window.MediaMetadata({
					title: mediaTitle || 'Strug Video',
					artist: mediaArtist || 'Strug',
					artwork: poster ? [{ src: poster }] : [],
				});
			}
		} catch { /* metadata is best-effort */ }
		const v = () => ref.current;
		const handlers = [
			['play', () => v()?.play().catch(() => {})],
			['pause', () => v()?.pause()],
			['seekbackward', (d) => { const el = v(); if (el) el.currentTime = Math.max(0, el.currentTime - (d.seekOffset || 10)); }],
			['seekforward', (d) => { const el = v(); if (el) el.currentTime = Math.min(el.duration || Infinity, el.currentTime + (d.seekOffset || 10)); }],
			['seekto', (d) => {
				const el = v();
				if (!el || !Number.isFinite(d.seekTime)) return;
				el.currentTime = Math.min(Number.isFinite(el.duration) ? el.duration : d.seekTime, Math.max(0, d.seekTime));
			}],
		];
		if (onSkipNext) handlers.push(['nexttrack', onSkipNext]);
		if (onSkipPrevious) handlers.push(['previoustrack', onSkipPrevious]);
		handlers.forEach(([a, fn]) => { try { ms.setActionHandler(a, fn); } catch { /* unsupported action */ } });
		return () => { handlers.forEach(([a]) => { try { ms.setActionHandler(a, null); } catch { /* noop */ } }); };
	}, [src, poster, mediaTitle, mediaArtist, onSkipNext, onSkipPrevious]);
	// Resume after the browser pauses on lock/background (mobile). We cannot keep decoding while
	// hidden — OS policy — but restoring when the tab becomes visible again matches YouTube.
	useEffect(() => {
		let wasPlaying = false;
		const onVis = () => {
			const el = ref.current;
			if (!el) return;
			if (document.hidden) {
				wasPlaying = !el.paused && !el.ended;
			} else if (wasPlaying) {
				el.play().catch(() => {});
				wasPlaying = false;
			}
		};
		document.addEventListener('visibilitychange', onVis);
		return () => document.removeEventListener('visibilitychange', onVis);
	}, [src]);
	// Mirror the <video> element state into React for the custom controls.
	useEffect(() => {
		const v = ref.current;
		if (!v) return;
		const setMediaPlaybackState = (state) => { try { if (navigator.mediaSession) navigator.mediaSession.playbackState = state; } catch { /* unsupported */ } };
		const syncMediaPosition = () => {
			const ms = navigator.mediaSession;
			if (!ms?.setPositionState || !Number.isFinite(v.duration) || v.duration <= 0) return;
			try {
				ms.setPositionState({
					duration: v.duration,
					playbackRate: Number.isFinite(v.playbackRate) && v.playbackRate > 0 ? v.playbackRate : 1,
					position: Math.min(v.duration, Math.max(0, Number.isFinite(v.currentTime) ? v.currentTime : 0)),
				});
			} catch { /* position state is best-effort */ }
		};
		const onPlay = () => { setPaused(false); setMediaPlaybackState('playing'); syncMediaPosition(); };
		const onPause = () => { setPaused(true); setMediaPlaybackState('paused'); syncMediaPosition(); };
		const onTime = () => { setCur(v.currentTime || 0); syncMediaPosition(); };
		// Only trust a FINITE duration. hls.js fires durationchange early with Infinity (live/EVENT
		// manifest) or a partial value before the full playlist is parsed; storing that made the
		// scrub bar map clicks against a wrong total, so a long video seeked to ~2:01 (#318).
		const onDur = () => { if (Number.isFinite(v.duration) && v.duration > 0) setDur(v.duration); };
		const onVol = () => { setMuted(v.muted); setVol(v.muted ? 0 : v.volume); };
		const onRate = () => { setRate(v.playbackRate || 1); syncMediaPosition(); };
		const onProg = () => { try { if (v.buffered.length) setBuf(v.buffered.end(v.buffered.length - 1)); } catch { /* noop */ } };
		v.addEventListener('play', onPlay);
		v.addEventListener('pause', onPause);
		v.addEventListener('timeupdate', onTime);
		v.addEventListener('durationchange', onDur);
		v.addEventListener('loadedmetadata', onDur);
		v.addEventListener('volumechange', onVol);
		v.addEventListener('ratechange', onRate);
		v.addEventListener('progress', onProg);
		setPaused(v.paused); setMuted(v.muted); setVol(v.muted ? 0 : v.volume); setRate(v.playbackRate || 1); setDur(v.duration || 0);
		return () => {
			v.removeEventListener('play', onPlay);
			v.removeEventListener('pause', onPause);
			v.removeEventListener('timeupdate', onTime);
			v.removeEventListener('durationchange', onDur);
			v.removeEventListener('loadedmetadata', onDur);
			v.removeEventListener('volumechange', onVol);
			v.removeEventListener('ratechange', onRate);
			v.removeEventListener('progress', onProg);
		};
	}, []);
	// Controls auto-hide: always visible while paused or the settings panel is open; fade out
	// 3s after play starts. Hiding while the panel is open is what made Settings look broken —
	// the gear opened a menu, then the 3s timer faded the whole chrome (and the menu with it).
	useEffect(() => {
		clearTimeout(hideT.current);
		if (paused || showQualityMenu) { setCtrls(true); return undefined; }
		hideT.current = setTimeout(() => setCtrls(false), 3000);
		return () => clearTimeout(hideT.current);
	}, [paused, showQualityMenu]);
	useEffect(() => {
		if (!showQualityMenu) setSettingsPane('menu');
	}, [showQualityMenu]);
	// Desktop: clicking outside the player (related rail, meta) should close Settings. Mobile
	// already uses a full-viewport portal backdrop for the same job.
	useEffect(() => {
		if (!showQualityMenu || isMobile) return undefined;
		const onDown = (e) => {
			if (containerRef.current && !containerRef.current.contains(e.target)) setShowQualityMenu(false);
		};
		document.addEventListener('pointerdown', onDown);
		return () => document.removeEventListener('pointerdown', onDown);
	}, [showQualityMenu, isMobile]);
	const advanceToNextVideo = useCallback(() => {
		if (endScreenItems[0] && onSelectEndScreen) {
			onSelectEndScreen(endScreenItems[0]);
			return true;
		}
		if (autoplayNext) {
			autoplayNext();
			return true;
		}
		return false;
	}, [endScreenItems, onSelectEndScreen, autoplayNext]);
	// Autoplay countdown: tick down once a second; at zero, play the top suggestion
	// (falling back to the sequential queue when there are no recommendations).
	useEffect(() => {
		if (countdown == null) return;
		if (countdown <= 0) {
			setCountdown(null);
			advanceToNextVideo();
			return;
		}
		const t = setTimeout(() => setCountdown(c => (c == null ? null : c - 1)), 1000);
		return () => clearTimeout(t);
	}, [countdown, advanceToNextVideo]);
	function changeQuality(idx) {
		if (hlsRef.current) {
			hlsRef.current.currentLevel = idx;
		}
		setCurrentQuality(idx);
	}
	const unavailable = !src || loadError;
	// ── custom-controls helpers ──────────────────────────────────────────────
	const fmtT = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return (h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(ss).padStart(2, '0')}`; };
	const showCtrls = () => {
		setCtrls(true);
		clearTimeout(hideT.current);
		if (ref.current && !ref.current.paused && !showQualityMenu) hideT.current = setTimeout(() => setCtrls(false), 3000);
	};
	const tapToggle = () => {
		clearTimeout(hideT.current);
		setCtrls((c) => {
			const n = !c;
			if (n && ref.current && !ref.current.paused && !showQualityMenu) hideT.current = setTimeout(() => setCtrls(false), 3000);
			return n;
		});
	};
	const onSideTap = (side) => (e) => {
		if (e.pointerType === "mouse" && e.button !== 0) return;
		const now = Date.now();
		if (now - dblTapRef.current.t < 300 && dblTapRef.current.side === side) {
			e.preventDefault();
			clearTimeout(tapT.current);
			const v = ref.current;
			if (v) v.currentTime = side === "left" ? Math.max(0, v.currentTime - 10) : Math.min(v.duration || Infinity, v.currentTime + 10);
			setSeekFlash(side);
			setTimeout(() => setSeekFlash(null), 700);
			dblTapRef.current = { t: 0, side: null };
			return;
		}
		dblTapRef.current = { t: now, side };
		if (ref.current?.paused) {
			togglePlay();
			return;
		}
		clearTimeout(tapT.current);
		tapT.current = setTimeout(() => tapToggle(), 280);
	};
	const togglePlay = () => {
		const v = ref.current;
		if (!v) return;
		if (v.paused) {
			setPaused(false);
			v.play().catch(() => setPaused(true));
		} else {
			setPaused(true);
			v.pause();
		}
		showCtrls();
	};
	const onMobileTap = () => {
		if (ref.current?.paused) { togglePlay(); return; }
		tapToggle();
	};
	const toggleMute = (e) => { e?.stopPropagation?.(); const v = ref.current; if (!v) return; v.muted = !v.muted; showCtrls(); };
	const toggleFs = (e) => {
		e?.stopPropagation?.();
		const cont = containerRef.current, v = ref.current;
		try {
			if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document); }
			else if (pseudoFs) { setPseudoFs(false); try { screen.orientation?.unlock?.(); } catch { /* noop */ } }
			// Desktop + Android: real fullscreen on the CONTAINER keeps our custom controls.
			// The rotate path can fire twice for one turn (`orientationchange` and screen.orientation's
			// `change`), and the losing request rejects — which used to stack the CSS overlay on top
			// of a real fullscreen that was already up. Only fall back if nothing took.
			else if (cont?.requestFullscreen) { cont.requestFullscreen().catch(() => { if (document.fullscreenElement || document.webkitFullscreenElement) return; if (v?.webkitEnterFullscreen) v.webkitEnterFullscreen(); else setPseudoFs(true); }); }
			// iOS / iPadOS: element fullscreen isn't supported, so use the NATIVE video fullscreen —
			// it's the only path to TRUE fullscreen (hides Safari chrome) + auto-rotate to landscape.
			// Native controls show only while in fullscreen; our custom controls remain inline.
			else if (v?.webkitEnterFullscreen) { v.webkitEnterFullscreen(); }
			else if (cont?.webkitRequestFullscreen) { cont.webkitRequestFullscreen(); }
			else { setPseudoFs(true); } // last-resort only (very old browsers)
		} catch { setPseudoFs(true); }
		showCtrls();
	};
	toggleFsRef.current = toggleFs;
	const setVolume = (f) => { const v = ref.current; if (!v) return; f = Math.min(1, Math.max(0, f)); v.muted = f === 0; v.volume = f; setVol(f); setMuted(f === 0); };
	const onVolDown = (e) => { e.stopPropagation(); const at = (cx) => { const el = volRef.current; if (!el) return; const r = el.getBoundingClientRect(); setVolume((cx - r.left) / r.width); }; at(e.clientX); const mv = (ev) => at(ev.clientX); const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); showCtrls(); }; document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); };
	const setSpeed = (r) => {
		const next = Number(r);
		if (!Number.isFinite(next)) return;
		const clamped = Math.min(4, Math.max(0.25, next));
		const v = ref.current;
		if (v) v.playbackRate = clamped;
		rateRef.current = clamped;
		setRate(clamped);
		showCtrls();
	};
	setSpeedRef.current = setSpeed;
	const scrubAt = (clientX) => { const el = barRef.current, v = ref.current; if (!el || !v) return; const d = (Number.isFinite(v.duration) && v.duration > 0) ? v.duration : dur; if (!d || !Number.isFinite(d)) return; const r = el.getBoundingClientRect(); const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width)); lastScrubRef.current = Date.now(); v.currentTime = f * d; setCur(f * d); };
	const onBarDown = (e) => { e.stopPropagation(); scrubAt(e.clientX); const mv = (ev) => scrubAt(ev.clientX); const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); showCtrls(); }; document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); };
	const pct = dur ? (cur / dur) * 100 : 0;
	const bufPct = dur ? Math.min(100, (buf / dur) * 100) : 0;
	const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
	const ctlBtn = { width: isMobile ? 40 : 36, height: isMobile ? 40 : 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', flexShrink: 0, padding: 0 };
	const ctrlsOn = ctrls || paused || showQualityMenu;
	const speedValueLabel = (!Number.isFinite(rate) || rate === 1) ? '1x' : `${rate}x`;
	const qualityOptions = qualityLevels.length ? qualityLevels : [{ label: 'Auto', index: -1 }];
	const qualityValueLabel = currentQuality === -1
		? autoQualityLabel(autoHeight)
		: (qualityOptions.find((l) => l.index === currentQuality)?.label ?? 'Auto');
	const settingsIconWrap = { width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.78)', flexShrink: 0 };
	const settingsRowStyle = { display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: isMobile ? '13px 16px' : '11px 16px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 15 : 14, textAlign: 'left' };
	const settingsValueStyle = { color: 'rgba(255,255,255,0.5)', fontSize: isMobile ? 14 : 13, flexShrink: 0 };
	const settingsChoiceStyle = (selected) => ({ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: isMobile ? '12px 16px' : '10px 16px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 15 : 14, fontWeight: selected ? 700 : 400, textAlign: 'left' });
	const ChevronRight = () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>;
	const CheckMark = () => <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
	const applyCustomSpeed = (raw) => {
		const val = Number.parseFloat(raw);
		setSpeed(Number.isFinite(val) ? val : 1);
	};
	return (
		<div ref={containerRef} onMouseMove={!isMobile ? showCtrls : undefined} onMouseLeave={!isMobile ? () => { if (ref.current && !ref.current.paused) setCtrls(false); } : undefined} style={{ ...style, overflow: 'hidden', ...(pseudoFs ? { position: 'fixed', inset: 0, width: '100vw', height: '100dvh', zIndex: 9999, background: '#000', borderRadius: 0 } : null) }}>
			<div style={{ position: 'relative', width: '100%', height: '100%' }}>
				<video ref={ref} playsInline autoPlay={autoPlay} preload="metadata" loop={loop} onEnded={(e) => {
					// Honor a real end only. A scrub/seek — especially into an un-buffered region near
					// the tail — can fire a spurious 'ended' that wrongly showed the end screen (#145/#110).
					// Suppress it within the scrub debounce, while actively seeking, or when the playhead
					// hasn't actually reached the end.
					const v = e.currentTarget;
					if (Date.now() - lastScrubRef.current < 800) return;
					if (v && (v.seeking || (v.duration && v.currentTime < v.duration - 1.5))) return;
					setEnded(true);
					// Mobile completion remains a user choice: recommendations stay visible, but do not
					// consume data or battery by starting another video without an explicit action.
					if (!autoplayOn || isMobile || (!autoplayNext && !(endScreenItems[0] && onSelectEndScreen))) return;
					// Locked/backgrounded mobile browsers heavily throttle countdown timers. Advance
					// immediately there; retain the cancelable five-second end screen when visible.
					if (document.hidden) advanceToNextVideo();
					else setCountdown(5);
				}} controlsList="nodownload" poster={poster}
					onError={() => { if (src && !src.includes('.m3u8')) setLoadError(true); }}
					style={{ width: '100%', height: '100%', ...(isMiniPlayer ? { objectFit: 'cover' } : {}), borderRadius: style?.borderRadius ?? 0, background: '#000', display: unavailable ? 'none' : 'block' }} />
				{unavailable && hydrating && !loadError ? (
					// Up-Next / autoplay items don't carry a playable URL until getVideo() hydrates them.
					// During that brief fetch, show a loading spinner instead of the "still processing"
					// error copy, which wrongly implied a good video was un-transcoded (#163/#168).
					<div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#0d1421', borderRadius: style?.borderRadius ?? 0 }}>
						<div style={{ width: 34, height: 34, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.15)', borderTopColor: '#2563eb', animation: 'spin 0.8s linear infinite' }} />
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', margin: 0 }}>Loading…</p>
					</div>
				) : unavailable && (
					<div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#0d1421', borderRadius: style?.borderRadius ?? 0, padding: 24, textAlign: 'center' }}>
						<svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.75)', margin: 0 }}>{src ? "This video couldn't be loaded" : "This video is still processing"}</p>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: 0 }}>{src ? "Please try again in a moment." : "Check back shortly once transcoding completes."}</p>
					</div>
				)}
				{!unavailable && ended && !isMobile && !isMiniPlayer && (endScreenItems.length > 0 || countdown != null) && (
					<DesktopVideoEndScreen
						items={endScreenItems}
						countdown={countdown}
						onCancelCountdown={() => setCountdown(null)}
						onReplay={() => { setCountdown(null); const video = ref.current; if (video) { video.currentTime = 0; safePlay(video); } setEnded(false); }}
						onSelect={onSelectEndScreen}
					/>
				)}
				{!unavailable && ended && isMobile && !isMiniPlayer && (() => {
					const suggestion = endScreenItems[0] ?? null;
					return (
						<section data-testid="mobile-end-suggestion" aria-label="Suggested video" style={{ position: 'absolute', inset: 0, zIndex: 12, display: 'flex', flexDirection: 'column', padding: '10px 12px 11px', background: 'rgba(5,7,11,.96)', color: '#fff', overflow: 'hidden' }}>
							<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8, flexShrink: 0 }}>
								<h2 style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 15, lineHeight: 1.2, fontWeight: 700 }}>{suggestion ? 'Suggested video' : 'Video ended'}</h2>
								<button type="button" onClick={() => setEnded(false)} aria-label="Close suggested video" style={{ width: 30, height: 30, padding: 0, display: 'grid', placeItems: 'center', border: 0, borderRadius: '50%', background: 'rgba(255,255,255,.09)', color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
									<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
								</button>
							</div>
							{suggestion ? <div style={{ display: 'grid', gridTemplateColumns: 'minmax(112px, 42%) minmax(0, 1fr)', gap: 10, alignItems: 'center', minHeight: 0, flex: 1 }}>
								<div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', borderRadius: 9, background: 'linear-gradient(135deg,#1e3a5f,#0f172a)' }}>
									<SafeImage src={suggestion.thumb} alt="" loading="eager" decoding="async" style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} fallback={null} />
									{suggestion.duration && <span style={{ position: 'absolute', right: 5, bottom: 5, padding: '1px 4px', borderRadius: 3, background: 'rgba(0,0,0,.8)', fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700 }}>{suggestion.duration}</span>}
								</div>
								<div style={{ minWidth: 0 }}>
									<p style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.3, fontWeight: 700, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{suggestion.title}</p>
									<p style={{ margin: '5px 0 0', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'rgba(255,255,255,.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{suggestion.channel}</p>
								</div>
							</div> : <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}><p style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'rgba(255,255,255,.68)' }}>No suggestion is available right now.</p></div>}
							<div style={{ display: 'grid', gridTemplateColumns: suggestion ? '1fr 1fr' : '1fr', gap: 9, marginTop: 9, flexShrink: 0 }}>
								<button type="button" onClick={() => {
									if (!suggestion && ref.current) { ref.current.currentTime = 0; safePlay(ref.current); }
									setEnded(false);
								}} style={{ minHeight: 38, borderRadius: 999, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.09)', color: '#fff', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{suggestion ? 'Close' : 'Replay'}</button>
								{suggestion && <button type="button" onClick={() => onSelectEndScreen?.(suggestion)} style={{ minHeight: 38, borderRadius: 999, border: 0, background: '#fff', color: '#080a0f', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Play now</button>}
							</div>
						</section>
					);
				})()}
				{/* Tap surface (under the controls UI). Mobile: double-tap sides = seek ±10s,
				    single-tap = toggle controls. Pointer events so a mouse in a phone-sized
				    window (DevTools) still brings chrome back — touch-only handlers did not. */}
				{!unavailable && !isMiniPlayer && !ended && !hideChrome && isMobile && (
					<>
						{['left', 'right'].map(side => (
							<div key={side} onPointerUp={onSideTap(side)} style={{ position: 'absolute', [side]: 0, top: 0, width: '40%', height: '100%', zIndex: 4, touchAction: 'manipulation' }} />
						))}
						<div onClick={onMobileTap} style={{ position: 'absolute', left: '40%', top: 0, width: '20%', height: '100%', zIndex: 4 }} />
					</>
				)}
				{!unavailable && !isMiniPlayer && !ended && !isMobile && (
					<div onClick={togglePlay} style={{ position: 'absolute', inset: 0, zIndex: 4, cursor: 'pointer' }} />
				)}
				{isMobile && (
					<>
						{seekFlash && (
							<div style={{ position: 'absolute', [seekFlash === 'left' ? 'left' : 'right']: 0, top: 0, width: '40%', height: '100%', background: 'rgba(255,255,255,0.13)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, pointerEvents: 'none', zIndex: 5, borderRadius: seekFlash === 'left' ? '0 100px 100px 0' : '100px 0 0 100px' }}>
								{seekFlash === 'left'
									? <svg width={28} height={28} viewBox="0 0 24 24" fill="white"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
									: <svg width={28} height={28} viewBox="0 0 24 24" fill="white"><path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/></svg>
								}
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: '#fff' }}>{seekFlash === 'left' ? '−10s' : '+10s'}</span>
							</div>
						)}
					</>
				)}
				{/* Custom player controls (replaces native <video controls>). */}
				{!unavailable && !isMiniPlayer && !ended && !hideChrome && (
					<div style={{ position: 'absolute', inset: 0, zIndex: 7, pointerEvents: 'none', opacity: ctrlsOn ? 1 : 0, transition: 'opacity .2s ease' }}>
						{/* center play / pause */}
						<button onClick={(e) => { e.stopPropagation(); togglePlay(); }} aria-label={paused ? 'Play' : 'Pause'}
							style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: ctrlsOn ? 'auto' : 'none', width: isMobile ? 54 : 64, height: isMobile ? 54 : 64, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
							{paused
								? <svg width={isMobile ? 26 : 30} height={isMobile ? 26 : 30} viewBox="0 0 24 24" fill="#fff"><polygon points="6 4 20 12 6 20 6 4"/></svg>
								: <svg width={isMobile ? 26 : 30} height={isMobile ? 26 : 30} viewBox="0 0 24 24" fill="#fff"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>}
						</button>

						{/* bottom bar: scrubber + controls */}
						<div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: isMobile ? '28px 10px 10px' : '28px 14px 8px', background: 'linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0))', pointerEvents: ctrlsOn ? 'auto' : 'none' }}>
							<div ref={barRef} onPointerDown={onBarDown} style={{ position: 'relative', height: isMobile ? 22 : 16, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none' }}>
								<div style={{ position: 'absolute', left: 0, right: 0, height: isMobile ? 5 : 4, borderRadius: 2, background: 'rgba(255,255,255,0.28)' }} />
								<div style={{ position: 'absolute', left: 0, width: `${bufPct}%`, height: isMobile ? 5 : 4, borderRadius: 2, background: 'rgba(255,255,255,0.5)' }} />
								<div style={{ position: 'absolute', left: 0, width: `${pct}%`, height: isMobile ? 5 : 4, borderRadius: 2, background: '#2563eb' }} />
								<div style={{ position: 'absolute', left: `${pct}%`, width: isMobile ? 16 : 13, height: isMobile ? 16 : 13, marginLeft: isMobile ? -8 : -6.5, borderRadius: '50%', background: '#2563eb', boxShadow: '0 0 6px rgba(0,0,0,0.6)' }} />
							</div>
							<div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 12, marginTop: 2 }}>
								{onSkipNext && (
									<Tooltip text="Next" disabled={isMobile}>
										<button onClick={(e) => { e.stopPropagation(); onSkipNext(); }} aria-label="Next video" style={ctlBtn}>
											<svg width={20} height={20} viewBox="0 0 24 24" fill="#fff"><polygon points="5 4 15 12 5 20"/><rect x="16" y="4" width="3" height="16" rx="0.5"/></svg>
										</button>
									</Tooltip>
								)}
								<Tooltip text={muted ? 'Unmute' : 'Mute'} shortcut="m" disabled={isMobile}>
									<button onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} style={ctlBtn}>
										{(muted || vol === 0)
											? <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
											: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>{vol > 0.6 && <path d="M19 5a9 9 0 0 1 0 14"/>}</svg>}
									</button>
								</Tooltip>
								{/* Volume slider — desktop only (mobile uses the device volume buttons). */}
								{!isMobile && (
									<div ref={volRef} onPointerDown={onVolDown} style={{ position: 'relative', width: 70, height: 14, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none', flexShrink: 0 }}>
										<div style={{ position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.3)' }} />
										<div style={{ position: 'absolute', left: 0, width: `${(muted ? 0 : vol) * 100}%`, height: 4, borderRadius: 2, background: '#fff' }} />
										<div style={{ position: 'absolute', left: `${(muted ? 0 : vol) * 100}%`, width: 11, height: 11, marginLeft: -5.5, borderRadius: '50%', background: '#fff' }} />
									</div>
								)}
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 13.5 : 12, fontWeight: isMobile ? 700 : 400, color: '#fff', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', textShadow: isMobile ? '0 1px 6px rgba(0,0,0,0.7)' : undefined }}>{fmtT(cur)} / {fmtT(dur)}</span>
								<div style={{ flex: 1 }} />
								{/* Captions — greyed until a caption track exists (auto-caption pipeline). */}
								<button
									aria-label={i18n.t("videos.captionsUnavailable")}
									title={i18n.t("videos.captionsUnavailableHint")}
									disabled
									style={{ ...ctlBtn, width: isMobile ? 28 : "auto", padding: isMobile ? "2px 5px" : "2px 7px", opacity: 0.4, cursor: "not-allowed", border: "1px solid rgba(255,255,255,0.45)", borderRadius: 4, fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 10 : 11, fontWeight: 800, letterSpacing: "0.04em", color: "#fff", flexShrink: 0 }}
								>
									CC
								</button>
								{/* Settings: playback speed + quality (settings gear). */}
								<div style={{ position: 'relative', flexShrink: 0 }}>
									<Tooltip text="Settings" disabled={isMobile || showQualityMenu}>
									<button onClick={(e) => { e.stopPropagation(); setShowQualityMenu((open) => !open); setCtrls(true); clearTimeout(hideT.current); }} aria-label="Settings" style={ctlBtn}>
										<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
									</button>
									</Tooltip>
								</div>
								{/* #270: theater mode — desktop only; widens the player and collapses the
								    up-next rail. Handled by the parent watch page via onToggleTheater. */}
								{!isMiniPlayer && !isMobile && onToggleTheater && (
									<Tooltip text={theater ? 'Default view' : 'Theater mode'} disabled={isMobile}>
										<button onClick={(e) => { e.stopPropagation(); onToggleTheater(); showCtrls(); }} aria-label="Theater mode" style={ctlBtn}>
											<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/>{theater && <path d="M2 10h20"/>}</svg>
										</button>
									</Tooltip>
								)}
								<Tooltip text="Fullscreen" shortcut="f" disabled={isMobile}>
									<button onClick={toggleFs} aria-label="Fullscreen" style={ctlBtn}>
										<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
									</button>
								</Tooltip>
							</div>
						</div>
					</div>
				)}
				{/* Settings: YouTube-style rows. On a phone the 16:9 player is too short to
				    hold Quality/speed lists, so the sheet portals to the viewport. */}
				{!unavailable && !isMiniPlayer && !ended && !hideChrome && showQualityMenu && ((sheet) => (
					isMobile ? createPortal(sheet, document.body) : sheet
				))(
					<div
						role="dialog"
						aria-label="Settings"
						onClick={(e) => { e.stopPropagation(); setShowQualityMenu(false); }}
						style={{ position: isMobile ? 'fixed' : 'absolute', inset: 0, zIndex: isMobile ? 10050 : 16, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', pointerEvents: 'auto' }}
					>
						<div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxHeight: isMobile ? '70vh' : '92%', overflowY: 'auto', background: 'rgba(28,28,28,0.98)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: isMobile ? '14px 14px 0 0' : 12, padding: '8px 0 10px', margin: isMobile ? 0 : 12 }}>
							<div style={{ display: 'flex', alignItems: 'center', padding: '2px 10px 8px' }}>
								{settingsPane !== 'menu' ? (
									<button type="button" onClick={() => setSettingsPane('menu')} aria-label="Back" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 6, display: 'flex' }}>
										<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
									</button>
								) : <span style={{ width: 30 }} />}
								<div style={{ flex: 1, textAlign: 'center', color: '#fff', fontSize: isMobile ? 15 : 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>
									{settingsPane === 'speed' ? 'Playback speed' : settingsPane === 'quality' ? 'Quality' : 'Settings'}
								</div>
								<button type="button" onClick={() => setShowQualityMenu(false)} aria-label="Close settings" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 6, display: 'flex' }}>
									<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
								</button>
							</div>
							{settingsPane === 'menu' && (
								<>
									<button type="button" aria-label="Quality" onClick={(e) => { e.stopPropagation(); setSettingsPane('quality'); }} style={settingsRowStyle}>
										<span style={settingsIconWrap}><svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg></span>
										<span style={{ flex: 1 }}>Quality</span>
										<span style={settingsValueStyle}>{qualityValueLabel}</span>
										<ChevronRight />
									</button>
									<button type="button" aria-label="Playback speed" onClick={(e) => { e.stopPropagation(); setSettingsPane('speed'); }} style={settingsRowStyle}>
										<span style={settingsIconWrap}><svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" strokeDasharray="3.5 3"/><polygon points="10 8 16 12 10 16" fill="currentColor" stroke="none"/></svg></span>
										<span style={{ flex: 1 }}>Playback speed</span>
										<span style={settingsValueStyle}>{speedValueLabel}</span>
										<ChevronRight />
									</button>
									<button type="button" aria-label="Loop" onClick={(e) => { e.stopPropagation(); setLoop((l) => !l); }} style={settingsRowStyle}>
										<span style={settingsIconWrap}><svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></span>
										<span style={{ flex: 1 }}>Loop</span>
										<span style={settingsValueStyle}>{loop ? 'On' : 'Off'}</span>
									</button>
									{onToggleAutoplay && (
										<button type="button" aria-label="Autoplay" onClick={(e) => { e.stopPropagation(); onToggleAutoplay(); }} style={settingsRowStyle}>
											<span style={settingsIconWrap}><svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg></span>
											<span style={{ flex: 1 }}>Autoplay</span>
											<span style={settingsValueStyle}>{autoplayOn ? 'On' : 'Off'}</span>
										</button>
									)}
								</>
							)}
							{settingsPane === 'speed' && (
								<>
									{SPEEDS.map((s) => {
										const selected = Number.isFinite(rate) && Math.abs(rate - s) < 0.001;
										return (
											<button key={s} type="button" onClick={(e) => { e.stopPropagation(); setSpeed(s); }} style={settingsChoiceStyle(selected)}>
												<span style={{ width: 22, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>{selected ? <CheckMark /> : null}</span>
												{s === 1 ? 'Normal' : `${s}x`}
											</button>
										);
									})}
									<div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 4px' }}>
										<span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Custom</span>
										<input key={rate} type="number" min={0.25} max={4} step={0.05} defaultValue={rate}
											aria-label="Custom playback speed"
											onClick={(e) => e.stopPropagation()}
											onKeyDown={(e) => { if (e.key === 'Enter') { applyCustomSpeed(e.target.value); e.target.blur(); } }}
											onBlur={(e) => applyCustomSpeed(e.target.value)}
											style={{ width: 58, padding: '5px 8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 7, color: '#fff', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, outline: 'none' }} />
										<span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>×</span>
									</div>
								</>
							)}
							{settingsPane === 'quality' && qualityOptions.map((l) => {
								const selected = currentQuality === l.index;
								return (
									<button key={l.index} type="button" onClick={(e) => { e.stopPropagation(); changeQuality(l.index); }} style={settingsChoiceStyle(selected)}>
										<span style={{ width: 22, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>{selected ? <CheckMark /> : null}</span>
										{l.label}
									</button>
								);
							})}
						</div>
					</div>
				)}
				{!unavailable && !isMiniPlayer && !ended && !hideChrome && rate !== 1 && (
					<div aria-hidden="true" style={{ position: 'absolute', top: isMobile ? 8 : 10, right: 10, zIndex: 8, padding: '4px 8px', borderRadius: 8, background: 'rgba(0,0,0,0.62)', border: '1px solid rgba(255,255,255,0.16)', color: '#fff', fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 12 : 11, fontWeight: 800, letterSpacing: '0.04em', pointerEvents: 'none' }}>
						{`${rate}x`}
					</div>
				)}
				{!unavailable && !isMiniPlayer && !ended && !hideChrome && isMobile && muted && !ctrlsOn && (
					<button type="button" onClick={toggleMute} aria-label="Unmute" style={{ position: 'absolute', left: 8, bottom: 10, zIndex: 8, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: 'rgba(0,0,0,0.62)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700 }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
						Muted
					</button>
				)}
			</div>
		</div>
	);
}

/* Reusable search box with a two-pane suggestions dropdown:
   left = phrase autocomplete (/video/suggest), right = top video previews.
   Shared by the watch-page header and the Videos browse page. */
// ── Recent-search history (client-side, localStorage) ─────────────────────────
// Per-device search history: most-recent-first, deduped case-insensitively,
// capped at SEARCH_HISTORY_MAX. Surfaced in the SearchSuggestBox dropdown (clock icon +
// remove ×) on focus/empty, and blended above the server phrase suggestions while typing.
// A backend per-user store is a sensible follow-up; this keeps it zero-dependency for now.
const SEARCH_HISTORY_KEY = "strug_search_history";
const SEARCH_HISTORY_MAX = 10;
function loadSearchHistory() {
	try { const a = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || "[]"); return Array.isArray(a) ? a.filter(x => typeof x === "string") : []; }
	catch { return []; }
}
function saveSearchHistory(list) {
	try { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list.slice(0, SEARCH_HISTORY_MAX))); } catch { /* quota / private mode — non-fatal */ }
	return list.slice(0, SEARCH_HISTORY_MAX);
}
function pushSearchHistory(q) {
	const v = (q || "").trim(); if (!v) return loadSearchHistory();
	const next = [v, ...loadSearchHistory().filter(h => h.toLowerCase() !== v.toLowerCase())];
	return saveSearchHistory(next);
}
function removeSearchHistory(q) {
	return saveSearchHistory(loadSearchHistory().filter(h => h.toLowerCase() !== (q || "").toLowerCase()));
}
const ClockIcon = ({ s = 15 }) => (
	<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
);
const SearchGlyph = ({ s = 17 }) => (
	<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
);
const VideoGlyph = ({ s = 17 }) => (
	<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="14" height="14" rx="3"/><path d="m22 8-6 4 6 4V8Z"/></svg>
);

/**
 * One row of the search dropdown.
 *
 * The dropdown used to be two columns — a phrase list beside a "You might like" preview pane —
 * with "Recent"/"Creators" headings inside it. It is a single flat list now: every row is
 * icon · text · optional thumbnail, which is what the reference behaves like and what reads
 * cleanly at 375px, where a side pane never had room in the first place.
 */
function SearchRow({ icon, text, secondary, thumb, active, onHover, onPick, onRemove, removeLabel }) {
	return (
		<div
			onMouseEnter={onHover}
			style={{
				display: "flex", alignItems: "center", gap: 14, width: "100%",
				padding: "9px 16px", cursor: "pointer",
				background: active ? "var(--color-surface)" : "none",
			}}
		>
			<button
				type="button"
				onMouseDown={(e) => { e.preventDefault(); onPick?.(); }}
				style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", color: "inherit", font: "inherit", padding: 0, cursor: "pointer" }}
			>
				<span className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{icon}</span>
				<span style={{ minWidth: 0 }}>
					<span className="text-text-primary" style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>
					{secondary && (
						<span className="text-text-secondary" style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{secondary}</span>
					)}
				</span>
			</button>
			{thumb && (
				// Thumbnail is video media — stays dark regardless of theme.
				<div
					aria-hidden="true"
					style={{
						width: 54, height: 31, borderRadius: 4, flexShrink: 0,
						...(thumb.startsWith("http")
							? { backgroundImage: `url(${thumb})`, backgroundSize: "cover", backgroundPosition: "center" }
							: { background: "linear-gradient(135deg,#1e3a5f,#0f2744)" }),
					}}
				/>
			)}
			{onRemove && (
				<button
					type="button"
					aria-label={removeLabel}
					onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
					className="text-text-muted"
					style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
				>×</button>
			)}
		</div>
	);
}

function SearchSuggestBox({ value, onChange, onSubmit, onPickVideo, onPickChannel, isMobile, placeholder }) {
	const [suggestions, setSuggestions] = useState([]);
	const [vids, setVids] = useState([]);
	const [channels, setChannels] = useState([]);
	const [history, setHistory] = useState(loadSearchHistory);
	const [open, setOpen] = useState(false);
	const [hi, setHi] = useState(-1);
	const wrapRef = useRef(null);
	useEffect(() => {
		const q = (value || "").trim();
		if (q.length < 2) { setSuggestions([]); setVids([]); setChannels([]); return; }
		let alive = true;
		const t = setTimeout(() => {
			suggestVideos(q).then((r) => {
				if (!alive) return;
				setSuggestions(Array.isArray(r?.suggestions) ? r.suggestions.slice(0, 8) : []);
				setVids(Array.isArray(r?.videos) ? r.videos.map(mapApiVideo).slice(0, 3) : []);
				setChannels(Array.isArray(r?.channels) ? r.channels.slice(0, 3) : []);
				setHi(-1);
			}).catch(() => { if (alive) { setSuggestions([]); setVids([]); setChannels([]); } });
		}, 180);
		return () => { alive = false; clearTimeout(t); };
	}, [value]);
	const submit = (q) => { const v = (q ?? value).trim(); if (v) { setOpen(false); setHistory(pushSearchHistory(v)); onSubmit?.(v); } };
	const q = (value || "").trim();
	const ql = q.toLowerCase();
	// History rows: full list on focus/empty; while typing, matches that aren't already the
	// exact query or a duplicate of a server suggestion (so we don't show the same phrase twice).
	const sugLower = new Set(suggestions.map(s => s.toLowerCase()));
	const histRows = (q.length === 0
		? history.slice(0, 8)
		: history.filter(h => { const hl = h.toLowerCase(); return hl.includes(ql) && hl !== ql && !sugLower.has(hl); }).slice(0, 3));
	// Combined text-row list for keyboard nav (history first, then server phrases).
	const navRows = [...histRows.map(h => ({ kind: "hist", text: h })), ...suggestions.map(s => ({ kind: "sug", text: s }))];
	const removeHist = (h) => setHistory(removeSearchHistory(h));
	// A phrase that is exactly a video title gets that video's thumbnail on its row, and picking the
	// row opens the video instead of running the search — which is what the removed preview pane
	// used to be for. /video/suggest returns the titles, so the match is a plain lookup.
	const videoByTitle = useMemo(() => {
		const m = new Map();
		vids.forEach((v) => {
			const t = String(v?.title || "").trim().toLowerCase();
			if (t && !m.has(t)) m.set(t, v);
		});
		return m;
	}, [vids]);
	const videoFor = (text) => videoByTitle.get(String(text || "").trim().toLowerCase()) || null;
	// Videos with no phrase row of their own — see the render comment. Capped at 3, which is what
	// the removed preview pane showed.
	const extraVideoRows = useMemo(() => {
		const shown = new Set([...histRows, ...suggestions].map((t) => String(t || "").trim().toLowerCase()));
		return vids.filter((v) => !shown.has(String(v?.title || "").trim().toLowerCase())).slice(0, 3);
	}, [vids, histRows, suggestions]);
	const pickPhrase = (text) => {
		const v = videoFor(text);
		if (v) { setOpen(false); onPickVideo?.(v); return; }
		onChange(text);
		submit(text);
	};
	const showDrop = open && (navRows.length > 0 || vids.length > 0 || channels.length > 0 || q.length >= 2);
	// Compute dropdown position at render time (getBoundingClientRect is a read — safe in render).
	// Avoids a separate state/effect for rect that would lag one frame behind the open toggle.
	const rect = showDrop && wrapRef.current ? wrapRef.current.getBoundingClientRect() : null;
	return (
		<div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
			<div className="od-search-wrap">
				{/* The border is set here rather than on `.od-search-inner` because that class is shared
				    by ~29 other vertical pages — this keeps the outline to Videos. It sits just inside
				    the rotating conic-gradient sweep on `.od-search-wrap::before`, which is untouched. */}
				<form onSubmit={(e) => { e.preventDefault(); submit(hi >= 0 && navRows[hi] ? navRows[hi].text : value); }} className="od-search-inner bg-surface" style={{  display: "flex", alignItems: "center", padding: isMobile ? "9px 14px" : "11px 16px", gap: 10, border: "2px solid var(--color-border)" }}>
					<div className="text-text-secondary" style={{  flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={isMobile ? 17 : 19} /></div>
					<input value={value}
						onChange={(e) => { onChange(e.target.value); setOpen(true); }}
						onFocus={() => setOpen(true)}
						onBlur={() => setTimeout(() => setOpen(false), 150)}
						onKeyDown={(e) => {
							if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((i) => Math.min(i + 1, navRows.length - 1)); }
							else if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(i - 1, -1)); }
							else if (e.key === "Escape") { setOpen(false); setHi(-1); }
						}}
						placeholder={placeholder}
						className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none",  fontSize: isMobile ? 14 : 15, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb", minWidth: 0 }} />
					{value && (
						// Circular hit target rather than a bare "×" glyph: the old one was a 16px
						// character with no padding, which is well under a comfortable tap size.
						<button
							type="button"
							onClick={() => { onChange(""); setSuggestions([]); setVids([]); setChannels([]); }}
							aria-label="Clear"
							className="text-text-secondary bg-wash-2 hover:bg-wash-3 hover:text-text-primary"
							style={{
								flexShrink: 0, width: 30, height: 30, borderRadius: "50%",
								border: "none", padding: 0, cursor: "pointer",
								display: "flex", alignItems: "center", justifyContent: "center",
								transition: "background-color 0.15s, color 0.15s",
							}}
						>
							<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
								<path d="M18 6 6 18M6 6l12 12" />
							</svg>
						</button>
					)}
				</form>
			</div>
			{/* Portal to body — the search box lives inside a fadeUp animated div that creates a
			    stacking context, causing the dropdown to render under the sibling category row.
			    position:fixed with measured coordinates escapes the stacking context. (bug #108) */}
			{showDrop && rect && createPortal(
				<div className="bg-surface-raised border border-border" style={{ position: "fixed", top: rect.bottom + 6, left: rect.left, width: rect.width, borderRadius: 12, zIndex: 9999, boxShadow: "0 16px 44px var(--color-shadow)", maxHeight: "66vh", overflowY: "auto", padding: "6px 0" }}>
					{histRows.map((h, i) => (
						<SearchRow
							key={`h${h}`}
							icon={<ClockIcon s={17} />}
							text={h}
							thumb={videoFor(h)?.thumb}
							active={i === hi}
							onHover={() => setHi(i)}
							onPick={() => pickPhrase(h)}
							onRemove={() => removeHist(h)}
							removeLabel={`Remove ${h} from history`}
						/>
					))}
					{suggestions.map((s, i) => {
						const ni = histRows.length + i; // index within navRows, for keyboard highlight
						return (
							<SearchRow
								key={`s${s}`}
								icon={<SearchGlyph s={17} />}
								text={s}
								thumb={videoFor(s)?.thumb}
								active={ni === hi}
								onHover={() => setHi(ni)}
								onPick={() => pickPhrase(s)}
							/>
						);
					})}
					{channels.map((ch) => (
						<SearchRow
							key={`c${ch.channel_id}`}
							icon={(
								<SafeImage
									src={ch.profile_pic_url}
									alt={ch.display_name}
									style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover" }}
									fallback={<div style={{ width: 26, height: 26, borderRadius: "50%", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#fff" }}>{(ch.display_name || "?")[0].toUpperCase()}</div>}
								/>
							)}
							text={ch.display_name}
							secondary={`@${ch.handle}`}
							onPick={() => { setOpen(false); onPickChannel?.(ch); }}
						/>
					))}
					{/* Videos the phrase rows didn't already cover. /video/suggest matches titles that
					    START WITH the query for its phrase list, but its video list also matches
					    anywhere in the title or the description — so a video found by its description
					    has no phrase row to hang a thumbnail on. Those used to live in the removed
					    "You might like" pane; they are rows in the same column now rather than lost. */}
					{extraVideoRows.map((v) => (
						<SearchRow
							key={`v${v.id ?? v.videoId ?? v.title}`}
							icon={<VideoGlyph s={17} />}
							text={v.title}
							secondary={v.channel}
							thumb={v.thumb}
							onPick={() => { setOpen(false); onPickVideo?.(v); }}
						/>
					))}
					{navRows.length === 0 && channels.length === 0 && extraVideoRows.length === 0 && q.length >= 2 && (
						<div className="text-text-secondary" style={{ padding: "12px 16px", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Press Enter to search &quot;{value}&quot;</div>
					)}
				</div>,
				document.body
			)}
		</div>
	);
}


/**
 * The share dialog — WhatsApp/X/Facebook/LinkedIn/Reddit/Email, the copyable link and the optional
 * start timestamp. Lifted out of VideoWatchPage unchanged so the card menus open the same thing
 * rather than a second, lesser version of it.
 *
 * `startAtSec` is the playback position to offer; cards pass none, since a grid has no position.
 */
function VideoShareDialog({ video, startAtSec = 0, onClose }) {
	const [shareCopied, setShareCopied] = useState(false);
	const [embedCopied, setEmbedCopied] = useState(false);
	const [shareStartAt, setShareStartAt] = useState(false);
	const [chatSearch, setChatSearch] = useState("");
	const [chatTargets, setChatTargets] = useState([]);
	const [chatLoading, setChatLoading] = useState(true);
	const [sentByKey, setSentByKey] = useState({});
	const shareStartSec = startAtSec;
	const videoUrl = videoPath(video) ? `${window.location.origin}${videoPath(video)}` : "";
	const embedTok = video?.public_id || video?.video_id || video?.id;
	const embedUrl = embedTok != null ? `${window.location.origin}/embed/v/${embedTok}` : "";
	// URL actually shared/copied — appends a start timestamp when the user opts in.
	const shareUrl = shareStartAt && shareStartSec > 0
		? `${videoUrl}${videoUrl.includes("?") ? "&" : "?"}t=${shareStartSec}`
		: videoUrl;
	const sharePayload = useMemo(
		() => buildVideoSharePayload({ video, shareUrl }),
		[video, shareUrl],
	);
	const filteredTargets = useMemo(
		() => filterShareTargets(chatTargets, chatSearch),
		[chatTargets, chatSearch],
	);
	useEffect(() => {
		let alive = true;
		setChatLoading(true);
		getMyConversations()
			.then((data) => {
				if (!alive) return;
				const rows = Array.isArray(data) ? data : (data?.channels ?? data?.data ?? []);
				setChatTargets(mapConversationsToShareTargets(rows));
			})
			.catch(() => { if (alive) setChatTargets([]); })
			.finally(() => { if (alive) setChatLoading(false); });
		return () => { alive = false; };
	}, []);
	const fmtTime = (s) => { const m = Math.floor(s / 60), sec = s % 60; return `${m}:${String(sec).padStart(2, "0")}`; };
	const copyShareUrl = () => { navigator.clipboard?.writeText(shareUrl); setShareCopied(true); setTimeout(() => setShareCopied(false), 1800); };
	const copyEmbedUrl = () => {
		if (!embedUrl) return;
		navigator.clipboard?.writeText(embedUrl);
		setEmbedCopied(true);
		setTimeout(() => setEmbedCopied(false), 1800);
	};
	const sendToChat = async (target) => {
		const key = String(target.channelId);
		if (sentByKey[key] === "sending" || sentByKey[key] === "done") return;
		setSentByKey((v) => ({ ...v, [key]: "sending" }));
		try {
			let channelId = target.channelId;
			if (target.userId != null && (channelId == null || Number.isNaN(Number(channelId)))) {
				const channel = await openDmChannel(target.userId, { sourceVertical: "videos" });
				channelId = channel?.channel_id ?? channel?.id ?? channel?.data?.channel_id;
			}
			if (channelId == null) throw new Error("no channel");
			await sendMessage(channelId, sharePayload.content, "text", undefined, sharePayload.metadata);
			setSentByKey((v) => ({ ...v, [key]: "done" }));
		} catch {
			setSentByKey((v) => ({ ...v, [key]: "failed" }));
		}
	};
	const SHARE_TARGETS = [
		{ key: "whatsapp", label: "WhatsApp",   bg: "#25D366", href: `https://wa.me/?text=${encodeURIComponent((video.title ? video.title + " " : "") + shareUrl)}`, icon: <svg width={22} height={22} viewBox="0 0 24 24" fill="#fff"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.04 21.5h-.01a9.45 9.45 0 0 1-4.82-1.32l-.35-.2-3.58.94.96-3.49-.23-.36a9.46 9.46 0 0 1-1.45-5.04c0-5.22 4.25-9.47 9.48-9.47 2.53 0 4.91.99 6.7 2.78a9.42 9.42 0 0 1 2.77 6.7c0 5.22-4.25 9.47-9.47 9.47z"/></svg> },
		{ key: "x",        label: "X",          bg: "#000", href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(video.title ?? "")}`, icon: <svg width={19} height={19} viewBox="0 0 24 24" fill="#fff"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
		{ key: "facebook", label: "Facebook",   bg: "#1877F2", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, icon: <svg width={22} height={22} viewBox="0 0 24 24" fill="#fff"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg> },
		{ key: "linkedin", label: "LinkedIn",   bg: "#0A66C2", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="#fff"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.8 0 0 .78 0 1.74v20.52C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.74V1.74C24 .78 23.2 0 22.22 0z"/></svg> },
		{ key: "reddit",   label: "Reddit",     bg: "#FF4500", href: `https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(video.title ?? "")}`, icon: <svg width={22} height={22} viewBox="0 0 24 24" fill="#fff"><path d="M24 11.78c0-1.43-1.16-2.59-2.59-2.59-.7 0-1.33.28-1.79.73-1.78-1.28-4.23-2.1-6.94-2.2l1.18-5.56 3.85.82a1.84 1.84 0 1 0 .19-.9l-4.3-.91a.45.45 0 0 0-.53.35l-1.32 6.2c-2.76.08-5.25.9-7.05 2.2a2.59 2.59 0 1 0-2.86 4.23 5.3 5.3 0 0 0-.06.79c0 4.01 4.67 7.26 10.43 7.26s10.43-3.25 10.43-7.26c0-.27-.02-.53-.06-.79A2.6 2.6 0 0 0 24 11.78zM6.33 13.62a1.84 1.84 0 1 1 3.68 0 1.84 1.84 0 0 1-3.68 0zm10.25 4.85c-1.25 1.25-3.64 1.34-4.34 1.34-.7 0-3.1-.09-4.34-1.34a.47.47 0 0 1 .67-.67c.79.79 2.48.96 3.67.96 1.2 0 2.89-.17 3.68-.96a.47.47 0 0 1 .66 0 .48.48 0 0 1 0 .67zm-.31-3a1.84 1.84 0 1 1 0-3.69 1.84 1.84 0 0 1 0 3.68z"/></svg> },
		{ key: "email",    label: "Email",      bg: "#374151", href: `mailto:?subject=${encodeURIComponent(video.title ?? "Strug Video")}&body=${encodeURIComponent(shareUrl)}`, icon: <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg> },
	];
	return createPortal(
		<div onClick={() => onClose()} style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.62)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "fadeUp 0.16s ease both" }}>
			<div onClick={e => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ width: "min(560px, 100%)", maxHeight: "min(86vh, 720px)", borderRadius: 20, boxShadow: "0 24px 80px var(--color-shadow)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 4px", flexShrink: 0 }}>
					<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 24, letterSpacing: "0.04em", textTransform: "uppercase",  margin: 0 }}>{i18n.t("common.share")}</h3>
					<button onClick={() => onClose()} aria-label={i18n.t("common.close")} className="bg-surface border border-border text-text-secondary" style={{ width: 34, height: 34, borderRadius: "50%",    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
						<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
					</button>
				</div>
				<div style={{ padding: "12px 24px 0", flexShrink: 0 }}>
					<div className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{i18n.t("videos.shareOnStrug")}</div>
					<div className="bg-surface border border-border-subtle" style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
						<input
							value={chatSearch}
							onChange={(e) => setChatSearch(e.target.value)}
							placeholder={i18n.t("videos.shareSearchChats")}
							className="text-text-primary"
							style={{ flex: 1, background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}
						/>
					</div>
				</div>
				<div style={{ padding: "0 16px 8px", overflowY: "auto", flex: "1 1 auto", minHeight: 0, maxHeight: 220 }}>
					{chatLoading ? (
						<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: "12px 8px", margin: 0 }}>{i18n.t("common.loading")}</p>
					) : filteredTargets.length === 0 ? (
						<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: "12px 8px", margin: 0 }}>{i18n.t("videos.shareNoChats")}</p>
					) : (
						<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px 8px", padding: "8px 0 4px" }}>
							{filteredTargets.map((t) => {
								const key = String(t.channelId);
								const state = sentByKey[key];
								const done = state === "done";
								const label = done
									? i18n.t("videos.shareSent")
									: state === "failed"
										? i18n.t("common.retry")
										: t.name;
								return (
									<button
										key={key}
										type="button"
										onClick={() => sendToChat(t)}
										disabled={state === "sending"}
										style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "none", border: "none", cursor: state === "sending" ? "default" : "pointer", opacity: state === "sending" ? 0.55 : 1, padding: 0, minWidth: 0 }}
									>
										<div style={{ position: "relative" }}>
											<div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #2563eb, var(--color-surface))", border: done ? "2px solid #2563eb" : state === "failed" ? "2px solid #ef4444" : "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#fff" }}>
												{t.avatarUrl
													? <SafeImage src={t.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} fallback={t.initials} />
													: t.initials}
											</div>
											{done && (
												<div style={{ position: "absolute", bottom: 0, right: 0, width: 18, height: 18, borderRadius: "50%", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--color-surface-raised)" }}>
													<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><polyline points="20 6 9 17 4 12"/></svg>
												</div>
											)}
										</div>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 500, color: done ? "#2563eb" : state === "failed" ? "#ef4444" : "var(--color-text-primary)", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>{label}</span>
									</button>
								);
							})}
						</div>
					)}
				</div>
				<div className="strug-share-row" style={{ display: "flex", gap: 18, overflowX: "auto", padding: "10px 24px 18px", scrollbarWidth: "thin", flexShrink: 0, borderTop: "1px solid var(--color-border-subtle)" }}>
					{SHARE_TARGETS.map(t => (
						<button key={t.key} onClick={() => { if (t.href) window.open(t.href, "_blank", "noopener,noreferrer"); else if (t.onClick) t.onClick(); }} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", minWidth: 60, flexShrink: 0 }}>
							<span style={{ width: 56, height: 56, borderRadius: "50%", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.15s, box-shadow 0.15s" }}
								onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 20px -6px rgba(0,0,0,0.7)"; }}
								onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
								{t.icon}
							</span>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{t.label}</span>
						</button>
					))}
				</div>
				<div style={{ padding: "0 24px", flexShrink: 0 }}>
					<div className="bg-bg border border-border" style={{ display: "flex", alignItems: "center", gap: 10,   borderRadius: 14, padding: "6px 6px 6px 16px" }}>
						<span className="text-text-secondary" style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 13,  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shareUrl}</span>
						<button onClick={copyShareUrl} style={{ flexShrink: 0, padding: "9px 22px", borderRadius: 10, background: shareCopied ? "#2563eb" : "var(--color-surface-raised)", border: "1px solid " + (shareCopied ? "#2563eb" : "var(--color-border)"), color: shareCopied ? "#fff" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}>{shareCopied ? i18n.t("videos.shareCopied") : i18n.t("videos.shareCopy")}</button>
					</div>
					{embedUrl ? (
						<div className="bg-bg border border-border" style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 14, padding: "6px 6px 6px 16px", marginTop: 10 }}>
							<span className="text-text-secondary" style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{embedUrl}</span>
							<button type="button" onClick={copyEmbedUrl} style={{ flexShrink: 0, padding: "9px 14px", borderRadius: 10, background: embedCopied ? "#2563eb" : "var(--color-surface-raised)", border: "1px solid " + (embedCopied ? "#2563eb" : "var(--color-border)"), color: embedCopied ? "#fff" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}>{embedCopied ? i18n.t("videos.shareCopied") : i18n.t("videos.shareCopyEmbed")}</button>
						</div>
					) : null}
				</div>
				<button onClick={() => setShareStartAt(v => !v)} disabled={shareStartSec <= 0} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", margin: "18px 0 0", padding: "16px 24px", background: "none", border: "none", borderTop: "1px solid var(--color-border-subtle)", cursor: shareStartSec > 0 ? "pointer" : "default", textAlign: "left", opacity: shareStartSec > 0 ? 1 : 0.45, flexShrink: 0 }}>
					<span style={{ width: 20, height: 20, borderRadius: 6, border: "2px solid " + (shareStartAt ? "#2563eb" : "var(--color-border)"), background: shareStartAt ? "#2563eb" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
						{shareStartAt && <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
					</span>
					<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{i18n.t("videos.shareStartAt", { time: fmtTime(shareStartSec) })}</span>
				</button>
			</div>
		</div>
	, document.body);
}

/**
 * Vertical space the watch page needs around the player — breadcrumb, the back/search row, the page
 * padding and enough of the title to see below the video. Subtracted from the viewport to decide how
 * wide the player column may be. One number to turn if the player wants to sit higher or lower.
 */
// Clips per shelf. Ten is enough that the row still scrolls on a wide screen, and several shelves
// down the page still get a different set each.
// Distance from the bottom of the page area, which on a phone already stops above the app's own
// nav bar. Measured, not assumed: an ancestor establishes the containing block, so adding the
// nav's own height here again left the strip floating with a gap under it.
// Tab-bar dock (bell + Messages FAB sit at this bottom offset in App.jsx on Videos). The phone PiP
// sits one FAB-height above that so it does not cover Messages.
const MOBILE_MINI_BOTTOM_PX = VIDEOS_MOBILE_DOCK_BOTTOM;
const MOBILE_FAB_CLEAR_PX = 10;
const MOBILE_PIP_W = 176;
const MOBILE_PIP_H = 99;
const MOBILE_PIP_CHIP = {
	width: 26,
	height: 26,
	borderRadius: "50%",
	background: "rgba(0,0,0,0.55)",
	border: "1px solid rgba(255,255,255,0.18)",
	color: "#fff",
	cursor: "pointer",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	padding: 0,
	backdropFilter: "blur(10px)",
	WebkitBackdropFilter: "blur(10px)",
};

const CLIPS_PER_SHELF = 10;
// Rows of video cards between one clips shelf and the next, cycled rather than drawn at random:
// the spacing should look uneven, but a shelf that jumps to a new place on every render moves the
// clip the viewer was reaching for. Four across is what the grid gives on a desktop width.
const CLIP_SHELF_ROW_GAPS = [3, 5, 4];
const CARDS_PER_ROW = 4;

const WATCH_CHROME_PX = 260;
const WATCH_COLUMN_MAX = `max(640px, calc((100dvh - ${WATCH_CHROME_PX}px) * 16 / 9))`;

function VideoWatchPage({ video, onBack, onChannel, likedIds, onToggleLike, savedIds, onToggleSave, onNext, onPrev, onVideoSelect, onAddToPlaylist, onRecommend, myChannelId = null, onSubscribeChange, onViewsUpdate, onSearch, minimized = false, onRestore, onClose, onMinimize, playlistSaved = false, preferChannelUpNext = false, autoStart = false }) {
	const { isMobile } = useViewport();
	const [searchQ, setSearchQ] = useState("");
	const loading = usePageLoad(150);
	const [liked, setLiked] = useState(() => likedIds?.has(video?.id ?? video?.videoId) ?? false);
	const [likeCount, setLikeCount] = useState(() => video?.likes_count ?? 0);
	const [disliked, setDisliked] = useState(false);
	const [dislikeCount, setDislikeCount] = useState(() => video?.dislikes_count ?? 0);
	const [saved, setSaved] = useState(() => savedIds?.has(video?.id ?? video?.videoId) ?? false);
	const [localViewsCount, setLocalViewsCount] = useState(video?.views_count ?? 0);
	const [showMenu, setShowMenu] = useState(false);
	const [showReport, setShowReport] = useState(false);
	const [subscribed, setSubscribed] = useState(false);
	const [subscriberCount, setSubscriberCount] = useState(video?.subscriber_count ?? 0);
	const [subscribeLoading, setSubscribeLoading] = useState(false);
	const [shareDone, setShareDone] = useState(false);
	const [shareOpen, setShareOpen] = useState(false);
	const [shareStartSec, setShareStartSec] = useState(0);
	const [playing, setPlaying] = useState(() => Boolean(autoStart));
	const [recommendPending, setRecommendPending] = useState(false);
	const [autoplayOn, setAutoplayOn] = useState(() => localStorage.getItem("strug_autoplay") !== "false");
	const [showFullDesc, setShowFullDesc] = useState(false);
	const descriptionId = useId();
	const [newComment, setNewComment] = useState("");
	const [comments, setComments] = useState([]);
	const myUserId = getAuthUserId();
	const [watchDialog, { confirm: confirmDialog }] = useDialog();
	const [commentLikes, setCommentLikes] = useState({});
	const [commentSheetOpen, setCommentSheetOpen] = useState(false);
	const [related, setRelated] = useState([]);
	// Mobile: give the breadcrumb's strip to the video, the way YouTube does. The desktop page keeps
	// its breadcrumb — there the strip costs nothing, and the player is nowhere near the top.
	useEffect(() => {
		// Not while minimised: the list has the screen back and wants its breadcrumb with it.
		if (!isMobile || minimized) return;
		window.dispatchEvent(new CustomEvent("strug:hide-breadcrumb", { detail: true }));
		return () => window.dispatchEvent(new CustomEvent("strug:hide-breadcrumb", { detail: false }));
	}, [isMobile, minimized]);
	// The back+search row — and, on narrower desktops, the friends shelf — sit above the player
	// inside the main column, while Up Next starts at the top of its own. That left the rail
	// floating above the video. Offset it by what that block actually measures, not a guess that
	// breaks the moment the search box or the shelf changes height.
	// Chips over the rail — "All", the creator, and the video's own category. Picking one swaps the
	// rail's list, so more of what you are already watching is one click away instead of a search.
	const [railChip, setRailChip] = useState("all");
	const [railLists, setRailLists] = useState({});
	// Arrows for the chip row. They sit ON the row rather than beside it, so showing one cannot
	// shrink the scroller and manufacture the very overflow that justified it.
	const chipScrollRef = useRef(null);
	const [chipEdges, setChipEdges] = useState({ left: false, right: false });
	const measureChipEdges = useCallback(() => {
		const el = chipScrollRef.current;
		if (!el) return;
		setChipEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
	}, []);
	useEffect(() => {
		const el = chipScrollRef.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const ro = new ResizeObserver(measureChipEdges);
		ro.observe(el);
		return () => ro.disconnect();
	}, [measureChipEdges, railLists]);
	const scrollChips = (dir) => {
		const el = chipScrollRef.current;
		if (el) el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: "smooth" });
	};

	// What lines up is the first recommendation and the top of the video; the "Up next" label rides
	// up into the band the search row occupies, which is empty anyway.
	const abovePlayerRef = useRef(null);
	const upNextLabelRef = useRef(null);
	const [railOffset, setRailOffset] = useState(0);
	useEffect(() => {
		const above = abovePlayerRef.current;
		if (!above || typeof ResizeObserver === "undefined") return;
		// Set only from the observer, which reports an initial size of its own — a synchronous
		// setState here would cascade a second render on every mount.
		const measure = () => {
			const label = upNextLabelRef.current;
			const labelH = label ? label.offsetHeight + parseFloat(getComputedStyle(label).marginBottom || 0) : 0;
			setRailOffset(Math.max(0, above.offsetHeight - labelH));
		};
		const ro = new ResizeObserver(measure);
		ro.observe(above);
		if (upNextLabelRef.current) ro.observe(upNextLabelRef.current);
		return () => ro.disconnect();
		// Depends on `loading`: while the skeleton is up none of these nodes exist, so a mount-only
		// effect measured nothing at all and left the rail sitting above the video.
	}, [loading]);
	// Up Next infinite scroll (#347): the rail keeps a running offset and pulls the next page from
	// /video/recommendations as a sentinel at the bottom scrolls into view. relatedHasMore stops the
	// observer once the server returns a short (< page) batch; relatedSeen de-dupes across pages so a
	// video the backend surfaces in two buckets never renders twice.
	const REL_PAGE = 20;
	const [relatedOffset, setRelatedOffset] = useState(0);
	const [relatedHasMore, setRelatedHasMore] = useState(true);
	const [relatedLoading, setRelatedLoading] = useState(false);
	const relatedSeen = useRef(new Set());
	const relatedSentinelRef = useRef(null);
	const watchScrollRef = useRef(null);
	const videoElemRef = useRef(null);
	// BUG #25: mobile mini-player — when the player scrolls out of view while playing,
	// detach it to a fixed corner so it keeps playing while the user browses. The same
	// NativeVideoPlayer element stays mounted (only the wrapper style changes) so playback
	// is never interrupted. A spacer holds the original layout height; hysteresis avoids flicker.
	// Leaving the page only shrinks the video into the corner when it is playing at that moment.
	// Read off the element rather than the `playing` flag, which only says the poster was pressed
	// at some point: someone who paused, or who sat through to the end, is done with it, and a
	// corner card holding a still frame is clutter rather than a player.
	const leave = () => {
		const el = videoElemRef.current;
		const running = !!(playing && el && !el.paused && !el.ended);
		if (!running) {
			try { el?.pause?.(); } catch { /* already stopped */ }
			onBack?.();
			return;
		}
		if (onMinimize) onMinimize();
		else onBack?.();
	};

	// Scrolling past the player detaches it into the corner. `minimized` is the other way in: the
	// viewer went back to the list and the video is still playing.
	const [scrollMini, setScrollMini] = useState(false);
	const miniPlayer = scrollMini || minimized;
	const setMiniPlayer = setScrollMini;
	useEffect(() => {
		const root = playerWrapRef.current;
		if (!miniPlayer || !root) return;
		const closeReplaced = () => {
			if (minimized) { onClose?.(); return; }
			setScrollMini(false);
			setPlaying(false);
		};
		root.addEventListener('strug:playback-replaced', closeReplaced);
		return () => root.removeEventListener('strug:playback-replaced', closeReplaced);
	}, [miniPlayer, minimized, onClose]);
	// #270: theater mode (desktop) — widens the player and collapses the up-next rail.
	const [theater, setTheater] = useState(false);
	// Paused state of the docked mini-bar's play/pause toggle, kept in sync with the
	// real <video> element (which has no native controls while docked).
	const [miniPaused, setMiniPaused] = useState(false);
	const [miniPct, setMiniPct] = useState(0);
	const [pipChrome, setPipChrome] = useState(true);
	const [pipChromeN, setPipChromeN] = useState(0);
	const [pipPos, setPipPos] = useState(null);
	const [pipDragging, setPipDragging] = useState(false);
	const pipDragRef = useRef(null);
	const pipDidDragRef = useRef(false);
	const revealPipChrome = () => {
		setPipChrome(true);
		setPipChromeN((n) => n + 1);
	};
	// Desktop floating-card hover state (reveals the overlay controls).
	const [miniHover, setMiniHover] = useState(false);
	const playerWrapRef = useRef(null);
	const naturalPlayerH = useRef(0);
	const handleWatchScroll = (e) => {
		// Mobile watch page: the player stays pinned at the top (`position: sticky`) while title /
		// related / comments scroll underneath. Shrinking to a strip is only for leaving the page
		// (`minimized`). Desktop still detaches to a bottom-right card once the player scrolls away.
		if (isMobile && !minimized) return;
		if (!playing) { if (miniPlayer) setMiniPlayer(false); return; }
		const top = e.currentTarget.scrollTop;
		if (!miniPlayer && playerWrapRef.current) naturalPlayerH.current = playerWrapRef.current.offsetHeight;
		const h = naturalPlayerH.current || 210;
		if (!miniPlayer && top > h) setMiniPlayer(true);
		else if (miniPlayer && top < h * 0.7) setMiniPlayer(false);
	};
	// Mirror the <video> play/pause into miniPaused so the bar's toggle icon stays correct.
	useEffect(() => {
		const v = videoElemRef.current;
		if (!v) return;
		const onPlay = () => setMiniPaused(false);
		const onPause = () => setMiniPaused(true);
		v.addEventListener("play", onPlay);
		v.addEventListener("pause", onPause);
		setMiniPaused(v.paused);
		return () => { v.removeEventListener("play", onPlay); v.removeEventListener("pause", onPause); };
	}, [miniPlayer, playing]);
	useEffect(() => {
		if (!miniPlayer || !isMobile) return undefined;
		const tick = () => {
			const v = videoElemRef.current;
			const d = v?.duration;
			if (!v || !Number.isFinite(d) || d <= 0) return;
			setMiniPct(Math.min(100, (v.currentTime / d) * 100));
		};
		tick();
		const id = window.setInterval(tick, 250);
		return () => window.clearInterval(id);
	}, [miniPlayer, isMobile]);
	useEffect(() => {
		if (!miniPlayer || !isMobile || !pipChrome) return undefined;
		if (miniPaused) return undefined;
		const id = window.setTimeout(() => setPipChrome(false), 2500);
		return () => window.clearTimeout(id);
	}, [miniPlayer, isMobile, pipChrome, miniPaused, pipChromeN]);
	useEffect(() => {
		if (miniPlayer) return;
		setPipPos(null);
		setPipChrome(true);
	}, [miniPlayer]);
	const expandFromMini = () => { setMiniPlayer(false); watchScrollRef.current?.scrollTo?.({ top: 0, behavior: "smooth" }); };
	const onMobilePipTap = (e) => {
		if (e.target.closest("button")) return;
		if (pipDidDragRef.current) { pipDidDragRef.current = false; return; }
		if (!pipChrome) { revealPipChrome(); return; }
		if (minimized) { onRestore?.(); return; }
		expandFromMini();
	};
	const onPipPointerDown = (e) => {
		if (!miniPlayer || !isMobile) return;
		if (e.target.closest("button")) return;
		const box = playerWrapRef.current;
		if (!box) return;
		const r = box.getBoundingClientRect();
		pipDragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, x: e.clientX, y: e.clientY, moved: false };
		box.setPointerCapture?.(e.pointerId);
	};
	const onPipPointerMove = (e) => {
		const st = pipDragRef.current;
		if (!st) return;
		if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) st.moved = true;
		if (!st.moved) return;
		setPipDragging(true);
		const margin = 8;
		const tab = 62;
		let left = e.clientX - st.dx;
		let top = e.clientY - st.dy;
		left = Math.max(margin, Math.min(window.innerWidth - MOBILE_PIP_W - margin, left));
		top = Math.max(margin, Math.min(window.innerHeight - MOBILE_PIP_H - tab - margin, top));
		setPipPos({ left, top });
	};
	const onPipPointerUp = (e) => {
		const moved = !!pipDragRef.current?.moved;
		if (moved) pipDidDragRef.current = true;
		pipDragRef.current = null;
		setPipDragging(false);
		playerWrapRef.current?.releasePointerCapture?.(e.pointerId);
	};
	const toggleMiniPlay = (e) => {
		e.stopPropagation();
		const v = videoElemRef.current;
		if (!v) return;
		if (v.paused) {
			setMiniPaused(false);
			v.play().catch(() => setMiniPaused(true));
		} else {
			setMiniPaused(true);
			v.pause();
		}
	};
	const beginPlayback = (e) => {
		e?.stopPropagation?.();
		setPlaying(true);
		safePlay(videoElemRef.current);
	};
	const videoId = video?.id ?? video?.videoId;
	const [resumeSec, setResumeSec] = useState(() => {
		if (!videoId) return 0;
		try { return parseInt(sessionStorage.getItem(`strug_resume_${videoId}`), 10) || 0; } catch { return 0; }
	});
	useEffect(() => {
		const local = videoId ? parseInt(sessionStorage.getItem(`strug_resume_${videoId}`), 10) || 0 : 0;
		setResumeSec(local);
		if (!videoId) return undefined;
		let alive = true;
		getWatchResume(videoId).then((d) => {
			const apiPos = d?.last_position ?? 0;
			if (alive && apiPos > local) setResumeSec(apiPos);
		}).catch(() => {});
		return () => { alive = false; };
	}, [videoId]);

	// The videoId currently owning the rail — lets a stale in-flight page (from the previous
	// video) drop its result instead of appending someone else's recommendations after a switch.
	const activeRelVidRef = useRef(null);
	const loadMoreRelated = useCallback((reset = false) => {
		if (!videoId) return;
		if (!reset && (relatedLoading || !relatedHasMore)) return;
		const offset = reset ? 0 : relatedOffset;
		const vid = videoId;
		const cat = typeof video?.category === "string" ? video.category : null;
		const chId = video?.channel_id ?? (typeof video?.channel === "object" ? video.channel?.channel_id : null) ?? null;
		setRelatedLoading(true);

		const applyPage = (raw, { fromFallback = false } = {}) => {
			if (activeRelVidRef.current !== vid) return;
			const items = raw.filter((v) => v.video_type !== "shorts");
			if (reset) relatedSeen.current = new Set();
			const fresh = [];
			for (const v of items) {
				const id = v.video_id;
				if (id == null || relatedSeen.current.has(id)) continue;
				relatedSeen.current.add(id);
				fresh.push(mapRelatedItem(v));
			}
			// #162 — server ranks Up Next (context + taste + diversity); keep scroll pages stable.
			const mapped = fresh;
			setRelated((prev) => (reset ? mapped : [...prev, ...mapped]));
			setRelatedOffset(offset + raw.length);
			// Fallback pools are a one-shot fill — don't keep paging empty /recommendations.
			setRelatedHasMore(!fromFallback && raw.length >= REL_PAGE);
			setRelatedLoading(false);
		};

		const fillFallback = () => fetchUpNextFallback({
			excludeId: vid,
			category: cat,
			channelId: chId,
			limit: REL_PAGE,
		}).then((mapped) => {
			if (activeRelVidRef.current !== vid) return;
			if (reset) relatedSeen.current = new Set(mapped.map((v) => v.id).filter((id) => id != null));
			setRelated(mapped);
			setRelatedOffset(0);
			setRelatedHasMore(false);
			setRelatedLoading(false);
		}).catch(() => {
			if (activeRelVidRef.current === vid) setRelatedLoading(false);
		});

		getVideoRecommendations(videoId, { limit: REL_PAGE, offset }).then((data) => {
			if (activeRelVidRef.current !== vid) return;
			const raw = listFrom(data);
			const usable = raw.filter((v) => v.video_type !== "shorts");
			if (reset && usable.length === 0) {
				fillFallback();
				return;
			}
			applyPage(raw);
		}).catch(() => {
			if (activeRelVidRef.current !== vid) return;
			if (reset) fillFallback();
			else setRelatedLoading(false);
		});
	}, [videoId, relatedOffset, relatedLoading, relatedHasMore, video?.category, video?.channel_id, video?.channel]);
	// Keep a live pointer to the latest loader so the IntersectionObserver (bound once per
	// sentinel appearance) always calls the current-closure version without re-subscribing.
	const loadMoreRef = useRef(loadMoreRelated);
	loadMoreRef.current = loadMoreRelated;
	const canPageRelated = relatedHasMore && related.length > 0;
	useEffect(() => {
		if (!canPageRelated) return;
		const el = relatedSentinelRef.current;
		if (!el) return;
		const io = new IntersectionObserver((entries) => {
			if (entries[0]?.isIntersecting) loadMoreRef.current(false);
		}, { root: watchScrollRef.current, rootMargin: '300px' });
		io.observe(el);
		return () => io.disconnect();
	}, [canPageRelated]);
	useEffect(() => {
		if (!videoId) return;
		// Reset pagination and pull the first page whenever the open video changes (#347/#350).
		activeRelVidRef.current = videoId;
		relatedSeen.current = new Set();
		setRelated([]);
		setRelatedOffset(0);
		setRelatedHasMore(true);
		setRelatedLoading(false);
		loadMoreRelated(true);
		if (videoId != null) {
			getVideoComments(videoId).then(data => {
				const list = listFrom(data);
				// Always set (even when empty) — the old `length > 0` guard left the previous
				// video's comments on screen when switching to an un-commented video (audit H1).
				setComments(list.map(c => ({
					user: c.user?.name ?? c.user?.username ?? 'User',
					avatar: (c.user?.name ?? 'U')[0].toUpperCase(),
					avatarUrl: c.user?.profile_pic_url ?? null,
					avatarColor: '#1e3a5f',
					time: c.created_at ? timeAgo(c.created_at) : '',
					text: c.content,
					_id: c.comment_id,
					userId: c.user?.user_id ?? null,
					like_count: c._count?.comment_likes ?? 0,
				})));
			}).catch(() => {});
		}
	}, [videoId]);
	const channelId = video?.channel_id ?? null;
	useEffect(() => {
		if (!channelId) return;
		getChannelSubscriptionStatus(channelId).then(d => setSubscribed(!!d?.subscribed)).catch(() => {});
	}, [channelId]);
	useEffect(() => {
		// Use the authoritative views_count the server returns (it dedups repeat views per
		// 30-min window), not an optimistic +1 — the +1 desynced from the dashboard and
		// disappeared on refresh (bug #18).
		if (videoId) recordVideoView(videoId).then((res) => {
			const next = res?.views_count;
			if (typeof next === "number") { setLocalViewsCount(next); onViewsUpdate?.(videoId, next); }
		}).catch(() => {});
	}, [videoId]);
	useEffect(() => {
		// Report watch progress so the backend accrues real watch-time (powers the Creator Studio
		// "Watch Time" KPI + per-video retention). The server credits only forward progress, capped
		// per ping, so a steady 15s cadence while playing is plenty. Best-effort / fire-and-forget.
		if (!videoId) return;
		const saveResume = () => { const v = videoElemRef.current; if (v && v.currentTime > 5) sessionStorage.setItem(`strug_resume_${videoId}`, Math.floor(v.currentTime)); };
		const ping = () => { const v = videoElemRef.current; if (v && v.currentTime > 0) { saveResume(); recordWatchProgress(videoId, v.currentTime).catch(() => {}); } };
		const id = setInterval(() => {
			const el = videoElemRef.current;
			if (!el || el.paused || el.ended) return;
			if (el.currentTime > 0) { saveResume(); recordWatchProgress(videoId, el.currentTime).catch(() => {}); }
		}, 15000);
		// audit F6: also flush a final ping on pause/ended and on unmount / video change, so videos
		// shorter than the 15s cadence and the last <15s of any video aren't dropped from
		// watch-time/retention.
		const el = videoElemRef.current;
		el?.addEventListener("pause", ping);
		el?.addEventListener("ended", ping);
		return () => {
			clearInterval(id);
			el?.removeEventListener("pause", ping);
			el?.removeEventListener("ended", ping);
			ping();
		};
	}, [videoId]);

	useEffect(() => {
		// Publish the currently-open, playable long-form video to a global so the AppInner shell can
		// keep it playing in a cross-section mini-player after you navigate to another section
		// (bug #471 / #473 item 2). Kept fresh by a light 1s snapshot; deliberately NOT cleared on
		// unmount, because switching sections unmounts this page and the shell reads the last snapshot
		// right after. It's cleared by VideosPage when the video is explicitly closed (selectedVideo ->
		// null), so closing a video != leaving a playing one.
		const _src = video?.processed_video_url;
		if (!videoId || !_src) return undefined;
		const snap = () => {
			const v = videoElemRef.current;
			window.__strugActiveVideo = {
				video: { videoId, title: video.title, channel: video.channel ?? video.channel_name, processed_video_url: _src, thumbnail_url: video.thumbnail_url },
				time: v ? Math.floor(v.currentTime || 0) : 0,
				playing: v ? (!v.paused && !v.ended) : false,
			};
		};
		snap();
		const _snapId = setInterval(snap, 1000);
		return () => clearInterval(_snapId);
	}, [videoId, video?.processed_video_url, video?.title]);
	async function handleToggleSubscribe() {
		if (!channelId || subscribeLoading) return;
		setSubscribeLoading(true);
		try {
			if (subscribed) {
				const res = await unsubscribeFromChannel(channelId);
				setSubscribed(false);
				setSubscriberCount(c => res?.subscriber_count ?? Math.max(0, c - 1));
			} else {
				const res = await subscribeToChannel(channelId);
				setSubscribed(true);
				setSubscriberCount(c => res?.subscriber_count ?? c + 1);
			}
			onSubscribeChange?.();
		} catch { /* noop */ }
		setSubscribeLoading(false);
	}
	// audit F3: post a comment and reconcile the optimistic row with the server's real
	// comment_id, so the user can like their just-posted comment (the like API needs the real
	// numeric id) and a later refetch doesn't show a duplicate. On failure the optimistic row is
	// removed rather than lingering as an un-likeable ghost. (Replies stay flat @mentions — the
	// GET endpoint only returns top-level comments and there's no thread UI, so sending parent_id
	// would make the reply vanish.)
	async function submitComment(rawText) {
		const text = (rawText ?? "").trim();
		if (!text || videoId == null) return;
		const tempId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
		setComments(prev => [{ _id: tempId, user: "You", avatar: "Y", avatarColor: "#2563eb", time: "just now", text, like_count: 0, userId: myUserId }, ...prev]);
		try {
			const res = await addVideoComment(videoId, text);
			const real = res?.data;
			if (real?.comment_id != null) {
				setComments(prev => prev.map(c => c._id === tempId ? {
					...c,
					_id: real.comment_id,
					user: real.user?.name ?? real.user?.username ?? c.user,
					text: real.content ?? c.text,
				} : c));
			}
		} catch {
			setComments(prev => prev.filter(c => c._id !== tempId));
		}
	}
	// bug #93: delete your own comment. Optimistically remove, restore on failure. A
	// just-posted optimistic row (string _id) is only local, so just drop it locally.
	async function handleDeleteComment(commentId) {
		if (commentId == null) return;
		const ok = await confirmDialog({ title: "Delete comment?", message: "This will permanently remove your comment.", confirmLabel: "Delete", danger: true });
		if (!ok) return;
		const prev = comments;
		setComments(cur => cur.filter(c => c._id !== commentId));
		if (typeof commentId === "string") return; // local-only optimistic row — never persisted
		try {
			await deleteVideoComment(commentId);
		} catch {
			setComments(prev);
		}
	}
	// Video navigation is via the Next/Prev buttons only. Scrolling (wheel/touch)
	// just scrolls the page and arrow keys control the player (seek/volume) — neither
	// ever changes the video. The old scroll/swipe/arrow-to-next behaviour skipped
	// videos when the user merely scrolled or used arrows to seek.
	const videoUrl = videoPath(video) ? `${window.location.origin}${videoPath(video)}` : "";
	const handleShare = () => {
		if (isMobile && navigator.share) {
			navigator.share({ title: video.title ?? "Strug Video", url: videoUrl }).catch(() => {});
			setShareDone(true);
			setTimeout(() => setShareDone(false), 2000);
			return;
		}
		// Desktop (and mobile without the native sheet): open the Strug share box.
		const v = document.querySelector("video[controls]");
		setShareStartSec(v && v.currentTime > 1 ? Math.floor(v.currentTime) : 0);
		// The dialog mounts fresh each time it opens, so its own copied/timestamp state resets itself.
		setShareOpen(true);
	};

	const railChannelId = video?.channel_id ?? (typeof video?.channel === "object" ? video.channel?.channel_id : null) ?? null;
	const railCategory = typeof video?.category === "string" ? video.category : null;
	const railVideoId = video?.id ?? video?.videoId;
	// Both lists are pulled up front rather than when a chip is clicked. A creator with only this
	// one video, or a category holding nothing else, would otherwise get a chip that leads to an
	// empty rail — fetching first means such a chip is simply never offered, and the ones that are
	// offered switch instantly. "All" is always present, so the row never collapses and the cards
	// below it never jump.
	useEffect(() => {
		setRailChip("all");
		setRailLists({});
		if (!railVideoId) return;
		let alive = true;
		const load = (key, params) => {
			if (!params) return;
			getVideoFeed(params)
				.then((data) => {
					if (!alive) return;
					const items = listFrom(data).map(mapApiVideo).filter((v) => (v.id ?? v.videoId) !== railVideoId);
					if (items.length) setRailLists((prev) => ({ ...prev, [key]: items }));
				})
				.catch(() => {});
		};
		load("channel", railChannelId ? { channel_id: railChannelId, include_shorts: true, limit: 20 } : null);
		load("category", railCategory ? { category: railCategory, limit: 20 } : null);
		return () => { alive = false; };
	}, [railVideoId, railChannelId, railCategory]);
	// Channel-page watch: once this creator's other videos land, lead Up Next with them.
	useEffect(() => {
		if (preferChannelUpNext && railLists.channel?.length) setRailChip("channel");
	}, [preferChannelUpNext, railLists.channel]);

	// Render-safe channel label — never render a raw channel object (React #31).
	const channelLabel = typeof video.channel === "string" ? video.channel : (video.channel?.display_name ?? video.channel?.name ?? "Creator");
	const avatarLabel = typeof video.avatar === "string" && video.avatar ? video.avatar : (channelLabel[0] ?? "C").toUpperCase();
	const canRecommendFromWatch = Boolean(onRecommend && canRecommendVideoToSubscribers(video, myChannelId));
	const watchTitleText = video.title || "";
	const watchDescText = (video.description || "").trim();
	const canExpandWatchInfo = watchTitleText.length > 40 || !!watchDescText;
	const watchTitleClamp = showFullDesc ? undefined : (isMobile ? (MOBILE_WATCH_TYPE.title.lineClamp || 1) : 1);
	const recommendFromWatch = async (event) => {
		event?.preventDefault?.();
		event?.stopPropagation?.();
		if (!canRecommendFromWatch || recommendPending) return;
		setRecommendPending(true);
		try {
			await onRecommend(video);
		} finally {
			setRecommendPending(false);
		}
	};
	// A chip appears only once its list has come back with something in it.
	const railChips = [
		{ id: "all", label: i18n.t("events.categories.all") },
		railLists.channel?.length && { id: "channel", label: i18n.t("videos.fromChannel", { channel: channelLabel }) },
		railLists.category?.length && { id: "category", label: railCategory },
	].filter(Boolean);
	// A chip does not empty the rail — its videos go first and the ordinary recommendations carry
	// on underneath, so there is always somewhere to go next.
	const railList = (() => {
		if (railChip === "all") return related;
		const picked = railLists[railChip] ?? [];
		const seen = new Set(picked.map((v) => v.id ?? v.videoId));
		return [...picked, ...related.filter((v) => !seen.has(v.id ?? v.videoId))];
	})();

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? MOBILE_GUTTER_PX : 108, paddingRight: isMobile ? MOBILE_GUTTER_PX : 48, overflow: "hidden" }}>
			<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 28, width: "100%", padding: isMobile ? "0 0 40px" : "28px 0 40px", ...(isMobile || theater ? {} : { justifyContent: "center" }) }}>
				<div style={{ flex: 1, minWidth: 0, ...(isMobile || theater ? {} : { maxWidth: WATCH_COLUMN_MAX }) }}>
					<Skel w={140} h={16} r={6} style={{ marginBottom: 14 }} />
					<Skel w="100%" h={0} r={16} style={{ paddingTop: "56.25%", marginBottom: 18 }} />
					<Skel w="85%" h={24} r={6} style={{ marginBottom: 10 }} />
					<Skel w={200} h={14} r={6} style={{ marginBottom: 16 }} />
					<div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
						{[...Array(4)].map((_,i) => <SkeletonBubble key={i} />)}
					</div>
					<div style={{ display: "flex", gap: 12, alignItems: "center", padding: "16px 0", borderTop: "1px solid var(--color-border-subtle)" }}>
						<Skel w={44} h={44} r={22} />
						<div>
							<Skel w={140} h={16} r={6} style={{ marginBottom: 6 }} />
							<Skel w={100} h={12} r={6} />
						</div>
					</div>
				</div>
				<div style={{ ...(isMobile ? { width: "100%", flexShrink: 0 } : { flex: "1 1 260px", minWidth: 260, maxWidth: 460 }) }}>
					<Skel w="100%" h={18} r={6} style={{ marginBottom: 16 }} />
					{[...Array(4)].map((_,i) => <SkeletonVideoCard key={i} style={{ marginBottom: 12 }} />)}
				</div>
			</div>
		</div>
	);

	// The player, kept in one piece so it can be rendered in the page or, once the viewer has
	// left the page, portalled out to keep playing in the corner.
	const playerBlock = (
				<div ref={playerWrapRef} onClick={miniPlayer ? (isMobile ? onMobilePipTap : (minimized ? onRestore : expandFromMini)) : undefined} onMouseEnter={miniPlayer && isMobile ? revealPipChrome : undefined} onPointerDown={miniPlayer && isMobile ? onPipPointerDown : undefined} onPointerMove={miniPlayer && isMobile ? onPipPointerMove : undefined} onPointerUp={miniPlayer && isMobile ? onPipPointerUp : undefined} onPointerCancel={miniPlayer && isMobile ? onPipPointerUp : undefined} style={{ width: "100%", boxSizing: "border-box", ...(minimized ? { pointerEvents: "auto" } : {}), ...(miniPlayer
					? (isMobile
						// Phone PiP: docked lower-right first, then the viewer can drag it anywhere.
						? { position: "fixed", ...(pipPos ? { left: pipPos.left, top: pipPos.top, right: "auto", bottom: "auto" } : { left: "auto", right: 14, bottom: `calc(${MOBILE_MINI_BOTTOM_PX + MOBILE_FAB_CLEAR_PX}px + env(safe-area-inset-bottom, 0px))` }), width: MOBILE_PIP_W, height: MOBILE_PIP_H, zIndex: 600, overflow: "hidden", padding: 0, cursor: pipDragging ? "grabbing" : "grab", touchAction: "none", background: "#000", border: "1px solid rgba(255,255,255,0.16)", boxShadow: "0 18px 42px rgba(0,0,0,0.55), 0 0 0 1px rgba(37,99,235,0.28), 0 0 32px rgba(37,99,235,0.22)", animation: pipPos ? "none" : "fadeUp 0.32s cubic-bezier(0.22, 1, 0.36, 1)" }
						// Desktop: shrink to a 16:9 floating card in the bottom-right corner.
						: { position: "fixed", right: 24, bottom: 24, width: 400, height: 225, zIndex: 600, background: "#000", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 12px 44px rgba(0,0,0,0.6)", cursor: "pointer" })
					: (theater && !isMobile
						// #270 theater: fixed tall cinema height instead of the 16:9 aspect box.
						? { position: "relative", height: "78vh", marginBottom: 18 }
						: { position: "relative", paddingTop: "56.25%", marginBottom: 18 })), borderRadius: miniPlayer ? (isMobile ? 14 : 12) : 16, overflow: "hidden", ...(isMobile && !miniPlayer && !theater ? {
						width: "100%",
						margin: 0,
						borderRadius: 0,
						paddingTop: 0,
						height: "56.25vw",
						flexShrink: 0,
						background: "#000",
					} : {}) }}>
						{/* #473 item 1: mobile Back overlay — the back+search row is hidden on mobile. */}
						{isMobile && !miniPlayer && (
							<button type="button" onClick={leave} aria-label="Back" style={{ position: "absolute", top: "max(6px, env(safe-area-inset-top, 0px))", left: 8, zIndex: 30, width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
								<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
							</button>
						)}
					{(video.is_processing || video.processing_status === 'processing' || video.processing_status === 'pending' || video.is_failed || video.processing_status === 'error') && !playing ? (
						// #392: a video that isn't fully transcoded has no complete manifest — don't offer playback
						// (the old master.m3u8 fallback served a partial stream that cut off at ~2 min). The owner
						// reaches this via their own channel page (which surfaces un-transcoded uploads); show its
						// pipeline state instead of a broken player.
						<div style={{ position: "absolute", inset: 0, ...(video.thumb && video.thumb.startsWith("http") ? { backgroundImage: `url(${video.thumb})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: video.thumb || "#1e3a5f" }), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
							<div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />
							{(video.is_failed || video.processing_status === 'error') ? (
								<>
									<svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ zIndex: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
									<div style={{ zIndex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: "#fff" }}>{i18n.t("videos.processingFailed")}</div>
									<div style={{ zIndex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.6)", textAlign: "center", maxWidth: 320 }}>{i18n.t("videos.processingFailedHint")}</div>
								</>
							) : (
								<>
									<div style={{ zIndex: 1, width: 40, height: 40, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.2)", borderTopColor: "#2563eb", animation: "spin 0.8s linear infinite" }} />
									<div style={{ zIndex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: "#fff" }}>{i18n.t("videos.stillProcessingTitle")}</div>
									<div style={{ zIndex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.6)", textAlign: "center", maxWidth: 320 }}>{i18n.t("videos.processingWatchHint")}</div>
								</>
							)}
						</div>
					) : (
						<>
						{/* Phones keep next-video playback user initiated; desktop retains autoplay. */}
						<NativeVideoPlayer src={video.processed_video_url || ""} startAtSec={resumeSec} hydrating={!video.processed_video_url && (video?.id != null || video?.videoId != null) && video.is_processing === undefined && video.processing_status !== 'error'} poster={video.thumbnail_url ?? undefined} mediaTitle={video.title} mediaArtist={video.channel ?? video.channel_name} autoPlay={playing} hideChrome={!playing && !miniPlayer}
								autoplayNext={autoplayOn && !isMobile ? (onNext ?? null) : null} endScreenItems={preferChannelUpNext ? railList : related} onSelectEndScreen={(v) => onVideoSelect ? onVideoSelect(v) : (onBack && onBack())} onSkipNext={(onNext || (preferChannelUpNext ? railList : related).length > 0) ? (() => { const nextList = preferChannelUpNext ? railList : related; return nextList.length > 0 ? onVideoSelect?.(nextList[0]) : onNext?.(); }) : null} onSkipPrevious={onPrev ?? null} autoplayOn={autoplayOn} onToggleAutoplay={() => { const n = !autoplayOn; setAutoplayOn(n); localStorage.setItem("strug_autoplay", String(n)); }} theater={theater} onToggleTheater={() => setTheater(v => !v)} isMiniPlayer={miniPlayer} onVideoReady={el => {
								videoElemRef.current = el;
							}} style={miniPlayer
								? { position: "absolute", inset: 0, width: "100%", height: "100%", background: "#000" }
								: { position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: "inherit", background: "#000" }} />
						{!playing && (
						<div onClick={beginPlayback} {...clickableProps(beginPlayback)} aria-label={i18n.t("videos.play", { defaultValue: "Play" })} style={{ position: "absolute", inset: 0, zIndex: 20, ...(video.thumb && video.thumb.startsWith("http") ? { backgroundImage: `url(${video.thumb})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: video.thumb || "#1e3a5f" }), cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
							<div style={{ width: isMobile ? 64 : 72, height: isMobile ? 64 : 72, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.28)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
								<svg width={isMobile ? 24 : 28} height={isMobile ? 24 : 28} viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3"/></svg>
							</div>
							<div style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(0,0,0,0.72)", borderRadius: 6, padding: "3px 8px", fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 12 : 12, fontWeight: 700, color: "#fff", letterSpacing: "0.02em" }}>{video.duration}</div>
						</div>
						)}
						</>
					)}
					{miniPlayer && isMobile && (
						<>
							<div style={{ position: "absolute", inset: 0, zIndex: 3, opacity: pipChrome ? 1 : 0, transition: "opacity .2s ease", pointerEvents: "none" }}>
								<div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.08) 48%, rgba(0,0,0,0.35) 100%)" }} />
								<div style={{ position: "absolute", top: 6, left: 6, right: 6, zIndex: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
									<button onClick={(e) => { e.stopPropagation(); if (minimized) { onRestore?.(); return; } expandFromMini(); }} aria-label="Expand" style={{ ...MOBILE_PIP_CHIP, pointerEvents: pipChrome ? "auto" : "none" }}>
										<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
									</button>
									<button onClick={(e) => { e.stopPropagation(); if (minimized) { onClose?.(); return; } setMiniPlayer(false); setPlaying(false); }} aria-label="Close mini player" style={{ ...MOBILE_PIP_CHIP, pointerEvents: pipChrome ? "auto" : "none" }}>
										<svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
									</button>
								</div>
								<div style={{ position: "absolute", left: 0, right: 0, top: "42%", transform: "translateY(-50%)", zIndex: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
									<button onClick={toggleMiniPlay} aria-label={miniPaused ? "Play" : "Pause"} style={{ ...MOBILE_PIP_CHIP, width: 40, height: 40, pointerEvents: pipChrome ? "auto" : "none", boxShadow: "0 6px 16px rgba(0,0,0,0.35)" }}>
										{miniPaused
											? <svg width={16} height={16} viewBox="0 0 24 24" fill="#fff"><polygon points="7 4 20 12 7 20 7 4"/></svg>
											: <svg width={16} height={16} viewBox="0 0 24 24" fill="#fff"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>}
									</button>
									{onNext && (
										<button onClick={(e) => { e.stopPropagation(); onNext(); }} aria-label={i18n.t("common.next")} style={{ ...MOBILE_PIP_CHIP, width: 40, height: 40, pointerEvents: pipChrome ? "auto" : "none", boxShadow: "0 6px 16px rgba(0,0,0,0.35)" }}>
											<svg width={14} height={14} viewBox="0 0 24 24" fill="#fff"><polygon points="5 4 15 12 5 20 5 4"/><rect x="17" y="4" width="3" height="16" rx="1"/></svg>
										</button>
									)}
								</div>
								<div style={{ position: "absolute", left: 8, right: 8, bottom: 8, zIndex: 4 }}>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#fff", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 1px 8px rgba(0,0,0,0.6)" }}>{video.title}</p>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, fontWeight: 600, color: "rgba(255,255,255,0.78)", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{channelLabel}</p>
								</div>
							</div>
							<div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 5, height: 3, background: "rgba(255,255,255,0.18)" }}>
								<div style={{ height: "100%", width: `${miniPct}%`, background: "linear-gradient(90deg, #3b82f6, #60a5fa)", boxShadow: "0 0 8px rgba(96,165,250,0.7)", transition: "width 0.2s linear" }} />
							</div>
						</>
					)}
					{/* Desktop floating-card overlay: hover reveals top controls (expand + close), a center
					    play/pause, and a bottom title strip. Clicking the card body expands to full. */}
					{miniPlayer && !isMobile && (
						<div onMouseEnter={() => setMiniHover(true)} onMouseLeave={() => setMiniHover(false)}
							style={{ position: "absolute", inset: 0, zIndex: 3, opacity: miniHover ? 1 : 0, transition: "opacity .15s ease" }}>
							{/* top control strip */}
							<div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: 8, background: "linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(0,0,0,0))" }}>
								<Tooltip text="Expand">
									<button onClick={(e) => { e.stopPropagation(); if (minimized) { onRestore?.(); return; } expandFromMini(); }} aria-label="Expand" style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
										<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
									</button>
								</Tooltip>
								<Tooltip text="Close" placement="left">
									<button onClick={(e) => { e.stopPropagation(); if (minimized) { onClose?.(); return; } setMiniPlayer(false); setPlaying(false); }} aria-label="Close mini player" style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, lineHeight: 1 }}>×</button>
								</Tooltip>
							</div>
							{/* center play / pause */}
							<button onClick={toggleMiniPlay} aria-label={miniPaused ? "Play" : "Pause"} style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 52, height: 52, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
								{miniPaused
									? <svg width={24} height={24} viewBox="0 0 24 24" fill="#fff"><polygon points="6 4 20 12 6 20 6 4"/></svg>
									: <svg width={24} height={24} viewBox="0 0 24 24" fill="#fff"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>}
							</button>
							{/* bottom title strip */}
							<div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "16px 12px 8px", background: "linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0))" }}>
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 600, color: "#fff", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{video.title}</p>
							</div>
						</div>
					)}
				</div>
	);

	const relatedRailProps = {
		isMobile,
		railChips,
		railChip,
		onRailChip: setRailChip,
		chipScrollRef,
		chipEdges,
		onChipScroll: measureChipEdges,
		onScrollChips: scrollChips,
		labelRef: upNextLabelRef,
		railList,
		onSelect: onVideoSelect,
		onBack,
		canPage: canPageRelated,
		sentinelRef: relatedSentinelRef,
		loadingMore: relatedLoading && related.length > 0,
	};

	return (
		<div
			ref={isMobile ? undefined : watchScrollRef}
			data-strug-page-scroll={isMobile ? undefined : ""}
			onScroll={isMobile ? undefined : handleWatchScroll}
			style={{
				flex: 1,
				display: "flex",
				flexDirection: "column",
				minHeight: 0,
				...(isMobile
					? { overflow: "hidden" }
					: { overflowY: "auto", overflowX: "hidden", paddingLeft: 108, paddingRight: 48 }),
			}}
		>
			{/* Mobile: player lives OUTSIDE the scroller so it stays on screen while title /
			    related / comments move. Same NativeVideoPlayer instance — leaving the page still
			    docks it to the bottom strip via `minimized` styles, without remounting. */}
			{isMobile && playerBlock}
			<div
				ref={isMobile ? watchScrollRef : undefined}
				data-strug-page-scroll={isMobile ? "" : undefined}
				style={isMobile
					? { flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", paddingLeft: MOBILE_GUTTER_PX, paddingRight: MOBILE_GUTTER_PX, paddingBottom: 40 }
					: { display: "contents" }}
			>
			<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 28, width: "100%", padding: isMobile ? "12px 0 0" : "28px 0 40px", ...(isMobile || theater ? {} : { justifyContent: "center" }) }}>
				{/* Main */}
				{/* The player is a 16:9 box of the column's width, so on a wide screen it grew taller
				    than the window and you had to scroll to see the bottom of your own video. The
				    column is capped by the height available instead: the player shrinks to fit, and
				    because the cap is on the column, everything under it stays exactly the player's
				    width. Theater mode sets its own height and keeps the full width. */}
				<div style={{ flex: 1, minWidth: 0, ...(isMobile || theater ? {} : { maxWidth: WATCH_COLUMN_MAX }) }}>
					{/* flow-root, so the row's bottom margin is measured inside this box instead of
					    collapsing through it — otherwise the rail lands that margin too high. */}
					<div ref={abovePlayerRef} style={{ display: "flow-root" }}>
					<div style={{ display: isMobile ? "none" : "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
						<button onClick={leave} className="text-text-secondary" style={{ background: "none", border: "none",  cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, padding: 0, flexShrink: 0 }}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
							{!isMobile && "Videos"}
						</button>
						{/* Centered search w/ two-pane suggestions — routes into the Videos browse search. */}
						{onSearch && (
							<div style={{ flex: 1, maxWidth: 560, margin: "0 auto" }}>
								<SearchSuggestBox
									value={searchQ}
									onChange={setSearchQ}
									onSubmit={(q) => onSearch(q)}
									onPickVideo={(v) => { if (onVideoSelect) onVideoSelect(v); }}
									isMobile={isMobile}
									placeholder={i18n.t("videos.searchPlaceholder", { defaultValue: "Search videos" })}
								/>
							</div>
						)}
					</div>
					</div>

					{/* Player — HLS for self-hosted video. On mobile it is rendered above this
					    scroller so it stays pinned. Desktop still detaches to a bottom-right mini
					    card on scroll (BUG #25); leaving the page docks to the corner strip. */}
					{!isMobile && playerBlock}
					{/* spacer preserves layout height while the player is detached */}
					{!isMobile && miniPlayer && <div style={{ width: "100%", paddingTop: "56.25%", marginBottom: 18 }} />}

					{/* Title + meta — YouTube watch: 1-line ellipsis, "...more" expands. */}
					<h1
						className="text-text-primary watch-video-title"
						data-testid="watch-video-title"
						dir={isMobile ? "auto" : undefined}
						onClick={canExpandWatchInfo ? () => setShowFullDesc(v => !v) : undefined}
						style={{
							fontFamily: "'DM Sans', sans-serif",
							fontWeight: isMobile ? MOBILE_WATCH_TYPE.title.fontWeight : 700,
							fontSize: isMobile ? MOBILE_WATCH_TYPE.title.fontSize : 20,
							lineHeight: isMobile ? MOBILE_WATCH_TYPE.title.lineHeight : 1.3,
							margin: "0 0 6px",
							width: "100%",
							minWidth: 0,
							overflowWrap: showFullDesc ? "anywhere" : "normal",
							textAlign: isMobile ? "start" : undefined,
							cursor: canExpandWatchInfo ? "pointer" : "default",
							...(watchTitleClamp ? { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } : { whiteSpace: "normal" }),
						}}
					>{watchTitleText}</h1>
					<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: isMobile ? 12 : 16, flexWrap: "wrap" }}>
						<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? MOBILE_WATCH_TYPE.meta.fontSize : 12 }}>{fmtVideoViews(localViewsCount)}</span>
						<span className="text-text-muted">·</span>
						<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? MOBILE_WATCH_TYPE.meta.fontSize : 12 }}>{video.ago}</span>
						{canExpandWatchInfo && (
							<>
								<span className="text-text-muted">·</span>
								<button
									type="button"
									data-testid="watch-title-more"
									aria-expanded={showFullDesc}
									onClick={() => setShowFullDesc(v => !v)}
									className="text-text-secondary"
									style={{ background: "none", border: "none", padding: 0, fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? MOBILE_WATCH_TYPE.meta.fontSize : 12, fontWeight: 700, cursor: "pointer" }}
								>
									{showFullDesc ? i18n.t("common.showLess") : i18n.t("videos.titleMore", { defaultValue: "...more" })}
								</button>
							</>
						)}
					</div>

					{/* Actions row — labelled chips that scroll horizontally on mobile,
					    wrapping pills on desktop. */}
					{/* Idle/unselected chip states used to hardcode faint white overlays + white-ish text,
					    assuming an always-dark page — tokenized so idle chips stay legible in light theme
					    too. Active states (accent colors) are untouched (rule 2). */}
					<div className="scroll-area" style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 10, marginBottom: 20, flexWrap: isMobile ? "nowrap" : "wrap", ...(isMobile ? { overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" } : {}) }}>
						<button onClick={async () => { const wasLiked = liked; const wasDisliked = disliked; setLiked(v => !v); if (!liked && wasDisliked) { setDisliked(false); setDislikeCount(c => Math.max(0, c - 1)); } setLikeCount(c => liked ? Math.max(0, c - 1) : c + 1); if (onToggleLike) onToggleLike(videoId ?? video?.id); if (videoId != null) { try { await toggleVideoLike(videoId); } catch { setLiked(wasLiked); setLikeCount(c => liked ? c + 1 : Math.max(0, c - 1)); } } }} style={{ display: "flex", alignItems: "center", gap: 6, padding: isMobile ? "8px 13px" : "8px 16px", flexShrink: 0, whiteSpace: "nowrap", background: liked ? "#2563eb18" : "var(--color-surface)", border: `1px solid ${liked ? "#2563eb50" : "var(--color-border)"}`, borderRadius: 20, color: liked ? "#2563eb" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 14 : 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
							<svg width={15} height={15} viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
							{likeCount > 0 ? formatCount(likeCount) : (liked ? i18n.t("feed.liked") : i18n.t("common.like"))}
						</button>
						<button onClick={async () => { const wasDisliked = disliked; const wasLiked = liked; setDisliked(v => !v); if (!disliked && wasLiked) { setLiked(false); setLikeCount(c => Math.max(0, c - 1)); if (onToggleLike) onToggleLike(videoId ?? video?.id); } setDislikeCount(c => disliked ? Math.max(0, c - 1) : c + 1); if (videoId != null) { try { await toggleVideoDislike(videoId); } catch { setDisliked(wasDisliked); setDislikeCount(c => disliked ? c + 1 : Math.max(0, c - 1)); } } }} style={{ display: "flex", alignItems: "center", gap: 6, padding: isMobile ? "8px 13px" : "8px 16px", flexShrink: 0, whiteSpace: "nowrap", background: disliked ? "#ef444418" : "var(--color-surface)", border: `1px solid ${disliked ? "#ef444450" : "var(--color-border)"}`, borderRadius: 20, color: disliked ? "#ef4444" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 14 : 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
							<svg width={15} height={15} viewBox="0 0 24 24" fill={disliked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>
							{dislikeCount > 0 ? formatCount(dislikeCount) : (disliked ? i18n.t("videos.disliked") : i18n.t("videos.dislike"))}
						</button>
						<button onClick={() => { setSaved(v => !v); if (onToggleSave) onToggleSave(videoId); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: isMobile ? "8px 13px" : "8px 16px", flexShrink: 0, whiteSpace: "nowrap", background: saved ? "#7c3aed18" : "var(--color-surface)", border: `1px solid ${saved ? "#7c3aed50" : "var(--color-border)"}`, borderRadius: 20, color: saved ? "#a78bfa" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 14 : 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
							<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
							{saved ? i18n.t("social.saved") : i18n.t("common.save")}
						</button>
						{canRecommendFromWatch && (
							<button type="button" data-testid="watch-recommend" aria-label={i18n.t("videos.recommendToSubscribers", { defaultValue: "Recommend to subscribers" })} aria-busy={recommendPending} disabled={recommendPending} onClick={recommendFromWatch} style={{ display: "flex", alignItems: "center", gap: 6, padding: isMobile ? "8px 13px" : "8px 16px", flexShrink: 0, whiteSpace: "nowrap", background: "#7c3aed18", border: "1px solid #7c3aed50", borderRadius: 20, color: "#a78bfa", fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 14 : 13, fontWeight: 700, cursor: recommendPending ? "wait" : "pointer", opacity: recommendPending ? 0.68 : 1, transition: "background .15s ease, border-color .15s ease, color .15s ease, opacity .15s ease" }}>
								<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 2 2.4 7.2H22l-6 4.8 2.4 7.2-6.4-4.4-6.4 4.4L8 14 2 9.2h7.6L12 2Z" /></svg>
								{recommendPending ? i18n.t("videos.recommending", { defaultValue: "Recommending…" }) : i18n.t("videos.recommend", { defaultValue: "Recommend" })}
							</button>
						)}
						<button onClick={handleShare} style={{ display: "flex", alignItems: "center", gap: 6, padding: isMobile ? "8px 13px" : "8px 16px", flexShrink: 0, whiteSpace: "nowrap", background: shareDone ? "#2563eb18" : "var(--color-surface)", border: `1px solid ${shareDone ? "#2563eb50" : "var(--color-border)"}`, borderRadius: 20, color: shareDone ? "#60a5fa" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 14 : 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
							<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
							{shareDone ? i18n.t("common.copied") : i18n.t("common.share")}
						</button>
						<button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddToPlaylist?.(video); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: isMobile ? "8px 13px" : "8px 16px", flexShrink: 0, whiteSpace: "nowrap", background: playlistSaved ? "#2563eb18" : "var(--color-surface)", border: `1px solid ${playlistSaved ? "#2563eb50" : "var(--color-border)"}`, borderRadius: 20, color: playlistSaved ? "#2563eb" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 14 : 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
							<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
							{playlistSaved ? i18n.t("videos.added", { defaultValue: "Added" }) : i18n.t("videos.addToPlaylist")}
						</button>
						<div style={{ position: "relative", marginLeft: isMobile ? 0 : "auto", flexShrink: 0 }}>
							<button onClick={() => setShowMenu(v => !v)} className="bg-surface border border-border text-text-secondary" style={{ width: 34, height: 34, borderRadius: "50%",   display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
								<svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
							</button>
							{showMenu && createPortal(
							<div onClick={() => setShowMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 18 }} />,
							document.body
						)}
						{showMenu && (
							<div className="bg-surface-raised border border-border" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)",   borderRadius: 12, overflow: "hidden", zIndex: 19, minWidth: 160, boxShadow: "0 8px 32px var(--color-shadow)" }}>
									{[
										{ id: "playlist", label: i18n.t("videos.addToPlaylist") },
										canRecommendVideoToSubscribers(video, myChannelId) && onRecommend && {
											id: "recommend",
											label: i18n.t("videos.recommendToSubscribers", { defaultValue: "Recommend to subscribers" }),
										},
										{ id: "notInterested", label: i18n.t("social.notInterested") },
										{ id: "report", label: i18n.t("profile.report") },
									].filter(Boolean).map(opt => (
										<button key={opt.id} onClick={() => {
											setShowMenu(false);
											if (opt.id === "report") setShowReport(true);
											if (opt.id === "playlist" && onAddToPlaylist) onAddToPlaylist(video);
											if (opt.id === "recommend" && onRecommend) onRecommend(video);
										}} style={{ display: "block", width: "100%", padding: "11px 16px", background: "none", border: "none", color: opt.id === "report" ? "#ef4444" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer", textAlign: "left" }}
											onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface)"}
											onMouseLeave={e => e.currentTarget.style.background = "none"}>
											{opt.label}
										</button>
									))}
								</div>
							)}
						</div>
					</div>

					{/* Channel row */}
					<div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderTop: "1px solid var(--color-border-subtle)", borderBottom: "1px solid var(--color-border-subtle)", marginBottom: 20 }}>
						<button onClick={onChannel} style={{ width: 44, height: 44, borderRadius: "50%",
							background: "#1e3a5f", border: "none", display: "flex", alignItems: "center",
							justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif",
							fontWeight: 800, fontSize: 18, color: "#fff", cursor: "pointer",
							flexShrink: 0, overflow: "hidden" }}>
							<SafeImage loading="lazy" decoding="async" src={video.profile_pic_url}
								alt={channelLabel}
								style={{ width: "100%", height: "100%", objectFit: "cover" }}
								fallback={avatarLabel} />
						</button>
						<div style={{ flex: 1 }}>
							<button onClick={onChannel} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: isMobile ? 600 : 700, fontSize: isMobile ? MOBILE_WATCH_TYPE.body.fontSize : 14,  marginBottom: 2 }}>{channelLabel}</p>
							</button>
							{subscriberCount > 0 && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? MOBILE_WATCH_TYPE.meta.fontSize : 12 }}>{fmtVideoSubscribers(subscriberCount)}</p>}
						</div>
						{/* Unsubscribed = the high-contrast inverted CTA used for "Subscribe" everywhere in the
						    app (see Social.jsx) — background/text swap with the theme so it stays max-contrast
						    in both. Subscribed = a quiet secondary state on the page surface. */}
						<button onClick={handleToggleSubscribe} disabled={subscribeLoading} className={subscribed ? "bg-surface-raised text-text-primary" : "bg-text-primary text-bg"} style={{ padding: isMobile ? "10px 18px" : "9px 20px", border: "none", borderRadius: 20, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 14 : 13, cursor: "pointer", transition: "all 0.15s", opacity: subscribeLoading ? 0.7 : 1 }}>
							{subscribed ? i18n.t("videos.subscribed") : i18n.t("videos.subscribe")}
						</button>
					</div>

					{/* Description — skip the empty card when there is nothing to show. */}
					{!!(video.description || "").trim() && (
					<div className="bg-surface" style={{  borderRadius: 12, padding: "14px 16px", marginBottom: 24 }}>
						<p id={descriptionId} dir={isMobile ? "auto" : undefined} className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? MOBILE_WATCH_TYPE.description.fontSize : 13, lineHeight: isMobile ? MOBILE_WATCH_TYPE.description.lineHeight : 1.6, overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: showFullDesc ? "unset" : 2, ...(isMobile ? { whiteSpace: "pre-wrap", overflowWrap: "anywhere", textAlign: "start", margin: 0 } : {}) }}>
							{video.description}
						</p>
						<button type="button" aria-expanded={showFullDesc} aria-controls={descriptionId} onClick={() => setShowFullDesc(v => !v)} className="text-text-secondary" style={{ background: "none", border: "none",  fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: "pointer", padding: isMobile ? "8px 0" : "6px 0 0", minHeight: isMobile ? 44 : undefined, display: "block" }}>
							{showFullDesc ? i18n.t("common.showLess") : i18n.t("common.showMore")}
						</button>
					</div>
					)}

					{/* Comments — compact tap-to-open on mobile, inline on desktop. On a phone this
					    sits under the description (YouTube order), not after the suggestions list. */}
					{isMobile ? (
						<button onClick={() => setCommentSheetOpen(true)} className="bg-surface border border-border-subtle" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "14px 16px",   borderRadius: 14, cursor: "pointer", marginBottom: 20 }}>
							<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: MOBILE_WATCH_TYPE.label.fontWeight, fontSize: MOBILE_WATCH_TYPE.label.fontSize }}>{comments.length} Comments</span>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto" }}><polyline points="9 18 15 12 9 6"/></svg>
						</button>
					) : (
						<>
							<h3 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15,  marginBottom: 16 }}>{comments.length} Comments</h3>
							<div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
								<div style={{ width: 36, height: 36, borderRadius: "50%", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 15, color: "#fff", flexShrink: 0 }}>Y</div>
								<div style={{ flex: 1 }}>
									<textarea
										value={newComment}
										onChange={e => setNewComment(e.target.value)}
										placeholder={i18n.t("videos.addComment")}
										rows={1}
										className="text-text-primary" style={{ width: "100%", background: "transparent", border: "none", borderBottom: `1px solid ${newComment ? "#2563eb" : "var(--color-border)"}`,  fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.6, padding: "4px 0", resize: "none", outline: "none", boxSizing: "border-box", transition: "border-color 0.15s" }}
										onFocus={e => e.target.rows = 3}
										onBlur={e => { if (!newComment) e.target.rows = 1; }}
									/>
									{newComment && (
										<div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
											<button onClick={() => setNewComment("")} className="text-text-secondary" style={{ padding: "7px 16px", background: "transparent", border: "none",  fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 20 }}>{i18n.t("common.cancel")}</button>
											<button onClick={async () => { const text = newComment; setNewComment(""); await submitComment(text); }} style={{ padding: "7px 18px", background: "#2563eb", border: "none", borderRadius: 20, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{i18n.t("common.comment")}</button>
										</div>
									)}
								</div>
							</div>
							<div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
								{comments.map((c, i) => (
									<div key={c._id ?? `c-${i}`} style={{ display: "flex", gap: 12 }}>
										<div style={{ width: 36, height: 36, borderRadius: "50%", background: c.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 15, color: "#fff", flexShrink: 0, overflow: "hidden" }}>
											<SafeImage loading="lazy" decoding="async" src={c.avatarUrl} alt={c.user} style={{ width: "100%", height: "100%", objectFit: "cover" }} fallback={c.avatar} />
										</div>
										<div style={{ flex: 1 }}>
											<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
												<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13 }}>{c.user}</span>
												<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{c.time}</span>
											</div>
											<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13,  lineHeight: 1.5 }}>{c.text}</p>
											<button onClick={async () => {
												if (!c._id || !/^\d+$/.test(String(c._id))) return; // audit F3: only real numeric comments are likeable
												const isLiked = commentLikes[c._id];
												setCommentLikes(prev => ({ ...prev, [c._id]: !isLiked }));
												setComments(prev => prev.map(cm => cm._id === c._id ? { ...cm, like_count: (cm.like_count ?? 0) + (isLiked ? -1 : 1) } : cm));
												try { await toggleCommentLike(videoId, c._id); } catch { setCommentLikes(prev => ({ ...prev, [c._id]: isLiked })); }
											}} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: commentLikes[c._id] ? "#ef4444" : "var(--color-text-muted)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, padding: "4px 0", marginTop: 4 }}>
												<svg width={13} height={13} viewBox="0 0 24 24" fill={commentLikes[c._id] ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
												{(c.like_count ?? 0) > 0 && <span>{c.like_count}</span>}
											</button>
											{c.userId != null && myUserId != null && c.userId === myUserId && (
												<Tooltip text="Delete comment"><button onClick={() => handleDeleteComment(c._id)} className="text-text-muted" style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none",  cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, padding: "4px 0", marginTop: 4, marginLeft: 14 }}>
													<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
													<span>Delete</span>
												</button></Tooltip>
											)}
										</div>
									</div>
								))}
							</div>
						</>
					)}

					{isMobile && (
						<div style={{ marginBottom: 20 }}>
							<RelatedVideosRail {...relatedRailProps} showHeading={false} sticky={false} />
						</div>
					)}
				</div>

				{/* Desktop Up Next sidebar — mobile rail is inlined under comments. */}
				{!isMobile && !theater && (
					<RelatedVideosRail {...relatedRailProps} sticky stickyOffset={railOffset} showHeading={false} />
				)}
				</div>
			</div>

			{/* Mobile comment bottom sheet */}
			<CommentsSheet
				open={isMobile && commentSheetOpen}
				onClose={() => setCommentSheetOpen(false)}
				comments={comments.map((c, i) => ({
					id: c._id ?? `local_${i}`,
					user: c.user,
					avatar: c.avatar,
					avatarColor: c.avatarColor ?? "#1e3a5f",
					avatarUrl: c.avatarUrl,
					time: c.time,
					text: c.text,
					likes: c.like_count ?? 0,
					liked: !!commentLikes[c._id],
					canDelete: c.userId != null && myUserId != null && c.userId === myUserId,
				}))}
				draft={newComment}
				onDraftChange={setNewComment}
				onSubmit={async () => {
					const text = newComment.trim();
					if (!text) return;
					setNewComment("");
					await submitComment(text);
				}}
				onToggleLike={async cm => {
					const id = cm.id;
					if (typeof id !== "number" && !String(id).match(/^\d+$/)) return;
					const isLiked = commentLikes[id];
					setCommentLikes(prev => ({ ...prev, [id]: !isLiked }));
					setComments(prev => prev.map(c => c._id === id ? { ...c, like_count: (c.like_count ?? 0) + (isLiked ? -1 : 1) } : c));
					try { await toggleCommentLike(videoId, id); } catch { setCommentLikes(prev => ({ ...prev, [id]: isLiked })); }
				}}
				onReply={cm => setNewComment(`@${cm.user} `)}
				onDelete={cm => handleDeleteComment(cm.id)}
			/>
			{watchDialog}
			{/* Was a dead dialog: every reason button just closed it, so no video report was
			    ever submitted. Now uses the shared ReportModal, which posts a real
			    social_report with target_type VIDEO. */}
			<ReportModal
				open={showReport}
				onClose={() => setShowReport(false)}
				targetType="VIDEO"
				targetId={video?.id ?? video?.videoId}
				title={i18n.t("videos.reportVideo")}
			/>
			{shareOpen && (
				<VideoShareDialog video={video} startAtSec={shareStartSec} onClose={() => setShareOpen(false)} />
			)}
		</div>
	);
}

function VideoChannelPage({ channel, onBack, myChannelId = null, cardActions, onOpenPlaylist, onOpenChannel, onRecommendChannel }) {
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [channelVideos, setChannelVideos] = useState([]);
	const [chLoading, setChLoading] = useState(true);
	// Authoritative channel branding pulled from the feed response (banner_url, profile_pic_url,
	// display_name). Never derive the banner from a video thumbnail — see the upload-thumbnail bug.
	const [chInfo, setChInfo] = useState(null);
	// Home highlight: defaults to the latest long video; owners can pin one in localStorage.
	// Play always opens the full watch page (same as browse) — never an in-profile player.
	const [featuredId, setFeaturedId] = useState(null);
	const [subscribed, setSubscribed] = useState(false);
	const [subscribeLoading, setSubscribeLoading] = useState(false);
	const [subscriberCount, setSubscriberCount] = useState(channel?.subscriber_count ?? 0);
	// #473: the feed's channel object carries neither a bio nor a subscriber count, so the header
	// showed "—" subscribers and no description. Hydrate the full profile once we know the handle.
	const [channelProfile, setChannelProfile] = useState(null);
	const [selectedChannelVideo, setSelectedChannelVideo] = useState(null);
	const [channelTab, setChannelTab] = useState("home");
	useEffect(() => {
		// Accept camelCase channelId too: shorts and the subscriptions list pass { channelId },
		// whereas the video flow passes snake_case channel_id. Without this, opening a creator
		// from a short loaded no videos (bug #17).
		const cid = channelIdOf(channel);
		if (!cid) {
			setChLoading(false);
			setChannelVideos([]);
			setChInfo(null);
			setChannelProfile(null);
			return;
		}
		// Drop the previous channel's branding/videos immediately so a switch never flashes the
		// wrong creator while the new feed is in flight (remount key also resets, this covers
		// same-instance updates).
		setChLoading(true);
		setChannelVideos([]);
		setChInfo(null);
		setChannelProfile(null);
		setFeaturedId(null);
		setSelectedChannelVideo(null);
		setChannelTab("home");
		setSubscriberCount(channel?.subscriber_count ?? 0);
		// include_shorts=true so the creator's shorts show on their channel alongside long videos
		// limit:50 (backend max) so a creator's public channel page shows their full
		// library, not just the default ~12 (#386). >50 would need offset paging.
		let cancelled = false;
		getVideoFeed({ channel_id: cid, include_shorts: true, limit: 50 }).then(data => {
			if (cancelled) return;
			const raw = listFrom(data);
			const fromFeed = raw.find(v => v.channel)?.channel ?? null;
			setChInfo(fromFeed);
			const items = raw.filter(v => !v.status || v.status === 'safe' || v.status === 'ready');
			setChannelVideos(items.map(v => ({
				id: v.video_id,
				title: videoTitleOf(v.title),
				channel: v.channel?.display_name ?? channel.channel ?? channel.name ?? "Creator",
				avatar: (v.channel?.display_name ?? channel.channel ?? channel.name ?? "C")[0].toUpperCase(),
				profile_pic_url: v.channel?.profile_pic_url ?? null,
				views: fmtVideoViews(v.views_count ?? 0),
				views_count: v.views_count ?? 0,
				description: typeof v.description === "string" ? v.description : "",
				created_at: v.created_at ?? null,
				ago: v.created_at ? timeAgo(v.created_at) : "",
				duration: v.duration_sec ? `${Math.floor(v.duration_sec / 60)}:${String(v.duration_sec % 60).padStart(2, "0")}` : "0:00",
				section: "recent",
				category: v.category || videoCategoryGeneral(),
				videoId: v.video_id,
				channel_id: v.channel?.channel_id ?? cid,
				handle: v.channel?.handle ?? channel.handle ?? null,
				processed_video_url: v.hls_url ?? v.processed_video_url ?? null,
				// Surface transcode state so the owner can see un-transcoded uploads instead of
				// them silently "disappearing" (bug #46). Only the owner's own feed includes these.
				processing_status: v.processing_status ?? null,
				is_failed: v.processing_status === 'error',
				// Badge processing ONLY when the status explicitly says so. The /video/feed
				// list (what this page loads) never returns hls_url and already filters to
				// processing_status:'done', so inferring "processing" from a missing hls_url
				// flagged EVERY (already-done) video as "Processing…" on the channel page.
				is_processing: v.processing_status === 'processing' || v.processing_status === 'pending',
				is_short: v.video_type === 'shorts' || v.is_short === true,
				video_type: v.video_type,
				thumb: v.thumbnail_url ?? "linear-gradient(135deg, #1e3a5f, #0f2744)",
			})));
		}).catch(() => { if (!cancelled) setChannelVideos([]); }).finally(() => { if (!cancelled) setChLoading(false); });
		return () => { cancelled = true; };
	}, [channel?.id, channel?.channel_id, channel?.channelId]);

	// Open a channel-context video WITH hydration. Channel feed items carry `videoId` (not `id`)
	// and no hls_url, so — like the main selectVideo — fetch the full /video/play payload and merge
	// the playable URL in. Without this, opening a fully-processed video from the channel/profile
	// page rendered "This video is still processing" for an actually-playable video (empty src).
	const openChannelVideo = (v) => {
		const pageCid = channelIdOf(channel);
		const stamped = {
			...v,
			channel_id: v?.channel_id ?? pageCid ?? null,
		};
		setSelectedChannelVideo(stamped);
		const vid = stamped?.id ?? stamped?.videoId;
		if (vid) getVideo(vid).then(full => {
			if (!full) return;
			const mapped = mapApiVideo(full);
			setSelectedChannelVideo(prev => prev && (prev.id ?? prev.videoId) === vid
				? { ...prev, ...mapped, channel_id: mapped.channel_id ?? prev.channel_id ?? pageCid ?? null }
				: prev);
		}).catch(() => {});
	};
	const channelId = channelIdOf(channel);
	useEffect(() => {
		if (!channelId) return;
		let cancelled = false;
		getChannelSubscriptionStatus(channelId).then(d => {
			if (!cancelled) setSubscribed(!!d?.subscribed);
		}).catch(() => {});
		return () => { cancelled = true; };
	}, [channelId]);
	// #473: pull bio + subscriber count from the full channel profile (feed data has neither).
	useEffect(() => {
		const handle = chInfo?.handle || channel?.handle;
		if (!handle) return;
		let cancelled = false;
		getChannelByHandle(handle).then(d => {
			if (cancelled) return;
			const p = d?.data ?? d;
			if (!p) return;
			setChannelProfile(p);
			if (p?._count?.subscriptions != null) setSubscriberCount(p._count.subscriptions);
		}).catch(() => {});
		return () => { cancelled = true; };
	}, [chInfo?.handle, channel?.handle]);
	async function handleToggleSubscribe() {
		if (!channelId || subscribeLoading) return;
		setSubscribeLoading(true);
		try {
			if (subscribed) {
				const res = await unsubscribeFromChannel(channelId);
				setSubscribed(false);
				setSubscriberCount(c => res?.subscriber_count ?? Math.max(0, c - 1));
			} else {
				const res = await subscribeToChannel(channelId);
				setSubscribed(true);
				setSubscriberCount(c => res?.subscriber_count ?? c + 1);
			}
		} catch { /* noop */ }
		setSubscribeLoading(false);
	}

	const [videoSort, setVideoSort] = useState("latest");
	const [channelPlaylists, setChannelPlaylists] = useState([]);
	const [plLoading, setPlLoading] = useState(false);
	const [bioOpen, setBioOpen] = useState(false);
	// Split once and hold onto it. Filtering inline handed `sortedLongVideos` a brand new array on
	// every render, so its useMemo could never hit and the compiler skipped it entirely — the sort
	// ran again on every unrelated render of the page.
	const { longVideos, channelShorts } = useMemo(() => {
		const isShort = (v) => v.is_short === true || v.video_type === "shorts";
		return {
			longVideos: channelVideos.filter((v) => !isShort(v)),
			channelShorts: channelVideos.filter(isShort),
		};
	}, [channelVideos]);
	const longsByLatest = useMemo(() => {
		const list = [...longVideos];
		const ts = (v) => {
			const t = Date.parse(v.created_at);
			return Number.isFinite(t) ? t : 0;
		};
		list.sort((a, b) => ts(b) - ts(a));
		return list;
	}, [longVideos]);
	const isOwnChannel = myChannelId != null && channelId != null && Number(channelId) === Number(myChannelId);
	const featuredStorageKey = channelId != null ? `strug.channelFeatured.${channelId}` : null;
	// Pick the highlight: owner's pinned id (if still in the catalogue) else the latest long video.
	useEffect(() => {
		if (!longsByLatest.length) { setFeaturedId(null); return; }
		const ids = new Set(longsByLatest.map((v) => v.id ?? v.videoId).filter((id) => id != null).map(Number));
		let pick = null;
		if (isOwnChannel && featuredStorageKey) {
			try {
				const saved = Number(localStorage.getItem(featuredStorageKey));
				if (Number.isFinite(saved) && ids.has(saved)) pick = saved;
			} catch { /* private mode */ }
		}
		if (pick == null) pick = Number(longsByLatest[0].id ?? longsByLatest[0].videoId);
		setFeaturedId((prev) => (prev != null && ids.has(Number(prev)) ? prev : pick));
	}, [longsByLatest, isOwnChannel, featuredStorageKey]);
	const featured = useMemo(() => {
		if (!longsByLatest.length) return null;
		if (featuredId == null) return longsByLatest[0];
		return longsByLatest.find((v) => Number(v.id ?? v.videoId) === Number(featuredId)) ?? longsByLatest[0];
	}, [longsByLatest, featuredId]);
	const homeLongs = useMemo(() => {
		if (!featured) return longsByLatest;
		const fid = featured.id ?? featured.videoId;
		return longsByLatest.filter((v) => (v.id ?? v.videoId) !== fid);
	}, [longsByLatest, featured]);
	const setFeaturedVideo = (v, { pin = false } = {}) => {
		const id = v?.id ?? v?.videoId;
		if (id == null) return;
		setFeaturedId(Number(id));
		if (pin && isOwnChannel && featuredStorageKey) {
			try { localStorage.setItem(featuredStorageKey, String(id)); } catch { /* noop */ }
		}
	};
	const sortedLongVideos = useMemo(() => {
		const list = [...longVideos];
		const ts = (v) => {
			const t = Date.parse(v.created_at);
			return Number.isFinite(t) ? t : 0;
		};
		const viewsOf = (v) => {
			const n = Number(v.views_count);
			return Number.isFinite(n) ? n : 0;
		};
		if (videoSort === "oldest") list.sort((a, b) => ts(a) - ts(b));
		else if (videoSort === "popular") list.sort((a, b) => viewsOf(b) - viewsOf(a) || ts(b) - ts(a));
		else list.sort((a, b) => ts(b) - ts(a));
		return list;
	}, [longVideos, videoSort]);
	const displayName = chInfo?.display_name || channelProfile?.display_name || channel.display_name || channel.channel || channel.name || "Creator";
	const handleLabel = (chInfo?.handle || channel?.handle || channelProfile?.handle || "").replace(/^@/, "");
	const bio = channelProfile?.description || chInfo?.description || channel.description || channel.bio || "";
	const bannerUrl = (typeof chInfo?.banner_url === "string" && chInfo.banner_url) || (typeof channel.banner_url === "string" && channel.banner_url) || (typeof channelProfile?.banner_url === "string" && channelProfile.banner_url) || null;
	const avatarUrl = chInfo?.profile_pic_url || channel.profile_pic_url || channelProfile?.profile_pic_url;
	const colPad = isMobile ? MOBILE_GUTTER_PX : 108;

	useEffect(() => {
		if (channelTab !== "playlists" || !channelId) return;
		let cancelled = false;
		setPlLoading(true);
		getChannelPlaylists(channelId).then((d) => {
			if (cancelled) return;
			setChannelPlaylists(listFrom(d).map(mapPlaylist).filter((p) => !isMixPlaylist(p.name)));
		}).catch(async (err) => {
			console.error("[channel] playlists failed", err?.message || err);
			if (isOwnChannel) {
				try {
					const d = await getPlaylists();
					if (cancelled) return;
					setChannelPlaylists(listFrom(d).map(mapPlaylist).filter((p) => !isMixPlaylist(p.name)));
					return;
				} catch (ownErr) {
					console.error("[channel] own playlists failed", ownErr?.message || ownErr);
				}
			}
			if (!cancelled) setChannelPlaylists([]);
		}).finally(() => { if (!cancelled) setPlLoading(false); });
		return () => { cancelled = true; };
	}, [channelTab, channelId, isOwnChannel]);

	const hScroll = {
		display: "flex",
		overflowX: "auto",
		scrollbarWidth: "none",
		msOverflowStyle: "none",
		WebkitOverflowScrolling: "touch",
		overscrollBehaviorX: "contain",
	};
	const edgeBleed = isMobile
		? { marginLeft: -MOBILE_GUTTER_PX, marginRight: -MOBILE_GUTTER_PX, paddingLeft: MOBILE_GUTTER_PX, paddingRight: MOBILE_GUTTER_PX }
		: {};
	const videoGrid = (list) => (
		<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : VIDEO_FEED_GRID, gap: isMobile ? 14 : 20 }}>
			{chLoading ? (
				[...Array(6)].map((_, i) => <SkeletonVideoCard key={i} />)
			) : list.length === 0 ? (
				<div className="text-text-muted" style={{ gridColumn: "1 / -1", width: "100%", textAlign: "center", padding: "48px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("videos.noVideosYet")}</div>
			) : list.map((v, i) => <VideoCard key={v.id ?? v.videoId ?? v.title + i} video={v} delay={i * 40} onClick={() => openChannelVideo(v)} data-testid="channel-video-card" style={{ width: "100%" }} {...cardActions} shelf />)}
		</div>
	);

	const channelTabs = [
		{ id: "home", label: i18n.t("videos.channelHome") },
		{ id: "videos", label: i18n.t("videos.title") },
		{ id: "shorts", label: i18n.t("videos.shorts") },
		{ id: "playlists", label: i18n.t("videos.playlists") },
	];
	const videoSortChips = [
		{ id: "latest", label: i18n.t("videos.latest") },
		{ id: "popular", label: i18n.t("videos.popular") },
		{ id: "oldest", label: i18n.t("videos.oldest") },
	];

	if (selectedChannelVideo) {
		const chIdx = channelVideos.findIndex(v => (v.id ?? v.videoId) === (selectedChannelVideo.id ?? selectedChannelVideo.videoId));
		const chOnNext = chIdx < channelVideos.length - 1 ? () => openChannelVideo(channelVideos[chIdx + 1]) : null;
		const chOnPrev = chIdx > 0 ? () => openChannelVideo(channelVideos[chIdx - 1]) : null;
		return (
			// #160: same-channel creator click returns to this page. Up Next can surface another
			// creator — open that channel instead of leaving the previous profile on screen.
			<VideoWatchPage
				key={selectedChannelVideo?.id ?? selectedChannelVideo?.videoId}
				video={selectedChannelVideo}
				onBack={() => setSelectedChannelVideo(null)}
				onChannel={() => {
					const v = selectedChannelVideo;
					setSelectedChannelVideo(null);
					const vidCid = channelIdOf(v);
					const pageCid = channelIdOf(channel);
					if (onOpenChannel && vidCid != null && pageCid != null && Number(vidCid) !== Number(pageCid)
						&& !Number.isNaN(Number(vidCid)) && !Number.isNaN(Number(pageCid))) {
						onOpenChannel(v);
					}
				}}
				likedIds={new Set()}
				onToggleLike={() => {}}
				onNext={chOnNext}
				onPrev={chOnPrev}
				onVideoSelect={v => openChannelVideo(v)}
				onAddToPlaylist={cardActions?.onAddToPlaylist}
				onRecommend={cardActions?.onRecommend}
				myChannelId={cardActions?.myChannelId}
				preferChannelUpNext
			/>
		);
	}

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
			<Skel w="100%" h={isMobile ? 100 : 160} r={0} />
			<div style={{ paddingLeft: isMobile ? MOBILE_GUTTER_PX : 108, paddingRight: isMobile ? MOBILE_GUTTER_PX : 48, paddingTop: 12 }}>
				<div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: isMobile ? 10 : 12, marginBottom: 16 }}>
					<Skel w={isMobile ? 72 : 112} h={isMobile ? 72 : 112} r="50%" />
					<div style={{ flex: 1, minWidth: 0 }}>
						<Skel w={isMobile ? 180 : 240} h={24} r={6} style={{ marginBottom: 6 }} />
						<Skel w={200} h={14} r={6} />
					</div>
					<Skel w={isMobile ? "100%" : 110} h={38} r={20} />
				</div>
				<div style={{ display: "flex", gap: 18, marginBottom: 18 }}>
					<Skel w={64} h={16} r={4} />
					<Skel w={72} h={16} r={4} />
					<Skel w={56} h={16} r={4} />
				</div>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
					{[...Array(6)].map((_, i) => <SkeletonVideoCard key={i} />)}
				</div>
			</div>
		</div>
	);

	return (
		<div data-strug-page-scroll style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
			<div style={{
				height: isMobile ? 100 : 160,
				position: "relative",
				overflow: "hidden",
				flexShrink: 0,
				marginLeft: isMobile ? MOBILE_GUTTER_PX : colPad,
				marginRight: isMobile ? MOBILE_GUTTER_PX : 48,
				borderRadius: isMobile ? 10 : 12,
				background: bannerUrl ? "#0d1421" : "linear-gradient(90deg,#152033 0%,#1e3a5f 45%,#0f2744 100%)",
			}}>
				<SafeImage loading="lazy" decoding="async" src={bannerUrl} alt=""
					style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
					fallback={<div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,#152033 0%,#1e3a5f 45%,#0f2744 100%)" }} />} />
				<button type="button" onClick={onBack} aria-label={i18n.t("common.back")} style={{ position: "absolute", top: 8, left: 12, background: "rgba(0,0,0,0.55)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", zIndex: 1 }}>
					<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					{i18n.t("common.back")}
				</button>
			</div>

			<div style={{ paddingLeft: colPad, paddingRight: isMobile ? MOBILE_GUTTER_PX : 48, paddingBottom: isMobile ? 24 : 40, paddingTop: isMobile ? 10 : 12 }}>
				<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", flexWrap: "wrap", alignItems: isMobile ? "stretch" : "center", gap: isMobile ? 10 : 12, paddingBottom: isMobile ? 10 : 12 }}>
					<div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: isMobile ? 10 : 12, minWidth: 0, flex: isMobile ? undefined : "1 1 0%" }}>
					<div style={{ width: isMobile ? 72 : 112, height: isMobile ? 72 : 112, borderRadius: "50%", background: "#1e3a5f", border: "1px solid var(--color-border-subtle)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 26 : 40, color: "#fff", flexShrink: 0, overflow: "hidden", boxSizing: "border-box" }}>
						<SafeImage loading="lazy" decoding="async" src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} fallback={channel.avatar || displayName[0]} />
					</div>
					<div style={{ flex: "1 1 0%", minWidth: 0 }}>
						<h1 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 16 : 20, lineHeight: 1.25, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isMobile ? "nowrap" : "normal", wordBreak: "normal", overflowWrap: "anywhere" }}>{displayName}</h1>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 12 : 13, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isMobile ? "nowrap" : "normal" }}>
							{handleLabel ? `@${handleLabel}` : null}
							{handleLabel ? " · " : null}
							{fmtVideoSubscribers(subscriberCount)}
							{" · "}
							{fmtVideoCount(channelVideos.length)}
						</p>
						{bio ? (
							<div style={{ marginTop: 4 }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.45, margin: 0, display: bioOpen ? "block" : "-webkit-box", WebkitLineClamp: bioOpen ? undefined : (isMobile ? 1 : 2), WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{bio}</p>
								{bio.length > 90 && (
									<button type="button" onClick={() => setBioOpen((o) => !o)} className="text-text-primary" style={{ background: "none", border: "none", padding: "2px 0 0", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>
										{bioOpen ? i18n.t("home.showLess") : i18n.t("home.showMore")}
									</button>
								)}
							</div>
						) : null}
					</div>
					</div>
					{isOwnChannel ? (
						<span className="text-text-secondary" data-testid="channel-own" style={{ flexShrink: 0, padding: isMobile ? "6px 10px" : "8px 14px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12 }}>{i18n.t("videos.yourChannel", { defaultValue: "Your channel" })}</span>
					) : (
						<div style={{ flex: isMobile ? "0 0 100%" : "0 0 auto", display: "flex", flexDirection: isMobile ? "column" : "row", flexShrink: 0, alignItems: isMobile ? "flex-end" : "center", gap: 8, flexWrap: isMobile ? "nowrap" : "wrap", justifyContent: "flex-end", paddingLeft: isMobile ? 82 : 0, boxSizing: "border-box" }}>
							{canRecommendChannelToSubscribers(channelId, myChannelId) && onRecommendChannel && (
								<button
									type="button"
									onClick={() => onRecommendChannel(channelId)}
									data-testid="channel-recommend"
									aria-label={i18n.t("videos.recommendChannel", { defaultValue: "Recommend channel" })}
									className="bg-surface-raised text-text-primary border border-border"
									style={{ order: isMobile ? 2 : 0, padding: isMobile ? "8px 12px" : "8px 14px", borderRadius: 16, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 12 : 13, cursor: "pointer" }}
								>
									{i18n.t("videos.recommendChannel", { defaultValue: "Recommend channel" })}
								</button>
							)}
							<button type="button" onClick={handleToggleSubscribe} disabled={subscribeLoading} data-testid="channel-subscribe" className={subscribed ? "bg-surface-raised text-text-primary" : "bg-text-primary text-bg"} style={{ order: isMobile ? 1 : 0, padding: isMobile ? "8px 12px" : "8px 16px", border: "none", borderRadius: 16, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 12 : 13, cursor: "pointer", transition: "all 0.15s", opacity: subscribeLoading ? 0.7 : 1 }}>
								{subscribed ? i18n.t("videos.subscribed") : i18n.t("videos.subscribe")}
							</button>
						</div>
					)}
				</div>

				<div role="tablist" aria-label={displayName} className="strug-share-row" style={{ ...hScroll, gap: isMobile ? 2 : 4, borderBottom: "1px solid var(--color-border-subtle)", marginBottom: channelTab === "videos" ? (isMobile ? 10 : 12) : (isMobile ? 12 : 18), ...edgeBleed }}>
					{channelTabs.map((tab) => {
						const on = channelTab === tab.id;
						return (
							<button
								key={tab.id}
								type="button"
								role="tab"
								aria-selected={on}
								data-testid={`channel-tab-${tab.id}`}
								onClick={() => setChannelTab(tab.id)}
								className={on ? "text-text-primary" : "text-text-secondary"}
								style={{ flexShrink: 0, background: "none", border: "none", borderBottom: on ? "2px solid var(--color-text-primary)" : "2px solid transparent", padding: isMobile ? "10px 12px" : "10px 4px", marginRight: isMobile ? 2 : 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: on ? 600 : 500, fontSize: isMobile ? 14 : 14, whiteSpace: "nowrap" }}
							>
								{tab.label}
							</button>
						);
					})}
				</div>

				{channelTab === "videos" && (
					<div role="group" aria-label={i18n.t("videos.title")} className="strug-share-row" style={{ ...hScroll, gap: 8, marginBottom: isMobile ? 12 : 18, paddingBottom: 2, ...edgeBleed }}>
						{videoSortChips.map((chip) => {
							const on = videoSort === chip.id;
							return (
								<button
									key={chip.id}
									type="button"
									data-testid={`channel-sort-${chip.id}`}
									aria-pressed={on}
									onClick={() => setVideoSort(chip.id)}
									className={on ? "bg-text-primary text-bg" : "bg-surface-raised text-text-primary"}
									style={{ flexShrink: 0, border: "none", borderRadius: 18, padding: isMobile ? "8px 14px" : "7px 14px", minHeight: 36, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: on ? 700 : 500, fontSize: 13 }}
								>
									{chip.label}
								</button>
							);
						})}
					</div>
				)}

				{channelTab === "home" && (
					<div>
						{featured && (
							<div data-testid="channel-featured" style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "flex-start", gap: isMobile ? 10 : 16, width: "100%", marginBottom: isMobile ? 20 : 28 }}>
								<button
									type="button"
									data-testid="channel-featured-open"
									onClick={() => openChannelVideo(featured)}
									aria-label={featured.title}
									style={{
										display: "block",
										flex: isMobile ? "none" : "1 1 52%",
										width: isMobile ? "100%" : undefined,
										maxWidth: isMobile ? "none" : 480,
										minWidth: 0,
										padding: 0,
										border: "none",
										borderRadius: isMobile ? 8 : 10,
										overflow: "hidden",
										position: "relative",
										aspectRatio: "16 / 9",
										background: "#000",
										cursor: "pointer",
									}}
								>
									{featured.thumb && String(featured.thumb).startsWith("http") ? (
										<img src={featured.thumb} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
									) : (
										<div style={{ position: "absolute", inset: 0, background: featured.thumb || "linear-gradient(135deg,#1e3a5f,#0f2744)" }} />
									)}
									<span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.28)" }}>
										<span style={{ width: isMobile ? 52 : 56, height: isMobile ? 52 : 56, borderRadius: "50%", background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
											<svg width={isMobile ? 26 : 28} height={isMobile ? 26 : 28} viewBox="0 0 24 24" fill="#fff"><polygon points="6 4 20 12 6 20 6 4"/></svg>
										</span>
									</span>
								</button>
								<div style={{ flex: "1 1 40%", minWidth: 0, paddingTop: isMobile ? 0 : 2, display: "flex", flexDirection: "column", gap: 8 }}>
									<button type="button" onClick={() => openChannelVideo(featured)} className="text-text-primary" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 14 : 16, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{featured.title}</button>
									<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }}>{[featured.views, featured.ago].filter(Boolean).join(" · ")}</p>
									{!isMobile && featured.description ? (
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.45, margin: 0, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{featured.description}</p>
									) : null}
									<div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
										<button type="button" onClick={() => openChannelVideo(featured)} style={{ padding: "7px 12px", borderRadius: 18, border: "none", background: "#2563eb", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{i18n.t("videos.play", { defaultValue: "Play" })}</button>
									</div>
								</div>
							</div>
						)}
						{channelShorts.length > 0 && (
							<VideoClipsShelf
								label={i18n.t("videos.shorts")}
								clips={channelShorts.map((s) => ({ ...s, views: s.views_count ?? s.views }))}
								inset={false}
								onOpen={(idx) => openChannelVideo(channelShorts[idx])}
								cardActions={cardActions}
							/>
						)}
						{homeLongs.length > 0 && (
							<div style={{ marginBottom: 28 }}>
								<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
									<h2 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 16 : 18, margin: 0 }}>{i18n.t("videos.title")}</h2>
									<button type="button" onClick={() => openChannelVideo(homeLongs[0])} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, padding: 0 }}>{i18n.t("videos.playAll")}</button>
								</div>
								<div className="strug-share-row" style={{ ...hScroll, gap: 12, paddingBottom: 8, ...edgeBleed }}>
									{homeLongs.map((v, i) => (
										<div key={v.id ?? v.videoId ?? v.title + i} style={{ position: "relative", flexShrink: 0 }}>
											<VideoCard
												video={v}
												delay={i * 40}
												onClick={() => openChannelVideo(v)}
												data-testid="channel-video-card"
												style={{ width: isMobile ? 220 : 280 }}
												{...cardActions}
												shelf
											/>
											{isOwnChannel && (
												<button
													type="button"
													data-testid="channel-feature-swap"
													onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFeaturedVideo(v, { pin: true }); }}
													className="bg-surface-raised text-text-primary border border-border"
													style={{ position: "absolute", top: 8, left: 8, zIndex: 4, padding: "4px 8px", borderRadius: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
												>
													{i18n.t("videos.showHere", { defaultValue: "Show here" })}
												</button>
											)}
										</div>
									))}
								</div>
							</div>
						)}
						{!chLoading && !featured && channelShorts.length === 0 && (
							<div className="text-text-muted" style={{ textAlign: "center", padding: "48px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("videos.noVideosYet")}</div>
						)}
					</div>
				)}
				{channelTab === "videos" && videoGrid(sortedLongVideos)}
				{channelTab === "shorts" && (
					channelShorts.length === 0 ? (
						<div className="text-text-muted" style={{ textAlign: "center", padding: "48px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("videos.noClipsYet")}</div>
					) : (
						<VideoClipsShelf label={i18n.t("videos.shorts")} clips={channelShorts.map((s) => ({ ...s, views: s.views_count ?? s.views }))} inset={false} onOpen={(idx) => openChannelVideo(channelShorts[idx])} cardActions={cardActions} />
					)
				)}
				{channelTab === "playlists" && (
					plLoading ? (
						<div style={{ display: isMobile ? "flex" : "grid", flexDirection: isMobile ? "column" : undefined, gridTemplateColumns: isMobile ? undefined : "repeat(auto-fill, minmax(220px, 1fr))", gap: isMobile ? 14 : 20 }}>
							{[...Array(3)].map((_, i) => <Skel key={i} w="100%" h={isMobile ? 90 : 160} r={12} />)}
						</div>
					) : channelPlaylists.length === 0 ? (
						<div className="text-text-muted" style={{ textAlign: "center", padding: "48px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("videos.noPlaylists")}</div>
					) : (
						<div style={{ display: isMobile ? "flex" : "grid", flexDirection: isMobile ? "column" : undefined, gridTemplateColumns: isMobile ? undefined : "repeat(auto-fill, minmax(220px, 1fr))", gap: isMobile ? 14 : 20 }}>
							{channelPlaylists.map((pl, i) => (
								<PlaylistCard
									key={pl.id ?? pl.name ?? i}
									playlist={pl}
									isMobile={isMobile}
									delay={i * 40}
									onOpen={onOpenPlaylist}
								/>
							))}
						</div>
					)
				)}
			</div>
		</div>
	);
}

function VideosPage({ initialVideoId = null, initialShowDashboard = false }) {
	const { searchPlaceholder } = usePageI18n("videos");
	const uid = useId(); // unique prefix for create-channel form label/field associations
	const categories = useI18nCategoryList(VIDEO_CATEGORY_DEFS);
	// Section filters and categories render as ONE single-select chip bar. `categories` above is
	// still the list the browse effect and search filter resolve `match` against — untouched.
	const sectionFilters = useI18nCategoryList(VIDEO_SECTION_DEFS);
	const browseChips = useMemo(() => buildVideoChips(sectionFilters, categories), [sectionFilters, categories]);
	// ── Personalised chip order (Phase 2) ───────────────────────────────────────────────────────
	// Watch history is the only client-visible signal that carries a category: /video-engagement/
	// history embeds the whole video row, whereas the liked endpoint returns bare ids and the feed
	// omits `category` entirely. Read-only and best-effort — a logged-out viewer simply 401s here
	// and falls through to the new-user ordering.
	const [chipHistory, setChipHistory] = useState([]);
	const [chipServerSignals, setChipServerSignals] = useState(null);
	useEffect(() => {
		let cancelled = false;
		getWatchHistory({ limit: 50 })
			.then((data) => { if (!cancelled) setChipHistory(listFrom(data)); })
			.catch(() => { /* signed out, or history unavailable — new-user ordering applies */ });
		// Regional + global popularity, and the viewer's country, resolved server-side. Resolves to
		// null on an older backend or a signed-out viewer, in which case the built-in defaults apply.
		getChipSignals()
			.then((data) => { if (!cancelled && data) setChipServerSignals(data); })
			.catch(() => {});
		return () => { cancelled = true; };
	}, []);
	const orderedChips = useMemo(() => {
		const categoryChips = browseChips.filter((c) => !FIXED_CHIP_IDS.has(c.id));
		const signals = buildChipSignals({
			// `country` comes from the server signals when available; App.jsx does not pass its
			// userLocation down to this page and is deliberately left untouched.
			country: null,
			serverSignals: chipServerSignals,
			history: chipHistory,
			searches: loadSearchHistory(),
			categoryChips,
		});
		// Resolving also persists the frozen order, so the row does not rearrange between renders.
		// The write is idempotent and keyed on the same signature it just read.
		return resolveStableChipOrder({
			chips: browseChips,
			signals,
			storage: typeof window !== "undefined" ? window.localStorage : null,
		}).chips;
	}, [browseChips, chipHistory, chipServerSignals]);
	const { isMobile } = useViewport();
	const [activeTab, setActiveTab] = useState(() => { const t = window.__videosInitialTab; if (t) { delete window.__videosInitialTab; return t; } return "browse"; });
	const [videosDialog, { notify }] = useDialog();
	const loading = usePageLoad();
	const [activeCategory, setActiveCategory] = useState("all");
	const [query, setQuery] = useState("");
	const [searchResults, setSearchResults] = useState([]);
	const [searchChannels, setSearchChannels] = useState([]);
	const [searching, setSearching] = useState(false);
	// Queries already logged this session — keeps one search from filing a row per keystroke.
	const loggedSearchesRef = useRef(new Set());
	// Filtered-browse results, fetched server-side for any (section-filter × category) combo
	// other than the editorial (all + all) view — see the effect below. `browseResults` holds
	// long videos (Trending/Latest/Mix/category), `browseShorts` holds the shorts grid.
	const [browseResults, setBrowseResults] = useState([]);
	const [browseShorts, setBrowseShorts] = useState([]);
	const [browseShortsCursor, setBrowseShortsCursor] = useState(null);
	const [browseShortsHasMore, setBrowseShortsHasMore] = useState(false);
	const [browseShortsLoadingMore, setBrowseShortsLoadingMore] = useState(false);
	const [browseShortsLoadError, setBrowseShortsLoadError] = useState(false);
	const browseShortsLoadMoreRef = useRef(null);
	const [browseLoading, setBrowseLoading] = useState(false);
	// Personalised editorial landing (`/video/home-feed`). Replaces the old public
	// trending/latest/popular merge so each viewer gets taste + variety, not one shared list.
	const [personalFeedItems, setPersonalFeedItems] = useState([]);
	const [personalFeedLoading, setPersonalFeedLoading] = useState(true);
	// Featured = a rotated pick among trending videos that have a real thumbnail. This used to be
	// sections.trending.find(...), which always returned the single top item so the Featured slot
	// never alternated between visits (#117). Re-roll whenever the trending set changes so it varies
	// per load while staying stable within a render (no flicker).
	// BUG #24: on mobile, collapse the page header (title + search) on scroll-down and
	// reveal it on scroll-up, matching the social feed behaviour.
	const [headerVisible, setHeaderVisible] = useState(true);
	const headerScrollRef = useRef(0);
	const handleHeaderScroll = (e) => {
		if (!isMobile) return;
		const top = e.currentTarget.scrollTop;
		if (Math.abs(top - headerScrollRef.current) < 8) return;
		setHeaderVisible(top <= headerScrollRef.current || top <= 40);
		headerScrollRef.current = top;
	};
	const [selectedVideo, setSelectedVideo] = useState(null);
	const [watchAutoStart, setWatchAutoStart] = useState(false);
	const [channelId, setChannelId] = useState(null);
	const [myChannel, setMyChannel] = useState(null);
	// The watch page is still mounted, just out of the way: the video plays on in the corner until
	// the viewer closes it. Cleared whenever a different video is opened, so the corner never keeps
	// the old one.
	const [watchMinimized, setWatchMinimized] = useState(false);
	const watchMinimizedRef = useRef(false);
	useEffect(() => { watchMinimizedRef.current = watchMinimized; }, [watchMinimized]);
	// Mirror of selectedVideo for the popstate listener (which has a stable [] closure).
	const selectedVideoRef = useRef(null);
	useEffect(() => { selectedVideoRef.current = selectedVideo; }, [selectedVideo]);
	// When the user explicitly CLOSES the video (selectedVideo → null while still on the Videos
	// section), drop the cross-section mini-player handoff so a later section switch doesn't spawn a
	// mini for a video they already closed. Nav-AWAY unmounts this page without running this effect
	// body (no deps change fires on unmount), so leaving a *playing* video keeps the snapshot — which
	// is exactly what the AppInner shell reads to open the mini (#471 / #473-2).
	useEffect(() => { if (!selectedVideo) { try { window.__strugActiveVideo = null; } catch { /* noop */ } } }, [selectedVideo]);
	// Whether a video has actually been open in this mount — so the URL-sync effect only rewrites
	// a /v/ URL back to /videos on a REAL close, never on the brief null window during a fresh mount
	// that is about to restore a video from the URL (cross-section Back to /v/:id).
	const hadVideoRef = useRef(false);
	const [videoHistoryStack, setVideoHistoryStack] = useState([]);
	// Ids played in this session. The edge drawer treats them as watched, so a row the viewer just
	// opened leaves its tab immediately instead of lingering until the server history refreshes.
	const [sessionWatchedIds, setSessionWatchedIds] = useState([]);
	// `restore` is what the tap meant. A card on the list means "watch this", so the page comes back
	// to full size. Autoplay rolling into the next video, or the player's own next/previous, means
	// "carry on" — and carrying on in the corner must not seize the screen from the list.
	const mixLockRef = useRef(false);
	const selectVideo = (v, { restore = true, queue, autoPlay = false } = {}) => {
		if (!hasVideoIdentity(v)) return;
		// Fetch the MSE player in parallel with video hydration; Apple native HLS skips it entirely.
		if (!browserSupportsNativeHls()) loadHls().catch(() => {});
		// Tapping the video that is already open (typically docked in the corner) used to remount the
		// watch page: new player, fresh manifest, resume seek — seconds of black on a phone for a
		// stream that was still buffered. Bring the existing one back instead.
		const openTok = resolveVideoId(selectedVideoRef.current);
		if (openTok != null && openTok === resolveVideoId(v)) {
			if (restore) setWatchMinimized(false);
			return;
		}
		// Playing it counts as watching it: the drawer drops the row and its badge straight away,
		// without waiting for the server history to come back around.
		const watchedId = resolveVideoId(v);
		if (watchedId != null) {
			setSessionWatchedIds((prev) => (prev.includes(watchedId) ? prev : [...prev, watchedId]));
		}
		if (restore) setWatchMinimized(false);
		setWatchAutoStart(Boolean(autoPlay));
		if (Array.isArray(queue) && queue.length) setVideoItems(queue);
		const playTok = resolveVideoId(v) ?? v?.public_id;
		// A feed row has no playable URL, so without this the player waits a full round trip before
		// it can even start loading. Reopening a video the session already played starts instantly.
		const known = v?.processed_video_url ? null : cachedPlayback(playTok);
		const seeded = known ? { ...v, ...known } : v;
		setSelectedVideo(prev => {
			if (prev) setVideoHistoryStack(s => [...s, prev]);
			return seeded;
		});
		if (playTok) getVideo(playTok).then(full => {
			if (!full) return;
			const mapped = mapApiVideo(full);
			rememberPlayback(mapped);
			setSelectedVideo(prev => {
				if (!prev) return prev;
				const prevTok = resolveVideoId(prev) ?? prev.public_id;
				const nextTok = resolveVideoId(v) ?? v.public_id;
				if (prevTok == null || prevTok !== nextTok) return prev;
				const next = { ...prev, ...mapped };
				// Never trade a URL we are already playing for a null one.
				if (!mapped.processed_video_url && prev.processed_video_url) {
					next.processed_video_url = prev.processed_video_url;
				}
				return next;
			});
		}).catch(() => {});
		// After 4+ distinct watches of the same category, upsert a Mix for that type
		// (education and music never share a list).
		const session = recordListen(v);
		if (session.shouldSync && !mixLockRef.current) {
			mixLockRef.current = true;
			(async () => {
				const attempted = session.pendingMixes?.flatMap((g) => g.ids) || session.uniqueIds;
				try {
					let list = playlists;
					if (!list.length) {
						const d = await getPlaylists().catch(() => null);
						list = listFrom(d).map(mapPlaylist);
						if (list.length) setPlaylists(list);
					}
					const mixes = await syncYourMix({ session, playlists: list, createPlaylist, addVideoToPlaylist, mapPlaylist });
					if (mixes?.length) {
						setPlaylists((prev) => {
							const ids = new Set(mixes.map((m) => m.id));
							return [...mixes, ...prev.filter((p) => !ids.has(p.id))];
						});
					}
					markMixSynced(session, attempted);
				} catch {
					// Logged out, 401, offline. Clear the backlog anyway: shouldSync would
					// otherwise stay true and replay the whole fan-out - one serial POST per
					// pending video - on every subsequent video the viewer opens.
					markMixSynced(session, attempted);
				}
				finally { mixLockRef.current = false; }
			})();
		}
	};

	// Deep link: /v/:videoId is handled by a single effect lower down (it fetches the video,
	// maps it, opens it, and lazily loads the rest of the feed). A second fetch here was
	// redundant — it re-hit /video/play/:id for the same video on mount.

	// Sync URL with selected video: canonical /v/{public_id}-{slug} when watching,
	// /videos when back. A non-canonical URL for the SAME video (a legacy /v/{id} deep
	// link, a slug-less /v/{public_id}, or a stale slug) is canonicalized via replaceState
	// so it doesn't add a junk history entry; navigating to a DIFFERENT video pushes.
	useEffect(() => {
		if (selectedVideo) {
			if (!hasVideoIdentity(selectedVideo)) {
				setSelectedVideo(null);
				return;
			}
			hadVideoRef.current = true;
			const path = videoPath(selectedVideo);
			if (!path) {
				setSelectedVideo(null);
				return;
			}
			const entry = { nav: "videos", videoId: selectedVideo.video_id ?? selectedVideo.id, publicId: selectedVideo.public_id ?? null };
			if (window.location.pathname !== path) {
				const curTok = window.location.pathname.match(/^\/v\/([^/-]+)/)?.[1];
				const sameVideo = curTok && (String(selectedVideo.public_id) === curTok || String(selectedVideo.video_id ?? selectedVideo.id) === curTok);
				if (sameVideo) window.history.replaceState(entry, "", path);
				else window.history.pushState(entry, "", path);
			}
			setPageMeta({
				title: selectedVideo.title,
				description: selectedVideo.description,
				image: selectedVideo.thumbnail_url || undefined,
				canonical: `${window.location.origin}${path}`,
			});
		} else if (hadVideoRef.current && /^\/v\//.test(window.location.pathname)) {
			// Real close (a video was open, now dismissed) while still on a /v/ URL → return to the list.
			// Guarded by hadVideoRef so a fresh mount at /v/:id (about to restore) doesn't nuke the URL.
			hadVideoRef.current = false;
			window.history.pushState({ nav: "videos" }, "", "/videos");
			resetPageMeta();
		}
	}, [selectedVideo]);

	// Restore the default <title>/meta when leaving the Videos section entirely (e.g.
	// navigating to /community while a video was open). Without this the last video's
	// title stuck in the browser tab across other pages.
	useEffect(() => () => resetPageMeta(), []);

	// Keep the open video in sync with browser history. Back/forward that lands on /videos closes
	// the player; back/forward that lands on a /v/:id entry RE-OPENS that video (previously we only
	// closed, never re-opened — so Forward after Back left you stuck on the list with no way back to
	// the video, and a /v/ history entry couldn't be restored: #159, #284, #111).
	useEffect(() => {
		const onPop = () => {
			const path = window.location.pathname;
			const ctok = path.match(/^\/c\/([^/-]+)/)?.[1];
			if (ctok) {
				// Back/forward onto a channel URL — open it (unless already showing) and close any video.
				setSelectedVideo(null);
				const curCh = selectedChannelRef.current;
				const curKey = curCh && (String(curCh.handle ?? "").replace(/^@/, "") || String(curCh.channel_id ?? curCh.channelId ?? curCh.id ?? ""));
				if (String(curKey) !== ctok) openChannelFromKey(ctok);
				return;
			}
			const tok = path.match(/^\/v\/([^/-]+)/)?.[1];
			if (!isValidVideoRouteToken(tok)) { setSelectedVideo(null); setSelectedChannel(null); return; }
			setSelectedChannel(null);
			const cur = selectedVideoRef.current;
			const already = cur && (String(cur.public_id ?? "") === tok || String(cur.video_id ?? cur.id ?? "") === tok);
			if (already) {
				setWatchMinimized(false);
				return;
			}
			getVideo(tok).then((raw) => {
				if (!raw) return;
				const mapped = { ...mapApiVideo(raw), section: "popular" };
				if (!hasVideoIdentity(mapped)) return;
				setSelectedVideo(mapped);
			}).catch(() => {});
		};
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	}, []);
	const [selectedChannel, setSelectedChannel] = useState(null);
	// ── Channel deep-linking (#113) — clicking through to a channel previously kept /videos, so a
	// channel had no shareable / back-restorable URL. Give it /c/:handle (or /c/:channel_id).
	const selectedChannelRef = useRef(null);
	useEffect(() => { selectedChannelRef.current = selectedChannel; }, [selectedChannel]);
	const hadChannelRef = useRef(false);
	// The watch URL we docked away from when a creator tap opened this channel. Only that entry is
	// safe for closeChannel to pop — a channel reached by deep link has an unrelated page behind it
	// (or the /c/ entry itself), so popping there just reopens the same channel one step deeper.
	const dockedWatchPathRef = useRef(null);
	// Open a channel + push its shareable /c/:key URL. When nothing is playing, opening a channel
	// clears any stale watch state. When a video is playing, pass keepPlaying so it docks to the
	// corner instead of tearing down the same <video> element.
	const openChannel = (ch, opts = {}) => {
		if (!ch) return;
		const cid = channelIdOf(ch);
		const handle = ch.handle ? String(ch.handle).replace(/^@/, "") : null;
		if (cid == null && !handle) return;
		if (opts.keepPlaying) {
			// Creator tap while a video is playing: dock to the corner and open the channel —
			// same as Back on a playing video, not a hard stop.
			setWatchMinimized(true);
			dockedWatchPathRef.current = window.location.pathname;
		} else {
			dockedWatchPathRef.current = null;
			hadVideoRef.current = false;
			setSelectedVideo(null);
			setVideoHistoryStack([]);
		}
		const displayName = ch.display_name ?? ch.name
			?? (typeof ch.channel === "string" ? ch.channel : undefined);
		// Only channel fields — never keep a watch-row `id`/`videoId` on selectedChannel, or the
		// page key / feed lookup can latch onto the previous video instead of the creator.
		const toChannelState = (extra = {}) => ({
			channel_id: extra.channel_id ?? cid ?? null,
			channelId: extra.channelId ?? extra.channel_id ?? cid ?? null,
			handle: extra.handle ?? handle ?? null,
			name: extra.display_name ?? extra.name ?? displayName,
			display_name: extra.display_name ?? extra.name ?? displayName,
			profile_pic_url: extra.profile_pic_url ?? ch.profile_pic_url ?? null,
			banner_url: extra.banner_url ?? ch.banner_url ?? null,
			subscriber_count: extra.subscriber_count ?? extra._count?.subscriptions
				?? ch.subscriber_count ?? ch.subscribers ?? undefined,
			description: extra.description ?? ch.description ?? ch.channel_description ?? ch.bio ?? null,
			avatar: extra.avatar ?? ch.avatar
				?? String(extra.display_name ?? displayName ?? "?").charAt(0).toUpperCase(),
		});
		const navigate = (resolved) => {
			setSelectedChannel(resolved);
			const path = channelPath(resolved);
			if (path && window.location.pathname !== path) window.history.pushState({ nav: "videos" }, "", path);
		};
		if (cid != null) {
			navigate(toChannelState());
			return;
		}
		getChannelByHandle(handle).then((d) => {
			const p = d?.data ?? d;
			if (p) navigate(toChannelState({ ...p, channel_id: p.channel_id ?? p.id, handle: p.handle ?? handle }));
			else navigate(toChannelState({ handle }));
		}).catch(() => navigate(toChannelState({ handle })));
	};
	// Leave a creator profile. When the viewer opened it from a playing video, pop back to that
	// watch URL instead of dropping them on the browse feed with only a corner player.
	const closeChannel = useCallback(() => {
		const dockedFrom = dockedWatchPathRef.current;
		if (selectedVideoRef.current && watchMinimizedRef.current
			&& dockedFrom && dockedFrom !== window.location.pathname) {
			dockedWatchPathRef.current = null;
			window.history.back();
			return;
		}
		setSelectedChannel(null);
		if (/^\/c\//.test(window.location.pathname)) {
			window.history.pushState({ nav: "videos" }, "", "/videos");
		}
	}, []);
	// Tapping the corner player must hand the screen back to the watch page. Un-minimising alone
	// left the creator profile (or a playlist) mounted underneath, so the video expanded inside that
	// page — two pages stacked, and the /c/ URL still in the bar.
	const restoreWatch = useCallback(() => {
		setSelectedChannel(null);
		setSelectedPlaylist(null);
		setWatchMinimized(false);
		const dockedFrom = dockedWatchPathRef.current;
		if (dockedFrom && dockedFrom !== window.location.pathname) {
			dockedWatchPathRef.current = null;
			window.history.back();
		}
	}, []);
	// Restore a channel from a /c/:key URL token (mount + Back/Forward). Numeric key → channel_id
	// straight through (VideoChannelPage loads its videos from it); a handle → fetch to resolve the id.
	function openChannelFromKey(key) {
		if (!key) return;
		if (/^\d+$/.test(key)) { setSelectedChannel({ channel_id: Number(key) }); return; }
		getChannelByHandle(key).then(ch => {
			const p = ch?.data ?? ch;
			if (!p) return;
			setSelectedChannel({
				...p,
				channel_id: p.channel_id ?? p.id,
				handle: p.handle ?? key,
			});
		}).catch(() => {});
	}
	// Keep the /c/ URL in sync: canonicalize while a channel is open; return to /videos on a real
	// close (guarded by hadChannelRef so a fresh mount at /c/:key doesn't nuke the URL before restore).
	useEffect(() => {
		if (selectedChannel) {
			hadChannelRef.current = true;
			const path = channelPath(selectedChannel);
			if (path && window.location.pathname !== path) window.history.replaceState({ nav: "videos" }, "", path);
		} else if (hadChannelRef.current && /^\/c\//.test(window.location.pathname)) {
			hadChannelRef.current = false;
			window.history.pushState({ nav: "videos" }, "", "/videos");
		}
	}, [selectedChannel]);
	const [selectedShort, setSelectedShort] = useState(null);
	// Clips own the screen, the way the playlist sheet and the edge drawer already step aside for
	// them. A long video left docked in the corner would otherwise keep playing underneath the swipe
	// player — two soundtracks at once, and a corner card the viewer cannot get back to.
	const openShort = useCallback((index) => {
		setSelectedShort(index);
		setSelectedVideo(null);
		setWatchMinimized(false);
		setVideoHistoryStack([]);
	}, []);
	const [selectedPlaylist, setSelectedPlaylist] = useState(null);
	const [videoItems, setVideoItems] = useState([]);
	const [likedVideoIds, setLikedVideoIds] = useState(new Set());
	const [likedVideos, setLikedVideos] = useState([]);
	const [playlists, setPlaylists] = useState([]);
	const playlistFromResponse = (r) => {
		if (!r) return null;
		if (r.playlist_id != null || r.id != null) return mapPlaylist(r);
		if (r.data?.playlist_id != null || r.data?.id != null) return mapPlaylist(r.data);
		return null;
	};
	const playlistSaveError = (err) => {
		const status = err?.response?.status;
		if (status === 401 || status === 403) return i18n.t("videos.signInToSavePlaylist", { defaultValue: "Sign in to save playlists" });
		return err?.response?.data?.message || err?.message || i18n.t("videos.playlistSaveFailed", { defaultValue: "Could not save to playlist" });
	};
	const refreshPlaylists = () => getPlaylists().then(d => setPlaylists(listFrom(d).map(mapPlaylist))).catch(() => {});
	useEffect(() => {
		if (!getAuthUserId()) return;
		refreshPlaylists();
	}, []);
	const openPlaylist = (pl) => setSelectedPlaylist({
		...pl,
		count: pl.videos?.length ?? 0,
		thumb: pl.videos?.[0]?.thumb ?? "linear-gradient(135deg,#1e3a5f,#0f2744)",
		accent: "#2563eb",
	});

	// Library-tab datasets are loaded lazily the first time their tab is opened (see the
	// activeTab effect below) rather than all at once on mount — the eager fan-out (esp. the
	// up-to-50 per-video hydration for Liked) was a request storm that slowed first paint of
	// the default Browse feed on slower devices/connections.
	const loadLikedVideos = async () => {
		const ids = Array.from(likedVideoIds);
		if (ids.length === 0) { setLikedVideos([]); return; }
		const vids = await Promise.allSettled(ids.slice(0, 50).map(id => getVideo(id)));
		const loaded = vids.filter(r => r.status === 'fulfilled' && r.value).map(r => mapApiVideo(r.value));
		setLikedVideos(loaded);
	};
	// Watch Later (#475) and Watch History (#473) rows WRAP the video under `.video`, with
	// saved_at/watched_at on the wrapper — e.g. { saved_at, video: {…} } and
	// { watched_at, video_id, video: {…} }. The old mappers read title/channel/thumbnail off the
	// wrapper, so every field was undefined and each card degraded to a blue-gradient thumbnail
	// labelled "Creator" (the reported "blue screen that says creator"). Unwrap the video first.
	const loadWatchLater = () => getWatchLater().then(data => {
		const rows = listFrom(data)
			.map(entry => ({ entry, v: entry.video ?? entry }))
			.filter(({ v }) => v.video_id != null && (!v.status || v.status === 'safe' || v.status === 'ready'));
		setWatchLaterVideos(rows.map(({ entry, v }) => ({
			...mapApiVideo(v),
			ago: entry.saved_at ? timeAgo(entry.saved_at) : '',
		})));
		setWatchLaterIds(new Set(rows.map(({ v }) => v.video_id)));
	}).catch(() => {});
	const loadWatchHistory = async (cursor = null) => {
		if (cursor) setWatchHistoryLoadingMore(true);
		try {
			const response = await getWatchHistory({ limit: 24, ...(cursor ? { cursor } : {}) });
			const mapped = mapWatchHistory(response);
			setWatchHistory(current => cursor
				? [...current, ...mapped.filter(item => !current.some(existing => String(existing.id) === String(item.id)))]
				: mapped);
			setWatchHistoryCursor(response?.next_cursor ?? null);
			setWatchHistoryHasMore(response?.has_more === true && !!response?.next_cursor);
		} catch {
			if (!cursor) setWatchHistory([]);
		} finally {
			if (cursor) setWatchHistoryLoadingMore(false);
		}
	};
	const loadSubscriptions = () => getMySubscriptions().then(data => {
		const arr = listFrom(data);
		setSubscriptionChannels(arr.map(ch => ({
			channelId: ch.channel_id ?? ch.id,
			name: ch.channel_name ?? ch.name ?? 'Channel',
			handle: ch.handle ?? '',
			avatar: (ch.channel_name ?? ch.name ?? 'C')[0].toUpperCase(),
			subscribers: ch.subscriber_count ?? 0,
			thumb: ch.banner_url ?? null,
			profile_pic_url: ch.profile_pic_url ?? null,
		})));
	}).catch(() => {});
	const [playlistTargetVideo, setPlaylistTargetVideo] = useState(null);
	const [showPlaylistModal, setShowPlaylistModal] = useState(false);
	const [, setNewPlaylistName] = useState("");
	const [watchLaterVideos, setWatchLaterVideos] = useState([]);
	const [watchHistory, setWatchHistory] = useState([]);
	const [watchHistoryCursor, setWatchHistoryCursor] = useState(null);
	const [watchHistoryHasMore, setWatchHistoryHasMore] = useState(false);
	const [watchHistoryLoadingMore, setWatchHistoryLoadingMore] = useState(false);
	const [watchLaterIds, setWatchLaterIds] = useState(new Set());
	// The video whose share dialog is open, or null. Grid cards have no playback position, so the
	// dialog opens without the "start at" offset the watch page passes.
	const [shareTargetVideo, setShareTargetVideo] = useState(null);
	// Actions behind each card's three-dot menu. A plain object rather than a memo: the card
	// components re-render with the page anyway, and memoising it only created a dependency
	// argument over refreshPlaylists for no benefit.
	// How far the viewer got in each video, keyed by id. Built from the history already fetched for
	// chip ordering, so the progress lines cost no request of their own. A row with no duration or
	// no stored position tells us nothing and is skipped rather than drawn as zero.
	const watchProgress = useMemo(() => {
		const byId = new Map();
		for (const row of chipHistory) {
			const v = row?.video ?? row;
			const id = v?.video_id ?? row?.video_id;
			const duration = v?.duration_sec ?? 0;
			const position = row?.last_position ?? 0;
			if (id == null || duration <= 0 || position <= 0) continue;
			byId.set(id, Math.min(1, position / duration));
		}
		return byId;
	}, [chipHistory]);
	// Same history fetch the chips already made — no extra request. Empty → no rails.
	const homeWatched = useMemo(() => mapWatchHistory(chipHistory), [chipHistory]);
	const watchedShelves = useMemo(() => watchedFeedShelves(homeWatched), [homeWatched]);
	const openPlaylistPicker = (v) => {
		refreshPlaylists();
		setPlaylistTargetVideo(v);
		// Open after the originating click finishes so the sheet overlay is not the click target.
		window.setTimeout(() => setShowPlaylistModal(true), 0);
	};
	const recommendBusyRef = useRef(false);
	const [choiceToast, setChoiceToast] = useState(null);
	const choiceToastTimer = useRef(null);
	const showChoiceToast = useCallback((message) => {
		if (choiceToastTimer.current) window.clearTimeout(choiceToastTimer.current);
		setChoiceToast(message);
		choiceToastTimer.current = window.setTimeout(() => setChoiceToast(null), 2800);
	}, []);
	useEffect(() => () => {
		if (choiceToastTimer.current) window.clearTimeout(choiceToastTimer.current);
	}, []);
	const recommendVideoToSubscribers = useCallback(async (v) => {
		const vid = Number(v?.videoId ?? v?.video_id ?? v?.id);
		if (!Number.isFinite(vid) || vid <= 0 || recommendBusyRef.current) return;
		if (!canRecommendVideoToSubscribers(v, channelId)) return;
		recommendBusyRef.current = true;
		try {
			await createCreatorPick({ pick_type: "video", video_id: vid });
			showChoiceToast(i18n.t("videos.recommendAdded", { defaultValue: "Added to your Creator's Choice" }));
		} catch (err) {
			const apiMsg = err?.response?.data?.message;
			console.error("[creator-choice] recommend video failed:", err?.message || err);
			showChoiceToast(typeof apiMsg === "string" && apiMsg ? apiMsg : i18n.t("videos.recommendFailed", { defaultValue: "Could not recommend that video" }));
		} finally {
			recommendBusyRef.current = false;
		}
	}, [channelId, showChoiceToast]);
	const recommendChannelToSubscribers = useCallback(async (targetChannelId) => {
		const cid = Number(targetChannelId);
		if (!Number.isFinite(cid) || cid <= 0 || recommendBusyRef.current) return;
		if (!canRecommendChannelToSubscribers(cid, channelId)) return;
		recommendBusyRef.current = true;
		try {
			await createCreatorPick({ pick_type: "channel", target_channel_id: cid });
			showChoiceToast(i18n.t("videos.recommendAdded", { defaultValue: "Added to your Creator's Choice" }));
		} catch (err) {
			const apiMsg = err?.response?.data?.message;
			console.error("[creator-choice] recommend channel failed:", err?.message || err);
			showChoiceToast(typeof apiMsg === "string" && apiMsg ? apiMsg : i18n.t("videos.recommendChannelFailed", { defaultValue: "Could not recommend that channel" }));
		} finally {
			recommendBusyRef.current = false;
		}
	}, [channelId, showChoiceToast]);
	const [playQueue, setPlayQueue] = useState(() => readPlayQueue());
	const queueVideo = useCallback((video) => {
		if (!hasVideoIdentity(video)) return;
		setPlayQueue((prev) => {
			const next = addToPlayQueue(prev, video);
			writePlayQueue(next);
			return next;
		});
		showChoiceToast(i18n.t("videos.addedToQueue"));
	}, [showChoiceToast]);
	const cardActions = {
		progressById: watchProgress,
		onShare: (v) => setShareTargetVideo(v),
		onAddToPlaylist: openPlaylistPicker,
		onAddToQueue: queueVideo,
		onRecommend: channelId != null ? recommendVideoToSubscribers : undefined,
		myChannelId: channelId,
		savedIds: watchLaterIds,
		// Avatar / channel name on a card opens the creator — not the video.
		onChannelClick: (v) => openChannel(v, selectedVideo ? { keepPlaying: true } : undefined),
		// Mirrors the optimistic update the watch page already does, so the label flips at once
		// and the request is fire-and-forget.
		onToggleSaved: (id) => {
			if (id == null) return;
			toggleWatchLater(id).catch(() => {});
			setWatchLaterIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
		},
	};
	const [subscriptionChannels, setSubscriptionChannels] = useState([]);
	const [subVersion, setSubVersion] = useState(0);
	const [videoShorts, setVideoShorts] = useState([]);
	const [videoShortsCursor, setVideoShortsCursor] = useState(null);
	const [videoShortsHasMore, setVideoShortsHasMore] = useState(false);
	const [videoShortsLoadingMore, setVideoShortsLoadingMore] = useState(false);
	const [videoShortsLoadError, setVideoShortsLoadError] = useState(false);
	const videoShortsLoadMoreRef = useRef(null);
	const [shortsPrefetch, setShortsPrefetch] = useState({});
	// Card counts after which the Recently Uploaded grid opens up for a clips shelf. Derived once
	// from the gap pattern rather than written out, so changing the pattern is enough.
	/** One shelf, taking the nth slice of clips. Nothing left to show means nothing rendered. */
	const renderClipShelf = (n) => {
		const start = n * CLIPS_PER_SHELF;
		const slice = videoShorts.slice(start, start + CLIPS_PER_SHELF);
		return slice.length ? (
			<VideoClipsShelf
				key={`clips-${n}`}
				label={i18n.t("videos.shorts")}
				clips={slice}
				startIndex={start}
				onOpen={openShort}
				cardActions={cardActions}
			/>
		) : null;
	};
	const renderPlaylistsShelf = () => {
		// A single playlist leaves a mostly-empty full-width row beside it. Keep Mixes in
		// Library → Playlists; only break the home grid when there are enough shelves to fill.
		const visible = (playlists || []).filter((p) => (p.videos || []).length > 0);
		if (visible.length < 2) return null;
		return (
			<PlaylistsShelf
				playlists={playlists}
				isMobile={isMobile}
				gutterPx={MOBILE_GUTTER_PX}
				onOpen={openPlaylist}
				onSeeAll={() => setActiveTab("playlists")}
			/>
		);
	};
	// Keyset cursor for `/video/home-feed` (offset-based pagination from getForYou).
	const [homeCursor, setHomeCursor] = useState(null);
	const [homeHasMore, setHomeHasMore] = useState(true);
	const [homeLoadingMore, setHomeLoadingMore] = useState(false);
	const homeSentinelRef = useRef(null);
	const homeFeed = personalFeedItems;
	const loadMoreHome = useCallback(() => {
		if (homeLoadingMore || !homeHasMore || homeCursor == null) return;
		setHomeLoadingMore(true);
		getHomeFeed({ limit: 24, cursor: homeCursor })
			.then((data) => {
				const { items, nextCursor } = unwrapHomeFeedResponse(data);
				const mapped = items.map(mapApiVideo);
				setPersonalFeedItems((prev) => {
					const seen = new Set(prev.map(videoKey).filter((k) => k != null));
					const tail = [];
					for (const v of mapped) {
						const key = videoKey(v);
						if (key == null || seen.has(key)) continue;
						seen.add(key);
						tail.push(v);
					}
					return [...prev, ...tail];
				});
				setHomeCursor(nextCursor);
				setHomeHasMore(nextCursor != null && mapped.length > 0);
			})
			.catch(() => setHomeHasMore(false))
			.finally(() => setHomeLoadingMore(false));
	}, [homeCursor, homeHasMore, homeLoadingMore]);
	useEffect(() => {
		const el = homeSentinelRef.current;
		if (!el || typeof IntersectionObserver === "undefined") return;
		const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) loadMoreHome(); }, { rootMargin: "600px" });
		io.observe(el);
		return () => io.disconnect();
	}, [loadMoreHome, homeFeed.length]);

	const clipShelfBreaks = useMemo(() => {
		const breaks = [];
		let at = 0;
		for (let i = 0; i < CLIP_SHELF_ROW_GAPS.length * 2; i += 1) {
			at += CLIP_SHELF_ROW_GAPS[i % CLIP_SHELF_ROW_GAPS.length] * CARDS_PER_ROW;
			breaks.push(at);
		}
		return breaks;
	}, []);
	// Playlists sit after the first row of videos (YouTube-style), then the usual clip shelves.
	const homeShelfBreaks = useMemo(() => [CARDS_PER_ROW, ...clipShelfBreaks], [clipShelfBreaks]);
	const renderHomeShelf = (shelfIndex) => (
		shelfIndex === 0 ? renderPlaylistsShelf() : renderClipShelf(shelfIndex - 1)
	);
	const [activeFilter, setActiveFilter] = useState("all");
	// One chip is selected at a time; it maps onto the existing (activeFilter × activeCategory)
	// pair, never narrowing both at once. The browse effect below is unchanged.
	const activeChipId = chipIdFromState(activeFilter, activeCategory);
	const selectBrowseChip = useCallback((chipId) => {
		const next = chipSelectionToState(chipId);
		setActiveFilter(next.activeFilter);
		setActiveCategory(next.activeCategory);
	}, []);
	const [showLibraryPopup, setShowLibraryPopup] = useState(false);
	const libBtnRef = useRef(null);
	const libOpenedAtRef = useRef(0);
	const [mobileExploreOpen, setMobileExploreOpen] = useState(false);
	const [mobileProfileOpen, setMobileProfileOpen] = useState(false);
	const [mobileExploreTab, setMobileExploreTab] = useState(null); // history | creatorChoice | subs | circle | analytics
	// A phone has no edge drawer, so Explore carries the same unseen counts the desktop tabs do.
	// Pauses while a destination is open: that panel loads and shows the rows itself.
	const { counts: exploreCounts, watchedAllIds: exploreWatchedIds, markSeen: markExploreSeen } = useDrawerUnseenBadges({
		enabled: isMobile,
		paused: mobileExploreTab != null,
		sessionWatchedIds,
	});
	const [showDashboard, setShowDashboard] = useState(initialShowDashboard);
	const [showChannelCreate, setShowChannelCreate] = useState(false);
	const [showUpload, setShowUpload] = useState(false);
	const [channelHandle, setChannelHandle] = useState("");
	const [channelDisplayName, setChannelDisplayName] = useState("");
	const [channelDesc, setChannelDesc] = useState("");
	const [channelLoading, setChannelLoading] = useState(false);
	const [uploadFile, setUploadFile] = useState(null);
	const [uploadFiles, setUploadFiles] = useState([]); // queue for multi-upload
	const [uploadCurrentIdx, setUploadCurrentIdx] = useState(0);
	const [uploadThumbnail, setUploadThumbnail] = useState(null);
	const [uploadThumbPreview, setUploadThumbPreview] = useState(null);
	const [uploadTitle, setUploadTitle] = useState("");
	const [uploadDesc, setUploadDesc] = useState("");
	const [uploadVisibility, setUploadVisibility] = useState("public");
	// "auto" = let the backend detect the category from the video's content after transcode.
	// Any explicit pick (Music/Gaming/…) is sent verbatim and wins over auto-detection.
	const [uploadCategory, setUploadCategory] = useState("auto");
	const [uploadIsShort, setUploadIsShort] = useState(null); // null = auto-detect, true/false = override
	// #382/#383: uploads now run in the background manager, so the modal never enters a blocking
	// "uploading" state — it closes immediately on submit. Kept as a const so the existing
	// disabled/gate props (which should never fire now) still resolve.
	const uploading = false;
	const [uploadProgress, setUploadProgress] = useState(0);
	const [uploadDone, setUploadDone] = useState(false);
	const [draftCloseOpen, setDraftCloseOpen] = useState(false);
	const [activeDraftId, setActiveDraftId] = useState(null);
	const uploadFileInputRef = useRef(null);
	const uploadThumbInputRef = useRef(null);
	const uploadPreviewVideoRef = useRef(null);
	// Per-video metadata for bulk uploads — each entry mirrors the single-upload fields.
	// Populated when the user selects >1 file; the step UI lets them fill metadata per video.
	const [bulkMeta, setBulkMeta] = useState([]); // [{ title, desc, category, isShort, thumbnail, thumbPreview }]
	const [bulkStep, setBulkStep] = useState(0); // which video the user is currently editing
	const draftItems = useMemo(() => uploadFiles.length > 1
		? uploadFiles.map((file, index) => ({ file, ...(bulkMeta[index] || {}) }))
		: [{ file: uploadFile, title: uploadTitle, desc: uploadDesc, category: uploadCategory, isShort: uploadIsShort, thumbnail: uploadThumbnail, draftId: activeDraftId }],
	[uploadFiles, bulkMeta, uploadFile, uploadTitle, uploadDesc, uploadCategory, uploadIsShort, uploadThumbnail, activeDraftId]);
	const uploadDrafts = useVideoDrafts({ owner: channelId, open: showUpload, items: draftItems, visibility: uploadVisibility });
	const bulkThumbInputRef = useRef(null);
	const uploadPreviewFile = uploadFiles.length > 1 ? (uploadFiles[bulkStep] || null) : uploadFile;
	const activeBulkThumbPreview = bulkMeta[bulkStep]?.thumbPreview;
	const [uploadPreviewUrl, setUploadPreviewUrl] = useState(null);
	// Custom thumbnail sits on the player like YouTube until the viewer presses play.
	const [uploadPreviewPlaying, setUploadPreviewPlaying] = useState(false);
	const openUploadAfterChannelRef = useRef(false);
	const closeChannelCreateModal = useCallback(() => {
		setShowChannelCreate(false);
		if (openUploadAfterChannelRef.current) {
			openUploadAfterChannelRef.current = false;
			window.setTimeout(() => setShowUpload(true), 0);
		}
	}, []);
	const requestChannelCreateClose = useModalHistoryEntry(showChannelCreate, closeChannelCreateModal, {
		key: "videos-create-channel",
		canClose: !channelLoading,
	});
	const resetUploadForm = useCallback(() => {
		setActiveDraftId(null);
		uploadDrafts.reset();
		setShowUpload(false);
		setUploadDone(false);
		setUploadFile(null);
		setUploadFiles([]);
		setUploadCurrentIdx(0);
		setUploadThumbnail(null);
		setUploadThumbPreview((current) => {
			if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
			return null;
		});
		setBulkMeta((current) => {
			for (const item of current) {
				if (item?.thumbPreview?.startsWith("blob:")) URL.revokeObjectURL(item.thumbPreview);
			}
			return [];
		});
		setBulkStep(0);
		setUploadPreviewPlaying(false);
		setUploadTitle("");
		setUploadDesc("");
		setUploadVisibility("public");
		setUploadCategory("auto");
		setUploadProgress(0);
		setUploadIsShort(null);
		if (uploadFileInputRef.current) uploadFileInputRef.current.value = "";
	}, [uploadDrafts]);
	const requestUploadClose = useModalHistoryEntry(showUpload, () => {
		if (uploadDrafts.hasDraft) {
			setDraftCloseOpen(true);
			return false; // Keep Back protection until Save/Discard is resolved.
		}
		resetUploadForm();
	}, {
		key: "videos-upload",
		canClose: !uploading,
	});
	useEffect(() => {
		if (!uploadPreviewFile) {
			setUploadPreviewUrl(null);
			setUploadPreviewPlaying(false);
			return undefined;
		}
		const url = URL.createObjectURL(uploadPreviewFile);
		setUploadPreviewUrl(url);
		setUploadPreviewPlaying(false);
		return () => URL.revokeObjectURL(url);
	}, [uploadPreviewFile]);
	useEffect(() => {
		setUploadPreviewPlaying(false);
		const el = uploadPreviewVideoRef.current;
		if (el) { try { el.pause(); el.currentTime = 0; } catch { /* noop */ } }
	}, [uploadThumbPreview, bulkStep, activeBulkThumbPreview]);

	// Server-side search. The client-side `filtered` list further down only covers
	// the first 40 globally-recent videos in `videoItems`, so a creator's own
	// 23-video catalog can easily fall mostly outside it. Hit the real
	// /video/search endpoint instead — same min-length rule (2 chars) the
	// backend already enforces.
	useEffect(() => {
		const q = query.trim();
		if (q.length < 2) { setSearchResults([]); setSearchChannels([]); setSearching(false); return; }
		setSearching(true);
		const t = setTimeout(() => {
			Promise.all([
				searchVideos(q),
				suggestVideos(q).catch(() => ({ channels: [] })),
			]).then(([data, suggest]) => {
				const stripTags = (s) => typeof s === 'string' ? s.replace(/<\/?strong>/gi, '') : s;
				const raw = listFrom(data).map(v => ({ ...v, title: stripTags(v.title), description: stripTags(v.description) }));
				setSearchResults(shuffleVideos(raw.map(mapApiVideo)));
				setSearchChannels(Array.isArray(suggest?.channels) ? suggest.channels : []);
				// Log the settled query once per session. The count is the point: a search that
				// returns nothing is demand for content that doesn't exist yet, and watch history
				// can never show that. Deduped by query so typing "music" doesn't file five rows,
				// and fire-and-forget so it can never affect the results the user sees.
				const key = q.toLowerCase();
				if (!loggedSearchesRef.current.has(key)) {
					loggedSearchesRef.current.add(key);
					logVideoSearch(q, raw.length);
				}
			}).catch(() => { setSearchResults([]); setSearchChannels([]); }).finally(() => setSearching(false));
		}, 300);
		return () => clearTimeout(t);
	}, [query]);

	// Filtered browse is server-backed, like search. The category chip must compose with EVERY
	// section filter (Shorts/Trending/Latest/Mix), not just "all" — and the client-side `filtered`
	// list only covers the ~40 globally-recent videos in `videoItems`, so a chip backed by dozens
	// of videos elsewhere in the catalogue showed almost none (Tech had 20 videos but rendered 0).
	// So every (section × category) combination hits the server: long-video filters pull
	// /video/feed with a `sort`, the Shorts filter pulls /video/shorts — both with the optional
	// category. The editorial (all + all) view (`sections`) and the search panel handle their own
	// data, so they're skipped here.
	useEffect(() => {
		if (activeTab !== 'browse' || query.trim()) return;
		const match = categories.find(c => c.id === activeCategory)?.match; // null on the "all" chip
		const category = match || undefined;
		// (all section + all category) → editorial sections view, no fetch needed.
		if (activeFilter === 'all' && !category) { setBrowseResults([]); return; }
		let cancelled = false;
		setBrowseLoading(true);
		if (activeFilter === 'watched') {
			// Personal list, not a catalogue sort — it ignores the category chip entirely (single-select
			// means one can never be active alongside it) and reuses the Library tab's own mapping.
			getWatchHistory({ limit: 50 }).then(data => {
				if (cancelled) return;
				setBrowseResults(mapWatchHistory(data));
			}).catch(() => { if (!cancelled) setBrowseResults([]); }).finally(() => { if (!cancelled) setBrowseLoading(false); });
		} else if (activeFilter === 'shorts') {
			getShorts({ ...(category ? { category } : {}), limit: 24 }).then(data => {
				if (cancelled) return;
				const page = pageFrom(data);
				setBrowseShorts(page.items.map(mapApiShort));
				setBrowseShortsCursor(page.nextCursor);
				setBrowseShortsHasMore(page.hasMore);
			}).catch(() => { if (!cancelled) setBrowseShorts([]); }).finally(() => { if (!cancelled) setBrowseLoading(false); });
		} else {
			// Trending → recent-popular; Latest/Mix → newest (Mix is then shuffled for variety).
			const sort = activeFilter === 'trending' ? 'trending' : 'latest';
			getVideoFeed({ ...(category ? { category } : {}), sort, limit: 60 }).then(data => {
				if (cancelled) return;
				const raw = listFrom(data);
				const items = raw.map(mapApiVideo);
				setBrowseResults(activeFilter === 'mix' ? shuffleVideos(items) : items);
			}).catch(() => { if (!cancelled) setBrowseResults([]); }).finally(() => { if (!cancelled) setBrowseLoading(false); });
		}
		return () => { cancelled = true; };
	}, [activeFilter, activeCategory, query, activeTab, categories]);

	const loadMoreBrowseShorts = useCallback(async () => {
		if (!browseShortsHasMore || !browseShortsCursor || browseShortsLoadingMore) return;
		const category = categories.find(c => c.id === activeCategory)?.match || undefined;
		setBrowseShortsLoadingMore(true);
		setBrowseShortsLoadError(false);
		try {
			const page = pageFrom(await getShorts({ ...(category ? { category } : {}), cursor: browseShortsCursor, limit: 24 }));
			setBrowseShorts(prev => {
				const seen = new Set(prev.map(item => item.video_id ?? item.id));
				return [...prev, ...page.items.map(mapApiShort).filter(item => !seen.has(item.video_id ?? item.id))];
			});
			setBrowseShortsCursor(page.nextCursor);
			setBrowseShortsHasMore(page.hasMore);
		} catch {
			setBrowseShortsLoadError(true);
		} finally {
			setBrowseShortsLoadingMore(false);
		}
	}, [activeCategory, browseShortsCursor, browseShortsHasMore, browseShortsLoadingMore, categories]);

	useEffect(() => {
		const target = browseShortsLoadMoreRef.current;
		if (!target || !browseShortsHasMore || browseShortsLoadError || typeof IntersectionObserver === "undefined") return undefined;
		const observer = new IntersectionObserver(
			(entries) => { if (entries.some(entry => entry.isIntersecting)) loadMoreBrowseShorts(); },
			{ rootMargin: "600px 0px" },
		);
		observer.observe(target);
		return () => observer.disconnect();
	}, [browseShortsHasMore, browseShortsLoadError, loadMoreBrowseShorts]);

	useEffect(() => {
		const list = (activeTab === "browse" && activeFilter === "shorts") ? browseShorts : videoShorts;
		if (!list?.length) return undefined;
		let cancelled = false;
		Promise.all(list.slice(0, 5).map(async (s) => {
			const vid = s.video_id ?? s.id;
			if (!vid || s.processed_video_url) return null;
			try {
				const full = await getVideo(vid);
				const url = full?.hls_url ?? full?.processed_video_url ?? null;
				return url ? [vid, url] : null;
			} catch {
				return null;
			}
		})).then((rows) => {
			if (cancelled) return;
			const patch = {};
			rows.filter(Boolean).forEach(([vid, url]) => { patch[vid] = url; });
			if (Object.keys(patch).length) {
				setShortsPrefetch((prev) => ({ ...prev, ...patch }));
			}
		});
		return () => { cancelled = true; };
	}, [browseShorts, videoShorts, activeTab, activeFilter]);

	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [activeTab]);
	// Re-bind the laptop page scrollbar when the primary Videos surface swaps (browse ↔ watch /
	// channel / clips). Otherwise App keeps tracking a display:none browse scroller.
	useEffect(() => {
		window.dispatchEvent(new CustomEvent("strug:view-change"));
	}, [selectedVideo, watchMinimized, selectedChannel, selectedPlaylist, selectedShort, mobileExploreTab]);
	useEffect(() => {
		const browseHomeVisible = activeTab === "browse"
			&& !selectedVideo
			&& !selectedChannel
			&& !selectedPlaylist
			&& selectedShort == null
			&& mobileExploreTab == null
			&& !showDashboard
			&& !showUpload
			&& !showChannelCreate;
		window.dispatchEvent(new CustomEvent("strug:videos-browse-home", { detail: browseHomeVisible }));
		return () => window.dispatchEvent(new CustomEvent("strug:videos-browse-home", { detail: false }));
	}, [activeTab, selectedVideo, selectedChannel, selectedPlaylist, selectedShort, mobileExploreTab, showDashboard, showUpload, showChannelCreate]);
	useEffect(() => { setActiveCategory('all'); setQuery(''); }, [activeTab]);

	// On mount only fetch the lightweight liked-video ID set — it marks like state across the
	// Browse/Watch views, so it's needed globally. The heavy per-tab datasets load lazily.
	useEffect(() => {
		getLikedVideoIds().then(ids => {
			if (Array.isArray(ids) && ids.length > 0) setLikedVideoIds(new Set(ids));
		}).catch(() => {});
	}, []);

	// Lazy-load each library tab's data the first time it's opened (browse/feed/shorts already
	// loaded on mount). Refetch markers so a tab re-fetches if its data was invalidated.
	const loadedTabsRef = useRef(new Set());
	useEffect(() => {
		if (activeTab === "browse" || loadedTabsRef.current.has(activeTab)) return;
		loadedTabsRef.current.add(activeTab);
		if (activeTab === "liked") loadLikedVideos();
		else if (activeTab === "watchlater") loadWatchLater();
		else if (activeTab === "history") loadWatchHistory();
		else if (activeTab === "playlists") refreshPlaylists();
		else if (activeTab === "subscriptions") loadSubscriptions();
	}, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

	// If the Liked tab was opened before the liked-ID set finished loading on mount, hydrate
	// it once the IDs arrive (otherwise the loader ran against an empty set).
	useEffect(() => {
		if (activeTab === "liked" && likedVideoIds.size > 0 && likedVideos.length === 0) loadLikedVideos();
	}, [likedVideoIds]); // eslint-disable-line react-hooks/exhaustive-deps

	// Subscriptions changed elsewhere (subscribe/unsubscribe) — refresh if that tab was loaded.
	useEffect(() => {
		if (subVersion === 0) return;
		if (loadedTabsRef.current.has("subscriptions")) loadSubscriptions();
	}, [subVersion]);

	// Editorial landing (all + all, no search): personalised `/video/home-feed` per viewer.
	// Mood/taste is inferred server-side from watch history, searches, and affinities — no manual chips.
	useEffect(() => {
		if (activeTab !== "browse" || query.trim() || activeFilter !== "all" || activeCategory !== "all") return undefined;
		let cancelled = false;
		setPersonalFeedLoading(true);

		const loadLegacyPools = () => {
			const unwrap = (d) => listFrom(d).map(mapApiVideo);
			return Promise.all([
				getVideoFeed({ sort: "trending", limit: 24 }),
				getVideoFeed({ sort: "latest", limit: 80 }),
				getVideoFeed({ sort: "popular", limit: 24 }),
			]).then(([t, r, p]) => {
				const trendingRaw = unwrap(t);
				const recent = diversifyByChannel(shuffleVideos(unwrap(r)));
				const trendingIds = new Set(trendingRaw.map(videoKey).filter((id) => id != null));
				const popularRaw = unwrap(p).filter((v) => !trendingIds.has(videoKey(v)));
				const seen = new Set();
				const merged = [];
				for (const v of [...diversifyByChannel(trendingRaw), ...recent, ...diversifyByChannel(popularRaw)]) {
					const key = videoKey(v);
					if (key == null || seen.has(key)) continue;
					seen.add(key);
					merged.push(v);
				}
				return merged;
			});
		};

		getHomeFeed({ limit: 24, cursor: 0 }).catch(() => null).then((homeData) => {
			if (cancelled) return;
			if (!homeData) {
				return loadLegacyPools().then((legacy) => {
					if (cancelled) return;
					setPersonalFeedItems(legacy);
					setHomeCursor(null);
					setHomeHasMore(false);
					if (legacy.length > 0) setVideoItems(legacy);
				});
			}
			const { items, nextCursor } = unwrapHomeFeedResponse(homeData);
			const personal = items.map(mapApiVideo);
			if (nextCursor != null) {
				setPersonalFeedItems(personal);
				setHomeCursor(nextCursor);
				setHomeHasMore(true);
				if (personal.length > 0) setVideoItems(personal);
				return;
			}
			// The personalised endpoint can return a short terminal head for a viewer, but the
			// Videos home must not end while the public catalogue still has uploads. Keep the
			// personalised ordering first, then fill its terminal page with the public pools.
			return loadLegacyPools().then((legacy) => {
				if (cancelled) return;
				const seen = new Set(personal.map(videoKey).filter((key) => key != null));
				const tail = legacy.filter((video) => {
					const key = videoKey(video);
					if (key == null || seen.has(key)) return false;
					seen.add(key);
					return true;
				});
				const combined = [...personal, ...tail];
				setPersonalFeedItems(combined);
				setHomeCursor(null);
				setHomeHasMore(false);
				if (combined.length > 0) setVideoItems(combined);
			});
		}).catch(() => {
			if (cancelled) return;
			loadLegacyPools().then((legacy) => {
				if (cancelled) return;
				setPersonalFeedItems(legacy);
				setHomeCursor(null);
				setHomeHasMore(false);
				if (legacy.length > 0) setVideoItems(legacy);
			});
		}).finally(() => {
			if (!cancelled) setPersonalFeedLoading(false);
		});

		return () => { cancelled = true; };
	}, [activeTab, query, activeFilter, activeCategory]);

	useEffect(() => {
		getShorts({ limit: 24 }).then(data => {
			const page = pageFrom(data);
			if (page.items.length > 0) setVideoShorts(page.items.map(mapApiShort));
			setVideoShortsCursor(page.nextCursor);
			setVideoShortsHasMore(page.hasMore);
		}).catch(() => {});
	}, []);

	const loadMoreVideoShorts = useCallback(async () => {
		if (!videoShortsHasMore || !videoShortsCursor || videoShortsLoadingMore) return;
		setVideoShortsLoadingMore(true);
		setVideoShortsLoadError(false);
		try {
			const page = pageFrom(await getShorts({ cursor: videoShortsCursor, limit: 24 }));
			setVideoShorts(prev => {
				const seen = new Set(prev.map(item => item.video_id ?? item.id));
				return [...prev, ...page.items.map(mapApiShort).filter(item => !seen.has(item.video_id ?? item.id))];
			});
			setVideoShortsCursor(page.nextCursor);
			setVideoShortsHasMore(page.hasMore);
		} catch {
			setVideoShortsLoadError(true);
		} finally {
			setVideoShortsLoadingMore(false);
		}
	}, [videoShortsCursor, videoShortsHasMore, videoShortsLoadingMore]);

	useEffect(() => {
		const target = videoShortsLoadMoreRef.current;
		if (!target || !videoShortsHasMore || videoShortsLoadError || typeof IntersectionObserver === "undefined") return undefined;
		const observer = new IntersectionObserver(
			(entries) => { if (entries.some(entry => entry.isIntersecting)) loadMoreVideoShorts(); },
			{ rootMargin: "600px 0px" },
		);
		observer.observe(target);
		return () => observer.disconnect();
	}, [loadMoreVideoShorts, videoShortsHasMore, videoShortsLoadError]);

	// Mobile Clips tab: once shorts arrive, jump straight into the swipe player (TikTok/Shorts).
	useEffect(() => {
		if (!isMobile || activeTab !== "shorts" || selectedShort !== null) return;
		if (videoShorts.length === 0) return;
		setSelectedShort(0);
	}, [isMobile, activeTab, selectedShort, videoShorts]);

	useEffect(() => {
		getMyChannel().then(ch => {
			const data = ch?.data ?? ch;
			setChannelId(data?.channel_id ?? null);
			setMyChannel(data ?? null);
		}).catch(() => {});
	}, []);

	useEffect(() => {
		if (showDashboard && window.location.pathname !== "/videos/studio") window.history.pushState({ nav: "videos", studio: true }, "", "/videos/studio");
		else if (!showDashboard && window.location.pathname === "/videos/studio") window.history.pushState({ nav: "videos" }, "", "/videos");
	}, [showDashboard]);
	useEffect(() => {
		// audit (FE low): a single popstate handler. There used to be two near-identical effects
		// (one checking "/videos/studio", one "/studio") that fought each other on every
		// back/forward — the "/studio" one fired setShowDashboard(false) almost always.
		const onPop = () => {
			const p = window.location.pathname;
			if (p !== "/videos/studio" && p !== "/studio") setShowDashboard(false);
		};
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	}, []);

	// Open the deep-linked video on mount. Read the token from the CURRENT URL (not just the
	// initialVideoId prop) so this also restores the video when VideosPage remounts after Back from
	// another section onto a /v/:id entry — the prop is a cold-load-only seed and may be cleared.
	// When the URL is plain /videos (e.g. returning to the category), tok is null → show the list (#111).
	useEffect(() => {
		// Channel deep link / cross-section Back onto /c/:key → restore the channel view.
		const ckey = window.location.pathname.match(/^\/c\/([^/-]+)/)?.[1];
		if (ckey) { openChannelFromKey(ckey); return; }
		// #435: the profile's Likes tab hands a specific video off to us when it navigates here, the
		// same way it already hands off an initial tab via __videosInitialTab. Consume it once.
		const handoff = window.__videosOpenVideoId ?? null;
		if (handoff) delete window.__videosOpenVideoId;
		const tok = window.location.pathname.match(/^\/v\/([^/-]+)/)?.[1] || handoff || initialVideoId;
		if (!isValidVideoRouteToken(tok)) {
			if (window.location.pathname.match(/^\/v\/undefined/)) {
				window.history.replaceState({ nav: "videos" }, "", "/videos");
			}
			return;
		}
		getVideo(tok).then(raw => {
			if (!raw) return;
			// Reuse the shared normalizer (flattens the channel object → string, guarding React #31)
			// and tag it with a feed section so it slots into the browse lists.
			const v = { ...mapApiVideo(raw), section: 'popular' };
			if (!hasVideoIdentity(v)) return;
			selectVideo(v);
			setVideoItems(prev => {
				const vid = v.id ?? v.videoId;
				if (prev.some(x => (x.id ?? x.videoId) === vid)) return prev;
				return [v, ...prev];
			});
			// Always trigger a background load of the full feed (use functional updater to avoid stale refs)
			getVideoFeed({}).then(data => {
				const items = listFrom(data);
				if (items.length) setVideoItems(prev => {
					const vid = v.id ?? v.videoId;
					const withDeep = prev.some(x => (x.id ?? x.videoId) === vid) ? prev : [v, ...prev];
					return [...withDeep, ...items.filter(x => (x.id ?? x.videoId) !== vid)];
				});
			}).catch(() => {});
		}).catch(() => {});
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	async function handleCreateChannel() {
		if (!channelHandle.trim() || !channelDisplayName.trim()) return;
		setChannelLoading(true);
		try {
			const ch = await createChannel({ handle: channelHandle.trim().toLowerCase(), display_name: channelDisplayName.trim(), description: channelDesc.trim() });
			const id = ch?.channel_id ?? ch?.channel?.channel_id ?? ch?.data?.channel_id ?? null;
			if (id) {
				setChannelId(id);
				openUploadAfterChannelRef.current = true;
				requestChannelCreateClose(true);
			} else {
				requestChannelCreateClose(true);
				notify({ title: i18n.t("videos.channelCreated"), message: i18n.t("videos.channelCreatedMessage"), danger: false });
			}
		} catch (err) {
			const msg = err?.response?.data?.message || "Failed to create channel. Handle may already be taken.";
			notify({ title: i18n.t("videos.couldntCreateChannel"), message: msg });
		}
		setChannelLoading(false);
	}

	// #382/#383: when a background upload finishes, optimistically drop the new video into the
	// current feed/shorts list so it shows immediately (it also arrives on the next feed load).
	useEffect(() => onVideoCreated(({ videoId, title, isShort, channelId: chId, category, thumbPreview }) => {
		if (isShort) {
			setVideoShorts(prev => [{
				id: videoId, title, channel: "You", channel_id: chId,
				handle: null, profile_pic_url: null, avatar: "Y", views: "0", likes_count: 0,
				duration: "0:30", processed_video_url: null,
				thumb: "linear-gradient(135deg, #3a1a1a, #2a0f0f)",
			}, ...prev]);
		} else {
			setVideoItems(prev => [{
				id: videoId, channel_id: chId, channel_description: null,
				title, description: "",
				channel: i18n.t("common.you"), avatar: "Y", views: fmtVideoViews(0), ago: i18n.t("common.justNow"), duration: "0:00",
				section: "recent", category: category || "auto", videoId, is_live: false,
				processed_video_url: null, thumb: thumbPreview || "linear-gradient(135deg, #1e3a5f, #0f2744)",
			}, ...prev]);
		}
	}), []);

	function handleUpload() {
		const filesToUpload = uploadFiles.length > 0 ? uploadFiles : (uploadFile ? [uploadFile] : []);
		if (!filesToUpload.length) return;
		// #382/#383: hand each file to the background upload manager and close the modal right away,
		// so the user can keep browsing (or leave Videos entirely) while it uploads. Progress shows
		// in the global UploadProgressWidget; the optimistic feed insert happens via onVideoCreated.
		const draftIds = uploadDrafts.submit();
		for (let i = 0; i < filesToUpload.length; i++) {
			// Per-video metadata from the bulk step form; fall back to the shared fields for single uploads.
			const meta = bulkMeta[i] ?? { title: i === 0 ? uploadTitle.trim() : "", desc: i === 0 ? uploadDesc.trim() : "", category: uploadCategory, isShort: uploadIsShort, thumbnail: i === 0 ? uploadThumbnail : null, thumbPreview: i === 0 ? uploadThumbPreview : null };
			const draftId = draftIds[i];
			enqueueUpload({ file: filesToUpload[i], meta, channelId, visibility: uploadVisibility, category: uploadCategory, onComplete: draftId ? () => deleteVideoDraft(channelId, draftId) : undefined });
		}
		// Close + reset the modal immediately; the upload continues in the background.
		setShowUpload(false); setUploadDone(false); setUploadFile(null); setUploadFiles([]); setUploadCurrentIdx(0);
		setUploadThumbnail(null); setUploadThumbPreview(null); setUploadTitle(""); setUploadDesc("");
		setUploadVisibility("public"); setUploadCategory("auto"); setUploadProgress(0); setUploadIsShort(null);
		setActiveDraftId(null);
	}

	const searchFiltered = useMemo(
		() => searchResults.filter(v => matchesCategory(activeCategory, (v.category || "").trim(), categories)),
		[activeCategory, searchResults, categories]
	);
	// Creator channels matching the search query. Dedup by the real channel_id — two creators
	// can share a display name, and deduping by name collapsed them into one row. Carry the
	// channel_id into channelObj so clicking opens the correct channel and loads its videos;
	// previously channelObj had no id, so VideoChannelPage fetched nothing and rendered an empty
	// "duplicate" profile with no videos/images (bug #47).
	const matchedChannels = useMemo(
		() => buildMatchedChannels(query, { searchResults, searchChannels, fallbackItems: videoItems }),
		[query, searchResults, searchChannels, videoItems],
	);

	if (loading && activeTab === "browse") return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 0 : 108, paddingRight: isMobile ? 0 : 32, overflow: "hidden" }}>
			<div style={{ padding: "28px 0 16px", ...(isMobile ? { paddingLeft: MOBILE_GUTTER_PX, paddingRight: MOBILE_GUTTER_PX } : {}) }}>
				<SkeletonHeading />
				<div style={{ display: "flex", gap: 4, margin: "16px 0", justifyContent: "center", flexWrap: "wrap" }}>
					{[...Array(4)].map((_,i) => <SkeletonCircle key={i} />)}
				</div>
				<div style={{ margin: "0 auto 16px", width: "min(680px, 100%)" }}><Skel w="100%" h={42} r={12} /></div>
				<div style={{ display: "flex", gap: 20, marginBottom: 28, justifyContent: "center", flexWrap: "wrap" }}>
					{[...Array(7)].map((_,i) => <SkeletonCircle key={i} />)}
				</div>
			</div>
			<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(max(300px, calc((100% - 60px) / 4)), 1fr))", gap: 20 }}>
				{[...Array(6)].map((_,i) => <SkeletonVideoCard key={i} />)}
			</div>
		</div>
	);

	// Rendered from each branch that shows cards. It portals to <body>, so its position in the tree
	// is irrelevant — only that it stays mounted while a card's Share is open.
	const shareDialog = shareTargetVideo
		? <VideoShareDialog video={shareTargetVideo} onClose={() => setShareTargetVideo(null)} />
		: null;

	let watchPageEl = null;
	if (selectedVideo) {
		const curIdx = videoItems.findIndex(v => (v.id ?? v.videoId) === (selectedVideo.id ?? selectedVideo.videoId));
		const playNextVideo = () => {
			const { next, rest } = shiftPlayQueue(playQueue);
			if (next) {
				setPlayQueue(rest);
				writePlayQueue(rest);
				selectVideo(next, { restore: false, autoPlay: true });
				return;
			}
			if (curIdx >= 0 && curIdx < videoItems.length - 1) {
				selectVideo(videoItems[curIdx + 1], { restore: false, autoPlay: true });
			}
		};
		const onNext = (playQueue.length > 0 || (curIdx >= 0 && curIdx < videoItems.length - 1)) ? playNextVideo : null;
		const onPrev = videoHistoryStack.length > 0 ? () => {
			const prev = videoHistoryStack[videoHistoryStack.length - 1];
			setVideoHistoryStack(s => s.slice(0, -1));
			setWatchAutoStart(true);
			setSelectedVideo(prev);
			if (prev?.id) getVideo(prev.id).then(full => {
				if (!full) return;
				const mapped = mapApiVideo(full);
				rememberPlayback(mapped);
				setSelectedVideo(curr => curr && curr.id === prev.id ? { ...curr, ...mapped } : curr);
			}).catch(() => {});
		} : null;
		// key by video id so switching videos (Up Next / Next-Prev) fully remounts the watch
		// page — otherwise like/dislike/save/subscriber counts (one-shot useState initializers)
		// carried over from the previous video until reload (audit H1).
		// Going back no longer ends the video: it shrinks into the corner and keeps playing until
		// the viewer closes it. The element is built here either way — rendered on its own when the
		// watch page has the screen, or alongside whatever page took over.
		watchPageEl = <VideoWatchPage key={selectedVideo?.id ?? selectedVideo?.videoId} video={selectedVideo} onBack={() => { setSelectedVideo(null); setWatchMinimized(false); setVideoHistoryStack([]); }} onMinimize={() => setWatchMinimized(true)} onChannel={(ch) => {
			if (ch?.channel_id ?? ch?.channelId) { openChannel(ch, { keepPlaying: true }); return; }
			openChannel({ ...selectedVideo, description: selectedVideo.channel_description ?? null }, { keepPlaying: true });
		}} likedIds={likedVideoIds} onToggleLike={(id) => { setLikedVideoIds(prev => { const n = new Set(prev); if (n.has(id)) { n.delete(id); setLikedVideos(vs => vs.filter(v => v.id !== id)); } else { n.add(id); setLikedVideos(vs => vs.some(v => v.id === id) ? vs : [selectedVideo, ...vs]); } return n; }); }} savedIds={watchLaterIds} onToggleSave={(id) => { toggleWatchLater(id).catch(() => {}); setWatchLaterIds(prev => { const n = new Set(prev); if (n.has(id)) { n.delete(id); setWatchLaterVideos(vs => vs.filter(v => v.id !== id)); } else { n.add(id); setWatchLaterVideos(vs => vs.some(v => v.id === id) ? vs : [selectedVideo, ...vs]); } return n; }); }} onNext={onNext} onPrev={onPrev} onVideoSelect={(v) => selectVideo(v, { restore: false, autoPlay: true })} onAddToPlaylist={openPlaylistPicker} onRecommend={channelId != null ? recommendVideoToSubscribers : undefined} myChannelId={channelId} playlistSaved={playlists.some((pl) => (pl.videos || []).some((v) => String(videoIdOf(v)) === String(selectedVideo?.id ?? selectedVideo?.videoId)))} onSubscribeChange={() => setSubVersion(v => v + 1)} onViewsUpdate={(vid, count) => setVideoItems(prev => prev.map(v => (v.id === vid || v.videoId === vid) ? { ...v, views: `${formatCount(count)} views`, views_count: count } : v))} onSearch={(q) => { setQuery(q); setActiveTab('browse'); setActiveCategory('all'); setSelectedVideo(null); setVideoHistoryStack([]); }} minimized={watchMinimized} onRestore={restoreWatch} onClose={() => { setSelectedVideo(null); setWatchMinimized(false); setVideoHistoryStack([]); }} autoStart={watchAutoStart} />;
	}

	const playlistSheet = (
		<SaveToPlaylistSheet
			open={showPlaylistModal}
			onClose={() => setShowPlaylistModal(false)}
			playlists={playlists}
			targetVideo={playlistTargetVideo}
			isMobile={isMobile}
			onToggle={async (pl, shouldAdd) => {
				try {
					const vid = videoIdOf(playlistTargetVideo);
					if (vid == null) throw new Error(playlistSaveError({ message: "missing video" }));
					if (shouldAdd) {
						const r = await addVideoToPlaylist(pl.id, vid);
						const np = playlistFromResponse(r);
						if (np) setPlaylists((prev) => prev.map((p) => p.id === pl.id ? np : p));
						else await refreshPlaylists();
					} else {
						await removeVideoFromPlaylist(pl.id, vid);
						setPlaylists((prev) => prev.map((p) => p.id === pl.id ? { ...p, videos: (p.videos || []).filter((x) => String(videoIdOf(x)) !== String(vid)) } : p));
					}
				} catch (err) {
					throw new Error(playlistSaveError(err));
				}
			}}
			onCreate={async (name, { isPublic } = {}) => {
				try {
					const trimmed = (name || "").trim();
					const vid = videoIdOf(playlistTargetVideo);
					const resolved = trimmed || (playlistTargetVideo
						? mixNameForCategory(playlistTargetVideo?.category)
						: i18n.t("videos.playlist", { defaultValue: "Playlist" }));
					if (!trimmed) {
						const existing = playlists.find((p) => p.name === resolved);
						if (existing) {
							if (vid == null) throw new Error(playlistSaveError({ message: "missing video" }));
							const r = await addVideoToPlaylist(existing.id, vid);
							const np = playlistFromResponse(r);
							if (np) setPlaylists((prev) => prev.map((p) => p.id === existing.id ? np : p));
							else await refreshPlaylists();
							return;
						}
					}
					const r = await createPlaylist(resolved, vid ?? undefined, {
						isPublic: !!isPublic && !!trimmed && !isMixPlaylist(resolved),
					});
					const np = playlistFromResponse(r);
					if (np) setPlaylists((prev) => [np, ...prev.filter((p) => p.id !== np.id)]);
					else await refreshPlaylists();
				} catch (err) {
					throw new Error(playlistSaveError(err));
				}
			}}
		/>
	);

	const edgeDrawerExcludeVideoId = selectedVideo?.id ?? selectedVideo?.videoId ?? null;
	const edgeDrawerOverlapChannelId = channelIdOf(selectedChannel) ?? selectedVideo?.channel_id ?? null;
	const edgeDrawerChannelName = selectedVideo
		? (typeof selectedVideo.channel === "string"
			? selectedVideo.channel
			: (selectedVideo.channel?.display_name ?? selectedVideo.channel?.name ?? null))
		: (selectedChannel?.display_name ?? selectedChannel?.name ?? null);
	const choiceToastEl = choiceToast ? createPortal(
		<div
			role="status"
			aria-live="polite"
			className="bg-surface-raised border border-border text-text-primary"
			style={{
				position: "fixed",
				left: "50%",
				bottom: "max(24px, env(safe-area-inset-bottom))",
				transform: "translateX(-50%)",
				zIndex: 10050,
				padding: "12px 18px",
				borderRadius: 12,
				fontFamily: "'DM Sans', sans-serif",
				fontSize: 13,
				fontWeight: 600,
				boxShadow: "0 12px 40px var(--color-shadow)",
				maxWidth: "min(420px, calc(100vw - 32px))",
				textAlign: "center",
			}}
		>
			{choiceToast}
		</div>,
		document.body,
	) : null;

	// The watch page is a sibling of the browse page, not a replacement for it: keeping both in the
	// tree is what lets a video carry on playing in the corner after the viewer goes back.
	const watchOpen = !!selectedVideo && !watchMinimized;
	const watchShell = (
		<div style={selectedVideo && watchMinimized
			? { position: "fixed", top: 0, left: 0, width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }
			: { display: "contents" }}>
			{watchPageEl}
		</div>
	);

	// Deliberately absent on the watch page and in the upload / channel-create / Explore flows:
	// each of those owns the phone screen and exits through its own back control. Only the
	// browse-style surfaces (home, clips grid, channel, playlist) carry the bar.
	const showVideosMobileNav = isMobile
		&& selectedShort == null
		&& !watchOpen
		&& !showUpload
		&& !showChannelCreate
		&& !mobileExploreTab;
	const mobileNavActive = mobileExploreOpen
		? "explore"
		: mobileProfileOpen
			? "profile"
			: activeTab === "shorts"
				? "clips"
				: (activeTab === "browse" || !activeTab)
					? "home"
					: null;
	const videosMobileChrome = (
		<>
			{showVideosMobileNav && (
				<VideosMobileBottomNav
					active={mobileNavActive}
					exploreOpen={mobileExploreOpen}
					profileOpen={mobileProfileOpen}
					onHome={() => {
						setMobileExploreOpen(false);
						setMobileProfileOpen(false);
						setMobileExploreTab(null);
						setSelectedChannel(null);
						setSelectedPlaylist(null);
						setActiveTab("browse");
					}}
					onClips={() => {
						setMobileExploreOpen(false);
						setMobileProfileOpen(false);
						setMobileExploreTab(null);
						setSelectedChannel(null);
						setSelectedPlaylist(null);
						setActiveTab("shorts");
						// Mobile Clips = TikTok/Shorts feed, not the thumbnail grid.
						if (videoShorts.length > 0) setSelectedShort(0);
					}}
					onUpload={() => {
						setMobileExploreOpen(false);
						setMobileProfileOpen(false);
						setShowUpload(true);
					}}
					onExploreOpen={() => {
						setMobileProfileOpen(false);
						setMobileExploreOpen(true);
					}}
					onExploreClose={() => setMobileExploreOpen(false)}
					exploreCounts={exploreCounts}
					onExplorePick={(tab) => {
						setMobileExploreOpen(false);
						setMobileExploreTab(tab);
						markExploreSeen(tab);
					}}
					onProfileOpen={() => {
						setMobileExploreOpen(false);
						setMobileProfileOpen(true);
					}}
					onProfileClose={() => setMobileProfileOpen(false)}
					onMyChannel={() => {
						setMobileProfileOpen(false);
						if (myChannel) openChannel(myChannel);
						else setShowChannelCreate(true);
					}}
					onCreatorStudio={() => {
						setMobileProfileOpen(false);
						if (typeof window.__nav === "function") window.__nav("sd-creator");
						else setShowDashboard(true);
					}}
				/>
			)}
			{mobileExploreTab && (
				<VideosExplorePanel
					tab={mobileExploreTab}
					// Same rows the Explore count counted: a watched video is not news here either.
					watchedIds={exploreWatchedIds}
					onClose={() => setMobileExploreTab(null)}
					onPickVideo={(v) => selectVideo(v)}
					onPickChannel={(ch) => openChannel(ch)}
					mapVideo={mapApiVideo}
					mapHistory={mapWatchHistory}
				/>
			)}
		</>
	);

	let pageMain = null;
	if (selectedPlaylist) {
		pageMain = (
			<PlaylistDetailPage
				playlist={selectedPlaylist}
				onBack={() => setSelectedPlaylist(null)}
				onVideoClick={(v, queue) => { setSelectedPlaylist(null); selectVideo(v, { queue }); }}
				onAddToPlaylist={openPlaylistPicker}
				onRemoveVideo={playlists.some((p) => p.id === selectedPlaylist.id) ? (v) => {
					const id = videoIdOf(v);
					if (id == null || selectedPlaylist?.id == null) return;
					removeVideoFromPlaylist(selectedPlaylist.id, id).catch(() => {});
					const nextVideos = (selectedPlaylist.videos || []).filter((x) => String(videoIdOf(x)) !== String(id));
					setSelectedPlaylist({ ...selectedPlaylist, videos: nextVideos, count: nextVideos.length });
					setPlaylists((prev) => prev.map((p) => p.id === selectedPlaylist.id ? { ...p, videos: nextVideos } : p));
				} : undefined}
			/>
		);
	} else if (selectedChannel) {
		pageMain = (
			<>
				<VideoChannelPage
					key={String(channelIdOf(selectedChannel) ?? selectedChannel.handle ?? "channel")}
					cardActions={cardActions}
					channel={selectedChannel}
					onBack={closeChannel}
					myChannelId={channelId}
					onOpenPlaylist={openPlaylist}
					onOpenChannel={openChannel}
					onRecommendChannel={channelId != null ? recommendChannelToSubscribers : undefined}
				/>
				{shareDialog}
			</>
		);
	} else if (selectedShort !== null) {
		// Leaving the immersive feed on mobile must also leave the Clips tab, or the auto-open
		// effect would immediately re-enter the player.
		const closeShorts = () => {
			setSelectedShort(null);
			if (isMobile && activeTab === "shorts") setActiveTab("browse");
		};
		pageMain = (
			<ShortsPlayer
				key={selectedShort}
				shorts={(activeTab === "browse" && activeFilter === "shorts") ? browseShorts : videoShorts}
				startIndex={selectedShort}
				prefetchSrc={shortsPrefetch}
				hasMore={(activeTab === "browse" && activeFilter === "shorts") ? browseShortsHasMore : videoShortsHasMore}
				loadingMore={(activeTab === "browse" && activeFilter === "shorts") ? browseShortsLoadingMore : videoShortsLoadingMore}
				onLoadMore={(activeTab === "browse" && activeFilter === "shorts") ? loadMoreBrowseShorts : loadMoreVideoShorts}
				onClose={closeShorts}
				onChannelClick={ch => { closeShorts(); openChannel(ch); }}
			/>
		);
	} else {
		pageMain = (
		<div style={{ flex: 1, display: watchOpen ? "none" : "flex", flexDirection: "column", overflow: "hidden", minHeight: 0, paddingLeft: isMobile ? 0 : 108, paddingRight: isMobile ? 0 : 32 }}>
			{videosDialog}
			{shareDialog}
			<div className="videos-scroll" data-strug-page-scroll="" onScroll={handleHeaderScroll} style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0, paddingBottom: isMobile ? `calc(${VIDEOS_MOBILE_NAV_HEIGHT}px + 12px + env(safe-area-inset-bottom, 0px))` : 0 }}>
				<div style={{ padding: "28px 0 16px", animation: "fadeUp 0.3s ease both", ...(isMobile ? { paddingLeft: MOBILE_GUTTER_PX, paddingRight: MOBILE_GUTTER_PX, overflow: "hidden", maxHeight: headerVisible ? 360 : 0, opacity: headerVisible ? 1 : 0, paddingTop: headerVisible ? "calc(env(safe-area-inset-top, 0px) + 20px)" : 0, paddingBottom: headerVisible ? 12 : 0, transition: "max-height 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s linear, padding 0.3s cubic-bezier(0.4,0,0.2,1)" } : {}) }}>
					{/* One header row: brand left, search in the middle, actions right — the layout the
					    client asked for. The title used to sit centred between two absolutely-positioned
					    clusters with the search bar on its own line below, which cost a whole row of
					    height. flexWrap + `order` keeps that single row on a pointer device and drops
					    the search to its own full-width line on a phone, where three across never fit. */}
					<div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: isMobile ? 12 : 20, rowGap: 8, marginBottom: 16 }}>
						<h1 className="text-text-primary" style={{ order: 1, flex: 1, minWidth: 0, margin: 0, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(22px, 2.2vw, 30px)", letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{i18n.t("videos.brandTitle")}</h1>
						{activeTab === "browse" && (
							// Desktop: takes the middle of the row. Phone: flexBasis 100% drops it onto its
							// own full-width line beneath the brand and the actions.
							<div style={{ order: isMobile ? 3 : 2, ...(isMobile ? { flexBasis: "100%" } : { flex: "0 1 680px" }), minWidth: 0 }}>
								<SearchSuggestBox
									value={query}
									onChange={setQuery}
									onSubmit={(q) => setQuery(q)}
									onPickVideo={(v) => selectVideo(v)}
									onPickChannel={(ch) => openChannel({ channel_id: ch.channel_id, channel: ch.display_name, display_name: ch.display_name, profile_pic_url: ch.profile_pic_url, handle: ch.handle })}
									isMobile={isMobile}
									placeholder={searchPlaceholder}
								/>
							</div>
						)}
						{/* #473 once widened this gap to 54px on mobile so the global notification bell, then
						    fixed at top:12/right:58, could nest between these buttons instead of covering them.
						    That bell has since moved to a floating bottom-left position (App.jsx: "so it no
						    longer overlaps the top of the page"), so the hole is no longer needed — keeping it
						    only pushed Upload onto a second line. */}
						<div style={{ order: isMobile ? 2 : 3, flex: 1, minWidth: 0, display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
							<button onClick={() => channelId ? setShowUpload(true) : setShowChannelCreate(true)} title={i18n.t("videos.upload")} disabled={uploading} style={{ display: "flex", alignItems: "center", gap: 6, padding: isMobile ? "6px 12px" : "7px 14px", borderRadius: 10, background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", color: "#60a5fa", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.5 : 1 }}>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
								{i18n.t("common.upload")}
							</button>
							<Tooltip text="Creator Studio"><button onClick={() => window.__nav?.('sd-creator')} aria-label="Creator Studio" className="bg-surface border border-border text-text-secondary" style={{ width: isMobile ? 34 : 38, height: isMobile ? 34 : 38, borderRadius: 10,    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
								<svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
							</button></Tooltip>

							<Tooltip text="Library"><button ref={libBtnRef} onClick={() => { if (!showLibraryPopup) libOpenedAtRef.current = Date.now(); setShowLibraryPopup(v => !v); }} aria-label="Library" style={{ width: isMobile ? 34 : 38, height: isMobile ? 34 : 38, borderRadius: 10, background: showLibraryPopup ? "rgba(37,99,235,0.18)" : "var(--color-surface)", border: `1px solid ${showLibraryPopup ? "rgba(37,99,235,0.4)" : "var(--color-border)"}`, color: showLibraryPopup ? "#60a5fa" : "var(--color-text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
								<svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
							</button></Tooltip>
							{showLibraryPopup && (() => {
								const btnRect = libBtnRef.current?.getBoundingClientRect();
								const top = btnRect ? btnRect.bottom + 8 : 60;
								const right = btnRect ? window.innerWidth - btnRect.right : 16;
								// Portal to document.body: the page wrapper keeps a persisted `transform`
								// (pageEnter animation, fill-mode both) which contains + clips this
								// position:fixed popup behind the scrolling cards. Portaling escapes it.
								return createPortal(<>
									{/* backdrop — closes on outside click; guard against ghost-click from the button's own touch event */}
									<div onClick={() => { if (Date.now() - libOpenedAtRef.current > 100) setShowLibraryPopup(false); }} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />
									<div className="bg-surface-raised border border-border" style={{ position: "fixed", top, right,   borderRadius: 12, padding: "8px", minWidth: 210, zIndex: 9999, boxShadow: "0 12px 40px var(--color-shadow)" }}>
										{[
											{ id: "history",       label: i18n.t("videos.watchHistory") },
											{ id: "playlists",     label: i18n.t("videos.yourPlaylists") },
											{ id: "watchlater",    label: i18n.t("videos.watchLater") },
											{ id: "liked",         label: i18n.t("videos.likedVideos") },
											{ id: "subscriptions", label: i18n.t("videos.subscriptions") },
										].map(item => (
											<button key={item.id} onClick={() => { setActiveTab(item.id); setShowLibraryPopup(false); }} style={{ display: "block", width: "100%", padding: "10px 14px", borderRadius: 8, background: activeTab === item.id ? "rgba(37,99,235,0.15)" : "transparent", border: "none", color: activeTab === item.id ? "#60a5fa" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer", textAlign: "left", transition: "background 0.13s" }}
												onMouseEnter={e => { if (activeTab !== item.id) e.currentTarget.style.background = "var(--color-surface)"; }}
												onMouseLeave={e => { if (activeTab !== item.id) e.currentTarget.style.background = "transparent"; }}>
												{item.label}
											</button>
										))}
									</div>
								</>, document.body);
							})()}
						</div>
					</div>
				</div>

				{(activeTab === "browse" || activeTab === "shorts") && !isMobile && (
					<div>
						<VideoSectionTabs activeTab={activeTab} onSelect={setActiveTab} />
					</div>
				)}

				{activeTab === "browse" && (
					<>
						<div style={isMobile ? { paddingLeft: MOBILE_GUTTER_PX, paddingRight: MOBILE_GUTTER_PX } : undefined}>
							<VideoCategoryBar categories={orderedChips} activeId={activeChipId} onSelect={selectBrowseChip} />
						</div>
						{activeFilter === "shorts" ? (
							/* Shorts grid — category-aware. The chip filters server-side via
							   /video/shorts?category=… (browseShorts), so a category's shorts from
							   anywhere in the catalogue appear, not just those in the loaded set. */
							<div style={{ paddingBottom: 24, ...(isMobile ? { paddingLeft: MOBILE_GUTTER_PX, paddingRight: MOBILE_GUTTER_PX } : {}) }}>
								{(browseLoading || activeCategory === "all") && (
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12,  marginBottom: 20 }}>
										{browseLoading ? "Loading…" : i18n.t("videos.shortsHint")}
									</p>
								)}
								{!browseLoading && browseShorts.length === 0 ? (
									<div className="text-text-muted" style={{ textAlign: "center", padding: "60px 0",  fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>No clips in this category yet.</div>
								) : (
								<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
									{browseShorts.map((s, i) => (
										<div key={s.id} onClick={() => openShort(i)} {...clickableProps(() => openShort(i))} aria-label={i18n.t("videos.playShort", { defaultValue: "Play clip" })} style={{ borderRadius: 14, overflow: "hidden", cursor: "pointer", position: "relative", animation: `fadeUp 0.3s ease ${i * 35}ms both` }}
											onMouseEnter={e => { e.currentTarget.querySelector(".shorts-overlay").style.opacity = "1"; }}
											onMouseLeave={e => { e.currentTarget.querySelector(".shorts-overlay").style.opacity = "0"; }}>
											{/* Thumbnail is video media — stays dark regardless of theme (rule 3). */}
											<div style={{ width: "100%", paddingBottom: "177%", ...(s.thumb?.startsWith?.("http") ? { backgroundImage: `url(${s.thumb})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: s.thumb }), position: "relative", borderRadius: 14 }}>
												<div className="shorts-overlay" style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.2s", borderRadius: 14 }}>
													<div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.2)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
														<svg width={18} height={18} viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
													</div>
												</div>
												<div style={{ position: "absolute", bottom: 8, right: 8, zIndex: 4, background: "rgba(0,0,0,0.75)", borderRadius: 4, padding: "2px 6px", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, color: "#fff", whiteSpace: "nowrap" }}>{s.duration}</div>
												<div style={{ position: "absolute", bottom: 8, left: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{typeof s.views === "number" ? fmtVideoViews(s.views) : `${s.views} ${i18n.t("videos.views")}`}</div>
											</div>
											<div style={{ padding: "8px 4px 4px" }}>
												<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,  lineHeight: 1.3, marginBottom: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.title}</p>
												<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
													<div className="bg-surface-raised text-text-primary" style={{ width: 18, height: 18, borderRadius: "50%",  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700,  fontFamily: "'Barlow Condensed', sans-serif", flexShrink: 0 }}>{s.avatar}</div>
													<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{s.channel}</span>
												</div>
											</div>
										</div>
									))}
								</div>
								)}
								{browseShortsHasMore && (
									<div ref={browseShortsLoadMoreRef} role="status" aria-live="polite" className="text-text-muted" style={{ minHeight: 44, padding: "16px 0", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
										{browseShortsLoadError ? (
											<button type="button" onClick={loadMoreBrowseShorts} className="text-text-primary" style={{ minHeight: 44, padding: "8px 16px", background: "none", border: 0, font: "inherit", fontWeight: 700, cursor: "pointer" }}>{i18n.t("common.retry", { defaultValue: "Retry" })}</button>
										) : browseShortsLoadingMore ? i18n.t("common.loading") : ""}
									</div>
								)}
							</div>
						) : (!query.trim() && activeFilter === "all" && activeCategory === "all") ? (
							/* Editorial landing: personalised home-feed (server infers taste from history + searches). */
							<div style={{ paddingBottom: 24 }}>
								{personalFeedLoading ? (
									/* Feed still in flight — mirror the shelf layout with skeletons so the
									   landing never flashes bare headings before the first section resolves. */
									<div style={{ marginBottom: 36 }}>
										<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : VIDEO_FEED_GRID, gap: isMobile ? 16 : 20 }}>
											{Array.from({ length: 8 }).map((_, i) => <SkeletonVideoCard key={i} />)}
										</div>
									</div>
								) : personalFeedItems.length === 0 ? (
									/* Genuinely no videos anywhere — a single friendly empty-state instead of
									   three bare section headings over blank space. */
									<div style={{ textAlign: "center", padding: "80px 20px", animation: "fadeUp 0.3s ease both" }}>
										<svg width={52} height={52} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 18 }}>
											<rect x="2" y="4" width="20" height="16" rx="3" />
											<path d="M10 9l5 3-5 3V9z" />
										</svg>
										<p className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: "0.04em", textTransform: "uppercase",  margin: "0 0 8px" }}>{i18n.t("videos.emptyTitle", { defaultValue: "No videos yet" })}</p>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14,  margin: 0 }}>{i18n.t("videos.emptySubtitle", { defaultValue: "Check back soon — fresh uploads are on the way." })}</p>
									</div>
								) : (
									<>
										{/* Trending is around four rows, so the first clips shelf lands where the
										    full-width featured video used to, roughly a screen down. The rest are
										    dropped into the long Recently Uploaded grid at uneven gaps. */}
										{/* One feed rather than Trending / Recently Uploaded / Most Popular stacked with a
										    heading over each. The headings chopped the page into three short lists that ran
										    out, and the same videos appeared under more than one of them. The ordering they
										    encoded is kept — trending first, then fresh, then popular — it is just no longer
										    announced, and the feed keeps going instead of ending. */}
										{/* Clips still sit at row breaks inside the grid so the first grid card is a
										    video, not a clip. On mobile, watched rails wrap that feed when history
										    exists: recent on top, shuffled after the current grid. New viewers get
										    neither rail. */}
										{isMobile && (
											<WatchedVideosShelf
												label={i18n.t("videos.recentlyWatched")}
												videos={watchedShelves.recent}
												onVideoClick={selectVideo}
												cardActions={cardActions}
												onSeeAll={() => setActiveTab("history")}
											/>
										)}
										<VideoSection
											cardActions={cardActions}
											videos={homeFeed}
											onVideoClick={selectVideo}
											interleave={{ breakAt: homeShelfBreaks, render: renderHomeShelf }}
										/>
										{homeFeed.length < CARDS_PER_ROW && renderPlaylistsShelf()}
										{isMobile && (
											<WatchedVideosShelf
												label={i18n.t("videos.watched")}
												videos={watchedShelves.more}
												onVideoClick={selectVideo}
												cardActions={cardActions}
											/>
										)}
										{homeHasMore && <div ref={homeSentinelRef} style={{ height: 1 }} />}
										{homeLoadingMore && (
											<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, textAlign: "center", padding: "10px 0 24px" }}>{i18n.t("videos.loadingMore", { defaultValue: "Loading more…" })}</p>
										)}
									</>
								)}
							</div>
						) : !query.trim() ? (
							/* Filtered browse: any (section filter × category) combination other than the
							   editorial landing. Server-backed (browseResults) so the chip composes with
							   Trending/Latest/Mix and pulls the whole catalogue's matches, not just the
							   ~40 locally-loaded videos. */
							<div style={{ paddingBottom: 24 }}>
								{browseLoading && (
									<p className="text-text-secondary" style={{ fontSize: 12,  fontFamily: "'DM Sans', sans-serif", marginBottom: 20, ...(isMobile ? { paddingLeft: MOBILE_GUTTER_PX, paddingRight: MOBILE_GUTTER_PX } : {}) }}>
										Loading…
									</p>
								)}
								{browseLoading ? (
									<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : VIDEO_FEED_GRID, gap: isMobile ? 16 : 20 }}>
										{Array.from({ length: 8 }).map((_, i) => <SkeletonVideoCard key={i} />)}
									</div>
								) : browseResults.length === 0 ? (
									<div className="text-text-muted" style={{ textAlign: "center", padding: "60px 20px",  fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("videos.noVideosInCategory")}</div>
								) : (
									<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : VIDEO_FEED_GRID, gap: isMobile ? 16 : 20 }}>
										{browseResults.map((video, i) => <VideoCard key={video.id ?? video.title} video={video} delay={i * 40} onClick={() => selectVideo(video)} style={{ width: "100%" }} {...cardActions} mobileBleed={isMobile} />)}
									</div>
								)}
							</div>
						) : (
							<div style={{ paddingBottom: 24, ...(isMobile ? { paddingLeft: MOBILE_GUTTER_PX, paddingRight: MOBILE_GUTTER_PX } : {}) }}>
								{/* Creator/channel results */}
								{matchedChannels.length > 0 && (
									<div style={{ marginBottom: 32 }}>
										<p className="text-text-secondary" style={{ fontSize: 12, fontWeight: 700,  fontFamily: "'DM Sans', sans-serif", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>{i18n.t("videos.channels")}</p>
										<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
											{matchedChannels.map((ch, i) => (
												<div key={ch.channelObj.channel_id ?? ch.name} onClick={() => openChannel(ch.channelObj)} {...clickableProps(() => openChannel(ch.channelObj))}className="bg-surface border border-border-subtle" style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px",   borderRadius: 14, cursor: "pointer", animation: `fadeUp 0.3s ease ${i * 40}ms both` }}
													onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-raised)"}
													onMouseLeave={e => e.currentTarget.style.background = "var(--color-surface)"}>
													<div className="bg-surface-raised text-text-primary" style={{ width: 56, height: 56, borderRadius: "50%", 
														border: "1.5px solid var(--color-border)", display: "flex", alignItems: "center",
														justifyContent: "center", fontSize: 22, fontWeight: 700, 
														fontFamily: "'Barlow Condensed', sans-serif", flexShrink: 0, overflow: "hidden" }}>
														<SafeImage loading="lazy" decoding="async" src={ch.channelObj?.profile_pic_url}
															alt={ch.name}
															style={{ width: "100%", height: "100%", objectFit: "cover" }}
															fallback={ch.avatar} />
													</div>
													<div>
														<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15,  marginBottom: 2 }}>{ch.name}</p>
														<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{ch.videoCount} video{ch.videoCount !== 1 ? "s" : ""}</p>
													</div>
													<div style={{ marginLeft: "auto", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#60a5fa", fontWeight: 600 }}>{i18n.t("videos.viewChannel")}</div>
												</div>
											))}
										</div>
									</div>
								)}
								{/* Video results — now backed by the real /video/search endpoint instead of the
									client-side filter over the limited 40-item global feed. */}
								{query.trim().length < 2 ? (
									<p className="text-text-secondary" style={{ fontSize: 12,  fontFamily: "'DM Sans', sans-serif", marginBottom: 20 }}>{i18n.t("videos.searchMinChars")}</p>
								) : (
									<>
										{searching && (
											<p className="text-text-secondary" style={{ fontSize: 12,  fontFamily: "'DM Sans', sans-serif", marginBottom: 20 }}>
												Searching…
											</p>
										)}
										<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(max(300px, calc((100% - 60px) / 4)), 1fr))", gap: 20 }}>
											{searchFiltered.map((video, i) => <VideoCard key={video.id ?? video.title} video={video} delay={i * 40} onClick={() => selectVideo(video)} style={{ width: "100%" }} {...cardActions} />)}
										</div>
									</>
								)}
							</div>
						)}
					</>
				)}

				{activeTab === "history" && (
					<div style={{ paddingBottom: 24, width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", overflowX: isMobile ? "hidden" : undefined }}>
						<button onClick={() => setActiveTab("browse")} className="text-text-secondary" style={{ background: "none", border: "none",  cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 16, padding: 0, ...(isMobile ? { marginLeft: MOBILE_GUTTER_PX } : {}) }}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>{i18n.t("videos.landingTitle")}</button>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12,  marginBottom: 20, ...(isMobile ? { paddingLeft: MOBILE_GUTTER_PX, paddingRight: MOBILE_GUTTER_PX } : {}) }}>{i18n.t("videos.recentlyWatched")}</p>
						{watchHistory.length === 0 && <div className="text-text-muted" style={{ textAlign: "center", padding: "60px 0",  fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>No watch history yet. Videos you watch will appear here.</div>}
						<div data-testid="watch-history-grid" style={{ display: "grid", width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : VIDEO_FEED_GRID, gap: isMobile ? 16 : 20 }}>
							{watchHistory.map((v, i) => <VideoCard key={v.id ?? v.title} video={v} delay={i * 40} onClick={() => selectVideo(v)} style={{ width: "100%" }} {...cardActions} mobileBleed={isMobile} />)}
						</div>
						{watchHistoryHasMore && (
							<button type="button" onClick={() => watchHistoryCursor && loadWatchHistory(watchHistoryCursor)} disabled={watchHistoryLoadingMore} className="bg-surface-raised border border-border text-text-primary" style={{ display: "block", minWidth: 140, minHeight: 44, margin: "24px auto 0", padding: "10px 18px", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, cursor: watchHistoryLoadingMore ? "wait" : "pointer", opacity: watchHistoryLoadingMore ? 0.65 : 1 }}>
								{watchHistoryLoadingMore ? i18n.t("common.loading") : i18n.t("common.loadMore")}
							</button>
						)}
					</div>
				)}

				{activeTab === "playlists" && (
					<div style={{ paddingBottom: 24, ...(isMobile ? { paddingLeft: MOBILE_GUTTER_PX, paddingRight: MOBILE_GUTTER_PX } : {}) }}>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
							<button onClick={() => setActiveTab("browse")} className="text-text-secondary" style={{ background: "none", border: "none",  cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, padding: 0 }}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>{i18n.t("videos.landingTitle")}</button>
							<button onClick={() => { setNewPlaylistName(""); setPlaylistTargetVideo(null); setShowPlaylistModal(true); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "#2563eb", border: "none", borderRadius: 20, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
								<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
								{i18n.t("videos.newPlaylist")}
							</button>
						</div>
						{playlists.length === 0 ? (
							<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: 12 }}>
								<svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{i18n.t("videos.noPlaylists")}</p>
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("videos.playlistAddHint")}</p>
							</div>
						) : (
							<div style={{ display: isMobile ? "flex" : "grid", flexDirection: isMobile ? "column" : undefined, gridTemplateColumns: isMobile ? undefined : "repeat(auto-fill, minmax(220px, 1fr))", gap: isMobile ? 14 : 20 }}>
								{playlists.map((pl, i) => (
									<PlaylistCard
										key={pl.id}
										playlist={pl}
										isMobile={isMobile}
										delay={i * 40}
										onOpen={openPlaylist}
									/>
								))}
							</div>
						)}
					</div>
				)}

				{activeTab === "watchlater" && (
					<div style={{ paddingBottom: 24 }}>
						<button onClick={() => setActiveTab("browse")} className="text-text-secondary" style={{ background: "none", border: "none",  cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 16, padding: 0, ...(isMobile ? { marginLeft: MOBILE_GUTTER_PX } : {}) }}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>{i18n.t("videos.landingTitle")}</button>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12,  marginBottom: 20, ...(isMobile ? { paddingLeft: MOBILE_GUTTER_PX, paddingRight: MOBILE_GUTTER_PX } : {}) }}>{watchLaterVideos.length} saved video{watchLaterVideos.length !== 1 ? "s" : ""}</p>
						{watchLaterVideos.length === 0 && <div className="text-text-muted" style={{ textAlign: "center", padding: "60px 0",  fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("videos.noWatchLater")}</div>}
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : VIDEO_FEED_GRID, gap: isMobile ? 16 : 20 }}>
							{watchLaterVideos.map((v, i) => <VideoCard key={v.id ?? v.title} video={v} delay={i * 40} onClick={() => selectVideo(v)} style={{ width: "100%" }} {...cardActions} mobileBleed={isMobile} />)}
						</div>
					</div>
				)}

				{activeTab === "liked" && (
					<div style={{ paddingBottom: 24 }}>
						<button onClick={() => setActiveTab("browse")} className="text-text-secondary" style={{ background: "none", border: "none",  cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 16, padding: 0, ...(isMobile ? { marginLeft: MOBILE_GUTTER_PX } : {}) }}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>{i18n.t("videos.landingTitle")}</button>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12,  marginBottom: 20, ...(isMobile ? { paddingLeft: MOBILE_GUTTER_PX, paddingRight: MOBILE_GUTTER_PX } : {}) }}>{likedVideos.length || likedVideoIds.size} liked video{(likedVideos.length || likedVideoIds.size) !== 1 ? "s" : ""}</p>
						{likedVideos.length === 0 && likedVideoIds.size === 0 && <div className="text-text-muted" style={{ textAlign: "center", padding: "60px 0",  fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("videos.noLikedVideos")}</div>}
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : VIDEO_FEED_GRID, gap: isMobile ? 16 : 20 }}>
							{(likedVideos.length > 0 ? likedVideos : videoItems.filter(v => likedVideoIds.has(v.id))).map((v, i) => <VideoCard key={v.id ?? v.title} video={v} delay={i * 40} onClick={() => selectVideo(v)} style={{ width: "100%" }} {...cardActions} mobileBleed={isMobile} />)}
						</div>
					</div>
				)}

				{activeTab === "subscriptions" && (
					<div style={{ paddingBottom: 24 }}>
						<button onClick={() => setActiveTab("browse")} className="text-text-secondary" style={{ background: "none", border: "none",  cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 16, padding: 0 }}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>{i18n.t("videos.landingTitle")}</button>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12,  marginBottom: 20 }}>{subscriptionChannels.length} channel{subscriptionChannels.length !== 1 ? "s" : ""} subscribed</p>
						{subscriptionChannels.length === 0 && <div className="text-text-muted" style={{ textAlign: "center", padding: "60px 0",  fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("videos.noSubscriptionsHint")}</div>}
						<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
							{subscriptionChannels.map(ch => (
								<div key={ch.channelId} className="bg-surface border border-border-subtle" style={{   borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
									<div onClick={() => openChannel({ channelId: ch.channelId, name: ch.name, handle: ch.handle, avatar: ch.avatar, thumb: ch.thumb, subscriber_count: ch.subscribers, profile_pic_url: ch.profile_pic_url ?? null })} {...clickableProps(() => openChannel({ channelId: ch.channelId, name: ch.name, handle: ch.handle, avatar: ch.avatar, thumb: ch.thumb, subscriber_count: ch.subscribers, profile_pic_url: ch.profile_pic_url ?? null }))} style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, cursor: "pointer" }}>
										<div style={{ width: 48, height: 48, borderRadius: "50%", background: "#2563eb", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, color: "#fff", flexShrink: 0 }}>
											<SafeImage loading="lazy" decoding="async" src={ch.profile_pic_url} alt={ch.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} fallback={ch.avatar} />
										</div>
										<div style={{ flex: 1 }}>
											<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15,  marginBottom: 2 }}>{ch.name}</p>
											{ch.handle && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>@{ch.handle}</p>}
											<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{fmtVideoSubscribers(ch.subscribers)}</p>
										</div>
									</div>
									<button onClick={async () => {
										try { await unsubscribeFromChannel(ch.channelId); } catch { /* noop */ }
										setSubscriptionChannels(prev => prev.filter(c => c.channelId !== ch.channelId));
									}} className="bg-surface-raised border border-border text-text-secondary" style={{ padding: "8px 16px",   borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12,  cursor: "pointer", flexShrink: 0 }}>{i18n.t("videos.unsubscribe")}</button>
								</div>
							))}
						</div>
					</div>
				)}

				{activeTab === "shorts" && (
					isMobile ? (
						/* Mobile Clips opens ShortsPlayer; this is only the empty / still-loading shell. */
						<div style={{ padding: "48px 0", textAlign: "center" }}>
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
								{videoShorts.length === 0 ? i18n.t("videos.noClipsYet") : i18n.t("videos.shortsHint")}
							</p>
						</div>
					) : (
					<div style={{ paddingBottom: 24 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12,  marginBottom: 20 }}>{i18n.t("videos.shortsHint")}</p>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
							{videoShorts.map((s, i) => (
								<div key={s.id} onClick={() => openShort(i)} {...clickableProps(() => openShort(i))} aria-label={i18n.t("videos.playShort", { defaultValue: "Play clip" })} style={{ borderRadius: 14, overflow: "hidden", cursor: "pointer", position: "relative", animation: `fadeUp 0.3s ease ${i * 35}ms both` }}
									onMouseEnter={e => { e.currentTarget.querySelector(".shorts-overlay").style.opacity = "1"; }}
									onMouseLeave={e => { e.currentTarget.querySelector(".shorts-overlay").style.opacity = "0"; }}>
									{/* Thumbnail is video media — stays dark regardless of theme (rule 3). */}
									<div style={{ width: "100%", paddingBottom: "177%", ...(s.thumb?.startsWith?.("http") ? { backgroundImage: `url(${s.thumb})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: s.thumb || "linear-gradient(135deg,#1e3a5f,#0f2744)" }), position: "relative", borderRadius: 14 }}>
										<div className="shorts-overlay" style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.2s", borderRadius: 14 }}>
											<div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.2)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
												<svg width={18} height={18} viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
											</div>
										</div>
										<div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.75)", borderRadius: 4, padding: "2px 6px", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, color: "#fff" }}>{s.duration}</div>
										<div style={{ position: "absolute", bottom: 8, left: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{typeof s.views === "number" ? fmtVideoViews(s.views) : `${s.views} ${i18n.t("videos.views")}`}</div>
									</div>
									<div style={{ padding: "8px 4px 4px" }}>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,  lineHeight: 1.3, marginBottom: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.title}</p>
										<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
											<div className="bg-surface-raised text-text-primary" style={{ width: 18, height: 18, borderRadius: "50%",  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700,  fontFamily: "'Barlow Condensed', sans-serif", flexShrink: 0 }}>{s.avatar}</div>
											<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{s.channel}</span>
										</div>
									</div>
								</div>
							))}
							</div>
							{videoShortsHasMore && (
								<div ref={videoShortsLoadMoreRef} role="status" aria-live="polite" className="text-text-muted" style={{ minHeight: 44, padding: "16px 0", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
									{videoShortsLoadError ? (
										<button type="button" onClick={loadMoreVideoShorts} className="text-text-primary" style={{ minHeight: 44, padding: "8px 16px", background: "none", border: 0, font: "inherit", fontWeight: 700, cursor: "pointer" }}>{i18n.t("common.retry", { defaultValue: "Retry" })}</button>
									) : videoShortsLoadingMore ? i18n.t("common.loading") : ""}
								</div>
							)}
						</div>
						)
				)}
			</div>

		{/* Channel Create Modal */}
		{showChannelCreate && (
			<CreatorModalViewport style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={() => { if (!channelLoading) requestChannelCreateClose(); }}>
				<div role="dialog" aria-modal="true" aria-labelledby={`${uid}-create-channel-title`} onClick={e => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ borderRadius: 18, padding: isMobile ? 18 : 32, width: "min(480px, 100%)", maxHeight: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch", boxSizing: "border-box" }}>
					<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
						<h3 id={`${uid}-create-channel-title`} className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, margin: "0 0 6px", letterSpacing: "0.04em", textTransform: "uppercase" }}>{i18n.t("videos.createChannel")}</h3>
						<button type="button" onClick={requestChannelCreateClose} disabled={channelLoading} aria-label={i18n.t("common.close", { defaultValue: "Close" })} className="border border-border text-text-secondary" style={{ width: 44, height: 44, marginTop: -8, marginRight: -8, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "50%", background: "var(--color-surface)", cursor: channelLoading ? "wait" : "pointer", opacity: channelLoading ? 0.45 : 1 }}>
							<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
						</button>
					</div>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13,  marginBottom: 20 }}>Set up your channel before uploading your first video.</p>
					<div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
						<div>
							<label htmlFor={`${uid}-ch-handle`} className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,  display: "block", marginBottom: 6 }}>{i18n.t("videos.handle")}</label>
							<input id={`${uid}-ch-handle`} value={channelHandle} onChange={e => setChannelHandle(e.target.value.replace(/[^a-zA-Z0-9._]/g, "").toLowerCase())} placeholder="e.g. mychannel" className="bg-surface border border-border text-text-primary" style={{ width: "100%", padding: "11px 14px",   borderRadius: 10,  fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
						</div>
						<div>
							<label htmlFor={`${uid}-ch-name`} className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,  display: "block", marginBottom: 6 }}>{i18n.t("videos.channelName")}</label>
							<input id={`${uid}-ch-name`} value={channelDisplayName} onChange={e => setChannelDisplayName(e.target.value)} placeholder="Your channel name" className="bg-surface border border-border text-text-primary" style={{ width: "100%", padding: "11px 14px",   borderRadius: 10,  fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
						</div>
						<div>
							<label htmlFor={`${uid}-ch-desc`} className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,  display: "block", marginBottom: 6 }}>{i18n.t("videos.descriptionOptional")}</label>
							<textarea id={`${uid}-ch-desc`} value={channelDesc} onChange={e => setChannelDesc(e.target.value)} rows={2} placeholder={i18n.t("videos.channelAboutPlaceholder")} className="bg-surface border border-border text-text-primary" style={{ width: "100%", padding: "11px 14px",   borderRadius: 10,  fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", resize: "none", boxSizing: "border-box" }} />
						</div>
					</div>
					<div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
						<button onClick={requestChannelCreateClose} disabled={channelLoading} className="border border-border text-text-secondary" style={{ minHeight: 44, padding: "9px 18px", background: "none", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: channelLoading ? "wait" : "pointer", opacity: channelLoading ? 0.45 : 1 }}>{i18n.t("common.cancel")}</button>
						<button onClick={handleCreateChannel} disabled={channelLoading || !channelHandle.trim() || !channelDisplayName.trim()} style={{ padding: "9px 22px", background: "#2563eb", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: (channelLoading || !channelHandle.trim() || !channelDisplayName.trim()) ? 0.6 : 1 }}>{channelLoading ? i18n.t("videos.creating") : i18n.t("videos.createChannelButton")}</button>
					</div>
				</div>
			</CreatorModalViewport>
		)}

		{/* Upload Modal — landscape panel: media left, fields right. Mobile is compact so the
		    sheet fits the viewport with less scrolling. Preview is a real playable <video>; a
		    custom thumbnail covers it (YouTube-style) until the user presses play. */}
		{showUpload && (() => {
			const isBulkThumb = uploadFiles.length > 1 && bulkMeta.length > 0;
			const thumbSrc = isBulkThumb ? (bulkMeta[bulkStep]?.thumbPreview ?? null) : uploadThumbPreview;
			const thumbFile = isBulkThumb ? (bulkMeta[bulkStep]?.thumbnail ?? null) : uploadThumbnail;
			const openThumbPicker = () => {
				if (uploading) return;
				(isBulkThumb ? bulkThumbInputRef : uploadThumbInputRef).current?.click();
			};
			const onThumbFile = (e) => {
				const f = e.target.files?.[0];
				if (!f) return;
				const url = URL.createObjectURL(f);
				if (isBulkThumb) {
					setBulkMeta(prev => prev.map((m, i) => {
						if (i !== bulkStep) return m;
						if (m.thumbPreview && m.thumbPreview.startsWith("blob:")) URL.revokeObjectURL(m.thumbPreview);
						return { ...m, thumbnail: f, thumbPreview: url };
					}));
				} else {
					setUploadThumbnail(f);
					setUploadThumbPreview(prev => { if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev); return url; });
				}
			};
			const startPreviewPlayback = () => {
				setUploadPreviewPlaying(true);
				const el = uploadPreviewVideoRef.current;
				if (!el) return;
				el.play?.().catch(() => {});
			};
			return (
			<CreatorModalViewport style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={() => { if (!uploading) requestUploadClose(); }}>
				<div role="dialog" aria-modal="true" aria-labelledby={`${uid}-upload-title`} onClick={e => e.stopPropagation()} className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: isMobile ? "14px 14px 12px" : 24, width: isMobile ? "100%" : "min(920px, 94vw)", maxHeight: isMobile ? "100%" : "min(88vh, 680px)", display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "hidden" }}>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: isMobile ? 10 : 16, flexShrink: 0 }}>
						<h3 id={`${uid}-upload-title`} className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 18 : 22, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>{i18n.t("videos.uploadVideo")}</h3>
						<button type="button" aria-label={i18n.t("common.close", { defaultValue: "Close" })} disabled={uploading} onClick={requestUploadClose} className="border border-border text-text-secondary" style={{ width: 44, height: 44, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "50%", background: "var(--color-surface)", color: "var(--color-text-secondary)", cursor: uploading ? "wait" : "pointer", padding: 0, lineHeight: 0, opacity: uploading ? 0.4 : 1 }}>
							<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
						</button>
					</div>
					{uploadDone ? (
						<div style={{ textAlign: "center", padding: "32px 0" }}>
							<svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}><polyline points="20 6 9 17 4 12"/></svg>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16 }}>{uploadFiles.length > 1 ? i18n.t("videos.uploadedProcessingBulk", { count: uploadFiles.length }) : i18n.t("videos.uploadedProcessing")}</p>
						</div>
					) : (
						<>
							<div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
							<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 0.92fr) minmax(0, 1.15fr)", gap: isMobile ? 10 : 22, alignItems: "start" }}>
							<div>
							<div
								onClick={() => { if (!uploadPreviewUrl) uploadFileInputRef.current?.click(); }}
								{...(uploadPreviewUrl ? {} : clickableProps(() => uploadFileInputRef.current?.click()))}
								aria-label="Choose a video to upload"
								style={{ border: uploadPreviewUrl ? "1px solid var(--color-border)" : "2px dashed rgba(37,99,235,0.4)", borderRadius: 12, padding: uploadPreviewUrl ? 0 : (isMobile ? "18px 14px" : "0 16px"), textAlign: "center", cursor: uploadPreviewUrl ? "default" : "pointer", background: uploadPreviewUrl ? "#000" : "transparent", transition: "background 0.15s", aspectRatio: "16 / 9", maxHeight: isMobile ? "28vh" : undefined, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxSizing: "border-box", width: "100%", overflow: "hidden", position: "relative" }}
							>
								{uploadPreviewUrl ? (
									<>
										<video
											ref={uploadPreviewVideoRef}
											src={uploadPreviewUrl}
											controls={uploadPreviewPlaying || !thumbSrc}
											playsInline
											preload="metadata"
											onClick={e => e.stopPropagation()}
											onPlay={() => setUploadPreviewPlaying(true)}
											onPause={(e) => { if (e.currentTarget.currentTime < 0.2) setUploadPreviewPlaying(false); }}
											onEnded={() => setUploadPreviewPlaying(false)}
											onLoadedMetadata={e => { if (!uploadPreviewPlaying && e.currentTarget.currentTime < 0.05) e.currentTarget.currentTime = 0.05; }}
											style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", display: "block", background: "#000" }}
										/>
										{/* YouTube-style: custom thumbnail covers the player until play. */}
										{thumbSrc && !uploadPreviewPlaying && (
											<button
												type="button"
												onClick={(e) => { e.stopPropagation(); startPreviewPlayback(); }}
												aria-label={i18n.t("videos.play", { defaultValue: "Play" })}
												style={{ position: "absolute", inset: 0, zIndex: 2, padding: 0, border: "none", cursor: "pointer", background: "#000" }}
											>
												<img src={thumbSrc} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
												<span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.28)" }}>
													<span style={{ width: isMobile ? 44 : 52, height: isMobile ? 44 : 52, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "2px solid rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
														<svg width={isMobile ? 18 : 22} height={isMobile ? 18 : 22} viewBox="0 0 24 24" fill="#fff"><polygon points="8,5 19,12 8,19"/></svg>
													</span>
												</span>
											</button>
										)}
									</>
								) : (
									<>
										<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, wordBreak: "break-word", padding: "0 8px" }}>Click to select video(s)</p>
										<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginTop: 4 }}>MP4, MOV, WebM · large files supported · Hold Ctrl/⌘ for multiple</p>
									</>
								)}
								<input ref={uploadFileInputRef} type="file" accept="video/*" multiple style={{ display: "none" }} onChange={e => {
									const files = Array.from(e.target.files || []);
									if (files.length > 1) {
										const capped = files.slice(0, 5);
										setUploadFiles(capped);
										setUploadFile(null);
										setBulkMeta(capped.map(f => ({ title: f.name.replace(/\.[^.]+$/, ""), desc: "", category: "auto", isShort: null, thumbnail: null, thumbPreview: null })));
										setBulkStep(0);
									} else {
										setUploadFile(files[0] ?? null);
										setUploadFiles([]);
										setBulkMeta([]);
									}
									setUploadPreviewPlaying(false);
								}} />
							</div>
							{uploadPreviewFile && (
								<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", marginTop: isMobile ? 6 : 8 }}>
									<button type="button" onClick={() => uploadFileInputRef.current?.click()} className="text-text-secondary" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1, padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 12 : 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{uploadFiles.length > 1 ? `${uploadFiles.length} videos · ${uploadPreviewFile.name}` : uploadPreviewFile.name}</span>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "#60a5fa", flexShrink: 0 }}>Change</span>
									</button>
								</div>
							)}
							{/* Compact thumbnail control — preview lives on the player above, not a second card. */}
							<button
								type="button"
								onClick={openThumbPicker}
								{...clickableProps(openThumbPicker)}
								aria-label={i18n.t("videos.uploadThumbnailOptional", { defaultValue: "Add thumbnail (optional)" })}
								disabled={uploading}
								className="text-text-secondary"
								style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: isMobile ? "7px 10px" : "8px 12px", display: "flex", alignItems: "center", gap: 10, cursor: uploading ? "default" : "pointer", marginTop: isMobile ? 8 : 10, background: "transparent", width: "100%", textAlign: "left", boxSizing: "border-box" }}
							>
								{thumbSrc ? (
									<img loading="lazy" decoding="async" src={thumbSrc} alt="" style={{ width: isMobile ? 56 : 72, height: isMobile ? 32 : 40, objectFit: "cover", borderRadius: 5, flexShrink: 0, background: "#000" }} />
								) : (
									<div className="bg-surface-raised" style={{ width: isMobile ? 56 : 72, height: isMobile ? 32 : 40, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
										<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
									</div>
								)}
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 12 : 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>{thumbFile ? thumbFile.name : i18n.t("videos.uploadThumbnailOptional", { defaultValue: "Add thumbnail (optional)" })}</span>
								{thumbFile && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "#60a5fa", flexShrink: 0 }}>Change</span>}
								<input ref={isBulkThumb ? bulkThumbInputRef : uploadThumbInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onThumbFile} />
							</button>
							</div>
							{uploadFiles.length > 1 && bulkMeta.length > 0 ? (() => {
								const cur = bulkMeta[bulkStep] || {};
								const update = (patch) => setBulkMeta(prev => prev.map((m, i) => i === bulkStep ? { ...m, ...patch } : m));
								return (
									<div>
										<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: isMobile ? 10 : 14, flexWrap: "wrap" }}>
											{uploadFiles.map((_, i) => (
												<button key={i} type="button" onClick={() => !uploading && setBulkStep(i)} style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: i === bulkStep ? "#2563eb" : i < bulkStep ? "rgba(37,99,235,0.35)" : "var(--color-surface-raised)", color: i === bulkStep ? "#fff" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, cursor: uploading ? "default" : "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
													{i + 1}
												</button>
											))}
											<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginLeft: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
												{uploadFiles[bulkStep]?.name}
											</span>
										</div>
										<div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 10 : 16 }}>
											<UploadLabeledField label={i18n.t("videos.videoTitle")} htmlFor={`${uid}-bulk-title`}>
												<input id={`${uid}-bulk-title`} value={cur.title || ""} onChange={e => update({ title: e.target.value })} placeholder={i18n.t("videos.titleOptional")} aria-label={i18n.t("videos.videoTitle")} disabled={uploading} className="bg-surface border border-border text-text-primary" style={{ padding: isMobile ? "8px 11px" : "10px 13px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 13 : 14, outline: "none", opacity: uploading ? 0.5 : 1, width: "100%", boxSizing: "border-box" }} />
											</UploadLabeledField>
											<UploadLabeledField label={i18n.t("videos.videoDescription")} htmlFor={`${uid}-bulk-desc`}>
												<textarea id={`${uid}-bulk-desc`} value={cur.desc || ""} onChange={e => update({ desc: e.target.value })} rows={2} placeholder={i18n.t("videos.descriptionOptional")} aria-label={i18n.t("videos.videoDescription")} disabled={uploading} className="bg-surface border border-border text-text-primary" style={{ padding: isMobile ? "8px 11px" : "10px 13px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", opacity: uploading ? 0.5 : 1, width: "100%", boxSizing: "border-box" }} />
											</UploadLabeledField>
											<div>
												<UploadChipRow
													label={i18n.t("videos.visibility")}
													name="bulkUploadVisibility"
													disabled={uploading}
													value={uploadVisibility}
													onChange={setUploadVisibility}
													options={[
														["public", i18n.t("videos.visibilityPublic")],
														["unlisted", i18n.t("videos.visibilityUnlisted")],
													]}
												/>
											</div>
											<UploadChipRow
												label={i18n.t("videos.type")}
												name="bulkUploadIsShort"
												disabled={uploading}
												value={cur.isShort}
												onChange={(val) => update({ isShort: val })}
												options={[
													[null, i18n.t("videos.typeAuto")],
													[true, i18n.t("videos.typeShort")],
													[false, i18n.t("videos.typeLong")],
												]}
											/>
											<select value={cur.category || "auto"} onChange={e => update({ category: e.target.value })} disabled={uploading} aria-label={i18n.t("videos.category")} className="bg-surface border border-border text-text-primary" style={{ padding: isMobile ? "8px 11px" : "9px 13px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 12, outline: "none", cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.5 : 1, width: "100%", boxSizing: "border-box" }}>
												<option value="auto" className="bg-surface-raised">Auto-detect</option>
												{UPLOAD_CATEGORY_OPTIONS.map(cat => (
													<option key={cat} value={cat} className="bg-surface-raised">{cat}</option>
												))}
											</select>
										</div>
									</div>
								);
							})() : (
							<div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 10 : 16 }}>
								<UploadLabeledField label={i18n.t("videos.videoTitle")} htmlFor={`${uid}-upload-title`}>
									<input id={`${uid}-upload-title`} value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} placeholder={i18n.t("videos.titleOptional")} aria-label={i18n.t("videos.videoTitle")} className="bg-surface border border-border text-text-primary" style={{ padding: isMobile ? "8px 11px" : "11px 14px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 13 : 14, outline: "none", width: "100%", boxSizing: "border-box" }} />
								</UploadLabeledField>
								<UploadLabeledField label={i18n.t("videos.videoDescription")} htmlFor={`${uid}-upload-desc`}>
									<textarea id={`${uid}-upload-desc`} value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} rows={2} placeholder={i18n.t("videos.descriptionOptional")} aria-label={i18n.t("videos.videoDescription")} className="bg-surface border border-border text-text-primary" style={{ padding: isMobile ? "8px 11px" : "11px 14px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 13 : 14, outline: "none", resize: "none", width: "100%", boxSizing: "border-box" }} />
								</UploadLabeledField>
								<UploadChipRow
									label={i18n.t("videos.visibility")}
									name="uploadVisibility"
									value={uploadVisibility}
									onChange={setUploadVisibility}
									options={[
										["public", i18n.t("videos.visibilityPublic")],
										["unlisted", i18n.t("videos.visibilityUnlisted")],
									]}
								/>
								<UploadChipRow
									label={i18n.t("videos.type")}
									name="uploadIsShort"
									value={uploadIsShort}
									onChange={setUploadIsShort}
									options={[
										[null, i18n.t("videos.typeAuto")],
										[true, i18n.t("videos.typeShort")],
										[false, i18n.t("videos.typeLong")],
									]}
								/>
								<select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)} aria-label={i18n.t("videos.category")} className="bg-surface border border-border text-text-primary" style={{ padding: isMobile ? "8px 11px" : "10px 14px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 12 : 13, outline: "none", cursor: "pointer", width: "100%", boxSizing: "border-box" }}>
									<option value="auto" className="bg-surface-raised">Auto — detect from video</option>
									{UPLOAD_CATEGORY_OPTIONS.map(cat => (
										<option key={cat} value={cat} className="bg-surface-raised">{cat}</option>
									))}
								</select>
							</div>
							)}
							</div>
							</div>
							{uploading && uploadProgress > 0 && (
								<div style={{ marginTop: isMobile ? 10 : 14, flexShrink: 0 }}>
									<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
										<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
											{uploadFiles.length > 1
												? i18n.t("videos.videoUploadProgress", { current: uploadCurrentIdx + 1, total: uploadFiles.length })
												: i18n.t("videos.uploadingToCloud")}
										</span>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#60a5fa", fontWeight: 700 }}>{uploadProgress}%</span>
									</div>
									<div className="bg-surface-raised" style={{ height: 4, borderRadius: 4, overflow: "hidden" }}>
										<div style={{ height: "100%", width: `${uploadProgress}%`, background: "linear-gradient(90deg, #2563eb, #7c3aed)", borderRadius: 4, transition: "width 0.3s ease" }} />
									</div>
								</div>
							)}
							<DraftStatus status={uploadDrafts.status} />
							<div data-testid="video-upload-footer" style={{ display: isMobile ? "grid" : "flex", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : undefined, justifyContent: uploadFiles.length > 1 ? "space-between" : "flex-end", gap: isMobile ? 8 : 10, marginTop: isMobile ? 10 : 16, flexShrink: 0, flexWrap: isMobile ? undefined : "wrap", paddingBottom: isMobile ? "max(4px, env(safe-area-inset-bottom))" : 0, minWidth: 0 }}>
								{uploadFiles.length > 1 && (
									<div style={{ display: "flex", gap: 8, width: isMobile ? "100%" : "auto", minWidth: 0 }}>
										<button type="button" onClick={() => !uploading && setBulkStep(s => Math.max(0, s - 1))} disabled={uploading || bulkStep === 0} className="border border-border text-text-secondary" style={{ flex: isMobile ? "1 1 0" : undefined, minWidth: 0, padding: "8px 14px", background: "none", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: (uploading || bulkStep === 0) ? 0.35 : 1 }}>← {i18n.t("common.previous")}</button>
										<button type="button" onClick={() => !uploading && setBulkStep(s => Math.min(uploadFiles.length - 1, s + 1))} disabled={uploading || bulkStep === uploadFiles.length - 1} className="border border-border text-text-secondary" style={{ flex: isMobile ? "1 1 0" : undefined, minWidth: 0, padding: "8px 14px", background: "none", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: (uploading || bulkStep === uploadFiles.length - 1) ? 0.35 : 1 }}>{i18n.t("common.next")} →</button>
									</div>
								)}
								<div style={{ display: "flex", gap: isMobile ? 8 : 10, marginLeft: isMobile ? 0 : "auto", width: isMobile ? "100%" : "auto", minWidth: 0 }}>
									<button type="button" onClick={requestUploadClose} disabled={uploading} className="border border-border text-text-secondary" style={{ flex: isMobile ? "1 1 0" : undefined, minWidth: 0, minHeight: 44, padding: isMobile ? "8px 10px" : "9px 18px", background: "none", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: uploading ? "wait" : "pointer", opacity: uploading ? 0.4 : 1 }}>{i18n.t("common.cancel")}</button>
									<button type="button" onClick={handleUpload} disabled={uploading || (!uploadFile && !uploadFiles.length)} style={{ flex: isMobile ? "2 1 0" : undefined, minWidth: 0, padding: isMobile ? "8px 10px" : "9px 22px", background: "linear-gradient(135deg, #2563eb, #7c3aed)", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: (uploading || (!uploadFile && !uploadFiles.length)) ? 0.6 : 1, overflowWrap: "anywhere" }}>
										{uploading
											? i18n.t("videos.uploadingProgress", { progress: uploadProgress })
											: (uploadFiles.length > 1 ? i18n.t("videos.uploadVideos", { count: uploadFiles.length }) : i18n.t("common.upload"))}
									</button>
								</div>
							</div>
						</>
					)}
				</div>
			</CreatorModalViewport>
			);
		})()}
		<DraftCloseDialog
			open={draftCloseOpen}
			onKeep={() => setDraftCloseOpen(false)}
			onSave={async () => { if (!(await uploadDrafts.save())) return false; setDraftCloseOpen(false); resetUploadForm(); return true; }}
			onDiscard={async () => { await uploadDrafts.discard(); setDraftCloseOpen(false); resetUploadForm(); return true; }}
		/>
	</div>
		);
	}

	return (
		<>
		{pageMain}
		{watchShell}
		{selectedShort == null && playlistSheet}
		{selectedShort == null && (
			<VideosSectionEdgeDrawer
				excludeVideoId={edgeDrawerExcludeVideoId}
				overlapChannelId={edgeDrawerOverlapChannelId}
				channelName={edgeDrawerChannelName}
				sessionWatchedIds={sessionWatchedIds}
				onPickVideo={(v) => selectVideo(v, { restore: false })}
				onPickChannel={(ch) => openChannel(ch, selectedVideo ? { keepPlaying: true } : undefined)}
			/>
		)}
		{choiceToastEl}
		{videosMobileChrome}
		</>
	);
}

export { VideosPage };
