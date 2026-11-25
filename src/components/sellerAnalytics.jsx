// Generic seller analytics panel — the polished KPI/chart system from the Creator
// Studio (creatorAnalytics.jsx), generalised so every "become" vertical (Food vendor,
// rideshare Driver, Shop seller, Creator earnings) renders the same design over its own
// /analytics/overview endpoint. Reuses KpiCard / TrendChart / DonutChart so the look is
// byte-identical to the video analytics; only the data + labels differ.
//
// Backend shape consumed:
//   { range, currency, summary:{ gross, gross_change_pct, net, net_change_pct, count,
//     count_change_pct, avg_order_value, total_distance_km? },
//     timeseries:[{ date, gross, net, count }], breakdown:[{ label, value }],
//     top:[{ id, title, subtitle, gross, net, count }] }
//
// Gross vs Net is surfaced two ways: both are always shown as KPI cards, and the trend
// chart + top table toggle between Revenue / Net / count via the metric buttons.
import { useEffect, useMemo, useState } from "react";
import { KpiCard, TrendChart, DonutChart, RANGE_OPTIONS } from "./creatorAnalytics.jsx";
import { SegmentedControl } from "./providerKit.jsx";
import { formatCount } from "../utils/format.js";
import { fmtMoney } from "../utils/regionConfig.js";
import { Skel } from "./skeletons.jsx";

const SEG_COLORS = ["#2563eb", "#7c3aed", "#059669", "#dc2626", "#d97706", "#db2777", "#0891b2", "#65a30d", "#f59e0b", "#0d9488"];

// Money figures from the API are in the platform base currency (CAD). regionConfig.fmtMoney
// converts CAD → the user's resolved display currency (from their country, via live FX) and
// formats with the right symbol/locale — same as the rest of the app. Display-only: charges
// still settle in CAD. So every money value here is country-dynamic automatically.

const METRIC_COLOR = { gross: "#2563eb", net: "#4ade80", count: "#7c3aed" };

// Tone → accent colour for the Performance metric cards (reliability / rating stats).
const TONE_COLOR = { good: "#4ade80", warn: "#f59e0b", bad: "#ef4444", neutral: "#60a5fa" };

// Format a Performance-metric value per its `format` hint. null/undefined → "—" (no data).
function formatMetric(value, format) {
	if (value == null || (typeof value === "number" && Number.isNaN(value))) return "—";
	switch (format) {
		case "rating": return `${Number(value).toFixed(1)}★`;
		case "pct": return `${Number(value).toFixed(1)}%`;
		case "money": return fmtMoney(value);
		case "distance": return `${Number(value).toFixed(1)} km`;
		case "duration": { // minutes → "Xm" or "Hh Mm"
			const m = Math.round(Number(value));
			return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
		}
		case "count": return formatCount(Math.round(Number(value)));
		case "nights": return `${Number(value).toFixed(1)} ${Number(value) === 1 ? "night" : "nights"}`;
		default: return String(value);
	}
}

// Optional reliability/rating stat grid rendered above the KPI cards when the endpoint
// returns a `metrics` array (driver, on-demand worker, courier). Each metric:
//   { key, label, value, format, hint, tone }. A null value renders a muted "—".
function PerformanceMetrics({ metrics }) {
	if (!metrics?.length) return null;
	return (
		<div style={{ marginBottom: 28, animation: "fadeUp 0.35s ease 20ms both" }}>
			<h3 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Performance</h3>
			<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
				{metrics.map((m) => {
					const accent = TONE_COLOR[m.tone] || TONE_COLOR.neutral;
					const noData = m.value == null;
					return (
						<div key={m.key || m.label} title={m.hint || ""} className="border border-border" style={{ background: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))", borderRadius: 16, boxShadow: "0 10px 26px var(--color-shadow)", padding: "14px 16px", position: "relative", overflow: "hidden" }}>
							<span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: noData ? "var(--color-border)" : accent }} />
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }}>{m.label}</p>
							<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, color: noData ? "var(--color-text-muted)" : accent, margin: "3px 0 0", lineHeight: 1.1 }}>{formatMetric(m.value, m.format)}</p>
							{m.hint && <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "4px 0 0", lineHeight: 1.4 }}>{m.hint}</p>}
						</div>
					);
				})}
			</div>
		</div>
	);
}

