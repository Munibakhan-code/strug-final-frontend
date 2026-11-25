import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useViewport } from "../../hooks/useViewport.js";

// Videos category navigation. Replaces the 56px photo-tile row (shared `LeoButton`) that used to
// render here: on a 375px phone the two flanking scroll arrows left the strip only 256px of usable
// width (~3 categories visible), the tiles cost 91px of vertical space before any video, and longer
// labels truncated ("Entertainme…"). This is a compact text-pill bar instead — full labels, one row,
// swipeable on touch, and arrows only when the row actually overflows on a pointer device.
//
// Deliberately local to Videos rather than a change to `LeoButton`: that component is shared by
// ~30 other vertical pages (Food, Books, Equipment, Floral, …), so restyling it there would
// redesign the whole app. The category data, ids, and `match` values are untouched — this component
// only renders `categories` and reports the picked id back through `onSelect`.

const ACCENT = "#2563eb"; // the accent Videos already uses throughout (46 occurrences in Videos.jsx)

/** Scroll `el` the minimum distance needed to bring `btn` fully into view. */
function revealInScroller(el, btn, behavior = "smooth") {
	if (!el || !btn) return;
	const pad = 12;
	const left = btn.offsetLeft;
	const right = left + btn.offsetWidth;
	let next = null;
	if (left < el.scrollLeft) next = Math.max(0, left - pad);
	else if (right > el.scrollLeft + el.clientWidth) next = right - el.clientWidth + pad;
	if (next == null) return;
	// jsdom (and older engines) don't implement Element.scrollTo — fall back to the plain property.
	if (typeof el.scrollTo === "function") el.scrollTo({ left: next, behavior });
	else el.scrollLeft = next;
}

const CategoryPill = React.memo(function CategoryPill({ label, selected, tabIndex, onSelect, buttonRef }) {
	return (
		<button
			ref={buttonRef}
			type="button"
			role="radio"
			aria-checked={selected}
			tabIndex={tabIndex}
			onClick={onSelect}
			// Keyboard focus ring comes from the app-wide `:focus-visible` rule in index.css
			// (2px #60a5fa !important) — deliberately not restyled here so the Videos chips match
			// every other focusable control in the app.
			className={[
				"flex-shrink-0 whitespace-nowrap select-none rounded-full border cursor-pointer",
				"transition-[background-color,color,border-color,transform] duration-150",
				"active:scale-[0.97]",
				selected
					? "border-transparent text-white"
					: "bg-wash-2 border-border-subtle text-text-secondary hover:bg-wash-3 hover:text-text-primary",
			].join(" ")}
			style={{
				fontFamily: "'DM Sans', sans-serif",
				fontSize: 13,
				fontWeight: 600,
				lineHeight: 1,
				padding: "0 16px",
				height: 38,
				background: selected ? ACCENT : undefined,
			}}
		>
			{label}
		</button>
	);
});

