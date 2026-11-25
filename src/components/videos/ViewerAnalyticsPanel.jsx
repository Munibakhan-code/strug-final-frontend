import { useEffect, useMemo, useState } from "react";
import { getFriendVideoActivity, getWatchHistory } from "../../api/videos";
import { DonutChart, TrendChart } from "../creatorAnalytics.jsx";
import {
	buildCirclePulse,
	buildViewerAnalytics,
	formatViewerWatchTime,
	VIEWER_ANALYTICS_RANGES,
} from "../../utils/viewerAnalytics.js";
import { friendActivityAttribution } from "../../utils/friendCircle.js";

const ACCENT = "#7c3aed";
const CATEGORY_COLORS = ["#7c3aed", "#2563eb", "#06b6d4", "#22c55e", "#f59e0b"];

function MetricCard({ label, value, detail, color }) {
	return (
		<div className="bg-surface" style={{ minWidth: 0, border: "1px solid var(--color-border)", borderRadius: 14, padding: "13px 14px", position: "relative", overflow: "hidden" }}>
			<div aria-hidden="true" style={{ position: "absolute", width: 72, height: 72, right: -28, top: -30, borderRadius: "50%", background: `radial-gradient(circle, ${color}30, transparent 70%)` }} />
			<p className="text-text-muted" style={{ margin: "0 0 5px", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" }}>{label}</p>
			<p className="text-text-primary" style={{ margin: 0, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 25, fontWeight: 800, lineHeight: 1 }}>{value}</p>
			{detail && <p className="text-text-muted" style={{ margin: "6px 0 0", fontFamily: "'DM Sans', sans-serif", fontSize: 10, lineHeight: 1.35 }}>{detail}</p>}
		</div>
	);
}
function Section({ title, eyebrow, children }) {
	return (
		<section className="bg-surface" style={{ border: "1px solid var(--color-border)", borderRadius: 16, padding: 14, overflow: "hidden" }}>
			{eyebrow && <p style={{ margin: "0 0 3px", color: ACCENT, fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>{eyebrow}</p>}
			<h3 className="text-text-primary" style={{ margin: "0 0 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700 }}>{title}</h3>
			{children}
		</section>
	);
}

function AnalyticsSkeleton() {
	return (
		<div aria-label="Loading viewing analytics" style={{ display: "grid", gap: 12 }}>
			<div className="bg-surface-raised" style={{ height: 42, borderRadius: 12 }} />
			<div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
				{[0, 1, 2, 3].map((item) => <div key={item} className="bg-surface-raised" style={{ height: 84, borderRadius: 14 }} />)}
			</div>
			<div className="bg-surface-raised" style={{ height: 210, borderRadius: 16 }} />
		</div>
	);
}

export default function ViewerAnalyticsPanel({ isMobile = false }) {
	const [insightView, setInsightView] = useState("personal");
	const [range, setRange] = useState("30d");
	const [history, setHistory] = useState(null);
	const [error, setError] = useState(false);
	const [circleActivity, setCircleActivity] = useState([]);
	const [circleUnavailable, setCircleUnavailable] = useState(false);
	const [circleLoaded, setCircleLoaded] = useState(false);

	useEffect(() => {
		let alive = true;
		getWatchHistory()
			.then((response) => { if (alive) setHistory(response); })
			.catch(() => { if (alive) { setHistory(null); setError(true); } });
		return () => { alive = false; };
	}, []);

	// Circle data is independent and can be significantly heavier than personal history. Fetch it
	// only when that inner tab is actually opened, then retain it while the panel stays mounted.
	useEffect(() => {
		if (insightView !== "circle" || circleLoaded) return undefined;
		let alive = true;
		getFriendVideoActivity()
			.then((response) => { if (alive) { setCircleActivity(response); setCircleLoaded(true); } })
			.catch(() => { if (alive) { setCircleUnavailable(true); setCircleLoaded(true); } })
		return () => { alive = false; };
	}, [insightView, circleLoaded]);
	const circleLoading = insightView === "circle" && !circleLoaded && !circleUnavailable;

	const analytics = useMemo(
		() => history == null ? null : buildViewerAnalytics(history, range),
		[history, range],
	);
	const categories = useMemo(() => (analytics?.categories ?? []).map((item, index) => ({
		...item,
		color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
	})), [analytics]);
	const circle = useMemo(() => buildCirclePulse(circleActivity), [circleActivity]);

	if (error) {
		return (
		<div role="alert" className="bg-surface" style={{ border: "1px solid var(--color-border)", borderRadius: 16, padding: "28px 18px", textAlign: "center" }}>
			<p className="text-text-primary" style={{ margin: "0 0 6px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700 }}>Couldn&apos;t load viewing insights</p>
			<p className="text-text-muted" style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>Your history was not changed. Try opening this panel again.</p>
		</div>
		);
	}
	if (!analytics) return <AnalyticsSkeleton />;

	return (
		<div data-testid="viewer-analytics" style={{ width: "100%", minWidth: 0, display: "grid", gap: 12, paddingBottom: isMobile ? 12 : 4 }}>
			<div role="tablist" aria-label="Viewing insight type" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 5, padding: 4, borderRadius: 13, background: "var(--color-surface-raised)", border: "1px solid var(--color-border)" }}>
				{[["personal", "My Activity"], ["circle", "Circle Pulse"]].map(([id, label]) => {
					const selected = insightView === id;
					return <button key={id} type="button" role="tab" aria-selected={selected} onClick={() => setInsightView(id)} className={selected ? "text-text-primary" : "text-text-muted"} style={{ minWidth: 0, padding: "10px 8px", border: "none", borderRadius: 10, background: selected ? "linear-gradient(135deg, rgba(37,99,235,.25), rgba(124,58,237,.28))" : "transparent", boxShadow: selected ? "inset 0 0 0 1px rgba(124,58,237,.38), 0 4px 14px rgba(37,99,235,.12)" : "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 750, cursor: "pointer" }}>{label}</button>;
				})}
			</div>

			{insightView === "personal" && <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 4, padding: 4, borderRadius: 12, background: "var(--color-surface-raised)", border: "1px solid var(--color-border)" }}>
				{VIEWER_ANALYTICS_RANGES.map((option) => (
					<button key={option.id} type="button" aria-pressed={range === option.id} onClick={() => setRange(option.id)} className={range === option.id ? "text-text-primary" : "text-text-muted"} style={{ minWidth: 0, padding: "8px 4px", border: "none", borderRadius: 9, background: range === option.id ? "linear-gradient(135deg, rgba(37,99,235,.28), rgba(124,58,237,.28))" : "transparent", boxShadow: range === option.id ? "inset 0 0 0 1px rgba(124,58,237,.35)" : "none", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{option.label}</button>
				))}
			</div>}

			{insightView === "personal" && (analytics.totalVideos === 0 ? (
				<div className="bg-surface" style={{ border: "1px solid var(--color-border)", borderRadius: 16, padding: "34px 18px", textAlign: "center" }}>
					<div aria-hidden="true" style={{ width: 52, height: 52, borderRadius: 16, margin: "0 auto 12px", display: "grid", placeItems: "center", color: "#a78bfa", background: "linear-gradient(135deg, rgba(37,99,235,.18), rgba(124,58,237,.2))", fontSize: 22 }}>▥</div>
					<p className="text-text-primary" style={{ margin: "0 0 5px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700 }}>No viewing activity in this range</p>
					<p className="text-text-muted" style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>Videos you watch will shape these private insights.</p>
				</div>
			) : (
				<>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
						<MetricCard label="Videos watched" value={analytics.totalVideos.toLocaleString()} detail="History entries" color="#2563eb" />
						<MetricCard label="Watch time" value={formatViewerWatchTime(analytics.watchSeconds)} detail="Saved playback progress" color="#7c3aed" />
						<MetricCard label="Avg. completion" value={analytics.averageCompletion == null ? "—" : `${Math.round(analytics.averageCompletion * 100)}%`} detail={analytics.measurableCount ? `${analytics.measurableCount} measured` : "Progress unavailable"} color="#06b6d4" />
						<MetricCard label="Completed" value={analytics.completed.toLocaleString()} detail="90% or more watched" color="#22c55e" />
					</div>

					<Section eyebrow="Viewing rhythm" title="Videos watched over time">
						<TrendChart data={analytics.trend} metric="videos" color="#7c3aed" height={isMobile ? 168 : 156} formatValue={(value) => String(Math.round(value))} />
						{analytics.peak?.videos > 0 && <p className="text-text-muted" style={{ margin: "8px 0 0", fontFamily: "'DM Sans', sans-serif", fontSize: 10 }}>Peak {range === "24h" ? "hour" : "day"}: {analytics.peak.label ?? new Date(`${analytics.peak.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {analytics.peak.videos} videos</p>}
					</Section>

					<Section eyebrow="Taste profile" title="What you watch">
						<div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
							<DonutChart segments={categories} size={isMobile ? 140 : 126} thickness={18} centerLabel="Videos" centerValue={analytics.totalVideos.toLocaleString()} />
							<div style={{ flex: 1, minWidth: 0, display: "grid", gap: 8 }}>
								{categories.map((item) => (
									<div key={item.label} style={{ minWidth: 0 }}>
										<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}><span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: item.color, flexShrink: 0 }} /><span className="text-text-secondary" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif", fontSize: 10 }}>{item.label}</span><strong className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10 }}>{Math.round((item.value / analytics.totalVideos) * 100)}%</strong></div>
										<div style={{ height: 3, borderRadius: 2, background: "var(--color-border-subtle)", overflow: "hidden" }}><div style={{ width: `${(item.value / analytics.totalVideos) * 100}%`, height: "100%", borderRadius: 2, background: item.color }} /></div>
									</div>
								))}
							</div>
						</div>
					</Section>

					{analytics.channels.length > 0 && (
						<Section eyebrow="Creator affinity" title="Most watched channels">
							<div style={{ display: "grid", gap: 11 }}>
								{analytics.channels.map((item, index) => (
									<div key={item.label} style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr) auto", alignItems: "center", gap: 8 }}>
										<span style={{ color: index === 0 ? "#a78bfa" : "var(--color-text-muted)", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 800 }}>{index + 1}</span>
										<div style={{ minWidth: 0 }}><p className="text-text-secondary" style={{ margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600 }}>{item.label}</p><div style={{ height: 4, borderRadius: 2, background: "var(--color-border-subtle)", overflow: "hidden" }}><div style={{ width: `${(item.value / analytics.channels[0].value) * 100}%`, height: "100%", background: `linear-gradient(90deg, #2563eb, ${ACCENT})`, borderRadius: 2 }} /></div></div>
										<strong className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{item.value}</strong>
									</div>
								))}
							</div>
						</Section>
					)}

				</>
			))}

			{insightView === "circle" && <Section eyebrow="Shared by your circle" title="Circle Pulse">
						{circleLoading ? (
							<p role="status" className="text-text-muted" style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>Loading Circle activity…</p>
						) : circleUnavailable ? (
							<p className="text-text-muted" style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>Circle activity is temporarily unavailable. Your personal insights are unaffected.</p>
						) : circle.interactions === 0 ? (
							<p className="text-text-muted" style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>No privacy-approved Circle activity to show yet.</p>
						) : (
							<div style={{ display: "grid", gap: 14 }}>
								<div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 7 }}>
									{[
										["Friends", circle.activeFriends, "#7c3aed"],
										["Watched", circle.watched, "#2563eb"],
										["Liked", circle.liked, "#ec4899"],
									].map(([label, value, color]) => <div key={label} style={{ minWidth: 0, padding: "10px 7px", borderRadius: 11, textAlign: "center", background: `${color}14`, border: `1px solid ${color}2e` }}><strong className="text-text-primary" style={{ display: "block", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, lineHeight: 1 }}>{value}</strong><span className="text-text-muted" style={{ display: "block", marginTop: 4, fontFamily: "'DM Sans', sans-serif", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span></div>)}
								</div>

								{circle.channels.length > 0 && <div><p className="text-text-secondary" style={{ margin: "0 0 8px", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Channels your circle is into</p><div style={{ display: "grid", gap: 8 }}>{circle.channels.map((item, index) => <div key={item.label} style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr) auto", alignItems: "center", gap: 7 }}><span style={{ color: index === 0 ? "#c4b5fd" : "var(--color-text-muted)", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 800 }}>{index + 1}</span><div style={{ minWidth: 0 }}><p className="text-text-secondary" style={{ margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, fontWeight: 600 }}>{item.label}</p><div style={{ height: 3, borderRadius: 2, background: "var(--color-border-subtle)", overflow: "hidden" }}><div style={{ width: `${(item.value / circle.channels[0].value) * 100}%`, height: "100%", borderRadius: 2, background: "linear-gradient(90deg,#7c3aed,#ec4899)" }} /></div></div><strong className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10 }}>{item.value}</strong></div>)}</div></div>}
								{circle.categories.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{circle.categories.map((item) => <span key={item.label} className="text-text-secondary" style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(124,58,237,.1)", border: "1px solid rgba(124,58,237,.24)", fontFamily: "'DM Sans', sans-serif", fontSize: 9.5, fontWeight: 650 }}>{item.label} · {item.value}</span>)}</div>}

								<div><p className="text-text-secondary" style={{ margin: "0 0 8px", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Recent shared signals</p><div style={{ display: "grid", gap: 8 }}>{circle.rows.slice(0, 3).map((row) => <div key={row.video_id ?? row.title} style={{ minWidth: 0, padding: "9px 10px", borderRadius: 10, background: "var(--color-surface-raised)", border: "1px solid var(--color-border-subtle)" }}><p className="text-text-primary" style={{ margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 650 }}>{row.title ?? "Video"}</p><p className="text-text-muted" style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 9.5 }}>{friendActivityAttribution(row)} · {row.channel?.display_name ?? "Creator"}</p></div>)}</div></div>
							</div>
						)}
					</Section>}
			<p className="text-text-muted" style={{ margin: "2px 4px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 9, lineHeight: 1.45 }}>{insightView === "personal" ? "Private to you. Watch time and completion use the latest saved playback position in your history." : "Only privacy-approved, completed Circle activity is included. Live watching is never shown."}</p>
		</div>
	);
}
