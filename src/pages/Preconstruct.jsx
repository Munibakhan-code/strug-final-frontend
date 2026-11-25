import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon, BlueprintIcon, CheckIcon, PlusIcon } from "../components/icons.jsx";
import {Skel, SkeletonProductCard, SkeletonCircle, SkeletonHeading, SkeletonREListingCard} from "../components/skeletons.jsx";
import { LeoButton, ODCategoryBubble } from "../components/shared.jsx";
import { FitLeafletBounds, LeafletMapControls } from "../components/LeafletMapControls.jsx";
import { fitLeafletMap } from "../utils/leafletFit.js";
import { createPropertyInquiry, createPropertyViewing, getMyPropertyEngagement, getProperties, getProperty } from "../api/realestate";
import { messageUser } from "../api/chat";
import { isAuthenticated } from "../store/auth";
import { getLocationItem } from "../utils/userLocation.js";
import { geocodeAddress } from "../utils/geocode.js";
import { geocodeAddressFallback } from "../utils/locationSearch.js";
import { mediaUrl } from "../utils/mediaUrl.js";
import PropertySavedSearches, { buildPreconstructSearchFilters } from "../components/PropertySavedSearches.jsx";
import {
	AmenitiesSection,
	CommunityActionBar,
	ConstructionUpdatesSection,
	CurrentIncentivesSection,
	DesignStudioSection,
	FloorPlanCompareBar,
	FloorPlanCompareModal,
	QuickMoveInSection,
	SalesCenterSection,
	sendSpecialtyInterest,
	specialtyKeysFromMessages,
	stripSpecialtyItemKey,
} from "../components/PreconstructLivablExtras.jsx";
import PropertyFinancingCard from "../components/PropertyFinancingCard.jsx";

const STATUS_COLORS = {
	"Selling": "#2563eb",
	"Coming Soon": "#d97706",
	"Sold Out": "#6b7280",
	"Pre-launch": "#7c3aed",
	"Registration": "#0891b2",
	"Construction": "#d97706",
	"Complete": "#059669",
	"Pre-selling": "#2563eb",
	"Under Construction": "#d97706",
};

const PRECONSTRUCT_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#2563eb", match: null },
	{ id: "category-condos", labelKey: "preconstruct.categoryCondos", color: "#7c3aed", match: "Condos" },
	{ id: "category-townhomes", labelKey: "preconstruct.categoryTownhomes", color: "#059669", match: "Townhomes" },
	{ id: "category-detached", labelKey: "preconstruct.categoryDetached", color: "#d97706", match: "Detached" },
	{ id: "category-commercial", labelKey: "preconstruct.categoryCommercial", color: "#0891b2", match: "Commercial" },
	{ id: "category-mixed-use", labelKey: "preconstruct.categoryMixedUse", color: "#db2777", match: "Mixed Use" },
	{ id: "category-industrial", labelKey: "preconstruct.categoryIndustrial", color: "#65a30d", match: "Industrial" },
	{ id: "category-land", labelKey: "preconstruct.categoryLand", color: "#f59e0b", match: "Land" },
];

const FLOOR_PLAN_TYPES = [
	{ id: "studio", label: "Studio",    sqft: "420–480 sq ft",  price: null,    beds: 0, baths: 1 },
	{ id: "1b",     label: "1 Bed",     sqft: "560–640 sq ft",  price: null,    beds: 1, baths: 1 },
	{ id: "1bden",  label: "1 Bed+Den", sqft: "680–760 sq ft",  price: null,    beds: 1, baths: 2 },
	{ id: "2b",     label: "2 Bed",     sqft: "820–980 sq ft",  price: null,    beds: 2, baths: 2 },
	{ id: "3b",     label: "3 Bed",     sqft: "1,100–1,340 sq ft", price: null, beds: 3, baths: 2 },
];

const PRICE_FILTER_DEFS = [
	{ id: "any", min: null, max: null, labelKey: "preconstruct.anyPrice" },
	{ id: "500k", min: null, max: 500000, labelKey: "preconstruct.under500k" },
	{ id: "1m", min: null, max: 1000000, labelKey: "preconstruct.under1m" },
	{ id: "1m+", min: 1000000, max: null, labelKey: "preconstruct.over1m" },
];

const PRECON_GEO_CACHE_PREFIX = "strug_precon_geo_v1:";
const DEFAULT_MAP_CENTER = [43.65, -79.38];

function formatPinPrice(priceNum) {
	if (priceNum == null || !Number.isFinite(priceNum)) return "—";
	if (priceNum >= 1000000) {
		const m = priceNum / 1000000;
		return `$${m >= 10 ? Math.round(m) : m.toFixed(m % 1 === 0 ? 0 : 1)}M`;
	}
	if (priceNum >= 10000) return `$${Math.round(priceNum / 1000)}K`;
	if (priceNum >= 1000) return `$${(priceNum / 1000).toFixed(1)}K`;
	return `$${Math.round(priceNum).toLocaleString()}`;
}

function matchesPriceFilter(project, filterId) {
	const def = PRICE_FILTER_DEFS.find((f) => f.id === filterId) || PRICE_FILTER_DEFS[0];
	if (def.min == null && def.max == null) return true;
	const n = project.priceNum;
	if (n == null || !Number.isFinite(n)) return filterId === "any";
	if (def.min != null && n < def.min) return false;
	if (def.max != null && n > def.max) return false;
	return true;
}

