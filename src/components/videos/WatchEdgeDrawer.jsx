import i18n from "../../i18n/index.js";
import { getAuthUserId } from "../../store/auth.js";
import CircleSharingToggle from "./CircleSharingToggle.jsx";
import {
	friendActivityAttribution,
	friendActivityToVideo,
	formatFriendNameList,
	groupFriendActivityLanes,
} from "../../utils/friendCircle.js";

function CircleCard({ item, onPick }) {
	const thumb = item.thumbnail_url;
	return (
		<button
			type="button"
			onClick={() => onPick?.(friendActivityToVideo(item))}
			style={{
				display: "flex",
				gap: 10,
				width: "100%",
				padding: 0,
				border: "none",
				background: "transparent",
				cursor: "pointer",
				textAlign: "left",
				alignItems: "flex-start",
			}}
		>
			<div
				style={{
					width: 112,
					height: 63,
					borderRadius: 8,
					flexShrink: 0,
					position: "relative",
					...(thumb?.startsWith?.("http")
						? { backgroundImage: `url(${thumb})`, backgroundSize: "cover", backgroundPosition: "center" }
						: { background: "linear-gradient(135deg,#1e3a5f,#0f2744)" }),
				}}
			/>
			<div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
				<p
					className="text-text-primary"
					style={{
						fontFamily: "'DM Sans', sans-serif",
						fontSize: 13,
						fontWeight: 600,
						lineHeight: 1.35,
						margin: "0 0 4px",
						display: "-webkit-box",
						WebkitLineClamp: 2,
						WebkitBoxOrient: "vertical",
						overflow: "hidden",
					}}
				>
					{item.title}
				</p>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 2px" }}>
					{item.channel?.display_name ?? "Creator"}
				</p>
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0, color: "#60a5fa" }}>
					{friendActivityAttribution(item)}
				</p>
			</div>
		</button>
	);
}

export function WatchHistoryRow({ video, onPick, showNew }) {
	return (
		<button
			type="button"
			onClick={() => onPick?.(video)}
			style={{
				display: "flex",
				gap: 10,
				width: "100%",
				padding: 0,
				border: "none",
				background: "transparent",
				cursor: "pointer",
				textAlign: "left",
				alignItems: "flex-start",
			}}
		>
			<div
				style={{
					width: 112,
					height: 63,
					borderRadius: 8,
					flexShrink: 0,
					position: "relative",
					...(video.thumb?.startsWith?.("http")
						? { backgroundImage: `url(${video.thumb})`, backgroundSize: "cover", backgroundPosition: "center" }
						: { background: "linear-gradient(135deg,#1e3a5f,#0f2744)" }),
				}}
			>
				{showNew && (
					<span
						style={{
							position: "absolute",
							top: 6,
							left: 6,
							background: "#2563eb",
							borderRadius: 4,
							padding: "2px 6px",
							fontFamily: "'DM Sans', sans-serif",
							fontSize: 9,
							fontWeight: 700,
							color: "#fff",
							textTransform: "uppercase",
							letterSpacing: "0.04em",
						}}
					>
						{i18n.t("videos.edgeDrawer.newBadge")}
					</span>
				)}
			</div>
			<div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
				<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, lineHeight: 1.35, margin: "0 0 4px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
					{video.title}
				</p>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 2px" }}>{video.channel}</p>
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0, color: showNew ? "#60a5fa" : undefined }}>
					{showNew
						? i18n.t("videos.edgeDrawer.newFromChannel", { channel: video.channel })
						: [video.views, video.ago].filter(Boolean).join(" · ")}
				</p>
			</div>
		</button>
	);
}

function Lane({ title, items, onPick }) {
	if (!items.length) return null;
	return (
		<section style={{ marginBottom: 14 }}>
			<h3
				className="text-text-secondary"
				style={{
					fontFamily: "'DM Sans', sans-serif",
					fontSize: 11,
					fontWeight: 700,
					textTransform: "uppercase",
					letterSpacing: "0.07em",
					margin: "0 0 8px",
				}}
			>
				{title}
			</h3>
			<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
				{items.map((item, i) => (
					<CircleCard key={item.video_id ?? i} item={item} onPick={onPick} />
				))}
			</div>
		</section>
	);
}

/**
 * Single-section watch-edge drawer. Edge tabs pick which section; no in-panel tab bar.
 */
