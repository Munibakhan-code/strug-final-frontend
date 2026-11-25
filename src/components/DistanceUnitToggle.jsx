import React from "react";

// A compact km ⇄ mi switch. The choice is persisted + broadcast (see utils/units.js) so
// every distance readout across the app updates together. Shared by rideshare + on-demand.
export default function DistanceUnitToggle({ unit, onChange, style }) {
	const btn = (u) => ({
		// active tint is a fixed blue-alpha overlay, so text must flip with the surface behind it
		// (same white-on-pale-tint contrast fix used across the other dropdown/toggle controls).
		background: unit === u ? "rgba(37,99,235,0.35)" : "transparent",
		border: "none",
		borderRadius: 7,
		padding: "3px 9px",
		fontFamily: "'DM Sans', sans-serif",
		fontSize: 11,
		fontWeight: 700,
		cursor: "pointer",
	});
	const btnClass = (u) => (unit === u ? "text-text-primary" : "text-text-secondary");
	return (
		<div style={{ display: "inline-flex", alignItems: "center", gap: 2, background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 9, padding: 2, ...style }}>
			<button type="button" className={btnClass("km")} style={btn("km")} onClick={() => onChange("km")}>km</button>
			<button type="button" className={btnClass("mi")} style={btn("mi")} onClick={() => onChange("mi")}>mi</button>
		</div>
	);
}
