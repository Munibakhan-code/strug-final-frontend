import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import i18n from "../i18n/index.js";
import { useTranslation } from "react-i18next";
import { useI18nCategoryList } from "../hooks/useI18nCategoryList.js";
import { useViewport } from "../hooks/useViewport.js";
import { useStripe, useElements, CardElement } from "@stripe/react-stripe-js";
import { PayPalButtons } from "@paypal/react-paypal-js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon, CheckIcon } from "../components/icons.jsx";
import {Skel, SkeletonRestaurantCard, SkeletonProductCard, SkeletonCircle, SkeletonHeading, SkeletonBubble} from "../components/skeletons.jsx";
import { LeoButton, AddressAutocomplete, Tooltip } from "../components/shared.jsx";
import LiveTrackingMap from "../components/LiveTrackingMap.jsx";
import { getUser, getAuthUserId } from "../store/auth";
import { getUserRegion, fmt } from "../utils/regionConfig";
import { mediaUrl } from "../utils/mediaUrl";
import { connectSocket } from "../api/socket";
import { getVendors as apiFetchVendors, getVendor as apiFetchVendor, getFoodItems, createFoodOrder, getDeliveryDrivers, getFoodCategories, getFoodOrder, getFoodOrderDeliveryLocation, getMyFoodOrders, findVendorTypeIdByName, cancelFoodOrder, getFoodVendorReviews, submitFoodOrderRating, rescheduleGroceryDelivery } from "../api/food";
import { slugify } from "../utils/slugify.js";
import { openContextChat, openDmChannel } from "../api/chat";
import { getMe, saveAddress, bindCheckoutReferralCode, getCheckoutReferralCode, getWalletBalance } from "../api/user";
import { createStripeIntent, createPaypalOrder, capturePaypalOrder } from "../api/payment";
import { createOrder, getOrder as getProductOrder, submitProductRating, quoteShipping, updateCartItem, removeFromCart } from "../api/shop";
import { buildProductOrderPayload, extractProductOrderId, productOrderStatusToStage, readBuyerDeliveryCoords } from "../utils/shopCheckoutHelpers.js";
import { buildProductRatingPayload } from "../utils/shopBuyerHelpers.js";
import { buildFoodOrderRatingPayload } from "../utils/foodRatingHelpers.js";
import { sellerNetFromOrderTotal } from "../utils/shopSellerHelpers.js";
import { isWithinFoodBrowseRadius } from "../utils/geo.js";
import { getLocationItem, setLocationItem, removeLocationItem } from "../utils/userLocation.js";
import { loadGoogleMaps } from "../utils/googleMaps.js";
import { geocodeAddress } from "../utils/geocode.js";
import { validatePromoCode } from "../api/discounts";
import { parseVendorPromo } from "../utils/promoBadge.js";
import { trackAdEvent } from "../api/ads";
import { getSaves, toggleSave } from "../api/saves";
import client from "../api/client";
import { SafeImage } from "../components/SafeImage.jsx";
import { SHOP_TEST_NAME_PATTERN } from "../utils/shopMappers.js";
import PriceChangeModal from "../components/pricing/PriceChangeModal.jsx";

// Sponsored CTA label per backend cta_text enum.
const AD_CTA_KEYS = { LEARN_MORE: "feed.adCtaLearnMore", SHOP_NOW: "feed.adCtaShopNow", BOOK_NOW: "feed.adCtaBookNow", ORDER_NOW: "feed.adCtaOrderNow", SUBSCRIBE: "feed.adCtaSubscribe" };
function adCtaLabel(cta, t) {
	return t(AD_CTA_KEYS[cta] || "feed.adCtaLearnMore");
}

// Advertiser-controlled target_url → only allow http(s) (XSS guard).
function isSafeHttpUrl(u) {
	try { const p = new URL(u, window.location.origin); return p.protocol === "http:" || p.protocol === "https:"; }
	catch { return false; }
}

/** Guest-facing menu items: hide seller-deactivated rows (is_available=false). */
function isGuestFoodItemAvailable(item) {
	return item?.is_available !== false && item?.available !== false;
}

/** Guest-facing vendor listings: hide inactive or paused storefronts. */
function isGuestFoodVendorVisible(v) {
	if (v?.is_ad) return true;
	if (v?.is_active === false) return false;
	if (v?.is_paused === true) return false;
	if (SHOP_TEST_NAME_PATTERN.test(String(v?.vendor_name || v?.name || ""))) return false;
	return true;
}

function normalizeFoodItemsPayload(data) {
	const arr = Array.isArray(data) ? data : (data?.data ?? []);
	return arr.filter(isGuestFoodItemAvailable);
}

// Resolve which vertical a promo code is validated against so a seller's targeted offer
// (created with vertical = food/grocery/floral/catering/…) matches when the buyer redeems it
// in the corresponding storefront. The shared cart/checkout used to hard-code "food", which
// silently broke every non-food-family vertical's promo. An explicit, meaningful vertical
// always wins; otherwise we fall back to the food/product default the flow implies.
const PROMO_VERTICAL_ALIASES = { groceries: "grocery", flowers: "floral" };
function resolvePromoVertical(vertical, itemSource) {
	const raw = String(vertical || "").trim().toLowerCase();
	const norm = PROMO_VERTICAL_ALIASES[raw] || raw;
	if (norm && norm !== "commerce") return norm;
	return (itemSource === "food" || itemSource == null) ? "food" : "discounts";
}

// Fires a single sponsored-impression beacon when a shadow-card mounts.
function AdImpression({ campaignId }) {
	useEffect(() => { if (campaignId) trackAdEvent(campaignId, "impression").catch(() => {}); }, [campaignId]);
	return null;
}

// Opens an advertiser's click-through URL and records the click. Best-effort.
function openSponsored(card) {
	if (!card || !isSafeHttpUrl(card.target_url)) return;
	if (card.campaign_id) trackAdEvent(card.campaign_id, "click").catch(() => {});
	window.open(card.target_url, "_blank", "noopener,noreferrer");
}

const FOOD_CATEGORY_DEFS = [
	{ id: "all", labelKey: "common.all", color: "#2563eb", match: null, img: "/img/cat/food/All.png" },
	{ id: "pizza", labelKey: "food.categoryPizza", color: "#dc2626", match: "Pizza", img: "/img/cat/food/Pizza.png" },
	{ id: "burgers", labelKey: "food.categoryBurgers", color: "#d97706", match: "Burgers", img: "/img/cat/food/Burgers.png" },
	{ id: "pakistani", labelKey: "food.categoryPakistani", color: "#16a34a", match: "Pakistani", img: "/img/cat/food/Indian.png" },
	{ id: "chinese", labelKey: "food.categoryChinese", color: "#ec4899", match: "Chinese", img: "/img/cat/food/Chinese.png" },
	{ id: "italian", labelKey: "food.categoryItalian", color: "#22c55e", match: "Italian", img: "/img/cat/food/Pizza.png" },
	{ id: "bbq", labelKey: "food.categoryBbq", color: "#f97316", match: "BBQ", img: "/img/cat/food/Burgers.png" },
	{ id: "fast_food", labelKey: "food.categoryFastFood", color: "#ef4444", match: "Fast Food", img: "/img/cat/food/Burgers.png" },
	{ id: "mexican", labelKey: "food.categoryMexican", color: "#14b8a6", match: "Mexican", img: "/img/cat/food/Mexican.png" },
	{ id: "indian", labelKey: "food.categoryIndian", color: "#f59e0b", match: "Indian", img: "/img/cat/food/Indian.png" },
	{ id: "healthy", labelKey: "food.categoryHealthy", color: "#65a30d", match: "Healthy", img: "/img/cat/food/Healthy.png" },
	{ id: "desserts", labelKey: "food.categoryDesserts", color: "#db2777", match: "Desserts", img: "/img/cat/food/Desserts.png" },
	{ id: "sushi", labelKey: "food.categorySushi", color: "#0891b2", match: "Sushi", img: "/img/cat/food/Sushi.png" },
	{ id: "breakfast", labelKey: "food.categoryBreakfast", color: "#d97706", match: "Breakfast", img: "/img/cat/food/Breakfast.png" },
];


const ALL_MENU_CAT = "All";
const FOOD_MENU_CATS = ["Starters", "Mains", "Salads", "Desserts", "Drinks"];
const FOOD_MENU_CAT_KEYS = { All: "food.menu.all", Starters: "food.menu.starters", Mains: "food.menu.mains", Salads: "food.menu.salads", Desserts: "food.menu.desserts", Drinks: "food.menu.drinks" };
function foodMenuCatLabel(cat, t) {
	const key = FOOD_MENU_CAT_KEYS[cat];
	return key ? t(key) : cat;
}


