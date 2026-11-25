// Provider Dashboard Kit — the shared "premium" primitives that lift every seller/host/
// driver/vendor dashboard to the internal-dashboard quality bar WITHOUT borrowing the
// internal signatures (mono type, Abel display font, film-grain backdrop). Provider surfaces
// keep their own identity: Barlow Condensed headings, per-vertical accent colour, solid dark
// cards. This file is the single source of truth for that upgraded look.
//
// Consumed by SellerDashHeader / SellerStatCards in shared.jsx so the whole fleet upgrades at
// once. Individual dashboards can also import these directly for bespoke sections.
import React, { useState } from "react";

// ── Design tokens ──────────────────────────────────────────────────────────
const PK = {
	radius: 16,
	radiusPanel: 18,
	border: "1px solid var(--color-border-subtle)",
	borderHover: "var(--color-border)",
	cardFill: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))",
	panelFill: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))",
	shadow: "0 12px 34px var(--color-shadow)",
	shadowHover: "0 18px 44px var(--color-shadow)",
};

// Muted uppercase section label (e.g. "PERFORMANCE", "BEST SELLERS")
export function SectionEyebrow({ children, style }) {
	return (
		<div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--color-text-muted)", ...style }}>
			{children}
		</div>
	);
}

// Green/red change pill. Accepts a string like "+12.4%", "-0.1", "+5".
export function DeltaPill({ change }) {
	if (change == null || change === "") return null;
	const str = String(change).trim();
	const positive = !str.startsWith("-");
	const color = positive ? "#4ade80" : "#f87171";
	return (
		<span style={{
			display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0,
			fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color,
			background: `${color}22`, border: `1px solid ${color}47`,
			borderRadius: 20, padding: "3px 7px 3px 6px",
		}}>
			<svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: positive ? "none" : "rotate(180deg)" }}>
				<polyline points="18 15 12 9 6 15" />
			</svg>
			{str.replace(/^\+/, "")}
		</span>
	);
}

// Animated "Live" / status chip for the header top-right slot.
export function LivePill({ label = "Live", color = "#4ade80" }) {
	return (
		<span className="text-text-secondary bg-surface-raised border border-border" style={{
			display: "inline-flex", alignItems: "center", gap: 6,
			fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, fontWeight: 700,
			letterSpacing: "0.12em", textTransform: "uppercase",
			borderRadius: 20, padding: "6px 11px 6px 9px",
		}}>
			<span style={{ position: "relative", width: 7, height: 7 }}>
				<span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color }} />
				<span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, animation: "pkPing 1.6s cubic-bezier(0,0,0.2,1) infinite" }} />
			</span>
			{label}
		</span>
	);
}

// Grouped segmented control (range pickers, metric toggles). options: [{ id, label, color? }].
// The active segment fills with `accentColor` (or per-option color); inactive are quiet.
export function SegmentedControl({ options, value, onChange, accentColor = "#2563eb", size = "md" }) {
	const sm = size === "sm";
	return (
		<div className="bg-surface-raised border border-border" style={{ display: "inline-flex", flexWrap: "wrap", gap: 2, borderRadius: sm ? 10 : 12, padding: 3 }}>
			{options.map((opt) => {
				const active = value === opt.id;
				const accent = opt.color || accentColor;
				return (
					<button
						key={opt.id}
						onClick={() => onChange(opt.id)}
						style={{
							padding: sm ? "5px 12px" : "6px 13px", borderRadius: sm ? 7 : 9, border: "none",
							background: active ? accent : "transparent",
							// White text is safe here — the active fill is the opaque accent color
							// itself (not a translucent tint), so contrast holds in both themes.
							color: active ? "#fff" : "var(--color-text-secondary)",
							fontFamily: "'DM Sans', sans-serif", fontSize: sm ? 11 : 12, fontWeight: 600,
							cursor: "pointer", transition: "all 0.18s ease",
							boxShadow: active ? `0 2px 10px ${accent}66` : "none",
						}}
					>
						{opt.label}
					</button>
				);
			})}
		</div>
	);
}

// The upgraded KPI card. Backward-compatible with the old SellerStatCards shape
// ({ label, value, change }); `foot`, `icon` and `accentColor` are optional enrichments.
export function ProviderStatCard({ label, value, change, foot, icon, accentColor = "#2563eb", delay = 0 }) {
	const [hov, setHov] = useState(false);
	return (
		<div
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			style={{
				position: "relative", overflow: "hidden",
				background: PK.cardFill,
				border: `1px solid ${hov ? PK.borderHover : "var(--color-border-subtle)"}`,
				borderRadius: PK.radius, padding: "15px 17px 14px",
				boxShadow: hov ? PK.shadowHover : PK.shadow,
				transform: hov ? "translateY(-3px)" : "none",
				transition: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s, border-color 0.25s",
				animation: `fadeUp 0.3s ease ${delay}ms both`,
			}}
		>
			<div style={{ position: "absolute", left: 17, right: 17, top: 0, height: 2, borderRadius: 2, background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`, opacity: 0.55 }} />
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 11 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
					{icon && (
						<span style={{ width: 24, height: 24, borderRadius: 8, background: `${accentColor}29`, color: accentColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
							{icon}
						</span>
					)}
					<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
						{label}
					</span>
				</div>
				<DeltaPill change={change} />
			</div>
			<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 31, letterSpacing: "0.01em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
				{value}
			</p>
			{foot && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginTop: 8 }}>{foot}</p>}
		</div>
	);
}

// Titled section panel with the upgraded depth/border treatment. Optional eyebrow + right slot
// (e.g. a segmented range control). Use for chart/list sections inside dashboards.
export function ProviderPanel({ eyebrow, title, subtitle, right, children, style }) {
	return (
		<div style={{
			position: "relative", overflow: "hidden",
			background: PK.panelFill, border: PK.border, borderRadius: PK.radiusPanel,
			padding: "18px 20px 16px", boxShadow: "0 12px 34px var(--color-shadow)", ...style,
		}}>
			{(eyebrow || title || right) && (
				<div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
					<div style={{ minWidth: 0 }}>
						{eyebrow && <SectionEyebrow style={{ marginBottom: 6 }}>{eyebrow}</SectionEyebrow>}
						{title && <h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase", lineHeight: 1 }}>{title}</h3>}
						{subtitle && <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 4 }}>{subtitle}</p>}
					</div>
					{right && <div style={{ flexShrink: 0 }}>{right}</div>}
				</div>
			)}
			{children}
		</div>
	);
}
