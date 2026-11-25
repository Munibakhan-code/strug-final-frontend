// Shared Creator Studio analytics — the polished KPI/chart system that powers BOTH the in-Videos
// "Creator Studio" entry and the unified "Become a Creator" dashboard (sd-creator). Extracted from
// pages/Videos.jsx so the two creator surfaces render the exact same design with no duplication.
//
// <CreatorAnalyticsPanel> self-fetches /channel/me/analytics/overview and renders the full body
// (range selector → KPI cards → performance trend → top videos → views-by-category → per-video
// modal). The parent supplies its own page header/back chrome.
import { useEffect, useMemo, useRef, useState } from "react";
import { getCreatorOverview, getCreatorVideoAnalytics } from "../api/videos";
import { formatCount } from "../utils/format.js";
import { timeAgo } from "../utils/time.js";
import { Skel } from "./skeletons.jsx";
import { SegmentedControl } from "./providerKit.jsx";

export function formatWatchTime(minutes) {
	if (!minutes) return "0 hrs";
	const hrs = minutes / 60;
	if (hrs < 1) return `${Math.round(minutes)} min`;
	return `${formatCount(Math.round(hrs))} hrs`;
}
function fmtChartDate(d) {
	// YYYY-MM-DD from analytics is a calendar label, not a UTC instant — parse as local
	// civil date so tooltips don't shift back a day west of UTC.
	if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
		const [y, m, day] = d.split("-").map(Number);
		return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
	}
	if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(d)) {
		const dt = new Date(`${d}:00:00Z`);
		return dt.toLocaleTimeString(undefined, { hour: "numeric" });
	}
	if (typeof d === "string" && /^\d{4}-\d{2}$/.test(d)) {
		const [year, month] = d.split("-").map(Number);
		return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
	}
	const dt = new Date(d);
	if (Number.isNaN(dt.getTime())) return d;
	return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
// Shared across every seller/vendor/host/driver/courier/referral analytics panel. These ids are
// the wire vocabulary of utils/analytics-buckets.js (RANGE_DAYS) on the backend — changing them
// silently degrades those panels to a 28-day fallback, so they stay put.
export const RANGE_OPTIONS = [
	{ id: "7d", label: "7 days" }, { id: "28d", label: "28 days" },
	{ id: "90d", label: "90 days" }, { id: "365d", label: "1 year" }, { id: "lifetime", label: "Lifetime" },
];
// Creator-only. /channel/me/analytics/* speaks its own vocabulary (utils/creator-analytics-ranges.js).
export const CREATOR_RANGE_OPTIONS = [
	{ id: "24h", label: "24H" },
	{ id: "7d", label: "7D" },
	{ id: "30d", label: "30D" },
	{ id: "90d", label: "90D" },
	{ id: "1y", label: "1 Year" },
	{ id: "all", label: "All" },
];
const CATEGORY_COLORS = ["#2563eb", "#7c3aed", "#059669", "#dc2626", "#d97706", "#db2777", "#0891b2", "#65a30d", "#f59e0b", "#0d9488"];

function DeltaBadge({ value }) {
	if (value == null || Number.isNaN(value)) return null;
	const positive = value >= 0;
	const color = positive ? "#4ade80" : "#ef4444";
	return (
		<span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color, background: `${color}16`, border: `1px solid ${color}30`, borderRadius: 20, padding: "3px 7px 3px 6px" }}>
			<svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: positive ? "none" : "rotate(180deg)" }}><polyline points="18 15 12 9 6 15"/></svg>
			{Math.abs(value).toFixed(1)}%
		</span>
	);
}

function useCountUp(target, duration = 800) {
	const [value, setValue] = useState(0);
	const prevTarget = useRef(0);
	useEffect(() => {
		const start = prevTarget.current;
		const delta = target - start;
		if (!delta) { setValue(target); return; }
		const startTime = performance.now();
		let raf;
		function tick(now) {
			const progress = Math.min(1, (now - startTime) / duration);
			const eased = 1 - Math.pow(1 - progress, 3);
			setValue(start + delta * eased);
			if (progress < 1) raf = requestAnimationFrame(tick);
			else prevTarget.current = target;
		}
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [target, duration]);
	return value;
}

function Sparkline({ data, color = "#2563eb", height = 26 }) {
	if (!data || data.length < 2) return null;
	const width = 100;
	const max = Math.max(...data), min = Math.min(...data);
	const range = max - min || 1;
	const stepX = width / (data.length - 1);
	const points = data.map((v, i) => [i * stepX, height - ((v - min) / range) * height]);
	const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
	const area = `${path} L${width},${height} L0,${height} Z`;
	const gid = `spark-${color.replace("#", "")}`;
	return (
		<svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
			<defs>
				<linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor={color} stopOpacity="0.35" />
					<stop offset="100%" stopColor={color} stopOpacity="0" />
				</linearGradient>
			</defs>
			<path d={area} fill={`url(#${gid})`} stroke="none" />
			<path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

export function KpiCard({ label, value, countTo, formatValue, delta, accent = "#2563eb", icon, sparkline }) {
	const [hov, setHov] = useState(false);
	const animated = useCountUp(countTo ?? 0, 800);
	const displayValue = countTo != null && formatValue ? formatValue(animated) : value;
	return (
		<div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} className="bg-surface" style={{
			flex: "1 1 200px", minWidth: 180,
			border: `1px solid ${hov ? `${accent}40` : "var(--color-border)"}`,
			borderRadius: 16, padding: "18px 20px 14px", position: "relative", overflow: "hidden",
			transform: hov ? "translateY(-3px)" : "none",
			boxShadow: hov ? `0 14px 32px -10px ${accent}55` : "0 2px 10px var(--color-shadow)",
			transition: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s, border-color 0.25s",
		}}>
			<div style={{ position: "absolute", top: -30, right: -30, width: 100, height: 100, borderRadius: "50%", background: `radial-gradient(circle, ${accent}22, transparent 70%)`, transition: "transform 0.3s", transform: hov ? "scale(1.25)" : "scale(1)" }} />
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
				<div className="text-text-secondary" style={{ display: "flex", alignItems: "center", gap: 8 }}>
					{icon && <span style={{ width: 22, height: 22, borderRadius: 7, background: `${accent}1c`, display: "flex", alignItems: "center", justifyContent: "center", color: accent, flexShrink: 0 }}>{icon}</span>}
					<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
				</div>
				<DeltaBadge value={delta} />
			</div>
			<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: "0.02em", marginBottom: sparkline ? 10 : 2, position: "relative", zIndex: 1 }}>{displayValue}</p>
			{sparkline && <Sparkline data={sparkline} color={accent} />}
		</div>
	);
}

