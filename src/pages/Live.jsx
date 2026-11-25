import React, { useEffect, useState } from "react";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useViewport } from "../hooks/useViewport.js";
import { toggleFollowByUserId, isFollowingByUserId } from "../api/social";
import { getStreamerVods, getStreamerChannel, getPublicStreamer, getPublicSession, getSubscriptionStatus, startSubscriptionCheckout, cancelSubscription, voteLivePoll, likeLiveCommunityPost } from "../api/live";
import { mapCategoryClip, mapCategoryVod } from "./live/liveMappers.js";
import { getUser } from "../store/auth";
import { setPageMeta, resetPageMeta } from "../utils/pageMeta.js";
import LiveTwitchBrowse from "./live/LiveTwitchBrowse.jsx";
import LiveWatchPage from "./live/LiveWatchPage.jsx";
import { rewriteLivePlaybackUrl } from "../utils/livePlayback.js";

function normalizeStreamThumb(s) {
	if (!s) return s;
	const thumb = s.thumb;
	if (typeof thumb === "string" && /^https?:\/\//i.test(thumb)) {
		return { ...s, thumb: `url(${thumb}) center/cover` };
	}
	return s;
}

// Canonical share/route base for live links (handle-first: /live/@handle). Prefer the live
// origin so links are correct on whatever host the app is actually served from (prod, staging,
// preview); fall back to prod only when there's no window (SSR/tests).
const liveShareBase = () =>
	(typeof window !== "undefined" && window.location.origin)
		? window.location.origin
		: "https://app.strug.ca";

// Copy a live link to the clipboard, resolving to true only if the write actually succeeded
// (clipboard API rejects on insecure origins / denied permission) so the UI can't show a false
// "Copied". Never throws.
function copyShareLink(handle) {
	const url = `${liveShareBase()}/live/@${handle}`;
	try {
		return Promise.resolve(navigator.clipboard?.writeText(url)).then(() => true).catch(() => false);
	} catch {
		return Promise.resolve(false);
	}
}

// Build a stream-shaped object (the shape LiveWatchPage/StreamerProfilePage expect)
// from the public /live-session/public/:handle payload.
function mapPublicStreamer(d) {
	const st = d?.streamer || {};
	const sess = d?.live_session || null;
	return {
		id: sess?.session_id ?? null,
		session_id: sess?.session_id ?? null,
		title: sess?.title ?? st.display_name ?? i18n.t("live.title"),
		streamer: st.display_name ?? i18n.t("live.defaultStreamer"),
		streamer_id: st.streamer_id ?? null,
		streamer_user_id: st.user_id ?? st.streamer_user_id ?? null,
		handle: st.handle ?? null,
		description: sess?.description ?? st.description ?? "",
		url: rewriteLivePlaybackUrl(sess?.playback_url ?? ""),
		live: Boolean(d?.is_live && sess),
		thumb: st.profile_pic_url ? `url(${st.profile_pic_url})` : FALLBACK_STREAM_THUMB,
		profile_pic_url: st.profile_pic_url ?? null,
		banner_url: st.banner_url ?? null,
		viewers: sess?.viewer_count ?? 0,
		viewer_count: sess?.viewer_count ?? 0,
		follower_count: st.follower_count ?? 0,
		category: st.category ?? i18n.t("live.defaultCategory"),
		verified: st.is_verified ?? false,
	};
}

const FALLBACK_STREAM_THUMB = "linear-gradient(135deg,#0f172a,#2563eb)";

function SubStar() {
	return <svg width={14} height={14} viewBox="0 0 24 24" fill="#fff"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" /></svg>;
}

