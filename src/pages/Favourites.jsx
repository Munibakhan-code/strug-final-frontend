import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import {
	SearchIcon,
	FavouritesIcon,
	EventsIcon,
	ShopIcon,
	VenuesIcon,
	AutomotiveIcon,
	ProServicesIcon,
	TempStayIcon,
	FolderIcon,
	FoodIcon,
} from "../components/icons.jsx";
import { Skel, SkeletonProductCard, SkeletonCircle, SkeletonHeading } from "../components/skeletons.jsx";
import { LeoButton } from "../components/shared.jsx";
import { getSaves, removeSave } from "../api/saves";
import { isAuthenticated } from "../store/auth";

// Map a saved_item.entity_type to one of the display category buckets.
const TYPE_TO_CAT = {
	product: "products", listing: "products", artwork: "products",
	event: "events", experience: "events", campaign: "events",
	venue: "venues",
	vehicle: "vehicles",
	service: "services", course: "services",
	stay: "stays", property: "stays",
	quote_provider: "providers",
	restaurant: "restaurants",
	florist: "restaurants",
};

function relTime(ts) {
	if (!ts) return { count: 1, unit: "d" };
	const diff = Date.now() - new Date(ts).getTime();
	if (Number.isNaN(diff)) return { count: 1, unit: "d" };
	const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
	if (d > 0) return { count: d, unit: "d" };
	return { count: Math.max(1, h || Math.ceil(m / 60)), unit: "h" };
}

// Map a saved_item row -> the card shape, using its `meta` display snapshot.
function mapSave(s) {
	const cat = TYPE_TO_CAT[s.entity_type] || "products";
	const accent = s.meta?.accent || CATEGORY_COLORS[cat] || "#2563eb";
	return {
		id: s.id,
		category: cat,
		title: s.meta?.title || "Saved item",
		sub: s.meta?.sub || "",
		price: s.meta?.price || "",
		thumb: s.meta?.thumb || `linear-gradient(135deg,#0f1420,${accent})`,
		accent,
		savedAgo: relTime(s.saved_at),
	};
}

const CATEGORY_COLORS = {
	all: "#2563eb",
	events: "#db2777",
	products: "#d97706",
	venues: "#7c3aed",
	vehicles: "#059669",
	services: "#0891b2",
	stays: "#dc2626",
	providers: "#0ea5e9",
	restaurants: "#f59e0b",
};

// LeoButton renders nothing in the tile without an `icon` — the category filter row was blank
// (bug: no icon prop was ever passed here, so every tile — not just Vehicles — showed empty).
const CATEGORY_ICONS = {
	all: FavouritesIcon,
	events: EventsIcon,
	products: ShopIcon,
	venues: VenuesIcon,
	// AutomotiveIcon (a literal car silhouette), not VehiclesIcon — despite the name, VehiclesIcon
	// is a radial/sun glyph (it's the rental-vertical nav icon elsewhere in the app), not a car, so
	// it didn't read as "vehicle" here.
	vehicles: AutomotiveIcon,
	services: ProServicesIcon,
	stays: TempStayIcon,
	providers: FolderIcon,
	restaurants: FoodIcon,
};

// `item.thumb` is either a real photo URL (from the saving page's meta, e.g. "https://…") or the
// `linear-gradient(...)` fallback mapSave() builds when there's no photo — `background` only
// accepts the latter directly, a bare URL needs `url(...)` via backgroundImage or it silently
// renders as nothing (bug: saved vehicle/listing cards showed a blank thumb, no photo).
function isGradientThumb(thumb) {
	return typeof thumb === "string" && thumb.startsWith("linear-gradient(");
}

function SavedItemCard({ item, categoryLabel, savedLabel, delay = 0, onRemove, removeTitle }) {
	const thumbStyle = isGradientThumb(item.thumb)
		? { background: item.thumb }
		: { backgroundImage: `url(${item.thumb})`, backgroundSize: "cover", backgroundPosition: "center" };
	return (
		<div className="bg-surface border border-border-subtle" style={{ borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", animation: `fadeUp 0.35s ease ${delay}ms both`, position: "relative" }}>
			{/* Thumb + its floating badges sit over a colored/photo thumb — kept dark for legibility
			    regardless of theme, same as Hub's photo-overlay chrome. */}
			<div style={{ height: 200, position: "relative", ...thumbStyle }}>
				{/* Dark glassmorphism pill (not colored text on a tinted background) so the label stays
				    readable over any photo — the old accent-on-accent-tint version washed out on light
				    thumbs (e.g. a snowy vehicle photo). Matches DealershipCard's category badge. */}
				<span style={{ position: "absolute", top: 10, left: 10, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(10px)", border: `1px solid ${item.accent}88`, borderRadius: 20, padding: "3px 10px", fontSize: 10, fontWeight: 700, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.4)", fontFamily: "'DM Sans', sans-serif" }}>{categoryLabel}</span>
				<button onClick={() => onRemove(item.id)} title={removeTitle} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.55)", border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,0.6)" }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
				</button>
			</div>
			<div style={{ padding: "14px 16px", flex: 1 }}>
				<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 3, lineHeight: 1.3 }}>{item.title}</p>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 10 }}>{item.sub}</p>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
					<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, color: item.accent }}>{item.price}</span>
					<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10 }}>{savedLabel}</span>
				</div>
			</div>
		</div>
	);
}