const ArrowButton = React.memo(function ArrowButton({ dir, label, disabled, onClick }) {
	return (
		<button
			type="button"
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			tabIndex={-1}
			className={[
				"flex-shrink-0 flex items-center justify-center rounded-full border border-border-subtle",
				"transition-[background-color,color,opacity] duration-150",
				disabled
					? "bg-transparent text-text-muted opacity-40 cursor-default"
					: "bg-wash-2 text-text-primary hover:bg-wash-3 cursor-pointer",
			].join(" ")}
			style={{ width: 34, height: 34 }}
		>
			<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
				<polyline points={dir === "prev" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
			</svg>
		</button>
	);
});

/**
 * @param {object}   props
 * @param {Array<{ id: string, label: string }>} props.categories  from useI18nCategoryList(VIDEO_CATEGORY_DEFS)
 * @param {string}   props.activeId   currently selected category id ("all" = no filter)
 * @param {Function} props.onSelect   called with the picked category id
 */
const VideoCategoryBar = React.memo(function VideoCategoryBar({ categories, activeId, onSelect }) {
	const { t } = useTranslation();
	const { isMobile } = useViewport();
	const scrollRef = useRef(null);
	const btnRefs = useRef([]);
	// Roving tabindex: exactly one pill is tabbable, arrow keys move focus between them, and
	// Enter/Space activate via the native <button>. Seeded from — and re-synced to — the selection.
	const activeIndex = Math.max(0, categories.findIndex((c) => c.id === activeId));
	const [focusIndex, setFocusIndex] = useState(activeIndex);
	useEffect(() => { setFocusIndex(activeIndex); }, [activeIndex]);

	// Arrows are a pointer-device affordance and only earn their space when the row overflows;
	// touch users swipe instead, which is what frees the full viewport width on a phone.
	const [overflow, setOverflow] = useState(false);
	const [edges, setEdges] = useState({ atStart: true, atEnd: true });
	const measure = useCallback(() => {
		const el = scrollRef.current;
		const host = el?.parentElement;
		if (!el || !host) return;
		// Overflow is judged against the ROW's width and the chips' own width — never against the
		// scroller's current width. Mounting the arrows shrinks the scroller, which would itself
		// manufacture the overflow that justified them: a bistable loop that settled with arrows
		// shown but their edge flags measured from the arrow-less pass ("Next" permanently dead).
		// Both inputs here are independent of whether the arrows are currently rendered.
		const kids = el.children;
		const contentW = kids.length
			? kids[kids.length - 1].offsetLeft + kids[kids.length - 1].offsetWidth - kids[0].offsetLeft
			: 0;
		const hasOverflow = contentW > host.clientWidth + 1;
		const atStart = el.scrollLeft <= 4;
		const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4;
		setOverflow((prev) => (prev === hasOverflow ? prev : hasOverflow));
		setEdges((prev) => (prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }));
	}, []);
	useLayoutEffect(() => {
		const el = scrollRef.current;
		if (!el) return undefined;
		measure();
		el.addEventListener("scroll", measure, { passive: true });
		// Guarded: ResizeObserver is absent in jsdom and older engines.
		const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
		ro?.observe(el);
		return () => { el.removeEventListener("scroll", measure); ro?.disconnect(); };
	}, [categories.length, measure]);
	// Showing/hiding the arrows changes the scroller's OWN width, and a ResizeObserver
	// notification provoked by its own callback is dropped by the browser ("undelivered
	// notifications"). Without this re-measure the edge flags keep the values they had while the
	// strip was still full-width — which left "Next" disabled at scrollLeft 0 with content to
	// spare, i.e. an arrow that visibly did nothing.
	useEffect(() => {
		const id = requestAnimationFrame(measure);
		return () => cancelAnimationFrame(id);
	}, [overflow, measure]);

	// Keep the selected pill visible — after a click near the edge, and after a width change that
	// scrolls it out of view.
	useEffect(() => {
		revealInScroller(scrollRef.current, btnRefs.current[activeIndex]);
	}, [activeIndex]);

	const nudge = useCallback((delta) => {
		const el = scrollRef.current;
		if (!el) return;
		const next = Math.max(0, Math.min(el.scrollLeft + delta, el.scrollWidth - el.clientWidth));
		if (typeof el.scrollTo === "function") el.scrollTo({ left: next, behavior: "smooth" });
		else el.scrollLeft = next;
	}, []);

	const onKeyDown = useCallback((e) => {
		const last = categories.length - 1;
		let next = null;
		if (e.key === "ArrowRight") next = Math.min(focusIndex + 1, last);
		else if (e.key === "ArrowLeft") next = Math.max(focusIndex - 1, 0);
		else if (e.key === "Home") next = 0;
		else if (e.key === "End") next = last;
		if (next == null || next === focusIndex) return;
		e.preventDefault();
		setFocusIndex(next);
		const btn = btnRefs.current[next];
		btn?.focus();
		revealInScroller(scrollRef.current, btn);
	}, [categories.length, focusIndex]);

	// Touch gets no control of any kind — swiping IS the gesture, and anything parked beside the
	// strip eats width the chips need on a 375px screen. Arrows stay a pointer-device affordance,
	// and only when the row actually overflows.
	const showArrows = !isMobile && overflow;

	return (
		<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22, animation: "fadeUp 0.35s ease 60ms both" }}>
			{showArrows && (
				<ArrowButton dir="prev" label={t("common.previous")} disabled={edges.atStart} onClick={() => nudge(-240)} />
			)}
			<div
				ref={scrollRef}
				// `ecom-cat-scroll` is the app's existing scrollbar-hiding utility (defined in App.jsx).
				className="ecom-cat-scroll"
				role="radiogroup"
				// Not "videos.category" — that is the upload form's field label, and two controls
				// sharing one accessible name on the same page is ambiguous for screen readers.
				aria-label={t("videos.categoryFilter")}
				onKeyDown={onKeyDown}
				style={{
					// minWidth:0 lets this flex child shrink below its content width — without it the
					// row forces the whole page to scroll horizontally on narrow screens.
					flex: 1, minWidth: 0,
					display: "flex", gap: 8, flexWrap: "nowrap",
					overflowX: "auto", overflowY: "hidden",
					scrollbarWidth: "none",
					// Keep an over-swipe inside the strip instead of bubbling to the page/browser back gesture.
					overscrollBehaviorX: "contain",
					WebkitOverflowScrolling: "touch",
					// Room for the focus ring, which would otherwise be clipped by overflow:auto.
					padding: "3px 2px",
				}}
			>
				{categories.map((cat, i) => (
					<CategoryPill
						key={cat.id}
						label={cat.label}
						selected={cat.id === activeId}
						tabIndex={i === focusIndex ? 0 : -1}
						buttonRef={(el) => { btnRefs.current[i] = el; }}
						onSelect={() => onSelect(cat.id)}
					/>
				))}
			</div>
			{showArrows && (
				<ArrowButton dir="next" label={t("common.next")} disabled={edges.atEnd} onClick={() => nudge(240)} />
			)}
		</div>
	);
});

export default VideoCategoryBar;
