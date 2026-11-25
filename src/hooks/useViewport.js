import { useState, useEffect } from "react";

const RESIZE_DEBOUNCE_MS = 120;
export const MOBILE_MAX = 767;
const DESKTOP_WIDE_MIN = 1024;

const _listeners = new Set();
let _width = typeof window !== "undefined" ? window.innerWidth : 1200;

function publishWidth(next) {
	if (next === _width) return;
	_width = next;
	_listeners.forEach((fn) => fn(_width));
}

if (typeof window !== "undefined") {
	let _debounceTimer;
	window.addEventListener(
		"resize",
		() => {
			clearTimeout(_debounceTimer);
			_debounceTimer = setTimeout(() => publishWidth(window.innerWidth), RESIZE_DEBOUNCE_MS);
		},
		{ passive: true },
	);
}

export function useViewport() {
	const [width, setWidth] = useState(_width);
	useEffect(() => {
		_listeners.add(setWidth);
		return () => _listeners.delete(setWidth);
	}, []);
	return {
		width,
		isMobile: width <= MOBILE_MAX,
		isTablet: width > MOBILE_MAX && width < DESKTOP_WIDE_MIN,
		/** Side-by-side map + trip panel (desktop rideshare map, etc.) */
		isDesktopWide: width >= DESKTOP_WIDE_MIN,
	};
}