/**
 * @param {(range:string)=>Promise<any>} fetchOverview  stable (module-level) fetcher
 * @param {string}  countLabel       label for the per-event count (e.g. "Orders", "Trips")
 * @param {string}  topTitle         heading for the top table ("Top products"); pass "" to hide
 * @param {string}  breakdownTitle   heading for the donut ("Orders by status"); pass "" to hide
 * @param {string}  netLabel         label for the net KPI card (default "Net earnings")
 * @param {string}  grossLabel       label for the gross KPI card (default "Gross sales")
 * @param {string}  revenueNote      optional one-liner under KPIs clarifying what counts as revenue
 * @param {string}  emptyHint        message shown when there's no data in range
 */
export function SellerAnalyticsPanel({
	fetchOverview, isMobile = false, accentColor = "#2563eb",
	countLabel = "Orders", topTitle = "Top products", breakdownTitle = "Orders by status",
	netLabel = "Net earnings", grossLabel = "Gross sales", revenueNote = "",
	emptyHint = "Earnings will appear here as orders come in.",
}) {
	const [range, setRange] = useState("28d");
	const [loading, setLoading] = useState(true);
	const [errored, setErrored] = useState(false);
	const [data, setData] = useState(null);
	const [metric, setMetric] = useState("gross");
	const [hoverSeg, setHoverSeg] = useState(null);
	const [reloadToken, setReloadToken] = useState(0);

	useEffect(() => {
		let alive = true;
		setLoading(true); setErrored(false);
		fetchOverview(range)
			.then(res => { if (alive) { setData(res?.data ?? res ?? null); setErrored(false); } })
			.catch(err => { console.error("seller analytics failed:", err?.response?.status, err?.response?.data || err.message); if (alive) { setErrored(true); setData(null); } })
			.finally(() => { if (alive) setLoading(false); });
		return () => { alive = false; };
	}, [range, fetchOverview, reloadToken]);

	const summary = data?.summary ?? {};
	const timeseries = data?.timeseries ?? [];
	const breakdown = data?.breakdown ?? [];
	const top = data?.top ?? [];
	const perfMetrics = data?.metrics ?? [];

	const grossSpark = useMemo(() => timeseries.map(d => d.gross ?? 0), [timeseries]);
	const netSpark = useMemo(() => timeseries.map(d => d.net ?? 0), [timeseries]);
	const countSpark = useMemo(() => timeseries.map(d => d.count ?? 0), [timeseries]);
	const hasAnyData = useMemo(() => {
		if (timeseries.some((d) => (d.gross ?? 0) || (d.net ?? 0) || (d.count ?? 0))) return true;
		if ((summary.gross ?? 0) || (summary.net ?? 0) || (summary.count ?? 0)) return true;
		if (breakdown.some((b) => (b.value ?? 0) > 0)) return true;
		if (top.some((t) => (t.gross ?? 0) || (t.net ?? 0) || (t.count ?? 0))) return true;
		return false;
	}, [timeseries, summary.gross, summary.net, summary.count, breakdown, top]);

	const metricColor = METRIC_COLOR[metric];
	const rangeLabel = RANGE_OPTIONS.find(r => r.id === range)?.label.toLowerCase();
	const isLifetime = range === "lifetime";
	// Lifetime KPI totals are all-time, but API % deltas compare last 365d vs prior 365d.
	// Hide those %s so we never imply "vs the previous lifetime."
	const showPeriodDelta = hasAnyData && !isLifetime;
	const grossDelta = showPeriodDelta ? summary.gross_change_pct : null;
	const netDelta = showPeriodDelta ? summary.net_change_pct : null;
	const countDelta = showPeriodDelta ? summary.count_change_pct : null;
	// Donut center must match legend sum (includes cancelled). summary.count is paid
	// non-cancelled only — using it for the center made e.g. 2 in the middle while slices summed to 3.
	const breakdownTotal = breakdown.reduce((s, b) => s + (Number(b.value) || 0), 0);
	const paidCount = summary.count != null ? Number(summary.count) : null;
	const paidDiffersFromBreakdown = paidCount != null && paidCount !== breakdownTotal;

	return (
		<div>
			<div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
				<SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} accentColor={accentColor} />
			</div>

			{loading ? (
				<div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>{[...Array(4)].map((_, i) => <Skel key={i} w={220} h={104} r={16} />)}</div>
			) : errored ? (
				<div className="border border-border" style={{ background: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))", borderRadius: 18, boxShadow: "0 12px 34px var(--color-shadow)", padding: "40px 24px", textAlign: "center", marginBottom: 28 }}>
					<svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10 }}><path d="M3 3v18h18"/><path d="M7 16l4-6 4 3 5-8"/></svg>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Couldn't load analytics</p>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 16 }}>The server may be down or your connection dropped. You can retry without leaving this tab.</p>
					<button type="button" onClick={() => setReloadToken((n) => n + 1)}
						style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#fff", background: accentColor, border: "none", borderRadius: 10, padding: "10px 18px", cursor: "pointer" }}>
						Retry
					</button>
				</div>
			) : !data ? (
				<div className="border border-border" style={{ background: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))", borderRadius: 18, boxShadow: "0 12px 34px var(--color-shadow)", padding: "40px 24px", textAlign: "center", marginBottom: 28 }}>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>No analytics yet</p>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{emptyHint}</p>
				</div>
			) : (
				<>
					{isLifetime && hasAnyData ? (
						<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, padding: "12px 18px", borderRadius: 14, animation: "fadeUp 0.35s ease both",
							background: "var(--color-surface-raised)", border: "1px solid var(--color-border)" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0, lineHeight: 1.45 }}>
								KPI totals below are <strong className="text-text-primary">all-time</strong>. Period-over-period % change is hidden on Lifetime — switch to <strong className="text-text-primary">1 year</strong> to compare the last 12 months vs the prior 12 months.
							</p>
						</div>
					) : grossDelta != null && hasAnyData ? (
						<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, padding: "12px 18px", borderRadius: 14, animation: "fadeUp 0.35s ease both",
							background: grossDelta >= 0 ? "linear-gradient(135deg, rgba(74,222,128,0.12), rgba(37,99,235,0.07))" : "var(--color-surface-raised)",
							border: `1px solid ${grossDelta >= 0 ? "rgba(74,222,128,0.25)" : "var(--color-border)"}` }}>
							<span style={{ width: 30, height: 30, borderRadius: "50%", background: grossDelta >= 0 ? "rgba(74,222,128,0.18)" : "var(--color-surface-raised)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
								<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={grossDelta >= 0 ? "#4ade80" : "var(--color-text-secondary)"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
							</span>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>
								{grossDelta >= 0
									? <>Gross sales are up <strong style={{ color: "#4ade80" }}>{grossDelta.toFixed(1)}%</strong> vs the previous {rangeLabel}.</>
									: <>Gross sales dipped <strong style={{ color: "#ef4444" }}>{Math.abs(grossDelta).toFixed(1)}%</strong> vs the previous {rangeLabel}.</>}
							</p>
						</div>
					) : null}

					<PerformanceMetrics metrics={perfMetrics} />

					<div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: revenueNote ? 12 : 28, animation: "fadeUp 0.35s ease 40ms both" }}>
						<KpiCard label={grossLabel} countTo={summary.gross ?? 0} formatValue={fmtMoney} delta={grossDelta} accent="#2563eb" sparkline={grossSpark}
							icon={<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>} />
						<KpiCard label={netLabel} countTo={summary.net ?? 0} formatValue={fmtMoney} delta={netDelta} accent="#4ade80" sparkline={netSpark}
							icon={<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12V8H6a2 2 0 010-4h12v4"/><path d="M4 6v12a2 2 0 002 2h14v-4"/><path d="M18 12a2 2 0 000 4h4v-4z"/></svg>} />
						<KpiCard label={countLabel} countTo={summary.count ?? 0} formatValue={v => formatCount(Math.round(v))} delta={countDelta} accent="#7c3aed" sparkline={countSpark}
							icon={<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>} />
						<KpiCard label="Avg. order (gross)" countTo={summary.avg_order_value ?? 0} formatValue={fmtMoney} accent="#f59e0b"
							icon={<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-6 4 3 5-8"/></svg>} />
					</div>
					{revenueNote ? (
						<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 28px", lineHeight: 1.45 }}>
							{revenueNote}
						</p>
					) : null}

					{!hasAnyData ? (
						<div className="border border-border" style={{ background: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))", borderRadius: 18, boxShadow: "0 12px 34px var(--color-shadow)", padding: "36px 24px", textAlign: "center", marginBottom: 8, animation: "fadeUp 0.35s ease 80ms both" }}>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>No activity in this range</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0, maxWidth: 420, marginInline: "auto", lineHeight: 1.45 }}>
								{emptyHint} Try a longer range above if you expect older {countLabel.toLowerCase()}.
							</p>
						</div>
					) : (
					<>
					<div className="border border-border" style={{ background: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))", borderRadius: 18, boxShadow: "0 12px 34px var(--color-shadow)", padding: "20px 22px", marginBottom: 28, animation: "fadeUp 0.35s ease 80ms both" }}>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
							<h3 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15 }}>Performance over time</h3>
							<SegmentedControl
								options={[{ id: "gross", label: "Gross", color: METRIC_COLOR.gross }, { id: "net", label: "Net", color: METRIC_COLOR.net }, { id: "count", label: countLabel, color: METRIC_COLOR.count }]}
								value={metric} onChange={setMetric} size="sm"
							/>
						</div>
						{data.timezone && (
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "0 0 8px" }}>
								Daily totals use your local calendar ({data.timezone}), not UTC midnight.
							</p>
						)}
						<TrendChart data={timeseries} metric={metric} color={metricColor} height={isMobile ? 180 : 240}
							formatValue={metric === "count" ? (v => formatCount(Math.round(v))) : (v => fmtMoney(v))} />
					</div>

					{(topTitle || breakdownTitle) && (
						<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 20, marginBottom: 28 }}>
							{topTitle && (
								<div className="border border-border" style={{ flex: 2, minWidth: 0, background: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))", borderRadius: 18, boxShadow: "0 12px 34px var(--color-shadow)", padding: "20px 22px", animation: "fadeUp 0.35s ease 120ms both" }}>
									<h3 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 16 }}>{topTitle}</h3>
									{top.length === 0 ? <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>No sales in this range yet.</p> : (
										<>
											{!isMobile && (
												<div style={{ display: "flex", gap: 16, marginBottom: 10, paddingLeft: 38 }}>
													<span style={{ flex: 2 }} />
													<span className="text-text-muted" style={{ flex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Gross</span>
													<span className="text-text-muted" style={{ flex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Est. net</span>
												</div>
											)}
											<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
												{top.map((t, i) => {
													const maxVal = top[0]?.gross ?? 1;
													const barPct = maxVal > 0 ? Math.max(4, ((t.gross ?? 0) / maxVal) * 100) : 0;
													const medalColors = ["#f59e0b", "#cbd5e1", "#b45309"];
													return (
														<div key={t.id ?? i} style={{ position: "relative", display: "flex", alignItems: "center", gap: 14, padding: "10px 8px", borderRadius: 10, overflow: "hidden" }}>
															<div style={{ position: "absolute", left: 0, bottom: 0, height: 2, width: `${barPct}%`, background: i < 3 ? medalColors[i] : accentColor, opacity: 0.5, transition: "width 0.6s ease" }} />
															{i < 3 ? (
																<span style={{ width: 18, height: 18, borderRadius: "50%", background: `${medalColors[i]}22`, border: `1px solid ${medalColors[i]}55`, color: medalColors[i], fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "'DM Sans', sans-serif" }}>{i + 1}</span>
															) : (
																<span className="text-text-muted" style={{ width: 18, fontFamily: "'DM Sans', sans-serif", fontSize: 12, flexShrink: 0, textAlign: "center" }}>{i + 1}</span>
															)}
															<div style={{ flex: 2, minWidth: 0 }}>
																<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</p>
																{t.subtitle && <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{t.subtitle}</p>}
															</div>
															{!isMobile && <>
																<span className="text-text-primary" style={{ flex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>{fmtMoney(t.gross)}</span>
																<span className="text-text-secondary" style={{ flex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{fmtMoney(t.net)}</span>
															</>}
															{isMobile && <span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>{fmtMoney(t.gross)}</span>}
														</div>
													);
												})}
											</div>
										</>
									)}
								</div>
							)}

							{breakdownTitle && (
								<div className="border border-border" style={{ flex: 1, minWidth: isMobile ? "100%" : 240, background: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))", borderRadius: 18, boxShadow: "0 12px 34px var(--color-shadow)", padding: "20px 22px", animation: "fadeUp 0.35s ease 160ms both" }}>
									<h3 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 16 }}>{breakdownTitle}</h3>
									{breakdown.length === 0 ? <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Not enough data yet.</p> : (
										<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
											<DonutChart segments={breakdown.map((b, i) => ({ label: b.label, value: b.value, color: SEG_COLORS[i % SEG_COLORS.length] }))}
												hoveredIndex={hoverSeg} onHoverIndex={setHoverSeg}
												centerLabel="All statuses" centerValue={formatCount(breakdownTotal)} />
											<div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
												{breakdown.map((b, i) => (
													<div key={b.label} onMouseEnter={() => setHoverSeg(i)} onMouseLeave={() => setHoverSeg(null)}
														style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", borderRadius: 8, background: hoverSeg === i ? "var(--color-surface-raised)" : "transparent", cursor: "pointer", transition: "background 0.15s" }}>
														<span style={{ width: 9, height: 9, borderRadius: "50%", background: SEG_COLORS[i % SEG_COLORS.length], flexShrink: 0 }} />
														<span className="text-text-secondary" style={{ flex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 12, textTransform: "capitalize" }}>{b.label}</span>
														<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>{formatCount(b.value)}</span>
													</div>
												))}
											</div>
											{paidDiffersFromBreakdown && (
												<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0, textAlign: "center", lineHeight: 1.4 }}>
													{countLabel} KPI counts paid (non-cancelled) only: {formatCount(paidCount)}.
												</p>
											)}
										</div>
									)}
								</div>
							)}
						</div>
					)}
					</>
					)}

					{data.customers && data.customers.total_customers > 0 ? (
						<div className="border border-border" style={{ background: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))", borderRadius: 18, boxShadow: "0 12px 34px var(--color-shadow)", padding: "20px 22px", marginBottom: 28, animation: "fadeUp 0.35s ease 200ms both" }}>
							<div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
								<h3 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15 }}>Customers (all time)</h3>
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
									{data.customers.avg_orders_per_customer != null ? `${data.customers.avg_orders_per_customer} avg orders` : "—"}
									{" · "}
									{data.customers.avg_ltv != null ? `${fmtMoney(data.customers.avg_ltv)} avg lifetime value` : "—"}
								</span>
							</div>
							<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 12 }}>
								{[
									{ label: "Total customers", value: data.customers.total_customers, color: "#94a3b8", hint: "Unique buyers with a completed order, all time" },
									{ label: "New (30d)", value: data.customers.new_customers, color: "#4ade80", hint: "First completed order in the last 30 days (fixed window, not the range pill)" },
									{ label: "Lifetime returning", value: data.customers.returning_customers, color: "#2563eb", hint: data.customers.repeat_rate_pct != null ? `${data.customers.repeat_rate_pct}% ordered 2+ times (lifetime)` : "Ordered 2+ times (lifetime)" },
									{ label: "VIP", value: data.customers.vip_customers, color: "#f59e0b", hint: "Top 10% by lifetime spend" },
									{ label: "At-risk", value: data.customers.lapsed_customers, color: "#fb923c", hint: "No completed order in 30–90 days" },
									{ label: "Churned", value: data.customers.churned_customers, color: "#ef4444", hint: "No completed order in 90+ days" },
									{ label: "One-and-done", value: data.customers.one_and_done, color: "#a78bfa", hint: "Ordered once, never returned" },
									{ label: "Active (30d)", value: data.customers.active_customers, color: "#22d3ee", hint: "Completed order within the last 30 days" },
								].map((s) => (
									<div key={s.label} title={s.hint} className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 12, padding: "12px 14px" }}>
										<div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
											<span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
											<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</span>
										</div>
										<span className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 26, lineHeight: 1 }}>
											{s.value == null ? "—" : formatCount(s.value)}
										</span>
										<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "6px 0 0" }}>{s.hint}</p>
									</div>
								))}
							</div>
						</div>
					) : hasAnyData ? (
						<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", marginBottom: 20 }}>
							Customer segments appear after you have completed (delivered / picked-up) orders.
						</p>
					) : null}
				</>
			)}
		</div>
	);
}
