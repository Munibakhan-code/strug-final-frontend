import { useState, useEffect, useRef, useMemo } from "react";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList } from "../hooks/useI18nCategoryList.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon, RealEstateIcon } from "../components/icons.jsx";
import { Skel, SkeletonCircle, SkeletonHeading, SkeletonREListingCard } from "../components/skeletons.jsx";
import { LeoButton, ODMiniCalendar } from "../components/shared.jsx";
import { getProperties, getRentalListings, createPropertyViewing, createPropertyInquiry, cancelPropertyViewing, reportProperty } from "../api/realestate";
import { messageUser } from "../api/chat";
import { getUser, isAuthenticated } from "../store/auth";
import { trackAdEvent } from "../api/ads";
import { toggleSave as toggleSaveApi, getSaves } from "../api/saves";
import PropertySavedSearches, { buildRealEstateSearchFilters } from "../components/PropertySavedSearches.jsx";
import PropertyFinancingCard from "../components/PropertyFinancingCard.jsx";

// Sponsored CTA label per backend cta_text enum.
const AD_CTA_LABELS = { LEARN_MORE: "Learn More", SHOP_NOW: "Shop Now", BOOK_NOW: "Book Now", ORDER_NOW: "Order Now", SUBSCRIBE: "Subscribe", APPLY_NOW: "Apply Now" };

// Advertiser-controlled target_url → only allow http(s) (XSS guard).
function isSafeHttpUrl(u) {
	try { const p = new URL(u, window.location.origin); return p.protocol === "http:" || p.protocol === "https:"; }
	catch { return false; }
}

// Opens an advertiser's click-through URL and records the click. Best-effort.
function openSponsored(card) {
	if (!card || !isSafeHttpUrl(card.target_url)) return;
	if (card.campaign_id) trackAdEvent(card.campaign_id, "click").catch(() => {});
	window.open(card.target_url, "_blank", "noopener,noreferrer");
}

const RE_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#2563eb", match: null },
	{ id: "for-sale", labelKey: "realestate.forSale", color: "#059669", match: "For Sale" },
	{ id: "for-rent", labelKey: "realestate.forRent", color: "#d97706", match: "For Rent" },
	{ id: "category-lease", labelKey: "realestate.categoryLease", color: "#0ea5e9", match: "Lease" },
	{ id: "under-offer", labelKey: "realestate.statusUnderOffer", color: "#3b82f6", match: "Under Offer" },
	{ id: "sold", labelKey: "realestate.statusSold", color: "#ef4444", match: "Sold" },
	{ id: "category-auction", labelKey: "realestate.categoryAuction", color: "#f43f5e", match: "Auction" },
	{ id: "category-commercial", labelKey: "realestate.categoryCommercial", color: "#7c3aed", match: "Commercial" },
	{ id: "category-land", labelKey: "realestate.categoryLand", color: "#65a30d", match: "Land" },
	{ id: "category-luxury", labelKey: "realestate.categoryLuxury", color: "#f59e0b", match: "Luxury" },
	{ id: "category-new-build", labelKey: "realestate.categoryNewBuild", color: "#0891b2", match: "New Build" },
	{ id: "category-foreclosure", labelKey: "realestate.categoryForeclosure", color: "#dc2626", match: "Foreclosure" },
];

/** Match a listing against a category chip using listing_status, type tags, and category label. */
function listingMatchesCategory(listing, activeCategory, categories) {
	if (!activeCategory || activeCategory === "all") return true;
	const def = categories.find((c) => c.id === activeCategory);
	const match = (def?.match || "").toLowerCase();
	if (!match) return true;
	const hay = [
		listing.category,
		listing.status,
		listing.listing_status,
		...(Array.isArray(listing.tags) ? listing.tags : []),
	]
		.filter(Boolean)
		.map((s) => String(s).toLowerCase());
	return hay.some((h) => h === match || h.includes(match));
}

const RE_PROP_TYPES = ["All types", "House", "Condo", "Townhouse", "Apartment", "Land", "Commercial"];

const RE_TYPE_KEYS = {
	"All types": "allTypes",
	House: "typeHouse",
	Condo: "typeCondo",
	Townhouse: "typeTownhouse",
	Apartment: "typeApartment",
	Land: "categoryLand",
	Commercial: "categoryCommercial",
};

function reTypeLabel(type, tFn) {
	return RE_TYPE_KEYS[type] ? tFn(`realestate.${RE_TYPE_KEYS[type]}`) : type;
}

const GRADIENTS = [
	"linear-gradient(135deg, #1e3a5f 0%, #0d2a3d 100%)",
	"linear-gradient(135deg, #1a2e1a 0%, #0d1f0d 100%)",
	"linear-gradient(135deg, #2e1a3a 0%, #1a0d2e 100%)",
	"linear-gradient(135deg, #2e2a1a 0%, #1f1a0d 100%)",
	"linear-gradient(135deg, #1a2e2e 0%, #0d1f1f 100%)",
	"linear-gradient(135deg, #2e1a1a 0%, #1f0d0d 100%)",
];

const STATUS_COLOR = {
	Available: "#22c55e",
	Sold: "#ef4444",
	Leased: "#f59e0b",
	"Under Offer": "#3b82f6",
	Pending: "#a78bfa",
};

