import { createPortal } from "react-dom";
import i18n from "../../i18n";
import { useClosingTransition, glassBackdropStyle, glassPanelStyle, GLASS_PANEL_CLASS } from "../modalKit.jsx";

// "Lock the price, disclose the change" — shown whenever the price we displayed before
// a booking/checkout no longer matches what the server is authoritatively about to
// charge (a stale fare quote, a recalculated delivery fee, a courier quote that expired
// while the user was reviewing it). Requires an explicit confirm rather than silently
// charging the new number.
export default function PriceChangeModal({
	oldAmount,
	newAmount,
	currency = "CAD",
	reason,
	onConfirm,
	onCancel,
}) {
	const fmt = (n) => {
		try {
			return new Intl.NumberFormat(i18n.language || "en", { style: "currency", currency }).format(n);
		} catch {
			return `$${Number(n).toFixed(2)}`;
		}
	};
	const went_up = Number(newAmount) > Number(oldAmount);
	const { closing, requestClose } = useClosingTransition();
	const close = (fn) => requestClose(() => fn?.());

	return createPortal((
		<div onClick={() => close(onCancel)} style={glassBackdropStyle(closing, { zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 })}>
			<div onClick={(e) => e.stopPropagation()} className={GLASS_PANEL_CLASS} style={glassPanelStyle(closing, { width: "min(380px, 100%)", borderRadius: 16, padding: "24px 22px" })}>
				<div style={{ width: 42, height: 42, borderRadius: "50%", background: went_up ? "rgba(239,68,68,0.15)" : "rgba(16,185,129,0.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
					<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={went_up ? "#f87171" : "#10b981"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<path d="M12 9v4M12 17h.01" />
						<circle cx="12" cy="12" r="9" />
					</svg>
				</div>
				<h2 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 17, fontWeight: 700, margin: "0 0 8px" }}>
					{i18n.t("pricing.priceChanged.title", { defaultValue: "The price changed" })}
				</h2>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "0 0 18px", lineHeight: 1.5 }}>
					{reason || i18n.t("pricing.priceChanged.body", { defaultValue: "This is different from what you were shown a moment ago." })}
				</p>
				<div className="bg-surface border border-border-subtle" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 10, padding: "12px 14px", marginBottom: 20 }}>
					<div>
						<div className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 2 }}>{i18n.t("pricing.priceChanged.before", { defaultValue: "You saw" })}</div>
						<div className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, textDecoration: "line-through" }}>{fmt(oldAmount)}</div>
					</div>
					<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
					<div style={{ textAlign: "right" }}>
						<div className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 2 }}>{i18n.t("pricing.priceChanged.now", { defaultValue: "Now" })}</div>
						<div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 17, fontWeight: 700, color: went_up ? "#f87171" : "#10b981" }}>{fmt(newAmount)}</div>
					</div>
				</div>
				<div style={{ display: "flex", gap: 10 }}>
					<button
						onClick={() => close(onCancel)}
						onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
						onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
						onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
						className="bg-surface border border-border text-text-primary"
						style={{ flex: 1, padding: "12px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "transform 0.12s ease, background 0.15s ease" }}
					>
						{i18n.t("pricing.priceChanged.cancel", { defaultValue: "Cancel" })}
					</button>
					<button
						onClick={() => close(onConfirm)}
						onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
						onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
						onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
						style={{ flex: 1, padding: "12px", background: "#2563eb", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "transform 0.12s ease, background 0.15s ease" }}
					>
						{i18n.t("pricing.priceChanged.confirm", { defaultValue: "Confirm at new price" })}
					</button>
				</div>
			</div>
		</div>
	), document.body);
}
