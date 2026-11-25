import React, { useEffect, useMemo, useState } from "react";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import { getProducts, getProductRatingsBySeller } from '../api/shop';
import { averageSellerRating } from '../utils/shopBuyerHelpers.js';
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon, DecorIcon } from "../components/icons.jsx";
import { Skel, SkeletonCircle, SkeletonHeading, SkeletonBubble, SkeletonProductCard, SkeletonServiceCard } from "../components/skeletons.jsx";
import { LeoButton, ODCategoryBubble, HostListingCTA } from "../components/shared.jsx";
import { getBookingListings, createBooking, getBookingQuote, getBookingListing, getListingAvailability } from "../api/booking";
import { CardPaymentField, useBookingPayment } from "../components/BookingPayment.jsx";
import { bindCheckoutReferralCode } from "../api/user";
import { isAuthenticated } from "../store/auth";
import { setLocationItem } from "../utils/userLocation.js";
import { messageUser } from "../api/chat";
import { toggleSave as toggleSaveApi, getSaves } from "../api/saves";
import {
	CartPage,
	CheckoutPage,
	EcomTrackingPage,
	VERTICAL_PRODUCT_TYPE,
	verticalBrowseListingParams,
	readBuyerBrowseCoords,
	mapListingsToVerticalCatalog,
	mapVerticalProductToCartLine,
	pickCheckoutProductTypeId,
	createVerticalPlaceOrderHandler,
} from "../components/shared-shopping/SharedShopping.jsx";
import { useResolvedProductTypeId } from "../hooks/useResolvedProductTypeId.js";
import AddToWishlistButton from "../components/wishlist/AddToWishlistButton.jsx";
import { haversineKm } from "../utils/geo.js";

const DECOR_DEFAULT_TIME_SLOTS = ["8:00 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM"];
const DECOR_NEARBY_RADII = [10, 25, 50, 100];

function decorTodayISO() {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "8:00 AM" -> "08:00" (24h) for the booking engine's start_time field.
function decorTo24h(label) {
	const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(label || "");
	if (!m) {
		const h24 = /^(\d{1,2}):(\d{2})$/.exec(label || "");
		if (h24) return `${String(Number(h24[1])).padStart(2, "0")}:${h24[2]}`;
		return label;
	}
	let h = Number(m[1]) % 12;
	if (/PM/i.test(m[3])) h += 12;
	return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function decorTo12h(hhmm) {
	const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
	if (!m) return String(hhmm || "");
	let h = Number(m[1]);
	const min = m[2];
	const ampm = h >= 12 ? "PM" : "AM";
	h = h % 12;
	if (h === 0) h = 12;
	return `${h}:${min} ${ampm}`;
}

/** Normalize listing attributes.time_slots into 12h labels for the time select. */
function decorResolveTimeSlots(raw) {
	const list = Array.isArray(raw)
		? raw
		: (typeof raw === "string" ? raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean) : []);
	if (!list.length) return DECOR_DEFAULT_TIME_SLOTS;
	return list.map((t) => (/AM|PM/i.test(t) ? t : decorTo12h(t)));
}

function decorMoney(n) {
	const v = Number(n);
	return Number.isFinite(v) ? v.toFixed(2) : "0.00";
}

/** Collect booked + blocked calendar dates from getListingAvailability. */
function decorUnavailableDateSet(data) {
	const set = new Set();
	(data?.booked || []).forEach((b) => {
		if (!b?.start_date) return;
		const s = new Date(`${String(b.start_date).slice(0, 10)}T12:00:00`);
		const e = b.end_date ? new Date(`${String(b.end_date).slice(0, 10)}T12:00:00`) : s;
		for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
			set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
		}
	});
	(data?.blocked || []).forEach((b) => {
		if (b?.is_blocked && b.date) set.add(String(b.date).slice(0, 10));
	});
	return set;
}

function useDecorUnavailableDates(listingId) {
	const [unavailableDates, setUnavailableDates] = useState(() => new Set());
	useEffect(() => {
		if (!listingId) return undefined;
		let alive = true;
		getListingAvailability(listingId)
			.then((res) => {
				if (!alive) return;
				setUnavailableDates(decorUnavailableDateSet(res?.data ?? res ?? {}));
			})
			.catch(() => { if (alive) setUnavailableDates(new Set()); });
		return () => { alive = false; };
	}, [listingId]);
	return unavailableDates;
}

function useDecorNearby(items) {
	const stored = readBuyerBrowseCoords();
	const [enabled, setEnabled] = useState(false);
	const [radiusKm, setRadiusKm] = useState(25);
	const [coords, setCoords] = useState(() => (
		Number.isFinite(stored.userLat) && Number.isFinite(stored.userLng)
			? { lat: stored.userLat, lng: stored.userLng }
			: null
	));
	const [status, setStatus] = useState("idle");

	function toggleNearby() {
		if (enabled) {
			setEnabled(false);
			setStatus("idle");
			return;
		}
		if (coords) {
			setEnabled(true);
			setStatus("ready");
			return;
		}
		if (typeof navigator === "undefined" || !navigator.geolocation) {
			setStatus("unsupported");
			return;
		}
		setStatus("locating");
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
				setCoords(next);
				setEnabled(true);
				setStatus("ready");
				try {
					setLocationItem("strug_user_lat", String(next.lat));
					setLocationItem("strug_user_lng", String(next.lng));
				} catch { /* storage may be unavailable */ }
			},
			() => setStatus("denied"),
			{ enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
		);
	}

	const results = useMemo(() => {
		const withDistance = items.map((item) => {
			const distanceKm = coords
				? haversineKm(coords.lat, coords.lng, item.latitude, item.longitude)
				: null;
			return { ...item, distanceKm };
		});
		if (!enabled) return withDistance;
		return withDistance
			.filter((item) => item.distanceKm != null && item.distanceKm <= radiusKm)
			.sort((a, b) => a.distanceKm - b.distanceKm);
	}, [items, coords, enabled, radiusKm]);

	return { enabled, radiusKm, setRadiusKm, status, toggleNearby, results };
}