// Twitch-style paid subscribe button. Uses purple (#9146FF, the live theme accent)
// to read as "paid" vs the blue free Follow. Logged-out viewers don't see it
// (checkout requires auth). Subscribing redirects to hosted Stripe Checkout;
// the subscription is finalized server-side by the webhook.
// Rendered as chrome inside the profile hero photo scrim and alongside the video player
// (live-stream/broadcast overlay UI), so its colors stay dark-fixed regardless of theme —
// same treatment as LiveSubscribeButton.jsx.
function SubscribeButton({ streamerId, handle, compact }) {
	const [status, setStatus] = useState(null);
	const [busy, setBusy] = useState(false);
	const [confirmCancel, setConfirmCancel] = useState(false);
	const loggedIn = !!getUser();

	useEffect(() => {
		if (!streamerId || !loggedIn) return;
		getSubscriptionStatus(streamerId).then(setStatus).catch(() => {});
	}, [streamerId, loggedIn]);

	if (!loggedIn || !streamerId) return null;

	const priceLabel = `$${((status?.price_cents ?? 499) / 100).toFixed(2)}`;
	const subscribed = status?.subscribed;
	const ending = subscribed && status?.cancel_at_period_end;

	// Channel not approved for monetization yet → no paid subs offered (unless the
	// viewer already has an active sub to manage). Wait for status before hiding.
	if (status && !status.subscriptions_enabled && !subscribed) return null;

	const subscribe = async () => {
		setBusy(true);
		try {
			const res = await startSubscriptionCheckout(streamerId ? { streamer_id: streamerId } : { handle });
			if (res?.url) { window.location.href = res.url; return; }
		} catch (_) { /* 409 already-subscribed, etc. — refetch below */ }
		try { setStatus(await getSubscriptionStatus(streamerId)); } catch (_) {}
		setBusy(false);
	};

	const doCancel = async () => {
		setBusy(true);
		try { await cancelSubscription(streamerId); setStatus(await getSubscriptionStatus(streamerId)); } catch (_) {}
		setConfirmCancel(false);
		setBusy(false);
	};

	const base = { border: "none", borderRadius: compact ? 10 : 8, padding: compact ? "9px 16px" : "9px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" };

	if (confirmCancel) {
		return (
			<div style={{ display: "flex", gap: 6 }}>
				<button disabled={busy} onClick={doCancel} style={{ ...base, background: "#dc2626" }}>{i18n.t("live.confirmCancelSub", { defaultValue: "Cancel sub?" })}</button>
				<button disabled={busy} onClick={() => setConfirmCancel(false)} style={{ ...base, background: "rgba(255,255,255,0.12)" }}>{i18n.t("common.keep", { defaultValue: "Keep" })}</button>
			</div>
		);
	}

	if (subscribed) {
		return (
			<button disabled={busy} onClick={() => setConfirmCancel(true)} title={status?.current_period_end ? new Date(status.current_period_end).toLocaleDateString() : undefined} style={{ ...base, background: ending ? "rgba(255,255,255,0.1)" : "rgba(145,70,255,0.18)", border: "1px solid #9146FF" }}>
				<SubStar />
				{ending ? i18n.t("live.subEnding", { defaultValue: "Ending soon" }) : i18n.t("live.subscribed", { defaultValue: "Subscribed" })}
			</button>
		);
	}

	return (
		<button disabled={busy} onClick={subscribe} style={{ ...base, background: "#9146FF" }}>
			<SubStar />
			{i18n.t("live.subscribePrice", { defaultValue: "Subscribe {{price}}/mo", price: priceLabel })}
		</button>
	);
}