function FavouritesPage() {
	const { t, landingTitle, searchPlaceholder } = usePageI18n("favourites");
const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [activeCategory, setActiveCategory] = useState("all");
	const [items, setItems] = useState([]);
	const [query, setQuery] = useState("");
	const authed = isAuthenticated();
	useEffect(() => {
		if (!authed) return;
		getSaves().then((res) => {
			const arr = Array.isArray(res) ? res : (res?.data ?? []);
			setItems(arr.map(mapSave));
		}).catch(() => {});
	}, [authed]);
	function handleRemove(id) {
		setItems((prev) => prev.filter((p) => p.id !== id)); // optimistic
		removeSave(id).catch(() => {});
	}
	const catScrollRef = useRef(null);
	const [catScrollState, setCatScrollState] = useState({ atStart: true, atEnd: true });

	const favCategories = useMemo(() => (
		["all", "events", "products", "venues", "vehicles", "services", "stays", "providers", "restaurants"].map((id) => ({
			id,
			label: t(`favourites.categories.${id}`),
			color: CATEGORY_COLORS[id],
			icon: CATEGORY_ICONS[id],
		}))
	), [t]);

	const categoryLabelById = useMemo(
		() => Object.fromEntries(favCategories.map((cat) => [cat.id, cat.label])),
		[favCategories],
	);

	const formatSavedAgo = useCallback((savedAgo) => {
		const time = savedAgo.unit === "h"
			? t("favourites.timeAgoHours", { count: savedAgo.count })
			: t("favourites.timeAgoDays", { count: savedAgo.count });
		return t("favourites.savedAgo", { time });
	}, [t]);

	useLayoutEffect(() => {
		const el = catScrollRef.current;
		if (!el) return;
		const update = () => setCatScrollState(prev => { const atStart = el.scrollLeft <= 4, atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4; return prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }; });
		update();
		el.addEventListener("scroll", update, { passive: true });
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
	}, []);

	const filtered = items.filter(p => {
		const matchCat = activeCategory === "all" || p.category === activeCategory;
		const matchQ = !query || p.title.toLowerCase().includes(query.toLowerCase()) || p.sub.toLowerCase().includes(query.toLowerCase());
		return matchCat && matchQ;
	});

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 32, overflow: "hidden" }}>
			<div style={{ width: "100%" }}>
				<div style={{ padding: "28px 0 20px" }}><SkeletonHeading /></div>
				<div style={{ display: "flex", gap: 20, marginBottom: 28 }}>
					{[...Array(7)].map((_,i) => <SkeletonCircle key={i} />)}
				</div>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 18 }}>
					{[...Array(6)].map((_,i) => <SkeletonProductCard key={i} />)}
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 32, overflow: "hidden" }}>
			<div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
				<div className="bg-bg" style={{ position: "sticky", top: 0, zIndex: 10, padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					{isMobile ? (
						<div style={{ textAlign: "center", marginBottom: 20 }}>
							<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase" }}>{landingTitle}</h1>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("favourites.savedCount", { n: items.length })}</span>
						</div>
					) : (
						<div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
							<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center" }}>{t("favourites.title")}</h1>
							<span className="text-text-secondary" style={{ position: "absolute", right: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("favourites.savedCount", { n: items.length })}</span>
						</div>
					)}
					<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
						<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
							<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={20} /></div>
							<input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} />
						</div>
					</div>
				</div>
				<div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 28, animation: "fadeUp 0.35s ease 60ms both" }}>
					<button onClick={() => catScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })} className={`border ${catScrollState.atStart ? "bg-surface border-border-subtle text-text-muted" : "bg-surface-raised border-border text-text-primary"}`} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, cursor: catScrollState.atStart ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", transition: "transform 0.12s, background 0.2s" }}
						onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; e.currentTarget.style.background = catScrollState.atStart ? "var(--color-surface-raised)" : "var(--color-border)"; }}
						onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = catScrollState.atStart ? "var(--color-surface)" : "var(--color-surface-raised)"; }}
						onMouseDown={e => e.currentTarget.style.transform = "scale(0.88)"} onMouseUp={e => e.currentTarget.style.transform = "scale(1.15)"}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					</button>
					<div ref={catScrollRef} className="ecom-cat-scroll" style={{ flex: 1, display: "flex", gap: 20, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none", justifyContent: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "center" : "flex-start" }}>
						{favCategories.map((cat, i) => (
							<LeoButton key={cat.id} cat={cat} icon={cat.icon} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 30} />
						))}
					</div>
					<button onClick={() => catScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: catScrollState.atEnd ? "var(--color-surface)" : "#2563eb", border: `1px solid ${catScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`, color: catScrollState.atEnd ? "var(--color-text-muted)" : "#fff", cursor: catScrollState.atEnd ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", transition: "transform 0.12s, background 0.2s", boxShadow: catScrollState.atEnd ? "none" : "0 2px 14px rgba(37,99,235,0.55)" }}
						onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; e.currentTarget.style.background = catScrollState.atEnd ? "var(--color-surface-raised)" : "#3b82f6"; }}
						onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = catScrollState.atEnd ? "var(--color-surface)" : "#2563eb"; }}
						onMouseDown={e => e.currentTarget.style.transform = "scale(0.88)"} onMouseUp={e => e.currentTarget.style.transform = "scale(1.15)"}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</button>
				</div>
				{filtered.length > 0 ? (
					<div style={{ paddingBottom: 24 }}>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 18, animation: "fadeUp 0.4s ease 100ms both" }}>
							{filtered.map((item, i) => (
								<SavedItemCard
									key={item.id}
									item={item}
									categoryLabel={categoryLabelById[item.category]}
									savedLabel={formatSavedAgo(item.savedAgo)}
									delay={i * 40}
									removeTitle={t("favourites.remove")}
									onRemove={handleRemove}
								/>
							))}
						</div>
					</div>
				) : (
					<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, opacity: 0.5, paddingTop: 80, paddingBottom: 24 }}>
						<svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
						<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>{t("favourites.empty")}</p>
					</div>
				)}
			</div>
		</div>
	);
}

export { FavouritesPage };