/** Escape text before injecting into Leaflet divIcon HTML. */
function escapePinText(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** Truncate project name for map pins. */
function truncatePinName(name, max = 18) {
	const s = String(name || "Project").trim();
	if (s.length <= max) return s;
	return `${s.slice(0, max - 1)}…`;
}

/** Airbnb / Livabl-style pin: project name + price. Colors here stay hardcoded in both
 * themes — these pins render as HTML inside a Leaflet divIcon on the dark CartoDB basemap
 * (see the `dark_all` TileLayer below), so they need consistent white/blue chip styling
 * regardless of the app's light/dark theme, same reasoning as Quotes.jsx's map treatment. */
function preconPinIcon(project, selected) {
	const price = formatPinPrice(project.priceNum);
	const name = truncatePinName(project.name, selected ? 22 : 16);
	const nameSafe = escapePinText(name);
	const priceSafe = escapePinText(price);

	const pillW = Math.min(148, Math.max(72, Math.ceil(Math.max(name.length, price.length) * 7.1) + 22));
	const pillH = 38;
	const tipH = 6;
	const boxW = pillW;
	const boxH = pillH + tipH;

	const bg = selected ? "#2563eb" : "#ffffff";
	const nameColor = selected ? "#ffffff" : "#0f172a";
	const priceColor = selected ? "#bfdbfe" : "#2563eb";
	const ring = selected ? "0 0 0 2px rgba(37,99,235,0.35)" : "0 0 0 1px rgba(15,23,42,0.08)";
	const shadow = selected
		? "0 6px 16px rgba(37,99,235,0.45)"
		: "0 2px 8px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.2)";

	return L.divIcon({
		className: "precon-map-pin",
		html: `
			<div style="
				width:${boxW}px;height:${boxH}px;
				display:flex;flex-direction:column;align-items:center;
				cursor:pointer;pointer-events:auto;
				transform:translateZ(0);
			">
				<div style="
					box-sizing:border-box;
					width:${pillW}px;height:${pillH}px;
					display:flex;flex-direction:column;align-items:center;justify-content:center;
					gap:1px;padding:4px 10px;
					background:${bg};
					border-radius:12px;
					box-shadow:${shadow},${ring};
					font-family:'DM Sans',system-ui,sans-serif;
					line-height:1.15;white-space:nowrap;
					transform:${selected ? "scale(1.05)" : "scale(1)"};
					transition:transform 0.12s ease;
					overflow:hidden;
				">
					<span style="
						max-width:100%;overflow:hidden;text-overflow:ellipsis;
						font-weight:700;font-size:11px;color:${nameColor};letter-spacing:0.01em;
					">${nameSafe}</span>
					<span style="
						font-weight:700;font-size:10px;color:${priceColor};letter-spacing:0.01em;
					">${priceSafe}</span>
				</div>
				<svg width="12" height="${tipH}" viewBox="0 0 12 6" style="display:block;margin-top:-1px;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.2));">
					<path d="M0 0 L6 6 L12 0 Z" fill="${bg}"/>
				</svg>
			</div>
		`.replace(/\s+/g, " ").trim(),
		iconSize: [boxW, boxH],
		iconAnchor: [boxW / 2, boxH],
		popupAnchor: [0, -boxH + 4],
	});
}

function PreconstructMapFlyTo({ project }) {
	const map = useMap();
	useEffect(() => {
		if (!project?.lat || !project?.lng) return;
		map.flyTo([project.lat, project.lng], Math.max(map.getZoom(), 12), { duration: 0.55 });
	}, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps
	return null;
}

function PreconstructMapCapture({ mapRef }) {
	const map = useMap();
	useEffect(() => {
		mapRef.current = map;
		return () => { if (mapRef.current === map) mapRef.current = null; };
	}, [map, mapRef]);
	return null;
}

/** Leaflet measures a 0×0 container when mounted inside flex layouts — force a resize once painted. */
function PreconstructMapInvalidate({ triggerKey }) {
	const map = useMap();
	useEffect(() => {
		const id = window.setTimeout(() => {
			try {
				map.invalidateSize({ animate: false });
			} catch { /* map unmounted */ }
		}, 80);
		const id2 = window.setTimeout(() => {
			try {
				map.invalidateSize({ animate: false });
			} catch { /* map unmounted */ }
		}, 350);
		return () => {
			window.clearTimeout(id);
			window.clearTimeout(id2);
		};
	}, [map, triggerKey]);
	return null;
}

async function resolveProjectCoords(queryAddr) {
	const cacheKey = PRECON_GEO_CACHE_PREFIX + String(queryAddr || "").toLowerCase().trim();
	if (!queryAddr) return null;
	try {
		const cached = sessionStorage.getItem(cacheKey);
		if (cached) {
			const pt = JSON.parse(cached);
			if (pt?.lat != null && pt?.lng != null) return { lat: Number(pt.lat), lng: Number(pt.lng) };
		}
	} catch { /* ignore */ }

	// Photon first — Google Maps is lazy-loaded and often not ready on first paint.
	let pt = await geocodeAddressFallback(queryAddr).catch(() => null);
	if (!pt?.lat || !pt?.lng) {
		pt = await geocodeAddress(queryAddr).catch(() => null);
	}
	// Last-resort city hints so map pins still appear when external geocoders fail/CORS-block.
	if (!pt?.lat || !pt?.lng) {
		const q = queryAddr.toLowerCase();
		const CITY_HINTS = [
			{ re: /islamabad/, lat: 33.6844, lng: 73.0479 },
			{ re: /rawalpindi/, lat: 33.5651, lng: 73.0169 },
			{ re: /lahore/, lat: 31.5204, lng: 74.3587 },
			{ re: /karachi/, lat: 24.8607, lng: 67.0011 },
			{ re: /toronto/, lat: 43.6532, lng: -79.3832 },
			{ re: /vancouver/, lat: 49.2827, lng: -123.1207 },
			{ re: /calgary/, lat: 51.0447, lng: -114.0719 },
			{ re: /montreal/, lat: 45.5017, lng: -73.5673 },
			{ re: /dubai/, lat: 25.2048, lng: 55.2708 },
			{ re: /pakistan/, lat: 30.3753, lng: 69.3451 },
		];
		const hit = CITY_HINTS.find((h) => h.re.test(q));
		if (hit) pt = { lat: hit.lat, lng: hit.lng };
	}
	if (pt?.lat == null || pt?.lng == null) return null;
	const resolved = { lat: Number(pt.lat), lng: Number(pt.lng) };
	if (!Number.isFinite(resolved.lat) || !Number.isFinite(resolved.lng)) return null;
	try {
		sessionStorage.setItem(cacheKey, JSON.stringify(resolved));
	} catch { /* quota */ }
	return resolved;
}

function PreconstructMapRow({ project, selected, onSelect, onOpen }) {
	const coverUrl = typeof project.images?.[0] === "string"
		? project.images[0]
		: (typeof project.thumb === "string" && project.thumb.startsWith("http") ? project.thumb : null);
	return (
		<button
			type="button"
			onClick={() => onSelect?.(project)}
			onDoubleClick={() => onOpen?.(project)}
			style={{
				display: "flex",
				gap: 12,
				width: "100%",
				textAlign: "left",
				padding: 10,
				borderRadius: 14,
				border: `1px solid ${selected ? "rgba(37,99,235,0.55)" : "var(--color-border)"}`,
				background: selected ? "rgba(37,99,235,0.14)" : "var(--color-surface-raised)",
				cursor: "pointer",
				boxShadow: selected ? "0 8px 28px rgba(37,99,235,0.25)" : "none",
				transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s",
			}}
		>
			<div style={{
				width: 84, height: 72, borderRadius: 10, flexShrink: 0, overflow: "hidden",
				background: "linear-gradient(135deg, #1e3a5f, #0f2744)",
			}}>
				{coverUrl && (
					<img src={coverUrl} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
				)}
			</div>
			<div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
					<span style={{
						fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif",
						background: STATUS_COLORS[project.status] || "#2563eb", borderRadius: 5, padding: "2px 7px",
					}}>{project.status}</span>
					<span className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>Est. {project.completion}</span>
				</div>
				<p className="text-text-primary" style={{ margin: 0, fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</p>
				<p className="text-text-secondary" style={{ margin: 0, fontSize: 12, fontFamily: "'DM Sans', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.location || project.developer}</p>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 2 }}>
					<span style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa", fontFamily: "'DM Sans', sans-serif" }}>{project.price}</span>
					<span
						role="link"
						tabIndex={0}
						onClick={(e) => { e.stopPropagation(); onOpen?.(project); }}
						onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onOpen?.(project); } }}
						className="text-text-secondary" style={{ fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", textDecoration: "underline", textUnderlineOffset: 2 }}
					>
						{i18n.t("preconstruct.viewProject")}
					</span>
				</div>
			</div>
		</button>
	);
}

function PreconstructCard({ project, delay, onOpen }) {
	const { isMobile } = useViewport();
	const [hov, setHov] = useState(false);
	const isSoldOut = project.status === "Sold Out";
	const coverUrl = typeof project.images?.[0] === "string"
		? project.images[0]
		: (typeof project.thumb === "string" && project.thumb.startsWith("http") ? project.thumb : null);
	// Stylized "no photo yet" placeholder gradient — deliberately fixed in both themes so it
	// reads as a rendering/photo, not as a themed surface (same for the other cover-fallback
	// gradients in this file).
	const coverFallback = "linear-gradient(135deg, #1e3a5f, #0f2744)";
	const edge = hov && !isSoldOut ? "var(--color-border)" : "var(--color-border-subtle)";

	return (
		<div
			role={isSoldOut ? undefined : "button"}
			tabIndex={isSoldOut ? undefined : 0}
			onClick={() => { if (!isSoldOut && onOpen) onOpen(); }}
			onKeyDown={(e) => {
				if (isSoldOut || !onOpen) return;
				if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); }
			}}
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			className="bg-surface-raised" style={{
				width: isMobile ? "calc(50% - 10px)" : 290,
				maxWidth: isMobile ? "calc(50% - 10px)" : 290,
				minWidth: 0,
				borderRadius: 16,
				overflow: "hidden",
				isolation: "isolate",
				clipPath: "inset(0 round 16px)",
				cursor: isSoldOut ? "default" : "pointer",
				border: "none",
				boxShadow: hov && !isSoldOut
					? `inset 0 0 0 1px ${edge}, 0 16px 48px var(--color-shadow)`
					: `inset 0 0 0 1px ${edge}, 0 2px 12px var(--color-shadow)`,
				transform: hov && !isSoldOut ? "translateY(-4px)" : "translateY(0)",
				transition: "transform 0.2s, box-shadow 0.2s",
				animation: `fadeUp 0.35s ease ${delay}ms both`,
				flexShrink: 0,
				opacity: isSoldOut ? 0.55 : 1,
			}}
		>
			{/* Thumbnail */}
			<div style={{
				width: "100%",
				height: 170,
				background: coverFallback,
				position: "relative",
				overflow: "hidden",
			}}>
				{coverUrl && (
					<img
						src={coverUrl}
						alt=""
						draggable={false}
						style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", border: 0 }}
						onError={(e) => { e.currentTarget.style.display = "none"; }}
					/>
				)}
				{/* Badges below sit directly on the photo thumbnail — kept as fixed dark/opaque
				    chips in both themes for legibility over an arbitrary uploaded photo, same
				    reasoning as Hub.jsx's hero photo overlay treatment. */}
				<div style={{ position: "absolute", top: 10, left: 10, background: STATUS_COLORS[project.status] || "#2563eb", borderRadius: 6, padding: "4px 10px", zIndex: 1 }}>
					<span style={{ fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{project.status}</span>
				</div>
				<div style={{
					position: "absolute", bottom: 10, left: 10, zIndex: 1, borderRadius: 6, padding: "3px 8px",
					background: project.is_verified || project.trust_label === "verified" ? "rgba(34,197,94,0.9)" : "rgba(0,0,0,0.75)",
					border: project.is_verified || project.trust_label === "verified" ? "none" : "1px solid rgba(245,158,11,0.45)",
				}}>
					<span style={{
						fontSize: 10, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
						color: project.is_verified || project.trust_label === "verified" ? "#fff" : "#fbbf24",
					}}>
						{project.is_verified || project.trust_label === "verified" ? "Verified" : "Unverified"}
					</span>
				</div>
				<div style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(0,0,0,0.75)", borderRadius: 6, padding: "3px 8px", zIndex: 1 }}>
					<span style={{ fontSize: 11, fontWeight: 600, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>Est. {project.completion}</span>
				</div>
			</div>
			{/* Info — single column, no separators / hairlines */}
			<div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
				<div style={{ minWidth: 0 }}>
					<p className="text-text-primary" style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</p>
					<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.location}</p>
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
					<div
						aria-hidden
						style={{
							width: 20,
							height: 20,
							borderRadius: "50%",
							background: project.avatarColor || "#7c3aed",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							fontSize: 9,
							fontWeight: 700,
							color: "#fff",
							fontFamily: "'Barlow Condensed', sans-serif",
							flexShrink: 0,
						}}
					>{project.avatar}</div>
					<span className="text-text-secondary" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{project.developer}</span>
				</div>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth: 0 }}>
					<span className="text-text-primary" style={{ fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.price}</span>
					<span className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>{project.units} units</span>
				</div>
			</div>
		</div>
	);
}

/** Floor plan image with graceful fallback: processed (background-removed) image
 * first, then the original upload if the processed blob fails to load. Rendered on
 * a white surface so transparent PNGs and unprocessed originals look consistent. */
function FloorPlanImage({ plan, imgStyle, onUnavailable }) {
	// mediaUrl resolves relative /uploads paths (local-dev disk fallback) against
	// the API origin; absolute blob URLs pass through untouched.
	const processedSrc = mediaUrl(plan.image_url) || null;
	const originalSrc = mediaUrl(plan.original_image_url) || null;
	const [src, setSrc] = useState(processedSrc || originalSrc);
	useEffect(() => {
		setSrc(processedSrc || originalSrc);
	}, [processedSrc, originalSrc]);
	if (!src) return null;
	return (
		<img
			src={src}
			alt={plan.label || "Floor plan"}
			draggable={false}
			onError={() => {
				if (originalSrc && src !== originalSrc) {
					setSrc(originalSrc);
				} else {
					setSrc(null);
					onUnavailable?.();
				}
			}}
			style={imgStyle}
		/>
	);
}

function FloorPlanPlaceholder({ size = 34 }) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
			<rect x="2" y="2" width="20" height="20" rx="2" />
			<path d="M7 7h3v3H7z" />
			<path d="M14 7h3" />
			<path d="M14 12h3" />
			<path d="M7 14h10" />
			<path d="M7 18h10" />
		</svg>
	);
}

function mapPropertyDetailOntoProject(prev, p) {
	if (!p) return prev;
	const gallery = Array.isArray(p.images) ? p.images.map((img) => img.url || img).filter(Boolean) : [];
	return {
		...prev,
		name: p.property_name ?? prev.name,
		developer: p.developer_name || p.user?.name || prev.developer,
		description: p.description ?? prev.description,
		amenities: Array.isArray(p.amenities) ? p.amenities : prev.amenities,
		incentives: Array.isArray(p.incentives) ? p.incentives : prev.incentives,
		move_in_homes: Array.isArray(p.move_in_homes) ? p.move_in_homes : prev.move_in_homes,
		design_packages: Array.isArray(p.design_packages) ? p.design_packages : prev.design_packages,
		sales_center_address: p.sales_center_address ?? prev.sales_center_address,
		sales_center_phone: p.sales_center_phone ?? prev.sales_center_phone,
		sales_center_email: p.sales_center_email ?? prev.sales_center_email,
		sales_center_hours: p.sales_center_hours ?? prev.sales_center_hours,
		virtual_tour_url: p.virtual_tour_url ?? prev.virtual_tour_url,
		video_url: p.video_url ?? prev.video_url,
		floor_plans: Array.isArray(p.floor_plans) ? p.floor_plans : prev.floor_plans,
		updates: Array.isArray(p.updates) ? p.updates : [],
		follower_count: p._count?.followers ?? prev.follower_count,
		images: gallery.length ? gallery : prev.images,
		thumb: gallery[0] || prev.thumb,
		_raw: p,
	};
}

function PreconstructDetailPage({ project: initialProject, onBack }) {
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [project, setProject] = useState(initialProject);
	const [galleryIdx, setGalleryIdx] = useState(0);

	useEffect(() => {
		setProject(initialProject);
	}, [initialProject?.id]);

	// List endpoint omits updates + full merchandising — hydrate from detail.
	useEffect(() => {
		if (!initialProject?.id) return undefined;
		let cancelled = false;
		getProperty(initialProject.id)
			.then((p) => {
				if (cancelled || !p) return;
				setProject((prev) => mapPropertyDetailOntoProject(prev, p));
			})
			.catch(() => { /* keep list-shaped project */ });
		return () => { cancelled = true; };
	}, [initialProject?.id]);
	const [selFloor, setSelFloor] = useState(null);
	const [contactMsg, setContactMsg] = useState("");
	const [contactName, setContactName] = useState("");
	const [contactEmail, setContactEmail] = useState("");
	const [contactPhone, setContactPhone] = useState("");
	const [contactSending, setContactSending] = useState(false);
	const [contactErr, setContactErr] = useState(null);
	const [contactSent, setContactSent] = useState(false);

	async function handleContact() {
		if (contactSending) return;
		if (!isAuthenticated()) { setContactErr("Please log in to contact the developer."); return; }
		if (!contactMsg.trim() && !contactName.trim()) { setContactErr("Add your name or a message so the developer can follow up."); return; }
		setContactSending(true); setContactErr(null);
		let delivered = false;
		try {
			await createPropertyInquiry(project.id, { type: "contact", name: contactName.trim(), email: contactEmail.trim(), phone: contactPhone.trim(), message: contactMsg.trim() });
			delivered = true;
		} catch { /* try the DM channel below */ }
		if (project.developer_user_id) {
			try {
				await messageUser(project.developer_user_id, {
					initialMessage: `Enquiry about ${project.name}: ${contactMsg.trim() || "Please get in touch."}${contactPhone.trim() ? ` (Phone: ${contactPhone.trim()})` : ""}`,
					navigate: false,
					sourceVertical: "preconstruct",
				});
				delivered = true;
			} catch { /* noop */ }
		}
		if (delivered) setContactSent(true);
		else setContactErr("Could not send your enquiry. Please try again.");
		setContactSending(false);
	}
	const [intSent, setIntSent] = useState(false);
	const [intErr, setIntErr] = useState(null);
	const [isFollowing, setIsFollowing] = useState(false);
	const [isSaved, setIsSaved] = useState(false);
	const [compareIds, setCompareIds] = useState([]);
	const [compareOpen, setCompareOpen] = useState(false);
	const [specialtyMsg, setSpecialtyMsg] = useState(null);
	const [claimedIncentiveKeys, setClaimedIncentiveKeys] = useState([]);
	const [reservedMoveInKeys, setReservedMoveInKeys] = useState([]);
	const [requestedPackageKeys, setRequestedPackageKeys] = useState([]);

	// Floor plan lightbox closes on Escape.
	useEffect(() => {
		if (!selFloor) return undefined;
		const onKey = (e) => { if (e.key === "Escape") setSelFloor(null); };
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [selFloor]);
	const [tourOpen, setTourOpen] = useState(false);
	const [tourDate, setTourDate] = useState("");
	const [tourTime, setTourTime] = useState("");
	const [tourSent, setTourSent] = useState(false);
	// Survives modal close; rehydrated from server after refresh.
	const [tourBooked, setTourBooked] = useState(false);
	const [tourLoading, setTourLoading] = useState(false);
	const [tourErr, setTourErr] = useState(null);
	const ignoreTourBackdropClose = React.useRef(false);
	const tourPickerGuardTimer = React.useRef(null);

	useEffect(() => {
		if (!project?.id || !isAuthenticated()) return;
		let cancelled = false;
		getMyPropertyEngagement(project.id)
			.then((res) => {
				if (cancelled) return;
				const data = res?.data ?? res ?? {};
				if (data.has_tour) {
					setTourBooked(true);
					if (data.viewing?.viewing_date) {
						const d = new Date(data.viewing.viewing_date);
						if (!Number.isNaN(d.getTime())) {
							setTourDate(d.toISOString().slice(0, 10));
							setTourTime(d.toTimeString().slice(0, 5));
						}
					}
				}
				if (data.has_interest) setIntSent(true);
				if (data.is_following) setIsFollowing(true);
				if (data.is_saved) setIsSaved(true);
				// Dedupe via stable __key__ token in the stored message (not buyer-facing prose).
				// Backend already filters by structured type (incentive / move_in / design_package).
				if (Array.isArray(data.claimed_incentives)) {
					setClaimedIncentiveKeys(specialtyKeysFromMessages(data.claimed_incentives));
				}
				if (Array.isArray(data.reserved_move_ins)) {
					setReservedMoveInKeys(specialtyKeysFromMessages(data.reserved_move_ins));
				}
				if (Array.isArray(data.requested_packages)) {
					setRequestedPackageKeys(specialtyKeysFromMessages(data.requested_packages));
				}
			})
			.catch(() => { /* guest / network — keep defaults */ });
		return () => { cancelled = true; };
	}, [project?.id]);

	const armTourPickerGuard = () => {
		if (tourPickerGuardTimer.current) window.clearTimeout(tourPickerGuardTimer.current);
		ignoreTourBackdropClose.current = true;
	};
	const releaseTourPickerGuard = () => {
		if (tourPickerGuardTimer.current) window.clearTimeout(tourPickerGuardTimer.current);
		tourPickerGuardTimer.current = window.setTimeout(() => {
			ignoreTourBackdropClose.current = false;
			tourPickerGuardTimer.current = null;
		}, 250);
	};
	const commitTourPickerValue = (setter) => (e) => {
		setter(e.target.value);
		e.target.blur();
		releaseTourPickerGuard();
	};
	async function handleBookTour() {
		if (!tourDate || !tourTime) return;
		if (!isAuthenticated()) { setTourErr("Please log in to contact the developer."); return; }
		setTourErr(null);
		setTourLoading(true);
		// Confirm only if the request actually reached the developer (viewing record
		// or DM), so a silent failure isn't shown to the buyer as booked.
		let delivered = false;
		try { await createPropertyViewing(project.id, { date: tourDate, time: tourTime, type: "tour" }); delivered = true; } catch { /* try DM */ }
		if (project.developer_user_id) {
			try {
				await messageUser(project.developer_user_id, {
					initialMessage: `I'd like to book a tour of ${project.name} on ${tourDate} at ${tourTime}.`,
					navigate: false,
					sourceVertical: "preconstruct",
				});
				delivered = true;
			} catch { /* noop */ }
		}
		if (delivered) { setTourSent(true); setTourBooked(true); }
		else setTourErr("Could not send your tour request. Please try again.");
		setTourLoading(false);
	}

	// Prefer real uploaded floor plans only. Sample suite types are used only when
	// the builder has uploaded none — never pad a real listing with fabricated plans.
	const hasUploadedPlans = Array.isArray(project.floor_plans) && project.floor_plans.length > 0;
	const floorPlans = (hasUploadedPlans ? project.floor_plans : FLOOR_PLAN_TYPES).map((fp) => {
		if (!hasUploadedPlans) {
			return {
				...fp,
				price: i18n.t("preconstruct.priceOnRequest"),
				available: fp.id !== "studio" || project.status !== "Sold Out",
				description: null,
				image_url: null,
				original_image_url: null,
				_sample: true,
			};
		}
		const sqft = (fp.sqft_min && fp.sqft_max)
			? `${Number(fp.sqft_min).toLocaleString()}–${Number(fp.sqft_max).toLocaleString()} sq ft`
			: (fp.sqft_min && Number(fp.sqft_min) > 1 ? `${Number(fp.sqft_min).toLocaleString()} sq ft` : i18n.t("preconstruct.sizeTbd"));
		const price = fp.price_min != null
			? `From $${Number(fp.price_min).toLocaleString()}${fp.price_max ? `–$${Number(fp.price_max).toLocaleString()}` : ""}`
			: i18n.t("preconstruct.priceOnRequest");
		return {
			id: fp.floor_plan_id ?? fp.id,
			label: fp.name ?? fp.label,
			sqft,
			beds: fp.beds ?? 0,
			baths: fp.baths ?? 1,
			price,
			description: fp.description || null,
			image_url: fp.image_url || null,
			original_image_url: fp.original_image_url || null,
			availability: fp.availability || (fp.available === false ? "Sold Out" : "Available"),
			unit_count: fp.unit_count ?? null,
			available: String(fp.availability || "available").toLowerCase().replace("_", " ") !== "sold out",
			_sample: false,
		};
	});

	const sectionHead = (label) => (
		<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 16 : 20, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 16 }}>{label}</p>
	);

	if (loading) return (
		<div style={{ flex: 1, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 32, paddingBottom: 24 }}>
			<div style={{ maxWidth: 740, margin: "0 auto" }}>
				<Skel w={130} h={14} r={6} style={{ marginBottom: 24 }} />
				<Skel w="100%" h={isMobile ? 200 : 280} r={16} style={{ marginBottom: 20 }} />
				<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
					{[...Array(4)].map((_,i) => <Skel key={i} w="100%" h={72} r={12} />)}
				</div>
				<Skel w="100%" h={80} r={14} style={{ marginBottom: 20 }} />
				<Skel w="100%" h={120} r={14} style={{ marginBottom: 20 }} />
				<Skel w="100%" h={260} r={14} />
			</div>
		</div>
	);

	return (
		<>
		<div style={{ flex: 1, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 32, paddingBottom: 24 }}>
			<div style={{ maxWidth: 740, margin: "0 auto" }}>

				{/* Back */}
				<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 24, display: "flex", alignItems: "center", gap: 6, padding: 0 }}>{i18n.t("preconstruct.back")}</button>

				{/* Banner / Gallery */}
				{(() => {
					const imgs = project.images ?? [];
					const fallback = typeof project.thumb === "string" && project.thumb.startsWith("http")
						? `url(${project.thumb})`
						: (project.thumb || "linear-gradient(135deg, #1e3a5f, #0f2744)");
					const bg = imgs.length > 0 ? `url(${imgs[galleryIdx]})` : fallback;
					return (
						<div style={{ width: "100%", marginBottom: imgs.length > 1 ? 8 : 20 }}>
							{/* Renders inside a dark-scrimmed hero photo overlay (like Hub.jsx's hero photo
							    section) — the scrim and the text/chrome on top of it stay fixed dark/white in
							    both themes; they need to stay legible over an arbitrary uploaded photo. */}
							<div style={{ width: "100%", height: isMobile ? 200 : 280, background: bg, backgroundSize: "cover", backgroundPosition: "center", borderRadius: 16, position: "relative", overflow: "hidden", display: "flex", alignItems: "flex-end" }}>
								<div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(6,8,16,0.9) 0%, rgba(6,8,16,0.2) 60%, transparent 100%)" }} />
								{imgs.length > 1 && (
									<>
										<button onClick={() => setGalleryIdx(i => (i - 1 + imgs.length) % imgs.length)} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.55)", border: "none", borderRadius: "50%", width: 32, height: 32, color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
										<button onClick={() => setGalleryIdx(i => (i + 1) % imgs.length)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.55)", border: "none", borderRadius: "50%", width: 32, height: 32, color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
										<div style={{ position: "absolute", bottom: 70, right: 14, background: "rgba(0,0,0,0.6)", borderRadius: 20, padding: "3px 10px" }}>
											<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#fff" }}>{galleryIdx + 1}/{imgs.length}</span>
										</div>
									</>
								)}
								<div style={{ position: "relative", padding: isMobile ? "0 20px 18px" : "0 28px 24px" }}>
									<div style={{ display: "inline-block", background: STATUS_COLORS[project.status], borderRadius: 6, padding: "3px 10px", marginBottom: 8 }}>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: "#fff" }}>{project.status}</span>
									</div>
									<h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 28 : 40, color: "#fff", marginBottom: 4, lineHeight: 1 }}>{project.name}</h2>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 13 : 15, color: "rgba(255,255,255,0.6)" }}>{project.location} · {project.units} units · Est. {project.completion}</p>
								</div>
							</div>
							{imgs.length > 1 && (
								<div style={{ display: "flex", gap: 6, marginTop: 8, marginBottom: 12, overflowX: "auto", paddingBottom: 2 }}>
									{imgs.map((url, i) => (
										<div key={i} onClick={() => setGalleryIdx(i)} style={{ width: 60, height: 44, borderRadius: 8, background: `url(${url}) center/cover`, flexShrink: 0, cursor: "pointer", border: galleryIdx === i ? "2px solid #2563eb" : "2px solid transparent", opacity: galleryIdx === i ? 1 : 0.6, transition: "all 0.15s" }} />
									))}
								</div>
							)}
						</div>
					);
				})()}

				{/* Stats grid */}
				<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
					{[
						// Label already says "Starting From" — strip leading "From " on the value.
						{ label: i18n.t("preconstruct.startingFrom"), value: String(project.price || "").replace(/^From\s+/i, "") || "—", accent: "#2563eb" },
						{ label: i18n.t("preconstruct.completion"), value: project.completion, accent: "#f59e0b" },
						{ label: i18n.t("preconstruct.totalUnits"), value: project.units.toString(), accent: "#059669" },
						{ label: i18n.t("preconstruct.status"), value: project.status, accent: STATUS_COLORS[project.status] },
					].map(s => (
						<div key={s.label} className="bg-surface-raised border border-border" style={{ borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 6 }}>{s.label}</p>
							<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 17 : 22, color: s.accent }}>{s.value}</p>
						</div>
					))}
				</div>

				{/* Developer + CTAs */}
				<div className="bg-surface-raised border border-border" style={{ borderRadius: 14, padding: isMobile ? "16px 18px" : "18px 24px", marginBottom: 16, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
					<div
						onClick={() => { if (project.developer_user_id) { window.__profileTargetId = project.developer_user_id; window.__profileVertical = "preconstruct"; window.__nav?.("profile"); } }}
						style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 160, cursor: project.developer_user_id ? "pointer" : "default" }}
					>
						<div style={{ width: 42, height: 42, borderRadius: "50%", background: project.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 17, color: "#fff", flexShrink: 0 }}>{project.avatar}</div>
						<div>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 14 : 15, color: project.developer_user_id ? "#60a5fa" : "var(--color-text-primary)" }}>{project.developer}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>Developer{project.developer_user_id ? " · View Profile →" : ""}</p>
						</div>
						{project.developer_user_id && (
							<button
								onClick={() => {
									window.__profileTargetId = project.developer_user_id;
									window.__profileVertical = "preconstruct";
									window.__nav?.("profile");
								}}
								style={{ padding: "5px 10px", background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 8, color: "#60a5fa", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
							>
								View Profile
							</button>
						)}
					</div>
					<div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
						{intSent ? (
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#059669", padding: "10px 0" }}>{i18n.t("preconstruct.interestRegistered")}</span>
						) : (
							<button onClick={async () => {
							setIntErr(null);
							if (!isAuthenticated()) { setIntErr("Please log in to contact the developer."); return; }
							// Only confirm if the request actually reached the developer (inquiry record or DM).
							let delivered = false;
							try { await createPropertyInquiry(project.id, { type: "interest" }); delivered = true; } catch { /* try DM */ }
							if (project.developer_user_id) {
								try {
									await messageUser(project.developer_user_id, {
										initialMessage: `I'm interested in ${project.name}. Please keep me updated.`,
										navigate: true,
										sourceVertical: "preconstruct",
									});
									delivered = true;
								} catch { /* noop */ }
							}
							if (delivered) setIntSent(true);
							else setIntErr("Could not register your interest. Please try again.");
						}} style={{ background: "#2563eb", border: "none", borderRadius: 10, padding: "10px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 13 : 14, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}>{i18n.t("preconstruct.registerInterest")}</button>
						)}
						{intErr && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", padding: "10px 0", whiteSpace: "nowrap" }}>{intErr}</span>}
						{tourBooked ? (
							<span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#059669", padding: "10px 0", whiteSpace: "nowrap" }}>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
								{i18n.t("preconstruct.tourRequested")}
							</span>
						) : (
							<button onClick={() => setTourOpen(true)} className="bg-surface-raised border border-border text-text-secondary" style={{ borderRadius: 10, padding: "10px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: isMobile ? 13 : 14, cursor: "pointer", whiteSpace: "nowrap" }}>{i18n.t("preconstruct.bookTour")}</button>
						)}
					</div>
				</div>

					<CommunityActionBar
					project={project}
					isFollowing={isFollowing}
					isSaved={isSaved}
					followerCount={project.follower_count}
					onFollowChange={(next) => {
						setIsFollowing(next);
						setProject((prev) => {
							const c = prev.follower_count;
							if (c == null || !Number.isFinite(Number(c))) return prev;
							return { ...prev, follower_count: Math.max(0, Number(c) + (next ? 1 : -1)) };
						});
					}}
					onSaveChange={setIsSaved}
				/>
				<PropertyFinancingCard item={project} source="preconstruct" />
				{specialtyMsg && (
					<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: specialtyMsg.ok ? "#34d399" : "#f87171", marginBottom: 16 }}>{specialtyMsg.text}</p>
				)}

				{/* About */}
				<div style={{ marginBottom: 32 }}>
					{sectionHead(i18n.t("preconstruct.aboutDevelopment"))}
					<div className="bg-surface-raised border border-border" style={{ borderRadius: 14, padding: isMobile ? "18px 20px" : "22px 26px" }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 14 : 15, lineHeight: 1.8 }}>
							{project.description || `${project.name} is a premier new development by ${project.developer}, located in ${project.location}. This ${String(project.category || "project").toLowerCase()} project features ${project.units || "multiple"} thoughtfully designed units starting from ${String(project.price || "pricing on request").replace(/^From\s+/i, "")}, with estimated completion in ${project.completion}.`}
						</p>
					</div>
				</div>

				<CurrentIncentivesSection
					project={project}
					initiallyClaimedKeys={claimedIncentiveKeys}
					onClaim={async (inc) => {
						const itemKey = String(inc.id || inc.title || "").trim();
						try {
							await sendSpecialtyInterest(project.id, `I'd like to claim the incentive: ${inc.title}`, "incentive", itemKey);
							setSpecialtyMsg({ ok: true, text: i18n.t("preconstruct.incentiveSent") });
							setIntSent(true);
							setClaimedIncentiveKeys((prev) => [...prev, itemKey].filter(Boolean));
							return true;
						} catch (e) {
							setSpecialtyMsg({ ok: false, text: e?.message === "auth" ? i18n.t("preconstruct.logInToClaim") : i18n.t("preconstruct.couldNotSend") });
							return false;
						}
					}}
				/>

				<QuickMoveInSection
					project={project}
					initiallyReservedKeys={reservedMoveInKeys}
					onReserve={async (home) => {
						const itemKey = String(home.id || home.address || home.name || "").trim();
						try {
							await sendSpecialtyInterest(project.id, `I'd like to reserve quick move-in: ${home.address || home.name}`, "move_in", itemKey);
							setSpecialtyMsg({ ok: true, text: i18n.t("preconstruct.moveInSent") });
							setIntSent(true);
							setReservedMoveInKeys((prev) => [...prev, itemKey].filter(Boolean));
							return true;
						} catch (e) {
							setSpecialtyMsg({ ok: false, text: e?.message === "auth" ? i18n.t("preconstruct.logInToReserve") : i18n.t("preconstruct.couldNotSend") });
							return false;
						}
					}}
				/>

				{/* Floor Plans — responsive gallery; click a card for a larger preview */}
				<div style={{ marginBottom: 32 }}>
					{sectionHead(i18n.t("preconstruct.floorPlans"))}
					<FloorPlanCompareBar
						floorPlans={floorPlans}
						compareIds={compareIds}
						setCompareIds={setCompareIds}
						onOpenCompare={() => setCompareOpen(true)}
					/>
					<div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 150 : 210}px, 1fr))`, gap: isMobile ? 10 : 14 }}>
						{floorPlans.map(fp => {
							const inCompare = compareIds.includes(fp.id);
							return (
							<div
								key={fp.id}
								role="button"
								tabIndex={0}
								onClick={() => setSelFloor(fp)}
								onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelFloor(fp); } }}
								className="bg-surface-raised" style={{
									border: `1px solid ${inCompare ? "rgba(37,99,235,0.55)" : "var(--color-border)"}`,
									borderRadius: 14, overflow: "hidden", cursor: "pointer",
									transition: "transform 0.15s, box-shadow 0.15s",
									boxShadow: inCompare ? "0 0 0 1px rgba(37,99,235,0.35)" : "none",
								}}
								onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 12px 32px var(--color-shadow)"; }}
								onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = inCompare ? "0 0 0 1px rgba(37,99,235,0.35)" : "none"; }}
							>
								{/* White surface keeps processed (transparent) and original images visually consistent */}
								<div style={{ width: "100%", aspectRatio: "4 / 3", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
									{(fp.image_url || fp.original_image_url) ? (
										<FloorPlanImage plan={fp} imgStyle={{ width: "100%", height: "100%", objectFit: "contain", padding: 8, boxSizing: "border-box", display: "block" }} />
									) : (
										<FloorPlanPlaceholder />
									)}
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											setCompareIds((prev) => {
												if (prev.includes(fp.id)) return prev.filter((x) => x !== fp.id);
												if (prev.length >= 3) return prev;
												return [...prev, fp.id];
											});
										}}
										style={{
											position: "absolute", top: 8, right: 8, zIndex: 2,
											padding: "5px 8px", borderRadius: 8, cursor: "pointer",
											border: inCompare ? "1px solid rgba(37,99,235,0.6)" : "1px solid rgba(15,23,42,0.2)",
											background: inCompare ? "#2563eb" : "rgba(255,255,255,0.92)",
											color: inCompare ? "#fff" : "#0f172a",
											fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700,
											display: "inline-flex", alignItems: "center", gap: 4,
										}}
									>
										{inCompare ? <CheckIcon s={11} /> : <PlusIcon s={11} />}
										{i18n.t("preconstruct.compare")}
									</button>
								</div>
								<div style={{ padding: "10px 12px 12px" }}>
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 13 : 14, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fp.label}{fp._sample ? " · sample" : ""}</p>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 11 : 12, margin: "4px 0 0" }}>
										{fp.beds === 0 ? "Studio" : `${fp.beds} bed`} · {fp.baths} bath · {fp.sqft}
									</p>
									<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 11 : 12, color: "#60a5fa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fp.price}</span>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: fp.available ? "#059669" : "#6b7280", flexShrink: 0 }}>
											{fp.availability || (fp.available ? "Available" : "Sold Out")}
											{fp.unit_count != null ? ` · ${fp.unit_count} units` : ""}
										</span>
									</div>
								</div>
							</div>
							);
						})}
					</div>
				</div>

				<DesignStudioSection
					project={project}
					initiallyRequestedKeys={requestedPackageKeys}
					onRequestPackage={async (pkg) => {
						const itemKey = String(pkg.id || pkg.name || "").trim();
						try {
							await sendSpecialtyInterest(project.id, `Please quote the ${pkg.name} design package${pkg.price_delta ? ` (+$${Number(pkg.price_delta).toLocaleString()})` : ""}.`, "design_package", itemKey);
							setSpecialtyMsg({ ok: true, text: i18n.t("preconstruct.packageSent", { name: pkg.name }) });
							setIntSent(true);
							setRequestedPackageKeys((prev) => [...prev, itemKey].filter(Boolean));
							return true;
						} catch (e) {
							setSpecialtyMsg({ ok: false, text: e?.message === "auth" ? i18n.t("preconstruct.logInToRequestPackage") : i18n.t("preconstruct.couldNotSend") });
							return false;
						}
					}}
				/>

				<AmenitiesSection project={project} />
				<SalesCenterSection project={project} />
				<ConstructionUpdatesSection project={project} />

				{/* Contact */}
				<div style={{ marginBottom: 8 }}>
					{sectionHead("Contact Developer")}
					{contactSent ? (
						<div style={{ background: "rgba(5,150,105,0.08)", border: "1px solid rgba(5,150,105,0.2)", borderRadius: 14, padding: "28px 24px", textAlign: "center" }}>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 14 : 15, color: "#059669" }}>Message sent! {project.developer} will reach out within 1 business day.</p>
						</div>
					) : (
						<div className="bg-surface-raised border border-border" style={{ borderRadius: 14, padding: isMobile ? "20px 20px" : "24px 28px" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 13 : 14, marginBottom: 20 }}>Contact <strong className="text-text-primary">{project.developer}</strong> about {project.name}</p>
							<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 14 }}>
								{[
									{ label: i18n.t("preconstruct.fullName"), placeholder: "Your name", type: "text", val: contactName, set: setContactName },
									{ label: i18n.t("preconstruct.email"), placeholder: "you@email.com", type: "email", val: contactEmail, set: setContactEmail },
									{ label: i18n.t("preconstruct.phone"), placeholder: "+1 (555) 000-0000", type: "tel", val: contactPhone, set: setContactPhone },
								].map(field => (
									<div key={field.label}>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{field.label}</p>
										<input type={field.type} value={field.val} onChange={e => field.set(e.target.value)} placeholder={field.placeholder} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "11px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 14 : 15, outline: "none" }} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
									</div>
								))}
							</div>
							<div style={{ marginBottom: 18 }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{i18n.t("automotive.message")}</p>
								<textarea value={contactMsg} onChange={e => setContactMsg(e.target.value)} rows={4} placeholder={`I'd like to learn more about ${project.name}...`}
									className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "11px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 14 : 15, outline: "none", resize: "vertical" }} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
							</div>
							{contactErr && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#f87171", marginBottom: 12 }}>{contactErr}</p>}
							<button onClick={handleContact} disabled={contactSending} style={{ background: contactSending ? "rgba(37,99,235,0.5)" : "#2563eb", border: "none", borderRadius: 12, padding: "13px 36px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 14 : 15, color: "#fff", cursor: contactSending ? "default" : "pointer" }}>{contactSending ? i18n.t("common.sending") : i18n.t("common.sendMessage")}</button>
						</div>
					)}
				</div>

			</div>
		</div>

		<FloorPlanCompareModal
			open={compareOpen}
			onClose={() => setCompareOpen(false)}
			plans={floorPlans.filter((fp) => compareIds.includes(fp.id))}
		/>

		{/* Tour booking modal */}
		{tourOpen && (
			<div
				// The fixed-overlay scrim stays dark in both themes — it's dimming the page behind
				// a modal, same reasoning as Quotes.jsx's modal backdrop treatment.
				style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
				onClick={(e) => {
					if (e.target !== e.currentTarget) return;
					if (ignoreTourBackdropClose.current) return;
					setTourOpen(false);
				}}
			>
				<div
					onClick={(e) => e.stopPropagation()}
					onMouseDown={(e) => e.stopPropagation()}
					className="bg-surface-raised border border-border" style={{ borderRadius: 18, padding: 28, width: "100%", maxWidth: 400 }}
				>
					{tourSent ? (
						<div style={{ textAlign: "center", padding: "20px 0" }}>
							<div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(37,99,235,0.15)", border: "2px solid #2563eb", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
								<svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
							</div>
							<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 8 }}>{i18n.t("preconstruct.tourRequested")}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 20 }}>Your tour request for {tourDate} at {tourTime} has been sent to {project.developer}.</p>
							<button onClick={() => { setTourOpen(false); setTourSent(false); }} style={{ background: "#2563eb", border: "none", borderRadius: 10, padding: "10px 28px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>{i18n.t("common.done")}</button>
						</div>
					) : (
						<>
							<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, marginBottom: 4 }}>{i18n.t("preconstruct.bookTour")}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 20 }}>{project.name}</p>
							<div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
								<div>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 6 }}>{i18n.t("preconstruct.preferredDate")}</p>
									<input
										type="date"
										value={tourDate}
										onChange={commitTourPickerValue(setTourDate)}
										onFocus={armTourPickerGuard}
										onBlur={releaseTourPickerGuard}
										min={new Date().toISOString().slice(0, 10)}
										// colorScheme stays "dark" regardless of theme — matches the established pattern
										// for native date/time picker chrome (see Quotes.jsx, Catering.jsx).
										className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", colorScheme: "dark" }}
									/>
								</div>
								<div>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 6 }}>{i18n.t("preconstruct.preferredTime")}</p>
									<input
										type="time"
										value={tourTime}
										onChange={commitTourPickerValue(setTourTime)}
										onFocus={armTourPickerGuard}
										onBlur={releaseTourPickerGuard}
										className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", colorScheme: "dark" }}
									/>
								</div>
							</div>
							<div style={{ display: "flex", gap: 10 }}>
								<button onClick={() => setTourOpen(false)} className="border border-border text-text-secondary" style={{ flex: 1, padding: "11px 0", borderRadius: 10, background: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 14, cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
								<button onClick={handleBookTour} disabled={!tourDate || !tourTime || tourLoading} style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: tourDate && tourTime ? "#2563eb" : "var(--color-surface-raised)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: tourDate && tourTime ? "#fff" : "var(--color-text-muted)", cursor: tourDate && tourTime ? "pointer" : "default" }}>{tourLoading ? "Sending…" : "Request Tour"}</button>
							</div>
							{tourErr && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginTop: 10 }}>{tourErr}</p>}
						</>
					)}
				</div>
			</div>
		)}

		{/* Floor plan lightbox — larger preview + full metadata */}
		{selFloor && (
			<div
				onClick={(e) => { if (e.target === e.currentTarget) setSelFloor(null); }}
				// The fixed-overlay scrim stays dark in both themes — it's dimming the page behind
				// a modal, same reasoning as Quotes.jsx's modal backdrop treatment.
				style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? 12 : 24 }}
			>
				<div
					onClick={(e) => e.stopPropagation()}
					className="bg-surface-raised border border-border" style={{
						borderRadius: 18,
						width: "100%", maxWidth: 680, maxHeight: "90vh", overflowY: "auto",
						display: "flex", flexDirection: "column", animation: "fadeUp 0.2s ease both",
					}}
				>
					{/* White surface keeps processed (transparent) and original floor plan images
					    visually consistent — same reasoning as FloorPlanImage's container above. */}
					<div style={{ position: "relative", background: "#fff", borderRadius: "18px 18px 0 0", overflow: "hidden" }}>
						<div style={{ width: "100%", height: isMobile ? "44vh" : "52vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
							{(selFloor.image_url || selFloor.original_image_url) ? (
								<FloorPlanImage plan={selFloor} imgStyle={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", padding: 16, boxSizing: "border-box", display: "block" }} />
							) : (
								<FloorPlanPlaceholder size={64} />
							)}
						</div>
						<button
							onClick={() => setSelFloor(null)}
							aria-label="Close preview"
							style={{
								position: "absolute", top: 12, right: 12, width: 32, height: 32,
								background: "rgba(15,23,42,0.75)", border: "none", borderRadius: "50%",
								color: "#fff", fontSize: 16, cursor: "pointer",
								display: "flex", alignItems: "center", justifyContent: "center",
							}}
						>
							×
						</button>
					</div>
					<div style={{ padding: isMobile ? "16px 18px 20px" : "20px 24px 24px" }}>
						<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
							<div style={{ minWidth: 0 }}>
								<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 20 : 24, margin: 0 }}>{selFloor.label}</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 12 : 13, margin: "4px 0 0" }}>
									{selFloor.beds === 0 ? "Studio" : `${selFloor.beds} bed`} · {selFloor.baths} bath · {selFloor.sqft}
								</p>
							</div>
							<div style={{ textAlign: "right", flexShrink: 0 }}>
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 13 : 14, color: "#60a5fa", margin: 0 }}>{selFloor.price}</p>
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: selFloor.available ? "#059669" : "#6b7280", margin: "3px 0 0" }}>
									{selFloor.availability || (selFloor.available ? "Available" : "Sold Out")}
									{selFloor.unit_count != null ? ` · ${selFloor.unit_count} units` : ""}
								</p>
							</div>
						</div>
						{selFloor.description && (
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 13 : 14, lineHeight: 1.7, margin: "12px 0 0" }}>{selFloor.description}</p>
						)}
						{selFloor.available && (
							<div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--color-border-subtle)" }}>
								{intSent ? (
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#059669", margin: 0 }}>Interest registered! {project.developer} will contact you with more details.</p>
								) : (
									<button onClick={async () => {
										setIntErr(null);
										if (!isAuthenticated()) { setIntErr("Please log in to contact the developer."); return; }
										let delivered = false;
										try { await createPropertyInquiry(project.id, { floor_plan: selFloor.label, type: "interest" }); delivered = true; } catch { /* try DM */ }
										if (project.developer_user_id) {
											try {
												await messageUser(project.developer_user_id, {
													initialMessage: `I'm interested in the ${selFloor.label} floor plan at ${project.name}. Please keep me updated.`,
													navigate: true,
													sourceVertical: "preconstruct",
												});
												delivered = true;
											} catch { /* noop */ }
										}
										if (delivered) setIntSent(true);
										else setIntErr("Could not register your interest. Please try again.");
									}} style={{ background: "#2563eb", border: "none", borderRadius: 10, padding: "10px 22px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 13 : 14, color: "#fff", cursor: "pointer" }}>{i18n.t("preconstruct.registerInterest")} — {selFloor.label}</button>
								)}
								{intErr && !intSent && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", margin: "8px 0 0" }}>{intErr}</p>}
							</div>
						)}
					</div>
				</div>
			</div>
		)}
		</>
	);
}