function DecorNearbyControls({ nearby, accent }) {
	const message = nearby.status === "locating"
		? i18n.t("decor.findingLocation")
		: nearby.status === "denied"
			? i18n.t("decor.locationPermissionDenied")
			: nearby.status === "unsupported"
				? i18n.t("decor.locationUnsupported")
				: nearby.enabled
					? i18n.t("decor.showingWithin", { radius: nearby.radiusKm })
					: null;
	return (
		<div style={{ display: "flex", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
			<button
				type="button"
				aria-pressed={nearby.enabled}
				onClick={nearby.toggleNearby}
				disabled={nearby.status === "locating"}
				style={{
					borderRadius: 20,
					padding: "8px 14px",
					border: `1px solid ${nearby.enabled ? accent : "var(--color-border)"}`,
					background: nearby.enabled ? `${accent}22` : "var(--color-surface-raised)",
					color: nearby.enabled ? accent : "var(--color-text-secondary)",
					fontFamily: "'DM Sans', sans-serif",
					fontSize: 12,
					fontWeight: 700,
					cursor: nearby.status === "locating" ? "wait" : "pointer",
				}}
			>
				{nearby.status === "locating" ? i18n.t("decor.findingLocation") : i18n.t("decor.nearMe")}
			</button>
			{nearby.enabled && (
				<label className="text-text-secondary" style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
					{i18n.t("decor.radius")}
					<select
						value={nearby.radiusKm}
						onChange={(e) => nearby.setRadiusKm(Number(e.target.value))}
						aria-label={i18n.t("decor.radius")}
						className="bg-surface-raised border border-border text-text-primary" style={{ borderRadius: 8, padding: "6px 8px", fontSize: 12 }}
					>
						{DECOR_NEARBY_RADII.map((km) => <option key={km} value={km}>{km} km</option>)}
					</select>
				</label>
			)}
			{message && <span role="status" style={{ color: nearby.status === "denied" || nearby.status === "unsupported" ? "#f87171" : "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{message}</span>}
		</div>
	);
}

/** CSS background for listing thumbs — real URLs need url(...), gradients pass through.
 * The fallback (and any badge/overlay drawn on top of a thumb) is a fixed dark gradient/scrim —
 * it stands in for a photo, so it stays hardcoded dark in both themes for legibility, same
 * reasoning as Hub.jsx's hero photo overlay and Quotes.jsx's map section. */
function decorThumbStyle(thumb, fallback = "linear-gradient(135deg,#1e1b4b,#7c3aed)") {
	const s = thumb != null ? String(thumb) : "";
	if (/^(https?:|data:|blob:|\/)/i.test(s)) {
		const safe = s.replace(/["'\\)]/g, "");
		return { backgroundImage: `url("${safe}")`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" };
	}
	return { background: s || fallback };
}

function DecorListingMeta({ description, provider, location, accent = "#a855f7" }) {
	if (!description && !provider && !location) return null;
	return (
		<div style={{ marginBottom: 20 }}>
			{(provider || location) && (
				<div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: description ? 12 : 0 }}>
					{provider ? (
						<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
							<span className="text-text-muted">{i18n.t("decor.providerLabel")}: </span>{provider}
						</span>
					) : null}
					{location ? (
						<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
							<span className="text-text-muted">{i18n.t("decor.locationLabel")}: </span>{location}
						</span>
					) : null}
				</div>
			)}
			{description ? (
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.65, margin: 0, borderLeft: `3px solid ${accent}55`, paddingLeft: 12 }}>
					{description}
				</p>
			) : null}
		</div>
	);
}

function decorFormatRating(rating, reviews) {
	if (rating == null || rating === "") return { label: "New", detail: null };
	return { label: String(rating), detail: `(${Number(reviews) || 0} reviews)` };
}

/** Prefer live aggregates when present; fall back to listing attributes (seed / host-set). */
function decorListingRating(listing) {
	const a = listing?.attributes ?? {};
	const rating = Number(listing?.avg_rating) || Number(a.rating) || null;
	const reviews = Number(listing?.review_count) || Number(a.reviews) || 0;
	return {
		rating: Number.isFinite(rating) && rating > 0 ? Math.round(rating * 10) / 10 : null,
		reviews: Number.isFinite(reviews) ? reviews : 0,
	};
}

const DECOR_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#2563eb", match: null },
	{ id: "interior", labelKey: "decor.catInterior", color: "#7c3aed", match: "Interior" },
	{ id: "event", labelKey: "decor.catEvent", color: "#ec4899", match: "Event Décor" },
	{ id: "furniture", labelKey: "decor.catFurniture", color: "#059669", match: "Furniture" },
	{ id: "lighting", labelKey: "decor.catLighting", color: "#f59e0b", match: "Lighting" },
	{ id: "wallart", labelKey: "decor.catWallArt", color: "#3b82f6", match: "Wall Art" },
	{ id: "outdoor", labelKey: "decor.catOutdoor", color: "#10b981", match: "Outdoor" },
	{ id: "seasonal", labelKey: "decor.seasonal", color: "#dc2626", match: "Seasonal" },
	{ id: "custom", labelKey: "decor.catCustom", color: "#a855f7", match: "Custom" },
];


const SEASONAL_TABS = ["Christmas", "Halloween", "Easter", "Diwali", "Other"];
const SEASON_TAB_KEYS = {
	Christmas: "decor.seasonChristmas",
	Halloween: "decor.seasonHalloween",
	Easter: "decor.seasonEaster",
	Diwali: "decor.seasonDiwali",
	Other: "decor.seasonOther",
};
function seasonTabLabel(tab) { return i18n.t(SEASON_TAB_KEYS[tab] || tab); }

// This card's own background IS the listing's decorative gradient (service.gradient, same fixed
// dark gradient decorThumbStyle falls back to) — not a themed neutral surface — so every text/
// icon color inside stays hardcoded light for legibility, regardless of theme.
function DecorServiceCard({ service, delay = 0, onBook, saved = false, onToggleSave }) {
	const rating = decorFormatRating(service.rating, service.reviews);
	return (
		<div style={{ borderRadius: 16, background: service.gradient, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", display: "flex", flexDirection: "column", animation: `fadeUp 0.4s ease ${delay}ms both` }}>
			{/* Image area */}
			<div role="img" aria-label={service.name} style={{ height: 150, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", ...decorThumbStyle(service.image, service.gradient) }}>
				{!service.image && <DecorIcon s={38} />}
				<div style={{ position: "absolute", top: 10, left: 10, background: "rgba(0,0,0,0.5)", borderRadius: 20, padding: "4px 10px" }}>
					<span style={{ fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase" }}>{service.category}</span>
				</div>
				<button
					type="button"
					aria-label={saved ? i18n.t("common.unsave", { defaultValue: "Remove from saved" }) : i18n.t("common.save", { defaultValue: "Save" })}
					aria-pressed={saved}
					onClick={(e) => { e.stopPropagation(); onToggleSave?.(service); }}
					style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.45)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: saved ? "#d97706" : "rgba(255,255,255,0.6)" }}
				>
					<svg width={14} height={14} viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
				</button>
			</div>
			{/* Info */}
			<div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
				<p style={{ fontSize: 15, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.3 }}>{service.name}</p>
				{/* Rating */}
				<div style={{ display: "flex", alignItems: "center", gap: 5 }}>
					{rating.detail ? (
						<>
							<svg width={12} height={12} viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
							<span style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", fontFamily: "'DM Sans', sans-serif" }}>{rating.label}</span>
							<span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif" }}>{rating.detail}</span>
						</>
					) : (
						<span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.45)", fontFamily: "'DM Sans', sans-serif" }}>{rating.label}</span>
					)}
				</div>
				{service.distanceKm != null && (
					<p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
						{i18n.t("decor.distanceAway", { distance: service.distanceKm.toFixed(1) })}
					</p>
				)}
				{/* Tags */}
				<div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
					{(service.tags || []).map(t => (
						<span key={t} style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif", background: "rgba(255,255,255,0.05)", padding: "2px 7px", borderRadius: 10 }}>{t}</span>
					))}
				</div>
				{/* Price + CTA */}
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: "auto", paddingTop: 6 }}>
					<div>
						<span style={{ fontSize: 20, fontWeight: 800, color: "#d97706", fontFamily: "'Barlow Condensed', sans-serif" }}>${service.price}</span>
						<span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif" }}>/{service.unit}</span>
					</div>
					<div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
						<AddToWishlistButton item={service} kind="booking" accent="#d97706" compact />
						<button onClick={onBook} style={{ background: "#d97706", border: "none", borderRadius: 8, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, padding: "7px 14px", cursor: "pointer" }}>{i18n.t("common.book")}</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function getDecorTiles() {
	return [
		{ id: "services",  label: i18n.t("discounts.categories.services"),  descKey: "decor.tileServicesDesc", gradient: "linear-gradient(135deg, #1a1028, #0e0918)", accent: "#a855f7", Icon: DecorIcon },
		{ id: "rentals",   label: i18n.t("decor.rentals"),   descKey: "decor.tileRentalsDesc", gradient: "linear-gradient(135deg, #0d2a1a, #06180c)", accent: "#059669", Icon: DecorIcon },
		{ id: "shop",      label: i18n.t("shop.title"),      descKey: "decor.tileShopDesc", gradient: "linear-gradient(135deg, #1a1a0a, #111106)", accent: "#d97706", Icon: DecorIcon },
		{ id: "seasonal",  label: i18n.t("decor.seasonal"),  descKey: "decor.tileSeasonalDesc", gradient: "linear-gradient(135deg, #2a0a0a, #1c0606)", accent: "#dc2626", Icon: DecorIcon },
	];
}

function DecorServiceDetailPage({ service, onBack }) {
	const { isMobile } = useViewport();
	const [bookDate, setBookDate] = useState("");
	const [bookTime, setBookTime] = useState("");
	const [bookNotes, setBookNotes] = useState("");
	const [bookRefCode, setBookRefCode] = useState("");
	const [refApplied, setRefApplied] = useState(false);
	const [refLoading, setRefLoading] = useState(false);
	const [refError, setRefError] = useState(null);
	const [booked, setBooked] = useState(false);
	const [booking, setBooking] = useState(false);
	const [bookError, setBookError] = useState(null);
	const [chatOpen, setChatOpen] = useState(false);
	const [chatMsg, setChatMsg] = useState("");
	const [chatSent, setChatSent] = useState(false);
	const [chatSending, setChatSending] = useState(false);
	const [chatError, setChatError] = useState(null);
	const [quote, setQuote] = useState(null);
	const [quoteLoading, setQuoteLoading] = useState(false);
	const [quoteError, setQuoteError] = useState(null);
	const payBooking = useBookingPayment();
	const unavailableDates = useDecorUnavailableDates(service.listingId);
	const timeSlots = useMemo(() => decorResolveTimeSlots(service.timeSlots), [service.timeSlots]);
	const canBook = Boolean(service.listingId);
	const dateBlocked = Boolean(bookDate && unavailableDates.has(bookDate));
	const ready = bookDate && bookTime && !dateBlocked;
	const rating = decorFormatRating(service.rating, service.reviews);
	const estSubtotal = Number(service.price) || 0;
	const estServiceFee = Math.round(estSubtotal * 0.12 * 100) / 100;
	const estDeposit = Number(service.deposit) || 0;
	const subtotal = quote?.subtotal ?? estSubtotal;
	const serviceFee = quote?.service_fee ?? estServiceFee;
	const cleaningFee = Number(quote?.cleaning_fee) || 0;
	const deposit = quote?.deposit ?? estDeposit;
	const total = quote?.total ?? (estSubtotal + estServiceFee + estDeposit);
	const unavailable = quote ? quote.available === false : false;
	const quoteFailed = ready && !quoteLoading && !quote;
	const canPay = ready && canBook && !unavailable && !quoteLoading && !!quote && !quoteFailed;

	useEffect(() => {
		if (!ready || !service.listingId) { setQuote(null); setQuoteError(null); return undefined; }
		let cancelled = false;
		setQuoteLoading(true);
		setQuoteError(null);
		getBookingQuote({
			booking_listing_id: service.listingId,
			start_date: bookDate,
			start_time: decorTo24h(bookTime),
			quantity: 1,
		}).then((res) => {
			if (cancelled) return;
			setQuote(res?.data ?? res);
			setQuoteError(null);
		}).catch(() => {
			if (!cancelled) {
				setQuote(null);
				setQuoteError(i18n.t("decor.quoteFailed"));
			}
		}).finally(() => { if (!cancelled) setQuoteLoading(false); });
		return () => { cancelled = true; };
	}, [bookDate, bookTime, ready, service.listingId]);

	async function handleSendMessage() {
		if (!chatMsg.trim() || chatSending) return;
		setChatError(null);
		if (!isAuthenticated()) { setChatError(i18n.t("decor.loginToMessage")); return; }
		if (!service.hostId) { setChatError(i18n.t("decor.providerContactUnavailable")); return; }
		setChatSending(true);
		try {
			await messageUser(service.hostId, {
				initialMessage: chatMsg.trim(),
				navigate: false,
				sourceVertical: "decor",
			});
			setChatSent(true);
			setChatMsg("");
		} catch {
			setChatError(i18n.t("decor.messageSendFailed"));
		} finally {
			setChatSending(false);
		}
	}

	async function handleBook() {
		if (booking || !canPay) return;
		setBookError(null);
		if (!isAuthenticated()) { setBookError(i18n.t("decor.loginToBookService")); return; }
		setBooking(true);
		try {
			const res = await createBooking({ booking_listing_id: service.listingId, start_date: bookDate, start_time: decorTo24h(bookTime), notes: bookNotes });
			const bk = res?.data ?? res;
			if (!bk?.booking_id) { setBookError(i18n.t("decor.bookingFailed")); setBooking(false); return; }
			const pay = await payBooking(bk.booking_id);
			if (!pay.ok) { setBookError(pay.error); setBooking(false); return; }
			setBooked(true);
		} catch (err) {
			const status = err?.response?.status;
			setBookError(err?.response?.data?.message || (status === 409 ? i18n.t("decor.slotTaken") : i18n.t("decor.bookingFailed")));
			setBooking(false);
		}
	}

	if (booked) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 40, paddingBottom: 24, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, textAlign: "center" }}>
			<div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(168,85,247,0.15)", border: "2px solid #a855f7", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
				<svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
			</div>
			<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, marginBottom: 8 }}>{i18n.t("common.bookingConfirmed")}!</h2>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 6 }}>{service.name}</p>
			<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 28 }}>{i18n.t("decor.bookingPaidConfirmed")}</p>
			<button type="button" onClick={onBack} style={{ background: "#a855f7", border: "none", borderRadius: 12, padding: "12px 28px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>{i18n.t("decor.backToServices")}</button>
		</div>
	);

	return (
		<div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 28, paddingBottom: 24 }}>
			<div style={{ maxWidth: 920, margin: "0 auto", width: "100%" }}>
			<button type="button" onClick={onBack} aria-label={i18n.t("decor.backToServices")} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 20, padding: 0 }}>
				<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
				{i18n.t("discounts.categories.services")}
			</button>
			<div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
				<div style={{ flex: 2, minWidth: 280 }}>
					<div role="img" aria-label={service.name} style={{ height: 200, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, position: "relative", ...decorThumbStyle(service.image, service.gradient) }}>
						{!service.image && <DecorIcon s={52} />}
						<div style={{ position: "absolute", top: 14, left: 14, background: "rgba(0,0,0,0.5)", borderRadius: 20, padding: "4px 12px" }}>
							<span style={{ fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase" }}>{service.category}</span>
						</div>
					</div>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 32, marginBottom: 8 }}>{service.name}</h1>
					<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
						{rating.detail ? (
							<>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="#f59e0b" stroke="none" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
								<span style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b", fontFamily: "'DM Sans', sans-serif" }}>{rating.label}</span>
								<span className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{rating.detail}</span>
							</>
						) : (
							<span className="text-text-muted" style={{ fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{rating.label}</span>
						)}
						<span style={{ fontSize: 20, fontWeight: 800, color: "#d97706", fontFamily: "'Barlow Condensed', sans-serif", marginLeft: 8 }}>${service.price}<span className="text-text-secondary" style={{ fontSize: 12, fontWeight: 400, fontFamily: "'DM Sans', sans-serif" }}>/{service.unit}</span></span>
					</div>
					<div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
						{(service.tags || []).map(t => <span key={t} className="text-text-secondary bg-surface-raised" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", padding: "3px 9px", borderRadius: 10 }}>{t}</span>)}
					</div>
					<DecorListingMeta description={service.description} provider={service.provider} location={service.location} accent="#a855f7" />
					<div className="bg-surface-raised border border-border" style={{ borderRadius: 14, padding: "16px 18px", marginBottom: 8 }}>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: chatOpen ? 14 : 0 }}>
							<div>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{i18n.t("decor.haveQuestion")}</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("decor.messageProvider")}</p>
							</div>
							<button type="button" onClick={() => { setChatOpen(v => !v); setChatSent(false); }} style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 8, padding: "8px 16px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: "#a855f7", cursor: "pointer" }}>
								{chatOpen ? i18n.t("common.close") : i18n.t("automotive.message")}
							</button>
						</div>
						{chatOpen && !chatSent && (
							<>
								<textarea value={chatMsg} onChange={e => setChatMsg(e.target.value)} placeholder={i18n.t("decor.chatPlaceholderService")} rows={3}
									className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 13px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "vertical", marginBottom: 10 }}
									onFocus={e => e.target.style.borderColor = "rgba(168,85,247,0.5)"}
									onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
								{chatError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 8 }}>{chatError}</p>}
								<button type="button" onClick={handleSendMessage} disabled={!chatMsg.trim() || chatSending} style={{ background: chatMsg.trim() ? "#a855f7" : "var(--color-surface-raised)", border: "none", borderRadius: 8, padding: "9px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: chatMsg.trim() ? "#fff" : "var(--color-text-muted)", cursor: chatMsg.trim() && !chatSending ? "pointer" : "default" }}>{chatSending ? i18n.t("common.sending", { defaultValue: "Sending…" }) : i18n.t("common.sendMessage")}</button>
							</>
						)}
						{chatOpen && chatSent && (
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#a855f7", fontWeight: 600 }}>{i18n.t("decor.messageSentProvider")}</p>
						)}
					</div>
				</div>
				<div style={{ ...(isMobile ? { width: "100%", maxWidth: "100%" } : { flex: 1, minWidth: 240, maxWidth: 320, position: "sticky", top: 0 }) }}>
					<div className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: "20px 20px 22px" }}>
						<p className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>{i18n.t("decor.bookThisService")}</p>
						<div style={{ marginBottom: 16 }}>
							<AddToWishlistButton item={service} kind="booking" accent="#a855f7" label="Add to Wishlist" />
						</div>
						<div style={{ marginBottom: 14 }}>
							<label htmlFor="decor-svc-date" className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginBottom: 6, display: "block" }}>{i18n.t("decor.preferredDate")}</label>
							{/* colorScheme stays "dark" regardless of theme — matches the established pattern for
							    native date/time inputs elsewhere (see Preconstruct.jsx, Dating.jsx, Catering.jsx). */}
							<input id="decor-svc-date" type="date" min={decorTodayISO()} value={bookDate} onChange={e => { setBookDate(e.target.value); setBookTime(""); }}
								className="bg-surface-raised text-text-primary" style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${dateBlocked ? "rgba(248,113,113,0.5)" : "var(--color-border)"}`, borderRadius: 10, padding: "10px 13px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", colorScheme: "dark" }}
								onFocus={e => e.target.style.borderColor = "rgba(168,85,247,0.5)"}
								onBlur={e => e.target.style.borderColor = dateBlocked ? "rgba(248,113,113,0.5)" : "var(--color-border)"} />
							{dateBlocked && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#f87171", marginTop: 6 }}>{i18n.t("decor.dateUnavailable")}</p>}
						</div>
						<div style={{ marginBottom: 14 }}>
							<label htmlFor="decor-svc-time" className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginBottom: 6, display: "block" }}>{i18n.t("decor.preferredTime")}</label>
							<select id="decor-svc-time" value={bookTime} onChange={e => setBookTime(e.target.value)}
								className={`bg-surface-raised border border-border ${bookTime ? "text-text-primary" : "text-text-muted"}`} style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 13px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", colorScheme: "dark" }}>
								<option value="">{i18n.t("common.selectTime")}</option>
								{timeSlots.map(t => <option key={t} value={t}>{t}</option>)}
							</select>
						</div>
						<div style={{ marginBottom: 14 }}>
							<label htmlFor="decor-svc-notes" className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginBottom: 6, display: "block" }}>{i18n.t("common.notesOptional")}</label>
							<textarea id="decor-svc-notes" value={bookNotes} onChange={e => setBookNotes(e.target.value)} placeholder={i18n.t("decor.bookNotesPlaceholder")} rows={2}
								className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 13px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "vertical" }}
								onFocus={e => e.target.style.borderColor = "rgba(168,85,247,0.5)"}
								onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
						</div>
						<div style={{ marginBottom: refError ? 8 : 14 }}>
							<label htmlFor="decor-svc-ref" className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginBottom: 6, display: "block" }}>{i18n.t("decor.referralOptional")}</label>
							<div style={{ display: "flex", gap: 6 }}>
								<input id="decor-svc-ref" value={bookRefCode} onChange={e => { setBookRefCode(e.target.value); setRefApplied(false); setRefError(null); }} placeholder={i18n.t("decor.referralDiscountPlaceholder")}
									className="text-text-primary" style={{ flex: 1, boxSizing: "border-box", background: refApplied ? "rgba(5,150,105,0.1)" : "var(--color-surface-raised)", border: `1px solid ${refApplied ? "rgba(5,150,105,0.4)" : "var(--color-border)"}`, borderRadius: 10, padding: "9px 11px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, outline: "none" }}
									onFocus={e => !refApplied && (e.target.style.borderColor = "rgba(168,85,247,0.5)")}
									onBlur={e => !refApplied && (e.target.style.borderColor = "var(--color-border)")} />
								<button type="button" onClick={async () => { if (!bookRefCode.trim() || refLoading || refApplied) return; setRefLoading(true); setRefError(null); try { await bindCheckoutReferralCode(bookRefCode.trim()); setRefApplied(true); } catch (e) { setRefError(e?.response?.data?.message || i18n.t("decor.invalidReferralCode")); } finally { setRefLoading(false); } }}
									style={{ padding: "9px 11px", background: refApplied ? "#059669" : "#a855f7", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, cursor: refApplied || refLoading ? "default" : "pointer", whiteSpace: "nowrap", opacity: !bookRefCode.trim() ? 0.5 : 1, transition: "background 0.2s" }}>
									{refApplied ? "✓" : refLoading ? "…" : i18n.t("common.apply")}
								</button>
							</div>
							{refApplied && <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginTop: 4 }}>{i18n.t("decor.referralRecorded")}</p>}
							{refError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#f87171", marginTop: 4, marginBottom: 10 }}>{refError}</p>}
						</div>
						{ready && quote && (
							<div style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
								<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("common.subtotal")}</span>
									<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>${decorMoney(subtotal)}</span>
								</div>
								{cleaningFee > 0 && (
									<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
										<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("common.cleaningFee")}</span>
										<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>${decorMoney(cleaningFee)}</span>
									</div>
								)}
								<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("common.serviceFee")}</span>
									<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>${decorMoney(serviceFee)}</span>
								</div>
								{deposit > 0 && (
									<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
										<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("common.refundableDeposit")}</span>
										<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>${decorMoney(deposit)}</span>
									</div>
								)}
								<div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--color-border-subtle)", paddingTop: 6, marginTop: 4 }}>
									<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13 }}>{i18n.t("common.totalDue")}</span>
									<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, color: "#a855f7" }}>${decorMoney(total)}</span>
								</div>
							</div>
						)}
						{unavailable && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 10 }}>{quote?.reason || i18n.t("decor.slotUnavailable")}</p>}
						{quoteError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 10 }}>{quoteError}</p>}
						{canPay && <CardPaymentField />}
						{bookError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 10 }}>{bookError}</p>}
						<button type="button" onClick={handleBook} disabled={!canPay || booking}
							style={{ width: "100%", background: canPay ? (booking ? "#7c3aed" : "#a855f7") : "var(--color-surface-raised)", border: "none", borderRadius: 12, padding: "13px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: canPay ? "#fff" : "var(--color-text-muted)", cursor: (canPay && !booking) ? "pointer" : "default", transition: "background 0.2s" }}>
							{booking ? i18n.t("common.processing", { defaultValue: "Processing…" }) : quoteLoading ? i18n.t("decor.checkingPrice") : dateBlocked ? i18n.t("decor.dateUnavailable") : !ready ? i18n.t("decor.selectDateTime") : quoteFailed ? i18n.t("decor.quoteFailed") : unavailable ? i18n.t("common.unavailable") : `${i18n.t("common.confirmAndPay")} $${decorMoney(total)}`}
						</button>
					</div>
				</div>
			</div>
			</div>
		</div>
	);
}

function DecorServicesSubPage({ onBack, initialCategory = "all" }) {
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const searchPlaceholder = i18n.t("decor.searchPlaceholder");
	const categories = useI18nCategoryList(DECOR_CATEGORY_DEFS);
	const [activeCategory, setActiveCategory] = useState(() => {
		const id = String(initialCategory || "all");
		return DECOR_CATEGORY_DEFS.some((c) => c.id === id) ? id : "all";
	});
	const [query, setQuery] = useState("");
	const [selectedService, setSelectedService] = useState(null);
	const [decorServices, setDecorServices] = useState([]);
	const [listError, setListError] = useState(false);
	const [savedIds, setSavedIds] = useState(() => new Set());
	const [saveHint, setSaveHint] = useState(null);
	function loadServices() {
		getBookingListings({ vertical: 'decor' }).then(res => {
			setListError(false);
			const arr = Array.isArray(res) ? res : (res?.data ?? []);
			setDecorServices(arr.filter(l => (l.attributes?.type) === 'services').map(l => {
				const a = l.attributes ?? {};
				const imgs = Array.isArray(l.images) ? l.images.filter(Boolean) : [];
				const featuredFlag = a.featured === true || a.featured === 'true';
				const { rating, reviews } = decorListingRating(l);
				return {
					id: l.booking_listing_id,
					listingId: l.booking_listing_id,
					hostId: l.owner_id ?? null,
					name: l.title || 'Service',
					description: l.description || a.description || '',
					category: a.category || 'General',
					price: Number(l.price) || 0,
					unit: a.unit || 'session',
					deposit: Number(l.deposit_amount) || 0,
					rating,
					reviews,
					location: l.location || '',
					latitude: l.latitude != null ? Number(l.latitude) : null,
					longitude: l.longitude != null ? Number(l.longitude) : null,
					featured: featuredFlag,
					gradient: a.gradient || "linear-gradient(135deg,#1e1b4b,#7c3aed)",
					image: imgs[0] || null,
					tags: Array.isArray(a.tags) ? a.tags : [],
					provider: a.provider || '',
					timeSlots: a.time_slots ?? null,
				};
			}));
		}).catch(() => setListError(true));
	}
	useEffect(() => { loadServices(); }, []);
	const nearby = useDecorNearby(decorServices);
	useEffect(() => {
		const pending = window.__pendingListingId;
		const pendingVertical = window.__pendingListingVertical;
		if (!pending || (pendingVertical && pendingVertical !== "decor")) return;
		delete window.__pendingListingId;
		delete window.__pendingListingVertical;
		const openFromRow = (l) => {
			if (!l) return;
			const a = l.attributes ?? {};
			const imgs = Array.isArray(l.images) ? l.images.filter(Boolean) : [];
			setSelectedService({
				id: l.booking_listing_id,
				listingId: l.booking_listing_id,
				hostId: l.owner_id ?? null,
				name: l.title || "Service",
				category: a.category || "General",
				price: Number(l.price) || 0,
				unit: a.unit || "session",
				deposit: Number(l.deposit_amount) || 0,
				rating: null,
				reviews: 0,
				location: l.location || "",
				featured: a.featured === true || a.featured === "true",
				gradient: a.gradient || "linear-gradient(135deg,#1e1b4b,#7c3aed)",
				image: imgs[0] || null,
				tags: Array.isArray(a.tags) ? a.tags : [],
				provider: a.provider || "",
			});
		};
		const cached = decorServices.find((s) => String(s.id) === String(pending) || String(s.listingId) === String(pending));
		if (cached) {
			setSelectedService(cached);
			return;
		}
		getBookingListing(pending).then((res) => {
			const row = res?.data ?? res;
			if (!row || (row.vertical && row.vertical !== "decor")) return;
			openFromRow(row);
		}).catch(() => {});
	}, [decorServices]);
	useEffect(() => {
		if (!isAuthenticated()) return;
		getSaves("listing").then((res) => {
			const rows = Array.isArray(res) ? res : (res?.data ?? []);
			setSavedIds(new Set(rows.map((r) => String(r.entity_id))));
		}).catch(() => {});
	}, []);

	async function toggleServiceSave(service) {
		if (!service?.id) return;
		if (!isAuthenticated()) {
			setSaveHint(i18n.t("decor.loginToSave"));
			setTimeout(() => setSaveHint(null), 3200);
			return;
		}
		const id = String(service.id);
		try {
			const res = await toggleSaveApi("listing", id, {
				title: service.name,
				sub: service.category,
				price: `$${service.price}`,
				accent: "#a855f7",
			});
			const saved = res?.saved ?? res?.data?.saved;
			setSavedIds((prev) => {
				const next = new Set(prev);
				if (saved === false) next.delete(id);
				else next.add(id);
				return next;
			});
		} catch { /* ignore */ }
	}

	if (selectedService) return <DecorServiceDetailPage service={selectedService} onBack={() => setSelectedService(null)} />;

	const filtered = nearby.results.filter(s => {
		const matchCat = matchesCategory(activeCategory, s.category, categories);
		const matchQ = !query || s.name.toLowerCase().includes(query.toLowerCase()) || s.category.toLowerCase().includes(query.toLowerCase());
		return matchCat && matchQ;
	});
	const featured = filtered.filter(s => s.featured);
	const rest = filtered.filter(s => !s.featured);

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px" }}>
					<SkeletonHeading />
					<div style={{ display: "flex", gap: 20, margin: "16px 0 28px" }}>
						{[...Array(6)].map((_,i) => <SkeletonCircle key={i} />)}
					</div>
				</div>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))", gap: 16 }}>
					{[...Array(6)].map((_,i) => <SkeletonServiceCard key={i} />)}
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
						<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, padding: 0 }}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
							Décor
						</button>
						<HostListingCTA vertical="decor" label="List a service" presetAttrs={{ type: "services" }} onCreated={loadServices} />
					</div>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 20, textAlign: "center" }}>{i18n.t("discounts.categories.services")}</h1>
					{listError && (
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#fbbf24", marginBottom: 16, textAlign: "center" }}>{i18n.t("common.listError.retryLater")}</p>
					)}
					{saveHint && (
						<p role="status" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#a855f7", marginBottom: 12, textAlign: "center" }}>{saveHint}</p>
					)}
					<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
						<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
							<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={20} /></div>
							<input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#a855f7" }} />
						</div>
					</div>
					<DecorNearbyControls nearby={nearby} accent="#a855f7" />
				</div>
				<div style={{ position: "relative", marginBottom: 24 }}>
					<div style={{ display: "flex", gap: 20, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4, animation: "fadeUp 0.35s ease 60ms both", scrollbarWidth: "none", justifyContent: isMobile ? "flex-start" : "center" }}>
						{categories.map((cat, i) => (
							<LeoButton key={cat.id} cat={cat} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 30} />
						))}
					</div>
					{isMobile && (
						<div style={{ position: "absolute", right: 0, top: 0, bottom: 4, width: 48, background: "linear-gradient(to left, var(--color-bg) 20%, transparent 100%)", pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
							<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
						</div>
					)}
				</div>
				{featured.length > 0 && (
					<div style={{ marginBottom: 32, animation: "fadeUp 0.4s ease 120ms both" }}>
						<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>{i18n.t("common.featured")}</p>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))", gap: 16 }}>
							{featured.map((s, i) => <DecorServiceCard key={s.id} service={s} delay={i * 50} onBook={() => setSelectedService(s)} saved={savedIds.has(String(s.id))} onToggleSave={toggleServiceSave} />)}
						</div>
					</div>
				)}
				{rest.length > 0 && (
					<div style={{ marginBottom: 32, animation: "fadeUp 0.4s ease 180ms both" }}>
						<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>{i18n.t("common.allServices")}</p>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(240px, 100%), 1fr))", gap: 16 }}>
							{rest.map((s, i) => <DecorServiceCard key={s.id} service={s} delay={i * 40} onBook={() => setSelectedService(s)} saved={savedIds.has(String(s.id))} onToggleSave={toggleServiceSave} />)}
						</div>
					</div>
				)}
				{filtered.length === 0 && (
					<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: 0.4, paddingBottom: 24 }}>
						<DecorIcon s={40} />
						<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>{i18n.t("common.noServicesFound")}</p>
					</div>
				)}
			</div>
		</div>
	);
}


const DECOR_RENTAL_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#059669", match: null },
	{ id: "furniture", labelKey: "decor.catFurniture", color: "#059669", match: "Furniture" },
	{ id: "lighting", labelKey: "decor.catLighting", color: "#f59e0b", match: "Lighting" },
	{ id: "wallart", labelKey: "decor.catWallArt", color: "#3b82f6", match: "Wall Art" },
	{ id: "rugs", labelKey: "decor.catRugs", color: "#d97706", match: "Rugs" },
	{ id: "outdoor", labelKey: "decor.catOutdoor", color: "#10b981", match: "Outdoor" },
	{ id: "accessories", labelKey: "decor.catAccessories", color: "#6366f1", match: "Accessories" },
	{ id: "textiles", labelKey: "decor.catTextiles", color: "#ec4899", match: "Textiles" },
];


const DECOR_SHOP_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#d97706", match: null },
	{ id: "furniture", labelKey: "decor.catFurniture", color: "#059669", match: "Furniture" },
	{ id: "lighting", labelKey: "decor.catLighting", color: "#f59e0b", match: "Lighting" },
	{ id: "wallart", labelKey: "decor.catWallArt", color: "#3b82f6", match: "Wall Art" },
	{ id: "rugs", labelKey: "decor.catRugs", color: "#d97706", match: "Rugs" },
	{ id: "accessories", labelKey: "decor.catAccessories", color: "#6366f1", match: "Accessories" },
	{ id: "outdoor", labelKey: "decor.catOutdoor", color: "#10b981", match: "Outdoor" },
];

function DecorRentalDetailPage({ item, onBack }) {
	const { isMobile } = useViewport();
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");
	const [chatOpen, setChatOpen] = useState(false);
	const [chatMsg, setChatMsg] = useState("");
	const [chatSent, setChatSent] = useState(false);
	const [chatSending, setChatSending] = useState(false);
	const [chatError, setChatError] = useState(null);
	const [booked, setBooked] = useState(false);
	const [booking, setBooking] = useState(false);
	const [bookError, setBookError] = useState(null);
	const [quote, setQuote] = useState(null);
	const [quoteLoading, setQuoteLoading] = useState(false);
	const [quoteError, setQuoteError] = useState(null);
	const payBooking = useBookingPayment();
	const unavailableDates = useDecorUnavailableDates(item.listingId);
	const canList = Boolean(item.listingId);
	const startBlocked = Boolean(startDate && unavailableDates.has(startDate));
	const endBlocked = Boolean(endDate && unavailableDates.has(endDate));
	const days = startDate && endDate && !startBlocked && !endBlocked ? Math.max(0, Math.round((new Date(endDate) - new Date(startDate)) / 86400000)) : 0;
	const estSubtotal = days * item.perDay;
	const estServiceFee = Math.round(estSubtotal * 0.12 * 100) / 100;
	const estDeposit = Number(item.deposit) || 0;
	const subtotal = quote?.subtotal ?? estSubtotal;
	const serviceFee = quote?.service_fee ?? estServiceFee;
	const cleaningFee = Number(quote?.cleaning_fee) || 0;
	const deposit = quote?.deposit ?? estDeposit;
	const total = quote?.total ?? (estSubtotal + estServiceFee + estDeposit);
	const unavailable = quote ? quote.available === false : !item.available;
	const quoteFailed = days > 0 && !quoteLoading && !quote;
	const canBook = item.available && startDate && endDate && days > 0 && canList && !unavailable && !!quote && !quoteFailed && !startBlocked && !endBlocked;

	useEffect(() => {
		if (!(days > 0) || !item.listingId) { setQuote(null); setQuoteError(null); return undefined; }
		let cancelled = false;
		setQuoteLoading(true);
		setQuoteError(null);
		getBookingQuote({
			booking_listing_id: item.listingId,
			start_date: startDate,
			end_date: endDate,
			quantity: 1,
		}).then((res) => {
			if (cancelled) return;
			setQuote(res?.data ?? res);
			setQuoteError(null);
		}).catch(() => {
			if (!cancelled) {
				setQuote(null);
				setQuoteError(i18n.t("decor.quoteFailed"));
			}
		}).finally(() => { if (!cancelled) setQuoteLoading(false); });
		return () => { cancelled = true; };
	}, [startDate, endDate, days, item.listingId]);

	async function handleSendRentalMessage() {
		if (!chatMsg.trim() || chatSending) return;
		setChatError(null);
		if (!isAuthenticated()) { setChatError(i18n.t("decor.loginToMessageSupplier")); return; }
		if (!item.hostId) { setChatError(i18n.t("decor.supplierContactUnavailable")); return; }
		setChatSending(true);
		try {
			await messageUser(item.hostId, { initialMessage: chatMsg.trim(), navigate: false, sourceVertical: "decor" });
			setChatSent(true);
			setChatMsg("");
		} catch {
			setChatError(i18n.t("decor.messageSendFailed"));
		} finally {
			setChatSending(false);
		}
	}

	async function handleReserve() {
		if (booking || !canBook || quoteLoading) return;
		setBookError(null);
		if (!isAuthenticated()) { setBookError(i18n.t("decor.loginToRent")); return; }
		setBooking(true);
		try {
			const res = await createBooking({ booking_listing_id: item.listingId, start_date: startDate, end_date: endDate, notes: `Décor rental — ${item.name}` });
			const bk = res?.data ?? res;
			if (!bk?.booking_id) { setBookError(i18n.t("decor.rentalFailed")); setBooking(false); return; }
			const pay = await payBooking(bk.booking_id);
			if (!pay.ok) { setBookError(pay.error); setBooking(false); return; }
			setBooked(true);
		} catch (err) {
			const status = err?.response?.status;
			setBookError(err?.response?.data?.message || (status === 409 ? i18n.t("decor.datesTaken") : i18n.t("decor.rentalFailed")));
			setBooking(false);
		}
	}

	if (booked) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 40, paddingBottom: 24, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, textAlign: "center" }}>
			<div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(5,150,105,0.15)", border: "2px solid #059669", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
				<svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
			</div>
			<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, marginBottom: 8 }}>{i18n.t("decor.rentalBooked")}</h2>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 6 }}>{item.name}</p>
			<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 28 }}>{i18n.t("decor.rentalPaidConfirmed")}</p>
			<button type="button" onClick={onBack} style={{ background: "#059669", border: "none", borderRadius: 12, padding: "12px 28px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>{i18n.t("decor.backToRentals")}</button>
		</div>
	);

	return (
		<div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 28, paddingBottom: 24 }}>
			<div style={{ maxWidth: 920, margin: "0 auto", width: "100%" }}>
			<button type="button" onClick={onBack} aria-label={i18n.t("decor.backToRentals")} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 20, padding: 0 }}>
				<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
				{i18n.t("decor.rentals")}
			</button>
			<div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
				{/* Left: item info + contact */}
				<div style={{ flex: 2, minWidth: 280 }}>
					<div role="img" aria-label={item.name} style={{ height: 220, borderRadius: 16, marginBottom: 20, position: "relative", ...decorThumbStyle(item.thumb) }}>
						{!item.available && <div style={{ position: "absolute", inset: 0, borderRadius: 16, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#fff", background: "rgba(220,38,38,0.8)", padding: "6px 14px", borderRadius: 20, letterSpacing: "0.08em", textTransform: "uppercase" }}>{i18n.t("common.unavailable")}</span></div>}
					</div>
					<div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
						<span className="bg-surface-raised border border-border text-text-secondary" style={{ borderRadius: 6, padding: "3px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{item.category}</span>
					</div>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, marginBottom: 8 }}>{item.name}</h1>
					<div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
						<div><span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, color: "#059669" }}>${item.perDay}</span><span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginLeft: 4 }}>/day</span></div>
						<div><span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("common.deposit")} </span><span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff" }}>${item.deposit}</span></div>
					</div>
					<DecorListingMeta description={item.description} provider={item.provider} location={item.location} accent="#059669" />
					<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.55, marginBottom: 16 }}>{i18n.t("decor.rentalDamagePolicy")}</p>
					{/* Contact supplier */}
					<div className="bg-surface-raised border border-border" style={{ borderRadius: 14, padding: "16px 18px" }}>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: chatOpen ? 14 : 0 }}>
							<div><p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{i18n.t("decor.contactSupplier")}</p><p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("decor.askAvailability")}</p></div>
							<button type="button" onClick={() => { setChatOpen(v => !v); setChatSent(false); }} style={{ background: "rgba(5,150,105,0.12)", border: "1px solid rgba(5,150,105,0.3)", borderRadius: 8, padding: "8px 16px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: "#059669", cursor: "pointer" }}>{chatOpen ? i18n.t("common.close") : i18n.t("automotive.message")}</button>
						</div>
						{chatOpen && !chatSent && (
							<>
								<textarea value={chatMsg} onChange={e => setChatMsg(e.target.value)} placeholder={i18n.t("decor.chatPlaceholderRental")} rows={3} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 13px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "vertical", marginBottom: 10 }} onFocus={e => e.target.style.borderColor = "rgba(5,150,105,0.5)"} onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
								{chatError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 8 }}>{chatError}</p>}
								<button type="button" onClick={handleSendRentalMessage} disabled={!chatMsg.trim() || chatSending} style={{ background: chatMsg.trim() ? "#059669" : "var(--color-surface-raised)", border: "none", borderRadius: 8, padding: "9px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: chatMsg.trim() ? "#fff" : "var(--color-text-muted)", cursor: chatMsg.trim() && !chatSending ? "pointer" : "default" }}>{chatSending ? i18n.t("common.sending", { defaultValue: "Sending…" }) : i18n.t("common.send")}</button>
							</>
						)}
						{chatOpen && chatSent && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#059669", fontWeight: 600 }}>{i18n.t("decor.messageSentSupplier")}</p>}
					</div>
				</div>
				{/* Right: booking panel */}
				<div style={{ ...(isMobile ? { width: "100%", maxWidth: "100%" } : { flex: 1, minWidth: 240, maxWidth: 300, position: "sticky", top: 0 }) }}>
					<div className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: "20px" }}>
						<p className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>{i18n.t("decor.bookingDates")}</p>
						{[{ label: i18n.t("equipment.startDate"), val: startDate, set: setStartDate, blocked: startBlocked, id: "decor-rent-start" }, { label: i18n.t("equipment.endDate"), val: endDate, set: setEndDate, blocked: endBlocked, id: "decor-rent-end" }].map(f => (
							<div key={f.label} style={{ marginBottom: 14 }}>
								<label htmlFor={f.id} className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginBottom: 6, display: "block" }}>{f.label}</label>
								<input id={f.id} type="date" min={decorTodayISO()} value={f.val} onChange={e => f.set(e.target.value)} className="bg-surface-raised text-text-primary" style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${f.blocked ? "rgba(248,113,113,0.5)" : "var(--color-border)"}`, borderRadius: 10, padding: "10px 13px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", colorScheme: "dark" }} onFocus={e => e.target.style.borderColor = "rgba(5,150,105,0.5)"} onBlur={e => e.target.style.borderColor = f.blocked ? "rgba(248,113,113,0.5)" : "var(--color-border)"} />
								{f.blocked && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#f87171", marginTop: 6 }}>{i18n.t("decor.dateUnavailable")}</p>}
							</div>
						))}
						{days > 0 && quote && (
							<div style={{ background: "rgba(5,150,105,0.08)", border: "1px solid rgba(5,150,105,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
								<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>${item.perDay} × {days} {i18n.t("common.days", { defaultValue: "days" })}</span>
									<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>${decorMoney(subtotal)}</span>
								</div>
								{cleaningFee > 0 && (
									<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
										<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("common.cleaningFee")}</span>
										<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>${decorMoney(cleaningFee)}</span>
									</div>
								)}
								<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("common.serviceFee")}</span>
									<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>${decorMoney(serviceFee)}</span>
								</div>
								{deposit > 0 && (
									<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
										<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("common.refundableDeposit")}</span>
										<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>${decorMoney(deposit)}</span>
									</div>
								)}
								<div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--color-border-subtle)", paddingTop: 6 }}>
									<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13 }}>{i18n.t("common.totalDue")}</span>
									<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, color: "#059669" }}>${decorMoney(total)}</span>
								</div>
								{deposit > 0 && <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, marginTop: 6 }}>{i18n.t("decor.depositRefundNote")}</p>}
							</div>
						)}
						{unavailable && days > 0 && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 10 }}>{quote?.reason || i18n.t("common.unavailable")}</p>}
						{quoteError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 10 }}>{quoteError}</p>}
						{canBook && !quoteLoading && <CardPaymentField />}
						{bookError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 10 }}>{bookError}</p>}
						<button type="button" onClick={handleReserve} disabled={!canBook || booking || quoteLoading}
							style={{ width: "100%", background: (canBook && !quoteLoading) ? (booking ? "#047857" : "#059669") : "var(--color-surface-raised)", border: "none", borderRadius: 12, padding: "13px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: (canBook && !quoteLoading) ? "#fff" : "var(--color-text-muted)", cursor: (canBook && !booking && !quoteLoading) ? "pointer" : "default", transition: "background 0.2s" }}>
							{booking ? i18n.t("common.processing", { defaultValue: "Processing…" }) : quoteLoading ? i18n.t("decor.checkingPrice") : !item.available ? i18n.t("common.unavailable") : !startDate || !endDate ? i18n.t("common.selectDate") : days <= 0 ? i18n.t("decor.endAfterStart") : quoteFailed ? i18n.t("decor.quoteFailed") : unavailable ? i18n.t("common.unavailable") : `${i18n.t("common.confirmAndPay")} $${decorMoney(total)}`}
						</button>
					</div>
				</div>
			</div>
			</div>
		</div>
	);
}