function RestaurantCard({ restaurant, delay, fluid, isSaved, onToggleSave }) {
	const { t } = useTranslation();
	const [hov, setHov] = useState(false);
	const feeLabel = restaurant.fee != null
		? t("food.deliveryFeeShort", {
			fee: restaurant.fee === 0 ? t("food.landing.freeDelivery") : fmt(restaurant.fee, getUserRegion().currency, i18n.language),
		})
		: null;
	return (
		<div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} className="bg-surface" style={{
			width: fluid ? "100%" : 280, borderRadius: 18, overflow: "hidden",
			cursor: restaurant.open ? "pointer" : "default",
			border: `1px solid ${hov && restaurant.open ? "var(--color-border)" : "var(--color-border-subtle)"}`,
			transform: hov && restaurant.open ? "translateY(-4px)" : "none",
			boxShadow: hov && restaurant.open ? "0 16px 48px var(--color-shadow)" : "0 4px 18px var(--color-shadow)",
			transition: "all 0.2s", animation: `fadeUp 0.35s ease ${delay}ms both`,
			flexShrink: fluid ? undefined : 0, opacity: restaurant.open ? 1 : 0.55,
		}}>
			{/* aspectRatio (not a fixed px height) so the image scales with the card — a fixed
			    160px looked squat once cards went full-bleed on mobile. */}
			<div style={{ width: "100%", aspectRatio: "16/9", background: restaurant.thumb, position: "relative", overflow: "hidden" }}>
				<SafeImage
					loading="lazy"
					decoding="async"
					src={restaurant.cover_url || restaurant.img}
					alt={restaurant.name}
					style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
				/>
				<div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(6,8,16,0.78) 0%, rgba(6,8,16,0.05) 62%)" }} />
				{restaurant.is_ad && (
					<div style={{ position: "absolute", top: 10, left: 10, background: "rgba(245,158,11,0.16)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 6, padding: "3px 10px" }}>
						<span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.04em" }}>{i18n.t("feed.sponsored")}</span>
					</div>
				)}
				{!restaurant.is_ad && restaurant.promo && (
					<div style={{ position: "absolute", top: 10, left: 10, background: "#2563eb", borderRadius: 6, padding: "3px 10px" }}>
						<span style={{ fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{restaurant.promo}</span>
					</div>
				)}
				{!restaurant.open && (
					<div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
						<span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)", fontFamily: "'DM Sans', sans-serif" }}>{t("food.landing.closed")}</span>
					</div>
				)}
				{!restaurant.is_ad && onToggleSave && (
					<button
						type="button"
						aria-label={isSaved ? t("food.landing.unsave", { defaultValue: "Remove from favorites" }) : t("food.landing.save", { defaultValue: "Save to favorites" })}
						onClick={e => { e.stopPropagation(); onToggleSave(restaurant); }}
						style={{ position: "absolute", top: 10, right: 10, width: 30, height: 30, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "none", color: isSaved ? "#ef4444" : "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}
					>
						<svg width={15} height={15} viewBox="0 0 24 24" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
					</button>
				)}
				{feeLabel && (
					<div style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(0,0,0,0.75)", borderRadius: 6, padding: "3px 8px" }}>
						<span style={{ fontSize: 11, fontWeight: 600, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{feeLabel}</span>
					</div>
				)}
				<div style={{ position: "absolute", bottom: 10, left: 10, width: 42, height: 42, borderRadius: 12, background: "rgba(10,10,14,0.82)", border: "1px solid rgba(255,255,255,0.18)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
					<SafeImage
						src={restaurant.img}
						alt=""
						style={{ width: "100%", height: "100%", objectFit: "cover" }}
						fallback={<span style={{ color: "#fff", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18 }}>{String(restaurant.name || "?").slice(0, 1)}</span>}
					/>
				</div>
			</div>
			{/* Condensed single-line meta (rating · delivery time · distance) instead of the
			    previous 4-row stack (name / cuisine pills / rating row / bordered footer) —
			    matches how Uber Eats keeps grid cards to a name + one meta line. */}
			<div style={{ padding: "10px 12px 12px" }}>
				<p className="text-text-primary" style={{ fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{restaurant.name}</p>
				{restaurant.is_ad ? (
					<div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(37,99,235,0.14)", border: "1px solid rgba(37,99,235,0.45)", borderRadius: 10, padding: "6px 12px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: "#60a5fa" }}>
						{adCtaLabel(restaurant.cta_text, t)}
						<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
					</div>
				) : (
					<div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "nowrap", overflow: "hidden" }}>
						{restaurant.rating ? <svg width={12} height={12} viewBox="0 0 24 24" fill="#f59e0b" style={{ flexShrink: 0 }}><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg> : null}
						<span className="text-text-primary" style={{ fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>
							{restaurant.rating || "New"}{restaurant.reviewCount > 0 ? ` (${restaurant.reviewCount})` : ""}
						</span>
						<span className="text-text-muted" style={{ fontSize: 11, flexShrink: 0 }}>&middot;</span>
						<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{restaurant.delivery}</span>
						{restaurant.dist != null && (
							<>
								<span className="text-text-muted" style={{ fontSize: 11, flexShrink: 0 }}>&middot;</span>
								<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>{restaurant.dist.toFixed(1)} km</span>
							</>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

const RECENT_ADDR_KEY = 'strug_recent_addresses';

function getDistance(lat1, lon1, lat2, lon2) {
	if ([lat1, lon1, lat2, lon2].some(v => v == null || Number.isNaN(Number(v)))) return null;
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

/** Reject Null Island — missing coords must never be treated as (0,0). */
function isUsableBuyerCoords(lat, lng) {
	if (lat == null || lng == null) return false;
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
	if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return false;
	return true;
}

function parseFiniteNumber(value) {
	if (value == null || value === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function addressesRoughlyMatch(a, b) {
	const na = String(a || "").trim().toLowerCase();
	const nb = String(b || "").trim().toLowerCase();
	if (!na || !nb) return false;
	return na === nb || na.includes(nb) || nb.includes(na);
}

function persistBuyerDeliveryCoords(lat, lng, address) {
	try {
		setLocationItem("strug_user_lat", String(lat));
		setLocationItem("strug_user_lng", String(lng));
		let prev = {};
		try {
			prev = JSON.parse(getLocationItem("strug_user_location") || "null") || {};
		} catch {
			prev = {};
		}
		setLocationItem(
			"strug_user_location",
			JSON.stringify({
				...prev,
				...(address ? { address: String(address).trim() } : {}),
				lat,
				lng,
			}),
		);
	} catch {
		/* storage is best-effort; caller still gets coords for this request */
	}
	return { lat, lng };
}

/**
 * Ensure delivery lat/lng exist before Place Order.
 * Order: browser storage → profile saved_lat/saved_long → Google geocode.
 * Profile often has coords (PATCH /user/address) while strug_user_lat/lng are empty —
 * without this step Place Order wrongly failed with "Could not locate…".
 */
async function ensureBuyerDeliveryCoords(deliveryAddr) {
	const existing = readBuyerDeliveryCoords();
	if (isUsableBuyerCoords(existing.lat, existing.lng)) return existing;

	const clean = String(deliveryAddr || "").trim();

	// Step 2: profile coords (session user, then GET /user/:id if needed).
	const u = getUser();
	let savedLat = parseFiniteNumber(u?.saved_lat);
	let savedLng = parseFiniteNumber(u?.saved_long ?? u?.saved_lng);
	let savedAddr = u?.saved_address ?? "";
	const uid = u?.user_id ?? u?.id ?? getAuthUserId();
	if (!isUsableBuyerCoords(savedLat, savedLng) && uid != null) {
		try {
			const me = await getMe(uid);
			const d = me?.data ?? me;
			savedLat = parseFiniteNumber(d?.saved_lat);
			savedLng = parseFiniteNumber(d?.saved_long ?? d?.saved_lng);
			if (d?.saved_address) savedAddr = d.saved_address;
		} catch {
			/* profile fetch is best-effort */
		}
	}
	if (isUsableBuyerCoords(savedLat, savedLng)) {
		// Use profile when delivery text matches saved address, or delivery text is empty.
		if (!clean || !savedAddr || addressesRoughlyMatch(clean, savedAddr)) {
			return persistBuyerDeliveryCoords(savedLat, savedLng, clean || savedAddr);
		}
	}

	// Step 3: geocode the checkout address text.
	if (clean) {
		const pt = await geocodeAddress(clean);
		if (pt && isUsableBuyerCoords(pt.lat, pt.lng)) {
			return persistBuyerDeliveryCoords(pt.lat, pt.lng, clean);
		}
	}

	// Step 4: last resort — profile coords even if address text differs slightly
	// (e.g. Places street line vs shorter saved_address). Better than blocking checkout
	// when the server already has usable saved_lat/saved_long.
	if (isUsableBuyerCoords(savedLat, savedLng)) {
		return persistBuyerDeliveryCoords(savedLat, savedLng, clean || savedAddr);
	}

	return { lat: null, lng: null };
}

/** Must stay aligned with backend FOOD_DELIVERY_MAX_KM (utils/food-delivery-pricing.js). */
const FOOD_DELIVERY_MAX_KM = 25;

function readFoodLocation() {
	try {
		const loc = JSON.parse(getLocationItem("strug_user_location") || "null");
		if (loc?.address) {
			return {
				address: loc.address,
				lat: parseFiniteNumber(loc.lat),
				lng: parseFiniteNumber(loc.lng),
			};
		}
	} catch {
		// Unreadable cached location: fall through to the recent-address list.
	}
	try {
		const recent = JSON.parse(getLocationItem(RECENT_ADDR_KEY) || "[]");
		if (Array.isArray(recent) && recent[0]) return { address: recent[0], lat: null, lng: null };
	} catch {
		// Unreadable recent-address cache: the user re-enters an address.
	}
	return { address: "", lat: null, lng: null };
}

// Active-order persistence — same shape as Rideshare's saveRideshareSession/loadRideshareSession/
// clearRideshareSession (Rideshare.jsx:108-123), so navigating away from Food mid-delivery and
// back restores the live tracking view instead of dropping the user back on the landing screen.
const FOOD_ACTIVE_KEY = "strug_food_active_v1";
const FOOD_TERMINAL_STATUSES = new Set(["delivered", "cancelled"]);

function saveFoodSession(session) {
	try { sessionStorage.setItem(FOOD_ACTIVE_KEY, JSON.stringify(session)); } catch { /* quota / private mode */ }
}

function loadFoodSession() {
	try {
		const raw = sessionStorage.getItem(FOOD_ACTIVE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

function clearFoodSession() {
	try { sessionStorage.removeItem(FOOD_ACTIVE_KEY); } catch { /* ignore */ }
}

function toDatetimeLocalValue(date) {
	const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
	return d.toISOString().slice(0, 16);
}

function floralSameDayValue() {
	const d = new Date();
	d.setMinutes(0, 0, 0);
	d.setHours(d.getHours() + 3);
	if (d.getHours() >= 21) {
		d.setDate(d.getDate() + 1);
		d.setHours(10, 0, 0, 0);
	}
	return toDatetimeLocalValue(d);
}

function floralNextDayValue() {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	d.setHours(10, 0, 0, 0);
	return toDatetimeLocalValue(d);
}

function composeFoodDeliveryInstructions({ tipAmount, deliveryInstructions, cart, vertical }) {
	const tipText = tipAmount > 0 ? `[Tip: $${Number(tipAmount).toFixed(2)}] ` : "";
	const giftNotes = vertical === "floral"
		? (cart || [])
			.map(i => String(i.special_instructions || "").trim())
			.filter(Boolean)
			.map(n => `Gift card: ${n}`)
			.join(" | ")
		: "";
	return `${tipText}${deliveryInstructions || ""}${giftNotes ? `\n${giftNotes}` : ""}`.trim();
}

function buildCssImage(url) {
	const resolved = mediaUrl(url);
	return resolved ? `url("${resolved}") center/cover no-repeat` : "linear-gradient(135deg, #141923, #0a0a0e)";
}

function normalizeCuisineTags(value) {
	return String(value || "")
		.split(/[,/|•]+/)
		.map(tag => tag.trim())
		.filter(Boolean)
		.slice(0, 4);
}

function mapFoodVendor(v, t) {
	const isAd = Boolean(v?.is_ad);
	const fee = parseFiniteNumber(v?.delivery_fee);
	const minOrder = parseFiniteNumber(v?.min_order_value);
	const rating = parseFiniteNumber(v?.rating);
	const reviewCount = parseFiniteNumber(v?.review_count ?? v?.reviews_count) ?? 0;
	const logoUrl = mediaUrl(v?.logo_url ?? v?.image_url ?? v?.media_url);
	const coverUrl = mediaUrl(v?.banner_url ?? v?.cover_url ?? v?.media_url ?? v?.logo_url ?? v?.image_url);
	const menuItems = Array.isArray(v?.food_item) ? v.food_item : [];
	const categoryNames = Array.isArray(v?.food_category) ? v.food_category.map(c => c?.name).filter(Boolean) : [];
	const cuisine = v?.cuisine_type || categoryNames[0] || t("food.restaurantFallback");
	const id = v?.vendor_id ?? v?.id;
	const { promo, eligibleOffers } = parseVendorPromo(v);
	return {
		id,
		owner_id: v?.owner_id ?? null,
		name: v?.vendor_name ?? v?.name ?? t("food.restaurantFallback"),
		category: cuisine,
		cuisine,
		cuisineTags: normalizeCuisineTags(cuisine),
		categoryNames,
		menuItems,
		rating,
		reviewCount,
		lat: parseFiniteNumber(v?.lat),
		lng: parseFiniteNumber(v?.long ?? v?.lng),
		fee,
		minOrder,
		feeLabel: fee === 0 ? t("food.landing.freeDelivery") : null,
		promo,
		eligibleOffers,
		featured: Boolean(v?.featured || v?.is_featured),
		img: logoUrl,
		cover_url: coverUrl,
		open: v?.is_open !== false,
		thumb: buildCssImage(coverUrl ?? logoUrl),
		pickup: v?.pickup_available !== false,
		is_ad: isAd,
		campaign_id: v?.campaign_id ?? null,
		target_url: v?.target_url ?? null,
		cta_text: v?.cta_text ?? null,
		sponsored: Boolean(isAd || v?.sponsored),
		raw: v,
	};
}

function foodDeliveryLabel({ eta, dist }, t) {
	if (eta == null || dist == null) return t("food.landing.deliveryTime");
	return `${Math.max(10, eta - 3)}–${eta + 5} min (${dist.toFixed(1)} km)`;
}

function FoodBackButton({ onClick, label, style }) {
	const { t } = useTranslation();
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				background: "none",
				border: "none",
				color: "var(--color-text-secondary)",
				cursor: "pointer",
				display: "flex",
				alignItems: "center",
				gap: 6,
				fontFamily: "'DM Sans', sans-serif",
				fontSize: 13,
				fontWeight: 700,
				padding: 0,
				...style,
			}}
			onMouseEnter={e => { e.currentTarget.style.color = "var(--color-text-primary)"; }}
			onMouseLeave={e => { e.currentTarget.style.color = style?.color ?? "var(--color-text-secondary)"; }}
		>
			<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
				<polyline points="15 18 9 12 15 6" />
			</svg>
			{label ?? t("common.back", { defaultValue: "Back" })}
		</button>
	);
}

function FoodAddressCapture({ onConfirm, userLocation, subtitle, ctaLabel, allowAutoResume = true, onBack }) {
	const { t } = useTranslation();
	const resolvedSubtitle = subtitle ?? t("food.address.subtitle");
	const resolvedCta = ctaLabel ?? t("food.address.findRestaurants");
	const [addr, setAddr] = useState("");
	const [coords, setCoords] = useState({ lat: null, lng: null });
	const [fading, setFading] = useState(false);
	const [recentAddresses, setRecentAddresses] = useState(() => {
		try { return JSON.parse(getLocationItem(RECENT_ADDR_KEY) || '[]'); } catch { return []; }
	});
	const profileAddresses = (() => {
		try { return JSON.parse(localStorage.getItem("strug_profile_addresses") || "[]"); } catch { return []; }
	})();
	async function confirm(a, latOverride = null, lngOverride = null) {
		if (!a.trim()) return;
		let lat = latOverride ?? coords.lat;
		let lng = lngOverride ?? coords.lng;

		if (lat == null || lng == null) {
			if (window.google?.maps?.Geocoder) {
				try {
					await new Promise((resolve) => {
						new window.google.maps.Geocoder().geocode({ address: a }, (results, status) => {
							if (status === 'OK' && results[0]) {
								lat = results[0].geometry.location.lat();
								lng = results[0].geometry.location.lng();
							}
							resolve();
						});
					});
				} catch {
					// Geocoding is optional: keep the typed address without coordinates.
				}
			}
		}

		setLocationItem("strug_user_address", a);
		if (lat != null) setLocationItem("strug_user_lat", String(lat));
		if (lng != null) setLocationItem("strug_user_lng", String(lng));

		if (getUser()?.user_id || getUser()?.id) {
			try {
				await saveAddress({
					saved_address: a,
					saved_lat: lat || undefined,
					saved_long: lng || undefined,
				});
			} catch {
				// Saving to the profile is best-effort; this session already has the address.
			}
		}

		try {
			const prev = JSON.parse(getLocationItem(RECENT_ADDR_KEY) || '[]');
			const updated = [a, ...prev.filter(r => r !== a)].slice(0, 5);
			setLocationItem(RECENT_ADDR_KEY, JSON.stringify(updated));
			setRecentAddresses(updated);
		} catch {
			// Recent-address history is a convenience only.
		}
		setFading(true);
		setTimeout(() => onConfirm(a, lat, lng), 280);
	}
	useEffect(() => {
		// Only auto-resume a saved address on the initial prompt. When the user
		// explicitly hits "Change", allowAutoResume is false so they can type a
		// new address instead of being bounced straight back to the old one.
		if (!allowAutoResume) return;
		const saved = getUser()?.saved_address;
		if (saved) { setTimeout(() => confirm(saved), 0); return; }
		const uid = getUser()?.user_id; if (uid) getMe(uid).then(d => { if (d?.saved_address) confirm(d.saved_address, d.saved_lat, d.saved_long); }).catch(() => {});
		// Mount-only on purpose: re-running on a later allowAutoResume/confirm change would
		// bounce the user back to the saved address while they are typing a new one.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 32px", position: "relative", animation: fading ? "fadeOut 0.25s ease both" : "fadeUp 0.3s ease both", transition: "opacity 0.25s" }}>
			{onBack && <FoodBackButton onClick={onBack} style={{ position: "absolute", top: 24, left: 32 }} />}
			<div style={{ width: "100%", maxWidth: 480 }}>
				<div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(37,99,235,0.15)", border: "1.5px solid rgba(37,99,235,0.3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, margin: "0 auto 24px" }}>
					<svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
				</div>
				<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 38, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8, textAlign: "center" }}>{t("food.address.title")}</h1>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 28, textAlign: "center" }}>{resolvedSubtitle}</p>
				<div style={{ position: "relative", marginBottom: 14 }}>
					<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", zIndex: 5, pointerEvents: "none" }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
					<AddressAutocomplete
						value={addr}
						onChange={(val, lat, lng) => {
							setAddr(val);
							if (lat != null && lng != null) {
								setCoords({ lat, lng });
								confirm(val, lat, lng);
							}
						}}
						placeholder={t("food.address.placeholder")}
						useLocation
						inputStyle={{
							width: "100%",
							background: "var(--color-surface-raised)",
							border: "1px solid var(--color-border)",
							borderRadius: 14,
							padding: "15px 18px",
							paddingLeft: 46,
							color: "var(--color-text-primary)",
							fontSize: 16,
							fontFamily: "'DM Sans', sans-serif",
							outline: "none",
							caretColor: "#2563eb",
							boxSizing: "border-box"
						}}
					/>
				</div>
				{/* Saved profile addresses (Home, Work, etc.) */}
				{!addr && profileAddresses.length > 0 && (
					<div style={{ marginBottom: 14 }}>
						<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>{t("food.address.saved")}</p>
						{profileAddresses.map((pa, i) => {
							const full = [pa.street, pa.city, pa.country].filter(Boolean).join(", ");
							return (
								<div key={pa.id ?? i}
									style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)", borderRadius: 10, marginBottom: 6, cursor: "pointer", transition: "background 0.15s, border-color 0.15s, transform 0.15s" }}
									onClick={() => confirm(full)}
									onMouseEnter={e => { e.currentTarget.style.background = "rgba(37,99,235,0.14)"; e.currentTarget.style.borderColor = "rgba(37,99,235,0.3)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
									onMouseLeave={e => { e.currentTarget.style.background = "rgba(37,99,235,0.06)"; e.currentTarget.style.borderColor = "rgba(37,99,235,0.15)"; e.currentTarget.style.transform = "translateY(0)"; }}>
									<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
									<div style={{ flex: 1, minWidth: 0 }}>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: "#60a5fa", display: "block" }}>{pa.label}</span>
										<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{full}</span>
									</div>
								</div>
							);
						})}
					</div>
				)}
				{/* Recent addresses */}
				{!addr && recentAddresses.length > 0 && (
					<div style={{ marginBottom: 14 }}>
						<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>{t("food.address.recent")}</p>
						{recentAddresses.map((a, i) => (
							<div key={i}
								className="bg-surface-raised border border-border-subtle" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, marginBottom: 6, cursor: "pointer", transition: "background 0.15s, border-color 0.15s, transform 0.15s" }}
								onClick={() => confirm(a)}
								onMouseEnter={e => { e.currentTarget.style.background = "var(--color-border)"; e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
								onMouseLeave={e => { e.currentTarget.style.background = "var(--color-surface-raised)"; e.currentTarget.style.borderColor = "var(--color-border-subtle)"; e.currentTarget.style.transform = "translateY(0)"; }}
								onMouseDown={e => { e.currentTarget.style.transform = "translateY(0) scale(0.98)"; }}
								onMouseUp={e => { e.currentTarget.style.transform = "translateY(-1px) scale(1)"; }}>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{a}</span>
							</div>
						))}
					</div>
				)}
				{userLocation && !addr.trim() && (
					<button onClick={() => {
						const fallback = t("food.address.nearbyLocation");
						if (window.google?.maps?.Geocoder) {
							new window.google.maps.Geocoder().geocode(
								{ location: { lat: userLocation.lat, lng: userLocation.long } },
								(results, status) => confirm(status === 'OK' && results[0] ? results[0].formatted_address : fallback)
							);
						} else {
							confirm(fallback);
						}
					}}
						className="bg-surface-raised border border-border text-text-secondary" style={{ width: "100%", padding: "12px", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}
						onMouseEnter={e => e.currentTarget.style.background = "var(--color-border)"}
						onMouseLeave={e => e.currentTarget.style.background = "var(--color-surface-raised)"}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
						{t("food.address.useLocation")}
					</button>
				)}
				<button onClick={() => confirm(addr)}
					style={{ width: "100%", padding: "14px", background: addr.trim() ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 12, color: addr.trim() ? "#fff" : "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: addr.trim() ? "pointer" : "not-allowed", transition: "background 0.15s, box-shadow 0.15s, transform 0.15s" }}
					onMouseEnter={e => { if (addr.trim()) { e.currentTarget.style.background = "#3b82f6"; e.currentTarget.style.boxShadow = "0 6px 24px rgba(37,99,235,0.5)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
					onMouseLeave={e => { e.currentTarget.style.background = addr.trim() ? "#2563eb" : "rgba(37,99,235,0.3)"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "translateY(0)"; }}
					onMouseDown={e => { if (addr.trim()) { e.currentTarget.style.transform = "translateY(0) scale(0.98)"; e.currentTarget.style.boxShadow = "none"; } }}
					onMouseUp={e => { if (addr.trim()) { e.currentTarget.style.transform = "translateY(-1px) scale(1)"; e.currentTarget.style.boxShadow = "0 6px 24px rgba(37,99,235,0.5)"; } }}>
					{resolvedCta}
				</button>
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, textAlign: "center", marginTop: 16 }}>{t("food.address.askOnce")}</p>
			</div>
		</div>
	);
}

function FoodShareButton({ restaurant }) {
	const [copied, setCopied] = useState(false);
	const url = `${window.location.origin}/listing/food/${restaurant.id}-${slugify(restaurant.name)}`;
	return (
		<button
			onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
			className="bg-surface-raised border border-border" style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 20, padding: "6px 14px", color: copied ? "#22c55e" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
		>
			{copied
				? <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				: <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
			}
			{copied ? "Copied!" : "Share"}
		</button>
	);
}

function FoodStorePage({ restaurant, cart, setCart, onBack, onViewCart, onAddToCart }) {
	const { t } = useTranslation();
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [activeMenuCat, setActiveMenuCat] = useState(ALL_MENU_CAT);
	const [storeTab, setStoreTab] = useState("menu");
	const [reviews, setReviews] = useState(null); // null = loading
	const [reviewsMeta, setReviewsMeta] = useState({ average: null, count: 0 });
	const [selectedItem, setSelectedItem] = useState(null);
	const [qty, setQty] = useState(1);
	const cartCount = cart.reduce((s, i) => s + i.qty, 0);
	const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
	const [serverMenuCats, setServerMenuCats] = useState([]);
	// Keyed by vendor so switching stores shows an empty menu immediately, without a
	// separate reset effect clearing the previous store's dishes.
	const [menuByVendor, setMenuByVendor] = useState({ vendorId: null, items: [] });
	const menuItems = useMemo(
		() => (menuByVendor.vendorId === (restaurant?.id ?? null) ? menuByVendor.items : []),
		[menuByVendor, restaurant?.id],
	);
	useEffect(() => {
		getFoodCategories().then(cats => {
			if (Array.isArray(cats)) setServerMenuCats(cats);
		}).catch(() => {});
	}, []);

	useEffect(() => {
		if (!restaurant?.id) return undefined;
		const vendorId = restaurant.id;
		let alive = true;
		getFoodItems({ vendor_id: vendorId }).then(data => {
			const items = normalizeFoodItemsPayload(data);
			if (!alive) return;
			setMenuByVendor({
				vendorId,
				items: items.map(item => {
					// Item photos live in the related food_item_pics table (url is a
					// relative /uploads path); render as a valid CSS background, else
					// fall back to the brand gradient.
					const pic = item.food_item_pics?.[0]?.url ?? item.image_url;
					const resolved = pic ? mediaUrl(pic) : null;
					return {
						id: item.item_id ?? item.food_item_id ?? item.id,
						name: item.name ?? item.item_name ?? t("food.menuItemFallback"),
						desc: item.description ?? '',
						price: parseFloat(item.price) || 0,
						category: item.food_category?.name ?? item.category ?? 'Mains',
						food_category_id: item.food_category_id,
						gradient: resolved ? `url("${resolved}") center/cover no-repeat` : 'linear-gradient(135deg, #1a1a2e, #0d0d1a)',
						allergen_info: item.allergen_info ?? null,
						// Server-owned modifier catalog (replaces the old localStorage data).
						// The option_id is what checkout sends so the server prices modifiers
						// exactly. Drop unavailable options and empty groups up front.
						modifierGroups: (item.food_item_modifier_group ?? [])
							.map(g => ({
								group_id: g.group_id,
								name: g.name ?? '',
								min_select: g.min_select ?? 0,
								max_select: g.max_select ?? null,
								options: (g.options ?? [])
									.filter(o => o.is_available !== false)
									.map(o => ({ option_id: o.option_id, name: o.name ?? '', price: Number(o.price) || 0 })),
							}))
							.filter(g => g.options.length > 0),
					};
				}),
			});
		}).catch(() => {});
		return () => { alive = false; };
	}, [restaurant?.id, t]);

	useEffect(() => {
		if (!restaurant?.id) return undefined;
		let alive = true;
		getFoodVendorReviews(restaurant.id).then(res => {
			if (!alive) return;
			const list = Array.isArray(res) ? res : (res?.data ?? []);
			setReviews(list);
			setReviewsMeta({ average: res?.average_rating ?? null, count: res?.review_count ?? list.length });
		}).catch(() => { if (alive) setReviews([]); });
		return () => { alive = false; };
	}, [restaurant?.id]);

	// Modifier picks belong to the dish that is open, so keying them by item id resets the
	// selection when the customer backs out to another dish.
	const [modifierSelection, setModifierSelection] = useState({ itemId: null, options: [] });
	const openItemId = selectedItem?.id ?? null;
	const selectedModifiers = modifierSelection.itemId === openItemId ? modifierSelection.options : [];
	function setSelectedModifiers(next) {
		setModifierSelection(prev => {
			const current = prev.itemId === openItemId ? prev.options : [];
			return { itemId: openItemId, options: typeof next === "function" ? next(current) : next };
		});
	}

	const dynamicMenuCats = useMemo(() => {
		const cats = new Set(menuItems.map(m => {
			let cat = m.category;
			if (cat === 'Mains' && m.food_category_id) {
				const found = serverMenuCats.find(c => c.id === m.food_category_id || c.food_category_id === m.food_category_id);
				if (found) cat = found.name;
			}
			return cat;
		}));
		const arr = Array.from(cats);
		// #320: always offer an "All" view alongside the classifier tabs. Only meaningful
		// when there's more than one real category (otherwise All == that single category).
		if (arr.length > 1) return [ALL_MENU_CAT, ...arr];
		return arr.length > 0 ? arr : FOOD_MENU_CATS;
	}, [menuItems, serverMenuCats]);

	// The selected tab can fall out of the list when the vendor's categories load or change,
	// so the effective tab is derived rather than corrected by an effect.
	const effectiveMenuCat = dynamicMenuCats.length > 0 && !dynamicMenuCats.includes(activeMenuCat)
		? dynamicMenuCats[0]
		: activeMenuCat;

	const menuFiltered = effectiveMenuCat === ALL_MENU_CAT ? menuItems : menuItems.filter(m => {
		let cat = m.category;
		if (cat === 'Mains' && m.food_category_id) {
			const found = serverMenuCats.find(c => c.id === m.food_category_id || c.food_category_id === m.food_category_id);
			if (found) cat = found.name;
		}
		return cat === effectiveMenuCat;
	});

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
				<div style={{ padding: "28px 0 20px" }}>
					<Skel w={220} h={22} r={6} style={{ marginBottom: 20 }} />
					<Skel w="100%" h={180} r={16} style={{ marginBottom: 20 }} />
					<div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
						{[...Array(5)].map((_,i) => <SkeletonBubble key={i} />)}
					</div>
				</div>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
					{[...Array(6)].map((_,i) => <SkeletonProductCard key={i} />)}
				</div>
			</div>
		</div>
	);

	// Modifiers come from the server (loaded with the item) so every option has a
	// server price + stable option_id; there are no client-side defaults — an item
	// with no configured modifiers simply shows none and is priced at its base.
	const modifierGroups = selectedItem?.modifierGroups ?? [];

	const itemTotalPrice = selectedItem
		? selectedItem.price + selectedModifiers.reduce((sum, m) => sum + m.price, 0)
		: 0;

	function addToCart() {
		const entry = {
			...selectedItem,
			price: itemTotalPrice,
			qty,
			extras: selectedModifiers.map(m => m.group === "Extras" ? m.name : `${m.group}: ${m.name}`),
			// Carried to checkout so the server prices the selected modifiers exactly.
			modifier_option_ids: selectedModifiers.map(m => m.option_id),
			lineId: Date.now()
		};
		setCart(prev => [...prev, entry]);
		onAddToCart?.();
		setSelectedItem(null);
		setSelectedModifiers([]);
		setQty(1);
	}

	// One-tap add from the menu grid, bypassing the detail modal — only valid for items with no
	// modifier groups to configure (those still need the modal so the server gets option_ids).
	function quickAddToCart(item) {
		setCart(prev => [...prev, { ...item, qty: 1, extras: [], modifier_option_ids: [], lineId: Date.now() }]);
		onAddToCart?.();
	}

	// Rendered as a centered modal over the (still-visible, dimmed) menu — not a full-page
	// replacement — matching how Uber Eats/DoorDash handle item customization on desktop. A
	// full-bleed page here either stretched huge or, capped narrow, left dead space on the sides.
	const itemDetailModal = selectedItem && (
		<div
			onClick={() => { setSelectedItem(null); setSelectedModifiers([]); setQty(1); }}
			style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(6,8,16,0.72)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, overflowY: "auto" }}
		>
			<div
				onClick={e => e.stopPropagation()}
				className="bg-surface-raised border border-border"
				style={{ width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto", borderRadius: 20, boxShadow: "0 30px 80px var(--color-shadow)", position: "relative", animation: "fadeUp 0.25s ease both" }}
			>
				<button
					onClick={() => { setSelectedItem(null); setSelectedModifiers([]); setQty(1); }}
					aria-label={t("food.checkout.backToMenu")}
					style={{ position: "absolute", top: 14, right: 14, zIndex: 2, width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
				>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
				<div style={{ borderRadius: "20px 20px 0 0", background: selectedItem.gradient, aspectRatio: "16/9", width: "100%", position: "relative", overflow: "hidden" }}>
					<div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "40%", background: "linear-gradient(to top, rgba(19,19,31,0.92) 0%, transparent 100%)" }} />
				</div>
				<div style={{ padding: "18px 22px 22px" }}>
					<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 24, textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 5 }}>{selectedItem.name}</h2>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.45, marginBottom: selectedItem.allergen_info ? 6 : 14 }}>{selectedItem.desc}</p>
				{selectedItem.allergen_info && (
					<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: "#f59e0b", marginBottom: 14 }}>{t("food.allergens", { info: selectedItem.allergen_info })}</p>
				)}
					<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 18 }}>${itemTotalPrice.toFixed(2)}</p>

					{modifierGroups.map(group => {
						// max_select === 1 → single-choice (radio); else multi (checkbox).
						const isSingle = group.max_select === 1;
						return (
							<div key={group.group_id} style={{ marginBottom: 16 }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
									{group.name} {isSingle && <span style={{ textTransform: "none", color: "#2563eb", fontWeight: 600 }}>(Select one)</span>}
								</p>
								<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
									{group.options.map(opt => {
										const isChecked = selectedModifiers.some(m => m.option_id === opt.option_id);
										return (
											<label key={opt.option_id} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", padding: "9px 12px", borderRadius: 10, background: isChecked ? "rgba(37,99,235,0.12)" : "var(--color-surface-raised)", border: `1px solid ${isChecked ? "rgba(37,99,235,0.4)" : "var(--color-border)"}`, transition: "all 0.15s" }}>
												<input
													type={isSingle ? "radio" : "checkbox"}
													name={isSingle ? `modifier_group_${group.group_id}` : undefined}
													checked={isChecked}
													onChange={() => {
														if (isChecked && !isSingle) {
															setSelectedModifiers(prev => prev.filter(m => m.option_id !== opt.option_id));
														} else {
															const entry = { option_id: opt.option_id, group_id: group.group_id, group: group.name, name: opt.name, price: opt.price };
															if (isSingle) {
																setSelectedModifiers(prev => [...prev.filter(m => m.group_id !== group.group_id), entry]);
															} else {
																setSelectedModifiers(prev => [...prev, entry]);
															}
														}
													}}
													style={{ accentColor: "#2563eb", flexShrink: 0 }}
												/>
												<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, lineHeight: 1.3 }}>
													{opt.name} {opt.price > 0 && `(+$${opt.price.toFixed(2)})`}
												</span>
											</label>
										);
									})}
								</div>
							</div>
						);
					})}

					<div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18, marginTop: 8 }}>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,0.55)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{i18n.t("floral.quantity")}</p>
						<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
							<button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer", fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.14)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}>−</button>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, color: "#fff", minWidth: 20, textAlign: "center" }}>{qty}</span>
							<button onClick={() => setQty(q => q + 1)} style={{ width: 30, height: 30, borderRadius: "50%", background: "#2563eb", border: "none", color: "#fff", cursor: "pointer", fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(37,99,235,0.45)", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "#3b82f6"} onMouseLeave={e => e.currentTarget.style.background = "#2563eb"}>+</button>
						</div>
					</div>
					<button onClick={addToCart} style={{ width: "100%", padding: "13px", background: "#2563eb", border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
						Add to Cart — ${(itemTotalPrice * qty).toFixed(2)}
					</button>
				</div>
			</div>
		</div>
	);

	const storeActionBtns = (
		<div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
			<button onClick={() => { window.__reservationVendorId = restaurant.vendor_id ?? restaurant.id; window.__fromFood = true; if (window.__nav) window.__nav("reservations"); }} style={{ padding: "8px 16px", background: "rgba(37,99,235,0.85)", border: "1px solid rgba(37,99,235,0.5)", borderRadius: 20, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", backdropFilter: "blur(8px)" }}>{t("food.bookTable")}</button>
			{restaurant.owner_id && <button onClick={async () => { try { await openDmChannel(restaurant.owner_id, { sourceVertical: "food" }); if (window.__nav) window.__nav('messages'); } catch { /* stay on the store page if the DM channel can't open */ } }} style={{ padding: "8px 16px", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 20, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", backdropFilter: "blur(8px)" }}>{i18n.t("automotive.message")}</button>}
		</div>
	);

	return (
		<>
		{itemDetailModal}
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, animation: "fadeUp 0.3s ease both" }}>
			<div style={{ paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 28, paddingBottom: 24 }}>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
					<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, padding: 0 }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
						Restaurants
					</button>
					<FoodShareButton restaurant={restaurant} />
				</div>

				<div style={{ height: 180, borderRadius: 16, background: restaurant.thumb, marginBottom: isMobile ? 14 : 20, position: "relative", overflow: "hidden", animation: "fadeUp 0.35s ease 60ms both" }}>
					<div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(6,8,16,0.85) 0%, transparent 60%)" }} /> {/* stays a dark scrim regardless of theme: sits over the store cover photo for legibility */}
					<div style={{ position: "absolute", bottom: 18, left: 22, right: 16, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
						<div>
							<h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, color: "#fff", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4 }}>{restaurant.name}</h2>
							<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
								<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
									{restaurant.rating ? <svg width={12} height={12} viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg> : null}
									<span style={{ fontSize: 12, fontWeight: 600, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{restaurant.rating || "New"}</span>
								</div>
								<span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif" }}>{restaurant.delivery}</span>
								<span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif" }}>{restaurant.fee} delivery</span>
							</div>
						</div>
						{!isMobile && storeActionBtns}
					</div>
				</div>
				{/* On mobile the action buttons would crowd the title inside the hero, so render them below it */}
				{isMobile && <div style={{ marginBottom: 20 }}>{storeActionBtns}</div>}

				<div style={{ display: "flex", gap: 2, marginBottom: 20, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 3, width: "fit-content" }}>
					{[
						{ id: "menu", label: t("food.tracking.menuTab", { defaultValue: "Menu" }) },
						{ id: "reviews", label: t("food.tracking.reviewsTab", { defaultValue: "Reviews ({{count}})", count: reviewsMeta.count }) },
					].map(tab => (
						<button key={tab.id} onClick={() => setStoreTab(tab.id)} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: storeTab === tab.id ? "#2563eb" : "transparent", color: storeTab === tab.id ? "#fff" : "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
							{tab.label}
						</button>
					))}
				</div>

				{storeTab === "reviews" ? (
					<div style={{ maxWidth: 640 }}>
						{reviewsMeta.average != null && (
							<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
								<svg width={18} height={18} viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, fontWeight: 800, color: "#fff" }}>{reviewsMeta.average}</span>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{t("food.tracking.reviewsCount", { count: reviewsMeta.count, defaultValue: "{{count}} review(s)" })}</span>
							</div>
						)}
						{reviews === null ? (
							<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[1, 2, 3].map(i => <Skel key={i} h={64} r={12} />)}</div>
						) : reviews.length === 0 ? (
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "rgba(255,255,255,0.45)", padding: "20px 0" }}>{t("food.tracking.noReviews", { defaultValue: "No reviews yet — be the first to order and rate this restaurant." })}</p>
						) : (
							<div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 32 }}>
								{reviews.map(r => (
									<div key={r.id} style={{ padding: "14px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
										<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
											<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#fff" }}>{r.reviewer_name}</span>
											<div style={{ display: "flex", alignItems: "center", gap: 3 }}>
												<svg width={12} height={12} viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
												<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#fff" }}>{r.rating}</span>
											</div>
										</div>
										{r.comment && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.5, marginBottom: 6 }}>{r.comment}</p>}
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{new Date(r.created_at).toLocaleDateString(t("food.tracking.locale", { defaultValue: "en-US" }), { month: "short", day: "numeric", year: "numeric" })}</span>
									</div>
								))}
							</div>
						)}
					</div>
				) : (
				<>
				<div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "nowrap", overflowX: "auto", scrollbarWidth: "none", animation: "fadeUp 0.35s ease 120ms both" }}>
					{dynamicMenuCats.map(cat => (
						<button key={cat} onClick={() => setActiveMenuCat(cat)} style={{ padding: "8px 18px", borderRadius: 20, border: `1px solid ${effectiveMenuCat === cat ? "#2563eb" : "var(--color-border)"}`, background: effectiveMenuCat === cat ? "rgba(37,99,235,0.18)" : "transparent", color: effectiveMenuCat === cat ? "#2563eb" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0, transition: "all 0.15s" }}>
							{foodMenuCatLabel(cat, t)}
						</button>
					))}
				</div>
				
				{/* Same card language as the main food page's RestaurantCard — image on top
				    (auto-fit grid, no empty trailing gaps), name/price below — rather than a
				    horizontal list row, so the two screens read as one design system. */}
				{/* Capped max-width (not 1fr) — with only a few items, auto-fit's 1fr stretched each
			    card to fill the whole row and they looked oversized. A fixed max leaves trailing
			    whitespace instead of ballooning card size. */}
			<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(170px, 200px))", gap: isMobile ? 12 : 16, marginBottom: 32 }}>
					{menuFiltered.map((item, i) => {
						const hasModifiers = (item.modifierGroups?.length ?? 0) > 0;
						return (
							<div key={item.id} onClick={() => setSelectedItem(item)} role="button" tabIndex={0}
								onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedItem(item); } }}
								style={{ borderRadius: 18, overflow: "hidden", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", cursor: "pointer", transition: "all 0.2s", animation: `fadeUp 0.3s ease ${i * 40}ms both` }}
								onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)"; e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 16px 40px rgba(0,0,0,0.5)"; }}
								onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
								<div style={{ width: "100%", aspectRatio: "1/1", background: item.gradient, position: "relative" }}>
									<button
										type="button"
										aria-label={t("food.checkout.addItem", { defaultValue: "Add to cart" })}
										onClick={e => { e.stopPropagation(); if (hasModifiers) { setSelectedItem(item); return; } quickAddToCart(item); }}
										style={{ position: "absolute", bottom: 8, right: 8, width: 30, height: 30, borderRadius: "50%", background: "#2563eb", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 14px rgba(37,99,235,0.55)", transition: "background 0.15s" }}
										onMouseEnter={e => { e.currentTarget.style.background = "#3b82f6"; }}
										onMouseLeave={e => { e.currentTarget.style.background = "#2563eb"; }}
									>
										<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
									</button>
								</div>
								<div style={{ padding: "10px 12px 12px" }}>
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, marginBottom: 4, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</p>
									{item.desc && (
										<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, lineHeight: 1.4, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.desc}</p>
									)}
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700 }}>${item.price.toFixed(2)}</p>
								</div>
							</div>
						);
					})}
				</div>
				
				{cartCount > 0 && (
					// A compact centered pill (not a full-bleed slab) — matches the bottom cart bar
					// convention in other food-delivery apps instead of dominating the screen.
					<div style={{ position: "sticky", bottom: 16, display: "flex", justifyContent: "center" }}>
						<button onClick={onViewCart} style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "#2563eb", border: "none", borderRadius: 28, padding: "8px 18px 8px 8px", cursor: "pointer", boxShadow: "0 10px 30px rgba(37,99,235,0.5)" }}>
							<div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 800, color: "#fff" }}>{cartCount}</span>
							</div>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#fff" }}>{i18n.t("shop.viewCart")}</span>
							<span style={{ width: 1, height: 14, background: "rgba(255,255,255,0.3)" }} />
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#fff" }}>${cartTotal.toFixed(2)}</span>
						</button>
					</div>
				)}
			</>
			)}
			</div>
		</div>
		</>
	);
}