function smoothPath(points) {
	if (points.length < 3) {
		return points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
	}
	let path = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[i === 0 ? i : i - 1];
		const p1 = points[i];
		const p2 = points[i + 1];
		const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
		const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
		const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
		const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
		const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
		path += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
	}
	return path;
}

export function TrendChart({ data, metric, color = "#2563eb", height = 220, formatValue = formatCount }) {
	const [hoverIdx, setHoverIdx] = useState(null);
	const wrapRef = useRef(null);
	const pathRef = useRef(null);
	const [pathLen, setPathLen] = useState(0);
	const [drawn, setDrawn] = useState(false);
	const width = 680, padX = 8, padY = 16;
	const values = data.map(d => d[metric] ?? 0);
	const max = Math.max(1, ...values), min = Math.min(0, ...values);
	const range = max - min || 1;
	const stepX = data.length > 1 ? (width - padX * 2) / (data.length - 1) : 0;
	const points = values.map((v, i) => [padX + i * stepX, padY + (1 - (v - min) / range) * (height - padY * 2)]);
	const linePath = smoothPath(points);
	const areaPath = points.length ? `${linePath} L${points[points.length - 1][0]},${height - padY} L${points[0][0]},${height - padY} Z` : "";
	const gridFractions = [0, 0.33, 0.66, 1];
	const gridLines = gridFractions.map(f => ({ y: padY + (1 - f) * (height - padY * 2), value: min + f * range }));
	const peakIdx = values.length ? values.indexOf(Math.max(...values)) : -1;
	// Stable key so parent re-renders that pass a fresh `data` array (e.g. food Overview
	// prepTick every 1s) do not keep resetting drawn → invisible stroke-dashoffset line.
	const dataKey = `${metric}|${data.map((d) => `${d.date ?? ""}:${d[metric] ?? 0}`).join(",")}`;

	useEffect(() => {
		setDrawn(false);
		let innerId = 0;
		const outerId = requestAnimationFrame(() => {
			if (pathRef.current) setPathLen(pathRef.current.getTotalLength());
			innerId = requestAnimationFrame(() => setDrawn(true));
		});
		return () => {
			cancelAnimationFrame(outerId);
			cancelAnimationFrame(innerId);
		};
	}, [dataKey]);

	function handleMove(e) {
		const rect = wrapRef.current?.getBoundingClientRect();
		if (!rect || !points.length) return;
		const relX = ((e.clientX - rect.left) / rect.width) * width;
		let nearest = 0, best = Infinity;
		points.forEach((p, i) => { const d = Math.abs(p[0] - relX); if (d < best) { best = d; nearest = i; } });
		setHoverIdx(nearest);
	}

	if (!data.length) return <div className="text-text-muted" style={{ height, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>No data for this range yet.</div>;

	return (
		<div ref={wrapRef} onMouseMove={handleMove} onMouseLeave={() => setHoverIdx(null)} style={{ position: "relative", width: "100%" }}>
			<svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height, display: "block", overflow: "visible" }}>
				<defs>
					<linearGradient id={`tg-${metric}`} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor={color} stopOpacity="0.4" />
						<stop offset="100%" stopColor={color} stopOpacity="0" />
					</linearGradient>
				</defs>
				{gridLines.map((g, i) => (
					<g key={i}>
						<line x1={padX} x2={width - padX} y1={g.y} y2={g.y} stroke="var(--color-border-subtle)" strokeWidth="1" strokeDasharray={i === 0 ? "none" : "3 5"} />
						<text x={width - padX} y={g.y - 4} textAnchor="end" fontSize="9" fontFamily="'DM Sans', sans-serif" fill="var(--color-text-muted)">{formatValue(g.value)}</text>
					</g>
				))}
				<path d={areaPath} fill={`url(#tg-${metric})`} stroke="none" opacity={drawn ? 1 : 0} style={{ transition: "opacity 0.6s ease 0.2s" }} />
				<path ref={pathRef} d={linePath} fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round"
					strokeDasharray={pathLen || 1} strokeDashoffset={drawn ? 0 : (pathLen || 1)}
					style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)" }} />
				{peakIdx > -1 && points[peakIdx] && (
					<circle cx={points[peakIdx][0]} cy={points[peakIdx][1]} r="3" fill="var(--color-surface)" stroke={color} strokeWidth="2" opacity={drawn ? 1 : 0} style={{ transition: "opacity 0.4s ease 0.9s" }} />
				)}
				{hoverIdx != null && points[hoverIdx] && (
					<>
						<line x1={points[hoverIdx][0]} x2={points[hoverIdx][0]} y1={padY} y2={height - padY} stroke="var(--color-border)" strokeWidth="1" />
						<circle cx={points[hoverIdx][0]} cy={points[hoverIdx][1]} r="5" fill={color} stroke="var(--color-bg)" strokeWidth="2.5" />
						<circle cx={points[hoverIdx][0]} cy={points[hoverIdx][1]} r="9" fill={color} opacity="0.18" />
					</>
				)}
			</svg>
			{hoverIdx != null && data[hoverIdx] && (
				<div className="bg-surface" style={{ position: "absolute", top: 4, left: `clamp(0px, calc(${(points[hoverIdx][0] / width) * 100}% - 60px), calc(100% - 120px))`, border: `1px solid ${color}40`, borderRadius: 10, padding: "8px 12px", pointerEvents: "none", whiteSpace: "nowrap", boxShadow: "0 8px 24px var(--color-shadow)" }}>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 2 }}>{data[hoverIdx].label ?? fmtChartDate(data[hoverIdx].date)}</p>
					<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700 }}>{formatValue(data[hoverIdx][metric] ?? 0)}</p>
				</div>
			)}
		</div>
	);
}

