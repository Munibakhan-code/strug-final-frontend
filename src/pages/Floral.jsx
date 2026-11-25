import React, { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback } from "react";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList } from "../hooks/useI18nCategoryList.js";
import { filterVendors, getFoodItems, getVendor, findVendorTypeIdByName, getFoodOrder, getMyFoodOrders, getFoodCategories } from '../api/food';
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon, FloralIcon } from "../components/icons.jsx";
import { Skel, SkeletonCircle, SkeletonHeading, SkeletonProductCard } from "../components/skeletons.jsx";
import { LeoButton, AddressAutocomplete } from "../components/shared.jsx";
import { FoodCartPage, FoodCheckoutPage, FoodTrackingPage, FoodAddressCapture } from "./Food.jsx";
import { saveAddress } from "../api/user";
import { getUser } from "../store/auth";
import { parseVendorPromo } from "../utils/promoBadge.js";
import { getLocationItem, setLocationItem } from "../utils/userLocation.js";
import { mediaUrl } from "../utils/mediaUrl.js";
import { isWithinFoodBrowseRadius } from "../utils/geo.js";
import { slugify } from "../utils/slugify.js";
import { getSaves, toggleSave } from "../api/saves";
import { useEventPlan } from "../store/eventPlan.js";
import { useEventCart } from "../store/eventCart.js";
import { EventCartPill } from "../components/EventCartPill.jsx";
import { ConciergeEntryBanner } from "../components/ConciergeEntryBanner.jsx";

const FALLBACK_GRADIENT = "linear-gradient(135deg, #3a0a1f, #28060f)";

const FLORAL_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#2563eb", match: null, img: "/img/Floral.jpg" },
	{ id: "bouquets", labelKey: "floral.bouquets", color: "#db2777", match: "Bouquets", img: "https://images.unsplash.com/photo-1563241527-3004b7be0ffd?auto=format&fit=crop&w=200&q=80" },
	{ id: "weddings", labelKey: "floral.categories.weddings", color: "#f9a8d4", match: "Weddings", img: "https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=200&q=80" },
	{ id: "sympathy", labelKey: "floral.sympathy", color: "#7c3aed", match: "Sympathy", img: "https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=200&q=80" },
	{ id: "birthday", labelKey: "floral.birthday", color: "#f59e0b", match: "Birthday", img: "https://images.unsplash.com/photo-1487530811176-3780de880c2d?auto=format&fit=crop&w=200&q=80" },
	{ id: "tropical", labelKey: "floral.categories.tropical", color: "#059669", match: "Tropical", img: "https://images.unsplash.com/photo-1509587584298-0f3b3a3a1797?auto=format&fit=crop&w=200&q=80" },
	{ id: "succulents", labelKey: "floral.categories.succulents", color: "#65a30d", match: "Succulents", img: "https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?auto=format&fit=crop&w=200&q=80" },
	{ id: "wreaths", labelKey: "floral.categories.wreaths", color: "#d97706", match: "Wreaths", img: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=200&q=80" },
	{ id: "plants", labelKey: "floral.plants", color: "#0891b2", match: "Plants", img: "https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=200&q=80" },
];

function isGuestFloralItemAvailable(item) {
	return item?.is_available !== false && item?.available !== false;
}

function itemPhotoUrl(item) {
	const pic = item?.food_item_pics?.[0]?.url ?? item?.image_url ?? item?.image ?? item?.photo_url ?? item?.cover_url ?? null;
	return pic ? mediaUrl(pic) : null;
}

function mapModifierGroups(item) {
	return (item?.food_item_modifier_group ?? [])
		.map(g => ({
			group_id: g.group_id,
			name: g.name ?? "",
			min_select: g.min_select ?? 0,
			max_select: g.max_select ?? null,
			options: (g.options ?? [])
				.filter(o => o.is_available !== false)
				.map(o => ({ option_id: o.option_id, name: o.name ?? "", price: Number(o.price) || 0 })),
		}))
		.filter(g => g.options.length > 0);
}

function mapFloralShop(v) {
	const img = v?.banner_url ?? v?.cover_url ?? v?.logo_url ?? null;
	const { promo, eligibleOffers } = parseVendorPromo(v);
	const categoryNames = Array.isArray(v?.food_category)
		? v.food_category.map(c => c?.name).filter(Boolean)
		: [];
	return {
		id: v?.vendor_id ?? v?.id,
		name: v?.vendor_name || v?.name || "Florist",
		rating: Number.isFinite(Number(v?.rating)) ? Number(v.rating) : null,
		reviews: Number.isFinite(Number(v?.review_count ?? v?.reviews_count)) ? Number(v.review_count ?? v.reviews_count) : 0,
		fee: Number.isFinite(Number(v?.delivery_fee)) ? Number(v.delivery_fee) : null,
		color: "#2a0a1f",
		accent: "#db2777",
		lat: v?.lat,
		lng: v?.long ?? v?.lng,
		owner_id: v?.owner_id,
		vendor_type_id: v?.vendor_type_id ?? v?.vendor_type?.vendor_type_id ?? null,
		promo,
		eligibleOffers,
		categoryNames,
		img: img ? mediaUrl(img) : null,
	};
}

function sameShopId(a, b) {
	return a != null && b != null && Number(a) === Number(b);
}

function floralListingPath(shop) {
	const slug = slugify(shop?.name || "");
	return `/listing/floral/${shop.id}${slug ? `-${slug}` : ""}`;
}

function isFloralVendorType(v) {
	const name = v?.vendor_type?.vendor_type || v?.vendor_type_name || v?.type_name || "";
	if (!name) return true;
	return /floral/i.test(String(name));
}

function readSavedCoords() {
	const lat = Number(getLocationItem("strug_user_lat"));
	const lng = Number(getLocationItem("strug_user_lng"));
	return {
		lat: Number.isFinite(lat) ? lat : undefined,
		lng: Number.isFinite(lng) ? lng : undefined,
	};
}

const FLORAL_ACTIVE_KEY = "strug_floral_active_v1";
const FLORAL_TERMINAL_STATUSES = new Set(["delivered", "cancelled"]);

function saveFloralSession(session) {
	try { sessionStorage.setItem(FLORAL_ACTIVE_KEY, JSON.stringify(session)); } catch { /* quota / private mode */ }
}