function FoodCartPage({ cart, setCart, onBack, onCheckout, backLabel, emptyLabel, persistProductCart = false, deliveryFeeEstimate = null, restaurant = null, vertical = "food" }) {
	const { isMobile } = useViewport();
	const { t, i18n } = useTranslation();
	const resolvedBackLabel = backLabel ?? t("food.checkout.backToMenu");
	const resolvedEmptyLabel = emptyLabel ?? t("food.checkout.browseMenu");
	const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
	// Shop product cart: don't invent $1.99 — fee is quoted at checkout. Food keeps the legacy estimate.
	const delivery =
		deliveryFeeEstimate != null && Number.isFinite(Number(deliveryFeeEstimate))
			? Number(deliveryFeeEstimate)
			: persistProductCart
			? 0
			: 1.99;
	const showDeliveryAtCheckout = persistProductCart && deliveryFeeEstimate == null;
	const suggestedOffer = restaurant?.eligibleOffers?.[0] || null;
	// Browse offers no longer carry the raw promo code (served only via the rate-limited
	// /discounts/validate by promotion_id), so start empty and resolve the code at apply time.
	const [promoCode, setPromoCode] = useState("");
	const [promoApplied, setPromoApplied] = useState(false);
	const [promoDiscount, setPromoDiscount] = useState(null); 
	const [promoError, setPromoError] = useState(null);
	const [promoLoading, setPromoLoading] = useState(false);
	const [cartSyncError, setCartSyncError] = useState(null);
	const discountAmount = promoDiscount
		? (promoDiscount.type === "percent" ? subtotal * (promoDiscount.value / 100) : Math.min(promoDiscount.value, subtotal))
		: 0;
	const { tax: taxRate, currency } = getUserRegion();
	const discountedSubtotal = Math.max(0, subtotal - discountAmount);
	const platformFee = discountedSubtotal * 0.08;
	const activeTaxRate = (getUser()?.country && taxRate !== undefined && taxRate !== null) ? taxRate : 0;
	const tax = (discountedSubtotal + platformFee) * activeTaxRate;
	const total = discountedSubtotal + platformFee + delivery + tax;

	async function syncProductCartLine(item, nextQty) {
		if (!persistProductCart || item?.cart_id == null) return;
		try {
			if (nextQty <= 0) {
				await removeFromCart(item.cart_id);
			} else {
				const unit = parseFloat(item.price) || 0;
				await updateCartItem(item.cart_id, {
					qty: nextQty,
					total: unit * nextQty,
					variation_id: item.variation_id != null ? Number(item.variation_id) : undefined,
					seller_id: item.seller_id != null ? Number(item.seller_id) : undefined,
					product_type_id: item.product_type_id != null ? Number(item.product_type_id) : undefined,
				});
			}
			setCartSyncError(null);
		} catch {
			setCartSyncError(t("shop.cartSyncFailed", { defaultValue: "Couldn’t sync cart. Changes may reset on refresh." }));
		}
	}

	async function changeQty(i, delta) {
		const item = cart[i];
		if (!item) return;
		const nextQty = Math.max(0, (item.qty || 0) + delta);
		setCart((c) =>
			c
				.map((ci, ci_i) => (ci_i === i ? { ...ci, qty: nextQty } : ci))
				.filter((ci) => ci.qty > 0),
		);
		await syncProductCartLine(item, nextQty);
	}

	async function removeLine(item) {
		setCart((c) => c.filter((ci) => ci.lineId !== item.lineId));
		await syncProductCartLine(item, 0);
	}

	async function handleApplyPromo(arg) {
		// `arg` is either a typed code string or a suggested offer applied by { promotionId }.
		const promotionId = arg && typeof arg === "object" ? arg.promotionId : null;
		const code = promotionId ? "" : String(arg || promoCode || "").trim();
		if (!code && !promotionId) return;
		if (code) setPromoCode(code);
		setPromoLoading(true);
		setPromoError(null);
		try {
			const res = await validatePromoCode(code || null, {
				...(promotionId ? { promotion_id: promotionId } : {}),
				subtotal,
				vertical: resolvePromoVertical(vertical),
				vendor_id: restaurant?.id ?? null,
				vendor_owner_id: restaurant?.owner_id ?? restaurant?.raw?.owner_id ?? null,
			});
			if (res.valid) {
				setPromoApplied(true);
				// The real code is only revealed by this rate-limited call; keep it so checkout submits it.
				if (res.code) setPromoCode(res.code);
				setPromoDiscount({ type: res.type, value: res.value, label: res.label || res.badge || res.code || code });
			} else {
				setPromoError(res.message || t("food.checkout.invalidPromo"));
			}
		} catch (err) {
			setPromoError(err?.response?.data?.message || t("food.checkout.invalidPromo"));
		} finally {
			setPromoLoading(false);
		}
	}
	if (cart.length === 0) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, opacity: 0.45 }}>
			<svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
			<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>{t("food.checkout.emptyCart")}</p>
			<button onClick={onBack} style={{ background: "#2563eb", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: "10px 22px", cursor: "pointer" }}>{resolvedEmptyLabel}</button>
		</div>
	);
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, animation: "fadeUp 0.3s ease both", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 860, margin: "0 auto", width: "100%", paddingTop: 28, paddingBottom: 24 }}>
				<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 20, padding: 0 }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					{resolvedBackLabel}
				</button>
				<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 36, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 24 }}>{t("food.checkout.cartTitle")}</h1>
				{cartSyncError ? (
					<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 12 }}>{cartSyncError}</p>
				) : null}
				
				<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 320px", gap: 28, alignItems: "start" }}>
					
					<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
						{cart.map((item, i) => (
							<div key={item.lineId} className="bg-surface border border-border" style={{ borderRadius: 12, padding: "12px 14px" }}>
								<div style={{ display: "flex", alignItems: "center", gap: 14 }}>
									<div style={{ width: 52, height: 52, borderRadius: "50%", background: item.gradient, flexShrink: 0 }} />
									<div style={{ flex: 1 }}>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{item.name}</p>
										{item.extras.length > 0 && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{item.extras.join(", ")}</p>}
									</div>
									<div className="bg-surface-raised" style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 8, padding: "4px 10px" }}>
										<button type="button" aria-label={t("food.checkout.decreaseQty", { defaultValue: "Decrease quantity" })} onClick={() => changeQty(i, -1)} className="text-text-primary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0, minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
										<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, minWidth: 16, textAlign: "center" }}>{item.qty}</span>
										<button type="button" aria-label={t("food.checkout.increaseQty", { defaultValue: "Increase quantity" })} onClick={() => changeQty(i, 1)} className="text-text-primary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0, minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
									</div>
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, minWidth: 52, textAlign: "right" }}>{fmt(item.price * item.qty, currency, i18n.language)}</p>
									<Tooltip text="Remove item"><button
										onClick={() => removeLine(item)}
										onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
										onMouseLeave={e => { e.currentTarget.style.color = "var(--color-text-muted)"; e.currentTarget.style.background = "none"; }}
										className="text-text-muted" style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 5px", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "color 0.15s, background 0.15s", minWidth: 44, minHeight: 44 }}
										aria-label="Remove item"
									>
										<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
									</button></Tooltip>
								</div>
								<input
									value={item.special_instructions || ""}
									onChange={e => {
										const note = e.target.value;
										setCart(c => c.map(ci => ci.lineId === item.lineId ? { ...ci, special_instructions: note } : ci));
									}}
									placeholder={t("food.checkout.addNote")}
									className="bg-surface-raised border border-border-subtle text-text-secondary" style={{ marginTop: 10, width: "100%", borderRadius: 8, padding: "7px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, outline: "none", caretColor: "#2563eb", boxSizing: "border-box" }}
									onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.4)"}
									onBlur={e => e.target.style.borderColor = "var(--color-border-subtle)"}
								/>
							</div>
						))}
					</div>
					
					<div style={{ position: "sticky", top: 0, display: "flex", flexDirection: "column", gap: 12 }}>
						<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "18px 20px" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>{t("food.checkout.orderSummary")}</p>
							{[
								[t("food.checkout.subtotal"), fmt(subtotal, currency, i18n.language)],
								[t("food.checkout.platformFee"), fmt(platformFee, currency, i18n.language)],
								[t("food.checkout.deliveryFeeLabel"), showDeliveryAtCheckout
									? t("shop.deliveryAtCheckout", { defaultValue: "At checkout" })
									: fmt(delivery, currency, i18n.language)],
								...(discountAmount > 0 ? [[t("food.checkout.promoDiscount"), `-${fmt(discountAmount, currency, i18n.language)}`]] : []),
								[t("food.checkout.tax", { rate: (activeTaxRate * 100).toFixed(0) }), fmt(tax, currency, i18n.language)]
							].map(([l, v]) => (
								<div key={String(l)} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: l === t("food.checkout.promoDiscount") ? "#10b981" : "var(--color-text-secondary)" }}>{l}</span>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: l === t("food.checkout.promoDiscount") ? "#10b981" : "var(--color-text-primary)" }}>{v}</span>
								</div>
							))}
							<div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
								<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700 }}>{t("food.checkout.total")}</span>
								<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700 }}>{fmt(total, currency, i18n.language)}</span>
							</div>
						</div>
						<div className="bg-surface border border-border" style={{ borderRadius: 12, padding: "14px 16px" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>{t("food.checkout.promoCode")}</p>
							{suggestedOffer?.offer_title && !promoApplied && (
								<button
									type="button"
									onClick={() => handleApplyPromo({ promotionId: suggestedOffer.promotion_id })}
									disabled={promoLoading}
									style={{ width: "100%", marginBottom: 10, textAlign: "left", background: "rgba(217,119,6,0.12)", border: "1px solid rgba(217,119,6,0.35)", borderRadius: 8, padding: "10px 12px", cursor: promoLoading ? "default" : "pointer" }}
								>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 700, color: "#d97706", margin: 0 }}>{suggestedOffer.offer_title}</p>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "4px 0 0" }}>Tap to apply</p>
								</button>
							)}
							<div style={{ display: "flex", gap: 8 }}>
								<input value={promoCode} onChange={e => { setPromoCode(e.target.value); setPromoApplied(false); setPromoDiscount(null); setPromoError(null); }} placeholder={t("food.checkout.enterCode")} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, borderRadius: 8, padding: "9px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", caretColor: "#2563eb" }} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
								<button onClick={() => handleApplyPromo()} disabled={promoLoading || promoApplied} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: promoApplied ? "rgba(16,185,129,0.15)" : "rgba(37,99,235,0.15)", border: `1px solid ${promoApplied ? "rgba(16,185,129,0.35)" : "rgba(37,99,235,0.3)"}`, borderRadius: 8, color: promoApplied ? "#10b981" : "#2563eb", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, padding: "9px 14px", cursor: promoApplied ? "default" : "pointer", whiteSpace: "nowrap", opacity: promoLoading ? 0.6 : 1 }}>
									{promoLoading ? t("food.checkout.applying") : promoApplied ? <><CheckIcon s={14} />{t("food.checkout.applied")}</> : t("food.checkout.apply")}
								</button>
							</div>
							{promoApplied && promoDiscount && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#10b981", marginTop: 6 }}>{promoDiscount.label}</p>}
							{promoError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#ef4444", marginTop: 6 }}>{promoError}</p>}
						</div>
						<button onClick={() => onCheckout?.(promoApplied ? promoCode : null)} style={{ width: "100%", padding: "14px", background: "#2563eb", border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
							{t("food.checkout.proceedToCheckout")}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function FoodCheckoutPage({ cart, onBack, onPlaceOrder, restaurant, sellerId, vendorTypeId = 1, productTypeId = null, isDigital = false, deliveryAddr, vertical = "commerce", itemSource, shipOnly = false, promoCode: initialPromoCode = null }) {
	const { isMobile } = useViewport();
	const { t, i18n } = useTranslation();
	const [refCode, setRefCode] = useState("");
	const [refApplied, setRefApplied] = useState(false);
	const [refError, setRefError] = useState(null);
	const [refLoading, setRefLoading] = useState(false);
	const [promo, setPromo] = useState(initialPromoCode || "");
	const [promoApplied, setPromoApplied] = useState(Boolean(initialPromoCode));
	const [promoDiscount, setPromoDiscount] = useState(null);
	const [promoError, setPromoError] = useState(null);
	const [promoLoading, setPromoLoading] = useState(false);
	const checkoutReferralCode = () =>
		(refApplied && refCode.trim()) || getCheckoutReferralCode() || undefined;
	const [deliveryInstructions, setDeliveryInstructions] = useState("");
	const [deliveryHandoffPreference, setDeliveryHandoffPreference] = useState("meet_outside");
	const [scheduledTime, setScheduledTime] = useState("");
	const [schedulePreset, setSchedulePreset] = useState("");
	const [payMethod, setPayMethod] = useState("card");
	const [payProcessing, setPayProcessing] = useState(false);
	const [payError, setPayError] = useState(null);
	// "Lock the price, disclose the change": the server prices commerce/food carts exactly
	// and can return a different amount than what we displayed (delivery fee recalculated,
	// modifiers repriced, etc). Rather than silently charging that new number, pause and ask.
	const [priceChange, setPriceChange] = useState(null);
	function confirmPriceIfChanged(oldAmount, newAmount) {
		if (newAmount == null || !Number.isFinite(Number(newAmount)) || Math.abs(Number(newAmount) - oldAmount) <= 0.02) {
			return Promise.resolve(true);
		}
		return new Promise((resolve) => setPriceChange({ oldAmount, newAmount: Number(newAmount), resolve }));
	}

	const isInternationalBook = vertical === "books" && cart.some(item => item.shippingType === "international");
	const isDigitalNoDelivery = isDigital && vertical !== "books";
	// Physical goods that ship from the seller (e.g. wedding boutiques) rather than being
	// couriered locally — skips the local-delivery driver dispatch + ETA entirely.
	const shipBySellerOnly = shipOnly || isInternationalBook;

	const [deliveryMode, setDeliveryMode] = useState(
		isDigitalNoDelivery ? "digital" :
		shipBySellerOnly ? "ship_by_seller" :
		"delivery"
	);
	const [tipAmount, setTipAmount] = useState(0);
	const [customTip, setCustomTip] = useState("");
	const [driversAvailable, setDriversAvailable] = useState(true);
	const [walletBalance, setWalletBalance] = useState(150);
	const [shippingQuote, setShippingQuote] = useState(null);
	const [shippingQuoteError, setShippingQuoteError] = useState(null);
	const isFloralCheckout = vertical === "floral";

	useEffect(() => {
		if (!isFloralCheckout || scheduledTime) return;
		setSchedulePreset("same");
		setScheduledTime(floralSameDayValue());
	}, [isFloralCheckout, scheduledTime]);

	const stripe = useStripe();
	const elements = useElements();
	const vendorId = restaurant?.id;
	const suggestedOffer = restaurant?.eligibleOffers?.[0] || null;
	const isProductCheckout = itemSource === "product";
	const resolvedSellerId = sellerId
		?? (isProductCheckout || vertical === "books" ? restaurant?.id : null)
		?? cart.find((i) => i?.seller_id != null)?.seller_id
		?? null;
	const quoteSellerId = resolvedSellerId;

	const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
	const checkoutPromoDiscount = promoApplied && promoDiscount
		? (promoDiscount.type === "percent"
			? subtotal * (Number(promoDiscount.value) / 100)
			: Math.min(Number(promoDiscount.value) || 0, subtotal))
		: 0;
	const discountedSubtotal = Math.max(0, subtotal - checkoutPromoDiscount);
	const platformFee = discountedSubtotal * 0.08;
	const fallbackDeliveryFee = isDigitalNoDelivery || deliveryMode === "pickup" ? 0.00 :
	                    deliveryMode === "ship_by_seller" ? 4.99 :
	                    (deliveryMode === "delivery" ? 1.99 : 0.00);
	const deliveryFee =
		deliveryMode === "pickup" || isDigitalNoDelivery
			? 0
			: shippingQuote?.fee != null && Number.isFinite(Number(shippingQuote.fee))
			? Number(shippingQuote.fee)
			: fallbackDeliveryFee;
	const { tax: taxRate, currency } = getUserRegion();
	const activeTaxRate = (getUser()?.country && taxRate !== undefined && taxRate !== null) ? taxRate : 0;
	const tax = (discountedSubtotal + platformFee) * activeTaxRate;
	// Self-pickup has no courier, and the order row is written with tip_amount 0 --
	// so the charge has to drop the tip too, or the buyer pays money nobody receives.
	const effectiveTip = deliveryMode === "pickup" ? 0 : tipAmount;
	const total = discountedSubtotal + platformFee + deliveryFee + tax + effectiveTip;

	async function handleApplyCheckoutPromo(arg) {
		// `arg` is either a typed code string or a suggested offer applied by { promotionId }.
		const promotionId = arg && typeof arg === "object" ? arg.promotionId : null;
		const code = promotionId ? "" : String(arg || promo || "").trim();
		if (!code && !promotionId) return;
		if (code) setPromo(code);
		setPromoLoading(true);
		setPromoError(null);
		try {
			const res = await validatePromoCode(code || null, {
				...(promotionId ? { promotion_id: promotionId } : {}),
				subtotal,
				vertical: resolvePromoVertical(vertical, itemSource),
				vendor_id: itemSource === "food" || !itemSource ? (vendorId ?? null) : null,
				vendor_owner_id: itemSource === "food" || !itemSource
					? (restaurant?.owner_id ?? restaurant?.raw?.owner_id ?? null)
					: null,
			});
			if (res.valid) {
				setPromoApplied(true);
				// The real code is only revealed by this rate-limited call; keep it so checkout submits it.
				if (res.code) setPromo(res.code);
				setPromoDiscount({ type: res.type, value: res.value, label: res.label || res.badge || res.code || code });
			} else {
				setPromoApplied(false);
				setPromoDiscount(null);
				setPromoError(res.message || t("food.checkout.invalidPromo"));
			}
		} catch (err) {
			setPromoApplied(false);
			setPromoDiscount(null);
			setPromoError(err?.response?.data?.message || t("food.checkout.invalidPromo"));
		} finally {
			setPromoLoading(false);
		}
	}

	const effectiveSource = itemSource || (isDigital ? "digital" : null);
	const isProductCheckoutFlow = effectiveSource === "product";
	const isGroceryCheckoutFlow = vertical === "grocery" || vertical === "groceries";
	const [grocerySubstitutionMode, setGrocerySubstitutionMode] = useState("contact_first");
	const [groceryPreferredSubs, setGroceryPreferredSubs] = useState("");
	const [grocerySubstitutionNote, setGrocerySubstitutionNote] = useState("");
	const checkoutPaymentMethods = useMemo(
		() => (isGroceryCheckoutFlow ? ["card", "wallet"] : ["card", "paypal", "wallet"]),
		[isGroceryCheckoutFlow],
	);

	useEffect(() => {
		if (!checkoutPaymentMethods.includes(payMethod)) {
			setPayMethod("card");
			setPayError(null);
		}
	}, [checkoutPaymentMethods, payMethod]);
	const groceryDeliveryWindowPayload = () => {
		if (!isGroceryCheckoutFlow || !scheduledTime) return {};
		const start = new Date(scheduledTime);
		if (Number.isNaN(start.getTime())) return {};
		const end = new Date(start.getTime() + 60 * 60 * 1000);
		return {
			delivery_window_start: start.toISOString(),
			delivery_window_end: end.toISOString(),
		};
	};
	const grocerySubstitutionPayload = () => {
		if (!isGroceryCheckoutFlow) return {};
		const preferredItems = groceryPreferredSubs
			.split(/[\n,]/)
			.map((item) => item.trim())
			.filter(Boolean)
			.slice(0, 20);
		return {
			substitution_preference: {
				mode: grocerySubstitutionMode,
				preferred_items: preferredItems,
				note: grocerySubstitutionNote.trim() || null,
			},
		};
	};
	const groceryDeliveryPreferencePayload = () => {
		if (!isGroceryCheckoutFlow || deliveryMode !== "delivery") return {};
		return {
			delivery_preference: {
				handoff: deliveryHandoffPreference,
				note: deliveryInstructions.trim() || null,
			},
		};
	};
	// One code for the whole checkout: the payment endpoints and the order row must be
	// given the same promo, or the buyer gets charged one total and billed another.
	const submittedPromoCode = promo || initialPromoCode || null;
	const commerceItems =
		effectiveSource === "digital"
			? cart.map(i => ({ content_id: Number(i.id), qty: i.qty }))
			: effectiveSource === "product"
			? cart.map(i => ({
					variation_id: i.variation_id != null ? Number(i.variation_id) : undefined,
					listing_id: i.id != null ? Number(i.id) : undefined,
					qty: i.qty,
			  }))
			: effectiveSource === "food"
			? cart.map(i => ({
					food_item_id: Number(i.id),
					qty: i.qty,
					modifier_option_ids: Array.isArray(i.modifier_option_ids) ? i.modifier_option_ids : [],
					special_instructions: typeof i.special_instructions === "string" ? i.special_instructions.trim() : undefined,
			  }))
			: null;

	useEffect(() => {
		getWalletBalance().then(bal => setWalletBalance(bal?.balance != null ? parseFloat(bal.balance) : 0)).catch(() => {});
	}, []);

	// Hybrid shipping quote: local → driver delivery; remote → zone ship-by-seller fee.
	useEffect(() => {
		if (isDigitalNoDelivery || !quoteSellerId) {
			setShippingQuote(null);
			setShippingQuoteError(null);
			return undefined;
		}
		let cancelled = false;
		const coords = readBuyerDeliveryCoords();
		const u = getUser();
		quoteShipping({
			seller_id: quoteSellerId,
			country: u?.country || null,
			city: u?.city || null,
			lat: coords.lat,
			lng: coords.lng,
			preferred_mode: shipBySellerOnly ? "ship_by_seller" : null,
		})
			.then((q) => {
				if (cancelled) return;
				setShippingQuote(q);
				setShippingQuoteError(null);
				if (shipBySellerOnly) {
					setDeliveryMode("ship_by_seller");
				} else if (q?.local) {
					setDeliveryMode((m) => (m === "pickup" ? "pickup" : "delivery"));
				} else if (q?.mode === "ship_by_seller") {
					setDeliveryMode("ship_by_seller");
				}
			})
			.catch((err) => {
				if (cancelled) return;
				const data = err?.response?.data;
				const msg = data?.error || data?.message;
				setShippingQuote(data?.ok === false ? data : null);
				setShippingQuoteError(msg || (err?.response?.status === 422 ? "This seller does not ship to your location" : null));
			});
		return () => { cancelled = true; };
	}, [quoteSellerId, shipBySellerOnly, isDigitalNoDelivery]);

	useEffect(() => {
		if (deliveryMode !== "delivery") { setDriversAvailable(true); return; }
		getDeliveryDrivers()
			.then(drivers => {
				const userLoc = readFoodLocation();
				const userLat = userLoc.lat;
				const userLng = userLoc.lng;
				if (userLat == null || userLng == null) {
					setDriversAvailable(true);
					return;
				}
				const nearby = (drivers || []).filter(d => d.is_online).filter(d => {
					const dLat = parseFiniteNumber(d.current_lat);
					const dLng = parseFiniteNumber(d.current_long);
					const distance = getDistance(userLat, userLng, dLat, dLng);
					return distance != null && distance <= 15;
				});
				setDriversAvailable(nearby.length > 0);
			})
			.catch(() => { setDriversAvailable(true); });
	}, [deliveryMode]);

	
	const dynamicETA = useMemo(() => {
		if (deliveryMode !== "delivery") return 15; 
		const userLoc = readFoodLocation();
		const userLat = userLoc.lat;
		const userLng = userLoc.lng;

		const restLat = restaurant?.lat;
		const restLng = restaurant?.lng;
		const dist = getDistance(userLat, userLng, restLat, restLng);
		if (dist == null) return 25;
		return 15 + Math.round(dist * 6);
	}, [deliveryMode, restaurant]);

	async function handlePlaceOrder() {
		if (payMethod === "paypal") return;

		if (shippingQuoteError) {
			setPayError(shippingQuoteError);
			return;
		}

		// Auth first — never charge or call payment APIs without a signed-in buyer.
		const preAuthUser = getUser();
		const buyerId = getAuthUserId() ?? preAuthUser?.user_id ?? preAuthUser?.id ?? null;
		if (!buyerId) {
			setPayError(t("food.checkout.loginRequired"));
			return;
		}

		if (isProductCheckoutFlow && resolvedSellerId == null) {
			setPayError(t("shop.checkoutNeedShop", { defaultValue: "Open a shop and add items again before checkout." }));
			return;
		}

		if (deliveryMode === "delivery") {
			let isAvail = true;
			try {
				const drivers = await getDeliveryDrivers().catch(() => null);
				if (drivers !== null) {
					const userLoc = readFoodLocation();
					const userLat = userLoc.lat;
					const userLng = userLoc.lng;
					if (userLat == null || userLng == null) {
						isAvail = true;
					} else {
					const onlineDrivers = drivers.filter(d => d.is_online);
					const nearby = onlineDrivers.filter(d => {
						const dLat = parseFiniteNumber(d.current_lat);
						const dLng = parseFiniteNumber(d.current_long);
						const distance = getDistance(userLat, userLng, dLat, dLng);
						return distance != null && distance <= 15;
					});
					isAvail = nearby.length > 0;
					}
				}
			} catch {
				isAvail = true;
			}

			if (!isAvail) {
				setPayError(t("food.checkout.noDriversCheckout"));
				return;
			}
		}

		if (deliveryMode === "delivery" && !String(deliveryAddr || "").trim()) {
			setPayError(t("food.checkout.noAddress", { defaultValue: "Delivery address is required." }));
			return;
		}

		let buyerCoords = { lat: null, lng: null };
		if (deliveryMode === "delivery") {
			// Best-effort only. assertFoodDeliveryInRange() geocodes deliver_location on the
			// server and deliberately does not hard-block when the distance is unknown, so
			// blocking here would reject orders the API accepts -- anyone whose Maps JS is
			// blocked and who has no saved_lat on their profile could not order at all.
			buyerCoords = await ensureBuyerDeliveryCoords(deliveryAddr);
		}

		setPayProcessing(true);
		setPayError(null);

		// Tell the server which catalog to price this cart against and the item
		// ids to price from. All commerce carts are priced EXACTLY server-side (the
		// `total` we send is ignored): digital/book + product by item id, food by
		// food_item_id plus the selected modifier_option_ids (server-owned prices).
		// When we can't supply the ids the server falls back to the client amount.
		// (commerceItems / effectiveSource / isProductCheckoutFlow computed above)

		// The PaymentIntent id ties the card charge to the order row we persist
		// below, so the platform Stripe webhook can reconcile it (and record an
		// orphan if the order ever fails to save).
		let paymentIntentId = null;
		try {
				if (payMethod === "card") {
					const card = elements?.getElement(CardElement);
					if (!stripe || !elements || !card) {
						setPayError(t("food.checkout.paymentFailed"));
						setPayProcessing(false);
						return;
					}
					// Amount is sent in dollars (major units) — the backend converts to
					// cents for Stripe. Commerce carts are priced server-side from the
					// item ids below (the server recomputes the charge exactly, ignoring
					// `total`, for digital/product/food), closing the client-controlled-
					// amount gap and adding fee/tax/shipping itself.
				const coords = isUsableBuyerCoords(buyerCoords.lat, buyerCoords.lng)
					? buyerCoords
					: readBuyerDeliveryCoords();
				const buyer = getUser();
				const { clientSecret, paymentIntentId: piId, amount: serverAmount } = await createStripeIntent(total, {
					purpose: 'commerce',
					vertical,
					promo_code: submittedPromoCode,
					...(commerceItems ? {
						items: commerceItems,
						tip: effectiveTip,
						shipping_mode: deliveryMode,
						item_source: effectiveSource,
						seller_id: quoteSellerId,
						shipping_country: buyer?.country,
						shipping_address: deliveryAddr || undefined,
						shipping_city: buyer?.city,
						shipping_lat: coords.lat,
						shipping_lng: coords.lng,
					} : {}),
				});
				const priceOk = await confirmPriceIfChanged(total, serverAmount);
				if (!priceOk) {
					setPayProcessing(false);
					return;
				}
				const result = await stripe.confirmCardPayment(clientSecret, {
					payment_method: { card },
				});
				if (result.error) {
					setPayError(result.error.message);
					setPayProcessing(false);
					return;
				}
				paymentIntentId = result.paymentIntent?.id ?? piId ?? null;
			} else if (payMethod === "wallet") {
				const balObj = await getWalletBalance();
				const currentBal = balObj?.balance != null ? parseFloat(balObj.balance) : 0;
				if (currentBal < total) {
					setPayError(t("food.checkout.insufficientWallet", { balance: fmt(currentBal, currency, i18n.language) }));
					setPayProcessing(false);
					return;
				}
			}
		} catch {
			// True payment-step failure only (Stripe intent / wallet balance API).
			setPayError(t("food.checkout.paymentFailed"));
			setPayProcessing(false);
			return;
		}

		let placedOrderId = null;
		let persistFailed = false;

		const fullInstructions = composeFoodDeliveryInstructions({ tipAmount: effectiveTip, deliveryInstructions, cart, vertical });

		if (isDigital) {
			try {
				const endpoint = vertical === "books" ? '/books/orders' : '/dg-order';
				// buyer_id, ispaid and the category are all resolved server-side from
				// the JWT + content row. We only pass payment_intent_id so the platform
				// Stripe webhook can reconcile the charge and flip the order to paid.
				const digResults = await Promise.all(cart.map(item => client.post(endpoint, {
					content_id: Number(item.id),
					qty: item.qty,
					total: item.price * item.qty,
					payment_method: payMethod,
					payment_intent_id: paymentIntentId,
				})));
				const first = digResults[0]?.data ?? digResults[0];
				placedOrderId =
					first?.dg_order_id ??
					first?.order_id ??
					first?.book_order_id ??
					first?.id ??
					null;
			} catch { persistFailed = true; }
		} else {
			if (vendorId && !isProductCheckoutFlow) {
				try {
					const coords = isUsableBuyerCoords(buyerCoords.lat, buyerCoords.lng)
						? buyerCoords
						: await ensureBuyerDeliveryCoords(deliveryAddr);
					const restLat = parseFiniteNumber(restaurant?.lat ?? restaurant?.raw?.lat);
					const restLng = parseFiniteNumber(restaurant?.lng ?? restaurant?.long ?? restaurant?.raw?.long);
					if (deliveryMode === "delivery" && restLat != null && restLng != null && isUsableBuyerCoords(coords.lat, coords.lng)) {
						const km = getDistance(restLat, restLng, coords.lat, coords.lng);
						if (km != null && km > FOOD_DELIVERY_MAX_KM) {
							setPayError(
								t("food.checkout.tooFarForDelivery", {
									km: km.toFixed(1),
									max: FOOD_DELIVERY_MAX_KM,
									defaultValue: `This address is too far for courier delivery (${km.toFixed(1)} km). Choose a closer address or Self-Pickup (max ${FOOD_DELIVERY_MAX_KM} km).`,
								}),
							);
							setPayProcessing(false);
							return;
						}
					}
					const res = await createFoodOrder({
						user_id: buyerId,
						vendor_id: vendorId,
						order_status: 'pending',
						total_amount: total,
						item_subtotal: discountedSubtotal,
						vendor_net: parseFloat(sellerNetFromOrderTotal(discountedSubtotal).toFixed(2)),
						delivery_fee: deliveryMode === "pickup" ? 0 : deliveryFee,
						deliver_location: deliveryMode === "pickup" ? null : String(deliveryAddr).trim(),
						delivery_lat: deliveryMode === "pickup" ? null : coords.lat,
						delivery_lng: deliveryMode === "pickup" ? null : coords.lng,
						fulfillment_mode: deliveryMode === "pickup" ? "pickup" : "delivery",
						vendor_type_id: vendorTypeId,
						delivery_instructions: fullInstructions || null,
						scheduled_time: scheduledTime || null,
						...groceryDeliveryWindowPayload(),
						...grocerySubstitutionPayload(),
						...groceryDeliveryPreferencePayload(),
						payment_method: payMethod.toUpperCase(),
						payment_intent_id: paymentIntentId,
						tip_amount: effectiveTip,
						promo_code: submittedPromoCode,
						referral_code: checkoutReferralCode(),
						items: effectiveSource === "food" ? commerceItems : undefined,
					});
					placedOrderId = res?.data?.food_order_id ?? res?.food_order_id ?? null;
					if (!placedOrderId) persistFailed = true;
				} catch (err) {
					persistFailed = true;
					const apiMsg = err?.response?.data?.message || err?.response?.data?.error;
					if (apiMsg) setPayError(String(apiMsg));
				}
			}
			if (resolvedSellerId && isProductCheckoutFlow) {
				try {
					const orderResults = await Promise.all(cart.map((item) => createOrder(buildProductOrderPayload({
						item,
						payMethod,
						paymentIntentId,
						productTypeId: item?.product_type_id ?? productTypeId,
						deliveryMode,
						deliveryAddr,
						deliveryFee,
						platformFee,
						tax,
										deliveryInstructions: fullInstructions,
										promoCode: submittedPromoCode,
										referralCode: checkoutReferralCode(),
					}))));
					placedOrderId = extractProductOrderId(orderResults[0]);
				} catch { persistFailed = true; }
			} else if (resolvedSellerId) {
				try {
					await Promise.all(cart.map(item => createOrder({
						seller_id: resolvedSellerId,
						buyer_id: buyerId,
						variation_id: item.variation_id != null ? Number(item.variation_id) : null,
						total: item.price * item.qty,
						qty: item.qty,
						payment_method: payMethod,
						payment_intent_id: paymentIntentId,
						product_type_id: item?.product_type_id ?? productTypeId
					})));
				} catch { persistFailed = true; }
			}
		}
		setPayProcessing(false);
		// A card charge that couldn't be recorded is caught by the Stripe webhook as
		// an orphan for reconciliation/refund — be honest rather than fake success.
		if (persistFailed && paymentIntentId) {
			setPayError(t("food.checkout.paymentOkOrderSaveFailed"));
			return;
		}
		// Wallet / non-card path: order row failed to save — not a payment failure.
		if (persistFailed) {
			setPayError((prev) => prev || t("food.checkout.orderSaveFailed"));
			return;
		}
		// Food path: never show tracking success if the order row was not created.
		if (vendorId && !isProductCheckoutFlow && !isDigital && !placedOrderId) {
			setPayError(t("food.checkout.orderSaveFailed"));
			return;
		}
		// Shop / product path: same guard (sellerId may come from cart when shop UI cleared).
		if (isProductCheckoutFlow && !isDigital && !placedOrderId) {
			setPayError(t("food.checkout.orderSaveFailed"));
			return;
		}
		onPlaceOrder(placedOrderId, deliveryMode);
	}

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, animation: "fadeUp 0.3s ease both" }}>
			<div style={{ paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 28, paddingBottom: 24 }}>
				<div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
				<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 20, padding: 0 }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					{t("food.checkout.backToCart")}
				</button>
				<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 36, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 24 }}>{t("food.checkout.title")}</h1>

				
				{deliveryMode === "delivery" && !driversAvailable && (
					<div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: "14px 16px", marginBottom: 18, display: "flex", flexDirection: "column", gap: 8 }}>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#f87171", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
							 {t("food.checkout.noDrivers")}
						</p>
						<div style={{ display: "flex", gap: 12, alignItems: "center" }}>
							<button onClick={() => setDeliveryMode("pickup")} style={{ background: "#2563eb", border: "none", borderRadius: 8, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, padding: "6px 14px", cursor: "pointer" }}>
								{t("food.checkout.switchPickup")}
							</button>
						</div>
					</div>
				)}

				
				{shippingQuoteError && (
					<div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: "14px 16px", marginBottom: 18 }}>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#f87171", fontWeight: 600 }}>
							{shippingQuoteError}
						</p>
					</div>
				)}

				
				{!isDigitalNoDelivery && !shipBySellerOnly && shippingQuote?.local !== false && (
				<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{t("food.checkout.deliveryMode")}</p>
					<div style={{ display: "flex", gap: 8 }}>
						{[
							{ id: "delivery", label: t("food.checkout.deliveryOption", { fee: fmt(deliveryMode === "delivery" ? deliveryFee : (shippingQuote?.local ? deliveryFee : 1.99), currency, i18n.language) }), desc: t("food.checkout.deliveryEta", { mins: dynamicETA }) },
							{ id: "pickup", label: t("food.checkout.pickupOption", { fee: fmt(0, currency, i18n.language) }), desc: t("food.checkout.pickupEta") },
						].map(opt => (
							<div key={opt.id} onClick={() => setDeliveryMode(opt.id)} style={{ flex: 1, padding: "14px 16px", borderRadius: 12, background: deliveryMode === opt.id ? "rgba(37,99,235,0.12)" : "var(--color-surface-raised)", border: `2.5px solid ${deliveryMode === opt.id ? "#2563eb" : "var(--color-border)"}`, cursor: "pointer", transition: "all 0.15s" }}>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{opt.label}</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{opt.desc}</p>
							</div>
						))}
					</div>
				</div>
				)}

				{(shipBySellerOnly || deliveryMode === "ship_by_seller") && (
					<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{t("food.shippingMode")}</p>
						<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{isInternationalBook ? t("food.shipBySellerIntlTitle") : t("food.shipBySellerTitle", { defaultValue: "Shipped by seller" })}</p>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{isInternationalBook ? t("food.shipIntlDesc") : t("food.shipBySellerDesc", { defaultValue: "The seller ships your order directly to your address." })}</p>
						{shippingQuote?.fee != null && (
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 8 }}>
								Shipping: {fmt(Number(shippingQuote.fee), currency, i18n.language)}
							</p>
						)}
					</div>
				)}

				
				<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{t("food.checkout.orderSummary")}</p>
					{cart.map(item => (
						<div key={item.lineId} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
							<div style={{ display: "flex", flexDirection: "column" }}>
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{item.qty}× {item.name || item.title}</span>
								{item.extras?.length > 0 && <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10 }}>({item.extras.join(", ")})</span>}
								{(item.instructions || item.special_instructions) && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#f59e0b" }}>{t("food.checkout.notePrefix")} "{item.instructions || item.special_instructions}"</span>}
							</div>
							<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{fmt(item.price * item.qty, currency, i18n.language)}</span>
						</div>
					))}
					<div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10, marginTop: 8, display: "flex", justifyContent: "space-between" }}>
						<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("food.checkout.subtotal")}</span>
						<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{fmt(subtotal, currency, i18n.language)}</span>
					</div>
					<div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
						<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("food.checkout.platformFee")}</span>
						<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{fmt(platformFee, currency, i18n.language)}</span>
					</div>
					<div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
						<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("food.checkout.deliveryFeeLabel")}</span>
						<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{fmt(deliveryFee, currency, i18n.language)}</span>
					</div>
					<div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
						<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("food.checkout.tax", { rate: (activeTaxRate * 100).toFixed(0) })}</span>
						<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{fmt(tax, currency, i18n.language)}</span>
					</div>
					{tipAmount > 0 && (
						<div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#10b981" }}>{t("food.checkout.driverTip")}</span>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#10b981" }}>{fmt(tipAmount, currency, i18n.language)}</span>
						</div>
					)}
					<div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10, marginTop: 8, display: "flex", justifyContent: "space-between" }}>
						<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700 }}>{t("food.checkout.total")}</span>
						<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700 }}>{fmt(total, currency, i18n.language)}</span>
					</div>
				</div>

				{deliveryMode === "delivery" && (
					<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{t("food.checkout.tipDriver")}</p>
						<div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
							{[0, 2, 5, 8].map(amount => (
								<button key={amount} onClick={() => { setTipAmount(amount); setCustomTip(""); }} style={{ flex: 1, padding: "10px", borderRadius: 10, background: tipAmount === amount && !customTip ? "rgba(37,99,235,0.15)" : "var(--color-surface-raised)", border: `1px solid ${tipAmount === amount && !customTip ? "rgba(37,99,235,0.4)" : "var(--color-border)"}`, color: tipAmount === amount && !customTip ? "#fff" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
									{amount === 0 ? t("food.checkout.noTip") : fmt(amount, currency, i18n.language)}
								</button>
							))}
						</div>
						<div style={{ display: "flex", gap: 8 }}>
							<input value={customTip} onChange={e => { setCustomTip(e.target.value); const val = parseFloat(e.target.value); setTipAmount(isNaN(val) ? 0 : val); }} placeholder={t("food.checkout.customTipPlaceholder")} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, borderRadius: 9, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", caretColor: "#2563eb" }} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
						</div>
					</div>
				)}

				{isGroceryCheckoutFlow && (
					<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
								{t("food.checkout.substitutionRules", { defaultValue: "Substitution rules" })}
							</p>
							<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 8, marginBottom: 10 }}>
								{[
									["contact_first", t("food.checkout.contactMeFirst", { defaultValue: "Contact me first" })],
									["same_brand_only", t("food.checkout.sameBrandOnly", { defaultValue: "Same brand only" })],
									["cheaper_only", t("food.checkout.cheaperOnly", { defaultValue: "Cheaper only" })],
									["none", t("food.checkout.noSubstitutions", { defaultValue: "No substitutions" })],
								].map(([value, label]) => (
									<button
										key={value}
										type="button"
										onClick={() => setGrocerySubstitutionMode(value)}
										style={{
											padding: "10px 12px",
											borderRadius: 10,
											border: `1px solid ${grocerySubstitutionMode === value ? "rgba(37,99,235,0.5)" : "var(--color-border)"}`,
											background: grocerySubstitutionMode === value ? "rgba(37,99,235,0.16)" : "var(--color-surface-raised)",
											color: grocerySubstitutionMode === value ? "#fff" : "var(--color-text-secondary)",
											fontFamily: "'DM Sans', sans-serif",
											fontSize: 12,
											fontWeight: 800,
											cursor: "pointer",
											textAlign: "left",
											overflowWrap: "anywhere",
										}}
									>
										{label}
									</button>
								))}
							</div>
							<input
								value={groceryPreferredSubs}
								onChange={(e) => setGroceryPreferredSubs(e.target.value)}
								placeholder={t("food.checkout.preferredSubstitutions", { defaultValue: "Preferred brands/items, separated by commas" })}
								className="bg-surface-raised border border-border text-text-primary"
								style={{ width: "100%", borderRadius: 9, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box", caretColor: "#2563eb", marginBottom: 8 }}
							/>
							<textarea
								value={grocerySubstitutionNote}
								onChange={(e) => setGrocerySubstitutionNote(e.target.value)}
								placeholder={t("food.checkout.substitutionNote", { defaultValue: "Allergies, size notes, or substitution instructions" })}
								rows={2}
								className="bg-surface-raised border border-border text-text-primary"
								style={{ width: "100%", borderRadius: 9, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", caretColor: "#2563eb" }}
							/>
						</div>
					)}

				{!isDigitalNoDelivery && (
					<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
							{deliveryMode === "ship_by_seller" ? t("food.checkout.deliveryAddress") : t("food.checkout.deliveryDetails")}
						</p>
						{(deliveryMode === "delivery" || deliveryMode === "ship_by_seller") && (
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 12, display: "flex", gap: 6, alignItems: "center" }}>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
								{t("food.checkout.deliveryAddress")} <strong>{deliveryAddr || t("food.checkout.noAddress")}</strong>
							</p>
						)}
						{isGroceryCheckoutFlow && deliveryMode === "delivery" && (
							<div style={{ marginBottom: 12 }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
									{t("food.checkout.handoffPreference", { defaultValue: "Delivery handoff" })}
								</p>
								<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 8 }}>
									{[
										["meet_outside", t("food.checkout.meetOutside", { defaultValue: "Meet outside" })],
										["leave_at_door", t("food.checkout.leaveAtDoor", { defaultValue: "Leave at door" })],
										["call_on_arrival", t("food.checkout.callOnArrival", { defaultValue: "Call on arrival" })],
									].map(([value, label]) => (
										<button
											key={value}
											type="button"
											onClick={() => setDeliveryHandoffPreference(value)}
											style={{
												padding: "10px 12px",
												borderRadius: 10,
												border: `1px solid ${deliveryHandoffPreference === value ? "rgba(37,99,235,0.5)" : "var(--color-border)"}`,
												background: deliveryHandoffPreference === value ? "rgba(37,99,235,0.16)" : "var(--color-surface-raised)",
												color: deliveryHandoffPreference === value ? "#fff" : "var(--color-text-secondary)",
												fontFamily: "'DM Sans', sans-serif",
												fontSize: 12,
												fontWeight: 800,
												cursor: "pointer",
												textAlign: "center",
											}}
										>
											{label}
										</button>
									))}
								</div>
					</div>
				)}
						<textarea value={deliveryInstructions} onChange={e => setDeliveryInstructions(e.target.value)} placeholder={t("food.checkout.instructionsPlaceholder")} rows={2} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 9, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", caretColor: "#2563eb", marginBottom: 10 }} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
						{deliveryMode !== "ship_by_seller" && (
							<>
								{isFloralCheckout ? (
									<>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, marginBottom: 8 }}>{t("floral.deliveryDate")}</p>
										<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
											{[
												{ id: "same", label: t("floral.sameDay") },
												{ id: "next", label: t("floral.nextDay") },
												{ id: "scheduled", label: t("floral.scheduled") },
											].map(opt => (
												<button
													key={opt.id}
													type="button"
													onClick={() => {
														setSchedulePreset(opt.id);
														if (opt.id === "same") setScheduledTime(floralSameDayValue());
														else if (opt.id === "next") setScheduledTime(floralNextDayValue());
													}}
													style={{
														padding: "8px 12px",
														borderRadius: 10,
														background: schedulePreset === opt.id ? "rgba(219,40,119,0.16)" : "var(--color-surface-raised)",
														border: `1px solid ${schedulePreset === opt.id ? "rgba(219,40,119,0.45)" : "var(--color-border)"}`,
														color: schedulePreset === opt.id ? "#fff" : "var(--color-text-secondary)",
														fontFamily: "'DM Sans', sans-serif",
														fontSize: 12,
														fontWeight: 700,
														cursor: "pointer",
													}}
												>
													{opt.label}
												</button>
											))}
										</div>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>{t("floral.deliveryTime")}</p>
									</>
								) : (
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>{t("food.checkout.scheduleLater")}</p>
								)}
								<input type="datetime-local" value={scheduledTime} onChange={e => { setScheduledTime(e.target.value); if (isFloralCheckout) setSchedulePreset("scheduled"); }} className="bg-surface-raised border border-border text-text-primary strug-native-select" style={{ width: "100%", borderRadius: 9, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box" }} onFocus={e => e.target.style.borderColor = isFloralCheckout ? "rgba(219,40,119,0.5)" : "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
							</>
						)}
					</div>
				)}
				<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{t("food.checkout.paymentMethod")}</p>
					{checkoutPaymentMethods.map(m => (
						<label key={m} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 10 }}>
							<input type="radio" name="pay" checked={payMethod === m} onChange={() => { setPayMethod(m); setPayError(null); }} style={{ accentColor: "#2563eb" }} />
							<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
								{m === "card" ? t("food.checkout.card") : m === "paypal" ? t("food.checkout.paypal") : t("food.checkout.wallet", { balance: fmt(walletBalance, currency, i18n.language) })}
							</span>
						</label>
					))}
					{payMethod === "card" && (
						<div className="bg-surface-raised" style={{ border: "1px solid rgba(37,99,235,0.35)", borderRadius: 10, padding: "13px 14px", marginTop: 8 }}>
							<CardElement options={{ style: { base: { color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: "14px", "::placeholder": { color: "rgba(255,255,255,0.3)" } }, invalid: { color: "#f87171" } } }} />
						</div>
					)}
					{payMethod === "paypal" && (
						<div style={{ marginTop: 12 }}>
							<PayPalButtons
								style={{ layout: "vertical", color: "blue", shape: "rect", label: "pay", height: 40 }}
								createOrder={async () => {
									const preAuthUser = getUser();
									const authBuyerId = getAuthUserId() ?? preAuthUser?.user_id ?? preAuthUser?.id ?? null;
									if (!authBuyerId) {
										setPayError(t("food.checkout.loginRequired"));
										throw new Error("Login required");
									}
									if (shippingQuoteError) {
										setPayError(shippingQuoteError);
										throw new Error(shippingQuoteError);
									}
									if (deliveryMode === "delivery") {
										let isAvail = true;
										const drivers = await getDeliveryDrivers().catch(() => null);
										if (drivers !== null) {
											const userLoc = readFoodLocation();
											const userLat = userLoc.lat;
											const userLng = userLoc.lng;
											if (userLat != null && userLng != null) {
												const onlineDrivers = drivers.filter(d => d.is_online);
												const nearby = onlineDrivers.filter(d => {
													const dLat = parseFiniteNumber(d.current_lat);
													const dLng = parseFiniteNumber(d.current_long);
													const distance = getDistance(userLat, userLng, dLat, dLng);
													return distance != null && distance <= 15;
												});
												isAvail = nearby.length > 0;
											}
										}
										if (!isAvail) {
											setPayError(t("food.checkout.noDriversPaypal"));
											throw new Error("No drivers available");
										}
									}
									// Same server-side pricing as the card path: PayPal's order
									// amount is recomputed exactly from the item ids (+ modifier
									// option ids for food) — see createStripeIntent above.
									const coords = readBuyerDeliveryCoords();
									const buyer = getUser();
									const { id, amount: serverAmount } = await createPaypalOrder(total.toFixed(2), {
										purpose: 'commerce',
										vertical,
										promo_code: submittedPromoCode,
										...(commerceItems ? {
											items: commerceItems,
											tip: effectiveTip,
											shipping_mode: deliveryMode,
											item_source: effectiveSource,
											seller_id: quoteSellerId,
											shipping_country: buyer?.country,
											shipping_address: deliveryAddr || undefined,
											shipping_city: buyer?.city,
											shipping_lat: coords.lat,
											shipping_lng: coords.lng,
										} : {}),
									});
									// PayPal's own popup is already opening by this point, so there's no good
									// place to pause for a confirm dialog — disclose via a clear stop instead
									// of silently capturing a different amount than what was shown.
									if (serverAmount != null && Math.abs(Number(serverAmount) - total) > 0.02) {
										setPayError(t("food.checkout.priceChanged", { defaultValue: `Price changed from ${fmt(total, currency, i18n.language)} to ${fmt(serverAmount, currency, i18n.language)} — please try again.` }));
										throw new Error("Price changed");
									}
									return id;
								}}
								onApprove={async (data) => {
									setPayError(null);
									await capturePaypalOrder(data.orderID);
									const u = getUser();
									const buyerId = getAuthUserId() ?? u?.user_id ?? u?.id ?? null;
									let ppOrderId = null;
									let persistFailed = false;
									const fullInstructions = composeFoodDeliveryInstructions({ tipAmount: effectiveTip, deliveryInstructions, cart, vertical });
									if (!buyerId) {
										setPayError(t("food.checkout.paymentOkOrderSaveFailed"));
										return;
									}
									if (deliveryMode === "delivery" && !String(deliveryAddr || "").trim()) {
										setPayError(t("food.checkout.noAddress", { defaultValue: "Delivery address is required." }));
										return;
									}
									let ppCoords = { lat: null, lng: null };
									if (deliveryMode === "delivery") {
										// Best-effort, same as the card path -- the server geocodes and
										// range-checks deliver_location itself.
										ppCoords = await ensureBuyerDeliveryCoords(deliveryAddr);
									}
									if (vendorId && !isProductCheckout) {
										try {
											const coords = ppCoords;
											const res = await createFoodOrder({
												user_id: buyerId,
												vendor_id: vendorId,
												order_status: 'pending',
												total_amount: total,
												item_subtotal: discountedSubtotal,
												vendor_net: parseFloat(sellerNetFromOrderTotal(discountedSubtotal).toFixed(2)),
												delivery_fee: deliveryMode === "pickup" ? 0 : deliveryFee,
												deliver_location: deliveryMode === "pickup" ? null : String(deliveryAddr).trim(),
												delivery_lat: deliveryMode === "pickup" ? null : coords.lat,
												delivery_lng: deliveryMode === "pickup" ? null : coords.lng,
												fulfillment_mode: deliveryMode === "pickup" ? "pickup" : "delivery",
												vendor_type_id: vendorTypeId,
												delivery_instructions: fullInstructions || null,
												scheduled_time: scheduledTime || null,
												...groceryDeliveryWindowPayload(),
												...grocerySubstitutionPayload(),
												...groceryDeliveryPreferencePayload(),
												payment_method: 'PAYPAL',
												tip_amount: effectiveTip,
												promo_code: submittedPromoCode,
												referral_code: checkoutReferralCode(),
												items: effectiveSource === "food" ? commerceItems : undefined,
											});
											ppOrderId = res?.data?.food_order_id ?? res?.food_order_id ?? null;
											if (!ppOrderId) persistFailed = true;
										} catch {
											// PayPal may already be captured; surface save failure so UX matches card path.
											persistFailed = true;
										}
									}
									if (sellerId && isProductCheckout) {
										try {
											const orderResults = await Promise.all(cart.map((item) => createOrder({
												...buildProductOrderPayload({
													item,
													payMethod: 'paypal',
													productTypeId: item?.product_type_id ?? productTypeId,
													deliveryMode,
													deliveryAddr,
													deliveryFee,
													platformFee,
													tax,
													deliveryInstructions: fullInstructions,
													promoCode: submittedPromoCode,
													referralCode: checkoutReferralCode(),
												}),
												ispaid: true,
											})));
											ppOrderId = extractProductOrderId(orderResults[0]);
											if (!ppOrderId) persistFailed = true;
										} catch {
											persistFailed = true;
										}
									} else if (sellerId) {
										try {
											await Promise.all(cart.map(item => createOrder({
												seller_id: sellerId,
												buyer_id: buyerId,
												variation_id: item.variation_id != null ? Number(item.variation_id) : null,
												total: item.price * item.qty,
												qty: item.qty,
												ispaid: true,
												payment_method: 'paypal',
												product_type_id: productTypeId
											})));
										} catch {
											persistFailed = true;
										}
									}
									if (persistFailed || (vendorId && !isProductCheckout && !ppOrderId)) {
										setPayError(t("food.checkout.paymentOkOrderSaveFailed"));
										return;
									}
									onPlaceOrder(ppOrderId, deliveryMode);
								}}
								onError={() => setPayError(t("food.checkout.paypalFailed"))}
							/>
						</div>
					)}
					{payError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginTop: 8 }}>{payError}</p>}
				</div>

				
				<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "16px 18px", marginBottom: 24 }}>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{t("food.checkout.promotions")}</p>
					{suggestedOffer?.offer_title && !promoApplied && (
						<button
							type="button"
							onClick={() => handleApplyCheckoutPromo({ promotionId: suggestedOffer.promotion_id })}
							disabled={promoLoading}
							style={{ width: "100%", marginBottom: 10, textAlign: "left", background: "rgba(217,119,6,0.12)", border: "1px solid rgba(217,119,6,0.35)", borderRadius: 9, padding: "10px 12px", cursor: promoLoading ? "default" : "pointer" }}
						>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#d97706", margin: 0 }}>{suggestedOffer.offer_title}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, margin: "4px 0 0" }}>Tap to apply</p>
						</button>
					)}
					<div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
						<input value={promo} onChange={e => { setPromo(e.target.value); setPromoApplied(false); setPromoDiscount(null); setPromoError(null); }} placeholder={t("food.checkout.promoCodeShort")} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, borderRadius: 9, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", caretColor: "#2563eb" }} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
						<button type="button" onClick={() => handleApplyCheckoutPromo()} disabled={promoLoading || promoApplied} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: promoApplied ? "rgba(16,185,129,0.15)" : "rgba(37,99,235,0.15)", border: `1px solid ${promoApplied ? "rgba(16,185,129,0.35)" : "rgba(37,99,235,0.3)"}`, borderRadius: 9, color: promoApplied ? "#10b981" : "#2563eb", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: "10px 16px", cursor: promoApplied ? "default" : "pointer", opacity: promoLoading ? 0.6 : 1 }}>{promoLoading ? t("food.checkout.applying") : promoApplied ? <><CheckIcon s={14} />{t("food.checkout.applied")}</> : t("food.checkout.apply")}</button>
					</div>
					{promoApplied && promoDiscount && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#10b981", margin: "0 0 10px" }}>{promoDiscount.label}</p>}
					{promoError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#ef4444", margin: "0 0 10px" }}>{promoError}</p>}
					<div style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 12 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 8 }}>{t("food.checkout.addReferral")}</p>
						<div style={{ display: "flex", gap: 8 }}>
							<input value={refCode} onChange={e => { setRefCode(e.target.value); setRefApplied(false); setRefError(null); }} placeholder={t("food.checkout.referralPlaceholder")} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, borderRadius: 9, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", caretColor: "#2563eb" }} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
							<button onClick={async () => { if (!refCode.trim() || refLoading || refApplied) return; setRefLoading(true); setRefError(null); try { await bindCheckoutReferralCode(refCode.trim()); setRefApplied(true); } catch (e) { setRefError(e?.response?.data?.message || t("food.checkout.invalidReferral")); } finally { setRefLoading(false); } }} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: refApplied ? "rgba(16,185,129,0.15)" : "rgba(37,99,235,0.15)", border: `1px solid ${refApplied ? "rgba(16,185,129,0.35)" : "rgba(37,99,235,0.3)"}`, borderRadius: 9, color: refApplied ? "#10b981" : "#2563eb", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: "10px 16px", cursor: refLoading ? "default" : "pointer", whiteSpace: "nowrap" }}>{refLoading ? t("food.checkout.applying") : refApplied ? <><CheckIcon s={14} />{t("food.checkout.referralApplied")}</> : t("food.checkout.apply")}</button>
						</div>
						{refError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginTop: 6 }}>{refError}</p>}
					</div>
				</div>

				{payMethod !== "paypal" && (
					<button onClick={handlePlaceOrder} disabled={payProcessing || !!shippingQuoteError || (deliveryMode === "delivery" && !driversAvailable)} style={{ width: "100%", padding: "15px", background: payProcessing ? "rgba(37,99,235,0.5)" : (shippingQuoteError || (deliveryMode === "delivery" && !driversAvailable)) ? "var(--color-border)" : "#2563eb", border: "none", borderRadius: 12, color: (shippingQuoteError || (deliveryMode === "delivery" && !driversAvailable)) ? "var(--color-text-muted)" : "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: (payProcessing || shippingQuoteError || (deliveryMode === "delivery" && !driversAvailable)) ? "default" : "pointer" }}>
						{payProcessing ? t("food.checkout.processing") : t("food.checkout.placeOrder", { total: fmt(total, currency, i18n.language) })}
					</button>
				)}
				</div>
			</div>
			{priceChange && (
				<PriceChangeModal
					oldAmount={priceChange.oldAmount}
					newAmount={priceChange.newAmount}
					currency={currency}
					onConfirm={() => { priceChange.resolve(true); setPriceChange(null); }}
					onCancel={() => { priceChange.resolve(false); setPriceChange(null); }}
				/>
			)}
		</div>
	);
}

