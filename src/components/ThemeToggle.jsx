import React from "react";
import { useTheme } from "../utils/theme.js";

// A compact light/dark switch, matching DistanceUnitToggle's visual pattern. Uses the
// theme CSS variables (index.css) so it reads correctly regardless of which theme is active.
export default function ThemeToggle({ style }) {
	const [theme, setTheme] = useTheme();

	const btn = (t) => ({
		background: theme === t ? "rgba(37,99,235,0.35)" : "transparent",
		border: "none",
		borderRadius: 7,
		padding: "3px 9px",
		fontFamily: "'DM Sans', sans-serif",
		fontSize: 11,
		fontWeight: 700,
		cursor: "pointer",
		transition: "background 0.2s ease",
	});
	const btnClassName = (t) => (theme === t ? "text-text-primary" : "text-text-secondary");

	return (
		<div
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 2,
				background: "var(--color-surface)",
				border: "1px solid var(--color-border)",
				borderRadius: 9,
				padding: 2,
				...style,
			}}
		>
			<button type="button" className={btnClassName("dark")} style={btn("dark")} onClick={() => setTheme("dark")}>Dark</button>
			<button type="button" className={btnClassName("light")} style={btn("light")} onClick={() => setTheme("light")}>Light</button>
		</div>
	);
}