export default function WatchEdgeDrawer(props) {
	const userId = getAuthUserId();
	return <>
		{props.activeTab === "circle" && userId && <CircleSharingToggle key={userId} />}
		<WatchEdgeDrawerContent {...props} />
	</>;
}

function WatchEdgeDrawerContent({
	activeTab,
	historyLoading,
	historyItems,
	friendActivityLoading,
	friendActivity,
	channelOverlap,
	channelOverlapLoading,
	channelName,
	subsLoading,
	subsItems,
	onPickVideo,
	hasMore = false,
	loadingMore = false,
	onLoadMore,
}) {
	const lanes = groupFriendActivityLanes(friendActivity, Number.MAX_SAFE_INTEGER);
	const overlapNames = formatFriendNameList(channelOverlap);
	const history = historyItems || [];
	const subs = subsItems || [];
	const channelLabel =
		typeof channelName === "string"
			? channelName
			: (channelName?.display_name ?? channelName?.name ?? null);

	if (activeTab === "history") {
		if (historyLoading) {
			return (
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 12px" }}>
					{i18n.t("common.loading", { defaultValue: "Loading…" })}
				</p>
			);
		}
		if (history.length === 0) {
			return (
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 12px" }}>
					{i18n.t("videos.edgeDrawer.emptyHistory")}
				</p>
			);
		}
		return (
			<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
				{history.map((v, i) => (
					<WatchHistoryRow key={v.id ?? `hist-${i}`} video={v} onPick={onPickVideo} />
				))}
				{hasMore && onLoadMore ? (
					<button type="button" disabled={loadingMore} onClick={onLoadMore} className="text-text-primary border border-border-subtle bg-surface-raised" style={{ minHeight: 44, borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, cursor: loadingMore ? "wait" : "pointer", opacity: loadingMore ? 0.65 : 1 }}>
						{loadingMore ? i18n.t("common.loading", { defaultValue: "Loading…" }) : i18n.t("common.loadMore", { defaultValue: "Load more" })}
					</button>
				) : null}
			</div>
		);
	}

	if (activeTab === "subs") {
		if (subsLoading) {
			return (
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 12px" }}>
					{i18n.t("common.loading", { defaultValue: "Loading…" })}
				</p>
			);
		}
		if (subs.length === 0) {
			return (
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 12px" }}>
					{i18n.t("videos.edgeDrawer.emptySubs")}
				</p>
			);
		}
		return (
			<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
				{subs.map((v, i) => (
					<WatchHistoryRow key={v.id ?? `sub-${i}`} video={v} onPick={onPickVideo} showNew={!!v.isNewUpload} />
				))}
				{hasMore && onLoadMore ? (
					<button type="button" disabled={loadingMore} onClick={onLoadMore} className="text-text-primary border border-border-subtle bg-surface-raised" style={{ minHeight: 44, borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, cursor: loadingMore ? "wait" : "pointer", opacity: loadingMore ? 0.65 : 1 }}>
						{loadingMore ? i18n.t("common.loading") : i18n.t("common.loadMore")}
					</button>
				) : null}
			</div>
		);
	}

	// Circle
	return (
		<>
			{channelOverlapLoading ? (
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 12px" }}>
					{i18n.t("common.loading", { defaultValue: "Loading…" })}
				</p>
			) : channelOverlap?.length > 0 && channelLabel ? (
				<div
					className="bg-wash-2 border border-border-subtle"
					style={{ borderRadius: 10, padding: "8px 10px", marginBottom: 12 }}
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

			{friendActivityLoading ? (
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "32px 12px" }}>
					{i18n.t("common.loading", { defaultValue: "Loading…" })}
				</p>
			) : !friendActivity?.length ? (
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "32px 12px" }}>
					{i18n.t("videos.edgeDrawer.emptyCircle")}
				</p>
			) : (
				<>
					<Lane title={i18n.t("videos.edgeDrawer.liked")} items={lanes.liked} onPick={onPickVideo} />
					<Lane title={i18n.t("videos.edgeDrawer.watched")} items={lanes.watched} onPick={onPickVideo} />
					{hasMore && onLoadMore ? (
						<button type="button" disabled={loadingMore} onClick={onLoadMore} className="text-text-primary border border-border-subtle bg-surface-raised" style={{ width: "100%", minHeight: 44, borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, cursor: loadingMore ? "wait" : "pointer", opacity: loadingMore ? 0.65 : 1 }}>
							{loadingMore ? i18n.t("common.loading") : i18n.t("common.loadMore")}
						</button>
					) : null}
				</>
			)}
		</>
	);
}