export function DonutChart({ segments, size = 160, thickness = 22, hoveredIndex, onHoverIndex, centerLabel, centerValue }) {
	const [drawn, setDrawn] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(null);
	const rawTotal = segments.reduce((s, x) => s + x.value, 0);
	const total = rawTotal || 1;
	const activeIndex = selectedIndex ?? hoveredIndex;
	const activeSegment = activeIndex != null ? segments[activeIndex] : null;
	const activePercentage = activeSegment ? ((activeSegment.value / total) * 100).toFixed(1) : null;
	const r = (size - thickness) / 2, c = size / 2, circumference = 2 * Math.PI * r;
	let offsetAcc = 0;
	// Stable key so parent re-renders that pass a fresh array (e.g. food dashboard prepTick)
	// do not keep resetting drawn → invisible arcs / gray-only ring.
	const segmentsKey = segments.map((s) => `${s.label}:${s.value}:${s.color}`).join("|");

	useEffect(() => {
		setDrawn(false);
		let innerId = 0;
		const outerId = requestAnimationFrame(() => {
			setSelectedIndex(null);
			innerId = requestAnimationFrame(() => setDrawn(true));
		});
		return () => {
			cancelAnimationFrame(outerId);
			cancelAnimationFrame(innerId);
		};
	}, [segmentsKey]);

	return (
		<svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, flexShrink: 0, overflow: "visible" }}>
			<circle cx={c} cy={c} r={r} fill="none" stroke="var(--color-border-subtle)" strokeWidth={thickness} opacity={selectedIndex == null ? 1 : 0.06} style={{ transition: "opacity 0.22s ease" }} />
			{segments.map((seg, i) => {
				const segLen = (seg.value / total) * circumference;
				const segmentMidpoint = offsetAcc + (segLen / 2);
				const segmentAngle = ((segmentMidpoint / circumference) * Math.PI * 2) - (Math.PI / 2);
				const dashoffset = circumference - offsetAcc;
				offsetAcc += segLen;
				const isHovered = hoveredIndex === i;
				const isSelected = selectedIndex === i;
				const isActive = isHovered || isSelected;
				const lift = isSelected ? 7 : isHovered ? 5 : 0;
				const liftX = Math.cos(segmentAngle) * lift;
				const liftY = Math.sin(segmentAngle) * lift;
				const opacity = selectedIndex != null ? (isSelected ? 1 : 0.07) : hoveredIndex != null && !isHovered ? 0.32 : 1;
				return (
					<g key={seg.label} transform={`translate(${liftX.toFixed(2)} ${liftY.toFixed(2)})`} style={{ transition: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1)" }}>
						<circle cx={c} cy={c} r={r} fill="none" stroke={seg.color}
							strokeWidth={isActive ? thickness + 4 : thickness}
							strokeDasharray={`${drawn ? segLen : 0} ${circumference - (drawn ? segLen : 0)}`}
							strokeDashoffset={dashoffset} transform={`rotate(-90 ${c} ${c})`}
							opacity={opacity}
							onMouseEnter={() => onHoverIndex?.(i)} onMouseLeave={() => onHoverIndex?.(null)}
							onClick={() => setSelectedIndex(current => current === i ? null : i)}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									setSelectedIndex(current => current === i ? null : i);
								}
							}}
							tabIndex={0}
							role="button"
							aria-label={`${seg.label}: ${formatCount(seg.value)} views, ${((seg.value / total) * 100).toFixed(1)} percent`}
							style={{ stroke: seg.color, cursor: onHoverIndex ? "pointer" : "default", transition: "stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1), opacity 0.22s, stroke-width 0.2s" }}>
							<title>{`${seg.label}: ${formatCount(seg.value)} views (${((seg.value / total) * 100).toFixed(1)}%)`}</title>
						</circle>
					</g>
				);
			})}
			<circle
				cx={c}
				cy={c}
				r={Math.max(18, r - (thickness / 2) - 3)}
				fill="transparent"
				onClick={() => selectedIndex != null && setSelectedIndex(null)}
				onKeyDown={(event) => {
					if (selectedIndex != null && (event.key === "Enter" || event.key === " ")) {
						event.preventDefault();
						setSelectedIndex(null);
					}
				}}
				tabIndex={selectedIndex != null ? 0 : -1}
				role={selectedIndex != null ? "button" : undefined}
				aria-label={selectedIndex != null ? "Show complete chart" : undefined}
				style={{ cursor: selectedIndex != null ? "pointer" : "default" }}
			>
				{selectedIndex != null && <title>Show complete chart</title>}
			</circle>
			<text x={c} y={activeSegment ? c - 12 : c - 6} textAnchor="middle" fontFamily="'Barlow Condensed', sans-serif" fontWeight="800" fontSize="20" fill="var(--color-text-primary)" style={{ pointerEvents: "none" }}>
				{activeSegment ? formatCount(activeSegment.value) : (centerValue ?? formatCount(rawTotal))}
			</text>
			<text x={c} y={activeSegment ? c + 5 : c + 14} textAnchor="middle" fontFamily="'DM Sans', sans-serif" fontWeight={activeSegment ? "700" : "400"} fontSize="10" fill={activeSegment?.color ?? "var(--color-text-muted)"} style={{ pointerEvents: "none" }}>
				{activeSegment ? activeSegment.label : (centerLabel ?? "Total Views")}
			</text>
			{activeSegment && <text x={c} y={c + 20} textAnchor="middle" fontFamily="'DM Sans', sans-serif" fontWeight="700" fontSize="9" fill="var(--color-text-secondary)" style={{ pointerEvents: "none" }}>{selectedIndex != null ? `${activePercentage}% · click center to reset` : `${activePercentage}% of views`}</text>}
		</svg>
	);
}