// Google Maps chrome — the custom `styles` array below renders a dark map deliberately,
// regardless of site theme (like map chrome elsewhere), so all colors in this component
// stay hardcoded rather than tokenized.
function REPropertyMap({ location }) {
	const mapRef = useRef(null);
	useEffect(() => {
		if (!location || !mapRef.current || !window.google?.maps) return;
		const geocoder = new window.google.maps.Geocoder();
		geocoder.geocode({ address: location }, (results, status) => {
			if (status !== "OK" || !results[0]) return;
			const latLng = results[0].geometry.location;
			const map = new window.google.maps.Map(mapRef.current, {
				center: latLng,
				zoom: 15,
				disableDefaultUI: true,
				zoomControl: true,
				styles: [{ elementType: "geometry", stylers: [{ color: "#0d1421" }] }, { elementType: "labels.text.stroke", stylers: [{ color: "#0d1421" }] }, { elementType: "labels.text.fill", stylers: [{ color: "#6c7a9c" }] }, { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a2540" }] }, { featureType: "water", elementType: "geometry", stylers: [{ color: "#08121f" }] }],
			});
			new window.google.maps.Marker({ map, position: latLng, title: location });
		});
	}, [location]);
	return (
		<div style={{ borderRadius: 16, overflow: "hidden", height: 200, marginBottom: 20, border: "1px solid rgba(255,255,255,0.08)", background: "#0d1421" }}>
			<div ref={mapRef} style={{ width: "100%", height: "100%" }} />
			{!window.google?.maps && (
				<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
					<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
					<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{location}</p>
				</div>
			)}
		</div>
	);
}

// This card's whole body (photo + the info panel below it) sits on `listing.gradient`, one
// of the fixed dark GRADIENTS above, chosen deliberately for legibility of the overlaid
// price/text — like Hub.jsx's hero photo, it stays dark regardless of site theme, so colors
// throughout this component (including the non-photo info panel) stay hardcoded.
function REListingCard({ listing, delay = 0, onClick, saved = false, onToggleSave }) {
	const statusColor = STATUS_COLOR[listing.status] ?? "#22c55e";
	// Sponsored shadow-listing — synthetic id; click-through only, no save/detail.
	const adMode = !!listing.is_ad;
	useEffect(() => { if (adMode && listing.campaign_id) trackAdEvent(listing.campaign_id, "impression").catch(() => {}); }, [adMode, listing.campaign_id]);
	return (
		<div onClick={onClick} style={{ borderRadius: 16, background: listing.gradient, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", display: "flex", flexDirection: "column", animation: `fadeUp 0.4s ease ${delay}ms both`, cursor: onClick ? "pointer" : "default" }}>
			{/* Image area */}
			<div style={{ height: 160, position: "relative", background: listing.gradient, overflow: "hidden" }}>
				{listing.image
					? <img loading="lazy" decoding="async" src={listing.image} alt={listing.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none"; }} />
					: <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><RealEstateIcon s={40} /></div>
				}
				<div style={{ position: "absolute", top: 10, left: 10, background: adMode ? "rgba(245,158,11,0.16)" : "rgba(0,0,0,0.55)", border: adMode ? "1px solid rgba(245,158,11,0.4)" : "none", borderRadius: 20, padding: "4px 10px" }}>
					<span style={{ fontSize: 10, fontWeight: 700, color: adMode ? "#f59e0b" : "#fff", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase" }}>{listing.category}</span>
				</div>
				{!adMode && listing._kind === "property" && (
					<div style={{
						position: "absolute", bottom: 10, left: 10,
						background: listing.verified || listing.trust_label === "verified"
							? "rgba(34,197,94,0.2)"
							: listing.trust_label === "approved_seller"
								? "rgba(37,99,235,0.2)"
								: "rgba(245,158,11,0.18)",
						border: `1px solid ${listing.verified || listing.trust_label === "verified" ? "rgba(34,197,94,0.45)" : listing.trust_label === "approved_seller" ? "rgba(37,99,235,0.45)" : "rgba(245,158,11,0.4)"}`,
						borderRadius: 20, padding: "3px 9px",
					}}>
						<span style={{
							fontSize: 10, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
							color: listing.verified || listing.trust_label === "verified" ? "#4ade80" : listing.trust_label === "approved_seller" ? "#60a5fa" : "#fbbf24",
						}}>
							{listing.verified || listing.trust_label === "verified" ? "Verified" : listing.trust_label === "approved_seller" ? "Approved seller" : "Unverified"}
						</span>
					</div>
				)}
				{!adMode && (
					<div style={{ position: "absolute", top: 10, right: 44, background: "rgba(0,0,0,0.68)", border: `1px solid ${statusColor}`, borderRadius: 20, padding: "4px 9px" }}>
						<span style={{ fontSize: 10, fontWeight: 700, color: statusColor, fontFamily: "'DM Sans', sans-serif" }}>{listing.status ?? i18n.t("realestate.statusAvailable")}</span>
					</div>
				)}
				{!adMode && (
					<button onClick={e => { e.stopPropagation(); onToggleSave && onToggleSave(listing); }} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.45)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: saved ? "#2563eb" : "rgba(255,255,255,0.6)" }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
					</button>
				)}
			</div>
			{/* Info */}
			<div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
				<div>
					<p style={{ fontSize: 15, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", marginBottom: 3 }}>{listing.name}</p>
					<p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif" }}>{listing.location}</p>
				</div>
				{(listing.beds > 0 || listing.baths > 0 || listing.sqft > 0) && (
					<div style={{ display: "flex", gap: 14 }}>
						{listing.beds > 0 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif" }}>{listing.beds} bd</span>}
						{listing.baths > 0 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif" }}>{listing.baths} ba</span>}
						{listing.sqft > 0 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif" }}>{listing.sqft.toLocaleString()} sqft</span>}
					</div>
				)}
				{listing.tags.length > 0 && (
					<div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
						{listing.tags.map(t => (
							<span key={t} style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif", background: "rgba(255,255,255,0.05)", padding: "2px 7px", borderRadius: 10 }}>{t}</span>
						))}
					</div>
				)}
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 6 }}>
					<span style={{ fontSize: 20, fontWeight: 800, color: "#2563eb", fontFamily: "'Barlow Condensed', sans-serif" }}>{listing.priceLabel}</span>
					<button style={{ background: "#2563eb", border: "none", borderRadius: 8, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, padding: "7px 14px", cursor: "pointer" }}>{adMode ? (AD_CTA_LABELS[listing.cta_text] || "Learn More") : i18n.t("common.view")}</button>
				</div>
			</div>
		</div>
	);
}

function RealEstatePage() {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("realestate");
	const categories = useI18nCategoryList(RE_CATEGORY_DEFS);
	const { isMobile } = useViewport();
	const loading = usePageLoad();
	const [activeCategory, setActiveCategory] = useState("all");
	const [query, setQuery] = useState("");
	const [selectedListing, setSelectedListing] = useState(null);
	const [filterBeds, setFilterBeds] = useState(0);
	const [filterMaxPrice, setFilterMaxPrice] = useState(0);
	const [filterType, setFilterType] = useState("All types");
	const [showSaved, setShowSaved] = useState(false);
	const [openPanel, setOpenPanel] = useState(null);
	const filterBarRef = useRef(null);
	useEffect(() => {
		function onDown(e) { if (filterBarRef.current && !filterBarRef.current.contains(e.target)) setOpenPanel(null); }
		document.addEventListener("mousedown", onDown);
		return () => document.removeEventListener("mousedown", onDown);
	}, []);
	const [savedIds, setSavedIds] = useState(() => {
		try { return new Set(JSON.parse(localStorage.getItem("strug_re_saved") ?? "[]")); } catch { return new Set(); }
	});
	const [saveErr, setSaveErr] = useState(null);
	const persistSaved = (set) => { localStorage.setItem("strug_re_saved", JSON.stringify([...set])); };
	// Hydrate from the server (source of truth) merged with localStorage so the local
	// quick-filter Set never drifts from /saves across devices/sessions.
	useEffect(() => {
		if (!isAuthenticated()) return;
		let alive = true;
		getSaves("property").then(res => {
			const rows = Array.isArray(res) ? res : (res?.data ?? []);
			if (!alive) return;
			setSavedIds(prev => {
				const next = new Set(prev);
				rows.forEach(r => { const v = r.entity_id; if (v != null) next.add(isNaN(Number(v)) ? v : Number(v)); });
				persistSaved(next);
				return next;
			});
		}).catch(() => {});
		return () => { alive = false; };
	}, []);
	const toggleSave = async (listing) => {
		const id = typeof listing === "object" ? listing.id : listing;
		const willSave = !savedIds.has(id);
		// Optimistic update for a snappy toggle; reconciled to the server below.
		setSavedIds(prev => { const next = new Set(prev); willSave ? next.add(id) : next.delete(id); persistSaved(next); return next; });
		if (typeof listing === "object" && isAuthenticated()) {
			const meta = { title: listing.name, sub: listing.location, price: listing.price, thumb: listing.image || null, accent: "#059669" };
			try {
				const res = await toggleSaveApi("property", String(id), meta);
				const serverSaved = res?.saved;
				// Reconcile local with the server's resulting state (source of truth).
				if (typeof serverSaved === "boolean") {
					setSavedIds(prev => { const next = new Set(prev); serverSaved ? next.add(id) : next.delete(id); persistSaved(next); return next; });
				}
			} catch {
				// Revert the optimistic change and surface the failure.
				setSavedIds(prev => { const next = new Set(prev); willSave ? next.delete(id) : next.add(id); persistSaved(next); return next; });
				setSaveErr("Couldn't update your saved properties. Please try again.");
				setTimeout(() => setSaveErr(null), 3500);
			}
		}
	};
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [selectedListing]);
	const [listings, setListings] = useState([]);
	useEffect(() => {
		// Housing rent comes from property.listing_status ("For Rent" / "Lease").
		// Generic marketplace rental_listing rows are only kept when they are sponsored ads.
		Promise.allSettled([getProperties({ vertical: 'realestate' }), getRentalListings({ public: 'true' })]).then(([propsRes, rentalsRes]) => {
			const props = propsRes.status === 'fulfilled' ? propsRes.value : null;
			const rentals = rentalsRes.status === 'fulfilled' ? rentalsRes.value : null;
			const propArr = Array.isArray(props) ? props : (props?.data ?? []);
			const rentArr = Array.isArray(rentals) ? rentals : (rentals?.data ?? []);
			const sponsoredOnly = rentArr.filter((r) => r.is_ad);
			const combined = [
				...propArr.map((p, i) => {
					const gallery = Array.isArray(p.images) ? p.images.map((img) => img.url || img).filter(Boolean) : [];
					const cover = gallery[0] || p.image_url || p.image || null;
					const priceVal = p.price_min ?? p.estimated_value ?? p.price ?? 0;
					const listingStatus = p.listing_status || p.status || "For Sale";
					const propType = p.type && !["For Sale", "For Rent", "Lease", "Under Offer", "Sold", "Auction"].includes(p.type)
						? p.type
						: null;
					const isRent = /rent|lease/i.test(listingStatus);
					return {
						id: p.property_id ?? p.id,
						name: p.property_name ?? p.address ?? p.name ?? i18n.t("realestate.unnamedProperty"),
						category: listingStatus,
						listing_status: listingStatus,
						price: priceVal,
						priceLabel: priceVal
							? `$${Number(priceVal).toLocaleString()}${p.price_max && p.price_max !== priceVal ? `–$${Number(p.price_max).toLocaleString()}` : ""}${isRent ? `/${i18n.t("realestate.mo")}` : ""}`
							: i18n.t("realestate.priceOnRequest"),
						image: cover,
						images: gallery,
						beds: p.beds_min ?? p.num_bedrooms ?? p.bedrooms ?? p.beds ?? 0,
						baths: p.baths_min ?? p.num_bathrooms ?? p.bathrooms ?? p.baths ?? 0,
						sqft: p.sqft_min ?? p.square_feet ?? p.size_sqft ?? p.sqft ?? 0,
						parking: p.num_parking ?? p.parking ?? 0,
						location: [p.neighborhood, p.city, p.province].filter(Boolean).join(", ") || p.address || p.location || "—",
						status: listingStatus,
						description: p.description ?? null,
						agentName: p.user?.name ?? p.developer_name ?? p.agent_name ?? p.owner_name ?? null,
						agentId: p.user_id ?? p.user?.user_id ?? p.agent_id ?? p.owner_id ?? null,
						featured: !!p.is_featured,
						verified: !!p.is_verified,
						trust_label: p.trust_label || (p.is_verified ? "verified" : "unverified"),
						seller_type: p.seller_type || null,
						tags: p.tags ?? (propType ? [propType] : []),
						amenities: Array.isArray(p.amenities) ? p.amenities : [],
						latitude: p.latitude,
						longitude: p.longitude,
						virtual_tour_url: p.virtual_tour_url,
						gradient: GRADIENTS[i % GRADIENTS.length],
						_kind: "property",
					};
				}),
				...sponsoredOnly.map((r, i) => ({
					id: r.rental_listing_id ?? r.id,
					name: r.rental_listing_name ?? r.title ?? i18n.t("realestate.rentalProperty"),
					category: "Sponsored",
					price: r.amount ?? 0,
					priceLabel: r.amount ? `$${Number(r.amount).toLocaleString()}/${r.duration ?? i18n.t("realestate.mo")}` : i18n.t("realestate.priceOnRequest"),
					image: r.image_url ?? r.image ?? r.media_url ?? null,
					beds: r.num_bedrooms ?? r.bedrooms ?? 0,
					baths: r.num_bathrooms ?? r.bathrooms ?? 0,
					sqft: r.square_feet ?? r.sqft ?? 0,
					parking: r.parking ?? 0,
					location: r.location ?? "—",
					status: r.status ?? "Available",
					description: r.description ?? null,
					agentName: r.owner_name ?? null,
					agentId: r.owner_id ?? null,
					featured: false,
					tags: r.property_type ? [r.property_type] : [],
					gradient: GRADIENTS[(propArr.length + i) % GRADIENTS.length],
					is_ad: true,
					campaign_id: r.campaign_id ?? null,
					target_url: r.target_url ?? null,
					cta_text: r.cta_text ?? null,
					_kind: "rental",
				})),
			];
			setListings(combined);
		}).catch(() => {});
	}, []);
	const filtered = listings.filter(l => {
		const matchCat = listingMatchesCategory(l, activeCategory, categories);
		const matchQ = !query || l.name.toLowerCase().includes(query.toLowerCase()) || l.location.toLowerCase().includes(query.toLowerCase());
		const matchBeds = filterBeds === 0 || (l.beds >= filterBeds);
		const matchPrice = filterMaxPrice === 0 || (l.price > 0 && l.price <= filterMaxPrice);
		const matchSaved = !showSaved || savedIds.has(l.id);
		const matchType = filterType === "All types" || (l.tags || []).some(t => t.toLowerCase() === filterType.toLowerCase()) || (l.category || "").toLowerCase().includes(filterType.toLowerCase());
		return matchCat && matchQ && matchBeds && matchPrice && matchSaved && matchType;
	});
	const featured = filtered.filter(l => l.featured);
	const rest = filtered.filter(l => !l.featured);

	if (selectedListing) return <REPropertyDetailPage listing={selectedListing} onBack={() => setSelectedListing(null)} />;

	if (loading) return (
		<div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px" }}>
					<SkeletonHeading />
					<Skel w="100%" h={42} r={12} style={{ margin: "16px 0" }} />
					<div style={{ display: "flex", gap: 12, margin: "16px 0 28px" }}>
						{[...Array(5)].map((_,i) => <SkeletonCircle key={i} />)}
					</div>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
						{[...Array(6)].map((_,i) => <SkeletonREListingCard key={i} />)}
					</div>
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			{saveErr && (
				<div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "rgba(220,38,38,0.95)", color: "#fff", padding: "10px 18px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, boxShadow: "0 6px 24px var(--color-shadow)" }}>{saveErr}</div>
			)}
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 20, textAlign: "center" }}>{landingTitle}</h1>
					<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
						<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
							<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={20} /></div>
							<input className="text-text-primary" value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder} style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} />
						</div>
					</div>
				</div>
				<div style={{ position: "relative", marginBottom: 24 }}>
					<div style={{ display: "flex", gap: 20, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4, animation: "fadeUp 0.35s ease 60ms both", scrollbarWidth: "none", justifyContent: isMobile ? "flex-start" : "center" }}>
						{categories.map((cat, i) => (
							<LeoButton key={cat.id} cat={cat} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 30} />
						))}
					</div>
					{isMobile && (
						<div style={{ position: "absolute", right: 0, top: 0, bottom: 4, width: 48, background: "linear-gradient(to left, var(--color-bg) 20%, transparent 100%)", pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
							<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
						</div>
					)}
				</div>
				{/* Compact filter bar — Beds / Price / Type dropdowns + Saved */}
				{(() => {
					const bedsLabel = filterBeds === 0 ? i18n.t("realestate.anyBeds") : i18n.t("realestate.bedsPlus", { count: filterBeds });
					const priceLabel = filterMaxPrice === 0 ? i18n.t("realestate.anyPrice") : filterMaxPrice === 500000 ? i18n.t("realestate.under500k") : filterMaxPrice === 1000000 ? i18n.t("realestate.under1m") : i18n.t("realestate.under2m");
					const typeLabel = filterType === "All types" ? i18n.t("realestate.allTypes") : reTypeLabel(filterType, t);
					const chevron = (open) => (
						<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
					);
					const filterBtn = (id, label, active) => (
						<button
							key={id}
							onClick={() => setOpenPanel(p => p === id ? null : id)}
							style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 20, border: `1px solid ${openPanel === id || active ? "#2563eb" : "var(--color-border)"}`, background: openPanel === id || active ? "rgba(37,99,235,0.18)" : "rgba(255,255,255,0.05)", color: openPanel === id || active ? "#60a5fa" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}
						>
							{label}{chevron(openPanel === id)}
						</button>
					);
					const optBtn = (label, selected, onClick, accent = "#2563eb") => (
						<button
							key={label}
							onClick={onClick}
							className={selected ? "text-text-primary" : "text-text-secondary"}
							style={{ padding: "7px 16px", borderRadius: 20, border: `1px solid ${selected ? accent : "var(--color-border)"}`, background: selected ? `${accent}22` : "rgba(255,255,255,0.04)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: selected ? 700 : 500, cursor: "pointer", transition: "all 0.12s", whiteSpace: "nowrap" }}
						>{label}</button>
					);
					return (
						<div ref={filterBarRef} style={{ position: "relative", marginBottom: openPanel ? 72 : 20, zIndex: openPanel ? 80 : 1, animation: "fadeUp 0.35s ease 90ms both" }}>
							<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
								{filterBtn("beds",  bedsLabel,  filterBeds !== 0)}
								{filterBtn("price", priceLabel, filterMaxPrice !== 0)}
								{filterBtn("type",  typeLabel,  filterType !== "All types")}
								<button onClick={() => setShowSaved(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 20, border: `1px solid ${showSaved ? "#f59e0b" : "var(--color-border)"}`, background: showSaved ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.05)", color: showSaved ? "#f59e0b" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}>
									<svg width={13} height={13} viewBox="0 0 24 24" fill={showSaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
									{i18n.t("realestate.saved")}{savedIds.size > 0 ? ` (${savedIds.size})` : ""}
								</button>
							</div>
							{openPanel && (
								<div
									onMouseDown={(e) => e.stopPropagation()}
									className="bg-surface-raised border border-border"
									style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 90, borderRadius: 14, padding: "14px 16px", boxShadow: "0 12px 40px var(--color-shadow)", animation: "fadeUp 0.15s ease both", minWidth: 260, pointerEvents: "auto" }}
								>
									{openPanel === "beds" && (
										<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
											{[0,1,2,3,4].map(b => optBtn(b === 0 ? i18n.t("realestate.anyBeds") : i18n.t("realestate.bedsPlus", { count: b }), filterBeds === b, () => { setFilterBeds(b); setOpenPanel(null); }))}
										</div>
									)}
									{openPanel === "price" && (
										<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
											{[[0, i18n.t("realestate.anyPrice")], [500000, i18n.t("realestate.under500k")], [1000000, i18n.t("realestate.under1m")], [2000000, i18n.t("realestate.under2m")]].map(([val, lbl]) => optBtn(lbl, filterMaxPrice === val, () => { setFilterMaxPrice(val); setOpenPanel(null); }))}
										</div>
									)}
									{openPanel === "type" && (
										<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
											{RE_PROP_TYPES.map(typeVal => optBtn(reTypeLabel(typeVal, t), filterType === typeVal, () => { setFilterType(typeVal); setOpenPanel(null); }, "#7c3aed"))}
										</div>
									)}
								</div>
							)}
						</div>
					);
				})()}
				{(() => {
					const searchFilters = buildRealEstateSearchFilters({
						query, filterBeds, filterMaxPrice, filterType, activeCategory, categories,
					});
					const canSave = Object.keys(searchFilters).length > 0;
					return (
						<PropertySavedSearches
							vertical="realestate"
							filters={searchFilters}
							canSave={canSave}
							onApply={(f) => {
								setQuery(f.q || "");
								setFilterBeds(Number(f.beds) || 0);
								setFilterMaxPrice(Number(f.max_price) || 0);
								setFilterType(f.type || "All types");
								if (f.category) setActiveCategory(f.category);
								else if (f.listing_status) {
									const cat = categories.find((c) => c.match === f.listing_status);
									setActiveCategory(cat?.id || "all");
								} else {
									setActiveCategory("all");
								}
								setOpenPanel(null);
							}}
						/>
					);
				})()}
				{featured.length > 0 && (
					<div style={{ marginBottom: 32, animation: "fadeUp 0.4s ease 120ms both" }}>
						<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>{t("realestate.featuredListings")}</p>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
							{featured.map((l, i) => <REListingCard key={l.id} listing={l} delay={i * 50} onClick={() => l.is_ad ? openSponsored(l) : setSelectedListing(l)} saved={savedIds.has(l.id)} onToggleSave={toggleSave} />)}
						</div>
					</div>
				)}
				{rest.length > 0 && (
					<div style={{ marginBottom: 32, animation: "fadeUp 0.4s ease 180ms both" }}>
						<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>{showSaved ? t("savedListings") : t("allListings")}</p>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
							{rest.map((l, i) => <REListingCard key={l.id} listing={l} delay={i * 40} onClick={() => l.is_ad ? openSponsored(l) : setSelectedListing(l)} saved={savedIds.has(l.id)} onToggleSave={toggleSave} />)}
						</div>
					</div>
				)}
				{filtered.length === 0 && (
					<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: 0.4, paddingBottom: 24 }}>
						<RealEstateIcon s={40} />
						<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>{i18n.t("common.noListingsFound")}</p>
					</div>
				)}
			</div>
		</div>
	);
}

function REPropertyDetailPage({ listing, onBack }) {
	const { isMobile } = useViewport();
	const [viewingDate, setViewingDate] = useState(null);
	const [viewingTime, setViewingTime] = useState("10:00 AM");
	const [contactMsg, setContactMsg] = useState("");
	const [contactSent, setContactSent] = useState(false);
	const [contactLoading, setContactLoading] = useState(false);
	const [contactErr, setContactErr] = useState(null);
	const [bookingConfirmed, setBookingConfirmed] = useState(false);
	const [bookingLoading, setBookingLoading] = useState(false);
	const [bookingErr, setBookingErr] = useState(null);
	const [viewingAppointmentId, setViewingAppointmentId] = useState(null);
	const [viewingId, setViewingId] = useState(null);
	const [cancelLoading, setCancelLoading] = useState(false);
	const [showContactForm, setShowContactForm] = useState(false);
	const [activeImg, setActiveImg] = useState(0);
	const [reportMsg, setReportMsg] = useState(null);
	const [reportLoading, setReportLoading] = useState(false);
	const times = ["9:00 AM", "10:00 AM", "11:00 AM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM"];
	const labelS = { fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 10 };
	const statusColor = STATUS_COLOR[listing.status] ?? "#22c55e";

	const images = listing.images?.length ? listing.images : listing.image ? [listing.image] : [];

	async function handleSendInquiry() {
		if (!contactMsg.trim() || contactLoading) return;
		setContactErr(null);
		if (!isAuthenticated()) { setContactErr("Please log in to contact the agent."); return; }
		setContactLoading(true);
		// The lead reaches the agent via two channels (inquiry record + DM). Confirm
		// only if at least one actually went through, so a failure isn't shown as sent.
		let delivered = false;
		try {
			await createPropertyInquiry(listing.id, { message: contactMsg, user_id: getUser()?.user_id ?? getUser()?.id });
			delivered = true;
		} catch { /* try the DM channel below */ }
		const agentUserId = listing.agentId;
		if (agentUserId) {
			try {
				await messageUser(agentUserId, { initialMessage: contactMsg.trim(), navigate: true, sourceVertical: "realestate" });
				delivered = true;
			} catch { /* noop */ }
		}
		if (delivered) setContactSent(true);
		else setContactErr("Could not send your message. Please try again.");
		setContactLoading(false);
	}

	function handleShare() {
		const url = window.location.href;
		const text = `${listing.name} — ${listing.priceLabel} · ${listing.location}`;
		if (navigator.share) {
			navigator.share({ title: listing.name, text, url }).catch(() => {});
		} else {
			navigator.clipboard.writeText(`${text}\n${url}`).catch(() => {});
		}
	}

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 960, width: "100%", margin: "0 auto", paddingBottom: 24 }}>
				{/* Back + actions */}
				<div style={{ padding: "20px 0 16px", animation: "fadeUp 0.3s ease both", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
					<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, padding: 0 }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
						Real Estate
					</button>
					<button onClick={handleShare} className="border border-border text-text-secondary" style={{ background: "rgba(255,255,255,0.06)", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "7px 14px", display: "flex", alignItems: "center", gap: 6 }}>
						<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
						Share
					</button>
				</div>

				{/* Image gallery — dark scrim + white overlay text/badges for legibility over arbitrary
				    photography, like Hub.jsx's hero photo; stays dark regardless of site theme. */}
				<div style={{ width: "100%", height: 320, borderRadius: 20, marginBottom: 24, position: "relative", overflow: "hidden", animation: "fadeUp 0.35s ease 40ms both", background: listing.gradient }}>
					{images.length > 0 ? (
						<>
							<img loading="lazy" decoding="async" src={images[activeImg]} alt={listing.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none"; }} />
							{images.length > 1 && (
								<>
									<button onClick={() => setActiveImg(i => Math.max(0, i - 1))} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
										<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
									</button>
									<button onClick={() => setActiveImg(i => Math.min(images.length - 1, i + 1))} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
										<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
									</button>
									<div style={{ position: "absolute", bottom: 70, right: 16, background: "rgba(0,0,0,0.55)", borderRadius: 20, padding: "3px 10px" }}>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#fff" }}>{activeImg + 1} / {images.length}</span>
									</div>
									<div style={{ position: "absolute", bottom: 16, left: 0, right: 0, display: "flex", gap: 8, justifyContent: "center", padding: "0 24px", overflowX: "auto" }}>
										{images.slice(0, 6).map((img, i) => (
											<div key={i} onClick={() => setActiveImg(i)} style={{ width: 48, height: 36, borderRadius: 6, overflow: "hidden", cursor: "pointer", border: `2px solid ${activeImg === i ? "#fff" : "transparent"}`, flexShrink: 0 }}>
												<img loading="lazy" decoding="async" src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
											</div>
										))}
									</div>
								</>
							)}
						</>
					) : (
						<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
							<RealEstateIcon s={48} />
						</div>
					)}
					<div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(6,8,16,0.85) 0%, transparent 50%)", pointerEvents: "none" }} />
					{listing.featured && (
						<div style={{ position: "absolute", top: 16, left: 16, background: "#2563eb", borderRadius: 8, padding: "4px 12px" }}>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: "#fff", letterSpacing: "0.06em" }}>{i18n.t("realestate.featured")}</span>
						</div>
					)}
					{listing._kind === "property" && (
						<div style={{
							position: "absolute", top: listing.featured ? 52 : 16, left: 16,
							background: listing.verified || listing.trust_label === "verified" ? "rgba(34,197,94,0.85)" : "rgba(0,0,0,0.7)",
							borderRadius: 8, padding: "4px 12px",
							border: listing.verified || listing.trust_label === "verified" ? "none" : "1px solid rgba(245,158,11,0.5)",
						}}>
							<span style={{
								fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700,
								color: listing.verified || listing.trust_label === "verified" ? "#fff" : "#fbbf24",
								letterSpacing: "0.04em",
							}}>
								{listing.verified || listing.trust_label === "verified" ? "Verified listing" : listing.trust_label === "approved_seller" ? "Approved seller" : "Unverified listing"}
							</span>
						</div>
					)}
					<div style={{ position: "absolute", top: 16, right: 16, background: "rgba(0,0,0,0.68)", border: `1px solid ${statusColor}`, borderRadius: 8, padding: "4px 12px" }}>
						<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: statusColor }}>{listing.status ?? i18n.t("realestate.statusAvailable")}</span>
					</div>
					<div style={{ position: "absolute", bottom: images.length > 1 ? 70 : 20, left: 24 }}>
						<h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(22px, 3vw, 34px)", color: "#fff", letterSpacing: "0.03em", marginBottom: 4 }}>{listing.name}</h1>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 6 }}>
							<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
							{listing.location}
						</p>
					</div>
				</div>

				<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 360px", gap: 28, animation: "fadeUp 0.4s ease 80ms both" }}>
					{/* Left column */}
					<div>
						{/* Price + stats */}
						<div className="border border-border" style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "20px 24px", marginBottom: 20 }}>
							<div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 16 }}>
								<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 38, color: "#2563eb", letterSpacing: "0.02em" }}>{listing.priceLabel}</span>
								{listing.sqft > 0 && listing.price > 0 && (
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, paddingBottom: 6 }}>${Math.round(listing.price / listing.sqft).toLocaleString()}/sqft</span>
								)}
							</div>
							<div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
								{listing.beds > 0 && (
									<div style={{ textAlign: "center" }}>
										<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28 }}>{listing.beds}</p>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("realestate.bedrooms")}</p>
									</div>
								)}
								{listing.baths > 0 && (
									<div style={{ textAlign: "center" }}>
										<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28 }}>{listing.baths}</p>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("realestate.bathrooms")}</p>
									</div>
								)}
								{listing.sqft > 0 && (
									<div style={{ textAlign: "center" }}>
										<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28 }}>{listing.sqft.toLocaleString()}</p>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("realestate.sqFt")}</p>
									</div>
								)}
								{listing.parking > 0 && (
									<div style={{ textAlign: "center" }}>
										<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28 }}>{listing.parking}</p>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("realestate.parking")}</p>
									</div>
								)}
							</div>
						</div>

						{/* Tags */}
						{listing.tags.length > 0 && (
							<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
								{listing.tags.map(t => (
									<span key={t} style={{ padding: "6px 14px", background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.25)", borderRadius: 20, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#60a5fa" }}>{t}</span>
								))}
							</div>
						)}

						{/* Description */}
						<div className="border border-border-subtle" style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "18px 20px", marginBottom: 20 }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{i18n.t("realestate.aboutProperty")}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.7 }}>
								{listing.description || `${listing.name} is a ${listing.category.toLowerCase()} property in ${listing.location}. Contact the agent for full details.`}
							</p>
						</div>

						{/* Property map */}
						<REPropertyMap location={listing.location} />
					</div>

					{/* Right column — agent + booking */}
					<div>
						{/* Agent card */}
						<div className="border border-border" style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "18px 20px", marginBottom: 16 }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>{i18n.t("realestate.listedBy")}</p>
							<div
								onClick={() => { if (listing.agentId) { window.__profileTargetId = listing.agentId; window.__profileVertical = "realestate"; window.__nav?.("profile"); } }}
								style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, cursor: listing.agentId ? "pointer" : "default" }}
							>
								{/* Avatar fallback fill is a fixed brand navy (same family as the listing gradients), not a
								    neutral surface — stays hardcoded, so the white initial on top is always safe. */}
								<div style={{ width: 52, height: 52, borderRadius: "50%", background: "#1e3a5f", border: "2px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, color: "#fff", flexShrink: 0 }}>
									{(listing.agentName ?? "A")[0].toUpperCase()}
								</div>
								<div>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: listing.agentId ? "#60a5fa" : "var(--color-text-primary)", marginBottom: 2 }}>{listing.agentName ?? i18n.t("realestate.realEstateAgent")}</p>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("realestate.realEstateAgent")}{listing.agentId ? ` · ${i18n.t("realestate.viewProfileArrow")}` : ""}</p>
								</div>
								{listing.agentId && (
									<button
										onClick={() => {
											window.__profileTargetId = listing.agentId;
											window.__profileVertical = "realestate";
											window.__nav?.("profile");
										}}
										style={{ padding: "5px 10px", background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 8, color: "#60a5fa", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
									>
										{i18n.t("social.viewProfile")}
									</button>
								)}
							</div>
							{contactSent ? (
								<div style={{ background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.3)", borderRadius: 10, padding: "10px 14px", textAlign: "center" }}>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#059669", fontWeight: 600 }}>{i18n.t("realestate.messageSent")}</p>
								</div>
							) : showContactForm ? (
								<div>
									<textarea value={contactMsg} onChange={e => setContactMsg(e.target.value)} rows={3} placeholder={i18n.t("realestate.inquiryPlaceholder")}
										className="border border-border text-text-primary"
										style={{ width: "100%", background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, resize: "none", outline: "none", boxSizing: "border-box", caretColor: "#2563eb", marginBottom: 8 }} />
									<div style={{ display: "flex", gap: 8 }}>
										<button onClick={() => setShowContactForm(false)} className="border border-border text-text-secondary" style={{ flex: 1, padding: "9px 0", background: "rgba(255,255,255,0.05)", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
										<button onClick={handleSendInquiry} disabled={contactLoading} style={{ flex: 2, padding: "9px 0", background: "#2563eb", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, cursor: contactLoading ? "default" : "pointer", opacity: contactLoading ? 0.7 : 1 }}>{contactLoading ? i18n.t("common.sending") : i18n.t("realestate.sendMessage")}</button>
									</div>
									{contactErr && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginTop: 8 }}>{contactErr}</p>}
								</div>
							) : (
								<button onClick={() => setShowContactForm(true)} style={{ width: "100%", padding: "11px 0", background: "#2563eb", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{i18n.t("realestate.contactAgent")}</button>
							)}
							{listing._kind === "property" && (
								<div style={{ marginTop: 12 }}>
									<button
										disabled={reportLoading || !!reportMsg}
										onClick={async () => {
											if (!isAuthenticated()) {
												setReportMsg("Sign in to report a listing.");
												return;
											}
											setReportLoading(true);
											try {
												await reportProperty(listing.id, { reason: "fake_listing", details: "Reported from listing detail" });
												setReportMsg("Thanks — we will review this listing.");
											} catch (e) {
												setReportMsg(e?.response?.data?.message || "Could not submit report.");
											} finally {
												setReportLoading(false);
											}
										}}
										style={{
											width: "100%", padding: "9px 0", background: "transparent",
											border: "1px solid rgba(239,68,68,0.35)", borderRadius: 10,
											color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12,
											cursor: reportLoading || reportMsg ? "default" : "pointer", opacity: reportLoading ? 0.7 : 1,
										}}
									>
										{reportLoading ? "Reporting…" : "Report fake listing"}
									</button>
									{reportMsg && (
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 8, textAlign: "center" }}>{reportMsg}</p>
									)}
								</div>
							)}
						</div>

						<PropertyFinancingCard item={listing} source="realestate" />

						{/* Book a viewing */}
						<div className="border border-border" style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "18px 20px" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>{i18n.t("realestate.bookViewing")}</p>
							{bookingConfirmed ? (
								<div>
									<div style={{ background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.3)", borderRadius: 10, padding: "14px", textAlign: "center", marginBottom: 10 }}>
										<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, color: "#059669", marginBottom: 4 }}>{i18n.t("realestate.viewingBooked")}</p>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{viewingDate ? viewingDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : ""} at {viewingTime}</p>
									</div>
									<button onClick={async () => {
										if (cancelLoading) return;
										setCancelLoading(true);
										try {
											if (viewingId || viewingAppointmentId) {
												await cancelPropertyViewing(viewingId, viewingAppointmentId);
											}
											const agentUserId = listing.agentId;
											if (agentUserId) {
												try {
													await messageUser(agentUserId, {
														initialMessage: `I've cancelled my viewing of "${listing.name}" that was scheduled for ${viewingDate ? viewingDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "a date"} at ${viewingTime}.`,
														navigate: false,
														sourceVertical: "realestate",
													});
												} catch { /* noop */ }
											}
										} catch { /* noop */ }
										setBookingConfirmed(false);
										setViewingAppointmentId(null);
										setViewingId(null);
										setViewingDate(null);
										setCancelLoading(false);
									}} style={{ width: "100%", padding: "10px 0", background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 10, color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
										{cancelLoading ? i18n.t("realestate.cancelling") : i18n.t("realestate.cancelViewing")}
									</button>
								</div>
							) : (
								<>
									<ODMiniCalendar value={viewingDate} onChange={setViewingDate} label={i18n.t("realestate.selectDate")} />
									{viewingDate && (
										<div style={{ marginTop: 14 }}>
											<label style={labelS}>{i18n.t("realestate.selectTime")}</label>
											<div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
												{times.map(t => (
													<button key={t} onClick={() => setViewingTime(t)}
														style={{ padding: "8px 0", background: viewingTime === t ? "rgba(37,99,235,0.2)" : "rgba(255,255,255,0.04)", border: `1px solid ${viewingTime === t ? "rgba(37,99,235,0.5)" : "var(--color-border-subtle)"}`, borderRadius: 8, color: viewingTime === t ? "#60a5fa" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
														{t}
													</button>
												))}
											</div>
										</div>
									)}
									<button onClick={async () => {
										if (!viewingDate || bookingLoading) return;
										setBookingErr(null);
										if (!isAuthenticated()) { setBookingErr("Please log in to book a viewing."); return; }
										setBookingLoading(true);
										try {
											const dateStr = viewingDate.toISOString().slice(0, 10);
											const res = await createPropertyViewing(listing.id, {
												viewing_date: dateStr,
												date: dateStr,
												time: viewingTime,
												time_from: viewingTime,
												note: `${listing.name ?? "Property"} — ${viewingTime}`,
												type: "viewing",
											});
											const data = res?.data ?? res;
											const vid = data?.viewing_id ?? null;
											const apptId = data?.appointment_id ?? null;
											if (vid) setViewingId(vid);
											if (apptId) setViewingAppointmentId(apptId);
											const agentUserId = listing.agentId;
											if (agentUserId) { try { await messageUser(agentUserId, { initialMessage: `Hi! I've booked a viewing of "${listing.name}" for ${viewingDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${viewingTime}. Please confirm the appointment.`, navigate: false, sourceVertical: "realestate" }); } catch { /* DM is secondary */ } }
											setBookingConfirmed(true);
										} catch (e) {
											setBookingErr(e?.response?.data?.message || "Could not book your viewing. Please try again.");
										}
										setBookingLoading(false);
									}}
										style={{ width: "100%", marginTop: 14, padding: "12px 0", background: viewingDate ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: viewingDate ? "#fff" : "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: viewingDate ? "pointer" : "not-allowed", transition: "all 0.2s" }}>
										{bookingLoading ? i18n.t("realestate.booking") : i18n.t("realestate.bookViewing")}
									</button>
									{bookingErr && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginTop: 8 }}>{bookingErr}</p>}
								</>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export { RealEstatePage };
