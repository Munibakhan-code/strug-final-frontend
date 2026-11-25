// Light/dark theme preference. Persisted and broadcast so every component reacts together
// when it's toggled (see ThemeToggle.jsx) — same pattern as utils/units.js.
// The `data-theme` attribute this writes to <html> is what src/index.css's CSS variables
// key off of; index.html applies it once synchronously on load to avoid a flash of the
// wrong theme before React mounts.

import { useEffect, useState } from "react";

const KEY = "strug_theme";
const EVENT = "strug:theme";
const DARK_META_COLOR = "#0a0a0e";
const LIGHT_META_COLOR = "#f6f6f8";

function applyTheme(theme) {
	if (typeof document === "undefined") return;
	if (theme === "light") {
		document.documentElement.setAttribute("data-theme", "light");
	} else {
		document.documentElement.removeAttribute("data-theme");
	}
	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute("content", theme === "light" ? LIGHT_META_COLOR : DARK_META_COLOR);
}

export function getTheme() {
	try {
		return localStorage.getItem(KEY) === "light" ? "light" : "dark";
	} catch {
		return "dark";
	}
}

export function setTheme(theme) {
	const next = theme === "light" ? "light" : "dark";
	try {
		localStorage.setItem(KEY, next);
	} catch {
		/* ignore */
	}
	applyTheme(next);
	if (typeof window !== "undefined") {
		window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
	}
	return next;
}

/** React hook: `[theme, setTheme]`, staying in sync across components via the window event. */
export function useTheme() {
	const [theme, setThemeState] = useState(getTheme);
	useEffect(() => {
		const handler = (e) => setThemeState(e.detail === "light" ? "light" : "dark");
		const storage = (e) => { if (e.key === KEY) setThemeState(getTheme()); };
		window.addEventListener(EVENT, handler);
		window.addEventListener("storage", storage);
		return () => {
			window.removeEventListener(EVENT, handler);
			window.removeEventListener("storage", storage);
		};
	}, []);
	return [theme, setTheme];
}