export function CreatorAudienceIntelligence({ data, isMobile = false }) {
	if (!data) return null;
	const funnel = Array.isArray(data.funnel) ? data.funnel : [];
	const retention = Array.isArray(data.retention) ? data.retention : [];
	const segments = Array.isArray(data.segments) ? data.segments : [];
	const sources = Array.isArray(data.sources) ? data.sources : [];
	const returning = segments.find(item => item.label === "Returning viewers")?.value ?? 0;
	const newcomers = segments.find(item => item.label === "New viewers")?.value ?? 0;
	const audienceTotal = returning + newcomers;
	const hasData = funnel.some(item => Number(item.value) > 0) || retention.length > 0 || audienceTotal > 0 || sources.some(item => Number(item.value) > 0);

	return (
		<section aria-label="Audience intelligence" style={{ marginBottom: 28 }}>
			<div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
				<div>
					<p style={{ margin: "0 0 4px", color: "#a78bfa", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 800, letterSpacing: "0.12em" }}>AUDIENCE INTELLIGENCE</p>
					<h3 className="text-text-primary" style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 17, fontWeight: 800 }}>How viewers discover and stay</h3>
				</div>
				<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10 }}>Aggregated · privacy-safe</span>
			</div>
			{!hasData ? (
				<div className="border border-border text-text-muted" style={{ padding: 20, borderRadius: 16, background: "var(--color-surface)", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Audience insights will appear as viewers interact with your videos.</div>
			) : (
				<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 16 }}>
					<div className="border border-border" style={{ padding: isMobile ? 16 : 20, borderRadius: 18, background: "linear-gradient(155deg,rgba(37,99,235,.12),var(--color-surface) 55%)", boxShadow: "0 12px 34px var(--color-shadow)" }}>
						<p style={{ color: "#60a5fa", fontSize: 10, fontWeight: 800, letterSpacing: ".12em", margin: "0 0 5px" }}>AUDIENCE JOURNEY</p>
						<h4 className="text-text-primary" style={{ fontSize: 15, margin: "0 0 16px" }}>From discovery to engagement</h4>
						<div style={{ display: "grid", gap: 9 }}>
							{funnel.map((step, index) => {
								const max = Math.max(1, Number(funnel[0]?.value) || 0);
								const width = Math.max(Number(step.value) > 0 ? 3 : 0, Math.min(100, (Number(step.value) / max) * 100));
								return <div key={step.label}><div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}><span className="text-text-secondary" style={{ fontSize: 11 }}>{step.label}</span><strong className="text-text-primary" style={{ fontSize: 11 }}>{formatCount(step.value)}</strong></div><div style={{ height: 8, borderRadius: 6, background: "var(--color-border-subtle)", overflow: "hidden" }}><div style={{ height: "100%", width: `${width}%`, borderRadius: 6, background: `linear-gradient(90deg,#2563eb,${index > 2 ? "#7c3aed" : "#06b6d4"})`, transition: "width .45s ease" }} /></div></div>;
							})}
						</div>
					</div>
					<div className="border border-border" style={{ padding: isMobile ? 16 : 20, borderRadius: 18, background: "linear-gradient(155deg,rgba(124,58,237,.13),var(--color-surface) 55%)", boxShadow: "0 12px 34px var(--color-shadow)" }}>
						<p style={{ color: "#a78bfa", fontSize: 10, fontWeight: 800, letterSpacing: ".12em", margin: "0 0 5px" }}>AUDIENCE RETENTION</p>
						<h4 className="text-text-primary" style={{ fontSize: 15, margin: "0 0 12px" }}>How long viewers keep watching</h4>
						{retention.length > 1 ? <TrendChart data={retention.map((viewers, index) => ({ date: `${Math.round((index / (retention.length - 1)) * 100)}%`, viewers }))} metric="viewers" color="#8b5cf6" height={isMobile ? 145 : 175} formatValue={value => `${Math.round(value)}%`} /> : <p className="text-text-muted" style={{ fontSize: 12 }}>Retention is still building.</p>}
						{retention.length > 1 && <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}><span className="text-text-muted" style={{ fontSize: 10 }}>Start · 100%</span><span className="text-text-muted" style={{ fontSize: 10 }}>Completed · {retention.at(-1)}%</span></div>}
					</div>
					<div className="border border-border" style={{ padding: isMobile ? 16 : 20, borderRadius: 18, background: "var(--color-surface)", boxShadow: "0 12px 34px var(--color-shadow)" }}>
						<p style={{ color: "#34d399", fontSize: 10, fontWeight: 800, letterSpacing: ".12em", margin: "0 0 12px" }}>AUDIENCE MIX</p>
						{segments.map(item => { const max = Math.max(1, ...segments.map(segment => Number(segment.value) || 0)); return <div key={item.label} style={{ marginBottom: 10 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span className="text-text-secondary" style={{ fontSize: 11 }}>{item.label}</span><strong className="text-text-primary" style={{ fontSize: 11 }}>{formatCount(item.value)}</strong></div><div style={{ height: 7, borderRadius: 6, background: "var(--color-border-subtle)", overflow: "hidden" }}><div style={{ width: `${Math.min(100, (Number(item.value) / max) * 100)}%`, height: "100%", background: "linear-gradient(90deg,#10b981,#06b6d4)" }} /></div></div>; })}
					</div>
					<div className="border border-border" style={{ padding: isMobile ? 16 : 20, borderRadius: 18, background: "var(--color-surface)", boxShadow: "0 12px 34px var(--color-shadow)" }}>
						<p style={{ color: "#f59e0b", fontSize: 10, fontWeight: 800, letterSpacing: ".12em", margin: "0 0 12px" }}>DISCOVERY SOURCES</p>
						{sources.length === 0 ? <p className="text-text-muted" style={{ fontSize: 12 }}>Source attribution is still building.</p> : sources.map(source => <div key={source.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}><span className="text-text-secondary" style={{ width: 88, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>{source.label}</span><div style={{ flex: 1, height: 7, borderRadius: 6, background: "var(--color-border-subtle)", overflow: "hidden" }}><div style={{ width: `${Math.min(100, (Number(source.value) / Math.max(1, Number(sources[0]?.value) || 0)) * 100)}%`, height: "100%", background: "linear-gradient(90deg,#f59e0b,#ef4444)" }} /></div><strong className="text-text-primary" style={{ fontSize: 11 }}>{formatCount(source.value)}</strong></div>)}
					</div>
				</div>
			)}
		</section>
	);
}