function StreamerProfilePage({ stream, onBack, onWatch, onWatchVod }) {
	const { isMobile } = useViewport();
	const [followed, setFollowed] = useState(false);
	const [followBusy, setFollowBusy] = useState(false);
	const [followMsg, setFollowMsg] = useState('');
	const [followerCount, setFollowerCount] = useState(Number(stream?.follower_count) || 0);
	const [streamerUserId, setStreamerUserId] = useState(stream?.streamer_user_id ?? null);
	const [vods, setVods] = useState([]);
	const [schedule, setSchedule] = useState([]);
	const [about, setAbout] = useState('');
	const [communityPosts, setCommunityPosts] = useState([]);
	const [shareCopied, setShareCopied] = useState(false);
	const myUserId = getUser()?.user_id ?? null;
	const isOwnChannel = myUserId != null && streamerUserId != null && Number(myUserId) === Number(streamerUserId);

	useEffect(() => {
		setStreamerUserId(stream?.streamer_user_id ?? null);
		setFollowed(false);
		setFollowMsg('');
		setFollowerCount(Number(stream?.follower_count) || 0);
	}, [stream?.streamer_user_id, stream?.follower_count, stream?.handle]);

	useEffect(() => {
		const uid = streamerUserId;
		if (!uid || !getUser() || isOwnChannel) return undefined;
		let cancelled = false;
		isFollowingByUserId(uid)
			.then((r) => { if (!cancelled) setFollowed(!!r?.following); })
			.catch(() => {});
		return () => { cancelled = true; };
	}, [streamerUserId, isOwnChannel, myUserId]);

	const handleFollowToggle = () => {
		if (followBusy) return;
		if (!getUser()) {
			setFollowMsg('Log in to follow');
			setTimeout(() => setFollowMsg(''), 3000);
			return;
		}
		if (isOwnChannel) {
			setFollowMsg("You can't follow your own channel");
			setTimeout(() => setFollowMsg(''), 3000);
			return;
		}
		const uid = streamerUserId;
		if (!uid) {
			setFollowMsg('Follow unavailable for this channel');
			setTimeout(() => setFollowMsg(''), 3000);
			return;
		}
		const next = !followed;
		setFollowed(next);
		setFollowerCount((c) => Math.max(0, c + (next ? 1 : -1)));
		setFollowBusy(true);
		setFollowMsg('');
		toggleFollowByUserId(uid)
			.then((res) => {
				if (res?.action === 'followed') {
					setFollowed(true);
					try { window.dispatchEvent(new CustomEvent('live:follow-changed')); } catch { /* */ }
				} else if (res?.action === 'unfollowed') {
					setFollowed(false);
					try { window.dispatchEvent(new CustomEvent('live:follow-changed')); } catch { /* */ }
				}
				if (stream?.handle) {
					getPublicStreamer(stream.handle).then((r) => {
						const d = r?.data ?? r;
						const count = d?.streamer?.follower_count ?? d?.follower_count;
						if (typeof count === 'number') setFollowerCount(count);
						const uidFromApi = d?.streamer?.user_id ?? d?.streamer?.streamer_user_id;
						if (uidFromApi != null) setStreamerUserId(uidFromApi);
					}).catch(() => {});
				}
			})
			.catch((e) => {
				setFollowed(!next);
				setFollowerCount((c) => Math.max(0, c + (next ? -1 : 1)));
				const msg = e?.response?.data?.message || 'Could not update follow';
				setFollowMsg(msg);
				setTimeout(() => setFollowMsg(''), 4000);
			})
			.finally(() => setFollowBusy(false));
	};

	useEffect(() => {
		if (stream?.handle) {
			getStreamerVods(stream.handle).then(r => {
				const items = Array.isArray(r) ? r : (r?.data ?? []);
				setVods(items);
			// LIVE-011: Log VOD load failures
			}).catch(err => console.error('[Live] VODs load failed:', err));
			// #196: upcoming schedule + bio for the dedicated streamer profile.
			getStreamerChannel(stream.handle).then(r => {
				const d = r?.data ?? r ?? {};
				setSchedule(Array.isArray(d.scheduled_streams) ? d.scheduled_streams : []);
				setAbout(d.description || "");
				setCommunityPosts(Array.isArray(d.community_posts) ? d.community_posts : []);
				if (typeof d.follower_count === 'number') setFollowerCount(d.follower_count);
				if (d.user_id != null) setStreamerUserId(d.user_id);
			}).catch(err => console.error('[Live] channel load failed:', err));
			getPublicStreamer(stream.handle).then((res) => {
				const d = res?.data ?? res;
				const count = d?.streamer?.follower_count ?? d?.follower_count;
				if (typeof count === 'number') setFollowerCount(count);
				const uidFromApi = d?.streamer?.user_id ?? d?.streamer?.streamer_user_id;
				if (uidFromApi != null) setStreamerUserId(uidFromApi);
			}).catch(() => {});
		}
	}, [stream?.handle]);
	const followers = followerCount;
	return (
		<div style={{ flex: 1, overflowY: "auto" }}>
			{/* Hero banner — photo background with a dark gradient scrim for the white name/stats
			    text to read (same pattern as Hub.jsx's NavHubPage hero). Everything layered over
			    the scrim (avatar ring, name, follow/share/subscribe/watch buttons) stays dark-fixed
			    chrome in both themes; only the page content below the hero is themed. */}
			<div style={{ position: "relative", width: "100%", height: 200, background: stream.thumb, flexShrink: 0 }}>
				<div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(10,10,14,0.95) 100%)" }} />
				<div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: `${isMobile ? "0 16px 24px 16px" : "0 40px 24px 108px"}`, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
					<div style={{ display: "flex", alignItems: "flex-end", gap: 20 }}>
						<div style={{ width: 88, height: 88, borderRadius: "50%", background: stream.thumb, border: "4px solid rgba(255,255,255,0.15)", flexShrink: 0, marginBottom: -16 }} />
						<div style={{ paddingBottom: 4 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
								<h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, color: "#fff", letterSpacing: "0.03em" }}>{stream.streamer}</h1>
								{stream.verified && <svg width="16" height="16" viewBox="0 0 24 24" fill="#2563eb"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
							</div>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{i18n.t("live.followersCategory", { count: followers.toLocaleString(), category: stream.category })}</p>
						</div>
					</div>
					<div style={{ display: "flex", gap: 10, paddingBottom: 4 }}>
						{stream.handle && (
							<button onClick={() => { copyShareLink(stream.handle).then(ok => { if (ok) { setShareCopied(true); setTimeout(() => setShareCopied(false), 1500); } }); }} style={{ background: shareCopied ? "#2563eb" : "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, padding: "9px 16px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
								<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>
								{shareCopied ? i18n.t("common.copied") : i18n.t("common.share")}
							</button>
						)}
						{!isOwnChannel && (
							<button disabled={followBusy} onClick={handleFollowToggle} style={{ background: followed ? "rgba(255,255,255,0.1)" : "#2563eb", border: "none", borderRadius: 8, padding: "9px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: followBusy ? "default" : "pointer", opacity: followBusy ? 0.6 : 1, transition: "background 0.15s" }}>{followed ? i18n.t("common.following") : i18n.t("common.follow")}</button>
						)}
						{followMsg && (
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", alignSelf: "center", maxWidth: 180 }}>{followMsg}</span>
						)}
						<SubscribeButton streamerId={stream.streamer_id} handle={stream.handle} />
						{stream.live ? (
						<button onClick={onWatch} style={{ background: "#dc2626", border: "none", borderRadius: 8, padding: "9px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
							<span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", display: "inline-block", animation: "pulseLive 1.5s ease-in-out infinite" }} />
							{i18n.t("live.watchLive")}
						</button>
						) : (
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.55)", alignSelf: "center", padding: "0 4px" }}>
								Offline
							</span>
						)}
					</div>
				</div>
			</div>
			<div style={{ padding: `${isMobile ? "40px 16px 32px 16px" : "40px 40px 32px 108px"}` }}>
				<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 28, padding: 0 }}>
					{i18n.t("live.browseStreams")}
				</button>
				{stream.live && (
				<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: 20, marginBottom: 28 }}>
					<h3 className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>{i18n.t("live.currentlyLive")}</h3>
					<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{stream.title}</p>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("live.viewersCount", { count: (stream.viewers || 0).toLocaleString() }) + " · " + stream.category}</p>
				</div>
				)}
				{/* #196: About (bio) — the streamer profile is distinct from the personal
				    user profile, so it shows the channel's own description. */}
				{about && (
					<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: 20, marginBottom: 28 }}>
						<h3 className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>{i18n.t("live.about")}</h3>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "rgba(255,255,255,0.8)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{about}</p>
					</div>
				)}
				{/* #196: Upcoming schedule — real scheduled_streams for this channel. */}
				{schedule.length > 0 && (
					<div style={{ marginBottom: 28 }}>
						<h3 className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>{i18n.t("live.upcomingSchedule")}</h3>
						<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
							{schedule.map((s) => {
								const when = new Date(s.scheduled_at);
								return (
									<div key={s.schedule_id} className="bg-surface border border-border-subtle" style={{ display: "flex", alignItems: "center", gap: 16, borderRadius: 12, padding: "14px 18px" }}>
										<div style={{ flexShrink: 0, textAlign: "center", minWidth: 52 }}>
											<div className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, lineHeight: 1 }}>{when.getDate()}</div>
											<div className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{when.toLocaleDateString(undefined, { month: "short" })}</div>
										</div>
										<div className="bg-border" style={{ width: 1, alignSelf: "stretch" }} />
										<div style={{ minWidth: 0 }}>
											<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</p>
											<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{when.toLocaleDateString(undefined, { weekday: "long" })} · {when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</p>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				)}
				{communityPosts.length > 0 && (
					<div style={{ marginBottom: 28 }}>
						<h3 className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>Community</h3>
						<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
							{communityPosts.map((post) => (
								<div key={post.post_id} className="bg-surface border border-border-subtle" style={{ borderRadius: 12, padding: "14px 18px" }}>
									{post.content && (
										<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 1.55, margin: "0 0 10px", whiteSpace: "pre-wrap" }}>{post.content}</p>
									)}
									{Array.isArray(post.poll_options) && post.poll_options.length > 0 && (
										<div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
											{post.poll_options.map((opt) => (
												<button
													key={opt.option_id}
													type="button"
													onClick={() => {
														if (!getUser()) return;
														voteLivePoll(opt.option_id)
															.then(() => {
																setCommunityPosts((prev) => prev.map((p) => {
																	if (p.post_id !== post.post_id) return p;
																	return {
																		...p,
																		poll_options: (p.poll_options || []).map((o) =>
																			o.option_id === opt.option_id ? { ...o, vote_count: (o.vote_count || 0) + 1 } : o
																		),
																	};
																}));
															})
															.catch(() => {});
													}}
													className="border border-border bg-surface-raised text-text-primary"
													style={{
														textAlign: "left",
														padding: "8px 12px",
														borderRadius: 8,
														fontFamily: "'DM Sans', sans-serif",
														fontSize: 13,
														cursor: "pointer",
														display: "flex",
														justifyContent: "space-between",
													}}
												>
													<span>{opt.option_text}</span>
													<span className="text-text-secondary">{opt.vote_count ?? 0}</span>
												</button>
											))}
										</div>
									)}
									<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
										<button
											type="button"
											onClick={() => {
												if (!getUser()) return;
												likeLiveCommunityPost(post.post_id)
													.then((res) => {
														const delta = res?.action === 'unliked' ? -1 : 1;
														setCommunityPosts((prev) => prev.map((p) =>
															p.post_id === post.post_id
																? { ...p, _count: { ...(p._count || {}), likes: Math.max(0, ((p._count?.likes) || 0) + delta) } }
																: p
														));
													})
													.catch(() => {});
											}}
											className="text-text-secondary"
											style={{ background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer", padding: 0 }}
										>
											♥ {post._count?.likes ?? 0}
										</button>
										<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>
											{post.created_at ? new Date(post.created_at).toLocaleDateString() : ""}
										</span>
									</div>
								</div>
							))}
						</div>
					</div>
				)}
				{/* Past Broadcasts (real VODs). The old "Recent Clips" tab was hardcoded demo
				    data and has been removed. */}
				<h3 className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 }}>{i18n.t("live.pastBroadcasts")}</h3>
				{vods.length === 0 ? (
					<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, textAlign: "center", padding: "40px 0" }}>{i18n.t("live.noPastBroadcasts")}</p>
				) : (
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
						{vods.map((vod, i) => {
							const thumb = vod.thumbnail_url || vod.thumb || null;
							return (
							<div key={vod.vod_id} onClick={() => onWatchVod?.(vod)} style={{ cursor: "pointer", animation: `fadeUp 0.3s ease ${i * 50}ms both` }}>
								{/* VOD thumbnail: a video-content preview (image or branded fallback gradient)
								    with a play-icon overlay — stays dark chrome in both themes, matching the
								    live watch player and Hub.jsx's story-thumbnail treatment. */}
								<div style={{ position: "relative", width: "100%", paddingBottom: "56.25%", background: thumb ? `url(${thumb}) center/cover` : "linear-gradient(135deg,#0f172a,#2563eb)", borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
									<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: thumb ? "rgba(0,0,0,0.25)" : "transparent" }}>
										<div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width={14} height={14} viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
									</div>
								</div>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{vod.title || i18n.t("live.pastBroadcast")}</p>
								{vod.description?.trim() ? (
									<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{vod.description}</p>
								) : null}
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{new Date(vod.created_at).toLocaleDateString()}</p>
							</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}

function LivePage() {
	const { searchPlaceholder } = usePageI18n("live");
	const [watchingStream, setWatchingStream] = useState(null);
	const [watchingVod, setWatchingVod] = useState(null);
	const [watchingClip, setWatchingClip] = useState(null);
	const [viewingProfile, setViewingProfile] = useState(null);
	const [liveTab, setLiveTab] = useState("home");

	// ── Handle-first deep linking: /live/@handle (current broadcast / channel) ──
	const applyLiveMeta = (s) => {
		if (!s) { resetPageMeta(); return; }
		setPageMeta({
			title: s.live ? `${s.streamer} — Live` : s.streamer,
			description: s.title || s.description || `Watch ${s.streamer} on Strug`,
			image: s.profile_pic_url || undefined,
			canonical: s.handle ? `${window.location.origin}/live/@${s.handle}` : undefined,
		});
	};
	const openWatch = (s) => {
		setViewingProfile(null);
		setWatchingVod(null);
		setWatchingClip(null);
		setWatchingStream(normalizeStreamThumb(s));
		if (s?.handle) {
			const path = s?.session_id
				? `/live/@${s.handle}/${s.session_id}`
				: `/live/@${s.handle}`;
			if (window.location.pathname !== path) {
				window.history.pushState({ nav: "live" }, "", path);
			}
		}
		applyLiveMeta(s);
	};
	const openWatchVod = (vod) => {
		setViewingProfile(null);
		setWatchingStream(null);
		setWatchingClip(null);
		setWatchingVod(vod);
		const handle = vod?.handle;
		const sid = vod?.session_id;
		if (handle && sid) {
			const path = `/live/@${handle}/${sid}`;
			if (window.location.pathname !== path) {
				window.history.pushState({ nav: "live" }, "", path);
			}
		}
		resetPageMeta();
	};
	const openWatchClip = (clip) => {
		setViewingProfile(null);
		setWatchingStream(null);
		setWatchingVod(null);
		setWatchingClip(clip);
		const handle = clip?.handle;
		const sid = clip?.session_id;
		if (handle && sid) {
			const path = `/live/@${handle}/${sid}`;
			if (window.location.pathname !== path) {
				window.history.pushState({ nav: "live" }, "", path);
			}
		}
		resetPageMeta();
	};
	const openProfile = (s) => {
		setWatchingStream(null);
		setWatchingVod(null);
		setWatchingClip(null);
		setViewingProfile(normalizeStreamThumb(s));
		if (s?.handle && window.location.pathname !== `/live/@${s.handle}`) {
			window.history.pushState({ nav: "live" }, "", `/live/@${s.handle}`);
		}
		applyLiveMeta(s);
	};
	const closeView = () => {
		setWatchingStream(null);
		setWatchingVod(null);
		setWatchingClip(null);
		setViewingProfile(null);
		if (/^\/live\/@/.test(window.location.pathname)) {
			window.history.pushState({ nav: "live" }, "", "/live");
		}
		resetPageMeta();
	};

	// Initial deep link + browser back/forward: /live/@handle or /live/@handle/:sessionId
	useEffect(() => {
		let cancelled = false;
		const openFromUrl = async () => {
			const m = window.location.pathname.match(/^\/live\/@([^/]+)(?:\/(\d+))?/);
			if (!m) {
				setWatchingStream(null);
				setWatchingVod(null);
				setWatchingClip(null);
				setViewingProfile(null);
				resetPageMeta();
				return;
			}
			const handle = m[1];
			const sessionId = m[2] ? Number(m[2]) : null;
			try {
				if (sessionId) {
					const res = await getPublicSession(handle, sessionId);
					const d = res?.data ?? res;
					if (cancelled || !d?.streamer) return;
					if (d.is_live && d.live_session) {
						const s = mapPublicStreamer({
							streamer: { ...d.streamer, follower_count: d.streamer.follower_count },
							is_live: true,
							live_session: d.live_session,
						});
						setViewingProfile(null);
						setWatchingVod(null);
						setWatchingClip(null);
						setWatchingStream(normalizeStreamThumb(s));
						applyLiveMeta(s);
						return;
					}
					if (d.vod) {
						const vod = mapCategoryVod({
							...d.vod,
							streamer: d.streamer.display_name,
							handle: d.streamer.handle,
							profile_pic_url: d.streamer.profile_pic_url,
							session_id: d.live_session?.session_id ?? sessionId,
						});
						if (d.vod.is_clip) {
							setWatchingStream(null);
							setWatchingVod(null);
							setViewingProfile(null);
							setWatchingClip(mapCategoryClip({ ...vod, is_clip: true }));
						} else {
							setWatchingStream(null);
							setWatchingClip(null);
							setViewingProfile(null);
							setWatchingVod(vod);
						}
						resetPageMeta();
						return;
					}
				}
				const res = await getPublicStreamer(handle);
				const d = res?.data ?? res;
				if (cancelled || !d?.streamer) return;
				const s = mapPublicStreamer(d);
				if (s.live) { setViewingProfile(null); setWatchingVod(null); setWatchingClip(null); setWatchingStream(s); }
				else { setWatchingStream(null); setWatchingVod(null); setWatchingClip(null); setViewingProfile(s); }
				applyLiveMeta(s);
			} catch {
				if (!cancelled) {
					setWatchingStream(null);
					setWatchingVod(null);
					setWatchingClip(null);
					setViewingProfile(null);
				}
			}
		};
		openFromUrl();
		const onPop = () => openFromUrl();
		window.addEventListener("popstate", onPop);
		return () => { cancelled = true; window.removeEventListener("popstate", onPop); };
	 
	}, []);

	const openStreamerDashboard = () => {
		if (typeof window.__nav === 'function') window.__nav('sd-streamer');
		else window.dispatchEvent(new CustomEvent('strug:navigate', { detail: { navId: 'sd-streamer' } }));
	};

	if (watchingClip) return <LiveWatchPage mode="clip" item={watchingClip} onBack={closeView} onWatch={openWatch} onWatchVod={openWatchVod} onOpenProfile={openProfile} />;
	if (watchingVod) return <LiveWatchPage mode="vod" item={watchingVod} onBack={closeView} onWatch={openWatch} onOpenProfile={openProfile} onClipCreated={(clip) => openWatchClip(mapCategoryClip(clip))} />;
	if (watchingStream) return <LiveWatchPage mode="live" item={watchingStream} onBack={closeView} onWatch={openWatch} onOpenProfile={openProfile} />;
	if (viewingProfile) return <StreamerProfilePage stream={viewingProfile} onBack={closeView} onWatch={() => openWatch(viewingProfile)} onWatchVod={openWatchVod} />;

	return (
		<LiveTwitchBrowse
			activeTab={liveTab}
			onTabChange={setLiveTab}
			onWatch={openWatch}
			onWatchVod={openWatchVod}
			onWatchClip={openWatchClip}
			onOpenProfile={openProfile}
			onGoLive={openStreamerDashboard}
			searchPlaceholder={searchPlaceholder}
		/>
	);
}

export { LivePage };