function DecorRentalsSubPage({ onBack, initialCategory = "all" }) {
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const categories = useI18nCategoryList(DECOR_RENTAL_CATEGORY_DEFS);
	const [activeCat, setActiveCat] = useState(() => {
		const id = String(initialCategory || "all");
		return DECOR_RENTAL_CATEGORY_DEFS.some((c) => c.id === id) ? id : "all";
	});
	const [query, setQuery] = useState("");
	const [selectedItem, setSelectedItem] = useState(null);
	const [rentalItems, setRentalItems] = useState([]);
	const [listError, setListError] = useState(false);
	function loadRentals() {
		getBookingListings({ vertical: 'decor' }).then(res => {
			setListError(false);
			const arr = Array.isArray(res) ? res : (res?.data ?? []);
			setRentalItems(arr.filter(l => (l.attributes?.type) === 'rental').map(l => {
				const a = l.attributes ?? {};
				const imgs = Array.isArray(l.images) ? l.images.filter(Boolean) : [];
				const { rating, reviews } = decorListingRating(l);
				return {
					id: l.booking_listing_id,
					listingId: l.booking_listing_id,
					hostId: l.owner_id ?? null,
					name: l.title || 'Rental',
					description: l.description || a.description || '',
					category: a.category || 'General',
					perDay: Number(l.price) || 0,
					unit: 'day',
					deposit: Number(l.deposit_amount) || 0,
					available: a.available !== false,
					rating,
					reviews,
					location: l.location || '',
					latitude: l.latitude != null ? Number(l.latitude) : null,
					longitude: l.longitude != null ? Number(l.longitude) : null,
					provider: a.provider || '',
					thumb: imgs[0] || a.thumb || "linear-gradient(135deg,#1e1b4b,#7c3aed)",
					tags: Array.isArray(a.tags) ? a.tags : [],
				};
			}));
		}).catch(() => setListError(true));
	}
	useEffect(() => { loadRentals(); }, []);
	const nearby = useDecorNearby(rentalItems);
	const filtered = useMemo(
		() => nearby.results.filter((i) => {
			const matchCat = matchesCategory(activeCat, i.category, categories);
			const q = query.trim().toLowerCase();
			const matchQ = !q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q) || (i.description || "").toLowerCase().includes(q);
			return matchCat && matchQ;
		}),
		[activeCat, nearby.results, categories, query]
	);

	if (selectedItem) return <DecorRentalDetailPage item={selectedItem} onBack={() => setSelectedItem(null)} />;
	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px" }}><SkeletonHeading /><div style={{ display: "flex", gap: 20, margin: "16px 0 24px" }}>{[...Array(4)].map((_,i) => <SkeletonCircle key={i} />)}</div></div>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(240px, 100%), 1fr))", gap: 16 }}>{[...Array(6)].map((_,i) => <SkeletonProductCard key={i} w="100%" imgH={140} />)}</div>
			</div>
		</div>
	);
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
						<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, padding: 0 }}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
							Décor
						</button>
						<HostListingCTA vertical="decor" label="List a rental" presetAttrs={{ type: "rental" }} onCreated={loadRentals} />
					</div>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6, textAlign: "center" }}>{i18n.t("decor.rentals")}</h1>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 16, textAlign: "center" }}>{i18n.t("decor.rentalsSubtitle")}</p>
					{listError && (
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#fbbf24", marginTop: 8, textAlign: "center" }}>{i18n.t("common.listError.retryLater")}</p>
					)}
					<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
						<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
							<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={20} /></div>
							<input value={query} onChange={e => setQuery(e.target.value)} placeholder={i18n.t("decor.searchRentalsPlaceholder")} aria-label={i18n.t("decor.searchRentalsPlaceholder")} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#059669" }} />
						</div>
					</div>
					<DecorNearbyControls nearby={nearby} accent="#059669" />
				</div>
				<div style={{ position: "relative", marginBottom: 24 }}>
					<div style={{ display: "flex", gap: 20, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none", animation: "fadeUp 0.35s ease 60ms both", justifyContent: isMobile ? "flex-start" : "center" }}>
						{categories.map((cat, i) => (
							<ODCategoryBubble key={cat.id} cat={cat} active={activeCat === cat.id} onClick={() => setActiveCat(cat.id)} delay={i * 30} />
						))}
					</div>
					{isMobile && (
						<div style={{ position: "absolute", right: 0, top: 0, bottom: 4, width: 48, background: "linear-gradient(to left, var(--color-bg) 20%, transparent 100%)", pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
							<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
						</div>
					)}
				</div>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(240px, 100%), 1fr))", gap: 18, paddingBottom: 24, animation: "fadeUp 0.4s ease 90ms both" }}>
					{filtered.map((item, i) => (
						<div key={item.id} className="bg-surface-raised border border-border" style={{ borderRadius: 16, overflow: "hidden", animation: `fadeUp 0.35s ease ${100 + i * 50}ms both`, transition: "border-color 0.15s" }}
							onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-border)"}
							onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-surface-raised)"}>
							<div style={{ height: 140, position: "relative", ...decorThumbStyle(item.thumb) }}>
								{!item.available && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}><span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, background: "rgba(0,0,0,0.4)", borderRadius: 8, padding: "4px 12px" }}>{i18n.t("common.unavailable")}</span></div>}
								<div style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.6)", borderRadius: 8, padding: "3px 9px" }}><span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700 }}>{item.category}</span></div>
							</div>
							<div style={{ padding: "14px 16px" }}>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{item.name}</p>
								{item.distanceKm != null && (
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 6 }}>
										{i18n.t("decor.distanceAway", { distance: item.distanceKm.toFixed(1) })}
									</p>
								)}
								{(() => {
									const rating = decorFormatRating(item.rating, item.reviews);
									return (
										<div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
											{rating.detail ? (
												<>
													<svg width={11} height={11} viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
													<span style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", fontFamily: "'DM Sans', sans-serif" }}>{rating.label}</span>
													<span className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{rating.detail}</span>
												</>
											) : (
												<span className="text-text-muted" style={{ fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{rating.label}</span>
											)}
										</div>
									);
								})()}
								<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
									<div>
										<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, color: "#059669" }}>${item.perDay}</span>
										<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginLeft: 4 }}>/day</span>
									</div>
									<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>${item.deposit} deposit</span>
								</div>
								<button onClick={() => item.available && setSelectedItem(item)} style={{ width: "100%", padding: "8px 0", borderRadius: 10, background: item.available ? "rgba(5,150,105,0.1)" : "var(--color-surface-raised)", border: `1px solid ${item.available ? "rgba(5,150,105,0.3)" : "var(--color-border)"}`, color: item.available ? "#059669" : "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: item.available ? "pointer" : "not-allowed" }}>{item.available ? i18n.t("decor.rentThis") : i18n.t("common.unavailable")}</button>
							</div>
						</div>
					))}
					{filtered.length === 0 && (
						<div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: 0.45, padding: "48px 0 60px" }}>
							<DecorIcon s={40} />
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>{i18n.t("decor.noRentalsFound")}</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function DecorProductDetail({ product, onBack, onAddToCart, cartCount = 0, onViewCart }) {
	const { isMobile } = useViewport();
	const [qty, setQty] = useState(1);
	const inStock = product.isInStock !== false;

	return (
		<div style={{ flex: 1, overflowY: "auto", paddingTop: 28, paddingRight: isMobile ? 16 : 48, paddingBottom: 40, paddingLeft: isMobile ? 16 : 108 }}>
			{isMobile && onViewCart && (
				<button type="button" aria-label={i18n.t("shop.viewCart", { defaultValue: "View cart" })} onClick={onViewCart} style={{ position: "fixed", top: 12, right: 12, zIndex: 50, width: 44, height: 44, borderRadius: "50%", background: cartCount > 0 ? "#d97706" : "var(--color-surface-raised)", border: cartCount > 0 ? "none" : "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
					<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={cartCount > 0 ? "#fff" : "var(--color-text-primary)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
					{cartCount > 0 && <span style={{ position: "absolute", top: 0, right: 0, width: 18, height: 18, borderRadius: "50%", background: "#ef4444", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{cartCount}</span>}
				</button>
			)}
			<div style={{ maxWidth: 860, display: "flex", gap: 28, flexWrap: "wrap" }}>
				<div style={{ flex: 2, minWidth: 280 }}>
					<button type="button" onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 20, padding: 0 }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
						{i18n.t("common.backToShop")}
					</button>
					<div role="img" aria-label={product.name} style={{ height: 280, borderRadius: 16, marginBottom: 20, position: "relative", ...decorThumbStyle(product.thumb || product.cover, "linear-gradient(135deg,#1a1a0a,#d97706)") }}>
						<span className="text-text-secondary" style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.5)", borderRadius: 6, padding: "3px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{product.category}</span>
					</div>
					<h2 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 20, lineHeight: 1.3, marginBottom: 10 }}>{product.name}</h2>
					<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
						<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, color: "#d97706" }}>${product.price}</span>
						{product.origPrice != null && product.origPrice > product.price && (
							<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, textDecoration: "line-through" }}>${product.origPrice}</span>
						)}
					</div>
					{(product.rating != null || product.reviews) && (
						<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>★ {product.rating ?? "—"}</span>
							<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>({product.reviews || 0})</span>
						</div>
					)}
					<div className="bg-surface-raised border border-border" style={{ borderRadius: 14, padding: "16px 18px", marginBottom: 16 }}>
						<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 10 }}>{i18n.t("pinboard.fieldDescription")}</p>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.7, margin: 0 }}>
							{product.description?.trim() || i18n.t("decor.noProductDescription")}
						</p>
					</div>
					<div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 8 }}>
						{[
							{ label: i18n.t("pinboard.category"), value: product.category },
							{ label: i18n.t("decor.sellerLabel"), value: product.seller || i18n.t("decor.shopTitle") },
							{ label: i18n.t("shop.availability", { defaultValue: "Availability" }), value: inStock ? i18n.t("common.inStock", { defaultValue: "In stock" }) : i18n.t("common.outOfStock", { defaultValue: "Out of stock" }) },
						].map((d) => (
							<div key={d.label}>
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 2 }}>{d.label}</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>{d.value}</p>
							</div>
						))}
					</div>
					<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.55, marginTop: 12 }}>{i18n.t("decor.shippingReturnsNote")}</p>
				</div>
				<div style={{ flex: 1, minWidth: 220, maxWidth: 280 }}>
					<div className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: "20px", position: "sticky", top: 0 }}>
						<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, color: "#d97706", marginBottom: 16 }}>${product.price}</p>
						<div className="bg-surface-raised" style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 10, padding: "6px 14px", marginBottom: 14, width: "fit-content" }}>
							<button type="button" aria-label={i18n.t("common.decrease", { defaultValue: "Decrease quantity" })} onClick={() => setQty(q => Math.max(1, q - 1))} className="text-text-primary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>−</button>
							<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, minWidth: 20, textAlign: "center" }}>{qty}</span>
							<button type="button" aria-label={i18n.t("common.increase", { defaultValue: "Increase quantity" })} onClick={() => setQty(q => q + 1)} className="text-text-primary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>+</button>
						</div>
						<button type="button" disabled={!inStock} onClick={() => onAddToCart({ ...product, qty })} style={{ width: "100%", padding: "13px", background: inStock ? "#d97706" : "var(--color-surface-raised)", border: "none", borderRadius: 12, color: inStock ? "#fff" : "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: inStock ? "pointer" : "default", marginBottom: 10 }}>{i18n.t("shop.addToCart")}</button>
						<AddToWishlistButton item={product} kind="product" accent="#d97706" />
					</div>
				</div>
			</div>
		</div>
	);
}

