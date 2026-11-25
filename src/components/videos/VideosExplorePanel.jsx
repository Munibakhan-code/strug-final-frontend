/**
 * Full-screen mobile panel for Explore destinations (History / Choice / Subs / Circle / Insights).
 * Reuses WatchEdgeDrawer + Creator's Choice list shapes so content matches the desktop edge drawer.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import i18n from "../../i18n/index.js";
import WatchEdgeDrawer from "./WatchEdgeDrawer.jsx";
import { getAuthUserId } from "../../store/auth.js";
import {
	getWatchHistory,
	getSubscriptionUploads,
	getSubscriptionCreatorPicks,
	getFriendVideoActivityPage,
} from "../../api/videos";
import { DEMO_FRIEND_ACTIVITY, DEMO_HISTORY, DEMO_SUB_UPLOADS } from "../../utils/friendCircleDemo.js";
import { DRAWER_SUB_UPLOAD_CAP } from "../../utils/friendCircle.js";
import { mapCreatorChoiceShelf } from "../../utils/creatorChoice.js";
import { withoutWatched } from "../../utils/videosDrawerBadges.js";
import { MOBILE_WATCH_TYPE } from "../../utils/mobileWatchTypography.js";
import ViewerAnalyticsPanel from "./ViewerAnalyticsPanel.jsx";

function listFrom(resp) {
	if (Array.isArray(resp)) return resp;
	const d = resp?.data;
	if (Array.isArray(d)) return d;
	return d?.items ?? resp?.items ?? resp?.videos ?? d?.videos ?? [];
}

function CreatorChoiceList({ items, onVideoSelect, onChannelSelect, hasMore = false, loadingMore = false, onLoadMore }) {
	if (!items?.length) {
		return (
			<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 12px" }}>
				{i18n.t("videos.creatorsChoiceEmpty")}
			</p>
		);
	}
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
			{items.map((item) => {
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
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: MOBILE_WATCH_TYPE.historyTitle.fontSize, fontWeight: MOBILE_WATCH_TYPE.historyTitle.fontWeight, lineHeight: MOBILE_WATCH_TYPE.historyTitle.lineHeight, margin: "0 0 4px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>
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
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: MOBILE_WATCH_TYPE.historyTitle.fontSize, fontWeight: MOBILE_WATCH_TYPE.historyTitle.fontWeight, margin: "0 0 4px", overflowWrap: "anywhere" }}>{ch.name}</p>
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

function titleFor(tab) {
	if (tab === "history") return i18n.t("videos.edgeDrawer.history");
	if (tab === "analytics") return "Viewing Insights";
	if (tab === "subs") return i18n.t("videos.edgeDrawer.subsPanelTitle");
	if (tab === "creatorChoice") return i18n.t("videos.creatorsChoice");
	return i18n.t("videos.edgeDrawer.circle");
}

/**
 * @param {object} props
 * @param {'history'|'creatorChoice'|'subs'|'circle'|'analytics'} props.tab
 * @param {() => void} props.onClose
 * @param {(v: object) => void} props.onPickVideo
 * @param {(ch: object) => void} props.onPickChannel
 * @param {(raw: object) => object} props.mapVideo
 * @param {(data: unknown) => object[]} props.mapHistory
 * @param {Set<number>} [props.watchedIds] Videos already watched, dropped from Choice / Subs /
 *   Circle so the panel shows what the Explore count counted.
 */
