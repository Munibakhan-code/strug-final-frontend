import { useEffect, useMemo, useRef, useState } from "react";
import { SafeImage } from "../SafeImage.jsx";
import { desktopEndScreenLayout } from "../../utils/desktopVideoEndScreen.js";

export default function DesktopVideoEndScreen({ items, countdown, onCancelCountdown, onReplay, onSelect }) {
	const rootRef = useRef(null);
	const [bounds, setBounds] = useState({ width: 900, height: 506 });

	useEffect(() => {
		const root = rootRef.current;
		if (!root || typeof ResizeObserver === "undefined") return undefined;
		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return;
			const { width, height } = entry.contentRect;
			setBounds(current => current.width === width && current.height === height ? current : { width, height });
		});
		observer.observe(root);
		return () => observer.disconnect();
	}, []);

	const layout = useMemo(() => desktopEndScreenLayout(bounds.width, bounds.height), [bounds]);
	const visibleItems = items.slice(0, layout.limit);

	return (
		<section ref={rootRef} data-testid="desktop-video-end-screen" aria-label="Recommended videos" style={{ position: "absolute", inset: 0, zIndex: 12, display: "flex", flexDirection: "column", overflow: "hidden", padding: layout.compact ? 14 : 20, background: "radial-gradient(circle at 50% 30%, rgba(30,41,59,.7), rgba(2,6,12,.96) 68%)", color: "#fff" }}>
			<header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: layout.compact ? 10 : 16, flexShrink: 0 }}>
				<div style={{ minWidth: 0 }}>
					<p style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: layout.compact ? 15 : 18, fontWeight: 800 }}>{countdown != null ? `Playing next in ${countdown}s` : "Recommended for you"}</p>
					{!layout.compact && <p style={{ margin: "3px 0 0", color: "rgba(255,255,255,.58)", fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>Continue watching without leaving the player</p>}
				</div>
				<div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
					{countdown != null && <button type="button" onClick={onCancelCountdown} style={actionStyle}>Cancel</button>}
					<button type="button" onClick={onReplay} aria-label="Replay video" style={actionStyle}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
						Replay
					</button>
				</div>
			</header>
			<div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`, gap: layout.compact ? 10 : 14, alignContent: "center" }}>
				{visibleItems.length === 0 && (
					<div style={{ gridColumn: "1 / -1", alignSelf: "center", textAlign: "center", color: "rgba(255,255,255,.62)", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
						No recommendations are available right now.
					</div>
				)}
				{visibleItems.map((item, index) => {
					const isNext = countdown != null && index === 0;
					return (
						<button key={item.id ?? item.videoId ?? index} type="button" onClick={() => onSelect?.(item)} aria-label={`Play ${item.title}`} style={{ minWidth: 0, padding: 0, overflow: "hidden", borderRadius: 12, border: isNext ? "2px solid #60a5fa" : "1px solid rgba(255,255,255,.14)", background: "rgba(15,23,42,.88)", boxShadow: isNext ? "0 0 0 3px rgba(37,99,235,.2), 0 14px 34px rgba(0,0,0,.35)" : "0 12px 30px rgba(0,0,0,.28)", color: "#fff", textAlign: "left", cursor: "pointer", transition: "transform .18s ease, border-color .18s ease", animation: `fadeUp .28s ease ${index * 45}ms both` }}>
							<div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", overflow: "hidden", background: "#111827" }}>
								<SafeImage src={item.thumb} alt="" loading="eager" decoding="async" style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }} fallback={null} />
								<div style={{ position: "absolute", inset: "45% 0 0", background: "linear-gradient(transparent,rgba(0,0,0,.7))" }} />
								{isNext && <span style={{ position: "absolute", top: 7, left: 7, padding: "3px 7px", borderRadius: 999, background: "#2563eb", fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase" }}>Up next</span>}
								{item.duration && <span style={{ position: "absolute", right: 6, bottom: 6, padding: "2px 5px", borderRadius: 4, background: "rgba(0,0,0,.82)", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700 }}>{item.duration}</span>}
							</div>
							<div style={{ padding: layout.compact ? "8px 10px" : "10px 12px" }}>
								<p style={{ margin: 0, overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, fontFamily: "'DM Sans', sans-serif", fontSize: layout.compact ? 11 : 13, lineHeight: 1.3, fontWeight: 700 }}>{item.title}</p>
								<p style={{ margin: "4px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "rgba(255,255,255,.58)", fontFamily: "'DM Sans', sans-serif", fontSize: layout.compact ? 10 : 11 }}>{item.channel}</p>
							</div>
						</button>
					);
				})}
			</div>
		</section>
	);
}

const actionStyle = {
	minHeight: 34,
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	gap: 6,
	padding: "6px 11px",
	border: "1px solid rgba(255,255,255,.2)",
	borderRadius: 999,
	background: "rgba(255,255,255,.1)",
	color: "#fff",
	fontFamily: "'DM Sans', sans-serif",
	fontSize: 11,
	fontWeight: 700,
	cursor: "pointer",
};