function DecorShopSubPage({ onBack }) {
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [activeCat, setActiveCat] = useState("all");
	const [cart, setCart] = useState([]);
	const [shopView, setShopView] = useState("stores"); // stores | browse | product | cart | checkout | tracking
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [shopView]);
	const [shopItems, setShopItems] = useState([]);
	const [shopShops, setShopShops] = useState([]);
	const [activeShop, setActiveShop] = useState(null);
	const [selectedProduct, setSelectedProduct] = useState(null);
	const [query, setQuery] = useState("");
	const [placedOrderId, setPlacedOrderId] = useState(null);
	const [, setDeliveryMode] = useState("delivery");
	const [listError, setListError] = useState(false);
	const shopCategories = useI18nCategoryList(DECOR_SHOP_CATEGORY_DEFS);
	const resolvedProductTypeId = useResolvedProductTypeId(VERTICAL_PRODUCT_TYPE.decor);

	useEffect(() => {
		let cancelled = false;
		const { userLat, userLng } = readBuyerBrowseCoords();
		getProducts(verticalBrowseListingParams(VERTICAL_PRODUCT_TYPE.decor, { userLat, userLng }))
			.then(async (r) => {
				if (cancelled) return;
				setListError(false);
				const list = Array.isArray(r) ? r : (r?.data ?? []);
				const { products, shops } = mapListingsToVerticalCatalog(list, {
					userLat,
					userLng,
					hideStoresWithoutCoords: false,
					excludeTestNames: true,
				});
				const baseShops = shops.map((s) => ({
					...s,
					eta: s.delivery || s.eta || "—",
					fee: s.fee && s.fee !== "Free" ? s.fee : "—",
					accent: "#d97706",
					color: "#1a1a0a",
					rating: null,
					reviewCount: 0,
				}));
				setShopItems(products);
				setShopShops(baseShops);

				// Live seller ratings from product_ratings (not invented).
				const enriched = await Promise.all(baseShops.map(async (s) => {
					if (!s.id) return s;
					try {
						const res = await getProductRatingsBySeller(s.id);
						const rows = Array.isArray(res) ? res : (res?.data ?? []);
						return {
							...s,
							rating: averageSellerRating(rows),
							reviewCount: rows.length,
						};
					} catch {
						return s;
					}
				}));
				if (!cancelled) setShopShops(enriched);
			})
			.catch(() => { if (!cancelled) setListError(true); });
		return () => { cancelled = true; };
	}, []);

	function addToCart(item) {
		const qty = Math.max(1, Number(item.qty) || 1);
		setCart(prev => {
			const line = mapVerticalProductToCartLine(item, qty);
			const existing = prev.find(c => c.lineId === line.lineId);
			if (existing) return prev.map(c => c.lineId === line.lineId ? { ...c, qty: c.qty + qty } : c);
			return [...prev, line];
		});
	}

	const handlePlaceOrder = createVerticalPlaceOrderHandler({
		setOrderId: setPlacedOrderId,
		setDeliveryMode,
		setView: setShopView,
	});

	if (shopView === "product" && selectedProduct) {
		return (
			<DecorProductDetail
				product={selectedProduct}
				onBack={() => { setSelectedProduct(null); setShopView("browse"); }}
				onAddToCart={(item) => { addToCart(item); }}
				cartCount={cart.reduce((s, i) => s + i.qty, 0)}
				onViewCart={() => setShopView("cart")}
			/>
		);
	}

	if (shopView === "cart") return <CartPage cart={cart} setCart={setCart} onBack={() => setShopView("browse")} onCheckout={() => setShopView("checkout")} backLabel={i18n.t("common.backToShop")} emptyLabel={i18n.t("common.browseShop")} />;
	if (shopView === "checkout") {
		const currentShop = shopShops.find(s => s.id === activeShop);
		if (!currentShop || !activeShop) {
			return (
				<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, paddingLeft: isMobile ? 16 : 108 }}>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 16 }}>{i18n.t("decor.selectShopCheckout")}</p>
					<button type="button" onClick={() => setShopView("stores")} style={{ background: "#d97706", border: "none", borderRadius: 10, padding: "10px 20px", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{i18n.t("decor.backToShops")}</button>
				</div>
			);
		}
		return (
			<CheckoutPage
				cart={cart}
				onBack={() => setShopView("cart")}
				onPlaceOrder={handlePlaceOrder}
				restaurant={currentShop}
				sellerId={activeShop}
				productTypeId={pickCheckoutProductTypeId(cart, resolvedProductTypeId)}
				merchantType="seller"
				itemSource="product"
				vertical="decor"
			/>
		);
	}
	if (shopView === "tracking") {
		return (
			<EcomTrackingPage
				orderId={placedOrderId}
				onDone={() => { setCart([]); setPlacedOrderId(null); setActiveShop(null); setShopView("stores"); }}
			/>
		);
	}

	const cartCount = cart.reduce((s, i) => s + i.qty, 0);

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px" }}><SkeletonHeading /><div style={{ display: "flex", gap: 20, margin: "16px 0 24px" }}>{[...Array(4)].map((_,i) => <SkeletonCircle key={i} />)}</div></div>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))", gap: 16 }}>{[...Array(6)].map((_,i) => <SkeletonProductCard key={i} w="100%" imgH={140} />)}</div>
			</div>
		</div>
	);

	// ── Stores view ──
	if (shopView === "stores") {
		const sortedShops = shopShops.filter(s => !query || s.name.toLowerCase().includes(query.toLowerCase()));
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflowY: "auto", minHeight: 0 }}>
				<div style={{ maxWidth: 1100, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
					<div style={{ padding: "28px 0 20px" }}>
						<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 14, padding: 0 }}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
							Décor
						</button>
						<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, marginBottom: 16, textAlign: "center" }}>{i18n.t("decor.shopsHeading")}</h2>
						<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
							<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
								<div className="text-text-secondary" style={{ flexShrink: 0 }}><SearchIcon s={20} /></div>
								<input value={query} onChange={e => setQuery(e.target.value)} placeholder={i18n.t("decor.searchShopsPlaceholder")} aria-label={i18n.t("decor.searchShopsPlaceholder")} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif" }} />
							</div>
						</div>
						{listError && (
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#fbbf24", marginTop: 12, textAlign: "center" }}>{i18n.t("common.listError.retryLater")}</p>
						)}
					</div>

					{sortedShops.length === 0 ? (
						<div style={{ textAlign: "center", padding: "60px 20px" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>{i18n.t("decor.noShopsFound")}</p>
						</div>
					) : (
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))", gap: 20 }}>
							{sortedShops.map((shop) => (
								<div key={shop.id} role="button" tabIndex={0} onClick={() => { setActiveShop(shop.id); setShopView("browse"); setQuery(""); }}
									onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveShop(shop.id); setShopView("browse"); setQuery(""); } }}
									className="border border-border-subtle bg-surface-raised" style={{ borderRadius: 16, padding: 20, cursor: "pointer", transition: "all 0.2s" }}
									onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}
									onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = "var(--color-surface-raised)"; }}
								>
									<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
										<div style={{ width: 44, height: 44, borderRadius: "50%", background: shop.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, color: "#fff" }}>{shop.avatar}</div>
										<div>
											<p className="text-text-primary" style={{ fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{shop.name}</p>
											<p className="text-text-secondary" style={{ fontSize: 12 }}>{i18n.t("decor.shopTitle")}</p>
										</div>
									</div>
									<p className="text-text-secondary" style={{ fontSize: 12, marginBottom: 10 }}>{shop.eta}</p>
									<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
										{shop.rating != null ? (
											<>
												<span style={{ color: "#f59e0b", fontSize: 13 }}>★</span>
												<span className="text-text-primary" style={{ fontSize: 12, fontWeight: 600 }}>{shop.rating}</span>
												<span className="text-text-muted" style={{ fontSize: 11 }}>
													({shop.reviewCount || 0} {(shop.reviewCount || 0) === 1 ? "review" : "reviews"})
												</span>
											</>
										) : (
											<>
												<span className="text-text-muted" style={{ fontSize: 12, fontWeight: 600 }}>New</span>
												<span className="text-text-muted" style={{ fontSize: 11 }}>
													({shop.productCount ?? shop.reviews ?? 0} {(shop.productCount ?? shop.reviews) === 1 ? "item" : "items"})
												</span>
											</>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		);
	}

	const currentShop = shopShops.find(s => s.id === activeShop);
	if (!currentShop) {
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, paddingLeft: isMobile ? 16 : 108 }}>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 16 }}>{i18n.t("decor.shopNotFound")}</p>
				<button type="button" onClick={() => { setShopView("stores"); setActiveShop(null); }} style={{ background: "#d97706", border: "none", borderRadius: 10, padding: "10px 20px", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{i18n.t("decor.backToShops")}</button>
			</div>
		);
	}
	const filtered = shopItems.filter(item => {
		const matchShop = item.seller_id === activeShop;
		const matchCat = matchesCategory(activeCat, item.category, shopCategories);
		const matchQ = !query || item.name.toLowerCase().includes(query.toLowerCase());
		return matchShop && matchCat && matchQ;
	});

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
						<button type="button" aria-label={i18n.t("common.back", { defaultValue: "Back" })} onClick={() => { setShopView("stores"); setActiveShop(null); }} className="bg-surface-raised text-text-secondary" style={{ width: 28, height: 28, borderRadius: 8, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
							onMouseEnter={e => { e.currentTarget.style.background = "var(--color-border)"; e.currentTarget.style.color = "var(--color-text-primary)"; }}
							onMouseLeave={e => { e.currentTarget.style.background = "var(--color-surface-raised)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}>
							<svg width={7} height={12} viewBox="0 0 7 12" fill="none" aria-hidden="true"><path d="M6 1L1 6l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
						</button>
						<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, flex: 1, textAlign: "center", margin: 0 }}>{currentShop?.name ?? i18n.t("decor.shopTitle")}</h2>
						<button type="button" aria-label={i18n.t("shop.viewCart", { defaultValue: "View cart" })} onClick={() => setShopView("cart")} style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(217,119,6,0.4)", background: "rgba(217,119,6,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, position: "relative" }}
							onMouseEnter={e => e.currentTarget.style.background = "rgba(217,119,6,0.2)"}
							onMouseLeave={e => e.currentTarget.style.background = "rgba(217,119,6,0.1)"}>
							<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
							{cartCount > 0 && (
								<span style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "#d97706", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 9, color: "#fff" }}>{cartCount}</span>
							)}
						</button>
					</div>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, textAlign: "center", marginBottom: 14 }}>{currentShop?.eta}</p>
					<div className="od-search-wrap" style={{ width: "min(480px, 100%)", margin: "0 auto", marginBottom: 18 }}>
						<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "10px 14px", gap: 10 }}>
							<div className="text-text-secondary"><SearchIcon s={16} /></div>
							<input value={query} onChange={e => setQuery(e.target.value)} placeholder={i18n.t("common.search")} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif" }} />
						</div>
					</div>
				</div>
				<div style={{ position: "relative", marginBottom: 24 }}>
					<div style={{ display: "flex", gap: 20, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none", animation: "fadeUp 0.35s ease 60ms both", justifyContent: isMobile ? "flex-start" : "center" }}>
						{shopCategories.map((cat, i) => (
							<LeoButton key={cat.id} cat={cat} active={activeCat === cat.id} onClick={() => setActiveCat(cat.id)} delay={i * 30} />
						))}
					</div>
				</div>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))", gap: 18, paddingBottom: cartCount > 0 ? 80 : 32, animation: "fadeUp 0.4s ease 90ms both" }}>
					{filtered.map((item, i) => {
						const inCart = cart.find(c => c.id === item.id);
						return (
							<div key={item.id} role="button" tabIndex={0} onClick={() => { setSelectedProduct(item); setShopView("product"); }}
								onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedProduct(item); setShopView("product"); } }}
								className="bg-surface-raised border border-border" style={{ borderRadius: 16, overflow: "hidden", animation: `fadeUp 0.35s ease ${100 + i * 50}ms both`, transition: "border-color 0.15s", cursor: "pointer" }}
								onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-border)"}
								onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-surface-raised)"}>
								<div role="img" aria-label={item.name} style={{ height: 140, ...decorThumbStyle(item.thumb || item.cover) }} />
								<div style={{ padding: "14px 16px" }}>
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{item.name}</p>
									<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
										{item.rating != null ? (
											<>
												<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>★ {item.rating}</span>
												<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>({item.reviews || 0})</span>
											</>
										) : (
											<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("common.new", { defaultValue: "New" })}</span>
										)}
									</div>
									<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
										<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, color: "#d97706" }}>${item.price}</span>
										<div style={{ display: "flex", alignItems: "flex-start", gap: 6 }} onClick={(e) => e.stopPropagation()}>
											<AddToWishlistButton item={item} kind="product" accent="#d97706" compact />
											<button type="button" onClick={() => addToCart(item)} style={{ padding: "7px 14px", borderRadius: 10, background: inCart ? "rgba(217,119,6,0.15)" : "rgba(217,119,6,0.1)", border: `1px solid ${inCart ? "#d97706" : "rgba(217,119,6,0.3)"}`, color: "#d97706", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, cursor: "pointer", transition: "all 0.15s" }}>{inCart ? `✓ (${inCart.qty})` : i18n.t("common.add", { defaultValue: "Add" })}</button>
										</div>
									</div>
								</div>
							</div>
						);
					})}
				</div>
				{cartCount > 0 && (
					<div style={{ position: "sticky", bottom: 0, background: "linear-gradient(to top, var(--color-bg) 70%, transparent)", padding: "16px 0 20px" }}>
						<button type="button" onClick={() => setShopView("cart")} style={{ width: "100%", background: "#d97706", border: "none", borderRadius: 14, padding: "15px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#fff", cursor: "pointer" }}>
							{i18n.t("decor.goToCart", { count: cartCount, total: cart.reduce((s, i) => s + i.price * i.qty, 0) })}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

function DecorSeasonalSubPage({ onBack }) {
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [activeSeason, setActiveSeason] = useState("Christmas");
	const [selectedPkg, setSelectedPkg] = useState(null);
	const [seaDate, setSeaDate] = useState("");
	const [seaBooked, setSeaBooked] = useState(false);
	const [seaBooking, setSeaBooking] = useState(false);
	const [seaError, setSeaError] = useState(null);
	const [listError, setListError] = useState(false);
	const [chatOpen, setChatOpen] = useState(false);
	const [chatMsg, setChatMsg] = useState("");
	const [chatSent, setChatSent] = useState(false);
	const [chatSending, setChatSending] = useState(false);
	const [chatError, setChatError] = useState(null);
	const [quote, setQuote] = useState(null);
	const [quoteLoading, setQuoteLoading] = useState(false);
	const [quoteError, setQuoteError] = useState(null);
	const payBooking = useBookingPayment();
	// Only real booking_listing rows (attributes.type='seasonal') — no demo packages.
	const [seasonData, setSeasonData] = useState(() => {
		const out = {};
		for (const season of SEASONAL_TABS) out[season] = [];
		return out;
	});
	function loadSeasonal() {
		getBookingListings({ vertical: 'decor' }).then(res => {
			setListError(false);
			const arr = Array.isArray(res) ? res : (res?.data ?? []);
			const real = arr.filter(l => (l.attributes?.type) === 'seasonal');
			const grouped = {};
			for (const season of SEASONAL_TABS) grouped[season] = [];
			for (const l of real) {
				const a = l.attributes ?? {};
				const season = a.season || 'Other';
				const key = SEASONAL_TABS.includes(season) ? season : 'Other';
				const imgs = Array.isArray(l.images) ? l.images.filter(Boolean) : [];
				grouped[key].push({
					name: l.title || 'Package',
					description: l.description || a.description || '',
					price: Number(l.price) || 0,
					accent: a.accent || '#dc2626',
					thumb: imgs[0] || a.thumb || "linear-gradient(135deg,#2a0a0a,#1c0606)",
					items: Array.isArray(a.items) ? a.items : [],
					listingId: l.booking_listing_id,
					hostId: l.owner_id ?? null,
					provider: a.provider || '',
					location: l.location || '',
				});
			}
			setSeasonData(grouped);
		}).catch(() => setListError(true));
	}
	useEffect(() => { loadSeasonal(); }, []);
	const packages = seasonData[activeSeason] || [];

	const canList = Boolean(selectedPkg?.listingId);
	const estSubtotal = Number(selectedPkg?.price) || 0;
	const estServiceFee = Math.round(estSubtotal * 0.12 * 100) / 100;
	const subtotal = quote?.subtotal ?? estSubtotal;
	const serviceFee = quote?.service_fee ?? estServiceFee;
	const cleaningFee = Number(quote?.cleaning_fee) || 0;
	const deposit = Number(quote?.deposit) || 0;
	const total = quote?.total ?? (estSubtotal + estServiceFee + deposit);
	const unavailable = quote ? quote.available === false : false;
	const quoteFailed = Boolean(seaDate && !quoteLoading && !quote);
	const canBook = canList && seaDate && !unavailable && !!quote && !quoteFailed;

	useEffect(() => {
		if (!seaDate || !selectedPkg?.listingId) { setQuote(null); setQuoteError(null); return undefined; }
		let cancelled = false;
		setQuoteLoading(true);
		setQuoteError(null);
		getBookingQuote({
			booking_listing_id: selectedPkg.listingId,
			start_date: seaDate,
		}).then((res) => {
			if (cancelled) return;
			setQuote(res?.data ?? res);
			setQuoteError(null);
		}).catch(() => {
			if (!cancelled) {
				setQuote(null);
				setQuoteError(i18n.t("decor.quoteFailed"));
			}
		}).finally(() => { if (!cancelled) setQuoteLoading(false); });
		return () => { cancelled = true; };
	}, [seaDate, selectedPkg?.listingId]);

	async function handleSendSeasonalMessage() {
		if (!chatMsg.trim() || chatSending || !selectedPkg) return;
		setChatError(null);
		if (!isAuthenticated()) { setChatError(i18n.t("decor.loginToMessage")); return; }
		if (!selectedPkg.hostId) { setChatError(i18n.t("decor.providerContactUnavailable")); return; }
		setChatSending(true);
		try {
			await messageUser(selectedPkg.hostId, { initialMessage: chatMsg.trim(), navigate: false, sourceVertical: "decor" });
			setChatSent(true);
			setChatMsg("");
		} catch {
			setChatError(i18n.t("decor.messageSendFailed"));
		} finally {
			setChatSending(false);
		}
	}

	async function handleSeasonalBook() {
		if (seaBooking || !canBook || quoteLoading || !selectedPkg) return;
		setSeaError(null);
		if (!selectedPkg.listingId) { setSeaError(i18n.t("decor.packageUnavailable")); return; }
		if (!isAuthenticated()) { setSeaError(i18n.t("decor.loginToBookPackage")); return; }
		setSeaBooking(true);
		try {
			const res = await createBooking({ booking_listing_id: selectedPkg.listingId, start_date: seaDate, notes: `Seasonal décor — ${selectedPkg.name}` });
			const bk = res?.data ?? res;
			if (!bk?.booking_id) { setSeaError(i18n.t("decor.bookingFailed")); setSeaBooking(false); return; }
			const pay = await payBooking(bk.booking_id);
			if (!pay.ok) { setSeaError(pay.error); setSeaBooking(false); return; }
			setSeaBooked(true);
		} catch (err) {
			setSeaError(err?.response?.data?.message || i18n.t("decor.bookingFailed"));
			setSeaBooking(false);
		}
	}

	if (selectedPkg && !seaBooked) return (
		<div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 28, paddingBottom: 24 }}>
			<div style={{ maxWidth: 920, margin: "0 auto", width: "100%" }}>
			<button onClick={() => { setSelectedPkg(null); setSeaDate(""); setQuote(null); setChatOpen(false); setChatMsg(""); setChatSent(false); setChatError(null); setSeaError(null); }} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 20, padding: 0 }}>
				<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
				Seasonal Packages
			</button>
			<div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
				<div style={{ flex: 2, minWidth: 280 }}>
					<div role="img" aria-label={selectedPkg.name} style={{ height: 200, borderRadius: 16, marginBottom: 20, ...decorThumbStyle(selectedPkg.thumb) }} />
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, marginBottom: 8 }}>{selectedPkg.name}</h1>
					<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, color: selectedPkg.accent, marginBottom: 16 }}>${selectedPkg.price}</p>
					<DecorListingMeta description={selectedPkg.description} provider={selectedPkg.provider} location={selectedPkg.location} accent={selectedPkg.accent} />
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 10 }}>{i18n.t("common.includes")}</p>
					{selectedPkg.items.map(it => (
						<div key={it} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
							<div style={{ width: 5, height: 5, borderRadius: "50%", background: selectedPkg.accent, flexShrink: 0 }} />
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{it}</span>
						</div>
					))}
					<div className="bg-surface-raised border border-border" style={{ borderRadius: 14, padding: "16px 18px", marginTop: 20 }}>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: chatOpen ? 14 : 0 }}>
							<div>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{i18n.t("decor.haveQuestion")}</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("decor.messageProvider")}</p>
							</div>
							<button onClick={() => { setChatOpen(v => !v); setChatSent(false); }} style={{ background: `${selectedPkg.accent}22`, border: `1px solid ${selectedPkg.accent}55`, borderRadius: 8, padding: "8px 16px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: selectedPkg.accent, cursor: "pointer" }}>
								{chatOpen ? i18n.t("common.close") : i18n.t("automotive.message")}
							</button>
						</div>
						{chatOpen && !chatSent && (
							<>
								<textarea value={chatMsg} onChange={e => setChatMsg(e.target.value)} placeholder={i18n.t("decor.chatPlaceholderService")} rows={3}
									className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 13px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "vertical", marginBottom: 10 }}
									onFocus={e => e.target.style.borderColor = `${selectedPkg.accent}88`}
									onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
								{chatError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 8 }}>{chatError}</p>}
								<button type="button" onClick={handleSendSeasonalMessage} disabled={!chatMsg.trim() || chatSending} style={{ background: chatMsg.trim() ? selectedPkg.accent : "var(--color-surface-raised)", border: "none", borderRadius: 8, padding: "9px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: chatMsg.trim() ? "#fff" : "var(--color-text-muted)", cursor: chatMsg.trim() && !chatSending ? "pointer" : "default" }}>{chatSending ? i18n.t("common.sending", { defaultValue: "Sending…" }) : i18n.t("common.sendMessage")}</button>
							</>
						)}
						{chatOpen && chatSent && (
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: selectedPkg.accent, fontWeight: 600 }}>{i18n.t("decor.messageSentProvider")}</p>
						)}
					</div>
				</div>
				<div style={{ ...(isMobile ? { width: "100%", maxWidth: "100%" } : { flex: 1, minWidth: 240, maxWidth: 300, position: "sticky", top: 0 }) }}>
					<div className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: "20px" }}>
						<p className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>{i18n.t("decor.bookPackage")}</p>
						<div style={{ marginBottom: 16 }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginBottom: 6 }}>{i18n.t("decor.deliverySetupDate")}</p>
							<input type="date" value={seaDate} onChange={e => setSeaDate(e.target.value)} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 13px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", colorScheme: "dark" }} onFocus={e => e.target.style.borderColor = `${selectedPkg.accent}88`} onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
						</div>
						{seaDate && quote && (
							<div style={{ background: `${selectedPkg.accent}14`, border: `1px solid ${selectedPkg.accent}33`, borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
								<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("common.subtotal")}</span>
									<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>${decorMoney(subtotal)}</span>
								</div>
								{cleaningFee > 0 && (
									<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
										<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("common.cleaningFee")}</span>
										<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>${decorMoney(cleaningFee)}</span>
									</div>
								)}
								<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("common.serviceFee")}</span>
									<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>${decorMoney(serviceFee)}</span>
								</div>
								{deposit > 0 && (
									<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
										<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("common.refundableDeposit")}</span>
										<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>${decorMoney(deposit)}</span>
									</div>
								)}
								<div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--color-border-subtle)", paddingTop: 6 }}>
									<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13 }}>{i18n.t("common.totalDue")}</span>
									<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, color: selectedPkg.accent }}>${decorMoney(total)}</span>
								</div>
							</div>
						)}
						{unavailable && seaDate && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 10 }}>{quote?.reason || i18n.t("common.unavailable")}</p>}
						{quoteError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 10 }}>{quoteError}</p>}
						{canBook && !quoteLoading && <CardPaymentField />}
						{seaError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 10 }}>{seaError}</p>}
						<button type="button" onClick={handleSeasonalBook} disabled={!canBook || seaBooking || quoteLoading} style={{ width: "100%", background: (canBook && !quoteLoading) ? selectedPkg.accent : "var(--color-surface-raised)", border: "none", borderRadius: 12, padding: "13px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: (canBook && !quoteLoading) ? "#fff" : "var(--color-text-muted)", cursor: (canBook && !seaBooking && !quoteLoading) ? "pointer" : "default", transition: "background 0.2s" }}>
							{seaBooking ? i18n.t("common.processing", { defaultValue: "Processing…" }) : quoteLoading ? i18n.t("decor.checkingPrice") : !seaDate ? i18n.t("decor.selectPackageDate") : quoteFailed ? i18n.t("decor.quoteFailed") : unavailable ? i18n.t("common.unavailable") : `${i18n.t("common.confirmAndPay")} $${decorMoney(total)}`}
						</button>
					</div>
				</div>
			</div>
			</div>
		</div>
	);

	if (seaBooked) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 40, paddingBottom: 24, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, textAlign: "center" }}>
			<div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(217,119,6,0.15)", border: "2px solid #d97706", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
				<svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
			</div>
			<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, marginBottom: 8 }}>{i18n.t("decor.packageBooked")}</h2>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 28 }}>{i18n.t("decor.packagePaidConfirmed", { name: selectedPkg.name, date: new Date(seaDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) })}</p>
			<button onClick={() => { setSelectedPkg(null); setSeaDate(""); setSeaBooked(false); }} style={{ background: "#d97706", border: "none", borderRadius: 12, padding: "12px 28px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>{i18n.t("decor.backToSeasonal")}</button>
		</div>
	);
	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px" }}><SkeletonHeading /><div style={{ display: "flex", gap: 12, margin: "16px 0 24px" }}>{[...Array(4)].map((_,i) => <SkeletonBubble key={i} />)}</div></div>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: 20 }}>{[...Array(3)].map((_,i) => <Skel key={i} h={280} r={16} />)}</div>
			</div>
		</div>
	);
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
						<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, padding: 0 }}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
							Décor
						</button>
						<HostListingCTA vertical="decor" label="List a package" presetAttrs={{ type: "seasonal", season: activeSeason }} onCreated={loadSeasonal} />
					</div>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6, textAlign: "center" }}>{i18n.t("decor.seasonal")}</h1>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 0 }}>{i18n.t("decor.seasonalSubtitle")}</p>
					{listError && (
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#fbbf24", marginTop: 10, textAlign: "center" }}>{i18n.t("common.listError.retryLater")}</p>
					)}
				</div>
				<div style={{ display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap", animation: "fadeUp 0.35s ease 60ms both" }}>
					{SEASONAL_TABS.map(season => (
						<button key={season} onClick={() => setActiveSeason(season)} style={{ padding: "8px 20px", borderRadius: 20, background: activeSeason === season ? "#dc2626" : "var(--color-surface-raised)", border: `1px solid ${activeSeason === season ? "#dc2626" : "var(--color-border)"}`, color: activeSeason === season ? "#fff" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.18s" }}>{seasonTabLabel(season)}</button>
					))}
				</div>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: 20, paddingBottom: 24, animation: "fadeUp 0.4s ease 90ms both" }}>
					{packages.length === 0 && (
						<div className="text-text-muted" style={{ gridColumn: "1 / -1", textAlign: "center", padding: "48px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
							No {seasonTabLabel(activeSeason)} packages listed yet. Use “List a package” to publish one.
						</div>
					)}
					{packages.map((pkg, i) => (
						<div key={pkg.listingId ?? `${pkg.name}-${i}`} className="bg-surface-raised" style={{ borderRadius: 18, overflow: "hidden", border: `1px solid ${pkg.accent}33`, animation: `fadeUp 0.35s ease ${100 + i * 80}ms both`, transition: "border-color 0.2s" }}
							onMouseEnter={e => e.currentTarget.style.borderColor = pkg.accent + "66"}
							onMouseLeave={e => e.currentTarget.style.borderColor = pkg.accent + "33"}>
							<div style={{ height: 120, ...decorThumbStyle(pkg.thumb) }} />
							<div style={{ padding: "18px 20px 22px" }}>
								<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
									<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>{pkg.name}</h3>
									<div style={{ textAlign: "right", flexShrink: 0 }}>
										<div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 24, color: pkg.accent }}>${pkg.price}</div>
										<div className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: "0.08em" }}>{i18n.t("decor.packageLabel")}</div>
									</div>
								</div>
								<div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
									{pkg.items.map(item => (
										<div key={item} style={{ display: "flex", alignItems: "center", gap: 8 }}>
											<div style={{ width: 5, height: 5, borderRadius: "50%", background: pkg.accent, flexShrink: 0 }} />
											<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{item}</span>
										</div>
									))}
								</div>
								<button onClick={() => setSelectedPkg(pkg)} style={{ width: "100%", padding: "10px 0", borderRadius: 12, background: `${pkg.accent}18`, border: `1px solid ${pkg.accent}55`, color: pkg.accent, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{i18n.t("decor.bookThisPackage")}</button>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

const STYLE_QUIZ_STEPS = [
	{
		id: "space",
		questionKey: "decor.quizSpaceQ",
		options: [
			{ id: "home", labelKey: "decor.quizSpaceHome", categoryId: "interior", section: "services" },
			{ id: "event", labelKey: "decor.quizSpaceEvent", categoryId: "event", section: "services" },
			{ id: "outdoor", labelKey: "decor.quizSpaceOutdoor", categoryId: "outdoor", section: "rentals" },
			{ id: "office", labelKey: "decor.quizSpaceOffice", categoryId: "custom", section: "services" },
		],
	},
	{
		id: "vibe",
		questionKey: "decor.quizVibeQ",
		options: [
			{ id: "modern", labelKey: "decor.quizVibeModern", categoryId: "lighting" },
			{ id: "cozy", labelKey: "decor.quizVibeCozy", categoryId: "furniture" },
			{ id: "festive", labelKey: "decor.quizVibeFestive", section: "seasonal" },
			{ id: "bold", labelKey: "decor.quizVibeBold", categoryId: "wallart" },
		],
	},
	{
		id: "need",
		questionKey: "decor.quizNeedQ",
		options: [
			{ id: "designer", labelKey: "decor.quizNeedDesigner", section: "services" },
			{ id: "rent", labelKey: "decor.quizNeedRent", section: "rentals" },
			{ id: "buy", labelKey: "decor.quizNeedBuy", section: "shop" },
			{ id: "holiday", labelKey: "decor.quizNeedHoliday", section: "seasonal" },
		],
	},
];

const SECTION_ACCENT = {
	services: "#a855f7",
	rentals: "#059669",
	shop: "#d97706",
	seasonal: "#dc2626",
};

function resolveDecorStyleMatch(answers) {
	const space = answers.space;
	const vibe = answers.vibe;
	const need = answers.need;
	let section = need?.section || space?.section || "services";
	if (vibe?.id === "festive" && need?.id !== "buy" && need?.id !== "rent") section = "seasonal";
	if (need?.id === "holiday") section = "seasonal";

	let categoryId = "all";
	if (section === "services" || section === "rentals") {
		categoryId = vibe?.categoryId || space?.categoryId || "all";
		if (section === "rentals" && !DECOR_RENTAL_CATEGORY_DEFS.some((c) => c.id === categoryId)) {
			categoryId = space?.categoryId && DECOR_RENTAL_CATEGORY_DEFS.some((c) => c.id === space.categoryId)
				? space.categoryId
				: "all";
		}
		if (section === "services" && !DECOR_CATEGORY_DEFS.some((c) => c.id === categoryId)) {
			categoryId = "all";
		}
	}

	const sectionLabelKey = {
		services: "discounts.categories.services",
		rentals: "decor.rentals",
		shop: "shop.title",
		seasonal: "decor.seasonal",
	}[section] || "discounts.categories.services";

	return {
		section,
		categoryId,
		sectionLabel: i18n.t(sectionLabelKey),
		spaceLabel: i18n.t(space?.labelKey || "decor.quizSpaceHome"),
		vibeLabel: i18n.t(vibe?.labelKey || "decor.quizVibeModern"),
		needLabel: i18n.t(need?.labelKey || "decor.quizNeedDesigner"),
		accent: SECTION_ACCENT[section] || "#d97706",
	};
}

function DecorStyleMatchQuiz({ match, onComplete, onOpenMatch, onReset }) {
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState(0);
	const [answers, setAnswers] = useState({});

	function startQuiz() {
		setOpen(true);
		setStep(0);
		setAnswers({});
		onReset?.();
	}

	function pickOption(opt) {
		const current = STYLE_QUIZ_STEPS[step];
		const nextAnswers = { ...answers, [current.id]: opt };
		setAnswers(nextAnswers);
		if (step < STYLE_QUIZ_STEPS.length - 1) {
			setStep((s) => s + 1);
			return;
		}
		const resolved = resolveDecorStyleMatch(nextAnswers);
		onComplete?.(resolved);
		setOpen(false);
	}

	if (match && !open) {
		return (
			<div style={{
				marginTop: 4,
				borderRadius: 16,
				padding: "20px 22px",
				background: `linear-gradient(135deg, ${match.accent}14 0%, var(--color-border-subtle) 100%)`,
				border: `1px solid ${match.accent}40`,
				animation: "fadeUp 0.35s ease both",
			}}>
				<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: match.accent, marginBottom: 8 }}>
					{i18n.t("decor.quizResultBadge")}
				</p>
				<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "0.03em", textTransform: "uppercase", marginBottom: 8 }}>
					{i18n.t("decor.quizResultTitle", { section: match.sectionLabel })}
				</p>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
					{i18n.t("decor.quizResultDesc", { space: match.spaceLabel, vibe: match.vibeLabel, need: match.needLabel })}
				</p>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
					<button
						type="button"
						onClick={() => onOpenMatch?.(match.section)}
						style={{ background: match.accent, border: "none", borderRadius: 10, padding: "11px 18px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
					>
						{i18n.t("decor.quizSeeMatches")}
					</button>
					<button
						type="button"
						onClick={startQuiz}
						className="border border-border text-text-secondary" style={{ background: "transparent", borderRadius: 10, padding: "11px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
					>
						{i18n.t("decor.quizRetake")}
					</button>
				</div>
			</div>
		);
	}

	if (!open) {
		return (
			<button
				type="button"
				onClick={startQuiz}
				style={{
					width: "100%",
					marginTop: 4,
					borderRadius: 16,
					padding: "18px 22px",
					background: "linear-gradient(135deg, rgba(217,119,6,0.12), rgba(168,85,247,0.1))",
					border: "1px solid rgba(217,119,6,0.35)",
					cursor: "pointer",
					textAlign: "left",
					animation: "fadeUp 0.4s ease 300ms both",
					transition: "border-color 0.15s, transform 0.15s",
				}}
				onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(217,119,6,0.65)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
				onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(217,119,6,0.35)"; e.currentTarget.style.transform = "translateY(0)"; }}
			>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
					<div>
						<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4 }}>
							{i18n.t("decor.quizCtaTitle")}
						</p>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.45, margin: 0 }}>
							{i18n.t("decor.quizCtaDesc")}
						</p>
					</div>
					<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
				</div>
			</button>
		);
	}

	const current = STYLE_QUIZ_STEPS[step];
	const progress = ((step + 1) / STYLE_QUIZ_STEPS.length) * 100;

	return (
		<div className="bg-surface-raised border border-border" style={{
			marginTop: 4,
			borderRadius: 16,
			padding: "22px 22px 20px",
			animation: "fadeUp 0.3s ease both",
		}}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>
					{i18n.t("decor.quizStep", { current: step + 1, total: STYLE_QUIZ_STEPS.length })}
				</p>
				<button type="button" onClick={() => setOpen(false)} className="text-text-muted" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12, padding: 0 }}>
					{i18n.t("common.close", { defaultValue: "Close" })}
				</button>
			</div>
			<div className="bg-surface-raised" style={{ height: 4, borderRadius: 99, marginBottom: 18, overflow: "hidden" }}>
				<div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg,#d97706,#a855f7)", transition: "width 0.25s ease" }} />
			</div>
			<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 24, letterSpacing: "0.03em", textTransform: "uppercase", marginBottom: 16 }}>
				{i18n.t(current.questionKey)}
			</p>
			<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))", gap: 10 }}>
				{current.options.map((opt) => (
					<button
						key={opt.id}
						type="button"
						onClick={() => pickOption(opt)}
						className="bg-surface-raised border border-border text-text-primary" style={{
							borderRadius: 12,
							padding: "14px 12px",
							fontFamily: "'DM Sans', sans-serif",
							fontWeight: 600,
							fontSize: 13,
							cursor: "pointer",
							textAlign: "left",
							transition: "border-color 0.15s, background 0.15s",
						}}
						onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(217,119,6,0.55)"; e.currentTarget.style.background = "rgba(217,119,6,0.1)"; }}
						onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.background = "var(--color-surface-raised)"; }}
					>
						{i18n.t(opt.labelKey)}
					</button>
				))}
			</div>
		</div>
	);
}

