import React from "react";
import i18n from "../i18n/index.js";
import { useEventCart } from "../store/eventCart.js";

const ACCENT = "#f97316";

/**
 * Floating pill shown on Venues / Catering / Floral once the shared event cart has
 * at least one piece. Tapping it opens the one-checkout Shared Event page.
 * Mirrors the existing floating cart badge pattern (Floral.jsx).
 */
export function EventCartPill({ bottom }) {
	const { count, total } = useEventCart();
	if (!count) return null;
	return (
		<button
			type="button"
			onClick={() => window.__nav?.("event-plan")}
			style={{
				position: "fixed",
				bottom: bottom ?? 88,
				left: "50%",
				transform: "translateX(-50%)",
				zIndex: 55,
				display: "flex",
				alignItems: "center",
				gap: 12,
				padding: "12px 22px",
				background: ACCENT,
				border: "none",
				borderRadius: 50,
				color: "#fff",
				fontFamily: "'DM Sans', sans-serif",
				fontWeight: 700,
				fontSize: 14,
				cursor: "pointer",
				boxShadow: "0 8px 28px rgba(249,115,22,0.5)",
			}}
		>
			<span style={{ background: "rgba(255,255,255,0.22)", borderRadius: 20, padding: "2px 9px", fontSize: 12 }}>{count}/3</span>
			{i18n.t("event.pill", { defaultValue: "My event" })}
			<span>${(Number(total) || 0).toLocaleString()}</span>
		</button>
	);
}