// The full analytics body — range selector + KPIs + trend + top videos + category donut + per-video
// modal. Self-fetches; the parent supplies the surrounding page header. `showRange` lets a parent
// hide the internal range pills if it renders its own.
export function CreatorAnalyticsPanel({ isMobile = false, showRange = true, accentColor = "#7c3aed" }) {
	const [range, setRange] = useState("30d");
	const [loading, setLoading] = useState(true);
	const [errored, setErrored] = useState(false);
	const [overview, setOverview] = useState(null);
	const [metric, setMetric] = useState("views");
	const [sortKey, setSortKey] = useState("views_count");
	const [hoveredCatIdx, setHoveredCatIdx] = useState(null);
	const [selectedVid, setSelectedVid] = useState(null);
	const [vidAnalytics, setVidAnalytics] = useState(null);
	const [vidLoading, setVidLoading] = useState(false);

	useEffect(() => {
		const controller = new AbortController();
		let disposed = false;
		const loadOverview = (silent = false) => {
			if (!silent) { setLoading(true); setErrored(false); }
			getCreatorOverview(range, { signal: controller.signal })
				.then(res => {
					if (!disposed) { setOverview(res?.data ?? res ?? null); setErrored(false); }
				})
				.catch((err) => {
					if (!disposed && err?.code !== "ERR_CANCELED") {
						console.error('overview failed:', err?.response?.status, err?.response?.data || err.message);
						if (!silent) setErrored(true);
					}
				})
				.finally(() => { if (!disposed && !silent) setLoading(false); });
		};
		loadOverview();
		const refreshId = range === "24h" ? window.setInterval(() => loadOverview(true), 60_000) : null;
		return () => {
			disposed = true;
			controller.abort();
			if (refreshId != null) window.clearInterval(refreshId);
		};
	}, [range]);

	useEffect(() => {
		if (!selectedVid) { setVidAnalytics(null); return; }
		const controller = new AbortController();
		let disposed = false;
		setVidLoading(true);
		getCreatorVideoAnalytics(selectedVid.video_id, range, { signal: controller.signal })
			.then(res => { if (!disposed) setVidAnalytics(res?.data ?? res ?? null); })
			.catch((err) => {
				if (!disposed && err?.code !== "ERR_CANCELED") {
					console.error('video analytics failed:', err?.response?.status, err?.response?.data || err.message);
					setVidAnalytics(null);
				}
			})
			.finally(() => { if (!disposed) setVidLoading(false); });
		return () => { disposed = true; controller.abort(); };
	}, [selectedVid, range]);

	const summary = overview?.summary ?? {};
	const timeseries = overview?.timeseries ?? [];
	const topVideos = useMemo(() => [...(overview?.top_videos ?? [])].sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0)), [overview, sortKey]);
	const categoryBreakdown = overview?.category_breakdown ?? [];
	const geography = overview?.geography ?? [];
	const devices = overview?.devices ?? [];
	const audienceIntelligence = overview?.audience_intelligence ?? null;
	const [hoveredGeoIdx, setHoveredGeoIdx] = useState(null);
	const [hoveredDevIdx, setHoveredDevIdx] = useState(null);
	const metricColor = { views: "#2563eb", likes: "#ef4444", comments: "#7c3aed", subscribers_net: "#4ade80" }[metric];

	const viewsSpark = useMemo(() => timeseries.map(d => d.views ?? 0), [timeseries]);
	const subsSpark = useMemo(() => timeseries.map(d => d.subscribers_net ?? 0), [timeseries]);
	const engagementSpark = useMemo(() => timeseries.map(d => { const v = d.views ?? 0; return v > 0 ? (((d.likes ?? 0) + (d.comments ?? 0)) / v) * 100 : 0; }), [timeseries]);
	const intelligence = useMemo(() => {
		const midpoint = Math.max(1, Math.floor(timeseries.length / 2));
		const previousViews = timeseries.slice(0, midpoint).reduce((sum, item) => sum + (item.views ?? 0), 0);
		const recentViews = timeseries.slice(midpoint).reduce((sum, item) => sum + (item.views ?? 0), 0);
		const normalizedPrevious = previousViews / midpoint;
		const recentCount = Math.max(1, timeseries.length - midpoint);
		const normalizedRecent = recentViews / recentCount;
		const momentum = normalizedPrevious > 0 ? ((normalizedRecent - normalizedPrevious) / normalizedPrevious) * 100 : normalizedRecent > 0 ? 100 : 0;
		const peak = timeseries.reduce((best, item) => (item.views ?? 0) > (best?.views ?? -1) ? item : best, null);
		return {
			momentum,
			peak,
			bestVideo: topVideos[0] ?? null,
			topCategory: categoryBreakdown[0] ?? null,
			topLocation: geography[0] ?? null,
			primaryDevice: devices[0] ?? null,
		};
	}, [timeseries, topVideos, categoryBreakdown, geography, devices]);

	return (
		<div>
			{showRange && (
				<div className="border border-border" style={{ position: "relative", overflow: "hidden", display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 16, marginBottom: 20, padding: isMobile ? "16px" : "18px 20px", borderRadius: 18, background: "linear-gradient(125deg, rgba(37,99,235,0.12), rgba(124,58,237,0.1) 48%, var(--color-surface) 82%)", boxShadow: "0 12px 34px var(--color-shadow)" }}>
					<div style={{ position: "absolute", width: 180, height: 180, right: -50, top: -95, borderRadius: "50%", background: `radial-gradient(circle, ${accentColor}35, transparent 68%)`, pointerEvents: "none" }} />
					<div style={{ position: "relative", minWidth: 0 }}>
						<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
							<span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 0 4px rgba(74,222,128,0.12), 0 0 14px rgba(74,222,128,0.65)" }} />
							<span style={{ color: "#a78bfa", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 800, letterSpacing: "0.12em" }}>CREATOR INTELLIGENCE</span>
						</div>
						<h2 className="text-text-primary" style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 18 : 21, fontWeight: 800 }}>Channel performance pulse</h2>
						<p className="text-text-secondary" style={{ margin: "4px 0 0", fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>Live insights calculated from your uploaded videos</p>
					</div>
					<div style={{ position: "relative", alignSelf: isMobile ? "stretch" : "center", overflowX: "auto", paddingBottom: 1 }}>
						<SegmentedControl options={CREATOR_RANGE_OPTIONS} value={range} onChange={setRange} accentColor={accentColor} size="sm" />
					</div>
				</div>
			)}

			{loading ? (
				<div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>{[...Array(4)].map((_, i) => <Skel key={i} w={220} h={104} r={16} />)}</div>
			) : errored || !overview ? (
				<div className="border border-border" style={{ background: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))", borderRadius: 18, boxShadow: "0 12px 34px var(--color-shadow)", padding: "40px 24px", textAlign: "center", marginBottom: 28 }}>
					<svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10 }}><path d="M3 3v18h18"/><path d="M7 16l4-6 4 3 5-8"/></svg>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Couldn't load analytics</p>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Check the console for the error, or try a different range.</p>
				</div>
			) : (
				<>
					{summary.views_change_pct != null && (
						<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, padding: "12px 18px", borderRadius: 14, animation: "fadeUp 0.35s ease both",
							background: summary.views_change_pct >= 0 ? "linear-gradient(135deg, rgba(74,222,128,0.12), rgba(37,99,235,0.07))" : "var(--color-surface-raised)",
							border: `1px solid ${summary.views_change_pct >= 0 ? "rgba(74,222,128,0.25)" : "var(--color-border)"}` }}>
							<span style={{ width: 30, height: 30, borderRadius: "50%", background: summary.views_change_pct >= 0 ? "rgba(74,222,128,0.18)" : "var(--color-surface-raised)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
								<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={summary.views_change_pct >= 0 ? "#4ade80" : "var(--color-text-secondary)"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
							</span>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>
								{summary.views_change_pct >= 0
									? <>Views are up <strong style={{ color: "#4ade80" }}>{summary.views_change_pct.toFixed(1)}%</strong> vs the previous {CREATOR_RANGE_OPTIONS.find(r => r.id === range)?.label.toLowerCase()}.</>
									: <>Views dipped <strong style={{ color: "#ef4444" }}>{Math.abs(summary.views_change_pct).toFixed(1)}%</strong> vs the previous period.</>}
							</p>
						</div>
					)}

					<CreatorAudienceIntelligence data={audienceIntelligence} isMobile={isMobile} />
					<div style={{ marginBottom: 22, animation: "fadeUp 0.35s ease 20ms both" }}>
						<div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
							<div>
								<p style={{ margin: "0 0 4px", color: "#a78bfa", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 800, letterSpacing: "0.12em" }}>GROWTH SIGNALS</p>
								<h3 className="text-text-primary" style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 17, fontWeight: 800 }}>What is driving your channel</h3>
							</div>
							<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{CREATOR_RANGE_OPTIONS.find(option => option.id === range)?.label} analysis</span>
						</div>
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))", gap: isMobile ? 9 : 12 }}>
							{[
								{
									label: "Momentum",
									value: `${intelligence.momentum >= 0 ? "+" : ""}${intelligence.momentum.toFixed(1)}%`,
									detail: intelligence.momentum >= 0 ? "Recent viewing pace is accelerating" : "Recent viewing pace needs attention",
									accent: intelligence.momentum >= 0 ? "#4ade80" : "#fb7185",
									icon: "↗",
								},
								{
									label: "Peak activity",
									value: intelligence.peak ? formatCount(intelligence.peak.views ?? 0) : "—",
									detail: intelligence.peak ? `${fmtChartDate(intelligence.peak.date)} · highest view volume` : "No activity recorded yet",
									accent: "#38bdf8",
									icon: "⌁",
								},
								{
									label: "Winning content",
									value: intelligence.topCategory?.category ?? "—",
									detail: intelligence.bestVideo ? intelligence.bestVideo.title : "Publish videos to unlock this signal",
									accent: "#a78bfa",
									icon: "✦",
								},
								{
									label: "Audience core",
									value: intelligence.topLocation?.country ?? "—",
									detail: intelligence.primaryDevice ? `${intelligence.primaryDevice.device} is the leading device` : "Audience profile is still building",
									accent: "#f59e0b",
									icon: "◎",
								},
							].map(signal => (
								<div key={signal.label} className="border border-border" style={{ position: "relative", minWidth: 0, minHeight: isMobile ? 112 : "auto", overflow: "hidden", padding: isMobile ? "12px 11px" : "15px 16px", borderRadius: isMobile ? 13 : 15, background: `linear-gradient(145deg, ${signal.accent}16, var(--color-surface) 62%)`, boxShadow: "0 8px 24px var(--color-shadow)" }}>
									<div style={{ position: "absolute", inset: "0 auto 0 0", width: 2, background: signal.accent }} />
									<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 9 }}>
										<span className="text-text-secondary" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 9 : 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>{signal.label}</span>
										<span style={{ color: signal.accent, fontSize: isMobile ? 14 : 17, lineHeight: 1, flexShrink: 0 }}>{signal.icon}</span>
									</div>
									<p className="text-text-primary" style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 21 : 25, fontWeight: 800 }}>{signal.value}</p>
									<p className="text-text-muted" style={{ margin: "5px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif", fontSize: 10 }}>{signal.detail}</p>
								</div>
							))}
						</div>
					</div>

					<div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 8, animation: "fadeUp 0.35s ease 40ms both" }}>
						<KpiCard label="Views" countTo={summary.total_views ?? 0} formatValue={v => formatCount(Math.round(v))} delta={summary.views_change_pct} accent="#2563eb" sparkline={viewsSpark}
							icon={<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>} />
						<KpiCard label="Watch Time" value={summary.has_watch_time_data ? undefined : "—"} countTo={summary.has_watch_time_data ? summary.watch_time_minutes : null} formatValue={formatWatchTime} delta={summary.has_watch_time_data ? summary.watch_time_change_pct : null} accent="#7c3aed"
							icon={<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} />
						<KpiCard label="Subscribers" countTo={summary.net_subscribers ?? 0} formatValue={v => `${v >= 0 ? "+" : ""}${formatCount(Math.round(v))}`} delta={summary.subscribers_change_pct} accent="#4ade80" sparkline={subsSpark}
							icon={<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>} />
						<KpiCard label="Engagement" countTo={(summary.engagement_rate ?? 0) * 100} formatValue={v => `${v.toFixed(1)}%`} delta={summary.engagement_change_pct} accent="#f59e0b" sparkline={engagementSpark}
							icon={<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>} />
						<KpiCard label="Avg. view %" value={summary.avg_view_percentage != null ? `${summary.avg_view_percentage.toFixed(1)}%` : "—"} accent="#0891b2"
						icon={<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>} />
					</div>
					{!summary.has_watch_time_data && <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "6px 0 20px" }}>Watch time accrues as viewers watch your videos — check back as the data builds up.</p>}

					<div className="border border-border" style={{ background: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))", borderRadius: 18, boxShadow: "0 12px 34px var(--color-shadow)", padding: "20px 22px", marginBottom: 28, animation: "fadeUp 0.35s ease 80ms both" }}>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
							<h3 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15 }}>Performance over time</h3>
							<SegmentedControl
								options={[{ id: "views", label: "Views", color: "#2563eb" }, { id: "likes", label: "Likes", color: "#ef4444" }, { id: "comments", label: "Comments", color: "#7c3aed" }, { id: "subscribers_net", label: "Subscribers", color: "#4ade80" }]}
								value={metric} onChange={setMetric} size="sm"
							/>
						</div>
						<TrendChart data={timeseries} metric={metric} color={metricColor} height={isMobile ? 180 : 240} />
					</div>

					<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 20, marginBottom: 28 }}>
						<div className="border border-border" style={{ flex: 2, minWidth: 0, background: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))", borderRadius: 18, boxShadow: "0 12px 34px var(--color-shadow)", padding: "20px 22px", animation: "fadeUp 0.35s ease 120ms both" }}>
							<h3 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Top performing videos</h3>
							{topVideos.length === 0 ? <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>No videos in this range yet.</p> : (
								<>
									{!isMobile && (
										<div style={{ display: "flex", gap: 16, marginBottom: 10, paddingLeft: 96 }}>
											{[["views_count","Views"],["likes_count","Likes"],["comments_count","Comments"],["avg_view_duration_sec","Avg. watch"]].map(([key,label]) => (
												<button key={key} onClick={() => setSortKey(key)} style={{ flex: 1, textAlign: "left", background: "none", border: "none", color: sortKey === key ? "#60a5fa" : "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer", padding: 0 }}>{label}</button>
											))}
										</div>
									)}
									<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
										{topVideos.map((v, i) => {
											const maxVal = topVideos[0]?.[sortKey] ?? 1;
											const barPct = maxVal > 0 ? Math.max(4, ((v[sortKey] ?? 0) / maxVal) * 100) : 0;
											const medalColors = ["#f59e0b", "#cbd5e1", "#b45309"];
											return (
												<div key={v.video_id} onClick={() => setSelectedVid(v)} style={{ position: "relative", display: "flex", alignItems: "center", gap: 14, padding: "10px 8px", borderRadius: 10, cursor: "pointer", overflow: "hidden", transition: "background 0.15s" }}
													onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-raised)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
													<div style={{ position: "absolute", left: 0, bottom: 0, height: 2, width: `${barPct}%`, background: i < 3 ? medalColors[i] : "#2563eb", opacity: 0.5, transition: "width 0.6s ease" }} />
													{i < 3 ? (
														<span style={{ width: 18, height: 18, borderRadius: "50%", background: `${medalColors[i]}22`, border: `1px solid ${medalColors[i]}55`, color: medalColors[i], fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "'DM Sans', sans-serif" }}>{i + 1}</span>
													) : (
														<span className="text-text-muted" style={{ width: 18, fontFamily: "'DM Sans', sans-serif", fontSize: 12, flexShrink: 0, textAlign: "center" }}>{i + 1}</span>
													)}
													<div style={{ width: 64, height: 36, borderRadius: 6, flexShrink: 0, ...(v.thumbnail_url ? { backgroundImage: `url(${v.thumbnail_url})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: "linear-gradient(135deg,#1e3a5f,#0f2744)" }) }} />
													<p className="text-text-primary" style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.title}</p>
													{!isMobile && <>
														<span className="text-text-secondary" style={{ flex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{formatCount(v.views_count ?? 0)}</span>
														<span className="text-text-secondary" style={{ flex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{formatCount(v.likes_count ?? 0)}</span>
														<span className="text-text-secondary" style={{ flex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{formatCount(v.comments_count ?? 0)}</span>
														<span className="text-text-secondary" style={{ flex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{v.avg_view_duration_sec ? `${Math.floor(v.avg_view_duration_sec/60)}:${String(v.avg_view_duration_sec%60).padStart(2,"0")}` : "—"}</span>
													</>}
													<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
												</div>
											);
										})}
									</div>
								</>
							)}
						</div>

						<div className="border border-border" style={{ flex: 1, minWidth: isMobile ? "100%" : 240, background: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))", borderRadius: 18, boxShadow: "0 12px 34px var(--color-shadow)", padding: "20px 22px", animation: "fadeUp 0.35s ease 160ms both" }}>
							<h3 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Views by category</h3>
							{categoryBreakdown.length === 0 ? <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Not enough data yet.</p> : (
								<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
									<DonutChart segments={categoryBreakdown.map((c, i) => ({ label: c.category, value: c.views, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }))}
										hoveredIndex={hoveredCatIdx} onHoverIndex={setHoveredCatIdx}
										centerLabel="Total Views" centerValue={formatCount(categoryBreakdown.reduce((s, c) => s + c.views, 0))} />
									<div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
										{categoryBreakdown.map((c, i) => (
											<div key={c.category} onMouseEnter={() => setHoveredCatIdx(i)} onMouseLeave={() => setHoveredCatIdx(null)}
												style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", borderRadius: 8, background: hoveredCatIdx === i ? "var(--color-surface-raised)" : "transparent", cursor: "pointer", transition: "background 0.15s" }}>
												<span style={{ width: 9, height: 9, borderRadius: "50%", background: CATEGORY_COLORS[i % CATEGORY_COLORS.length], flexShrink: 0 }} />
												<span className="text-text-secondary" style={{ flex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{c.category}</span>
												<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>{formatCount(c.views)}</span>
											</div>
										))}
									</div>
								</div>
							)}
						</div>
					</div>

					{/* #272/#146: audience geography + device breakdown (viewer_country / device_type). */}
					{(geography.length > 0 || devices.length > 0) && (
						<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 20, marginBottom: 28 }}>
							<div className="border border-border" style={{ flex: 2, minWidth: 0, background: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))", borderRadius: 18, boxShadow: "0 12px 34px var(--color-shadow)", padding: "20px 22px", animation: "fadeUp 0.35s ease 180ms both" }}>
								<h3 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Top locations</h3>
								{geography.length === 0 ? <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>No location data yet.</p> : (
									<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
										{geography.map((g, i) => {
											const maxViews = geography[0]?.views || 1;
											const pct = maxViews > 0 ? Math.max(3, (g.views / maxViews) * 100) : 0;
											return (
												<div key={g.country} onMouseEnter={() => setHoveredGeoIdx(i)} onMouseLeave={() => setHoveredGeoIdx(null)} style={{ display: "flex", alignItems: "center", gap: 12 }}>
													<span className="text-text-secondary" style={{ width: 90, flexShrink: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.country}</span>
													<div className="bg-surface-raised" style={{ flex: 1, height: 8, borderRadius: 5, overflow: "hidden" }}>
														<div style={{ width: `${pct}%`, height: "100%", borderRadius: 5, background: hoveredGeoIdx === i ? "#60a5fa" : "#2563eb", transition: "width 0.6s ease, background 0.15s" }} />
													</div>
													<span className="text-text-primary" style={{ width: 52, flexShrink: 0, textAlign: "right", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>{formatCount(g.views)}</span>
												</div>
											);
										})}
									</div>
								)}
							</div>

							<div className="border border-border" style={{ flex: 1, minWidth: isMobile ? "100%" : 240, background: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))", borderRadius: 18, boxShadow: "0 12px 34px var(--color-shadow)", padding: "20px 22px", animation: "fadeUp 0.35s ease 220ms both" }}>
								<h3 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Devices</h3>
								{devices.length === 0 ? <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>No device data yet.</p> : (
									<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
										<DonutChart segments={devices.map((d, i) => ({ label: d.device, value: d.views, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }))}
											hoveredIndex={hoveredDevIdx} onHoverIndex={setHoveredDevIdx}
											centerLabel="Total Views" centerValue={formatCount(devices.reduce((s, d) => s + d.views, 0))} />
										<div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
											{devices.map((d, i) => (
												<div key={d.device} onMouseEnter={() => setHoveredDevIdx(i)} onMouseLeave={() => setHoveredDevIdx(null)}
													style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", borderRadius: 8, background: hoveredDevIdx === i ? "var(--color-surface-raised)" : "transparent", cursor: "pointer", transition: "background 0.15s" }}>
													<span style={{ width: 9, height: 9, borderRadius: "50%", background: CATEGORY_COLORS[i % CATEGORY_COLORS.length], flexShrink: 0 }} />
													<span className="text-text-secondary" style={{ flex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 12, textTransform: "capitalize" }}>{d.device}</span>
													<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>{formatCount(d.views)}</span>
												</div>
											))}
										</div>
									</div>
								)}
							</div>
						</div>
					)}
				</>
			)}

			{selectedVid && (
				// Modal scrim — stays a dark dimming overlay regardless of theme (consistent with
				// every other modal backdrop in the app).
				<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setSelectedVid(null)}>
					<div onClick={e => e.stopPropagation()} className="bg-surface border border-border" style={{ width: "min(720px, 100%)", maxHeight: "85vh", overflowY: "auto", borderRadius: 20, padding: 28, animation: "fadeUp 0.25s ease both" }}>
						<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
							<div style={{ display: "flex", gap: 14 }}>
								<div style={{ width: 100, height: 56, borderRadius: 8, flexShrink: 0, ...(selectedVid.thumbnail_url ? { backgroundImage: `url(${selectedVid.thumbnail_url})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: "linear-gradient(135deg,#1e3a5f,#0f2744)" }) }} />
								<div>
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{selectedVid.title}</p>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{selectedVid.published_at ? timeAgo(selectedVid.published_at) : ""}</p>
								</div>
							</div>
							<button onClick={() => setSelectedVid(null)} className="bg-surface-raised border border-border text-text-secondary" style={{ width: 30, height: 30, borderRadius: "50%", cursor: "pointer", flexShrink: 0 }}>×</button>
						</div>
						{vidLoading ? <Skel w="100%" h={180} r={12} /> : !vidAnalytics ? (
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Couldn't load this video's analytics — check the console.</p>
						) : (
							<>
								<div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
									<KpiCard label="Views" value={formatCount(vidAnalytics.summary?.views ?? 0)} accent="#2563eb" />
									<KpiCard label="Watch time" value={vidAnalytics.summary?.has_watch_time_data ? formatWatchTime((vidAnalytics.summary?.total_watch_time_sec ?? 0) / 60) : "—"} accent="#7c3aed" />
									<KpiCard label="Likes" value={formatCount(vidAnalytics.summary?.likes ?? 0)} accent="#ef4444" />
									<KpiCard label="Comments" value={formatCount(vidAnalytics.summary?.comments ?? 0)} accent="#7c3aed" />
									<KpiCard label="Avg. % watched" value={vidAnalytics.summary?.retention_pct != null ? `${Math.round(vidAnalytics.summary.retention_pct)}%` : "—"} accent="#4ade80" />
								</div>
								<TrendChart data={vidAnalytics.timeseries ?? []} metric="views" color="#2563eb" height={160} />
								{/* Per-video audience geography + device mix (#146). */}
								{(vidAnalytics.has_geo_data || vidAnalytics.has_device_data) && (
									<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 16, marginTop: 22 }}>
										{(vidAnalytics.geography ?? []).length > 0 && (
											<div style={{ flex: 2, minWidth: 0 }}>
												<h4 className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Top locations</h4>
												<div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
													{(vidAnalytics.geography ?? []).slice(0, 6).map((g) => {
														const maxViews = vidAnalytics.geography[0]?.views || 1;
														const pct = maxViews > 0 ? Math.max(3, (g.views / maxViews) * 100) : 0;
														return (
															<div key={g.country} style={{ display: "flex", alignItems: "center", gap: 10 }}>
																<span className="text-text-secondary" style={{ width: 80, flexShrink: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.country}</span>
																<div className="bg-surface-raised" style={{ flex: 1, height: 7, borderRadius: 5, overflow: "hidden" }}>
																	<div style={{ width: `${pct}%`, height: "100%", borderRadius: 5, background: "#2563eb", transition: "width 0.6s ease" }} />
																</div>
																<span style={{ width: 44, flexShrink: 0, textAlign: "right", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>{g.pct != null ? `${g.pct}%` : formatCount(g.views)}</span>
															</div>
														);
													})}
												</div>
											</div>
										)}
										{(vidAnalytics.devices ?? []).length > 0 && (
											<div style={{ flex: 1, minWidth: isMobile ? "100%" : 200 }}>
												<h4 className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Devices</h4>
												<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
													{(vidAnalytics.devices ?? []).map((d, i) => (
														<div key={d.device} style={{ display: "flex", alignItems: "center", gap: 8 }}>
															<span style={{ width: 9, height: 9, borderRadius: "50%", background: CATEGORY_COLORS[i % CATEGORY_COLORS.length], flexShrink: 0 }} />
															<span className="text-text-secondary" style={{ flex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 12, textTransform: "capitalize" }}>{d.device}</span>
															<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>{d.pct != null ? `${d.pct}%` : formatCount(d.views)}</span>
														</div>
													))}
												</div>
											</div>
										)}
									</div>
								)}
								{/* Quick action — jump to the public watch page (#134). */}
								<div style={{ marginTop: 22, display: "flex", justifyContent: "flex-end" }}>
									<a href={`/v/${selectedVid.video_id}`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#2563eb", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, padding: "9px 16px", borderRadius: 10, textDecoration: "none" }}>
										<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
										Go to video
									</a>
								</div>
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