function getUserCountry() {
	try {
		const loc = getLocationItem('strug_user_location');
		if (loc) { const p = JSON.parse(loc); if (p.address) { const parts = p.address.split(','); return parts[parts.length - 1].trim().toLowerCase(); } }
		const u = JSON.parse(sessionStorage.getItem('strug_user') || '{}');
		if (u.saved_address) { const parts = u.saved_address.split(','); return parts[parts.length - 1].trim().toLowerCase(); }
	} catch { /* noop */ }
	return null;
}

function PreconstructPage() {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("preconstruct");
	const categories = useI18nCategoryList(PRECONSTRUCT_CATEGORY_DEFS);
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [activeCategory, setActiveCategory] = useState("all");
	const [priceFilter, setPriceFilter] = useState("any");
	const [query, setQuery] = useState("");
	const [selectedProject, setSelectedProject] = useState(null);
	const [projects, setProjects] = useState([]);
	const [listError, setListError] = useState(null);
	const [showInternational, setShowInternational] = useState(true);
	// Map-first discovery (Livabl-style): map is the default browse mode.
	const [viewMode, setViewMode] = useState("map");
	const [focusId, setFocusId] = useState(null);
	const [geocoding, setGeocoding] = useState(false);
	const userCountry = getUserCountry();
	const mapRef = useRef(null);
	const listItemRefs = useRef({});
	const geocodeDone = useRef(new Set()); // success or hard-fail only — never mark before await (Strict Mode safe)
	const geocodeInFlight = useRef(new Set());
	const markerRefs = useRef({});

	useEffect(() => {
		setListError(null);
		getProperties({ vertical: 'preconstruction', sort: 'featured' }).then(data => {
			const arr = Array.isArray(data) ? data : (data?.data ?? []);
			setProjects(arr.map(p => {
				const gallery = Array.isArray(p.images) ? p.images.map(img => img.url || img).filter(Boolean) : [];
				const legacyImg = (() => {
					const raw = p.image_url ?? p.image;
					if (!raw) return [];
					try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : [raw]; } catch { return [raw]; }
				})();
				const images = gallery.length ? gallery : legacyImg;
				const priceMin = p.price_min ?? p.estimated_value;
				const priceMax = p.price_max;
				const priceLabel = priceMin != null
					? (priceMax != null && priceMax !== priceMin
						? `From $${Number(priceMin).toLocaleString()}–$${Number(priceMax).toLocaleString()}`
						: `From $${Number(priceMin).toLocaleString()}`)
					: "Pricing coming soon";
				const status = p.listing_status || p.status || "Selling";
				const latRaw = parseFloat(p.latitude);
				const lngRaw = parseFloat(p.longitude);
				return {
					id: p.property_id ?? p.id,
					name: p.property_name ?? p.name ?? p.address ?? "Development",
					developer: p.developer_name || p.user?.name || "Developer",
					developer_user_id: p.user_id ?? p.user?.user_id ?? null,
					avatar: (p.developer_name || p.user?.name || "D")[0]?.toUpperCase(),
					avatarColor: "#7c3aed",
					location: [p.neighborhood, p.city, p.province].filter(Boolean).join(", ") || p.address || "",
					city: p.city || "",
					address: p.address || "",
					units: p.total_units ?? 0,
					price: priceLabel,
					priceNum: priceMin != null ? Number(priceMin) : null,
					completion: p.completion_date || "TBD",
					status,
					category: p.type || "Condos",
					construction_status: p.construction_status,
					amenities: Array.isArray(p.amenities) ? p.amenities : [],
					incentives: Array.isArray(p.incentives) ? p.incentives : [],
					move_in_homes: Array.isArray(p.move_in_homes) ? p.move_in_homes : [],
					design_packages: Array.isArray(p.design_packages) ? p.design_packages : [],
					sales_center_address: p.sales_center_address,
					sales_center_phone: p.sales_center_phone,
					sales_center_email: p.sales_center_email,
					sales_center_hours: p.sales_center_hours,
					virtual_tour_url: p.virtual_tour_url,
					video_url: p.video_url,
					builder_website: p.builder_website,
					description: p.description,
					floor_plans: Array.isArray(p.floor_plans) ? p.floor_plans : [],
					updates: Array.isArray(p.updates) ? p.updates : [],
					follower_count: p._count?.followers ?? null,
					images,
					thumb: images[0] || "linear-gradient(135deg, #1e3a5f, #0f2744)",
					is_featured: !!p.is_featured,
					is_verified: !!p.is_verified,
					trust_label: p.trust_label || (p.is_verified ? "verified" : "unverified"),
					seller_type: p.seller_type || null,
					lat: Number.isFinite(latRaw) ? latRaw : null,
					lng: Number.isFinite(lngRaw) ? lngRaw : null,
					_raw: p,
				};
			}));
		}).catch(() => setListError("Could not load developments. Please try again."));
	}, []);

	// Geocode listings missing coordinates. Prefer Photon; avoid marking "done" before await
	// so React Strict Mode remounts don't permanently skip pins.
	useEffect(() => {
		let cancelled = false;
		const need = projects.filter((p) => {
			if (p.lat != null && p.lng != null) return false;
			if (geocodeDone.current.has(p.id) || geocodeInFlight.current.has(p.id)) return false;
			return !!(p.location || p.city || p.address);
		});
		if (!need.length) return undefined;

		need.forEach((p) => geocodeInFlight.current.add(p.id));
		setGeocoding(true);

		(async () => {
			const updates = {};
			for (const p of need) {
				if (cancelled) break;
				const queryAddr = [p.address, p.location, p.city].filter(Boolean).join(", ") || p.name;
				try {
					const pt = await resolveProjectCoords(queryAddr);
					if (cancelled) break;
					if (pt) updates[p.id] = pt;
					geocodeDone.current.add(p.id);
				} catch {
					if (!cancelled) geocodeDone.current.add(p.id);
				} finally {
					geocodeInFlight.current.delete(p.id);
				}
			}
			// Apply even after Strict Mode cleanup — otherwise pins never appear.
			if (Object.keys(updates).length) {
				setProjects((prev) => prev.map((p) => (updates[p.id] ? { ...p, ...updates[p.id] } : p)));
			}
			setGeocoding(false);
		})();

		return () => {
			cancelled = true;
			// Free in-flight ids so the remounted effect can retry.
			need.forEach((p) => geocodeInFlight.current.delete(p.id));
		};
	}, [projects]);

	useEffect(() => {
		if (!focusId) return;
		const el = listItemRefs.current[focusId];
		if (el?.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
	}, [focusId]);

	if (selectedProject) return <PreconstructDetailPage project={selectedProject} onBack={() => setSelectedProject(null)} />;

	const countryFiltered = (!showInternational && userCountry)
		? projects.filter(p => p.location && p.location.toLowerCase().includes(userCountry))
		: projects;
	// If "My Country" would hide every community, fall back to the full catalog so the map isn't empty.
	const countrySafe = (!showInternational && userCountry && countryFiltered.length === 0 && projects.length > 0)
		? projects
		: countryFiltered;
	const filtered = countrySafe
		.filter(p => matchesCategory(activeCategory, p.category, categories))
		.filter(p => matchesPriceFilter(p, priceFilter))
		.filter(p => !query || p.name.toLowerCase().includes(query.toLowerCase()) || p.location.toLowerCase().includes(query.toLowerCase()) || (p.developer || "").toLowerCase().includes(query.toLowerCase()));

	const mappable = filtered.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
	const focusProject = mappable.find((p) => p.id === focusId) || null;
	const mapPoints = mappable.map((p) => [p.lat, p.lng]);
	const showMap = viewMode === "map";
	const mapReadyKey = `${mappable.length}:${mappable.map((p) => p.id).join(",")}`;

	const openProject = (project) => setSelectedProject(project);
	const selectOnMap = (project) => {
		setFocusId(project.id);
		setViewMode("map");
		const marker = markerRefs.current[project.id];
		if (marker?.openPopup) {
			try { marker.openPopup(); } catch { /* leaflet timing */ }
		}
	};

	// The map itself (dark CartoDB basemap tiles) and its pins, popups, and floating overlay
	// chrome below stay dark in both themes — the tiles don't retheme, so overlays on top of
	// them must stay dark for legibility, same reasoning as Quotes.jsx's map treatment.
	const mapEl = (
		<div style={{ position: "relative", flex: 1, minHeight: isMobile ? 280 : 480, height: "100%", display: "flex", flexDirection: "column" }}>
			<MapContainer
				key={mappable.length ? `pins-${mappable[0].id}` : "empty"}
				center={mappable[0] ? [mappable[0].lat, mappable[0].lng] : DEFAULT_MAP_CENTER}
				zoom={mappable.length ? 12 : 3}
				style={{ flex: 1, minHeight: isMobile ? 280 : 480, height: "100%", width: "100%", background: "#0b1220" }}
				scrollWheelZoom
				attributionControl={false}
			>
				<TileLayer
					url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
					attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
				/>
				<PreconstructMapCapture mapRef={mapRef} />
				<PreconstructMapInvalidate triggerKey={mapReadyKey} />
				{!focusProject && mapPoints.length > 0 && <FitLeafletBounds points={mapPoints} maxZoom={13} />}
				{focusProject && <PreconstructMapFlyTo project={focusProject} />}
				{mappable.map((project) => (
					<Marker
						key={project.id}
						position={[project.lat, project.lng]}
						icon={preconPinIcon(project, focusId === project.id)}
						zIndexOffset={focusId === project.id ? 1000 : 0}
						eventHandlers={{
							click: () => setFocusId(project.id),
							popupopen: (e) => {
								const root = e.popup?.getElement?.();
								if (!root) return;
								const wrap = root.querySelector(".leaflet-popup-content-wrapper");
								const tip = root.querySelector(".leaflet-popup-tip");
								const close = root.querySelector(".leaflet-popup-close-button");
								if (wrap) {
									wrap.style.background = "#0f172a";
									wrap.style.color = "#f8fafc";
									wrap.style.borderRadius = "14px";
									wrap.style.border = "1px solid rgba(255,255,255,0.12)";
									wrap.style.boxShadow = "0 12px 40px rgba(0,0,0,0.5)";
								}
								if (tip) tip.style.background = "#0f172a";
								if (close) close.style.color = "rgba(255,255,255,0.55)";
							},
						}}
						ref={(ref) => {
							if (ref) markerRefs.current[project.id] = ref;
							else delete markerRefs.current[project.id];
						}}
					>
						<Popup className="precon-map-popup">
							<div style={{ fontFamily: "'DM Sans', sans-serif", minWidth: 180, maxWidth: 240 }}>
								<p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#f8fafc", lineHeight: 1.3 }}>{project.name}</p>
								<p style={{ margin: "0 0 10px", fontSize: 12, color: "#94a3b8", lineHeight: 1.4 }}>{project.location || project.developer}</p>
								<p style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#93c5fd" }}>{project.price}</p>
								<button
									type="button"
									onClick={() => openProject(project)}
									style={{
										width: "100%", border: "none", borderRadius: 10, padding: "10px 12px",
										background: "#2563eb", color: "#ffffff", fontWeight: 700, fontSize: 13,
										fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
									}}
								>
									{i18n.t("preconstruct.viewProject")}
								</button>
							</div>
						</Popup>
					</Marker>
				))}
			</MapContainer>
			<LeafletMapControls
				mapRef={mapRef}
				onRecenter={() => {
					if (!mapPoints.length || !mapRef.current) return;
					fitLeafletMap(mapRef.current, mapPoints, { maxZoom: 13 });
					try { mapRef.current.invalidateSize({ animate: false }); } catch { /* noop */ }
				}}
				bottom={isMobile ? 18 : 14}
			/>
			{geocoding && (
				<div style={{
					position: "absolute", top: 12, left: 12, zIndex: 1000,
					background: "rgba(13,16,26,0.9)", border: "1px solid rgba(255,255,255,0.12)",
					borderRadius: 10, padding: "8px 12px", fontFamily: "'DM Sans', sans-serif",
					fontSize: 12, color: "rgba(255,255,255,0.75)",
				}}>
					{i18n.t("preconstruct.geocodingMap")}
				</div>
			)}
			{!geocoding && !listError && filtered.length > 0 && mappable.length === 0 && (
				<div style={{
					position: "absolute", inset: 0, zIndex: 900, display: "flex", alignItems: "center",
					justifyContent: "center", background: "rgba(10,12,18,0.55)", padding: 24, textAlign: "center",
				}}>
					<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "rgba(255,255,255,0.8)", maxWidth: 320, margin: 0 }}>
						{i18n.t("preconstruct.noMapLocations")}
					</p>
				</div>
			)}
		</div>
	);

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", width: "100%" }}>
				<div style={{ padding: "28px 0 20px" }}>
					<SkeletonHeading />
					<div style={{ display: "flex", gap: 20, margin: "16px 0 28px" }}>
						{[...Array(8)].map((_,i) => <SkeletonCircle key={i} />)}
					</div>
				</div>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
					{[...Array(6)].map((_,i) => <SkeletonREListingCard key={i} />)}
				</div>
			</div>
		</div>
	);

	const headerBlock = (
		<div style={{ padding: showMap && !isMobile ? "20px 0 12px" : "28px 0 16px", animation: "fadeUp 0.3s ease both", flexShrink: 0 }}>
			<h1 className="text-text-primary" style={{
				fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800,
				fontSize: showMap && !isMobile ? "clamp(24px, 2.4vw, 34px)" : "clamp(28px, 3vw, 42px)",
				letterSpacing: "0.04em", textTransform: "uppercase",
				textAlign: "center", marginBottom: 14,
			}}>{landingTitle}</h1>
			<div style={{ width: "min(720px, 100%)", margin: "0 auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
				<div className="od-search-wrap" style={{ flex: 1, minWidth: isMobile ? "100%" : 220 }}>
					<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "12px 16px", gap: 12 }}>
						<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={20} /></div>
						<input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 15, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} />
					</div>
				</div>
				<div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
					{userCountry && (
						<button onClick={() => setShowInternational(v => !v)} style={{ padding: "9px 12px", background: showInternational ? "rgba(37,99,235,0.15)" : "rgba(37,99,235,0.3)", border: `1px solid ${showInternational ? "rgba(37,99,235,0.3)" : "rgba(37,99,235,0.6)"}`, borderRadius: 12, color: showInternational ? "var(--color-text-secondary)" : "#60a5fa", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
							{showInternational ? t("preconstruct.regionInternational") : t("preconstruct.regionMyCountry")}
						</button>
					)}
					<div className="bg-surface-raised border border-border" style={{ display: "flex", borderRadius: 12, padding: 3, gap: 2 }}>
						<button
							type="button"
							onClick={() => setViewMode("map")}
							style={{
								display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: "none",
								background: showMap ? "#2563eb" : "transparent", color: showMap ? "#fff" : "var(--color-text-primary)",
								fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer",
							}}
						>
							<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
							{t("preconstruct.showMap")}
						</button>
						<button
							type="button"
							onClick={() => setViewMode("list")}
							style={{
								display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: "none",
								background: !showMap ? "#2563eb" : "transparent", color: !showMap ? "#fff" : "var(--color-text-primary)",
								fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer",
							}}
						>
							<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
							{t("preconstruct.showList")}
						</button>
					</div>
				</div>
			</div>
		</div>
	);

	const filtersBlock = (
		<>
			<div style={{ display: "flex", gap: 20, marginBottom: 12, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none", msOverflowStyle: "none", justifyContent: showMap && !isMobile ? "flex-start" : "center", animation: "fadeUp 0.35s ease 60ms both", flexShrink: 0 }}>
				{categories.map((cat, i) => (
					<LeoButton key={cat.id} cat={cat} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 30} />
				))}
			</div>
			<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: showMap ? 12 : 20, justifyContent: showMap && !isMobile ? "flex-start" : "center", flexShrink: 0 }}>
				{PRICE_FILTER_DEFS.map((pf) => {
					const active = priceFilter === pf.id;
					return (
						<button
							key={pf.id}
							type="button"
							onClick={() => setPriceFilter(pf.id)}
							style={{
								padding: "7px 14px", borderRadius: 20, border: `1px solid ${active ? "#2563eb" : "var(--color-border)"}`,
								background: active ? "rgba(37,99,235,0.18)" : "var(--color-surface-raised)",
								color: active ? "#60a5fa" : "var(--color-text-secondary)",
								fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer",
							}}
						>
							{t(pf.labelKey)}
						</button>
					);
				})}
			</div>
			{(() => {
				const searchFilters = buildPreconstructSearchFilters({
					query, priceFilter, activeCategory, categories, priceDefs: PRICE_FILTER_DEFS,
				});
				const canSave = Object.keys(searchFilters).length > 0;
				return (
					<div style={{ marginBottom: showMap ? 10 : 16, flexShrink: 0 }}>
						<PropertySavedSearches
							vertical="preconstruct"
							filters={searchFilters}
							canSave={canSave}
							onApply={(f) => {
								setQuery(f.q || "");
								if (f.price_filter) setPriceFilter(f.price_filter);
								else if (f.max_price || f.min_price) {
									const match = PRICE_FILTER_DEFS.find((p) =>
										(f.max_price ? p.max === Number(f.max_price) : true) &&
										(f.min_price ? p.min === Number(f.min_price) : p.min == null)
									);
									setPriceFilter(match?.id || "any");
								} else {
									setPriceFilter("any");
								}
								if (f.category) setActiveCategory(f.category);
								else if (f.type) {
									const cat = categories.find((c) => c.match === f.type);
									setActiveCategory(cat?.id || "all");
								} else {
									setActiveCategory("all");
								}
							}}
						/>
					</div>
				);
			})()}
			<span className="text-text-muted" style={{
				display: "block", textAlign: showMap && !isMobile ? "left" : "center",
				fontFamily: "'DM Sans', sans-serif", fontSize: 12,
				marginBottom: showMap ? 8 : 12,
			}}>
				{i18n.t("preconstruct.communitiesOnMap", { count: showMap ? mappable.length : filtered.length })}
			</span>
		</>
	);

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : (showMap ? 24 : 48), overflow: "hidden" }}>
			{/* Desktop map-first split */}
			{showMap && !isMobile ? (
				<div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
					{headerBlock}
					{filtersBlock}
					{listError && (
						<p style={{ textAlign: "center", color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 12 }}>{listError}</p>
					)}
					<div style={{ flex: 1, minHeight: 0, display: "flex", gap: 16, paddingBottom: 20 }}>
						<div className="bg-surface border border-border-subtle" style={{
							width: 400, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0,
							borderRadius: 16, overflow: "hidden",
						}}>
							<div style={{ padding: "12px 14px", borderBottom: "1px solid var(--color-border-subtle)", flexShrink: 0 }}>
								<p className="text-text-primary" style={{ margin: 0, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "0.04em", textTransform: "uppercase" }}>
									{i18n.t("preconstruct.mapFirst")} · {filtered.length}
								</p>
							</div>
							<div style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
								{!listError && filtered.length === 0 && (
									<p className="text-text-muted" style={{ textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: "28px 12px" }}>
										No new construction communities match your search yet. Developers can publish from the Preconstruction seller dashboard.
									</p>
								)}
								{filtered.map((project) => (
									<div key={project.id || project.name} ref={(el) => { if (el) listItemRefs.current[project.id] = el; }}>
										<PreconstructMapRow
											project={project}
											selected={focusId === project.id}
											onSelect={selectOnMap}
											onOpen={openProject}
										/>
									</div>
								))}
							</div>
						</div>
						<div className="border border-border" style={{
							flex: 1, minWidth: 0, minHeight: 480, borderRadius: 16, overflow: "hidden",
							display: "flex", flexDirection: "column",
							animation: "fadeUp 0.25s ease both",
						}}>
							{mapEl}
						</div>
					</div>
				</div>
			) : (
				<div style={{ flex: 1, display: "flex", flexDirection: "column", width: "100%", overflow: "hidden" }}>
					{headerBlock}
					{filtersBlock}
					{!showMap && (
						<div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }}>
							{listError && (
								<p style={{ textAlign: "center", color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 16 }}>{listError}</p>
							)}
							{!listError && filtered.length === 0 && (
								<p className="text-text-muted" style={{ textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 14, padding: "40px 0" }}>
									No new construction communities match your search yet. Developers can publish from the Preconstruction seller dashboard.
								</p>
							)}
							<div style={{ display: "flex", flexWrap: "wrap", gap: 20, justifyContent: "center", width: "100%" }}>
								{filtered.map((project, i) => (
									<PreconstructCard
										key={project.id || project.name}
										project={project}
										delay={i * 40}
										onOpen={() => openProject(project)}
									/>
								))}
							</div>
						</div>
					)}
					{/* Mobile map: fullscreen overlay with bottom card strip. This whole shell stays
					    dark in both themes — it's the map-browsing chrome wrapped around `mapEl`,
					    same reasoning as the dark CartoDB basemap it contains. */}
					{showMap && isMobile && (
						<div style={{ position: "fixed", inset: 0, zIndex: 300, background: "#0a0a0e", display: "flex", flexDirection: "column", animation: "fadeUp 0.2s ease both" }}>
							<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top,0px) + 12px) 14px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0, gap: 10 }}>
								<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em" }}>{t("preconstruct.showMap")}</span>
								<button onClick={() => setViewMode("list")} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 20, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
									{t("preconstruct.showList")}
								</button>
							</div>
							<div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
								{mapEl}
								{filtered.length > 0 && (
									<div style={{
										position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 1100,
										padding: "0 12px calc(env(safe-area-inset-bottom,0px) + 12px)",
										background: "linear-gradient(180deg, transparent, rgba(10,12,18,0.92) 28%)",
									}}>
										<div style={{ display: "flex", gap: 10, overflowX: "auto", paddingTop: 28, paddingBottom: 4, scrollbarWidth: "none" }}>
											{filtered.map((project) => (
												<div key={project.id} style={{ width: 280, flexShrink: 0 }}>
													<PreconstructMapRow
														project={project}
														selected={focusId === project.id}
														onSelect={selectOnMap}
														onOpen={openProject}
													/>
												</div>
											))}
										</div>
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export { PreconstructPage };
