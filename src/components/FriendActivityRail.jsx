// #492 — "Friends are watching" discovery rail on the video watch page.
// Presentational only: the parent (VideoWatchPage) fetches the data + honours the viewer's
// opt-out, and renders this in one of two responsive shapes:
//   variant="column" — a vertical left rail on wide desktop (mirrors the Up Next right rail)
//   variant="shelf"  — a horizontal scroll strip on tablet/mobile
// Renders nothing when there are no items, so the layout falls back to today's look.

const LABEL = "Friends are watching";

// Build the human attribution line for a card from its friends[] + watching_now flag.
// Live watching is private — never say "is watching"; treat as watched.
function attributionText(item) {
	const friends = item.friends || [];
	const n = item.friend_count || friends.length;
	if (n === 0) return "";
	const first = friends[0]?.display_name || "A friend";
	const action = (item.watching_now || friends[0]?.action === "watching") ? "watched" : friends[0]?.action;
	if (n === 1) {
		if (action === "liked") return `${first} liked this`;
		return `${first} watched this`;
	}
	if (action === "liked") return `${first} +${n - 1} liked this`;
	return `${first} +${n - 1} watched this`;
}

function fmtDuration(sec) {
	if (!sec || sec <= 0) return "";
	const m = Math.floor(sec / 60);
	const s = sec % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtViews(n) {
	const v = Number(n) || 0;
	if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M views`;
	if (v >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K views`;
	return `${v} views`;
}

// Small stacked avatars for the friends who engaged.
function AvatarStack({ friends }) {
	const shown = (friends || []).slice(0, 3);
	if (shown.length === 0) return null;
	return (
		<div style={{ display: "flex", alignItems: "center" }}>
			{shown.map((f, i) => {
				const initial = (f.display_name || "?").trim()[0]?.toUpperCase() || "?";
				return (
					<div
						key={f.profile_id ?? f.user_id ?? i}
						title={f.display_name}
						style={{
							width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
							marginLeft: i === 0 ? 0 : -6,
							border: "1.5px solid #0d1421",
							background: f.avatar_url ? `center/cover url(${f.avatar_url})` : "linear-gradient(135deg,#2563eb,#1e3a5f)",
							display: "flex", alignItems: "center", justifyContent: "center",
							fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 700, color: "#fff",
						}}
					>
						{!f.avatar_url && initial}
					</div>
				);
			})}
		</div>
	);
}

// Turn an activity item into the payload selectVideo() expects (needs `id` to hydrate hls_url).
function toSelectPayload(item) {
	return {
		id: item.video_id,
		videoId: item.video_id,
		title: item.title,
		channel: item.channel?.display_name ?? "Creator",
		channel_name: item.channel?.display_name ?? "Creator",
		public_id: item.public_id,
		slug: item.slug,
		thumb: item.thumbnail_url,
		thumbnail_url: item.thumbnail_url,
		duration_sec: item.duration_sec,
		views_count: item.views_count,
	};
}

export default function FriendActivityRail({ items = [], variant = "column", onSelect }) {
	if (!items || items.length === 0) return null;
	const pick = (item) => onSelect && onSelect(toSelectPayload(item));

	const Header = (
		<div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
			<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
				<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
			</svg>
			<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>{LABEL}</p>
		</div>
	);

	// ---- Shelf (tablet/mobile): horizontal scroll strip ----
	if (variant === "shelf") {
		return (
			<div style={{ marginBottom: 22 }}>
				{Header}
				<div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6, scrollbarWidth: "thin", WebkitOverflowScrolling: "touch" }}>
					{items.map((item, i) => (
						<div
							key={item.video_id ?? i}
							onClick={() => pick(item)}
							role="button"
							tabIndex={0}
							onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(item); } }}
							style={{ width: 172, flexShrink: 0, cursor: "pointer", animation: `fadeUp 0.3s ease ${i * 40}ms both` }}
						>
							<div style={{ position: "relative", width: "100%", height: 97, borderRadius: 8, overflow: "hidden", ...(item.thumbnail_url ? { backgroundImage: `url(${item.thumbnail_url})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: "linear-gradient(135deg,#1e3a5f,#0f2744)" }) }}>
								{fmtDuration(item.duration_sec) && <div style={{ position: "absolute", bottom: 4, right: 5, background: "rgba(0,0,0,0.8)", borderRadius: 3, padding: "1px 5px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: "#fff" }}>{fmtDuration(item.duration_sec)}</div>}
							</div>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500, color: "#fff", lineHeight: 1.3, margin: "7px 0 3px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.title}</p>
							<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
								<AvatarStack friends={item.friends} />
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(96,165,250,0.85)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{attributionText(item)}</p>
							</div>
						</div>
					))}
				</div>
			</div>
		);
	}

	// ---- Column (wide desktop): vertical rail mirroring Up Next ----
	return (
		<div style={{ width: 240, flexShrink: 0, position: "sticky", top: 0, alignSelf: "flex-start" }}>
			{Header}
			<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
				{items.map((item, i) => (
					<div
						key={item.video_id ?? i}
						onClick={() => pick(item)}
						role="button"
						tabIndex={0}
						onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(item); } }}
						style={{ cursor: "pointer", animation: `fadeUp 0.3s ease ${i * 40}ms both` }}
					>
						<div style={{ position: "relative", width: "100%", height: 132, borderRadius: 10, overflow: "hidden", ...(item.thumbnail_url ? { backgroundImage: `url(${item.thumbnail_url})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: "linear-gradient(135deg,#1e3a5f,#0f2744)" }) }}>
							{fmtDuration(item.duration_sec) && <div style={{ position: "absolute", bottom: 5, right: 6, background: "rgba(0,0,0,0.8)", borderRadius: 3, padding: "1px 5px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: "#fff" }}>{fmtDuration(item.duration_sec)}</div>}
						</div>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#fff", lineHeight: 1.32, margin: "8px 0 4px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.title}</p>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: "rgba(255,255,255,0.5)", margin: "0 0 5px" }}>{item.channel?.display_name ?? "Creator"} · {fmtViews(item.views_count)}</p>
						<div style={{ display: "flex", alignItems: "center", gap: 7 }}>
							<AvatarStack friends={item.friends} />
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: "rgba(96,165,250,0.9)", fontWeight: 500, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{attributionText(item)}</p>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
