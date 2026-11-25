import React, { useMemo } from "react";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { PortfolioIcon, SearchIcon } from "../components/icons.jsx";
import { Skel, SkeletonProductCard, SkeletonHeading } from "../components/skeletons.jsx";
import { LeoButton } from "../components/shared.jsx";

function PortfolioPage() {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("portfolio");
const { isMobile } = useViewport();
	const loading = usePageLoad(150);

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ padding: "28px 32px 20px" }}>
				<SkeletonHeading />
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginTop: 8 }}>{t("common.loading")}</p>
			</div>
			<div style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: "0 32px 32px" }}>
				{[...Array(8)].map((_,i) => <Skel key={i} w={220} h={280} r={14} />)}
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden", position: "relative" }}>
			{/* Blurred grid content underneath */}
			<div style={{ flex: 1, filter: "blur(6px)", opacity: 0.35, pointerEvents: "none", display: "flex", flexWrap: "wrap", gap: 16, padding: "40px 32px", alignContent: "flex-start" }}>
				{[...Array(12)].map((_, i) => (
					<div key={i} style={{ width: 220, height: 280, borderRadius: 14, background: `linear-gradient(135deg, hsl(${i * 30}, 40%, 15%), hsl(${i * 30 + 30}, 30%, 8%))`, flexShrink: 0 }} />
				))}
			</div>
			{/* Overlay — a "coming soon" spotlight scrim over the blurred product-card backdrop below,
			    same treatment as Hub's photo hero: intentionally dark in both themes for legibility. */}
			<div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(6,8,16,0.55)", backdropFilter: "blur(2px)" }}>
				<div style={{ width: "min(480px, 90%)", marginBottom: 24, opacity: 0.5, pointerEvents: "none" }}>
					<div className="od-search-wrap" style={{ width: "100%" }}>
						<div className="od-search-inner" style={{ background: "rgba(14,12,20,0.92)", display: "flex", alignItems: "center", padding: "12px 16px", gap: 10 }}>
							<div style={{ color: "rgba(255,255,255,0.55)" }}><SearchIcon s={16} /></div>
							<span style={{ flex: 1, color: "rgba(255,255,255,0.35)", fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>{t("common.search")}: {searchPlaceholder}</span>
						</div>
					</div>
				</div>
				<div style={{ textAlign: "center", animation: "fadeUp 0.4s ease both" }}>
					<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "#2563eb", marginBottom: 14 }}>{t("portfolio.comingSoon")} · {t("portfolio.title")}</p>
					<h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(38px, 5vw, 68px)", color: "#fff", letterSpacing: "0.04em", textTransform: "uppercase", lineHeight: 1, marginBottom: 14 }}>{landingTitle}</h2>
					<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "clamp(18px, 2.5vw, 28px)", color: "#2563eb", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("portfolio.comingAugust")}</p>
					<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "rgba(255,255,255,0.55)", marginTop: 12 }}>{t("portfolio.showcaseSubtitle")}</p>
					<div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
						<button style={{ background: "#2563eb", border: "none", borderRadius: 10, padding: "11px 22px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "#fff", cursor: "default" }}>{t("portfolio.notifyMe")}</button>
						<button style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "11px 22px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "rgba(255,255,255,0.6)", cursor: "default" }}>{t("portfolio.browseCreative")}</button>
					</div>
				</div>
			</div>
		</div>
	);
}

export { PortfolioPage };