function DecorPage({ subSection: subSectionProp, setSubSection: setSubSectionProp }) {
	const { landingTitle } = usePageI18n("decor");
	const { isMobile } = useViewport();
	const loading = usePageLoad();
	const [localSub, setLocalSub] = useState(null);
	const [styleMatch, setStyleMatch] = useState(null);
	const [applyMatch, setApplyMatch] = useState(false);
	const subSection = subSectionProp !== undefined ? subSectionProp : localSub;
	const setSubSection = subSectionProp !== undefined ? setSubSectionProp : setLocalSub;

  // Event Concierge deep-open: force services even if a sticky subSection (rentals/shop) is set
  useEffect(() => {
    const pending = window.__pendingListingId;
    const pendingVertical = window.__pendingListingVertical;
    if (pending && (!pendingVertical || pendingVertical === "decor")) {
      if (subSection !== "services") setSubSection("services");
    }
  }, [subSection, setSubSection]);

	function openSection(section, withMatch = false) {
		setApplyMatch(withMatch);
		setSubSection(section === "all" ? "services" : section);
	}

	function openMatched(section) {
		openSection(section || styleMatch?.section || "services", true);
	}

	const matchCategory = applyMatch ? (styleMatch?.categoryId || "all") : "all";
	const clearSub = () => { setApplyMatch(false); setSubSection(null); };
	if (subSection === "services") return <DecorServicesSubPage onBack={clearSub} initialCategory={matchCategory} />;
	if (subSection === "rentals")  return <DecorRentalsSubPage onBack={clearSub} initialCategory={matchCategory} />;
	if (subSection === "shop")     return <DecorShopSubPage onBack={clearSub} />;
	if (subSection === "seasonal") return <DecorSeasonalSubPage onBack={clearSub} />;
	if (subSection === "all")      return <DecorServicesSubPage onBack={clearSub} initialCategory={matchCategory} />;
	if (loading) return (
		<div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 860, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 28px" }}>
					<SkeletonHeading />
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 16, marginTop: 28, marginBottom: 16 }}>
						{[...Array(4)].map((_,i) => (
							<div key={i} className="bg-surface-raised border border-border" style={{ borderRadius: 16, overflow: "hidden" }}>
								<Skel h={110} r={0} />
								<div style={{ padding: "18px 22px 22px" }}>
									<Skel w="55%" h={20} r={6} style={{ marginBottom: 10 }} />
									<Skel w="85%" h={12} r={5} style={{ marginBottom: 4 }} />
									<Skel w="70%" h={12} r={5} style={{ marginBottom: 20 }} />
									<Skel w={60} h={12} r={5} />
								</div>
							</div>
						))}
					</div>
					<Skel h={60} r={14} />
				</div>
			</div>
		</div>
	);
	const tiles = getDecorTiles();
	return (
		<div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 860, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 28px", animation: "fadeUp 0.3s ease both" }}>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 28, textAlign: "center" }}>{landingTitle}</h1>
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 16, marginBottom: 16 }}>
						{/* Each tile's own background is its fixed decorative gradient (tile.gradient, from
						    getDecorTiles) rather than a themed surface, so the text/icons drawn on it below
						    stay hardcoded light in both themes — same reasoning as DecorServiceCard. */}
						{tiles.map((tile, i) => (
							<button key={tile.id} type="button" onClick={() => openSection(tile.id)}
								style={{ background: tile.gradient, border: `1.5px solid ${tile.accent}30`, borderRadius: 16, padding: 0, cursor: "pointer", textAlign: "left", animation: `fadeUp 0.4s ease ${i * 60}ms both`, transition: "transform 0.15s, border-color 0.15s", overflow: "hidden" }}
								onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.borderColor = tile.accent + "70"; }}
								onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = tile.accent + "30"; }}>
								{/* Accent banner */}
								<div style={{ height: 110, background: `linear-gradient(180deg, ${tile.accent}18 0%, transparent 100%)`, borderBottom: `1px solid ${tile.accent}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
									<tile.Icon s={40} />
								</div>
								{/* Content */}
								<div style={{ padding: "18px 22px 22px" }}>
									<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, color: "#fff", letterSpacing: "0.03em", textTransform: "uppercase", marginBottom: 6 }}>{tile.label}</p>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.5, marginBottom: 18 }}>{i18n.t(tile.descKey)}</p>
									<div style={{ display: "flex", alignItems: "center", gap: 5, color: tile.accent, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700 }}>
										{i18n.t("common.explore", { defaultValue: "Explore" })}
										<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
									</div>
								</div>
							</button>
						))}
					</div>
					{/* All row */}
					<button onClick={() => openSection("all")} className="bg-surface-raised border border-border" style={{ width: "100%", borderRadius: 14, padding: "18px 24px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "background 0.15s, border-color 0.15s", animation: "fadeUp 0.4s ease 260ms both", marginBottom: 20 }}
						onMouseEnter={e => { e.currentTarget.style.background = "var(--color-surface-raised)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}
						onMouseLeave={e => { e.currentTarget.style.background = "var(--color-surface-raised)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}>
						<span className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "0.04em", textTransform: "uppercase" }}>{i18n.t("events.categories.all")}</span>
						<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</button>

					<DecorStyleMatchQuiz
						match={styleMatch}
						onComplete={setStyleMatch}
						onOpenMatch={openMatched}
						onReset={() => setStyleMatch(null)}
					/>
				</div>
			</div>
		</div>
	);
}

export { DecorPage };