const ORDER_STATUS_STAGE = {
	pending: 0,
	confirmed: 0,
	preparing: 1,
	ready_for_pickup: 2,
	picked_up: 3,
	delivered: 3,
	dispatched: 2,
	out_for_delivery: 2,
};

const ORDER_STATUS_STAGE_DELIVERY = {
	pending: 0,
	confirmed: 0,
	preparing: 1,
	ready_for_pickup: 1,
	picked_up: 2,
	dispatched: 2,
	out_for_delivery: 2,
	delivered: 3,
};

const TRACKING_ICON_CONFIRMED = <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const TRACKING_ICON_PREP = <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>;
const TRACKING_ICON_READY = <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>;
const TRACKING_ICON_DONE = <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
const TRACKING_ICON_TRANSIT = <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
const TRACKING_ICON_DELIVERED = <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>;
const TRACKING_PICKUP_ICONS = [TRACKING_ICON_CONFIRMED, TRACKING_ICON_PREP, TRACKING_ICON_READY, TRACKING_ICON_DONE];
const TRACKING_DELIVERY_ICONS = [TRACKING_ICON_CONFIRMED, TRACKING_ICON_PREP, TRACKING_ICON_TRANSIT, TRACKING_ICON_DELIVERED];

function FoodTrackingPage({ restaurant, orderId, deliveryMode: deliveryModeProp = "delivery", onDone, onBack, merchantType = "restaurant" }) {
	const { isMobile } = useViewport();
	const { t } = useTranslation();
	const [stage, setStage] = useState(0);
	// Prefer the live order's fulfillment_mode (survives reload) over the checkout prop/session.
	const [deliveryMode, setDeliveryMode] = useState(deliveryModeProp === "pickup" ? "pickup" : "delivery");
	useEffect(() => {
		setDeliveryMode(deliveryModeProp === "pickup" ? "pickup" : "delivery");
	}, [deliveryModeProp]);
	const [showRateModal, setShowRateModal] = useState(false);
	const [restaurantRating, setRestaurantRating] = useState(0);
	const [driverRating, setDriverRating] = useState(0);
	const [ratingComment, setRatingComment] = useState("");
	const [rated, setRated] = useState(false);
	const [ratingSubmitting, setRatingSubmitting] = useState(false);
	const [ratingError, setRatingError] = useState("");

	const [liveETA, setLiveETA] = useState(25);
	const [, setChatMessages] = useState([]);
	const [driverLoc, setDriverLoc] = useState(null);   // live courier GPS during delivery
	const [driverInfo, setDriverInfo] = useState(null); // { name, photo } of the assigned courier
	// Proof-of-delivery code the courier needs at handoff — generated server-side on pickup
	// (routes/food-routes.js PATCH /orders/:id/picked-up) and pushed to the customer only, never
	// to the driver. Previously never surfaced on this screen, so the customer had no way to give
	// it to the courier.
	const [orderOtp, setOrderOtp] = useState(null);
	const [orderSummary, setOrderSummary] = useState(null); // { items, total, deliveryFee, tipAmount }
	const [showCancelConfirm, setShowCancelConfirm] = useState(false);
	const [cancelling, setCancelling] = useState(false);
	const [cancelError, setCancelError] = useState(false);
	const [liveOrderStatus, setLiveOrderStatus] = useState(null);
	const [scheduledAt, setScheduledAt] = useState(null);
	const [deliveryTelemetry, setDeliveryTelemetry] = useState(null);
	const [rescheduleStart, setRescheduleStart] = useState("");
	const [rescheduleEnd, setRescheduleEnd] = useState("");
	const [rescheduleNote, setRescheduleNote] = useState("");
	const [rescheduleBusy, setRescheduleBusy] = useState(false);
	const [rescheduleMessage, setRescheduleMessage] = useState("");
	const [rescheduleError, setRescheduleError] = useState("");

	// The buyer's delivery destination — the fixed point the courier heads to. Resolved in
	// priority order so the map ALWAYS matches the address the customer actually chose:
	//   1. flat strug_user_lat/lng keys (written the instant an address is confirmed)
	//   2. the strug_user_location JSON blob (same source, alternate shape)
	//   3. geocoding the order's own deliver_location text (see the effect below) — this is what
	//      keeps the pin correct after a reload or on another device, where localStorage is empty.
	// Previously this read stale coordinates left over from a prior address, producing the
	// classic "Lahore address, Islamabad map" mismatch.
	const [buyerCoords, setBuyerCoords] = useState(() => {
		const c = readBuyerDeliveryCoords();
		if (c.lat != null && c.lng != null) return c;
		try {
			const loc = JSON.parse(getLocationItem("strug_user_location") || "null");
			const lat = parseFiniteNumber(loc?.lat);
			const lng = parseFiniteNumber(loc?.lng);
			if (lat != null && lng != null) return { lat, lng };
		} catch { /* unreadable cache — fall through to geocoding */ }
		return null;
	});
	// Delivery address text captured from the order poll, used only as the geocoding fallback.
	const [deliverAddress, setDeliverAddress] = useState(null);

	// Geocode the order's delivery address when no stored coordinates exist (reload / new device),
	// so the destination pin still lands on the right city instead of falling back to a default.
	useEffect(() => {
		if (buyerCoords || !deliverAddress) return undefined;
		let cancelled = false;
		loadGoogleMaps().then((maps) => {
			if (cancelled || !maps?.Geocoder) return;
			new maps.Geocoder().geocode({ address: deliverAddress }, (results, status) => {
				if (cancelled) return;
				if (status === "OK" && results?.[0]?.geometry?.location) {
					const g = results[0].geometry.location;
					setBuyerCoords({ lat: g.lat(), lng: g.lng() });
				}
			});
		}).catch(() => { /* geocoding is best-effort */ });
		return () => { cancelled = true; };
	}, [buyerCoords, deliverAddress]);

	const isProductMerchant = merchantType === "seller";
	const isCatererMerchant = merchantType === "caterer";
	// Courier map only for food-family courier drops. Caterers fulfill the venue themselves.
	const liveTrackingActive = deliveryMode !== "pickup" && !!buyerCoords && !isCatererMerchant;
	// Ship-by-seller / product shop / catering have no courier — don't require a driver score.
	const needsDriverRating =
		!isProductMerchant && !isCatererMerchant && deliveryMode !== "pickup" && deliveryMode !== "ship_by_seller";
	const canSubmitRating =
		restaurantRating > 0 && (!needsDriverRating || driverRating > 0);

	useEffect(() => {
		if (!orderId) return;
		const s = connectSocket();
		const foodEvent = `order-status-update-${orderId}`;
		const productEvent = `order-status-${orderId}`;

		const applyStatus = (payload) => {
			const { order_status, status } = payload;
			const rawStatus = String(order_status ?? status ?? "")
				.toLowerCase()
				.replace(/\s+/g, "_");
			const stageMap = deliveryMode === "pickup" ? ORDER_STATUS_STAGE : ORDER_STATUS_STAGE_DELIVERY;
			let newStage = isProductMerchant
				? productOrderStatusToStage(rawStatus)
				: stageMap[rawStatus];
			if (newStage === undefined && order_status) {
				newStage = stageMap[String(order_status).toLowerCase().replace(/\s+/g, "_")];
			}
			if (newStage !== undefined) setStage(newStage);
			if (rawStatus) setLiveOrderStatus(rawStatus);
			// Capture the assigned courier's identity when the backend includes it.
			const name = payload.driver_name ?? payload.courier_name;
			const photo = payload.driver_photo ?? payload.driver_profile_pic_url ?? payload.courier_photo;
			if (name || photo) setDriverInfo((prev) => ({ name: name ?? prev?.name, photo: photo ?? prev?.photo }));
			// order-update-${orderId} carries the fresh OTP the instant it's generated (picked-up).
			if (payload.otp) setOrderOtp(String(payload.otp));
			if (Array.isArray(payload.grocery_substitutions)) {
				setOrderSummary((prev) => ({
					...(prev || {}),
					substitutions: payload.grocery_substitutions,
				}));
			}
			if (
				payload.driver_location ||
				payload.delivery_failure ||
				payload.delivery_timeline ||
				payload.handling_labels ||
				payload.route_progress ||
				payload.sla_metrics ||
				payload.scheduled_dispatch ||
				payload.safety_controls ||
				payload.eta_confidence ||
				payload.customer_visibility ||
				payload.delivery_preference ||
				payload.delivery_delay_reason ||
				payload.delivery_failure_resolution ||
				payload.delivery_proof_requirements ||
				payload.delivery_reschedule_request ||
				payload.driver_wait_compensation ||
				payload.eta_to_store_minutes != null
			) {
				setDeliveryTelemetry((prev) => ({
					...(prev || {}),
					driverLocation: payload.customer_driver_location ?? payload.driver_location ?? prev?.driverLocation ?? null,
					deliveryFailure: payload.delivery_failure ?? prev?.deliveryFailure ?? null,
					timeline: Array.isArray(payload.delivery_timeline) ? payload.delivery_timeline : (prev?.timeline || []),
					handlingLabels: Array.isArray(payload.handling_labels) ? payload.handling_labels : (prev?.handlingLabels || []),
					routeProgress: payload.route_progress ?? prev?.routeProgress ?? null,
					slaMetrics: payload.sla_metrics ?? prev?.slaMetrics ?? null,
					scheduledDispatch: payload.scheduled_dispatch ?? prev?.scheduledDispatch ?? null,
					safetyControls: payload.safety_controls ?? prev?.safetyControls ?? null,
					etaConfidence: payload.eta_confidence ?? prev?.etaConfidence ?? null,
					customerVisibility: payload.customer_visibility ?? prev?.customerVisibility ?? null,
					deliveryPreference: payload.delivery_preference ?? prev?.deliveryPreference ?? null,
					deliveryDelayReason: payload.delivery_delay_reason ?? prev?.deliveryDelayReason ?? null,
					deliveryFailureResolution: payload.delivery_failure_resolution ?? prev?.deliveryFailureResolution ?? null,
					deliveryProofRequirements: payload.delivery_proof_requirements ?? prev?.deliveryProofRequirements ?? null,
					deliveryRescheduleRequest: payload.delivery_reschedule_request ?? prev?.deliveryRescheduleRequest ?? null,
					driverWaitCompensation: payload.driver_wait_compensation ?? prev?.driverWaitCompensation ?? null,
					etaToStoreMinutes: payload.eta_to_store_minutes ?? prev?.etaToStoreMinutes ?? null,
					etaToCustomerMinutes: payload.eta_to_customer_minutes ?? prev?.etaToCustomerMinutes ?? null,
					arrivingSoon: Boolean(payload.arriving_soon ?? prev?.arrivingSoon),
				}));
			}
		};

		// Live courier GPS while out for delivery — drives the tracking map's moving marker.
		// NOTE (backend audit, Jul 2026): food/groceries do NOT emit a location broadcast yet —
		// only order-accepted-${id} and order-status-update-${id}. `driver-location` is an INBOUND
		// rideshare handler server-side, not an outbound event, so this listener will not fire until
		// a food courier GPS lane exists (rideshare uses driver-location-updated, courier uses
		// courier-location-${orderId}). Until then the map still renders the destination + route and
		// the stage advances from order-status-update; only the moving marker is absent. Point this
		// at whatever event the food lane ends up emitting.
		const onDriverLocation = (d) => {
			const lat = d?.lat ?? d?.current_lat ?? d?.latitude;
			const lng = d?.lng ?? d?.current_long ?? d?.longitude;
			if (lat != null && lng != null) setDriverLoc({ lat: Number(lat), lng: Number(lng), lastKnown: Boolean(d?.last_known) });
		};

		s.on(foodEvent, applyStatus);
		s.on(productEvent, applyStatus);
		s.on(`order-update-${orderId}`, applyStatus);
		s.on('driver-location', onDriverLocation);
		s.on(`food-driver-location-${orderId}`, onDriverLocation);
		s.on(`order-chat-${orderId}`, (msg) => {
			if (deliveryMode !== "pickup") {
				setChatMessages(prev => [...prev, { from: msg.from ?? "Driver", text: msg.text, id: Date.now() }]);
			}
		});
		return () => {
			s.off(foodEvent, applyStatus);
			s.off(productEvent, applyStatus);
			s.off(`order-update-${orderId}`, applyStatus);
			s.off('driver-location', onDriverLocation);
			s.off(`food-driver-location-${orderId}`, onDriverLocation);
			s.off(`order-chat-${orderId}`);
		};
	}, [orderId, deliveryMode, isProductMerchant]);

	useEffect(() => {
		if (!orderId || isProductMerchant) return;
		let mounted = true;
		const poll = () => {
			Promise.allSettled([getFoodOrder(orderId), getFoodOrderDeliveryLocation(orderId)]).then((results) => {
				if (!mounted) return;
				const orderData = results[0]?.status === "fulfilled" ? results[0].value : null;
				const telemetryData = results[1]?.status === "fulfilled" ? results[1].value : null;
				const order = orderData?.data ?? orderData;
				if (!order) return;
				// Authoritative fulfillment from the order row — keeps Self-Pickup vs Delivery
				// correct after reload even if sessionStorage was cleared.
				const mode = String(order?.fulfillment_mode || "").toLowerCase();
				const loc = String(order?.deliver_location || "").trim();
				if (mode === "pickup" || loc === "__SELF_PICKUP__") setDeliveryMode("pickup");
				else if (mode === "delivery") setDeliveryMode("delivery");
				// Feed the geocoding fallback so the map can recover the destination from the
				// order itself when localStorage has no coordinates (reload / different device).
				if (order?.deliver_location && loc !== "__SELF_PICKUP__") setDeliverAddress(order.deliver_location);
				if (order?.scheduled_time) setScheduledAt(order.scheduled_time);
				const effectivePickup = mode === "pickup" || loc === "__SELF_PICKUP__" || deliveryMode === "pickup";
				const raw = String(order?.order_status ?? "").toLowerCase().replace(/\s+/g, "_");
				const stageMap = effectivePickup ? ORDER_STATUS_STAGE : ORDER_STATUS_STAGE_DELIVERY;
				const newStage = stageMap[raw];
				if (newStage !== undefined) setStage(newStage);
				if (raw) setLiveOrderStatus(raw);
				// Poll fallback for the OTP too — a page reload after pickup would otherwise lose it
				// (the socket-only capture above only fires for a live connection at the exact moment
				// it's generated). Once delivered, the backend clears otp_code — keep showing the last
				// known value rather than blanking it mid-transition. Self-pickup never mints an OTP.
				if (!effectivePickup && order?.otp_code) setOrderOtp(String(order.otp_code));
				setOrderSummary({
					items: Array.isArray(order?.food_order_items) ? order.food_order_items : [],
					total: order?.total_amount ?? null,
					deliveryFee: order?.delivery_fee ?? null,
					tipAmount: order?.tip_amount ?? null,
					paymentMethod: order?.payment_method ?? null,
					orderFlow: order?.order_flow ?? null,
					substitutions: Array.isArray(order?.grocery_substitutions) ? order.grocery_substitutions : [],
					deliveryWindowStart: order?.delivery_window_start ?? null,
					deliveryWindowEnd: order?.delivery_window_end ?? null,
					deliveryProofAt: order?.delivery_proof_at ?? null,
					status: raw,
				});
				// Prefer server truth: if this order already has a rating, hide the rate CTA.
				const existing = order?.rating ?? order?.food_order_rating ?? order?.order_rating;
				if (existing != null && (existing === true || Number(existing?.rating ?? existing) > 0)) {
					setRated(true);
				}
				const telemetry = telemetryData?.data ?? null;
				if (telemetry) {
					setDeliveryTelemetry({
						driverLocation: telemetry.customer_driver_location ?? telemetry.driver_location ?? null,
						deliveryFailure: telemetry.delivery_failure ?? null,
						timeline: Array.isArray(telemetry.delivery_timeline) ? telemetry.delivery_timeline : [],
						handlingLabels: Array.isArray(telemetry.handling_labels) ? telemetry.handling_labels : [],
						routeProgress: telemetry.route_progress ?? null,
						slaMetrics: telemetry.sla_metrics ?? null,
						scheduledDispatch: telemetry.scheduled_dispatch ?? null,
						safetyControls: telemetry.safety_controls ?? null,
						etaConfidence: telemetry.eta_confidence ?? null,
						customerVisibility: telemetry.customer_visibility ?? null,
						deliveryPreference: telemetry.delivery_preference ?? null,
						deliveryDelayReason: telemetry.delivery_delay_reason ?? null,
						deliveryFailureResolution: telemetry.delivery_failure_resolution ?? null,
						deliveryProofRequirements: telemetry.delivery_proof_requirements ?? null,
						deliveryRescheduleRequest: telemetry.delivery_reschedule_request ?? null,
						driverWaitCompensation: telemetry.driver_wait_compensation ?? null,
						etaToStoreMinutes: telemetry.eta_to_store_minutes ?? null,
						etaToCustomerMinutes: telemetry.eta_to_customer_minutes ?? null,
						arrivingSoon: Boolean(telemetry.arriving_soon),
					});
					const loc = telemetry.customer_driver_location ?? telemetry.driver_location;
					if (loc?.lat != null && loc?.lng != null) {
						const lat = Number(loc.lat);
						const lng = Number(loc.lng);
						if (Number.isFinite(lat) && Number.isFinite(lng)) {
							setDriverLoc({ lat, lng, lastKnown: Boolean(loc.last_known) });
						}
					}
					if (telemetry.eta_to_store_minutes != null) {
						const eta = Number(telemetry.eta_to_store_minutes);
						setLiveETA(Number.isFinite(eta) ? eta : null);
					}
				}
			}).catch(() => {});
		};
		poll();
		const timer = setInterval(poll, 8000);
		return () => { mounted = false; clearInterval(timer); };
	}, [orderId, deliveryMode, isProductMerchant]);

	useEffect(() => {
		if (!orderId || !isProductMerchant) return;
		let mounted = true;
		const poll = () => {
			getProductOrder(orderId).then((data) => {
				if (!mounted) return;
				const order = data?.data ?? data;
				const newStage = productOrderStatusToStage(order?.status);
				if (newStage !== undefined) setStage(newStage);
			}).catch(() => {});
		};
		poll();
		const timer = setInterval(poll, 30000);
		return () => { mounted = false; clearInterval(timer); };
	}, [orderId, isProductMerchant]);

	
	useEffect(() => {
		if (stage !== 2) return undefined;
		// Self-pickup used to jump to "Collected" on a 15s timer, which told the customer they
		// had picked the order up 15 seconds after the store marked it ready. The vendor now
		// has a real signal -- PATCH /food/orders/:id/picked-up -- and the poll above maps
		// picked_up to stage 3, so let the actual status drive it.
		if (deliveryMode === "pickup") return undefined;
		if (isCatererMerchant) return undefined;
		// When the real courier map is on screen, the order's progress and ETA come from the
		// backend (status socket) and the live route (onEta). The legacy simulation below would
		// fight both: it force-called setStage(3) after ~37.5s — marking the order "delivered"
		// regardless of where the courier actually is — and overwrote liveETA every 1.5s, racing
		// the real value. So it only runs for the no-coords fallback UI.
		if (liveTrackingActive) return undefined;
		// Progress comes from elapsed time rather than an accumulating counter so the pin can't
		// drift, and the run resets on teardown instead of synchronously inside the effect.
		const startedAt = Date.now();
		const interval = setInterval(() => {
			const nextProgress = Math.min(100, Math.floor((Date.now() - startedAt) / 1500) * 4);
			setLiveETA(Math.max(1, Math.round(20 * (1 - nextProgress / 100))));
			if (nextProgress >= 100) {
				clearInterval(interval);
				setStage(3);
			}
		}, 1500);
		return () => {
			clearInterval(interval);
		};
	}, [stage, deliveryMode, liveTrackingActive, isCatererMerchant]);

	// Only valid while stage === 0 (pending/confirmed) — matches the backend's own guard
	// (PATCH /orders/:id/cancel 409s once the vendor starts preparing).
	const handleCancelOrder = () => {
		if (!orderId) return;
		setCancelling(true);
		setCancelError(false);
		cancelFoodOrder(orderId).then(() => {
			onDone?.();
		}).catch(() => {
			setCancelling(false);
			setShowCancelConfirm(false);
			setCancelError(true);
			setTimeout(() => setCancelError(false), 6000);
		});
	};

	const handleRescheduleDelivery = async () => {
		if (!orderId || !rescheduleStart) return;
		setRescheduleBusy(true);
		setRescheduleError("");
		setRescheduleMessage("");
		try {
			const start = new Date(rescheduleStart);
			const end = rescheduleEnd ? new Date(rescheduleEnd) : new Date(start.getTime() + 60 * 60000);
			if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
				throw new Error(t("food.tracking.rescheduleInvalid", { defaultValue: "Choose a valid delivery window." }));
			}
			const updated = await rescheduleGroceryDelivery(orderId, {
				delivery_window_start: start.toISOString(),
				delivery_window_end: end.toISOString(),
				note: rescheduleNote,
			});
			const order = updated?.data ?? updated;
			setOrderSummary((prev) => ({
				...(prev || {}),
				deliveryWindowStart: order?.delivery_window_start ?? start.toISOString(),
				deliveryWindowEnd: order?.delivery_window_end ?? end.toISOString(),
				status: String(order?.order_status || prev?.status || "").toLowerCase().replace(/\s+/g, "_"),
			}));
			setDeliveryTelemetry((prev) => ({
				...(prev || {}),
				deliveryRescheduleRequest: order?.delivery_reschedule_request ?? {
					status: "applied",
					new_window_start: start.toISOString(),
					new_window_end: end.toISOString(),
				},
				scheduledDispatch: order?.scheduled_dispatch ?? prev?.scheduledDispatch ?? null,
			}));
			setRescheduleStart("");
			setRescheduleEnd("");
			setRescheduleNote("");
			setRescheduleMessage(t("food.tracking.rescheduleSaved", { defaultValue: "Delivery window updated before packing starts." }));
		} catch (err) {
			setRescheduleError(
				err?.response?.data?.message
				|| err?.message
				|| t("food.tracking.rescheduleError", { defaultValue: "Couldn't reschedule delivery." }),
			);
		} finally {
			setRescheduleBusy(false);
		}
	};

	const getStageInfo = () => {
		const merchant = ["caterer", "florist", "store", "seller", "restaurant"].includes(merchantType) ? merchantType : "restaurant";
		const modeKey = deliveryMode === "pickup" ? "pickup" : "delivery";
		const icons = modeKey === "pickup" ? TRACKING_PICKUP_ICONS : TRACKING_DELIVERY_ICONS;
		const stageData = t(`food.tracking.stages.${merchant}.${modeKey}`, { returnObjects: true });
		if (!Array.isArray(stageData)) return [];
		return stageData.map((s, i) => {
			const waitingForCourier =
				modeKey === "delivery" &&
				!isCatererMerchant &&
				i === 1 &&
				(liveOrderStatus === "ready_for_pickup" || liveOrderStatus === "ready");
			return {
				label: waitingForCourier
					? t("food.tracking.readyWaitingCourier", { defaultValue: "Ready — waiting for courier" })
					: s.label,
				desc: waitingForCourier
					? t("food.tracking.readyWaitingCourierDesc", {
						defaultValue: "Your order is ready at the restaurant. A courier will collect it shortly.",
					})
					: s.desc,
				icon: icons[i] ?? icons[0],
			};
		});
	};
	const stages = getStageInfo();
	const merchantKey = ["caterer", "florist", "store", "seller", "restaurant"].includes(merchantType) ? merchantType : "restaurant";
	const handlingLabels = Array.isArray(deliveryTelemetry?.handlingLabels) ? deliveryTelemetry.handlingLabels : [];
	const driverLastKnown = Boolean(deliveryTelemetry?.driverLocation?.lastKnown);
	const deliveryFailure = deliveryTelemetry?.deliveryFailure;
	const routeProgress = deliveryTelemetry?.routeProgress;
	const slaMetrics = deliveryTelemetry?.slaMetrics;
	const scheduledDispatch = deliveryTelemetry?.scheduledDispatch;
	const safetyControls = deliveryTelemetry?.safetyControls;
	const etaConfidence = deliveryTelemetry?.etaConfidence;
	const customerVisibility = deliveryTelemetry?.customerVisibility;
	const deliveryPreference = deliveryTelemetry?.deliveryPreference;
	const deliveryDelayReason = deliveryTelemetry?.deliveryDelayReason;
	const deliveryFailureResolution = deliveryTelemetry?.deliveryFailureResolution;
	const deliveryProofRequirements = deliveryTelemetry?.deliveryProofRequirements;
	const deliveryRescheduleRequest = deliveryTelemetry?.deliveryRescheduleRequest;
	const isGroceryTracking = String(orderSummary?.orderFlow || "").toLowerCase() === "grocery";
	const canRescheduleDelivery =
		isGroceryTracking
		&& deliveryMode !== "pickup"
		&& ["pending", "confirmed", ""].includes(String(orderSummary?.status || "").toLowerCase())
		&& stage === 0;
	const progressPercent = Number(routeProgress?.percent);
	const slaRows = [
		["Store accepted", slaMetrics?.store_accept_minutes],
		["Packing", slaMetrics?.packing_minutes],
		["Driver wait", slaMetrics?.driver_wait_minutes ?? slaMetrics?.current_wait_minutes],
		["Delivery", slaMetrics?.delivery_minutes],
	].filter(([, value]) => Number.isFinite(Number(value)));
	const formatTelemetryLabel = (value) => String(value || "").replace(/_/g, " ");
	const proofTypes = Array.isArray(deliveryProofRequirements?.allowed_types) ? deliveryProofRequirements.allowed_types : [];

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, animation: "fadeUp 0.3s ease both", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 640, margin: "0 auto", width: "100%", paddingTop: 40, paddingBottom: 24 }}>
				{onBack && (
				<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, padding: 0, marginBottom: 20 }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg> {t("food.tracking.backToShop")}
				</button>
			)}
			<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 36, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{t("food.tracking.title")}</h1>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 20 }}>{restaurant?.name ?? t("food.tracking.defaultVendor")}</p>

				{deliveryMode !== "pickup" && !isCatererMerchant && orderOtp && stage >= 2 && stage < stages.length - 1 && (
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", marginBottom: 20, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 12 }}>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
							{t("food.tracking.deliveryCode", { defaultValue: "Give this code to your courier" })}
						</p>
						<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "0.25em", color: "#fbbf24" }}>{orderOtp}</span>
					</div>
				)}

				{deliveryMode !== "pickup" && !isCatererMerchant && !orderOtp && stage >= 1 && stage < 2 && (
					<div style={{ padding: "12px 16px", marginBottom: 20, background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.28)", borderRadius: 12 }}>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: "rgba(255,255,255,0.75)", margin: 0, lineHeight: 1.45 }}>
							{t("food.tracking.otpWaitingHint", {
								defaultValue: "Your courier code will appear here after the driver marks the order as picked up from the restaurant. You will then give that code to the courier at your door.",
							})}
						</p>
					</div>
				)}

				{orderSummary && orderSummary.items.length > 0 && (
					<div style={{ padding: "14px 16px", marginBottom: 28, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>
							{t("food.tracking.orderDetails", { defaultValue: "Order details" })}
						</p>
						<div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
							{orderSummary.items.map((it) => (
								<div key={it.food_order_detail_id ?? `${it.food_item_id}-${it.qty}`} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.85)" }}>{it.qty}× {it.food_item?.name ?? t("food.tracking.item", { defaultValue: "Item" })}</span>
									{it.price_item != null && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{fmt(it.price_item * (it.qty || 1), undefined, i18n.language)}</span>}
								</div>
							))}
						</div>
						{orderSummary.total != null && (
							<div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#fff" }}>{t("food.tracking.total", { defaultValue: "Total" })}</span>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#fff" }}>{fmt(orderSummary.total, undefined, i18n.language)}</span>
							</div>
						)}
					</div>
				)}

				{canRescheduleDelivery && (
					<div style={{ padding: "14px 16px", marginBottom: 24, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(96,165,250,0.22)", borderRadius: 12 }}>
						<div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap" }}>
							<div>
								<p style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 900, color: "#bfdbfe", textTransform: "uppercase", letterSpacing: "0.08em" }}>
									{t("food.tracking.rescheduleDelivery", { defaultValue: "Reschedule delivery" })}
								</p>
								<p style={{ margin: "4px 0 0", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.58)" }}>
									{t("food.tracking.rescheduleBeforePacking", { defaultValue: "Available until the store starts packing." })}
								</p>
							</div>
							{deliveryRescheduleRequest?.status && (
								<span style={{ padding: "5px 9px", borderRadius: 999, background: "rgba(34,197,94,0.14)", color: "#bbf7d0", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 900 }}>
									{formatTelemetryLabel(deliveryRescheduleRequest.status)}
								</span>
							)}
						</div>
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 10 }}>
							<input type="datetime-local" value={rescheduleStart} onChange={(e) => setRescheduleStart(e.target.value)} style={{ width: "100%", minWidth: 0, boxSizing: "border-box", padding: "11px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.26)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }} />
							<input type="datetime-local" value={rescheduleEnd} onChange={(e) => setRescheduleEnd(e.target.value)} style={{ width: "100%", minWidth: 0, boxSizing: "border-box", padding: "11px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.26)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }} />
							<input type="text" value={rescheduleNote} onChange={(e) => setRescheduleNote(e.target.value)} maxLength={500} placeholder={t("food.tracking.rescheduleNote", { defaultValue: "Optional note" })} style={{ gridColumn: isMobile ? "auto" : "1 / -1", width: "100%", minWidth: 0, boxSizing: "border-box", padding: "11px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.26)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }} />
						</div>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
							<p style={{ margin: 0, flex: "1 1 220px", color: rescheduleError ? "#fca5a5" : "#bbf7d0", fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
								{rescheduleError || rescheduleMessage || (deliveryRescheduleRequest?.new_window_start ? `${t("food.tracking.lastReschedule", { defaultValue: "Last update" })}: ${new Date(deliveryRescheduleRequest.new_window_start).toLocaleString()}` : "")}
							</p>
							<button type="button" onClick={handleRescheduleDelivery} disabled={!rescheduleStart || rescheduleBusy} style={{ flex: isMobile ? "1 1 100%" : "0 0 auto", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(96,165,250,0.35)", background: rescheduleStart && !rescheduleBusy ? "#2563eb" : "rgba(37,99,235,0.25)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 800, cursor: rescheduleStart && !rescheduleBusy ? "pointer" : "default" }}>
								{rescheduleBusy ? t("common.loading", { defaultValue: "Loading…" }) : t("food.tracking.updateWindow", { defaultValue: "Update window" })}
							</button>
						</div>
					</div>
				)}

				{!isProductMerchant && orderId && stage === 0 && (
					<div style={{ marginBottom: 24 }}>
						{cancelError && (
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: "#f87171", marginBottom: 10 }}>
								{t("food.tracking.cancelError", { defaultValue: "Couldn't cancel — the restaurant may have already started preparing your order." })}
							</p>
						)}
						{showCancelConfirm ? (
							<div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 12 }}>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.75)", flex: 1 }}>{t("food.tracking.cancelConfirm", { defaultValue: "Cancel this order?" })}</span>
								<button onClick={() => setShowCancelConfirm(false)} disabled={cancelling} style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 700, cursor: cancelling ? "default" : "pointer" }}>{t("food.tracking.keepOrder", { defaultValue: "Keep order" })}</button>
								<button onClick={handleCancelOrder} disabled={cancelling} style={{ padding: "7px 14px", borderRadius: 8, background: "#dc2626", border: "none", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 700, cursor: cancelling ? "default" : "pointer", opacity: cancelling ? 0.6 : 1 }}>{cancelling ? t("food.tracking.cancelling", { defaultValue: "Cancelling…" }) : t("food.tracking.yesCancel", { defaultValue: "Yes, cancel" })}</button>
							</div>
						) : (
							<button onClick={() => setShowCancelConfirm(true)} style={{ background: "none", border: "none", color: "rgba(248,113,113,0.75)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, textDecoration: "underline", textUnderlineOffset: 3 }}>
								{t("food.tracking.cancelOrder", { defaultValue: "Cancel order" })}
							</button>
						)}
					</div>
				)}

				{(routeProgress || slaRows.length > 0 || scheduledDispatch || safetyControls) && (
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.25fr) minmax(0, 1fr)", gap: 12, marginBottom: 18 }}>
						{routeProgress && (
							<div style={{ padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(37,99,235,0.25)", background: "rgba(37,99,235,0.08)" }}>
								<div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
									<p style={{ margin: 0, color: "#bfdbfe", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
										{routeProgress.arriving_soon ? "Driver arriving soon" : formatTelemetryLabel(routeProgress.state || "delivery progress")}
									</p>
									{Number.isFinite(progressPercent) && (
										<span style={{ color: "rgba(255,255,255,0.78)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 800 }}>
											{Math.max(0, Math.min(100, Math.round(progressPercent)))}%
										</span>
									)}
								</div>
								<div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginBottom: 10 }}>
									<div style={{ width: `${Number.isFinite(progressPercent) ? Math.max(0, Math.min(100, progressPercent)) : 0}%`, height: "100%", borderRadius: 999, background: "#2563eb" }} />
								</div>
								<p style={{ margin: 0, color: "rgba(255,255,255,0.72)", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
									{routeProgress.label || "Delivery status is updating."}
								</p>
								<div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
									{etaConfidence?.label && (
										<span style={{ padding: "5px 8px", borderRadius: 999, background: etaConfidence.level === "delayed" ? "rgba(248,113,113,0.16)" : etaConfidence.level === "at_risk" ? "rgba(245,158,11,0.16)" : "rgba(34,197,94,0.14)", color: etaConfidence.level === "delayed" ? "#fecaca" : etaConfidence.level === "at_risk" ? "#fde68a" : "#bbf7d0", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 900 }}>
											{etaConfidence.label}
										</span>
									)}
									{deliveryTelemetry?.etaToStoreMinutes != null && (
										<span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(255,255,255,0.08)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 800 }}>
											Store ETA {deliveryTelemetry.etaToStoreMinutes} min
										</span>
									)}
									{customerVisibility?.driver_location_precision === "approximate" && (
										<span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.72)", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 800 }}>
											Approximate rider location
										</span>
									)}
									{scheduledDispatch && !scheduledDispatch.ready && (
										<span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(245,158,11,0.14)", color: "#fde68a", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 800 }}>
											Dispatch opens in {scheduledDispatch.minutes_until_dispatch} min
										</span>
									)}
								</div>
								{Array.isArray(etaConfidence?.reasons) && etaConfidence.reasons.length > 0 && (
									<p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.58)", fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, lineHeight: 1.35 }}>
										{etaConfidence.reasons[0]}
									</p>
								)}
							</div>
						)}
						{(slaRows.length > 0 || safetyControls) && (
							<div style={{ padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.035)" }}>
								<p style={{ margin: "0 0 10px", color: "rgba(255,255,255,0.65)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
									Delivery safeguards
								</p>
								{slaRows.length > 0 && (
									<div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
										{slaRows.map(([label, value]) => (
											<div key={label} style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(0,0,0,0.18)" }}>
												<p style={{ margin: 0, color: "rgba(255,255,255,0.48)", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 800 }}>{label}</p>
												<p style={{ margin: "2px 0 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 900 }}>{value} min</p>
											</div>
										))}
									</div>
								)}
								{(safetyControls?.no_contact || safetyControls?.support_escalation || safetyControls?.suspicious_route || slaMetrics?.late) && (
									<p style={{ margin: slaRows.length > 0 ? "10px 0 0" : 0, color: safetyControls?.support_escalation || safetyControls?.suspicious_route ? "#fecaca" : "#bbf7d0", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 700 }}>
										{safetyControls?.support_escalation || safetyControls?.suspicious_route
											? "Support escalation is active for this delivery."
											: slaMetrics?.late
												? "This delivery is running later than the selected window."
												: "No-contact delivery is enabled."}
									</p>
								)}
							</div>
						)}
					</div>
				)}

				{(deliveryPreference || deliveryDelayReason?.reason || deliveryFailureResolution?.action || proofTypes.length > 0) && (
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 18 }}>
						{deliveryPreference?.handoff && (
							<div style={{ padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.035)" }}>
								<p style={{ margin: 0, color: "rgba(255,255,255,0.48)", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
									{t("food.tracking.handoff", { defaultValue: "Handoff" })}
								</p>
								<p style={{ margin: "4px 0 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 900 }}>
									{formatTelemetryLabel(deliveryPreference.handoff)}
								</p>
							</div>
						)}
						{proofTypes.length > 0 && (
							<div style={{ padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.035)" }}>
								<p style={{ margin: 0, color: "rgba(255,255,255,0.48)", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
									{t("food.tracking.deliveryProof", { defaultValue: "Delivery proof" })}
								</p>
								<p style={{ margin: "4px 0 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 900 }}>
									{proofTypes.map(formatTelemetryLabel).join(" / ")}
								</p>
							</div>
						)}
						{deliveryDelayReason?.reason && (
							<div style={{ padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(245,158,11,0.28)", background: "rgba(245,158,11,0.08)" }}>
								<p style={{ margin: 0, color: "#fde68a", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
									{t("food.tracking.delayReason", { defaultValue: "Delay reason" })}
								</p>
								<p style={{ margin: "4px 0 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 900 }}>
									{formatTelemetryLabel(deliveryDelayReason.reason)}
								</p>
							</div>
						)}
						{deliveryFailureResolution?.action && (
							<div style={{ padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(96,165,250,0.25)", background: "rgba(37,99,235,0.08)" }}>
								<p style={{ margin: 0, color: "#bfdbfe", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
									{t("food.tracking.resolution", { defaultValue: "Resolution" })}
								</p>
								<p style={{ margin: "4px 0 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 900 }}>
									{formatTelemetryLabel(deliveryFailureResolution.action)}
								</p>
							</div>
						)}
					</div>
				)}

				{(handlingLabels.length > 0 || deliveryFailure || driverLastKnown) && (
					<div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", borderRadius: 14, border: `1px solid ${deliveryFailure ? "rgba(248,113,113,0.32)" : "rgba(96,165,250,0.22)"}`, background: deliveryFailure ? "rgba(248,113,113,0.08)" : "rgba(37,99,235,0.08)", marginBottom: 18 }}>
						{handlingLabels.length > 0 && (
							<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
								{handlingLabels.map((label) => (
									<span key={label} style={{ padding: "6px 9px", borderRadius: 999, background: "rgba(255,255,255,0.08)", color: "#bfdbfe", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 800, textTransform: "capitalize" }}>
										{formatTelemetryLabel(label)}
									</span>
								))}
							</div>
						)}
						{driverLastKnown && (
							<p style={{ margin: 0, color: "rgba(255,255,255,0.72)", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5 }}>
								{t("food.tracking.lastKnownDriver", { defaultValue: "Driver GPS is temporarily unavailable. Showing the last known location." })}
							</p>
						)}
						{deliveryFailure && (
							<p style={{ margin: 0, color: "#fecaca", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 700 }}>
								{t("food.tracking.deliveryIssue", { defaultValue: "Delivery needs attention" })}: {formatTelemetryLabel(deliveryFailure.reason)}{deliveryFailure.note ? ` - ${deliveryFailure.note}` : ""}
							</p>
						)}
					</div>
				)}

				{liveTrackingActive ? (
					<div style={{ marginBottom: 32 }}>
						<LiveTrackingMap
							live={stage >= 2 ? driverLoc : null}
							destination={buyerCoords}
							accent="#2563eb"
							height={isMobile ? 200 : 240}
							onEta={(m) => { if (m != null) setLiveETA(m); }}
							liveAvatar={driverInfo?.photo}
							liveName={driverInfo?.name}
						/>
					</div>
				) : (
					<div
						className="bg-surface-raised border border-border-subtle"
						style={{ borderRadius: 16, padding: isMobile ? 16 : 20, marginBottom: 32 }}
					>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 6px" }}>
							{isCatererMerchant
								? t("catering.eventWhen", { defaultValue: "Event" })
								: deliveryMode === "pickup" ? t("food.tracking.orderStatus") : t("food.tracking.estimatedArrival")}
						</p>
						<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, fontWeight: 800, margin: "0 0 8px" }}>
							{isCatererMerchant ? (
								scheduledAt
									? new Date(scheduledAt).toLocaleString()
									: t("catering.trackingPending", { defaultValue: "Waiting for the caterer to confirm." })
							) : deliveryMode === "pickup" ? (
								stage === 3 ? t("food.tracking.statusPickedUp") : stage >= 2 ? t("food.tracking.statusReady") : t("food.tracking.statusPreparing")
							) : (
								stage === 3 ? t("food.tracking.statusDelivered") : t("food.tracking.etaMins", { mins: liveETA })
							)}
						</p>
						<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.5, margin: 0 }}>
							{t("food.tracking.noLiveMapHint")}
						</p>
					</div>
				)}

				
				<div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: 32 }}>
					{stages.map((s, i) => (
						<div key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
							<div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
								<div style={{ width: 40, height: 40, borderRadius: "50%", background: i <= stage ? "#2563eb" : "var(--color-surface-raised)", border: `2px solid ${i <= stage ? "#2563eb" : "var(--color-border)"}`, display: "flex", alignItems: "center", justifyContent: "center", color: i <= stage ? "#fff" : "var(--color-text-muted)", transition: "all 0.3s", flexShrink: 0 }}>{s.icon}</div>
								{i < stages.length - 1 && <div style={{ width: 2, height: 32, background: i < stage ? "#2563eb" : "var(--color-border)", transition: "background 0.3s" }} />}
							</div>
							<div style={{ paddingTop: 8, paddingBottom: i < stages.length - 1 ? 24 : 0 }}>
								<p className={i <= stage ? "text-text-primary" : "text-text-muted"} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{s.label}</p>
								{i === stage && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{s.desc}</p>}
							</div>
						</div>
					))}
				</div>

				
				{stage >= 2 && deliveryMode !== "pickup" && orderId && (
					<div style={{ marginBottom: 16 }}>
						<button
							type="button"
							onClick={() => openContextChat("food", orderId).catch(() => {})}
							style={{ width: "100%", padding: "13px", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.35)", borderRadius: 12, color: "#60a5fa", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
						>
							{t("food.tracking.openOrderChat")}
						</button>
					</div>
				)}

				{stage >= stages.length - 1 ? (
					<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
						{!rated && <button onClick={() => setShowRateModal(true)} style={{ width: "100%", padding: "13px", background: "#2563eb", border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{t("food.tracking.rateOrder")}</button>}
						<button onClick={onDone} className="bg-surface border border-border text-text-secondary" style={{ width: "100%", padding: "13px", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{rated ? t("food.tracking.done") : t("food.tracking.skipAndDone")}</button>
					<button onClick={() => window.__nav?.("orders")} className="text-text-secondary" style={{ width: "100%", padding: "6px 0 0", background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>View in Order History &rarr;</button>
					</div>
				) : null}

				
				{showRateModal && (
					<div
						role="dialog"
						aria-modal="true"
						style={{
							position: "fixed",
							inset: 0,
							background: "rgba(0,0,0,0.65)",
							backdropFilter: "blur(6px)",
							// Above Leaflet map panes / LiveTrackingMap chrome (~1000).
							zIndex: 2000,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							padding: 20,
							overflowY: "auto",
							boxSizing: "border-box",
						}}
					>
						<div
							className="bg-surface border border-border"
							style={{
								borderRadius: 20,
								width: "100%",
								maxWidth: 400,
								maxHeight: "88vh",
								display: "flex",
								flexDirection: "column",
								minHeight: 0,
								animation: "fadeUp 0.25s ease both",
								boxSizing: "border-box",
							}}
						>
							<div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "28px 28px 0", boxSizing: "border-box" }}>
								<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 18, textAlign: "center" }}>{t("food.tracking.rateExperience")}</h3>

								<div style={{ marginBottom: 20 }}>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 8, textAlign: "center", fontWeight: 600 }}>{t("food.tracking.rateMerchant", { type: t(`food.tracking.merchantTypes.${merchantKey}`), name: restaurant?.name ?? t("food.tracking.shop") })}</p>
									<div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
										{[1,2,3,4,5].map(n => (
											<button key={n} type="button" onClick={() => setRestaurantRating(n)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
												<svg width={28} height={28} viewBox="0 0 24 24" fill={n <= restaurantRating ? "#f59e0b" : "none"} stroke={n <= restaurantRating ? "#f59e0b" : "var(--color-text-muted)"} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
											</button>
										))}
									</div>
								</div>

								{needsDriverRating && (
									<div style={{ marginBottom: 24 }}>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 8, textAlign: "center", fontWeight: 600 }}>{t("food.tracking.rateDriver")}</p>
										<div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
											{[1,2,3,4,5].map(n => (
												<button key={n} type="button" onClick={() => setDriverRating(n)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
													<svg width={28} height={28} viewBox="0 0 24 24" fill={n <= driverRating ? "#f59e0b" : "none"} stroke={n <= driverRating ? "#f59e0b" : "var(--color-text-muted)"} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
												</button>
											))}
										</div>
									</div>
								)}

								<textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder={t("food.tracking.reviewPlaceholder")} rows={3} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 12 }} />
								{ratingError ? <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", textAlign: "center", marginBottom: 10 }}>{ratingError}</p> : null}
							</div>

							<div style={{ flexShrink: 0, display: "flex", gap: 10, padding: "16px 28px 28px", boxSizing: "border-box" }}>
								<button type="button" onClick={() => { setShowRateModal(false); onDone(); }} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, padding: "11px 0", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{t("food.tracking.skip")}</button>
								<button type="button" disabled={ratingSubmitting || !canSubmitRating} onClick={async () => {
									setRatingError("");
									setRatingSubmitting(true);
									try {
										if (isProductMerchant) {
											const u = getUser();
											const buyerId = u?.id ?? u?.user_id;
											const sellerId = restaurant?.id ?? restaurant?.seller_id;
											if (!buyerId || !sellerId || restaurantRating <= 0) {
												throw new Error(t("food.tracking.rateFailed", { defaultValue: "Couldn't submit rating. Please try again." }));
											}
											await submitProductRating(buildProductRatingPayload({
												sellerId,
												orderId,
												buyerId,
												rating: restaurantRating,
												feedback: ratingComment,
												productTypeId: restaurant?.product_type_id ?? null,
											}));
										} else {
											if (!orderId) throw new Error("Missing order id");
											await submitFoodOrderRating(
												orderId,
												buildFoodOrderRatingPayload({
													rating: restaurantRating,
													comment: ratingComment,
													driverRating: needsDriverRating ? driverRating : undefined,
													deliveryMode,
												}),
											);
										}
										setShowRateModal(false);
										setRated(true);
										setRatingError("");
									} catch (e) {
										const msg = e?.response?.data?.message || e?.message || t("food.tracking.rateFailed", { defaultValue: "Couldn't submit rating. Please try again." });
										setRatingError(String(msg));
									} finally {
										setRatingSubmitting(false);
									}
								}} style={{ flex: 1, padding: "11px 0", background: canSubmitRating ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: canSubmitRating ? "#fff" : "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: canSubmitRating ? "pointer" : "default" }}>{ratingSubmitting ? t("common.loading", { defaultValue: "Loading…" }) : t("food.tracking.submit")}</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

const FOOD_PROMO_DEFS = [
	{ id: "twenty_off", labelKey: "food.landing.promo20Off", subKey: "food.landing.promo20OffSub", color: "#d97706", bg: "linear-gradient(135deg, rgba(217,119,6,0.18), rgba(217,119,6,0.05))" },
	{ id: "fast_delivery", labelKey: "food.landing.promoFastDelivery", subKey: "food.landing.promoFastDeliverySub", color: "#059669", bg: "linear-gradient(135deg, rgba(5,150,105,0.18), rgba(5,150,105,0.05))" },
];

function FoodLocationConfirm({ address, onConfirm, onChange, onBack }) {
	const { t } = useTranslation();
	return (
		<div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px", position: "relative" }}>
			{onBack && <FoodBackButton onClick={onBack} style={{ position: "absolute", top: 24, left: 32 }} />}
			<div className="bg-surface border border-border" style={{ width: "100%", maxWidth: 480, borderRadius: 18, padding: 28, boxShadow: "0 22px 70px var(--color-shadow)", animation: "fadeUp 0.3s ease both" }}>
				<div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(37,99,235,0.14)", border: "1px solid rgba(37,99,235,0.32)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
					<svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
				</div>
				<p style={{ fontFamily: "'DM Sans', sans-serif", color: "#60a5fa", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", textAlign: "center", marginBottom: 8 }}>{t("food.address.confirmEyebrow")}</p>
				<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 34, textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "center", marginBottom: 10 }}>{t("food.address.confirmTitle")}</h1>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.55, textAlign: "center", marginBottom: 20 }}>{t("food.address.confirmSubtitle")}</p>
				<div className="bg-surface-raised border border-border" style={{ display: "flex", gap: 10, alignItems: "center", borderRadius: 12, padding: "12px 14px", marginBottom: 18 }}>
					<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
					<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{address}</span>
				</div>
				<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
					<button type="button" onClick={onChange} className="bg-surface-raised border border-border text-text-secondary" style={{ padding: "13px 14px", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>{t("food.address.changeLocation")}</button>
					<button type="button" onClick={onConfirm} style={{ padding: "13px 14px", borderRadius: 12, background: "#2563eb", border: "none", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 30px rgba(37,99,235,0.35)" }}>{t("food.address.confirmLocation")}</button>
				</div>
			</div>
		</div>
	);
}

// Order/Active/History tab bar — same segmented-control styling as the delivery-mode switch
// further down this file, so it reads as part of the same design system rather than a bolt-on.
function FoodOrdersTabBar({ active, hasActiveOrder, onSelect }) {
	const { t } = useTranslation();
	const tabs = [
		{ id: "landing", label: t("food.tabs.order", { defaultValue: "Order Food" }) },
		{ id: "favorites", label: t("food.tabs.favorites", { defaultValue: "Favorites" }) },
		{ id: "active", label: t("food.tabs.active", { defaultValue: "Active Order" }) },
		{ id: "history", label: t("food.tabs.history", { defaultValue: "Order History" }) },
	];
	return (
		<div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
			<div style={{ display: "flex", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 3, gap: 2 }}>
				{tabs.map(tab => (
					<button
						key={tab.id}
						onClick={() => onSelect(tab.id)}
						style={{ position: "relative", padding: "6px 16px", borderRadius: 8, border: "none", background: active === tab.id ? "#2563eb" : "transparent", color: active === tab.id ? "#fff" : "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
						onMouseEnter={e => { if (active !== tab.id) e.currentTarget.style.color = "rgba(255,255,255,0.75)"; }}
						onMouseLeave={e => { if (active !== tab.id) e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
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

function FoodNoActiveOrder({ onBrowse }) {
	const { t } = useTranslation();
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
			<div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(37,99,235,0.12)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
				<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
			</div>
			<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{t("food.tabs.noActiveOrder", { defaultValue: "No active order" })}</p>
			<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 20, maxWidth: 320 }}>{t("food.tabs.noActiveOrderDesc", { defaultValue: "Place an order and it'll show up here with live tracking." })}</p>
			<button onClick={onBrowse} style={{ padding: "12px 24px", background: "#2563eb", border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{t("food.tabs.browseRestaurants", { defaultValue: "Browse restaurants" })}</button>
		</div>
	);
}

function foodOrderStatusStyle(status) {
	const s = String(status || "").toLowerCase();
	if (s === "delivered" || s === "completed") return { bg: "rgba(74,222,128,0.1)", text: "#4ade80", border: "rgba(74,222,128,0.25)" };
	if (s === "cancelled" || s === "canceled") return { bg: "rgba(248,113,113,0.1)", text: "#f87171", border: "rgba(248,113,113,0.25)" };
	return { bg: "rgba(255,255,255,0.08)", text: "rgba(255,255,255,0.6)", border: "rgba(255,255,255,0.15)" };
}

// Food-scoped order history — a lighter, quicker-to-reach sibling of the full cross-vertical
// OrdersHistoryPage (Account.jsx), which stays the destination for full order detail (tapping a
// card here deep-links there rather than duplicating its detail rendering).
function FoodOrderHistoryPage({ isMobile, onReorder }) {
	const { t, i18n } = useTranslation();
	const [orders, setOrders] = useState(null); // null = loading
	const [error, setError] = useState(false);

	// No synchronous setState here — only inside the async .then/.catch — so this stays safe
	// to call directly from the mount effect below (react-hooks/set-state-in-effect).
	const load = useCallback(() => {
		getMyFoodOrders()
			.then((res) => {
				const list = Array.isArray(res) ? res : (res?.data ?? []);
				const terminal = list.filter((o) => FOOD_TERMINAL_STATUSES.has(String(o.order_status ?? o.status ?? "").toLowerCase()));
				terminal.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
				setError(false);
				setOrders(terminal);
			})
			.catch(() => { setError(true); setOrders([]); });
	}, []);
	const retry = useCallback(() => { setOrders(null); setError(false); load(); }, [load]);

	useEffect(() => { load(); }, [load]);

	if (orders === null) {
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, padding: isMobile ? "0 4px" : 0, maxWidth: 720, margin: "0 auto", width: "100%" }}>
				{[1, 2, 3].map(i => <Skel key={i} h={70} r={12} />)}
			</div>
		);
	}

	if (error) {
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
				<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 14 }}>{t("food.tabs.historyError", { defaultValue: "Couldn't load your order history." })}</p>
				<button onClick={retry} style={{ padding: "10px 20px", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.35)", borderRadius: 10, color: "#60a5fa", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{t("food.tabs.retry", { defaultValue: "Retry" })}</button>
			</div>
		);
	}

	if (orders.length === 0) {
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
				<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "rgba(255,255,255,0.45)" }}>{t("food.tabs.noHistory", { defaultValue: "No past orders yet." })}</p>
			</div>
		);
	}

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, padding: isMobile ? "0 4px" : 0, maxWidth: 720, margin: "0 auto", width: "100%" }}>
			{orders.map((o) => {
				const id = o.food_order_id ?? o.id;
				const sc = foodOrderStatusStyle(o.order_status ?? o.status);
				const itemCount = Array.isArray(o.food_order_items) ? o.food_order_items.reduce((s, it) => s + (it.qty || 1), 0) : null;
				const total = o.total_amount != null ? fmt(o.total_amount, o.currency || "CAD", i18n.language) : null;
				const canReorder = onReorder && Array.isArray(o.food_order_items) && o.food_order_items.some(it => it.food_item_id != null);
				return (
					<div
						key={id}
						role="button"
						tabIndex={0}
						onClick={() => window.__nav?.("orders")}
						onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); window.__nav?.("orders"); } }}
						style={{ textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "14px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, cursor: "pointer" }}
					>
						<div style={{ minWidth: 0 }}>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.food_vendor?.vendor_name ?? t("food.tracking.defaultVendor")}</p>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
								{o.created_at ? new Date(o.created_at).toLocaleDateString(i18n.language, { month: "short", day: "numeric", year: "numeric" }) : ""}
								{itemCount != null ? ` · ${t("food.tabs.itemCount", { count: itemCount, defaultValue: "{{count}} item(s)" })}` : ""}
							</p>
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
							{total && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, color: "#fff" }}>{total}</span>}
							<span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", textTransform: "capitalize", background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>{String(o.order_status ?? o.status ?? "").replace(/_/g, " ")}</span>
							{canReorder && (
								<button
									type="button"
									onClick={e => { e.stopPropagation(); onReorder(o); }}
									style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.4)", color: "#60a5fa", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
								>
									{t("food.tabs.reorder", { defaultValue: "Reorder" })}
								</button>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}

// Shared skeleton, used for both the cold-load and vendor-list-refresh loading states —
// previously two copy-pasted blocks (audit finding).
function FoodLandingSkeleton({ isMobile }) {
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 32, overflow: "hidden" }}>
			<div style={{ padding: "28px 0 20px", flexShrink: 0 }}>
				<SkeletonHeading />
				<div style={{ display: "flex", gap: 20, margin: "16px 0 28px" }}>
					{[...Array(5)].map((_, i) => <SkeletonCircle key={i} />)}
				</div>
			</div>
			<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(260px, 1fr))", gap: isMobile ? 16 : 20 }}>
				{[...Array(6)].map((_, i) => <SkeletonRestaurantCard key={i} />)}
			</div>
		</div>
	);
}

function FoodPage({ userLocation, initialListingId, onNavigate }) {
	const { isMobile } = useViewport();
	const { t } = useTranslation();
	const categories = useI18nCategoryList(FOOD_CATEGORY_DEFS);
	const loading = usePageLoad(150);
	const foodPromos = useMemo(() => FOOD_PROMO_DEFS.map(p => ({
		...p,
		label: t(p.labelKey),
		sub: t(p.subKey),
		icon: "",
	})), [t]);
	const [deliveryAddr, setDeliveryAddr] = useState(() => readFoodLocation().address);
	const [locationCoords, setLocationCoords] = useState(() => {
		const loc = readFoodLocation();
		return { lat: loc.lat, lng: loc.lng };
	});
	// A saved address means the user already confirmed a location on a past visit — trust it and
	// skip straight past the confirm gate instead of re-asking on every mount (the header's address
	// pill below is the only change-address surface now). showLocationConfirm stays available for
	// that in-place FoodLocationConfirm flow but is no longer forced on at initial mount.
	const [addressSet, setAddressSet] = useState(() => Boolean(readFoodLocation().address));
	const [showLocationConfirm, setShowLocationConfirm] = useState(false);
	const [allowAddressAutoResume, setAllowAddressAutoResume] = useState(true);
	const [showAddrEdit, setShowAddrEdit] = useState(false);
	const [addrInput, setAddrInput] = useState("");
	const addrEditWrapRef = useRef(null);
	const [landingLoading, setLandingLoading] = useState(false);
	const [activeCategory, setActiveCategory] = useState("all");
	const [query, setQuery] = useState("");
	const [selectedRestaurant, setSelectedRestaurant] = useState(null);
	const [checkoutPromoCode, setCheckoutPromoCode] = useState(null);
	const [cart, setCart] = useState([]);
	const [cartShaking, setCartShaking] = useState(false);
	const [foodView, setFoodView] = useState("landing");
	const [activeOrderId, setActiveOrderId] = useState(null);
	const [activePromo, setActivePromo] = useState(null);
	const [deliveryMode, setDeliveryMode] = useState("delivery"); 
	const [vendors, setVendors] = useState([]);
	const [foodVendorTypeId, setFoodVendorTypeId] = useState(null);
	const [foodVendorTypeReady, setFoodVendorTypeReady] = useState(false);
	const [sortBy, setSortBy] = useState("recommended");
	const [vendorsError, setVendorsError] = useState(false);
	const [vendorsRetryTick, setVendorsRetryTick] = useState(0);
	const [coldLoadError, setColdLoadError] = useState(false);
	const [savedVendorIds, setSavedVendorIds] = useState(() => new Set());
	const [reorderError, setReorderError] = useState(false);
	const foodCatScrollRef = useRef(null);
	const [foodCatScrollState, setFoodCatScrollState] = useState({ atStart: true, atEnd: true });
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [foodView]);

	// Close address editor only on true outside clicks — no full-screen overlay
	// (that overlay was sitting above the input and immediately closing it on focus).
	useEffect(() => {
		if (!showAddrEdit) return undefined;
		const onPointerDown = (e) => {
			const root = addrEditWrapRef.current;
			if (root && !root.contains(e.target)) setShowAddrEdit(false);
		};
		const onKeyDown = (e) => {
			if (e.key === "Escape") setShowAddrEdit(false);
		};
		// Defer so the chip click that opened the editor doesn't also count as outside.
		const timer = window.setTimeout(() => {
			document.addEventListener("pointerdown", onPointerDown);
			document.addEventListener("keydown", onKeyDown);
		}, 0);
		const focusTimer = window.setTimeout(() => {
			addrEditWrapRef.current?.querySelector("input")?.focus();
		}, 30);
		return () => {
			window.clearTimeout(timer);
			window.clearTimeout(focusTimer);
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [showAddrEdit]);

	const persistFoodLocation = (clean, nextLat, nextLng, syncProfile = true) => {
		setDeliveryAddr(clean);
		setLocationCoords({ lat: nextLat, lng: nextLng });
		setAddressSet(true);
		setShowLocationConfirm(false);
		try {
			setLocationItem("strug_user_location", JSON.stringify({ address: clean, lat: nextLat, lng: nextLng }));
			// Keep the flat lat/lng keys (what readBuyerDeliveryCoords → the live tracking map reads)
			// in lock-step with the address. Without this, changing the delivery address updated the
			// text but left the map pinned to the PREVIOUS location's coordinates — e.g. a Lahore
			// address showing an Islamabad map. Clear them when coords are unknown so a failed
			// geocode can never fall back to a stale city.
			if (nextLat != null) setLocationItem("strug_user_lat", String(nextLat));
			else removeLocationItem("strug_user_lat");
			if (nextLng != null) setLocationItem("strug_user_lng", String(nextLng));
			else removeLocationItem("strug_user_lng");
		} catch {
			// Persisting the address is a convenience; this session already has it in state.
		}
		const u = getUser();
		// PUT /user does `saved_lat ?? undefined`, so sending undefined LEAVES the previous
		// coordinates on the profile. Writing the new address with the old coords recreates
		// the stale-city bug one layer down: ensureBuyerDeliveryCoords() would then read
		// profile coords that "match" the new address. Wait for the geocode instead.
		if (syncProfile && (u?.user_id || u?.id)) {
			saveAddress({
				saved_address: clean,
				saved_lat: nextLat ?? undefined,
				saved_long: nextLng ?? undefined,
			}).catch(() => {
				// Profile sync is best-effort; this session already has the address.
			});
		}
	};
	const confirmFoodLocation = (addr, lat = null, lng = null) => {
		const clean = String(addr || "").trim();
		if (!clean) return;
		const nextLat = parseFiniteNumber(lat);
		const nextLng = parseFiniteNumber(lng);
		// Fast path: coordinates came from an autocomplete pick — persist immediately.
		if (nextLat != null && nextLng != null) {
			persistFoodLocation(clean, nextLat, nextLng);
			return;
		}
		// The address was typed without picking a suggestion, so we have no coordinates yet.
		// Persist the text now (with coords cleared, never stale) so the UI updates instantly,
		// then geocode in the background and fill the coordinates in once they resolve.
		persistFoodLocation(clean, null, null, false);
		loadGoogleMaps().then((maps) => {
			if (!maps?.Geocoder) return;
			new maps.Geocoder().geocode({ address: clean }, (results, status) => {
				if (status === "OK" && results?.[0]?.geometry?.location) {
					const g = results[0].geometry.location;
					persistFoodLocation(clean, g.lat(), g.lng());
				}
			});
		}).catch(() => { /* geocoding is best-effort — the address text is already saved */ });
	};
	const foodReturnTo = typeof window !== "undefined" && window.__foodReturnTo === "dating" ? "dating" : "home";
	const goBackFromFood = () => {
		if (typeof window !== "undefined") window.__foodReturnTo = null;
		if (typeof onNavigate === "function") {
			onNavigate(foodReturnTo);
			return;
		}
		if (typeof window !== "undefined" && window.__nav) {
			window.__nav(foodReturnTo);
			return;
		}
		if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
	};

	// Load which restaurants this customer already favorited, via the generic /saves
	// endpoint (entity_type: "restaurant") shared with the cross-vertical Favourites page.
	useEffect(() => {
		let alive = true;
		getSaves("restaurant").then(res => {
			if (!alive) return;
			const list = Array.isArray(res) ? res : (res?.data ?? []);
			setSavedVendorIds(new Set(list.map(s => String(s.entity_id))));
		}).catch(() => {});
		return () => { alive = false; };
	}, []);

	const handleToggleSaveRestaurant = useCallback((restaurant) => {
		const id = String(restaurant.id);
		// Optimistic toggle — /saves POST itself flips state server-side (create-or-delete), so on
		// failure we flip the local Set back rather than re-fetching.
		setSavedVendorIds(prev => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id); else next.add(id);
			return next;
		});
		toggleSave("restaurant", id, {
			title: restaurant.name,
			sub: restaurant.cuisine,
			thumb: restaurant.cover_url || restaurant.img,
		}).catch(() => {
			setSavedVendorIds(prev => {
				const next = new Set(prev);
				if (next.has(id)) next.delete(id); else next.add(id);
				return next;
			});
		});
	}, []);

	// Rebuilds the cart from a past order's line items and opens that vendor's store — fetches
	// the vendor fresh (not from the order snapshot) so hours/open-status/prices are current.
	const handleReorder = useCallback((order) => {
		const vendorId = order?.vendor_id ?? order?.food_vendor?.vendor_id;
		if (!vendorId) { setReorderError(true); setTimeout(() => setReorderError(false), 6000); return; }
		apiFetchVendor(vendorId).then(raw => {
			const v = raw?.data ?? raw;
			if (!v || !isGuestFoodVendorVisible(v)) { setReorderError(true); setTimeout(() => setReorderError(false), 6000); return; }
			const mapped = mapFoodVendor(v, t);
			const items = Array.isArray(order.food_order_items) ? order.food_order_items : [];
			const rebuiltCart = items.filter(it => it.food_item_id != null).map((it, i) => ({
				id: it.food_item_id,
				name: it.food_item?.name ?? t("food.menuItemFallback"),
				price: it.price_item ?? 0,
				qty: it.qty || 1,
				extras: [],
				modifier_option_ids: Array.isArray(it.modifier_option_ids) ? it.modifier_option_ids : [],
				lineId: Date.now() + i,
			}));
			setSelectedRestaurant(mapped);
			setCart(rebuiltCart);
			setFoodView("store");
		}).catch(() => { setReorderError(true); setTimeout(() => setReorderError(false), 6000); });
	}, [t]);

	/* Popstate: browser back from /listing/food/:id → close restaurant */
	useEffect(() => {
		const handler = () => {
			if (!/^\/listing\/food\//.test(window.location.pathname)) {
				setSelectedRestaurant(null);
				setFoodView("landing");
			}
		};
		window.addEventListener('popstate', handler);
		return () => window.removeEventListener('popstate', handler);
	}, []);

	// Restore an in-flight order's tracking view after leaving Food (other nav tab, Messages,
	// remount) and coming back — mirrors Rideshare's session restore (Rideshare.jsx:2310-2337).
	// A finished order (delivered/cancelled) is not restored; it's already visible in History.
	useEffect(() => {
		const session = loadFoodSession();
		if (!session?.activeOrderId) return;
		let cancelled = false;
		(async () => {
			try {
				const raw = await getFoodOrder(session.activeOrderId);
				const order = raw?.data ?? raw;
				const status = String(order?.order_status ?? order?.status ?? "").toLowerCase();
				if (cancelled || !order || FOOD_TERMINAL_STATUSES.has(status)) {
					clearFoodSession();
					return;
				}
				setActiveOrderId(session.activeOrderId);
				if (session.deliveryMode) setDeliveryMode(session.deliveryMode);
				setFoodView("tracking");
			} catch {
				clearFoodSession();
			}
		})();
		return () => { cancelled = true; };
	}, []);

	useEffect(() => {
		const openTracked = () => {
			const id = window.__foodTrackOrderId;
			if (!id) return;
			window.__foodTrackOrderId = null;
			setActiveOrderId(id);
			setFoodView("tracking");
			saveFoodSession({ activeOrderId: id });
		};
		openTracked();
		window.addEventListener("strug:open-notification-target", openTracked);
		return () => window.removeEventListener("strug:open-notification-target", openTracked);
	}, []);

	// Keep the session fresh while an order is actively tracking; cleared on completion (onDone)
	// or when the restore effect above finds it already finished server-side.
	useEffect(() => {
		if (foodView !== "tracking" || !activeOrderId) return;
		saveFoodSession({ activeOrderId, deliveryMode });
	}, [foodView, activeOrderId, deliveryMode]);

	useLayoutEffect(() => {
		const el = foodCatScrollRef.current;
		if (!el) return;
		const update = () => setFoodCatScrollState(prev => { const atStart = el.scrollLeft <= 4, atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4; return prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }; });
		update();
		el.addEventListener("scroll", update, { passive: true });
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
	}, [foodView]);

	useEffect(() => {
		let cancelled = false;
		findVendorTypeIdByName("Restaurant")
			.then((id) => {
				if (cancelled) return;
				setFoodVendorTypeId(id);
				setFoodVendorTypeReady(true);
			})
			.catch(() => {
				if (cancelled) return;
				setFoodVendorTypeId(null);
				setFoodVendorTypeReady(true);
			});
		return () => { cancelled = true; };
	}, []);

	useEffect(() => {
		if (!addressSet || !foodVendorTypeReady) return;
		const params = {};
		if (foodVendorTypeId) params.vendor_type_id = foodVendorTypeId;
		if (locationCoords.lat != null && locationCoords.lng != null) {
			params.lat = locationCoords.lat;
			params.lng = locationCoords.lng;
		}
		setVendorsError(false);
		apiFetchVendors(params).then(data => {
			const items = Array.isArray(data) ? data : (data?.data ?? data?.vendors ?? []);
			setVendors(Array.isArray(items) ? items.filter(isGuestFoodVendorVisible).map(v => mapFoodVendor(v, t)) : []);
		}).catch(() => setVendorsError(true));
	}, [addressSet, foodVendorTypeId, foodVendorTypeReady, locationCoords.lat, locationCoords.lng, t, vendorsRetryTick]);

	useEffect(() => {
		if (addressSet && !landingLoading) window.dispatchEvent(new CustomEvent('strug:view-change'));
	}, [addressSet, landingLoading]);

	useEffect(() => {
		if (addressSet) {
			const t1 = setTimeout(() => setLandingLoading(true), 0);
			const t2 = setTimeout(() => setLandingLoading(false), 450);
			return () => { clearTimeout(t1); clearTimeout(t2); };
		}
	}, [addressSet]);



	const vendorsWithDist = useMemo(() => {
		const userLat = locationCoords.lat;
		const userLng = locationCoords.lng;

		return vendors.map(r => {
			const dist = getDistance(userLat, userLng, r.lat, r.lng);
			const eta = dist == null ? null : 15 + Math.round(dist * 6);
			return {
				...r,
				dist,
				eta,
				delivery: foodDeliveryLabel({ eta, dist }, t),
			};
		});
	}, [vendors, locationCoords.lat, locationCoords.lng, t]);

	const filtered = useMemo(() => {
		return vendorsWithDist.filter(r => {
			// Hide far-away restaurants once we know the distance. Vendors without coords
			// (dist == null) stay visible so pre-geocode listings are not wiped from browse.
			if (!isWithinFoodBrowseRadius(r.dist)) return false;
			const matchCat = activeCategory === "all" || (() => {
				const cat = categories.find((c) => c.id === activeCategory);
				if (!cat?.match) return true;
				const haystack = [r.cuisine, ...(r.categoryNames || [])].join(" ").toLowerCase();
				return haystack.includes(cat.match.toLowerCase());
			})();
			const hasMatchingItem = (r.menuItems || []).some(item =>
				((item.name && item.name.toLowerCase().includes(query.toLowerCase())) ||
				 (item.description && item.description.toLowerCase().includes(query.toLowerCase())))
			);
			const matchQ = !query ||
				r.name.toLowerCase().includes(query.toLowerCase()) ||
				r.cuisine.toLowerCase().includes(query.toLowerCase()) ||
				hasMatchingItem;
			const matchPromo = !activePromo || (activePromo === "twenty_off" ? r.promo !== null : activePromo === "fast_delivery" ? r.eta == null || r.eta <= 35 : true);
			const matchMode = deliveryMode === "delivery" || deliveryMode === "dinein" || !!r.pickup;
			return matchCat && matchQ && matchPromo && matchMode;
		});
	}, [vendorsWithDist, activeCategory, query, activePromo, deliveryMode, categories]);

	const sortedFiltered = useMemo(() => {
		let list = [...filtered];
		if (sortBy === "distance") {
			list.sort((a, b) => (a.dist ?? Number.POSITIVE_INFINITY) - (b.dist ?? Number.POSITIVE_INFINITY));
		} else if (sortBy === "rating") {
			list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
		} else if (sortBy === "speed") {
			list.sort((a, b) => (a.eta ?? Number.POSITIVE_INFINITY) - (b.eta ?? Number.POSITIVE_INFINITY));
		} else if (sortBy === "delivery_fee") {
			list.sort((a, b) => (a.fee ?? Number.POSITIVE_INFINITY) - (b.fee ?? Number.POSITIVE_INFINITY));
		} else if (sortBy === "popular") {
			list.sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
		}
		return list;
	}, [filtered, sortBy]);

	const landingSections = useMemo(() => {
		const candidates = filtered.filter(r => !r.is_ad);
		const used = new Set();
		const pick = (list, limit = 6) => {
			const out = [];
			for (const restaurant of list) {
				const key = String(restaurant.id);
				if (used.has(key)) continue;
				out.push(restaurant);
				used.add(key);
				if (out.length >= limit) break;
			}
			return out;
		};
		const byDistance = (a, b) => (a.dist ?? Number.POSITIVE_INFINITY) - (b.dist ?? Number.POSITIVE_INFINITY);
		const nearYou = pick([...candidates].filter(r => r.open).sort(byDistance));
		const featured = pick([...candidates].filter(r => r.featured || (r.rating ?? 0) >= 4.7).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)), 4);
		const topRated = pick([...candidates].filter(r => r.rating != null).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)));
		const popularThisWeek = pick([...candidates].filter(r => r.reviewCount > 0).sort((a, b) => b.reviewCount - a.reviewCount));
		const newOnStrug = pick(candidates.filter(r => r.rating == null && (r.reviewCount ?? 0) === 0));
		const bestOffers = pick(candidates.filter(r => r.promo));
		let recentlyOrdered = [];
		try {
			const ids = JSON.parse(localStorage.getItem("strug_recent_food_vendors") || "[]");
			if (Array.isArray(ids) && ids.length > 0) {
				recentlyOrdered = pick(ids.map(id => candidates.find(r => String(r.id) === String(id))).filter(Boolean));
			}
		} catch { /* ignore corrupt local recents */ }
		return { nearYou, featured, topRated, popularThisWeek, newOnStrug, bestOffers, recentlyOrdered };
	}, [filtered]);

	// Cold-load from /listing/food/:id deep link
	const didFoodColdLoad = useRef(false);
	useEffect(() => {
		if (!initialListingId || didFoodColdLoad.current) return;
		didFoodColdLoad.current = true;
		apiFetchVendor(initialListingId).then(raw => {
			const v = raw?.data ?? raw;
				if (!v || !isGuestFoodVendorVisible(v)) return;
			const mapped = mapFoodVendor(v, t);
			setSelectedRestaurant(mapped);
			setFoodView("store");
		}).catch(() => {
			setColdLoadError(true);
			setTimeout(() => setColdLoadError(false), 6000);
		});
	}, [initialListingId, t]);

	if (loading) return <FoodLandingSkeleton isMobile={isMobile} />;
	if (!addressSet) {
		if (showLocationConfirm && deliveryAddr) {
			return (
				<FoodLocationConfirm
					address={deliveryAddr}
					onConfirm={() => confirmFoodLocation(deliveryAddr, locationCoords.lat, locationCoords.lng)}
					onChange={() => {
						setAllowAddressAutoResume(false);
						setShowLocationConfirm(false);
						setDeliveryAddr("");
						setLocationCoords({ lat: null, lng: null });
					}}
					onBack={goBackFromFood}
				/>
			);
		}
		return (
			<FoodAddressCapture
				allowAutoResume={allowAddressAutoResume}
				onConfirm={(addr, lat, lng) => confirmFoodLocation(addr, lat, lng)}
				userLocation={userLocation}
				onBack={goBackFromFood}
			/>
		);
	}
	if (landingLoading) return <FoodLandingSkeleton isMobile={isMobile} />;
	const foodCartCount = cart.reduce((s, i) => s + i.qty, 0);
	const foodCartBadge = foodView !== "cart" && (isMobile ? (
		<button
			onClick={() => setFoodView("cart")}
			style={{
				position: "fixed", top: 12, right: 12, zIndex: 50,
				width: 44, height: 44,
				display: "flex", alignItems: "center", justifyContent: "center",
				background: foodCartCount > 0 ? "#2563eb" : "var(--color-border)",
				border: foodCartCount > 0 ? "none" : "1px solid var(--color-border)",
				borderRadius: "50%",
				color: foodCartCount > 0 ? "#fff" : "var(--color-text-secondary)",
				cursor: "pointer",
				boxShadow: foodCartCount > 0 ? "0 4px 20px rgba(37,99,235,0.45)" : "none",
				transition: "background 0.2s, box-shadow 0.2s",
				animation: cartShaking ? "cartShake 0.45s ease" : "none",
				transformOrigin: "center",
			}}
		>
			<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
				<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
				<path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
			</svg>
			{foodCartCount > 0 && <span style={{ position: "absolute", top: -3, right: -3, width: 18, height: 18, borderRadius: "50%", background: "#ef4444", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{foodCartCount}</span>}
		</button>
	) : (
		<button onClick={() => setFoodView("cart")} style={{ position: "fixed", top: foodView === "store" ? 72 : 20, right: 40, zIndex: 50, display: "flex", alignItems: "center", gap: 8, background: foodCartCount > 0 ? "#2563eb" : "var(--color-border)", border: foodCartCount > 0 ? "none" : "1px solid var(--color-border)", borderRadius: 24, color: foodCartCount > 0 ? "#fff" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, padding: "10px 18px", cursor: "pointer", boxShadow: foodCartCount > 0 ? "0 4px 20px rgba(37,99,235,0.45)" : "none", transition: "background 0.2s, box-shadow 0.2s, top 0.2s", animation: cartShaking ? "cartShake 0.45s ease" : "none", transformOrigin: "center" }}>
			<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
			{foodCartCount > 0 ? t("food.landing.cartWithCount", { count: foodCartCount }) : t("food.landing.cart")}
		</button>
	));
	const handleFoodAddToCart = () => { setCartShaking(true); setTimeout(() => setCartShaking(false), 500); };
	const openRestaurantCard = (restaurant) => {
		if (restaurant.is_ad) {
			openSponsored(restaurant);
			return;
		}
		if (!restaurant.open) return;
		setSelectedRestaurant(restaurant);
		setFoodView("store");
		try {
			const prev = JSON.parse(localStorage.getItem("strug_recent_food_vendors") || "[]");
			const updated = [restaurant.id, ...(Array.isArray(prev) ? prev.filter(id => String(id) !== String(restaurant.id)) : [])].slice(0, 8);
			localStorage.setItem("strug_recent_food_vendors", JSON.stringify(updated));
			window.history.pushState({ nav: "food", listingId: restaurant.id }, "", `/listing/food/${restaurant.id}-${slugify(restaurant.name)}`);
		} catch { /* noop */ }
	};
	const renderRestaurantSection = (title, subtitle, list, offset = 0) => {
		if (!list.length) return null;
		return (
			<div style={{ marginBottom: 28, animation: `fadeUp 0.35s ease ${offset}ms both` }}>
				<div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12 }}>
					<div>
						<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 2 }}>{title}</h3>
						{subtitle && <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{subtitle}</p>}
					</div>
				</div>
				<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(260px, 1fr))", gap: isMobile ? 16 : 20 }}>
					{list.map((r, i) => (
						<div
							key={`${title}-${r.id}-${i}`}
							role="button"
							tabIndex={r.open || r.is_ad ? 0 : -1}
							aria-label={r.name}
							onClick={() => openRestaurantCard(r)}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									openRestaurantCard(r);
								}
							}}
							style={{ animation: `fadeUp 0.3s ease ${i * 40}ms both`, outline: "none" }}
						>
							{r.is_ad && <AdImpression campaignId={r.campaign_id} />}
							<RestaurantCard restaurant={r} delay={0} fluid isSaved={savedVendorIds.has(String(r.id))} onToggleSave={handleToggleSaveRestaurant} />
						</div>
					))}
				</div>
			</div>
		);
	};

	if (foodView === "store" && selectedRestaurant) return (
		<>
			{foodCartBadge}
			<FoodStorePage restaurant={selectedRestaurant} cart={cart} setCart={setCart} onBack={() => { setFoodView("landing"); try { window.history.pushState({ nav: "food" }, "", "/food"); } catch { /* noop */ } }} onViewCart={() => setFoodView("cart")} onAddToCart={handleFoodAddToCart} />
		</>
	);
	if (foodView === "cart") return <FoodCartPage cart={cart} setCart={setCart} restaurant={selectedRestaurant} onBack={() => setFoodView("store")} onCheckout={(code) => { setCheckoutPromoCode(code || null); setFoodView("checkout"); }} />;
	if (foodView === "checkout") return <FoodCheckoutPage cart={cart} onBack={() => setFoodView("cart")} onPlaceOrder={(oid, mode) => { setActiveOrderId(oid); if (mode) setDeliveryMode(mode); setFoodView("tracking"); saveAddress({ saved_address: deliveryAddr, saved_lat: locationCoords.lat ?? undefined, saved_long: locationCoords.lng ?? undefined }).catch(() => {}); }} restaurant={selectedRestaurant} deliveryAddr={deliveryAddr} vendorTypeId={foodVendorTypeId ?? selectedRestaurant?.raw?.vendor_type_id ?? 1} itemSource="food" promoCode={checkoutPromoCode} />;
	if (foodView === "tracking") return <FoodTrackingPage restaurant={selectedRestaurant} orderId={activeOrderId} deliveryMode={deliveryMode} onDone={() => { clearFoodSession(); setCart([]); setSelectedRestaurant(null); setActiveOrderId(null); setFoodView("landing"); }} onBack={() => setFoodView("landing")} />;
	if (foodView === "favorites") {
		const favorites = vendorsWithDist.filter(r => !r.is_ad && savedVendorIds.has(String(r.id)));
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 20, overflowY: "auto", minHeight: 0 }}>
				<FoodOrdersTabBar active="favorites" hasActiveOrder={!!activeOrderId} onSelect={(id) => setFoodView(id === "active" ? (activeOrderId ? "tracking" : "active") : id)} />
				{favorites.length === 0 ? (
					<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", minHeight: "42vh", gap: 14 }}>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 72, height: 72, borderRadius: 20, fontSize: 34, background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.35)" }}>♡</div>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "rgba(255,255,255,0.55)", maxWidth: 280 }}>{t("food.landing.noFavorites", { defaultValue: "No saved restaurants yet — tap the heart on a restaurant to save it here." })}</p>
						<button onClick={() => setFoodView("landing")} style={{ padding: "10px 22px", background: "#2563eb", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{t("food.tabs.order", { defaultValue: "Order Food" })}</button>
					</div>
				) : (
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(260px, 1fr))", gap: isMobile ? 16 : 20, paddingBottom: 32 }}>
						{favorites.map((r, i) => (
							<div key={r.id} onClick={() => openRestaurantCard(r)} style={{ animation: `fadeUp 0.3s ease ${i * 40}ms both` }}>
								<RestaurantCard restaurant={r} delay={0} fluid isSaved onToggleSave={handleToggleSaveRestaurant} />
							</div>
						))}
					</div>
				)}
			</div>
		);
	}
	if (foodView === "active") return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 20, minHeight: 0 }}>
			<FoodOrdersTabBar active="active" hasActiveOrder={!!activeOrderId} onSelect={(id) => setFoodView(id === "active" ? (activeOrderId ? "tracking" : "active") : id)} />
			<FoodNoActiveOrder onBrowse={() => setFoodView("landing")} />
		</div>
	);
	if (foodView === "history") return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 20, overflowY: "auto", minHeight: 0 }}>
			<FoodOrdersTabBar active="history" hasActiveOrder={!!activeOrderId} onSelect={(id) => setFoodView(id === "active" ? (activeOrderId ? "tracking" : "active") : id)} />
			{reorderError && (
				<div style={{ maxWidth: 480, margin: "0 auto 14px", padding: "10px 14px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, textAlign: "center" }}>
					{t("food.tabs.reorderError", { defaultValue: "That restaurant isn't available for reorder right now." })}
				</div>
			)}
			<FoodOrderHistoryPage isMobile={isMobile} onReorder={handleReorder} />
		</div>
	);

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflowY: "auto", minHeight: 0 }}>
			{foodCartBadge}
			
			<div className="bg-bg" style={{ padding: "20px 0 16px", animation: "fadeUp 0.3s ease both", position: isMobile ? "static" : "sticky", top: 0, zIndex: 10 }}>
				
					<FoodBackButton
						onClick={goBackFromFood}
						label={foodReturnTo === "dating" ? "Back to Dating" : t("food.backToHome")}
						style={isMobile ? { marginBottom: 10 } : { position: "absolute", left: 0, top: 4 }}
					/>
				{isMobile && <h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(24px, 2.5vw, 36px)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center", marginBottom: 10, pointerEvents: "none" }}>{t("food.title")}</h1>}
					{/* #283: offset left so it never sits under the fixed Cart button (right:40, top:20) — they were overlapping/blocking each other in the top-right corner. Previously desktop-only with a hardcoded string; now visible on mobile too and translated. */}
					<button onClick={() => window.__nav?.("orders")} className="text-text-secondary" style={isMobile ? { display: "block", margin: "0 auto 10px", background: "none", border: "none", padding: "7px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" } : { position: "absolute", right: 170, top: 4, background: "none", border: "none", padding: "7px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }} onMouseEnter={e => e.currentTarget.style.color = "var(--color-text-primary)"} onMouseLeave={e => e.currentTarget.style.color = "var(--color-text-secondary)"}>{t("food.landing.myOrders", { defaultValue: "My Orders →" })}</button>

				<div ref={addrEditWrapRef} style={{ marginBottom: 14 }}>
					<div style={{ display: "flex", justifyContent: isMobile ? "center" : "flex-start", alignItems: "center", position: "relative" }}>
						{!isMobile && <h1 className="text-text-primary" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(24px, 2.5vw, 36px)", letterSpacing: "0.04em", textTransform: "uppercase", pointerEvents: "none", whiteSpace: "nowrap", margin: 0 }}>{t("food.title")}</h1>}
						<div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 10, minWidth: 0, maxWidth: "100%", ...(isMobile ? { width: "100%", justifyContent: "center" } : {}) }}>
							<button
								type="button"
								className="bg-surface border border-border"
								style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 10, padding: "9px 14px", maxWidth: isMobile ? "none" : 300, minWidth: 0, flexShrink: 1, cursor: "pointer", transition: "border-color 0.15s" }}
								aria-expanded={showAddrEdit}
								aria-label="Edit delivery address"
								onClick={() => { setShowAddrEdit((v) => !v); setAddrInput(""); }}
								onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(37,99,235,0.45)"}
								onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border)"}
							>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
								<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deliveryAddr}</span>
								<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
							</button>
							<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, flexShrink: 0 }}>·</span>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, display: "flex", alignItems: "center", gap: 4, flexShrink: 0, whiteSpace: "nowrap" }}>
								<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
								{ t("food.landing.deliveryTime") }
							</span>
						</div>
					</div>

					{showAddrEdit && (
						<div className="food-addr-edit bg-surface border border-border" style={{ marginTop: 8, width: isMobile ? "100%" : 380, maxWidth: "100%", borderRadius: 14, boxShadow: "0 12px 40px var(--color-shadow)", overflow: "visible", position: "relative", zIndex: 50 }}>
							<AddressAutocomplete
								value={addrInput}
								onChange={(val, lat, lng) => {
									setAddrInput(val);
									if (lat != null && lng != null) {
										confirmFoodLocation(val, lat, lng);
										setShowAddrEdit(false);
									}
								}}
								onEnter={(val) => {
									if (val.trim()) {
										confirmFoodLocation(val);
										setShowAddrEdit(false);
									}
								}}
								placeholder={t("food.landing.enterNewAddress")}
								useLocation
								wrapStyle={{ width: "100%" }}
								inputStyle={{ width: "100%", background: "none", border: "none", outline: "none", boxShadow: "none", color: "var(--color-text-primary)", fontSize: 13, fontFamily: "'DM Sans', sans-serif", padding: "14px 16px" }}
							/>
						</div>
					)}
				</div>
				
				<div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
					<div className="bg-border-subtle border border-border" style={{ display: "flex", borderRadius: 10, padding: 3, gap: 2 }}>
						{[{ id: "delivery", label: t("food.delivery") }, { id: "dinein", label: t("food.landing.dineIn") }, { id: "pickup", label: t("food.pickup") }].map(opt => (
							<button key={opt.id} onClick={() => setDeliveryMode(opt.id)} style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: deliveryMode === opt.id ? "#2563eb" : "transparent", color: deliveryMode === opt.id ? "#fff" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
								onMouseEnter={e => { if (deliveryMode !== opt.id) e.currentTarget.style.color = "var(--color-text-primary)"; }}
								onMouseLeave={e => { if (deliveryMode !== opt.id) e.currentTarget.style.color = "var(--color-text-secondary)"; }}>
								{opt.label}
							</button>
						))}
					</div>
				</div>

				<FoodOrdersTabBar active="landing" hasActiveOrder={!!activeOrderId} onSelect={(id) => setFoodView(id === "active" ? (activeOrderId ? "tracking" : "active") : id)} />

				{coldLoadError && (
					<div style={{ maxWidth: 480, margin: "0 auto 14px", padding: "10px 14px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, textAlign: "center" }}>
						{t("food.landing.coldLoadError", { defaultValue: "Couldn't open that restaurant — it may be unavailable right now." })}
					</div>
				)}
				{vendorsError && (
					<div style={{ maxWidth: 480, margin: "0 auto 14px", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, textAlign: "center" }}>
						{t("food.landing.vendorsError", { defaultValue: "Couldn't load restaurants." })}
						<button onClick={() => setVendorsRetryTick(n => n + 1)} style={{ background: "none", border: "none", color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 700, textDecoration: "underline", cursor: "pointer" }}>{t("food.tabs.retry", { defaultValue: "Retry" })}</button>
					</div>
				)}

				<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
					<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "13px 18px", gap: 12 }}>
						<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={18} /></div>
						<input
							value={query}
							onChange={e => setQuery(e.target.value)}
							placeholder={t("food.landing.searchPlaceholder")}
							className="od-search-input text-text-primary"
							style={{ flex: 1, background: "none", border: "none", outline: "none", boxShadow: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }}
						/>
					</div>
				</div>
				<div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12, flexWrap: "wrap", width: "min(680px, 100%)", marginLeft: "auto", marginRight: "auto" }}>
						{[
							{ id: "recommended", label: t("food.landing.sortRecommended"), icon: "" },
							{ id: "speed", label: t("food.landing.sortSpeed"), icon: "" },
							{ id: "rating", label: t("food.landing.sortRating"), icon: "" },
							{ id: "distance", label: t("food.landing.sortDistance"), icon: "" },
							{ id: "delivery_fee", label: t("food.landing.sortLowestFee"), icon: "" },
							{ id: "popular", label: t("food.landing.sortPopular"), icon: "" },
						].map(opt => (
							<button key={opt.id} onClick={() => setSortBy(opt.id)} style={{
								display: "flex", alignItems: "center", gap: 6,
								padding: "6px 12px",
								borderRadius: 12,
								background: sortBy === opt.id ? "rgba(37, 99, 235, 0.16)" : "var(--color-surface-raised)",
								border: `1px solid ${sortBy === opt.id ? "rgba(37, 99, 235, 0.4)" : "var(--color-border)"}`,
								color: sortBy === opt.id ? "#fff" : "var(--color-text-secondary)",
								fontSize: 12,
								fontWeight: 600,
								fontFamily: "'DM Sans', sans-serif",
								cursor: "pointer",
								transition: "all 0.15s"
							}}>
								<span>{opt.icon}</span>
								<span>{opt.label}</span>
							</button>
						))}
				</div>
			</div>
			
			{!query && (
				<div style={{ display: "flex", gap: 10, marginBottom: 16, justifyContent: "center", flexWrap: "wrap" }}>
					{foodPromos.map(p => {
						const isActive = activePromo === p.id;
						return (
							<div key={p.id} onClick={() => setActivePromo(isActive ? null : p.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", background: isActive ? p.bg.replace("0.18", "0.32").replace("0.05", "0.18") : p.bg, border: `1px solid ${isActive ? p.color + "60" : p.color + "25"}`, borderRadius: 20, flexShrink: 0, cursor: "pointer", transition: "all 0.15s", outline: isActive ? `2px solid ${p.color}40` : "none" }}>
								<span style={{ fontSize: 14 }}>{p.icon}</span>
								<div>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: p.color, lineHeight: 1.2 }}>{p.label}</p>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, lineHeight: 1.2 }}>{isActive ? t("food.landing.promoActiveClear") : p.sub}</p>
								</div>
							</div>
						);
					})}
				</div>
			)}

			
			<div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
				<button
					onClick={() => foodCatScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })}
					className={`${foodCatScrollState.atStart ? "bg-border-subtle" : "bg-border"} ${foodCatScrollState.atStart ? "text-text-muted" : "text-text-primary"}`}
					style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, border: `1px solid ${foodCatScrollState.atStart ? "var(--color-border-subtle)" : "var(--color-border)"}`, cursor: foodCatScrollState.atStart ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.12s, background 0.2s, box-shadow 0.15s" }}
					onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; e.currentTarget.style.background = foodCatScrollState.atStart ? "var(--color-border)" : "var(--color-border)"; }}
					onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = foodCatScrollState.atStart ? "var(--color-border-subtle)" : "var(--color-border)"; }}
					onMouseDown={e => { e.currentTarget.style.transform = "scale(0.88)"; }}
					onMouseUp={e => { e.currentTarget.style.transform = "scale(1.15)"; }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
				</button>
				<div ref={foodCatScrollRef} className="ecom-cat-scroll" style={{ flex: 1, display: "flex", gap: 20, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none", justifyContent: (!isMobile && foodCatScrollState.atStart && foodCatScrollState.atEnd) ? "center" : "flex-start" }}>
					{categories.map((cat, i) => (
						<LeoButton key={cat.id} cat={cat} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 30} />
					))}
				</div>
				<button
					onClick={() => foodCatScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
					style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: foodCatScrollState.atEnd ? "var(--color-border-subtle)" : "#2563eb", border: `1px solid ${foodCatScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`, color: foodCatScrollState.atEnd ? "var(--color-text-muted)" : "#fff", cursor: foodCatScrollState.atEnd ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.12s, background 0.2s, box-shadow 0.15s", boxShadow: foodCatScrollState.atEnd ? "none" : "0 2px 14px rgba(37,99,235,0.55)" }}
					onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; e.currentTarget.style.background = foodCatScrollState.atEnd ? "var(--color-border)" : "#3b82f6"; }}
					onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = foodCatScrollState.atEnd ? "var(--color-border-subtle)" : "#2563eb"; }}
					onMouseDown={e => { e.currentTarget.style.transform = "scale(0.88)"; }}
					onMouseUp={e => { e.currentTarget.style.transform = "scale(1.15)"; }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
				</button>
			</div>

			<div className="food-scroll" style={{ paddingBottom: 24 }}>
				<div key={`${activeCategory}-${deliveryMode}`}>
				
				{!query && activeCategory === "all" && (
					<>
						{renderRestaurantSection(t("food.landing.nearYou"), t("food.landing.nearYouSub"), landingSections.nearYou, 40)}
						{renderRestaurantSection(t("food.landing.featured"), t("food.landing.featuredSub", { count: landingSections.featured.length }), landingSections.featured, 80)}
						{renderRestaurantSection(t("food.landing.topRated"), t("food.landing.topRatedSub"), landingSections.topRated, 120)}
						{renderRestaurantSection(t("food.landing.popularThisWeek"), t("food.landing.popularThisWeekSub"), landingSections.popularThisWeek, 160)}
						{renderRestaurantSection(t("food.landing.newOnStrug"), t("food.landing.newOnStrugSub"), landingSections.newOnStrug, 200)}
						{renderRestaurantSection(t("food.landing.bestOffers"), t("food.landing.bestOffersSub"), landingSections.bestOffers, 240)}
						{renderRestaurantSection(t("food.landing.recentlyOrdered"), t("food.landing.recentlyOrderedSub"), landingSections.recentlyOrdered, 280)}
					</>
				)}

				
				<div>
					{!query && activeCategory === "all" && sortedFiltered.length > 0 && (
						<div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14, animation: "fadeUp 0.3s ease both" }}>
							<div>
								<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 2 }}>
									{deliveryMode === "pickup" ? t("food.landing.availablePickup") : deliveryMode === "dinein" ? t("food.landing.dineIn") : t("food.landing.allRestaurants")}
								</h3>
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
									{sortedFiltered.length === 1
										? t("food.landing.restaurantsAvailable_one", { count: sortedFiltered.length })
										: t("food.landing.restaurantsAvailable", { count: sortedFiltered.length })}
								</p>
							</div>
						</div>
					)}
					{sortedFiltered.length === 0 ? (
						<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", minHeight: "42vh", gap: 14 }}>
							<div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 72, height: 72, borderRadius: 20, fontSize: 34, background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.35)" }}>🍽️</div>
							<div className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(24px,2.6vw,32px)", letterSpacing: "0.04em", textTransform: "uppercase" }}>{deliveryMode === "pickup" ? t("food.landing.noRestaurantsTitlePickup") : t("food.landing.noRestaurantsTitle")}</div>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, lineHeight: 1.6, maxWidth: 420, margin: 0 }}>{t("food.landing.tryDifferentFilters")}</p>
						</div>
					) : (
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(260px, 1fr))", gap: isMobile ? 16 : 20 }}>
							{sortedFiltered.map((r, i) => (
								<div key={`${r.id}-${r.name}`} onClick={() => openRestaurantCard(r)} style={{ animation: `fadeUp 0.35s ease ${i * 40}ms both` }}>
									{r.is_ad && <AdImpression campaignId={r.campaign_id} />}
									<RestaurantCard restaurant={r} delay={0} fluid isSaved={savedVendorIds.has(String(r.id))} onToggleSave={handleToggleSaveRestaurant} />
								</div>
							))}
						</div>
					)}
				</div>
				</div>
			</div>
		</div>
	);
}

export { FoodPage, FoodAddressCapture, FoodCartPage, FoodCheckoutPage, FoodTrackingPage };