export default function VideosExplorePanel({ tab, onClose, onPickVideo, onPickChannel, mapVideo, mapHistory, watchedIds }) {
	const [loadedTab, setLoadedTab] = useState(null);
	const [history, setHistory] = useState([]);
	const [historyCursor, setHistoryCursor] = useState(null);
	const [historyHasMore, setHistoryHasMore] = useState(false);
	const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
	const [subs, setSubs] = useState([]);
	const [subsCursor, setSubsCursor] = useState(null);
	const [subsHasMore, setSubsHasMore] = useState(false);
	const [subsLoadingMore, setSubsLoadingMore] = useState(false);
	const [choice, setChoice] = useState([]);
	const [choiceCursor, setChoiceCursor] = useState(null);
	const [choiceHasMore, setChoiceHasMore] = useState(false);
	const [choiceLoadingMore, setChoiceLoadingMore] = useState(false);
	const [friends, setFriends] = useState([]);
	const [friendsCursor, setFriendsCursor] = useState(null);
	const [friendsHasMore, setFriendsHasMore] = useState(false);
	const [friendsLoadingMore, setFriendsLoadingMore] = useState(false);

	useEffect(() => {
		let alive = true;
		// Deferred: the signed-out branches call this straight from the effect body, and a
		// synchronous setState there would render twice before the panel ever paints.
		const done = () => {
			queueMicrotask(() => { if (alive) setLoadedTab(tab); });
		};

		if (tab === "history") {
			getWatchHistory({ limit: 20 })
				.then((data) => {
					if (!alive) return;
					const mapped = mapHistory(data);
					setHistory(mapped.length ? mapped : (import.meta.env.DEV ? DEMO_HISTORY : []));
					setHistoryCursor(data?.next_cursor ?? null);
					setHistoryHasMore(data?.has_more === true && !!data?.next_cursor);
				})
				.catch(() => { if (alive) setHistory(import.meta.env.DEV ? DEMO_HISTORY : []); })
				.finally(done);
		} else if (tab === "creatorChoice") {
			if (!getAuthUserId()) {
				done();
			} else {
				getSubscriptionCreatorPicks({ limit: 20 })
					.then((data) => {
						if (!alive) return;
						setChoice(mapCreatorChoiceShelf(data, mapVideo));
						setChoiceCursor(data?.next_cursor ?? null);
						setChoiceHasMore(data?.has_more === true && !!data?.next_cursor);
					})
					.catch(() => { if (alive) setChoice([]); })
					.finally(done);
			}
		} else if (tab === "subs") {
			if (!getAuthUserId()) {
				done();
			} else {
				getSubscriptionUploads({ limit: DRAWER_SUB_UPLOAD_CAP })
					.then((data) => {
						if (!alive) return;
						setSubs(listFrom(data).map((raw) => {
							const v = mapVideo(raw);
							return { ...v, isNewUpload: raw.is_new === true || raw.isNewUpload === true };
						}));
						setSubsCursor(data?.next_cursor ?? null);
						setSubsHasMore(data?.has_more === true && !!data?.next_cursor);
					})
					.catch(() => { if (alive) setSubs(import.meta.env.DEV ? DEMO_SUB_UPLOADS : []); })
					.finally(done);
			}
		} else if (tab === "circle") {
			if (!getAuthUserId()) {
				done();
			} else {
				getFriendVideoActivityPage({ limit: 16 })
					.then((response) => {
						if (!alive) return;
						const list = Array.isArray(response?.data) ? response.data : [];
						setFriends(list.length ? list : (import.meta.env.DEV ? DEMO_FRIEND_ACTIVITY : []));
						setFriendsCursor(response?.next_cursor ?? null);
						setFriendsHasMore(response?.has_more === true && !!response?.next_cursor);
					})
					.catch(() => { if (alive) setFriends(import.meta.env.DEV ? DEMO_FRIEND_ACTIVITY : []); })
					.finally(done);
			}
		} else {
			done();
		}

		return () => { alive = false; };
	}, [tab, mapVideo, mapHistory]);

	// History is the watched list itself, so it is left whole; the other three drop watched rows to
	// match both the Explore count and the desktop drawer.
	const visibleChoice = useMemo(() => withoutWatched(choice, watchedIds), [choice, watchedIds]);
	const visibleSubs = useMemo(() => withoutWatched(subs, watchedIds), [subs, watchedIds]);
	const visibleFriends = useMemo(() => withoutWatched(friends, watchedIds), [friends, watchedIds]);
	const loadMoreHistory = async () => {
		if (!historyCursor || historyLoadingMore) return;
		setHistoryLoadingMore(true);
		try {
			const data = await getWatchHistory({ limit: 20, cursor: historyCursor });
			const nextRows = mapHistory(data);
			setHistory((current) => {
				const seen = new Set(current.map((video) => String(video.id ?? video.videoId)));
				return [...current, ...nextRows.filter((video) => !seen.has(String(video.id ?? video.videoId)))];
			});
			setHistoryCursor(data?.next_cursor ?? null);
			setHistoryHasMore(data?.has_more === true && !!data?.next_cursor);
		} finally {
			setHistoryLoadingMore(false);
		}
	};
	const loadMoreFriends = async () => {
		if (!friendsCursor || friendsLoadingMore) return;
		setFriendsLoadingMore(true);
		try {
			const response = await getFriendVideoActivityPage({ limit: 16, cursor: friendsCursor });
			const rows = Array.isArray(response?.data) ? response.data : [];
			setFriends(current => {
				const seen = new Set(current.map(item => String(item.video_id)));
				return [...current, ...rows.filter(item => !seen.has(String(item.video_id)))];
			});
			setFriendsCursor(response?.next_cursor ?? null);
			setFriendsHasMore(response?.has_more === true && !!response?.next_cursor);
		} finally {
			setFriendsLoadingMore(false);
		}
	};
	const loadMoreSubs = async () => {
		if (!subsCursor || subsLoadingMore) return;
		setSubsLoadingMore(true);
		try {
			const data = await getSubscriptionUploads({ limit: DRAWER_SUB_UPLOAD_CAP, cursor: subsCursor });
			const rows = listFrom(data).map(raw => ({ ...mapVideo(raw), isNewUpload: raw.is_new === true || raw.isNewUpload === true }));
			setSubs(current => {
				const seen = new Set(current.map(item => String(item.id ?? item.videoId)));
				return [...current, ...rows.filter(item => !seen.has(String(item.id ?? item.videoId)))];
			});
			setSubsCursor(data?.next_cursor ?? null);
			setSubsHasMore(data?.has_more === true && !!data?.next_cursor);
		} finally {
			setSubsLoadingMore(false);
		}
	};
	const loadMoreChoice = async () => {
		if (!choiceCursor || choiceLoadingMore) return;
		setChoiceLoadingMore(true);
		try {
			const data = await getSubscriptionCreatorPicks({ limit: 20, cursor: choiceCursor });
			const rows = mapCreatorChoiceShelf(data, mapVideo);
			setChoice(current => {
				const keyOf = item => `${item.kind}:${item.pickId ?? item.video?.id ?? item.channel?.channelId}`;
				const seen = new Set(current.map(keyOf));
				return [...current, ...rows.filter(item => !seen.has(keyOf(item)))];
			});
			setChoiceCursor(data?.next_cursor ?? null);
			setChoiceHasMore(data?.has_more === true && !!data?.next_cursor);
		} finally {
			setChoiceLoadingMore(false);
		}
	};

	if (typeof document === "undefined") return null;

	return createPortal(
		<div
			data-testid="videos-explore-panel"
			className="bg-bg"
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 9300,
				display: "flex",
				flexDirection: "column",
				paddingTop: "env(safe-area-inset-top, 0px)",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--color-border)" }}>
				<button
					type="button"
					onClick={onClose}
					aria-label={i18n.t("common.back", { defaultValue: "Back" })}
					className="text-text-secondary"
					style={{ background: "none", border: "none", padding: 6, cursor: "pointer", display: "inline-flex" }}
				>
					<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
				</button>
				<h2 className="text-text-primary" style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16 }}>
					{titleFor(tab)}
				</h2>
			</div>
			<div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "14px 14px max(24px, env(safe-area-inset-bottom))" }}>
				{loadedTab !== tab ? (
					<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 12px" }}>
						{i18n.t("common.loading", { defaultValue: "Loading…" })}
					</p>
				) : tab === "analytics" ? (
					<ViewerAnalyticsPanel isMobile />
				) : tab === "creatorChoice" ? (
					<CreatorChoiceList
						items={getAuthUserId() ? visibleChoice : []}
						hasMore={choiceHasMore}
						loadingMore={choiceLoadingMore}
						onLoadMore={loadMoreChoice}
						onVideoSelect={(v) => { onClose(); onPickVideo?.(v); }}
						onChannelSelect={(ch) => {
							onClose();
							onPickChannel?.({
								channel_id: ch.channelId,
								display_name: ch.name,
								handle: ch.handle,
								profile_pic_url: ch.profile_pic_url,
							});
						}}
					/>
				) : (
					<WatchEdgeDrawer
						activeTab={tab}
						historyLoading={false}
							historyItems={history}
							hasMore={tab === "history" ? historyHasMore : tab === "circle" ? friendsHasMore : tab === "subs" ? subsHasMore : false}
							loadingMore={tab === "history" ? historyLoadingMore : tab === "circle" ? friendsLoadingMore : subsLoadingMore}
							onLoadMore={tab === "history" ? loadMoreHistory : tab === "circle" ? loadMoreFriends : loadMoreSubs}
						friendActivityLoading={false}
						friendActivity={getAuthUserId() ? visibleFriends : []}
						channelOverlap={[]}
						channelOverlapLoading={false}
						channelName={null}
						subsLoading={false}
						subsItems={getAuthUserId() ? visibleSubs : []}
						onPickVideo={(v) => { onClose(); onPickVideo?.(v); }}
					/>
				)}
			</div>
		</div>,
		document.body,
	);
}