function loadFloralSession() {
	try {
		const raw = sessionStorage.getItem(FLORAL_ACTIVE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

function clearFloralSession() {
	try { sessionStorage.removeItem(FLORAL_ACTIVE_KEY); } catch { /* ignore */ }
}

const FLORAL_CATEGORY_KEYWORDS = {
	bouquets: ["bouquet", "bouquets", "bunch", "roses", "rose", "tulip", "posy", "arrangement", "stems", "flower", "flowers", "floral"],
	weddings: ["wedding", "weddings", "bridal", "bride", "ceremony", "aisle", "corsage", "boutonniere", "centerpiece"],
	sympathy: ["sympathy", "funeral", "condolence", "memorial", "standing spray"],
	birthday: ["birthday", "bday", "celebration"],
	tropical: ["tropical", "orchid", "hibiscus", "bird of paradise", "anthurium", "bird-of-paradise"],
	succulents: ["succulent", "succulents", "cactus", "echeveria", "jade"],
	wreaths: ["wreath", "wreaths", "garland"],
	plants: ["plant", "plants", "potted", "fern", "houseplant", "indoor plant"],
};

function floralCategoryHaystack(parts) {
	return parts.filter(Boolean).join(" ").toLowerCase();
}

function floralCategoryMatchesHaystack(catId, categories, haystack) {
	if (!catId || catId === "all") return true;
	const hay = String(haystack || "").toLowerCase();
	if (!hay.trim()) return false;
	const cat = categories.find(c => c.id === catId);
	const label = String(cat?.match || cat?.label || catId).toLowerCase();
	if (label && hay.includes(label)) return true;
	if (hay.includes(String(catId).toLowerCase())) return true;
	return (FLORAL_CATEGORY_KEYWORDS[catId] || []).some(key => hay.includes(key));
}

function itemMatchesFloralCategory(item, catId, categories) {
	if (!catId || catId === "all") return true;
	return floralCategoryMatchesHaystack(
		catId,
		categories,
		floralCategoryHaystack([item?.category, item?.name, item?.desc, ...(item?.tags || [])]),
	);
}

function shopMatchesFloralCategory(shop, catId, categories) {
	if (!catId || catId === "all") return true;
	return floralCategoryMatchesHaystack(
		catId,
		categories,
		floralCategoryHaystack([shop?.name, shop?.itemHaystack, ...(shop?.categoryNames || [])]),
	);
}

function FloralShareButton({ shop }) {
	const [copied, setCopied] = useState(false);
	if (!shop?.id) return null;
	const url = `${window.location.origin}${floralListingPath(shop)}`;
	return (
		<button
			type="button"
			onClick={async () => {
				try {
					if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
					await navigator.clipboard.writeText(url);
					setCopied(true);
					setTimeout(() => setCopied(false), 2000);
				} catch {
					/* non-secure context / denied permission — don't claim success */
				}
			}}
			className="bg-surface-raised border border-border"
			style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 20, padding: "6px 14px", color: copied ? "#22c55e" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
		>
			{copied ? i18n.t("floral.copied", { defaultValue: "Copied!" }) : i18n.t("floral.share", { defaultValue: "Share" })}
		</button>
	);
}

function FloralOrdersTabBar({ active, hasActiveOrder, onSelect }) {
	const tabs = [
		{ id: "stores", label: i18n.t("floral.tabs.browse", { defaultValue: "Florists" }) },
		{ id: "favorites", label: i18n.t("floral.tabs.saved", { defaultValue: "Saved" }) },
		{ id: "active", label: i18n.t("floral.tabs.active", { defaultValue: "Active" }) },
		{ id: "history", label: i18n.t("floral.tabs.history", { defaultValue: "History" }) },
	];
	return (
		<div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
			<div style={{ display: "flex", background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 3, gap: 2 }}>
				{tabs.map(tab => (
					<button
						key={tab.id}
						type="button"
						onClick={() => onSelect(tab.id)}
						style={{ position: "relative", padding: "6px 14px", borderRadius: 8, border: "none", background: active === tab.id ? "#db2877" : "transparent", color: active === tab.id ? "#fff" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
					>
						{tab.label}
						{tab.id === "active" && hasActiveOrder && (
							<span style={{ position: "absolute", top: 3, right: 5, width: 6, height: 6, borderRadius: "50%", background: "#ef4444" }} />
						)}
					</button>
				))}
			</div>
		</div>
	);
}

function floralOrderStatusStyle(status) {
	const s = String(status || "").toLowerCase();
	if (s === "delivered" || s === "completed") return { bg: "rgba(74,222,128,0.1)", text: "#4ade80", border: "rgba(74,222,128,0.25)" };
	if (s === "cancelled" || s === "canceled") return { bg: "rgba(248,113,113,0.1)", text: "#f87171", border: "rgba(248,113,113,0.25)" };
	return { bg: "rgba(255,255,255,0.08)", text: "rgba(255,255,255,0.6)", border: "rgba(255,255,255,0.15)" };
}

function FloralOrderHistoryPage({ floralVendorTypeId, floralTypeReady, onReorder, isMobile }) {
	const [orders, setOrders] = useState(null);
	const [error, setError] = useState(false);
	useEffect(() => {
		// Wait for the Floral vendor_type lookup before filtering — returning false while
		// the id is still null painted an empty history on first paint (and forever if the
		// lookup failed silently).
		if (!floralTypeReady) {
			setOrders(null);
			return undefined;
		}
		if (!floralVendorTypeId) {
			setError(true);
			setOrders([]);
			return undefined;
		}
		let alive = true;
		getMyFoodOrders()
			.then((res) => {
				if (!alive) return;
				const list = Array.isArray(res) ? res : (res?.data ?? []);
				const terminal = list.filter((o) => {
					if (!FLORAL_TERMINAL_STATUSES.has(String(o.order_status ?? o.status ?? "").toLowerCase())) return false;
					return Number(o.vendor_type_id ?? o.food_vendor?.vendor_type_id) === Number(floralVendorTypeId);
				});
				terminal.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
				setError(false);
				setOrders(terminal);
			})
			.catch(() => { if (alive) { setError(true); setOrders([]); } });
		return () => { alive = false; };
	}, [floralVendorTypeId, floralTypeReady]);

	if (!floralTypeReady || orders === null) {
		return (
			<div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 720, margin: "0 auto", width: "100%", padding: isMobile ? "0 4px" : 0 }}>
				{[1, 2, 3].map(i => <Skel key={i} h={70} r={12} />)}
			</div>
		);
	}
	if (error) {
		return (
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, textAlign: "center", padding: 40 }}>{i18n.t("floral.historyError", { defaultValue: "Couldn't load your flower orders." })}</p>
		);
	}
	if (orders.length === 0) {
		return (
			<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, textAlign: "center", padding: 40 }}>{i18n.t("floral.noHistory", { defaultValue: "No past flower orders yet." })}</p>
		);
	}
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 720, margin: "0 auto", width: "100%" }}>
			{orders.map((o) => {
				const id = o.food_order_id ?? o.id;
				const sc = floralOrderStatusStyle(o.order_status ?? o.status);
				const canReorder = Array.isArray(o.food_order_items) && o.food_order_items.some(it => it.food_item_id != null);
				return (
					<div key={id} className="bg-surface border border-border" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "14px 16px", borderRadius: 12 }}>
						<div style={{ minWidth: 0 }}>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{o.food_vendor?.vendor_name ?? i18n.t("floral.title")}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{o.created_at ? new Date(o.created_at).toLocaleDateString() : ""}</p>
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
							<span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", textTransform: "capitalize", background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>{String(o.order_status ?? o.status ?? "").replace(/_/g, " ")}</span>
							{canReorder && (
								<button type="button" onClick={() => onReorder(o)} style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(219,40,119,0.15)", border: "1px solid rgba(219,40,119,0.4)", color: "#f9a8d4", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{i18n.t("floral.reorder", { defaultValue: "Reorder" })}</button>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}

// Card face is item.gradient — either a product photo or a hardcoded dark gradient
// fallback (never a themeable neutral), so all colors inside stay hardcoded "white on
// dark photo" treatments, matching the hero-scrim pattern used elsewhere.
function FloralItemCard({ item, delay = 0, onClick }) {
	const hasPhoto = Boolean(item.img);
	return (
		<div onClick={onClick} style={{ borderRadius: 14, background: item.gradient, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", display: "flex", flexDirection: "column", animation: `fadeUp 0.4s ease ${delay}ms both`, position: "relative", cursor: "pointer" }}>
			{/* Image area */}
			<div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
				{hasPhoto && (
					<img loading="lazy" decoding="async" src={item.img} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none"; }} />
				)}
				{!item.inStock && (
					<div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
						<span style={{ fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", background: "rgba(220,38,38,0.8)", padding: "4px 10px", borderRadius: 20 }}>{i18n.t("common.outOfStock")}</span>
					</div>
				)}
				{item.originalPrice && (
					<div style={{ position: "absolute", top: 10, left: 10, zIndex: 3, background: "#dc2626", borderRadius: 20, padding: "3px 8px" }}>
						<span style={{ fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("floral.sale")}</span>
					</div>
				)}
				{!hasPhoto && <FloralIcon s={36} />}
			</div>
			{/* Info */}
			<div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
				<p style={{ fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.3 }}>{item.name}</p>
				<div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
					{item.tags && item.tags.map(t => (
						<span key={t} style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif", background: "rgba(255,255,255,0.05)", padding: "2px 7px", borderRadius: 10 }}>{t}</span>
					))}
				</div>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 8 }}>
					<div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
						<span style={{ fontSize: 18, fontWeight: 800, color: "#db2877", fontFamily: "'Barlow Condensed', sans-serif" }}>${Number(item.price).toFixed(2)}</span>
						{item.originalPrice && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif", textDecoration: "line-through" }}>${item.originalPrice}</span>}
					</div>
					{item.inStock && (
						<button style={{ background: "#db2877", border: "none", borderRadius: 8, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, padding: "7px 14px", cursor: "pointer" }}>{i18n.t("floral.select")}</button>
					)}
				</div>
			</div>
		</div>
	);
}

function getDistance(lat1, lon1, lat2, lon2) {
	if ([lat1, lon1, lat2, lon2].some(v => v == null || !Number.isFinite(Number(v)))) return null;
	const R = 6371;
	const dLat = (lat2 - lat1) * Math.PI / 180;
	const dLon = (lon2 - lon1) * Math.PI / 180;
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
		Math.sin(dLon / 2) * Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

function persistFloralAddress(addr, lat, lng) {
	const clean = String(addr || "").trim();
	if (!clean) return;
	try {
		setLocationItem("strug_user_address", clean);
		setLocationItem("strug_user_location", JSON.stringify({
			address: clean,
			lat: lat ?? undefined,
			lng: lng ?? undefined,
		}));
		if (lat != null) setLocationItem("strug_user_lat", String(lat));
		if (lng != null) setLocationItem("strug_user_lng", String(lng));
	} catch { /* location storage is best-effort */ }
	saveAddress({
		saved_address: clean,
		saved_lat: lat ?? undefined,
		saved_long: lng ?? undefined,
	}).catch(() => {});
}

function FloralPage({ userLocation, initialListingId }) {
	const { landingTitle, searchPlaceholder } = usePageI18n("floral");
	const categories = useI18nCategoryList(FLORAL_CATEGORY_DEFS);
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [deliveryAddr, setDeliveryAddr] = useState(() => {
		const saved = getLocationItem('strug_user_address');
		if (saved) return saved;
		try {
			const loc = getLocationItem('strug_user_location');
			if (loc) { const p = JSON.parse(loc); if (p.address) return p.address; }
		} catch {}
		return getUser()?.saved_address || "";
	});
	const [addressSet, setAddressSet] = useState(() => {
		const saved = getLocationItem('strug_user_address');
		if (saved) return true;
		try {
			const loc = getLocationItem('strug_user_location');
			if (loc) { const p = JSON.parse(loc); if (p.address) return true; }
		} catch {}
		return !!(getUser()?.saved_address);
	});
	useEffect(() => {
		if (!addressSet) {
			const saved = getUser()?.saved_address;
			if (saved) { setDeliveryAddr(saved); setAddressSet(true); }
		}
	}, []);
	const [activeCategory, setActiveCategory] = useState("all");
	const [activeShop, setActiveShop] = useState(null);
	const { hasActiveEvent } = useEventPlan();
	const eventCart = useEventCart();
	const [query, setQuery] = useState("");
	const [storeQuery, setStoreQuery] = useState(() => {
		try {
			const q = window.__pendingBrowseQuery;
			if (q) {
				delete window.__pendingBrowseQuery;
				return String(q);
			}
		} catch { /* ignore */ }
		return "";
	});
	const [cart, setCart] = useState([]);
	const [floralView, setFloralView] = useState("stores");
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [floralView]);
	const [floralShops, setFloralShops] = useState([]);
	const [floralItems, setFloralItems] = useState([]);
	const [storesLoading, setStoresLoading] = useState(false);
	const [itemsLoading, setItemsLoading] = useState(false);
	const [storesError, setStoresError] = useState(false);
	const [storesRetryTick, setStoresRetryTick] = useState(0);
	const [itemsError, setItemsError] = useState(false);
	const [itemsRetryTick, setItemsRetryTick] = useState(0);
	const [selectedShop, setSelectedShop] = useState(null);
	const [floralVendorTypeId, setFloralVendorTypeId] = useState(null);
	const [floralTypeReady, setFloralTypeReady] = useState(false);
	const [coldLoadError, setColdLoadError] = useState(false);
	const [savedShopIds, setSavedShopIds] = useState(() => new Set());
	// Raw /saves rows keep title/thumb/accent so the Saved tab can render a florist
	// that browse dropped (vendor closed, or moved past the 20 km cap).
	const [savedShopRows, setSavedShopRows] = useState([]);
	const [reorderError, setReorderError] = useState(false);
	const [saveError, setSaveError] = useState(false);
	const didFloralColdLoad = useRef(false);

	const [sortBy, setSortBy] = useState("recommended");
	const [activeOrderId, setActiveOrderId] = useState(null);
	const [deliveryMode, setDeliveryMode] = useState("delivery");
	const [showAddrEdit, setShowAddrEdit] = useState(false);
	const [addrInput, setAddrInput] = useState("");
	const [allowAddressAutoResume, setAllowAddressAutoResume] = useState(true);

	const [selectedItem, setSelectedItem] = useState(null);
	const [selectedModifiers, setSelectedModifiers] = useState([]);
	const [qty, setQty] = useState(1);
	const [giftMessage, setGiftMessage] = useState("");
	const [checkoutPromoCode, setCheckoutPromoCode] = useState(null);

	useEffect(() => {
		if (selectedItem) {
			setSelectedModifiers([]);
			setQty(1);
			setGiftMessage("");
		} else {
			setSelectedModifiers([]);
		}
	}, [selectedItem]);

	const modifierGroups = selectedItem?.modifierGroups ?? [];

	const modifiersSatisfied = (selectedItem?.modifierGroups ?? []).every(g => {
		const min = Number(g.min_select) || 0;
		if (min <= 0) return true;
		return selectedModifiers.filter(m => m.group_id === g.group_id).length >= min;
	});

	function addToCart() {
		if (!selectedItem || !selectedItem.inStock || !modifiersSatisfied) return;
		const itemTotalPrice = selectedItem.price + selectedModifiers.reduce((sum, m) => sum + m.price, 0);
		const giftNote = giftMessage.trim();
		const entry = {
			...selectedItem,
			price: itemTotalPrice,
			qty,
			extras: selectedModifiers.map(m => `${m.group}: ${m.name}`),
			special_instructions: giftNote || undefined,
			modifier_option_ids: selectedModifiers.map(m => m.option_id).filter(Boolean),
			lineId: Date.now(),
			gradient: selectedItem.gradient || FALLBACK_GRADIENT
		};
		setCart(prev => [...prev, entry]);
		setSelectedItem(null);
		setSelectedModifiers([]);
		setQty(1);
		setGiftMessage("");
	}

	function openFloralShop(shop) {
		if (!shop?.id) return;
		setActiveShop(shop.id);
		setSelectedShop(shop);
		setQuery("");
		setFloralView("browse");
		try {
			const next = floralListingPath(shop);
			if (window.location.pathname !== next) {
				window.history.pushState({ nav: "floral", listingId: shop.id }, "", next);
			}
		} catch { /* noop */ }
	}

	function closeFloralShop() {
		setFloralView("stores");
		setActiveShop(null);
		setSelectedShop(null);
		setSelectedItem(null);
		try {
			if (window.location.pathname.startsWith("/listing/floral/")) {
				window.history.pushState({ nav: "floral" }, "", "/floral");
			}
		} catch { /* noop */ }
	}

	useEffect(() => {
		if (!addressSet) {
			setFloralShops([]);
			setStoresLoading(false);
			return undefined;
		}
		// Wait for Floral vendor_type lookup so we never fan out unscoped category/item
		// queries (or re-run enrichment twice once the id arrives).
		if (!floralTypeReady) {
			setStoresLoading(true);
			return undefined;
		}
		const lat = getLocationItem('strug_user_lat');
		const lng = getLocationItem('strug_user_lng');
		let alive = true;
		setStoresLoading(true);
		setStoresError(false);
		filterVendors({ type: "Floral", lat, lng }).then(async r => {
			if (!alive) return;
			const list = Array.isArray(r) ? r : (r?.data ?? r?.vendors ?? []);
			let mapped = list.map(mapFloralShop);
			if (floralVendorTypeId) {
				try {
					const [catPayload, itemPayload] = await Promise.all([
						getFoodCategories({ vendor_type_id: floralVendorTypeId }).catch(() => []),
						getFoodItems({ vendor_type_id: floralVendorTypeId }).catch(() => []),
					]);
					const cats = Array.isArray(catPayload) ? catPayload : [];
					const items = Array.isArray(itemPayload) ? itemPayload : (itemPayload?.data ?? []);
					const catByVendor = {};
					for (const c of cats) {
						if (c?.vendor_id == null || !c.name) continue;
						(catByVendor[c.vendor_id] ||= []).push(c.name);
					}
					const hayByVendor = {};
					for (const item of items) {
						const vid = item.vendor_id ?? item.food_vendor?.vendor_id;
						if (vid == null) continue;
						const bit = [item.name, item.description, item.food_category?.name].filter(Boolean).join(" ");
						hayByVendor[vid] = hayByVendor[vid] ? `${hayByVendor[vid]} ${bit}` : bit;
						const cname = item.food_category?.name;
						if (cname) (catByVendor[vid] ||= []).push(cname);
					}
					mapped = mapped.map(s => {
						const extraCats = [...new Set(catByVendor[s.id] || catByVendor[Number(s.id)] || [])];
						return {
							...s,
							itemHaystack: hayByVendor[s.id] || hayByVendor[Number(s.id)] || "",
							categoryNames: s.categoryNames.length ? s.categoryNames : extraCats,
						};
					});
				} catch { /* category/item text is optional for distance browse */ }
			}
			if (alive) setFloralShops(mapped);
		}).catch(() => { if (alive) { setFloralShops([]); setStoresError(true); } }).finally(() => { if (alive) setStoresLoading(false); });
		return () => { alive = false; };
	}, [addressSet, deliveryAddr, storesRetryTick, floralVendorTypeId, floralTypeReady]);

	useEffect(() => {
		if (!activeShop) {
			setFloralItems([]);
			setItemsLoading(false);
			return undefined;
		}
		let alive = true;
		setItemsLoading(true);
		setItemsError(false);
		getFoodItems({ vendor_id: activeShop }).then(r => {
			if (!alive) return;
			const list = Array.isArray(r) ? r : (r?.data ?? []);
			setFloralItems(list
				.filter(isGuestFloralItemAvailable)
				.map(item => {
					const resolved = itemPhotoUrl(item);
					const category = (item.food_category?.name ?? item.item_category?.category_name) || "";
					return {
						id: item.food_item_id ?? item.item_id,
						name: item.name || item.item_name || 'Arrangement',
						desc: item.description ?? "",
						category,
						price: Number(item.price) || 0,
						originalPrice: Number.isFinite(Number(item.compare_at_price)) ? Number(item.compare_at_price) : null,
						inStock: item.is_available !== false && item.available !== false && Number(item.stock_qty ?? 1) !== 0,
						featured: false,
						shop: activeShop,
						img: resolved,
						gradient: resolved
							? `url("${resolved}") center/cover no-repeat`
							: FALLBACK_GRADIENT,
						tags: category ? [category] : [],
						modifierGroups: mapModifierGroups(item),
					};
				}));
		}).catch(() => { if (alive) { setFloralItems([]); setItemsError(true); } }).finally(() => { if (alive) setItemsLoading(false); });
		return () => { alive = false; };
	}, [activeShop, itemsRetryTick]);

	useEffect(() => {
		let alive = true;
		getSaves("florist").then(res => {
			if (!alive) return;
			const list = Array.isArray(res) ? res : (res?.data ?? []);
			setSavedShopRows(list);
			setSavedShopIds(new Set(list.map(s => String(s.entity_id))));
		}).catch(() => {});
		return () => { alive = false; };
	}, []);

	const handleToggleSaveShop = useCallback((shop, event) => {
		event?.stopPropagation?.();
		const id = String(shop.id);
		const meta = {
			title: shop.name,
			sub: i18n.t("floral.title"),
			thumb: shop.img,
			accent: "#db2777",
		};
		const wasSaved = savedShopIds.has(id);
		setSavedShopIds(prev => {
			const next = new Set(prev);
			if (wasSaved) next.delete(id); else next.add(id);
			return next;
		});
		setSavedShopRows(prev => (
			wasSaved
				? prev.filter(r => String(r.entity_id) !== id)
				: [...prev.filter(r => String(r.entity_id) !== id), { entity_id: id, entity_type: "florist", meta }]
		));
		toggleSave("florist", id, meta).catch(() => {
			setSavedShopIds(prev => {
				const next = new Set(prev);
				if (wasSaved) next.add(id); else next.delete(id);
				return next;
			});
			setSavedShopRows(prev => (
				wasSaved
					? [...prev.filter(r => String(r.entity_id) !== id), { entity_id: id, entity_type: "florist", meta }]
					: prev.filter(r => String(r.entity_id) !== id)
			));
			setSaveError(true);
			setTimeout(() => setSaveError(false), 5000);
		});
	}, [savedShopIds]);

	function handleReorder(order) {
		const vendorId = order?.vendor_id ?? order?.food_vendor?.vendor_id;
		if (!vendorId) {
			setReorderError(true);
			setTimeout(() => setReorderError(false), 6000);
			return;
		}
		getVendor(vendorId).then(raw => {
			const v = raw?.data ?? raw;
			if (!v || !isFloralVendorType(v)) {
				setReorderError(true);
				setTimeout(() => setReorderError(false), 6000);
				return;
			}
			const mapped = mapFloralShop(v);
			const items = Array.isArray(order.food_order_items) ? order.food_order_items : [];
			setCart(items.filter(it => it.food_item_id != null).map((it, i) => ({
				id: it.food_item_id,
				name: it.food_item?.name ?? i18n.t("floral.title"),
				price: Number(it.price_item) || 0,
				qty: it.qty || 1,
				extras: [],
				special_instructions: it.special_instructions || undefined,
				modifier_option_ids: Array.isArray(it.modifier_option_ids) ? it.modifier_option_ids : [],
				lineId: Date.now() + i,
				inStock: true,
				shop: mapped.id,
				gradient: FALLBACK_GRADIENT,
			})));
			openFloralShop(mapped);
		}).catch(() => {
			setReorderError(true);
			setTimeout(() => setReorderError(false), 6000);
		});
	}

	function selectFloralTab(id) {
		if (id === "active") {
			setFloralView(activeOrderId ? "tracking" : "active");
			return;
		}
		if (id === "stores") closeFloralShop();
		else setFloralView(id);
	}

	useEffect(() => {
		let alive = true;
		// .finally only covers settle — if the lookup hangs, browse would sit in
		// skeletons forever, so release the gate after a timeout too.
		const fallback = setTimeout(() => { if (alive) setFloralTypeReady(true); }, 8000);
		findVendorTypeIdByName("Floral")
			.then(id => { if (alive && id) setFloralVendorTypeId(id); })
			.catch(() => { /* history / enrichment degrade without a type id */ })
			.finally(() => { if (alive) { clearTimeout(fallback); setFloralTypeReady(true); } });
		return () => { alive = false; clearTimeout(fallback); };
	}, []);

	const openTrackedFloralOrder = useCallback((orderId) => {
		if (!orderId) return;
		getFoodOrder(orderId).then(raw => {
			const order = raw?.data ?? raw;
			if (!order) return;
			const status = String(order.order_status ?? order.status ?? "").toLowerCase();
			if (FLORAL_TERMINAL_STATUSES.has(status)) {
				clearFloralSession();
				setFloralView("history");
				return;
			}
			if (!isFloralVendorType({ vendor_type: order.vendor_type || order.food_vendor?.vendor_type })) {
				clearFloralSession();
				return;
			}
			const vendor = order.food_vendor;
			if (vendor) {
				const mapped = mapFloralShop(vendor);
				setSelectedShop(mapped);
				setActiveShop(mapped.id);
			}
			setActiveOrderId(order.food_order_id ?? orderId);
			const mode = String(order.fulfillment_mode || "").toLowerCase();
			if (mode === "pickup" || order.deliver_location === "__SELF_PICKUP__") setDeliveryMode("pickup");
			else if (mode === "delivery") setDeliveryMode("delivery");
			setFloralView("tracking");
			saveFloralSession({ activeOrderId: order.food_order_id ?? orderId, deliveryMode: mode === "pickup" ? "pickup" : "delivery" });
		}).catch(() => {});
	}, []);

	useEffect(() => {
		const session = loadFloralSession();
		if (!session?.activeOrderId) return;
		openTrackedFloralOrder(session.activeOrderId);
	}, [openTrackedFloralOrder]);

	useEffect(() => {
		const openTracked = () => {
			const id = window.__foodTrackOrderId;
			if (!id) return;
			window.__foodTrackOrderId = null;
			openTrackedFloralOrder(id);
		};
		openTracked();
		window.addEventListener("strug:open-notification-target", openTracked);
		return () => window.removeEventListener("strug:open-notification-target", openTracked);
	}, [openTrackedFloralOrder]);

	useEffect(() => {
		if (floralView !== "tracking" || !activeOrderId) return;
		saveFloralSession({ activeOrderId, deliveryMode });
	}, [floralView, activeOrderId, deliveryMode]);

	useEffect(() => {
		if (!initialListingId || didFloralColdLoad.current) return;
		didFloralColdLoad.current = true;
		getVendor(initialListingId).then(raw => {
			const v = raw?.data ?? raw;
			if (!v || !isFloralVendorType(v)) {
				setColdLoadError(true);
				setTimeout(() => setColdLoadError(false), 6000);
				return;
			}
			openFloralShop(mapFloralShop(v));
		}).catch(() => {
			setColdLoadError(true);
			setTimeout(() => setColdLoadError(false), 6000);
		});
	}, [initialListingId]);

	useEffect(() => {
		const handler = () => {
			if (!/^\/listing\/floral\//.test(window.location.pathname)) {
				setFloralView("stores");
				setActiveShop(null);
				setSelectedShop(null);
				setSelectedItem(null);
			}
		};
		window.addEventListener("popstate", handler);
		return () => window.removeEventListener("popstate", handler);
	}, []);

	const shopsWithDist = useMemo(() => {
		const savedLat = getLocationItem('strug_user_lat');
		const savedLng = getLocationItem('strug_user_lng');
		let userLat = savedLat != null ? parseFloat(savedLat) : null;
		let userLng = savedLng != null ? parseFloat(savedLng) : null;
		if (!Number.isFinite(userLat)) userLat = null;
		if (!Number.isFinite(userLng)) userLng = null;
		if (userLat === null || userLng === null) {
			try {
				const userLocStr = getLocationItem('strug_user_location');
				const userLoc = userLocStr ? JSON.parse(userLocStr) : null;
				userLat = Number.isFinite(Number(userLoc?.lat)) ? Number(userLoc.lat) : null;
				userLng = Number.isFinite(Number(userLoc?.lng)) ? Number(userLoc.lng) : null;
			} catch {
				userLat = null;
				userLng = null;
			}
		}

		return floralShops.map(v => {
			const lat = Number.isFinite(Number(v.lat)) ? Number(v.lat) : null;
			const lng = Number.isFinite(Number(v.lng)) ? Number(v.lng) : null;
			const dist = getDistance(userLat, userLng, lat, lng);
			const eta = dist == null ? null : 15 + Math.round(dist * 6);
			return {
				...v,
				lat,
				lng,
				dist,
				eta: eta == null ? null : `${eta} min`,
				etaNum: eta,
				delivery: eta == null || dist == null ? null : `${eta - 3}–${eta + 5} min (${dist.toFixed(1)} km)`,
			};
		});
	}, [floralShops, deliveryAddr]);

	const filteredShops = useMemo(() => {
		return shopsWithDist.filter(s => {
			if (!isWithinFoodBrowseRadius(s.dist)) return false;
			if (!shopMatchesFloralCategory(s, activeCategory, categories)) return false;
			return !storeQuery || s.name.toLowerCase().includes(storeQuery.toLowerCase());
		});
	}, [shopsWithDist, storeQuery, activeCategory, categories]);

	const sortedShops = useMemo(() => {
		let list = [...filteredShops];
		if (sortBy === "distance") {
			list.sort((a, b) => (a.dist ?? Number.POSITIVE_INFINITY) - (b.dist ?? Number.POSITIVE_INFINITY));
		} else if (sortBy === "speed") {
			list.sort((a, b) => (a.etaNum ?? Number.POSITIVE_INFINITY) - (b.etaNum ?? Number.POSITIVE_INFINITY));
		}
		return list;
	}, [filteredShops, sortBy]);

	const currentShop = shopsWithDist.find(s => sameShopId(s.id, activeShop)) || selectedShop;

	const catScrollRef = useRef(null);
	const [catScrollState, setCatScrollState] = useState({ atStart: true, atEnd: true });
	useLayoutEffect(() => {
		const el = catScrollRef.current;
		if (!el) return undefined;
		const update = () => setCatScrollState(prev => { const atStart = el.scrollLeft <= 4, atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4; return prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }; });
		update();
		el.addEventListener("scroll", update, { passive: true });
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
	}, [floralView]);

	function confirmFloralAddress(addr, lat, lng) {
		const clean = String(addr || "").trim();
		if (!clean) return;
		setDeliveryAddr(clean);
		setAddressSet(true);
		persistFloralAddress(clean, lat, lng);
	}

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px" }}>
					<SkeletonHeading />
					<div style={{ display: "flex", gap: 20, margin: "16px 0 28px" }}>
						{[...Array(5)].map((_,i) => <SkeletonCircle key={i} />)}
					</div>
				</div>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
					{[...Array(8)].map((_,i) => <SkeletonProductCard key={i} />)}
				</div>
			</div>
		</div>
	);
	if (!addressSet) return (
		<FoodAddressCapture
			allowAutoResume={allowAddressAutoResume}
			onConfirm={(addr, lat, lng) => confirmFloralAddress(addr, lat, lng)}
			onBack={deliveryAddr ? () => setAddressSet(true) : undefined}
			userLocation={userLocation}
			subtitle={i18n.t("floral.addressSubtitle")}
			ctaLabel={i18n.t("floral.findFlorists")}
		/>
	);
	if (floralView === "cart") return <FoodCartPage cart={cart} setCart={setCart} restaurant={currentShop} onBack={() => setFloralView(activeShop ? "browse" : "stores")} onCheckout={(code) => { setCheckoutPromoCode(code || null); setFloralView("checkout"); }} backLabel={i18n.t("floral.backToShop")} emptyLabel={i18n.t("floral.browseFlorists")} vertical="floral" />;
	if (floralView === "checkout") {
		const checkoutShop = currentShop;
		if (!checkoutShop) {
			return <FoodCartPage cart={cart} setCart={setCart} onBack={() => setFloralView(activeShop ? "browse" : "stores")} onCheckout={() => setFloralView("stores")} backLabel={i18n.t("floral.backToShop")} emptyLabel={i18n.t("floral.browseFlorists")} vertical="floral" />;
		}
		return (
			<FoodCheckoutPage
				cart={cart}
				onBack={() => setFloralView("cart")}
				onPlaceOrder={(oid, mode) => {
					setActiveOrderId(oid);
					if (mode) setDeliveryMode(mode);
					setFloralView("tracking");
					saveFloralSession({ activeOrderId: oid, deliveryMode: mode || "delivery" });
					const coords = readSavedCoords();
					persistFloralAddress(deliveryAddr, coords.lat, coords.lng);
				}}
				restaurant={checkoutShop}
				deliveryAddr={deliveryAddr}
				vendorTypeId={checkoutShop.vendor_type_id ?? floralVendorTypeId}
				merchantType="florist"
				sellerId={checkoutShop.owner_id}
				itemSource="food"
				vertical="floral"
				promoCode={checkoutPromoCode}
			/>
		);
	}
	if (floralView === "tracking") {
		const trackingShop = currentShop || { name: i18n.t("floral.title") };
		return (
			<FoodTrackingPage
				restaurant={trackingShop}
				orderId={activeOrderId}
				deliveryMode={deliveryMode}
				merchantType="florist"
				onBack={() => setFloralView(activeShop || selectedShop ? "browse" : "stores")}
				onDone={() => {
					clearFloralSession();
					setCart([]);
					setActiveShop(null);
					setSelectedShop(null);
					setActiveOrderId(null);
					setFloralView("stores");
					try {
						if (window.location.pathname.startsWith("/listing/floral/")) {
							window.history.pushState({ nav: "floral" }, "", "/floral");
						}
					} catch { /* noop */ }
				}}
			/>
		);
	}

	if (floralView === "favorites") {
		// Render from the saved rows, not the browse result — a florist that's closed
		// or past the 20 km cap is missing from shopsWithDist but still saved.
		const liveById = new Map(shopsWithDist.map(s => [String(s.id), s]));
		const saved = savedShopRows
			.filter(r => savedShopIds.has(String(r.entity_id)))
			.map(r => liveById.get(String(r.entity_id)) || {
				id: r.entity_id,
				name: r.meta?.title || i18n.t("floral.title"),
				img: r.meta?.thumb || null,
				color: "#2a0a1f",
				accent: r.meta?.accent || "#db2777",
				delivery: null,
				eta: null,
			});
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 20 }}>
				<FloralOrdersTabBar active="favorites" hasActiveOrder={!!activeOrderId} onSelect={selectFloralTab} />
				{saved.length === 0 ? (
					<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", minHeight: "42vh", gap: 14 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, maxWidth: 280 }}>{i18n.t("floral.noFavorites", { defaultValue: "No saved florists yet — tap the heart on a shop to save it here." })}</p>
						<button type="button" onClick={() => setFloralView("stores")} style={{ padding: "10px 22px", background: "#db2877", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{i18n.t("floral.browseFlorists")}</button>
					</div>
				) : (
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, paddingBottom: 24 }}>
						{saved.map(shop => (
							<div key={shop.id} onClick={() => openFloralShop(shop)} className="bg-surface border border-border" style={{ borderRadius: 16, padding: 16, cursor: "pointer" }}>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700 }}>{shop.name}</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 6 }}>{shop.delivery || shop.eta || ""}</p>
							</div>
						))}
					</div>
				)}
			</div>
		);
	}

	if (floralView === "active") {
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 20 }}>
				<FloralOrdersTabBar active="active" hasActiveOrder={!!activeOrderId} onSelect={selectFloralTab} />
				<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
					<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{i18n.t("floral.noActiveOrder", { defaultValue: "No active flower order" })}</p>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 20, maxWidth: 320 }}>{i18n.t("floral.noActiveOrderDesc", { defaultValue: "Place an order and it'll show up here with live tracking." })}</p>
					<button type="button" onClick={() => setFloralView("stores")} style={{ padding: "12px 24px", background: "#db2877", border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{i18n.t("floral.browseFlorists")}</button>
				</div>
			</div>
		);
	}

	if (floralView === "history") {
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 20 }}>
				<FloralOrdersTabBar active="history" hasActiveOrder={!!activeOrderId} onSelect={selectFloralTab} />
				{reorderError && (
					<div style={{ maxWidth: 480, margin: "0 auto 14px", padding: "10px 14px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, textAlign: "center" }}>
						{i18n.t("floral.reorderError", { defaultValue: "That florist isn't available for reorder right now." })}
					</div>
				)}
				<FloralOrderHistoryPage floralVendorTypeId={floralVendorTypeId} floralTypeReady={floralTypeReady} onReorder={handleReorder} isMobile={isMobile} />
			</div>
		);
	}

	const cartCount = cart.reduce((s, i) => s + i.qty, 0);
	const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

	const floralCartBadge = cartCount > 0 && (
		<button onClick={() => setFloralView("cart")} style={{ position: "fixed", top: isMobile ? 12 : 20, right: isMobile ? 12 : 40, zIndex: 50, width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "#db2877", border: "none", color: "#fff", cursor: "pointer", boxShadow: "0 4px 20px rgba(219,40,119,0.45)", transition: "background 0.2s, box-shadow 0.2s" }}>
			<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
			<span style={{ position: "absolute", top: -3, right: -3, width: 18, height: 18, borderRadius: "50%", background: "#ef4444", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{cartCount}</span>
		</button>
	);

	if (storesLoading && floralView === "stores") return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px" }}>
					<SkeletonHeading />
					<div style={{ display: "flex", gap: 12, margin: "16px 0 24px" }}>
						{[...Array(3)].map((_,i) => <Skel key={i} w={140} h={60} r={12} />)}
					</div>
					<div style={{ display: "flex", gap: 12, margin: "0 0 28px" }}>
						{[...Array(5)].map((_,i) => <SkeletonCircle key={i} />)}
					</div>
				</div>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
					{[...Array(8)].map((_,i) => <SkeletonProductCard key={i} w="100%" imgH={140} />)}
				</div>
			</div>
		</div>
	);

	// ── Stores listing ──────────────────────────────────────────────────────
	if (floralView === "stores") return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			{floralCartBadge}
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4, textAlign: "center" }}>{landingTitle}</h1>
					<p className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", marginBottom: 16, textAlign: "center" }}>{i18n.t("floral.chooseFlorist")}</p>
					<FloralOrdersTabBar active="stores" hasActiveOrder={!!activeOrderId} onSelect={selectFloralTab} />
					<div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
						<button type="button" onClick={() => window.__nav?.("sd-flowers")} style={{ background: "rgba(219,40,119,0.14)", border: "1px solid rgba(219,40,119,0.45)", borderRadius: 24, color: "#f9a8d4", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, padding: "8px 16px", cursor: "pointer" }}>{i18n.t("floral.sellFlowers", { defaultValue: "Sell flowers" })}</button>
					</div>

					<ConciergeEntryBanner
						to="event-plan"
						title={i18n.t("event.bannerTitle", { defaultValue: "Planning a whole event?" })}
						body={i18n.t("event.bannerBody", { defaultValue: "Book venue, catering & flowers together — one date, one cart, one checkout." })}
					/>

					{/* Address Selector */}
					<div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: 16, position: "relative" }}>
						<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
							<div className="bg-surface-raised border border-border" style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 10, padding: "9px 14px", maxWidth: 300, cursor: "pointer", transition: "border-color 0.15s" }}
								onClick={() => { setShowAddrEdit(v => !v); setAddrInput(deliveryAddr); }}
								onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(219,40,119,0.45)"}
								onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border)"}>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#db2877" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
								<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deliveryAddr}</span>
								<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
							</div>
							<button onClick={() => { setAllowAddressAutoResume(false); setAddressSet(false); }} className="text-text-secondary" style={{ background: "none", border: "none", padding: "6px 4px", margin: "-4px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer", textDecoration: "underline", whiteSpace: "nowrap" }}>{i18n.t("floral.changeAddress")}</button>
						</div>

						{showAddrEdit && (
							<>
								<div style={{ position: "fixed", inset: 0, zIndex: 29 }} onClick={() => setShowAddrEdit(false)} />
								<div className="bg-surface border border-border" style={{ position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", width: 380, maxWidth: "90vw", borderRadius: 14, zIndex: 30, boxShadow: "0 12px 40px var(--color-shadow)", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
									<div style={{ padding: "0" }}>
										<AddressAutocomplete value={addrInput} onChange={(val, lat, lng) => { setAddrInput(val); if (lat != null && lng != null) { confirmFloralAddress(val, lat, lng); setShowAddrEdit(false); } }} onEnter={(val, lat, lng) => { if (val?.trim() && lat != null && lng != null) { confirmFloralAddress(val, lat, lng); setShowAddrEdit(false); } }} placeholder={i18n.t("floral.enterNewAddress")} useLocation wrapStyle={{ width: "100%" }} inputStyle={{ width: "100%", background: "none", border: "none", outline: "none", color: "var(--color-text-primary)", fontSize: 13, fontFamily: "'DM Sans', sans-serif", padding: "14px 16px" }} />
									</div>
								</div>
							</>
						)}
					</div>

					{/* Search & Sort Bar */}
					<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
						<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "13px 18px", gap: 12 }}>
							<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={18} /></div>
							<input value={storeQuery} onChange={e => setStoreQuery(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 15, fontFamily: "'DM Sans', sans-serif", caretColor: "#db2877" }} />
						</div>

						<div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
							{[
								{ id: "recommended", label: i18n.t("floral.sortRecommended") },
								{ id: "distance", label: i18n.t("floral.sortNearest") },
								// No rating column on vendors — "Top rated" would just shuffle "New" cards.
								{ id: "speed", label: i18n.t("floral.sortFastest") },
							].map(opt => (
								<button key={opt.id} onClick={() => setSortBy(opt.id)} className={sortBy === opt.id ? "text-text-primary" : "text-text-secondary"} style={{
									display: "flex", alignItems: "center", gap: 6,
									padding: "6px 12px",
									borderRadius: 12,
									background: sortBy === opt.id ? "rgba(219, 40, 119, 0.16)" : "var(--color-surface-raised)",
									border: `1px solid ${sortBy === opt.id ? "rgba(219, 40, 119, 0.4)" : "var(--color-border-subtle)"}`,
									fontSize: 12,
									fontWeight: 600,
									fontFamily: "'DM Sans', sans-serif",
									cursor: "pointer",
									transition: "all 0.15s"
								}}>
									<span>{opt.label}</span>
								</button>
							))}
						</div>
					</div>
				</div>

				<div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 20, animation: "fadeUp 0.35s ease 90ms both" }}>
					<button type="button" onClick={() => catScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })} className={catScrollState.atStart ? "text-text-muted" : "text-text-primary"} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: catScrollState.atStart ? "var(--color-surface)" : "var(--color-surface-raised)", border: `1px solid ${catScrollState.atStart ? "var(--color-border-subtle)" : "var(--color-border)"}`, cursor: catScrollState.atStart ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible" }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					</button>
					<div ref={catScrollRef} className="ecom-cat-scroll" style={{ flex: 1, display: "flex", gap: 20, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none", justifyContent: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "center" : "flex-start" }}>
						{categories.map((cat, i) => (
							<LeoButton key={cat.id} cat={cat} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 30} />
						))}
					</div>
					<button type="button" onClick={() => catScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: catScrollState.atEnd ? "var(--color-surface)" : "#db2877", border: `1px solid ${catScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`, color: catScrollState.atEnd ? "var(--color-text-muted)" : "#fff", cursor: catScrollState.atEnd ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible" }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</button>
				</div>

				{coldLoadError && (
					<div style={{ maxWidth: 480, margin: "0 auto 14px", padding: "10px 14px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, textAlign: "center" }}>
						{i18n.t("floral.coldLoadError", { defaultValue: "Couldn't open that florist — it may be unavailable right now." })}
					</div>
				)}
				{saveError && (
					<div style={{ maxWidth: 480, margin: "0 auto 14px", padding: "10px 14px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, textAlign: "center" }}>
						{i18n.t("floral.saveFailed", { defaultValue: "Couldn't save that florist. Try again." })}
					</div>
				)}
				{storesError && (
					<div style={{ maxWidth: 480, margin: "0 auto 14px", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, textAlign: "center" }}>
						{i18n.t("floral.vendorsError", { defaultValue: "Couldn't load florists." })}
						<button type="button" onClick={() => setStoresRetryTick(n => n + 1)} style={{ background: "none", border: "none", color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 700, textDecoration: "underline", cursor: "pointer" }}>{i18n.t("floral.retry", { defaultValue: "Retry" })}</button>
					</div>
				)}

				{sortedShops.length === 0 && !storesError ? (
					<div style={{ textAlign: "center", padding: "60px 20px", animation: "fadeUp 0.3s ease both" }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 8 }}>
							{activeCategory !== "all"
								? i18n.t("floral.noFloristsInCategory", { category: categories.find(c => c.id === activeCategory)?.label || "", defaultValue: "No florists in this category." })
								: i18n.t("floral.noFloristsMatch")}
						</p>
						<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 16 }}>{i18n.t("floral.tryDifferentSearch")}</p>
						{activeCategory !== "all" && (
							<button type="button" onClick={() => setActiveCategory("all")} style={{ background: "#db2877", border: "none", borderRadius: 12, padding: "10px 20px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, cursor: "pointer" }}>{i18n.t("events.categories.all", { defaultValue: "All" })}</button>
						)}
					</div>
				) : (
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, animation: "fadeUp 0.35s ease 60ms both", paddingBottom: 24 }}>
					{/* Card face uses shop.color (deliberately dark vendor brand color), so all
					    text/dividers inside stay hardcoded "white on dark vendor card". */}
					{sortedShops.map((shop, i) => {
						const feeLabel = shop.fee == null
							? null
							: (shop.fee === 0 ? i18n.t("floral.freeDelivery") : i18n.t("floral.deliveryFeeAmount", { amount: Number(shop.fee).toFixed(2) }));
						return (
							<div key={shop.id} onClick={() => openFloralShop(shop)}
								style={{ borderRadius: 16, border: `1.5px solid ${shop.accent}33`, background: shop.color, padding: 0, cursor: "pointer", overflow: "hidden", transition: "transform 0.18s, box-shadow 0.18s, border-color 0.18s", animation: `fadeUp 0.3s ease ${i * 60}ms both` }}
								onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = `0 12px 32px ${shop.accent}22`; e.currentTarget.style.borderColor = `${shop.accent}66`; }}
								onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = `${shop.accent}33`; }}
							>
								<div style={{ width: "100%", height: 120, background: `linear-gradient(135deg, ${shop.color}, #1a0a1a)`, position: "relative", overflow: "hidden" }}>
									{shop.img
										? <img loading="lazy" decoding="async" src={shop.img} alt={shop.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none"; }} />
										: <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
											<svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={shop.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
												<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
											</svg>
										</div>
									}
									{shop.promo && (
										<div style={{ position: "absolute", top: 8, left: 8, maxWidth: "calc(100% - 16px)", background: "#db2777", borderRadius: 6, padding: "3px 8px" }}>
											<span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shop.promo}</span>
										</div>
									)}
									<div style={{ position: "absolute", top: 8, right: 8, display: "flex", alignItems: "center", gap: 6 }}>
										<button
											type="button"
											onClick={(e) => handleToggleSaveShop(shop, e)}
											aria-label={savedShopIds.has(String(shop.id)) ? i18n.t("floral.unsave", { defaultValue: "Unsave florist" }) : i18n.t("floral.save", { defaultValue: "Save florist" })}
											style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: savedShopIds.has(String(shop.id)) ? "#db2777" : "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
										>
											<svg width={13} height={13} viewBox="0 0 24 24" fill={savedShopIds.has(String(shop.id)) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/></svg>
										</button>
										<div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.6)", borderRadius: 20, padding: "3px 8px" }}>
											<svg width={10} height={10} viewBox="0 0 24 24" fill="#f59e0b"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
											<span style={{ fontSize: 11, fontWeight: 600, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{shop.rating ?? "New"}</span>
										</div>
									</div>
								</div>
								<div style={{ padding: "14px 16px" }}>
								<p style={{ fontSize: 16, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>{shop.name}</p>
								<div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
									{shop.eta && <span style={{ fontSize: 12, fontWeight: 600, color: shop.accent, fontFamily: "'DM Sans', sans-serif" }}>{shop.eta}</span>}
									{shop.delivery && (
										<>
											<span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>·</span>
											<span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif" }}>{shop.delivery}</span>
										</>
									)}
									{feeLabel && (
										<>
											<span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>·</span>
											<span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif" }}>{feeLabel}</span>
										</>
									)}
								</div>
								<div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
									<span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("floral.browseFlorists")} →</span>
								</div>
								</div>
							</div>
						);
					})}
				</div>
				)}
			</div>
		</div>
	);

	if (!currentShop) {
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40 }}>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 16 }}>{i18n.t("floral.noFloristsMatch")}</p>
				<button onClick={closeFloralShop} style={{ background: "#db2877", border: "none", borderRadius: 12, padding: "10px 20px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, cursor: "pointer" }}>{i18n.t("floral.browseFlorists")}</button>
			</div>
		);
	}

	// ── Browse shop items ────────────────────────────────────────────────────
	const filtered = floralItems.filter(item => {
		const matchCat = itemMatchesFloralCategory(item, activeCategory, categories);
		const matchShop = sameShopId(item.shop, activeShop);
		const q = query.trim().toLowerCase();
		const matchQ = !q || item.name.toLowerCase().includes(q) || String(item.category).toLowerCase().includes(q);
		return matchCat && matchShop && matchQ;
	});

	if (selectedItem) {
		const itemTotalPrice = selectedItem.price + selectedModifiers.reduce((sum, m) => sum + m.price, 0);
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, animation: "fadeUp 0.3s ease both" }}>
				<div style={{ paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 28, paddingBottom: 24 }}>
					<button onClick={() => setSelectedItem(null)} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 24, padding: 0 }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
						{i18n.t("floral.backToMenu")}
					</button>
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 40, alignItems: "start" }}>
						{/* Image tile face is selectedItem.gradient (photo or hardcoded dark gradient
						    fallback), same "always dark" treatment as FloralItemCard — left hardcoded.
						    The boxShadow below it is a plain page-level drop shadow, so that's tokenized. */}
						<div style={{ borderRadius: 20, background: selectedItem.gradient || FALLBACK_GRADIENT, aspectRatio: "4/3", width: "100%", boxShadow: "0 24px 64px var(--color-shadow)", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
							{selectedItem.img
								? <img loading="lazy" decoding="async" src={selectedItem.img} alt={selectedItem.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none"; }} />
								: <FloralIcon s={64} style={{ opacity: 0.3 }} />}
						</div>

						<div style={{ display: "flex", flexDirection: "column" }}>
							<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 36, textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 6 }}>{selectedItem.name}</h2>
							{selectedItem.desc ? (
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.5, marginBottom: 12 }}>{selectedItem.desc}</p>
							) : null}
							<div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
								{selectedItem.tags && selectedItem.tags.map(t => (
									<span key={t} className="text-text-secondary bg-surface-raised" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", padding: "3px 8px", borderRadius: 10 }}>{t}</span>
								))}
							</div>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 26, fontWeight: 700, color: "#db2877", marginBottom: 28 }}>${itemTotalPrice.toFixed(2)}</p>

							{modifierGroups.map(group => {
								const isSingle = group.max_select === 1;
								return (
									<div key={group.group_id || group.name} style={{ marginBottom: 20 }}>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
											{group.name} {isSingle && <span style={{ textTransform: "none", color: "#db2877", fontWeight: 600 }}>{i18n.t("floral.selectOne")}</span>}
											{!isSingle && Number(group.min_select) > 0 && <span style={{ textTransform: "none", color: "#db2877", fontWeight: 600 }}>{i18n.t("floral.selectRequired", { count: group.min_select, defaultValue: `(Pick at least ${group.min_select})` })}</span>}
										</p>
										<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
											{group.options.map(opt => {
												const isChecked = selectedModifiers.some(m => m.option_id === opt.option_id);
												return (
													<label key={opt.option_id || opt.name} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 14px", borderRadius: 10, background: isChecked ? "rgba(219,40,119,0.12)" : "var(--color-surface-raised)", border: `1px solid ${isChecked ? "rgba(219,40,119,0.4)" : "var(--color-border-subtle)"}`, transition: "all 0.15s" }}>
														<input
															type={isSingle ? "radio" : "checkbox"}
															name={isSingle ? `modifier_group_${group.group_id}` : undefined}
															checked={isChecked}
															onChange={() => {
																const entry = { option_id: opt.option_id, group_id: group.group_id, group: group.name, name: opt.name, price: opt.price };
																if (isChecked && !isSingle) {
																	setSelectedModifiers(prev => prev.filter(m => m.option_id !== opt.option_id));
																} else if (isSingle) {
																	setSelectedModifiers(prev => [...prev.filter(m => m.group_id !== group.group_id), entry]);
																} else {
																	setSelectedModifiers(prev => [...prev, entry]);
																}
															}}
															style={{ accentColor: "#db2877", flexShrink: 0 }}
														/>
														<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.3 }}>
															{opt.name} {opt.price > 0 && `(+$${opt.price.toFixed(2)})`}
														</span>
													</label>
												);
											})}
										</div>
									</div>
								);
							})}

							{/* Custom Gift Card message box */}
							<div style={{ marginBottom: 24 }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{i18n.t("floral.giftCardMessage")}</p>
								<textarea
									value={giftMessage}
									onChange={e => setGiftMessage(e.target.value)}
									placeholder={i18n.t("floral.giftCardPlaceholder")}
									rows={3}
									className="bg-surface-raised border border-border text-text-primary"
									style={{ width: "100%", borderRadius: 10, padding: "12px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box" }}
									onFocus={e => e.target.style.borderColor = "rgba(219,40,119,0.5)"}
									onBlur={e => e.target.style.borderColor = "var(--color-border)"}
								/>
							</div>

							<div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28, marginTop: 12 }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>{i18n.t("floral.quantity")}</p>
								<div style={{ display: "flex", alignItems: "center", gap: 14 }}>
									<button onClick={() => setQty(q => Math.max(1, q - 1))} className="bg-surface-raised border border-border text-text-primary" style={{ width: 34, height: 34, borderRadius: "50%", cursor: "pointer", fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "var(--color-border)"} onMouseLeave={e => e.currentTarget.style.background = "var(--color-surface-raised)"}>−</button>
									<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700, minWidth: 24, textAlign: "center" }}>{qty}</span>
									<button onClick={() => setQty(q => q + 1)} style={{ width: 34, height: 34, borderRadius: "50%", background: "#db2877", border: "none", color: "#fff", cursor: "pointer", fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(219,40,119,0.45)", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "#f472b6"} onMouseLeave={e => e.currentTarget.style.background = "#db2877"}>+</button>
								</div>
							</div>

							<button onClick={addToCart} disabled={!selectedItem.inStock || !modifiersSatisfied} style={{ width: "100%", padding: "14px", background: selectedItem.inStock && modifiersSatisfied ? "#db2877" : "var(--color-surface-raised)", border: "none", borderRadius: 12, color: selectedItem.inStock && modifiersSatisfied ? "#fff" : "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: selectedItem.inStock && modifiersSatisfied ? "pointer" : "default" }}>
								{!selectedItem.inStock ? i18n.t("common.outOfStock") : !modifiersSatisfied ? i18n.t("floral.selectOptionsFirst", { defaultValue: "Select required options" }) : i18n.t("floral.addToCartTotal", { total: (itemTotalPrice * qty).toFixed(2) })}
							</button>
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			{floralCartBadge}
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both", position: "relative" }}>
					<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
						<button onClick={closeFloralShop} className="bg-surface-raised text-text-secondary" style={{ width: 28, height: 28, borderRadius: 8, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
							onMouseEnter={e => { e.currentTarget.style.background = "var(--color-border)"; e.currentTarget.style.color = "var(--color-text-primary)"; }}
							onMouseLeave={e => { e.currentTarget.style.background = "var(--color-surface-raised)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}>
							<svg width={7} height={12} viewBox="0 0 7 12" fill="none"><path d="M6 1L1 6l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
						</button>
						<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", flex: 1, textAlign: "center", marginRight: 40 }}>{currentShop?.name ?? "Floral"}</h1>
					</div>
					{currentShop && (
						<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, justifyContent: "center", flexWrap: "wrap" }}>
							{currentShop.eta && <span style={{ fontSize: 12, fontWeight: 600, color: currentShop.accent, fontFamily: "'DM Sans', sans-serif" }}>{currentShop.eta}</span>}
							{currentShop.fee != null && (
								<>
									<span className="text-text-muted" style={{ fontSize: 11 }}>·</span>
									<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{currentShop.fee === 0 ? i18n.t("floral.freeDelivery") : i18n.t("floral.deliveryFeeAmount", { amount: currentShop.fee.toFixed(2) })}</span>
								</>
							)}
							{currentShop.delivery && (
								<>
									<span className="text-text-muted" style={{ fontSize: 11 }}>·</span>
									<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{currentShop.delivery}</span>
								</>
							)}
							<FloralShareButton shop={currentShop} />
						</div>
					)}
					<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
						<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
							<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={20} /></div>
							<input value={query} onChange={e => setQuery(e.target.value)} placeholder={i18n.t("groceries.searchStoreItems", { store: currentShop?.name ?? "" })} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#db2877" }} />
						</div>
					</div>
				</div>

				{/* Category filter */}
				<div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 24, animation: "fadeUp 0.35s ease 90ms both" }}>
					<button onClick={() => catScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })} className={catScrollState.atStart ? "text-text-muted" : "text-text-primary"} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: catScrollState.atStart ? "var(--color-surface)" : "var(--color-surface-raised)", border: `1px solid ${catScrollState.atStart ? "var(--color-border-subtle)" : "var(--color-border)"}`, cursor: catScrollState.atStart ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", transition: "transform 0.12s, background 0.2s" }} onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; e.currentTarget.style.background = catScrollState.atStart ? "var(--color-surface-raised)" : "var(--color-border)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = catScrollState.atStart ? "var(--color-surface)" : "var(--color-surface-raised)"; }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					</button>
					<div ref={catScrollRef} className="ecom-cat-scroll" style={{ flex: 1, display: "flex", gap: 20, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none", justifyContent: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "center" : "flex-start" }}>
						{categories.map((cat, i) => (
							<LeoButton key={cat.id} cat={cat} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 30} />
						))}
					</div>
					<button onClick={() => catScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: catScrollState.atEnd ? "var(--color-surface)" : "#db2877", border: `1px solid ${catScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`, color: catScrollState.atEnd ? "var(--color-text-muted)" : "#fff", cursor: catScrollState.atEnd ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", transition: "transform 0.12s, background 0.2s", boxShadow: catScrollState.atEnd ? "none" : "0 2px 14px rgba(219,40,119,0.55)" }} onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; e.currentTarget.style.background = catScrollState.atEnd ? "var(--color-surface-raised)" : "rgba(219,40,119,0.8)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = catScrollState.atEnd ? "var(--color-surface)" : "#db2877"; }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</button>
				</div>

				{/* Items grid */}
				<div style={{ marginBottom: cartCount > 0 ? 80 : 32, animation: "fadeUp 0.4s ease 150ms both" }}>
					{itemsLoading ? (
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
							{[...Array(6)].map((_, i) => <SkeletonProductCard key={i} w="100%" imgH={140} />)}
						</div>
					) : itemsError ? (
						<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 60 }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{i18n.t("floral.itemsError", { defaultValue: "Couldn't load arrangements." })}</p>
							<button type="button" onClick={() => setItemsRetryTick(n => n + 1)} style={{ background: "#db2877", border: "none", borderRadius: 12, padding: "10px 20px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, cursor: "pointer" }}>{i18n.t("floral.retry", { defaultValue: "Retry" })}</button>
						</div>
					) : filtered.length > 0 ? (
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
							{filtered.map((item, i) => <FloralItemCard key={item.id} item={item} delay={i * 40} onClick={() => setSelectedItem(item)} />)}
						</div>
					) : (
						<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: 0.85, paddingTop: 60 }}>
							<FloralIcon s={40} />
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>
								{activeCategory !== "all"
									? i18n.t("floral.noArrangementsInCategory", { category: categories.find(c => c.id === activeCategory)?.label || "", defaultValue: "No arrangements in this category." })
									: i18n.t("floral.noArrangements")}
							</p>
							{activeCategory !== "all" && (
								<button type="button" onClick={() => setActiveCategory("all")} style={{ background: "#db2877", border: "none", borderRadius: 12, padding: "10px 20px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, cursor: "pointer", opacity: 1 }}>{i18n.t("events.categories.all", { defaultValue: "All" })}</button>
							)}
						</div>
					)}
				</div>

				{/* Floating cart bar */}
				{cartCount > 0 && (
					<div style={{ position: "sticky", bottom: isMobile ? 78 : 16, display: "flex", flexDirection: "column", gap: 8 }}>
						<button onClick={() => setFloralView("cart")} style={{ width: "100%", background: "#db2877", border: "none", borderRadius: 14, padding: "15px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
							<div style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#fff" }}>{cartCount}</span>
							</div>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, color: "#fff" }}>{i18n.t("shop.viewCart")}</span>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, color: "#fff" }}>${cartTotal.toFixed(2)}</span>
						</button>
						{hasActiveEvent && (() => {
							const shopObj = shopsWithDist.find((s) => s.id === activeShop) || shopsWithDist[0];
							return (
								<button
									onClick={() => {
										const items = cart.map((c) => ({ food_item_id: Number(c.id), qty: c.qty, modifier_option_ids: [] }));
										eventCart.setLine("floral", {
											vendor_id: activeShop,
											seller_id: shopObj?.owner_id ?? activeShop,
											title: shopObj?.name || "Floral",
											items,
											line_total: Number((cartTotal * 1.08).toFixed(2)),
										});
										window.__nav?.("event-plan");
									}}
									style={{ width: "100%", background: "#f97316", border: "none", borderRadius: 14, padding: "13px 22px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
								>
									{eventCart.has("floral") ? i18n.t("event.updateInEvent", { defaultValue: "Update in my event" }) : i18n.t("event.addToEvent", { defaultValue: "Add to my event" })}
								</button>
							);
						})()}
					</div>
				)}
			</div>
			<EventCartPill bottom={isMobile ? 132 : 78} />
		</div>
	);
}

export { FloralPage };
