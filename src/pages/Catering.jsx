import React, { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon } from "../components/icons.jsx";
import { Skel, SkeletonCircle, SkeletonHeading, SkeletonProductCard } from "../components/skeletons.jsx";
import { LeoButton } from "../components/shared.jsx";
import { SafeImage } from "../components/SafeImage.jsx";
import { useStripe, useElements, CardElement } from "@stripe/react-stripe-js";
import PriceChangeModal from "../components/pricing/PriceChangeModal.jsx";
import { FoodTrackingPage, FoodAddressCapture, FoodCartPage } from "./Food.jsx";
import { filterVendors, getFoodItems, createFoodOrder, getFoodOrder } from "../api/food";
import { createStripeIntent } from "../api/payment";
import { validatePromoCode } from "../api/discounts";
import { getWalletBalance, getCheckoutReferralCode } from "../api/user";
import { getUser, getAuthUserId, isAuthenticated } from "../store/auth";
import { getLocationItem, setLocationItem } from "../utils/userLocation.js";
import { mediaUrl } from "../utils/mediaUrl.js";
import { haversineKm } from "../utils/geo.js";
import { parseVendorPromo } from "../utils/promoBadge.js";
import { getUserRegion, fmt } from "../utils/regionConfig";
import { sellerNetFromOrderTotal } from "../utils/shopSellerHelpers.js";
import { geocodeAddress } from "../utils/geocode.js";
import { readBuyerDeliveryCoords } from "../utils/shopCheckoutHelpers.js";
import {
	CATERING_PAYMENT_PROMO_VERTICAL,
	amountsDiffer,
	resolveChargedTotal,
} from "../utils/cateringCheckout.js";
import { useEventPlan } from "../store/eventPlan.js";
import { useEventCart } from "../store/eventCart.js";
import { EventCartPill } from "../components/EventCartPill.jsx";
import { ConciergeEntryBanner } from "../components/ConciergeEntryBanner.jsx";

const CATERING_LEAD_DAYS = 2;
const CATER_SESSION_KEY = "strug_catering_active_v1";
const CATER_TERMINAL = new Set(["delivered", "cancelled"]);
const CAT_COLORS = ["#7c3aed", "#db2877", "#d97706", "#dc2626", "#059669", "#0891b2", "#2563eb"];

function isGuestItemAvailable(item) {
	return item?.is_available !== false && item?.available !== false;
}

function parseFiniteNumber(value) {
	if (value == null || value === "") return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function isUsableCoords(lat, lng) {
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
	if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return false;
	return true;
}

function readSavedCoords() {
	const lat = parseFiniteNumber(getLocationItem("strug_user_lat"));
	const lng = parseFiniteNumber(getLocationItem("strug_user_lng"));
	if (isUsableCoords(lat, lng)) return { lat, lng };
	try {
		const loc = JSON.parse(getLocationItem("strug_user_location") || "null");
		const la = parseFiniteNumber(loc?.lat);
		const ln = parseFiniteNumber(loc?.lng);
		if (isUsableCoords(la, ln)) return { lat: la, lng: ln };
	} catch { /* corrupt blob */ }
	return { lat: null, lng: null };
}

function persistAddress(addr, lat, lng) {
	try {
		if (addr) setLocationItem("strug_user_address", addr);
		if (lat != null) setLocationItem("strug_user_lat", String(lat));
		if (lng != null) setLocationItem("strug_user_lng", String(lng));
		let prev = {};
		try { prev = JSON.parse(getLocationItem("strug_user_location") || "null") || {}; } catch { prev = {}; }
		setLocationItem("strug_user_location", JSON.stringify({
			...prev,
			...(addr ? { address: addr } : {}),
			...(lat != null ? { lat } : {}),
			...(lng != null ? { lng } : {}),
		}));
	} catch { /* storage best-effort */ }
}

function mapCaterer(v) {
	const img = v?.banner_url ?? v?.cover_url ?? v?.logo_url ?? null;
	const { promo, eligibleOffers } = parseVendorPromo(v);
	const rating = parseFiniteNumber(v?.rating);
	const reviews = parseFiniteNumber(v?.review_count ?? v?.reviews_count) ?? 0;
	const minParty = parseFiniteNumber(v?.min_party_size);
	const maxParty = parseFiniteNumber(v?.max_party_size);
	const minOrder = parseFiniteNumber(v?.min_order_value);
	const categoryNames = Array.isArray(v?.food_category)
		? v.food_category.map((c) => c?.name).filter(Boolean)
		: [];
	return {
		id: v?.vendor_id ?? v?.id,
		name: v?.vendor_name || v?.name || i18n.t("catering.defaultCaterer"),
		rating,
		reviews,
		minGuests: minParty != null && minParty > 1 ? minParty : null,
		maxGuests: maxParty != null && maxParty > 0 ? maxParty : null,
		minOrder: minOrder != null && minOrder > 0 ? minOrder : null,
		lat: parseFiniteNumber(v?.lat),
		lng: parseFiniteNumber(v?.long ?? v?.lng),
		location: v?.location || "",
		owner_id: v?.owner_id ?? null,
		vendor_type_id: v?.vendor_type_id ?? v?.vendor_type?.vendor_type_id ?? null,
		promo,
		eligibleOffers,
		categoryNames,
		img: img ? mediaUrl(img) : null,
		color: "#0d1a2a",
		accent: "#2563eb",
	};
}

function isCateringVendorType(v) {
	const name = v?.vendor_type?.vendor_type || v?.vendor_type_name || v?.type_name || "";
	if (!name) return true;
	return /cater/i.test(String(name));
}

function saveCaterSession(session) {
	try { sessionStorage.setItem(CATER_SESSION_KEY, JSON.stringify(session)); } catch { /* quota */ }
}
function loadCaterSession() {
	try {
		const raw = sessionStorage.getItem(CATER_SESSION_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch { return null; }
}
function clearCaterSession() {
	try { sessionStorage.removeItem(CATER_SESSION_KEY); } catch { /* ignore */ }
}

function eventIso(date, time) {
	if (!date || !time) return null;
	const d = new Date(`${date}T${time}`);
	return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function CateringCheckoutPage({ cart, onBack, onPlaceOrder, vendor, initialPromoCode = null }) {
	const { isMobile } = useViewport();
	const { t, i18n: i18nInst } = useTranslation();
	const stripe = useStripe();
	const elements = useElements();
	const { currency } = getUserRegion();
	const [eventDate, setEventDate] = useState("");
	const [eventTime, setEventTime] = useState("");
	const [guestCount, setGuestCount] = useState(vendor?.minGuests || 1);
	const [venueAddr, setVenueAddr] = useState("");
	const [notes, setNotes] = useState("");
	const [payMethod, setPayMethod] = useState("card");
	const [walletBalance, setWalletBalance] = useState(0);
	const [processing, setProcessing] = useState(false);
	const [payError, setPayError] = useState(null);
	const [promoCode, setPromoCode] = useState(initialPromoCode || "");
	const [promoApplied, setPromoApplied] = useState(Boolean(initialPromoCode));
	const [promoDiscount, setPromoDiscount] = useState(null);
	const [promoError, setPromoError] = useState(null);
	const [promoLoading, setPromoLoading] = useState(false);
	const [priceChange, setPriceChange] = useState(null);

	useEffect(() => {
		getWalletBalance().then((b) => setWalletBalance(parseFloat(b?.balance ?? 0))).catch(() => {});
	}, []);

	useEffect(() => {
		if (initialPromoCode) handleApplyPromo(initialPromoCode);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- apply once on mount from cart
	}, []);

	const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
	const discountAmount = promoDiscount
		? (promoDiscount.type === "percent" ? subtotal * (promoDiscount.value / 100) : Math.min(promoDiscount.value, subtotal))
		: 0;
	const discountedSubtotal = Math.max(0, subtotal - discountAmount);
	const platformFee = parseFloat((discountedSubtotal * 0.08).toFixed(2));
	const total = discountedSubtotal + platformFee;

	const minDate = new Date(Date.now() + CATERING_LEAD_DAYS * 24 * 3600 * 1000).toISOString().slice(0, 10);
	const minGuests = vendor?.minGuests || 1;
	const maxGuests = vendor?.maxGuests || null;
	const guestsOk = guestCount >= minGuests && (maxGuests == null || guestCount <= maxGuests);
	const minSpendOk = vendor?.minOrder == null || subtotal >= vendor.minOrder;
	const canOrder = eventDate && eventTime && guestsOk && minSpendOk && venueAddr.trim().length > 3;

	const commerceItems = cart.map((i) => ({
		food_item_id: Number(i.id ?? i.lineId),
		qty: i.qty,
		modifier_option_ids: Array.isArray(i.modifier_option_ids) ? i.modifier_option_ids : [],
		special_instructions: typeof i.special_instructions === "string" ? i.special_instructions.trim() : undefined,
	}));

	function confirmPriceIfChanged(oldAmount, newAmount) {
		if (!amountsDiffer(oldAmount, newAmount)) {
			return Promise.resolve(true);
		}
		return new Promise((resolve) => setPriceChange({ oldAmount, newAmount: Number(newAmount), resolve }));
	}

	async function handleApplyPromo(codeOverride) {
		const code = String(codeOverride || promoCode || "").trim();
		if (!code) return;
		setPromoCode(code);
		setPromoLoading(true);
		setPromoError(null);
		try {
			const res = await validatePromoCode(code, {
				subtotal,
				vertical: CATERING_PAYMENT_PROMO_VERTICAL,
				vendor_id: vendor?.id ?? null,
				vendor_owner_id: vendor?.owner_id ?? null,
			});
			if (res.valid) {
				setPromoApplied(true);
				if (res.code) setPromoCode(res.code);
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

	async function handlePlace() {
		if (!canOrder || processing) return;
		const buyerId = getAuthUserId() ?? getUser()?.user_id ?? getUser()?.id ?? null;
		if (!buyerId) {
			setPayError(t("catering.loginRequired"));
			return;
		}
		if (!vendor?.id) {
			setPayError(t("food.checkout.orderSaveFailed"));
			return;
		}

		setProcessing(true);
		setPayError(null);

		let paymentIntentId = null;
		let chargedTotal = total;
		try {
			if (payMethod === "card") {
				const card = elements?.getElement(CardElement);
				if (!stripe || !elements || !card) {
					setPayError(t("food.checkout.paymentFailed"));
					setProcessing(false);
					return;
				}
				const { clientSecret, paymentIntentId: piId, amount: serverAmount } = await createStripeIntent(total, {
					purpose: "commerce",
					vertical: "catering",
					promo_code: promoApplied ? promoCode : undefined,
					items: commerceItems,
					item_source: "food",
					seller_id: vendor.owner_id,
					shipping_mode: "delivery",
					shipping_address: venueAddr.trim(),
				});
				const priceOk = await confirmPriceIfChanged(total, serverAmount);
				if (!priceOk) {
					setProcessing(false);
					return;
				}
				chargedTotal = resolveChargedTotal(total, serverAmount);
				const result = await stripe.confirmCardPayment(clientSecret, { payment_method: { card } });
				if (result.error) {
					setPayError(result.error.message);
					setProcessing(false);
					return;
				}
				paymentIntentId = result.paymentIntent?.id ?? piId ?? null;
			} else {
				const balObj = await getWalletBalance();
				const currentBal = balObj?.balance != null ? parseFloat(balObj.balance) : 0;
				if (currentBal < chargedTotal) {
					setPayError(t("food.checkout.insufficientWallet", { balance: fmt(currentBal, currency, i18nInst.language) }));
					setProcessing(false);
					return;
				}
			}
		} catch {
			setPayError(t("food.checkout.paymentFailed"));
			setProcessing(false);
			return;
		}

		let persistFailed = false;
		let cateringOrderId = null;
		try {
			let venueLat = null;
			let venueLng = null;
			const geo = await geocodeAddress(venueAddr.trim()).catch(() => null);
			if (geo && isUsableCoords(geo.lat, geo.lng)) {
				venueLat = geo.lat;
				venueLng = geo.lng;
			} else {
				const saved = readBuyerDeliveryCoords();
				if (isUsableCoords(saved.lat, saved.lng)) {
					venueLat = saved.lat;
					venueLng = saved.lng;
				}
			}
			const instructions = [
				`Event: ${eventDate} ${eventTime}`,
				`Guests: ${guestCount}`,
				notes.trim() ? `Notes: ${notes.trim()}` : null,
			].filter(Boolean).join(" | ");
			const created = await createFoodOrder({
				user_id: buyerId,
				vendor_id: vendor.id,
				order_status: "pending",
				total_amount: chargedTotal,
				item_subtotal: discountedSubtotal,
				vendor_net: parseFloat(sellerNetFromOrderTotal(discountedSubtotal).toFixed(2)),
				delivery_fee: 0,
				deliver_location: venueAddr.trim(),
				delivery_lat: venueLat,
				delivery_lng: venueLng,
				fulfillment_mode: "delivery",
				vendor_type_id: vendor.vendor_type_id ?? undefined,
				delivery_instructions: instructions,
				scheduled_time: eventIso(eventDate, eventTime),
				payment_method: payMethod.toUpperCase(),
				payment_intent_id: paymentIntentId,
				promo_code: promoApplied ? promoCode : null,
				referral_code: getCheckoutReferralCode() || undefined,
				items: commerceItems,
			});
			cateringOrderId = created?.data?.food_order_id ?? created?.food_order_id ?? null;
			if (!cateringOrderId) persistFailed = true;
		} catch (err) {
			persistFailed = true;
			const apiMsg = err?.response?.data?.message || err?.response?.data?.error;
			if (apiMsg) setPayError(String(apiMsg));
		}

		setProcessing(false);
		if (persistFailed && paymentIntentId) {
			setPayError(t("food.checkout.paymentOkOrderSaveFailed"));
			return;
		}
		if (persistFailed || !cateringOrderId) {
			setPayError((prev) => prev || t("food.checkout.orderSaveFailed"));
			return;
		}
		onPlaceOrder?.(cateringOrderId);
	}

	const inputStyle = { width: "100%", boxSizing: "border-box", background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "10px 13px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "var(--color-text-primary)", outline: "none" };
	return (
		<>
		<div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 28, paddingBottom: 24 }}>
			<div style={{ maxWidth: 780, margin: "0 auto", width: "100%" }}>
				<button type="button" onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 24, padding: 0 }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					{t("food.checkout.backToCart")}
				</button>
				<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 32, marginBottom: 4 }}>{t("catering.confirmTitle")}</h1>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 28 }}>{vendor?.name}</p>
				<div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start" }}>
					<div style={{ flex: 2, minWidth: 280, display: "flex", flexDirection: "column", gap: 16 }}>
						<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "18px 20px" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>{t("catering.eventWhen")}</p>
							<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
								<div>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 6 }}>{t("catering.eventDate")} *</p>
									<input type="date" value={eventDate} min={minDate} onChange={(e) => setEventDate(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
								</div>
								<div>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 6 }}>{t("catering.eventTime")} *</p>
									<input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
								</div>
							</div>
							<div style={{ marginBottom: 12 }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 6 }}>{t("catering.guestCount")} *</p>
								<input type="number" min={minGuests} max={maxGuests || undefined} value={guestCount} onChange={(e) => setGuestCount(Math.max(1, parseInt(e.target.value, 10) || 1))} style={inputStyle} />
								{!guestsOk && minGuests > 1 && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#f87171", margin: "6px 0 0" }}>{t("catering.guestMin", { count: minGuests })}</p>}
								{!guestsOk && maxGuests != null && guestCount > maxGuests && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#f87171", margin: "6px 0 0" }}>{t("catering.guestMax", { count: maxGuests })}</p>}
							</div>
							<div style={{ marginBottom: 12 }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 6 }}>{t("catering.venueAddress")} *</p>
								<input type="text" value={venueAddr} onChange={(e) => setVenueAddr(e.target.value)} placeholder={t("catering.venuePlaceholder")} style={inputStyle} />
							</div>
							<div>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 6 }}>{t("catering.specialReq")}</p>
								<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("catering.specialPlaceholder")} style={{ ...inputStyle, resize: "vertical" }} />
							</div>
						</div>
						<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "18px 20px" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>{t("catering.yourOrder")}</p>
							{cart.map((item) => (
								<div key={item.lineId} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
									<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{item.name} × {item.qty}</span>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{fmt(item.price * item.qty, currency, i18nInst.language)}</span>
								</div>
							))}
						</div>
					</div>
					<div style={{ flex: 1, minWidth: 240, maxWidth: 300 }}>
						<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "18px 20px", position: "sticky", top: 0 }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>{t("catering.orderSummary")}</p>
							<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("catering.subtotal")}</span>
								<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{fmt(subtotal, currency, i18nInst.language)}</span>
							</div>
							<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("catering.platformFee")}</span>
								<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{fmt(platformFee, currency, i18nInst.language)}</span>
							</div>
							{discountAmount > 0 && (
								<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("food.checkout.discount", { defaultValue: "Discount" })}{promoDiscount?.label ? ` (${promoDiscount.label})` : ""}</span>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#10b981" }}>−{fmt(discountAmount, currency, i18nInst.language)}</span>
								</div>
							)}
							<div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--color-border-subtle)" }}>
								<div style={{ display: "flex", gap: 8 }}>
									<input value={promoCode} onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoError(null); }} placeholder={t("food.checkout.enterCode")} style={{ ...inputStyle, flex: 1 }} />
									<button type="button" onClick={() => handleApplyPromo()} disabled={promoLoading} style={{ padding: "0 14px", borderRadius: 8, background: promoApplied ? "#10b981" : "#2563eb", border: "none", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, cursor: promoLoading ? "default" : "pointer", whiteSpace: "nowrap" }}>
										{promoLoading ? "…" : promoApplied ? t("food.checkout.applied") : t("food.checkout.apply")}
									</button>
								</div>
								{promoError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#f87171", margin: "6px 0 0" }}>{promoError}</p>}
							</div>
							{!minSpendOk && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#f87171", marginBottom: 10 }}>{t("catering.minSpend", { amount: Number(vendor.minOrder).toFixed(2) })}</p>}
							<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
								<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14 }}>{t("food.tracking.total", { defaultValue: "Total" })}</span>
								<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, color: "#2563eb" }}>{fmt(total, currency, i18nInst.language)}</span>
							</div>
							<div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
								{["card", "wallet"].map((m) => (
									<button type="button" key={m} onClick={() => setPayMethod(m)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, background: payMethod === m ? "#2563eb" : "var(--color-surface-raised)", border: `1px solid ${payMethod === m ? "#2563eb" : "var(--color-border)"}`, color: payMethod === m ? "#fff" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, cursor: "pointer", textTransform: "capitalize" }}>
										{m === "wallet" ? `${t("food.checkout.wallet", { defaultValue: "Wallet" })} (${fmt(walletBalance, currency, i18nInst.language)})` : t("food.checkout.card", { defaultValue: "Card" })}
									</button>
								))}
							</div>
							{payMethod === "card" && (
								<div className="bg-surface-raised border border-border" style={{ borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
									<CardElement options={{ style: { base: { color: "#fff", fontSize: "14px", "::placeholder": { color: "rgba(255,255,255,0.3)" } } } }} />
								</div>
							)}
							{payError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 10 }}>{payError}</p>}
							{!canOrder && <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 10 }}>{t("catering.fillEvent")}</p>}
							<button type="button" onClick={handlePlace} disabled={!canOrder || processing} style={{ width: "100%", padding: "13px 0", borderRadius: 12, background: (canOrder && !processing) ? "#2563eb" : "var(--color-surface-raised)", border: "none", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: (canOrder && !processing) ? "#fff" : "var(--color-text-muted)", cursor: (canOrder && !processing) ? "pointer" : "default" }}>
								{processing ? t("food.checkout.processing", { defaultValue: "Processing…" }) : t("catering.confirmPay", { amount: fmt(total, currency, i18nInst.language) })}
							</button>
						</div>
					</div>
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
		{priceChange && (
			<PriceChangeModal
				oldAmount={priceChange.oldAmount}
				newAmount={priceChange.newAmount}
				onConfirm={() => { priceChange.resolve(true); setPriceChange(null); }}
				onCancel={() => { priceChange.resolve(false); setPriceChange(null); }}
			/>
		)}
		</>
	);
}

function CateringPage({ userLocation }) {
	const { t, landingTitle } = usePageI18n("catering");
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);

	const [deliveryAddr, setDeliveryAddr] = useState(() => {
		const saved = getLocationItem("strug_user_address");
		if (saved) return saved;
		try {
			const loc = getLocationItem("strug_user_location");
			if (loc) { const p = JSON.parse(loc); if (p.address) return p.address; }
		} catch { /* ignore */ }
		return getUser()?.saved_address || "";
	});
	const [addressSet, setAddressSet] = useState(() => {
		const saved = getLocationItem("strug_user_address");
		if (saved) return true;
		try {
			const loc = getLocationItem("strug_user_location");
			if (loc) { const p = JSON.parse(loc); if (p.address) return true; }
		} catch { /* ignore */ }
		return !!(getUser()?.saved_address);
	});
	const [allowAddressAutoResume, setAllowAddressAutoResume] = useState(true);

	const [sortBy, setSortBy] = useState("recommended");
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
	const [caterView, setCaterView] = useState("vendors");
	const [caterOrderId, setCaterOrderId] = useState(null);
	const [checkoutPromo, setCheckoutPromo] = useState(null);
	useEffect(() => { window.dispatchEvent(new CustomEvent("strug:view-change")); }, [caterView]);
	const [activeVendor, setActiveVendor] = useState(null);
	const [activeCategory, setActiveCategory] = useState("all");
	const [cart, setCart] = useState([]);
	const { hasActiveEvent } = useEventPlan();
	const eventCart = useEventCart();
	const catScrollRef = useRef(null);
	const [catScrollState, setCatScrollState] = useState({ atStart: true, atEnd: true });

	const [cateringStores, setCateringStores] = useState([]);
	const [cateringItems, setCateringItems] = useState([]);
	const [storesLoading, setStoresLoading] = useState(true);
	const [storesError, setStoresError] = useState(null);
	const [itemsLoading, setItemsLoading] = useState(false);
	const [query, setQuery] = useState("");
	const [reloadToken, setReloadToken] = useState(0);

	useLayoutEffect(() => {
		const el = catScrollRef.current;
		if (!el) return undefined;
		const update = () => setCatScrollState((prev) => {
			const atStart = el.scrollLeft <= 4;
			const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4;
			return prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd };
		});
		update();
		el.addEventListener("scroll", update, { passive: true });
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
	}, [caterView]);

	useEffect(() => {
		if (!addressSet) return undefined;
		const { lat, lng } = readSavedCoords();
		setStoresLoading(true);
		setStoresError(null);
		filterVendors({ type: "Catering", ...(lat != null ? { lat } : {}), ...(lng != null ? { lng } : {}) })
			.then((r) => {
				const list = Array.isArray(r) ? r : (r?.data ?? []);
				setCateringStores(list.map(mapCaterer).filter((v) => v.id != null));
			})
			.catch(() => {
				setCateringStores([]);
				setStoresError(t("catering.storesError"));
			})
			.finally(() => setStoresLoading(false));
	}, [addressSet, reloadToken, t]);

	const shopsWithDist = useMemo(() => {
		const { lat: userLat, lng: userLng } = readSavedCoords();
		return cateringStores.map((v) => {
			const dist = isUsableCoords(userLat, userLng) && isUsableCoords(v.lat, v.lng)
				? haversineKm(userLat, userLng, v.lat, v.lng)
				: null;
			return { ...v, dist };
		});
	}, [cateringStores, deliveryAddr]);

	const filteredShops = useMemo(() => {
		const q = storeQuery.trim().toLowerCase();
		return shopsWithDist.filter((s) => !q || s.name.toLowerCase().includes(q));
	}, [shopsWithDist, storeQuery]);

	const sortedShops = useMemo(() => {
		const list = [...filteredShops];
		if (sortBy === "distance") {
			list.sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity));
		} else if (sortBy === "rating") {
			list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
		}
		return list;
	}, [filteredShops, sortBy]);

	useEffect(() => {
		if (!activeVendor) { setCateringItems([]); return undefined; }
		setItemsLoading(true);
		getFoodItems({ vendor_id: activeVendor }).then((r) => {
			const list = (Array.isArray(r) ? r : (r?.data ?? [])).filter(isGuestItemAvailable);
			setCateringItems(list.map((item) => {
				const pic = item.food_item_pics?.[0]?.url ?? item.image_url ?? null;
				return {
					id: item.food_item_id ?? item.item_id,
					name: (item.name ?? item.item_name) || i18n.t("catering.defaultPackage"),
					desc: item.description || "",
					category: item.food_category?.name ?? item.item_category?.category_name ?? "",
					price: Number(item.price) || 0,
					img: pic ? mediaUrl(pic) : null,
					extras: [],
				};
			}).filter((item) => item.id != null));
		}).catch(() => setCateringItems([])).finally(() => setItemsLoading(false));
	}, [activeVendor]);

	const categoryDefs = useMemo(() => {
		const seen = new Set();
		const cats = [{ id: "all", label: t("catering.categories.all"), color: "#2563eb", match: null }];
		for (const item of cateringItems) {
			const name = String(item.category || "").trim();
			if (!name) continue;
			const key = name.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			cats.push({
				id: `cat-${cats.length}`,
				label: name,
				match: name,
				color: CAT_COLORS[(cats.length - 1) % CAT_COLORS.length],
			});
		}
		return cats;
	}, [cateringItems, t]);

	const openTrackedCateringOrder = useCallback((orderId) => {
		if (!orderId) return;
		getFoodOrder(orderId).then((raw) => {
			const order = raw?.data ?? raw;
			if (!order) return;
			const status = String(order.order_status ?? order.status ?? "").toLowerCase();
			if (CATER_TERMINAL.has(status)) {
				clearCaterSession();
				return;
			}
			if (!isCateringVendorType({ vendor_type: order.vendor_type || order.food_vendor?.vendor_type })) {
				clearCaterSession();
				return;
			}
			const vendor = order.food_vendor;
			if (vendor) {
				const mapped = mapCaterer(vendor);
				setCateringStores((prev) => (prev.some((s) => Number(s.id) === Number(mapped.id)) ? prev : [...prev, mapped]));
				setActiveVendor(mapped.id);
			}
			setCaterOrderId(order.food_order_id ?? orderId);
			setCaterView("tracking");
			saveCaterSession({ activeOrderId: order.food_order_id ?? orderId });
		}).catch(() => {});
	}, []);

	useEffect(() => {
		const session = loadCaterSession();
		if (!session?.activeOrderId) return;
		openTrackedCateringOrder(session.activeOrderId);
	}, [openTrackedCateringOrder]);

	useEffect(() => {
		const openTracked = () => {
			const id = window.__foodTrackOrderId;
			if (!id) return;
			window.__foodTrackOrderId = null;
			openTrackedCateringOrder(id);
		};
		openTracked();
		window.addEventListener("strug:open-notification-target", openTracked);
		return () => window.removeEventListener("strug:open-notification-target", openTracked);
	}, [openTrackedCateringOrder]);

	useEffect(() => {
		if (caterView !== "tracking" || !caterOrderId) return;
		saveCaterSession({ activeOrderId: caterOrderId });
	}, [caterView, caterOrderId]);

	function openVendor(v) {
		if (activeVendor != null && Number(activeVendor) !== Number(v.id)) setCart([]);
		setActiveVendor(v.id);
		setActiveCategory("all");
		setQuery("");
		setCaterView("menu");
	}

	function addItem(item) {
		setCart((prev) => {
			const ex = prev.find((c) => c.lineId === item.id);
			if (ex) return prev.map((c) => (c.lineId === item.id ? { ...c, qty: c.qty + 1 } : c));
			return [...prev, { lineId: item.id, id: item.id, name: item.name, price: item.price, qty: 1, extras: [], modifier_option_ids: [] }];
		});
	}
	function incItem(lineId) { setCart((prev) => prev.map((c) => (c.lineId === lineId ? { ...c, qty: c.qty + 1 } : c))); }
	function decItem(lineId) { setCart((prev) => prev.map((c) => (c.lineId === lineId ? { ...c, qty: c.qty - 1 } : c)).filter((c) => c.qty > 0)); }

	function confirmAddress(addr, lat, lng) {
		const clean = String(addr || "").trim();
		if (!clean) return;
		setDeliveryAddr(clean);
		setAddressSet(true);
		persistAddress(clean, lat, lng);
	}

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", width: "100%" }}>
				<div style={{ padding: "28px 0 16px" }}>
					<SkeletonHeading />
					<div style={{ display: "flex", gap: 20, margin: "16px 0 28px" }}>
						{[...Array(4)].map((_, i) => <SkeletonCircle key={i} />)}
					</div>
				</div>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
					{[...Array(6)].map((_, i) => <SkeletonProductCard key={i} />)}
				</div>
			</div>
		</div>
	);
	if (!addressSet) return (
		<FoodAddressCapture
			allowAutoResume={allowAddressAutoResume}
			onConfirm={confirmAddress}
			onBack={deliveryAddr ? () => setAddressSet(true) : undefined}
			userLocation={userLocation}
			subtitle={t("catering.addressSubtitle")}
			ctaLabel={t("catering.findCaterers")}
		/>
	);

	const selectedStoreObj = shopsWithDist.find((v) => Number(v.id) === Number(activeVendor));

	if (caterView === "cart") return (
		<FoodCartPage
			cart={cart}
			setCart={setCart}
			restaurant={selectedStoreObj}
			onBack={() => setCaterView("menu")}
			onCheckout={(code) => { setCheckoutPromo(code || null); setCaterView("checkout"); }}
			backLabel={t("catering.backToMenu")}
			emptyLabel={t("catering.browseMenu")}
			vertical="catering"
			deliveryFeeEstimate={0}
		/>
	);
	if (caterView === "checkout") {
		if (!selectedStoreObj) {
			return (
				<FoodCartPage
					cart={cart}
					setCart={setCart}
					onBack={() => setCaterView("vendors")}
					onCheckout={() => setCaterView("vendors")}
					backLabel={t("catering.allCaterers")}
					emptyLabel={t("catering.browseMenu")}
					vertical="catering"
					deliveryFeeEstimate={0}
				/>
			);
		}
		return (
			<CateringCheckoutPage
				cart={cart}
				onBack={() => setCaterView("cart")}
				onPlaceOrder={(oid) => { setCaterOrderId(oid); setCaterView("tracking"); saveCaterSession({ activeOrderId: oid }); }}
				vendor={selectedStoreObj}
				initialPromoCode={checkoutPromo}
			/>
		);
	}
	if (caterView === "tracking") return (
		<FoodTrackingPage
			restaurant={{ name: selectedStoreObj?.name ?? t("catering.title") }}
			orderId={caterOrderId}
			deliveryMode="delivery"
			merchantType="caterer"
			onBack={() => setCaterView(activeVendor ? "menu" : "vendors")}
			onDone={() => {
				clearCaterSession();
				setCart([]);
				setCaterView("vendors");
				setActiveVendor(null);
				setCaterOrderId(null);
			}}
		/>
	);

	const totalItems = cart.reduce((s, c) => s + c.qty, 0);
	const filteredMenu = cateringItems.filter((item) => {
		const cat = categoryDefs.find((c) => c.id === activeCategory);
		const matchCat = !activeCategory || activeCategory === "all" || !cat?.match || item.category === cat.match;
		const matchQ = !query || item.name.toLowerCase().includes(query.toLowerCase());
		return matchCat && matchQ;
	});

	if (caterView === "vendors") return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center", marginBottom: 4 }}>{landingTitle}</h1>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", marginBottom: 16 }}>{t("catering.subtitle")}</p>
					<div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginBottom: 8 }}>
						<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{deliveryAddr}</span>
						<button type="button" onClick={() => { setAllowAddressAutoResume(false); setAddressSet(false); }} className="text-text-secondary" style={{ background: "none", border: "none", padding: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer", textDecoration: "underline", whiteSpace: "nowrap" }}>{t("catering.changeAddress")}</button>
					</div>
					<ConciergeEntryBanner
						to="event-plan"
						title={i18n.t("event.bannerTitle", { defaultValue: "Planning a whole event?" })}
						body={i18n.t("event.bannerBody", { defaultValue: "Book venue, catering & flowers together — one date, one cart, one checkout." })}
					/>
				</div>
				{storesLoading ? (
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, paddingBottom: 24 }}>
						{[...Array(3)].map((_, i) => <Skel key={i} h={140} r={16} />)}
					</div>
				) : storesError ? (
					<div style={{ textAlign: "center", padding: "60px 20px" }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 12 }}>{!isAuthenticated() ? t("catering.signInToBrowse") : storesError}</p>
						<button type="button" onClick={() => setReloadToken((n) => n + 1)} style={{ background: "#2563eb", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, padding: "8px 16px", cursor: "pointer" }}>{t("catering.retry")}</button>
					</div>
				) : cateringStores.length === 0 ? (
					<div style={{ textAlign: "center", padding: "60px 20px" }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 8 }}>{t("catering.noCaterersArea")}</p>
						<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 12 }}>{t("catering.tryDifferentAddress")}</p>
						<button type="button" onClick={() => { setAllowAddressAutoResume(false); setAddressSet(false); }} className="text-text-secondary" style={{ background: "none", border: "none", textDecoration: "underline", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("catering.changeAddress")}</button>
					</div>
				) : (
					<>
						<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto 24px" }}>
							<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "13px 18px", gap: 12 }}>
								<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={18} /></div>
								<input value={storeQuery} onChange={(e) => setStoreQuery(e.target.value)} placeholder={t("catering.searchCaterers")} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 15, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} />
							</div>
							<div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
								{[{ id: "recommended", labelKey: "catering.sortRecommended" }, { id: "distance", labelKey: "catering.sortDistance" }, { id: "rating", labelKey: "catering.sortRating" }].map((opt) => (
									<button type="button" key={opt.id} onClick={() => setSortBy(opt.id)} style={{
										display: "flex", alignItems: "center", gap: 6,
										padding: "6px 12px", borderRadius: 12,
										background: sortBy === opt.id ? "rgba(37, 99, 235, 0.16)" : "var(--color-surface-raised)",
										border: `1px solid ${sortBy === opt.id ? "rgba(37, 99, 235, 0.4)" : "var(--color-border)"}`,
										color: sortBy === opt.id ? "#fff" : "var(--color-text-secondary)",
										fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
									}}>
										<span>{t(opt.labelKey)}</span>
									</button>
								))}
							</div>
						</div>
						{sortedShops.length === 0 ? (
							<div style={{ textAlign: "center", padding: "40px 20px" }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 8 }}>{t("catering.noCaterersMatch")}</p>
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("catering.tryDifferentSearch")}</p>
							</div>
						) : (
							<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(280px, 1fr))", gap: isMobile ? 12 : 16, paddingBottom: 24 }}>
								{sortedShops.map((v, i) => (
									<div key={v.id} onClick={() => openVendor(v)}
										style={{ borderRadius: 16, border: `1.5px solid ${v.accent}33`, background: v.color, padding: 0, cursor: "pointer", overflow: "hidden", animation: `fadeUp 0.3s ease ${i * 60}ms both` }}
										onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; }}
										onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; }}>
										<div style={{ height: isMobile ? 80 : 120, background: "#0d1421", position: "relative", overflow: "hidden" }}>
											{v.img
												? <SafeImage loading="lazy" decoding="async" src={v.img} alt={v.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
												: <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
													<svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke={v.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
												</div>
											}
											<div style={{ position: "absolute", top: 6, right: 6, display: "flex", alignItems: "center", gap: 3, background: "rgba(0,0,0,0.6)", borderRadius: 20, padding: "2px 7px" }}>
												{v.rating != null ? (
													<>
														<span style={{ color: "#f59e0b", fontSize: 10 }}>★</span>
														<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, color: "#fff" }}>{v.rating}</span>
													</>
												) : (
													<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, color: "#fff" }}>{t("catering.newBadge")}</span>
												)}
											</div>
										</div>
										<div style={{ padding: "14px 18px" }}>
											<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#fff", marginBottom: 4 }}>{v.name}</p>
											<div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
												<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
													{v.rating != null ? `(${v.reviews} ${t("catering.reviews")})` : t("catering.newBadge")}
												</span>
											</div>
											<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
												<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
													{v.dist != null ? `${v.dist.toFixed(1)} km · ${t("catering.leadTime")}` : t("catering.leadTime")}
												</span>
												{v.minGuests != null && (
													<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: v.accent, fontWeight: 600 }}>{t("catering.minGuests", { count: v.minGuests })}</span>
												)}
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1060, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 16px", animation: "fadeUp 0.3s ease both" }}>
					<button type="button" onClick={() => setCaterView("vendors")} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 16, padding: 0 }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
						{t("catering.allCaterers")}
					</button>
					{selectedStoreObj && (
						<div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--color-border-subtle)" }}>
							<div style={{ width: 52, height: 52, borderRadius: 14, background: selectedStoreObj.color, border: `1px solid ${selectedStoreObj.accent}33`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
								{selectedStoreObj.img
									? <SafeImage src={selectedStoreObj.img} alt={selectedStoreObj.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
									: <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={selectedStoreObj.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>}
							</div>
							<div style={{ flex: 1, textAlign: "center" }}>
								<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 24, letterSpacing: "0.03em" }}>{selectedStoreObj.name}</h2>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
									{selectedStoreObj.rating != null ? `${selectedStoreObj.rating} ★ · ${selectedStoreObj.reviews} ${t("catering.reviews")}` : t("catering.newBadge")}
									{selectedStoreObj.minGuests != null ? ` · ${t("catering.minGuests", { count: selectedStoreObj.minGuests })}` : ""}
									{selectedStoreObj.dist != null ? ` · ${selectedStoreObj.dist.toFixed(1)} km` : ""}
								</p>
							</div>
							<button type="button" onClick={() => setCaterView("cart")} className="border border-border" style={{ position: "relative", background: "none", borderRadius: 12, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
								<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
								{totalItems > 0 && <span style={{ position: "absolute", top: -6, right: -6, background: "#2563eb", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>{totalItems}</span>}
							</button>
						</div>
					)}
					<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
						<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "13px 18px", gap: 12 }}>
							<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={18} /></div>
							<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${selectedStoreObj?.name ?? ""}...`} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 15, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} />
						</div>
					</div>
				</div>
				{categoryDefs.length > 1 && (
					<div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 20 }}>
						<button type="button" onClick={() => catScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })}
							className={catScrollState.atStart ? "bg-surface text-text-muted" : "bg-surface-raised text-text-primary"}
							style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, border: `1px solid ${catScrollState.atStart ? "var(--color-border-subtle)" : "var(--color-border)"}`, cursor: catScrollState.atStart ? "default" : "pointer", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
						</button>
						<div ref={catScrollRef} className="ecom-cat-scroll" style={{ flex: 1, display: "flex", gap: 20, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none", justifyContent: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "center" : "flex-start" }}>
							{categoryDefs.map((cat, i) => <LeoButton key={cat.id} cat={cat} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 30} />)}
						</div>
						<button type="button" onClick={() => catScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
							style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: catScrollState.atEnd ? "var(--color-surface)" : "#2563eb", border: `1px solid ${catScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`, color: catScrollState.atEnd ? "var(--color-text-muted)" : "#fff", cursor: catScrollState.atEnd ? "default" : "pointer", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
						</button>
					</div>
				)}
				<div style={{ flex: 1, overflowY: "auto", paddingBottom: totalItems > 0 ? 88 : 24 }}>
					{itemsLoading ? (
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18 }}>
							{[...Array(4)].map((_, i) => <Skel key={i} h={160} r={14} />)}
						</div>
					) : filteredMenu.length > 0 ? (
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(260px, 1fr))", gap: isMobile ? 10 : 18 }}>
							{filteredMenu.map((item, i) => {
								const inCart = cart.find((c) => c.lineId === item.id);
								return (
									<div key={item.id} className="bg-surface border border-border-subtle" style={{ borderRadius: 14, overflow: "hidden", animation: `fadeUp 0.35s ease ${i * 40}ms both` }}>
										<div style={{ height: isMobile ? 90 : 120, background: "var(--color-surface-raised)", position: "relative", overflow: "hidden" }}>
											{item.img
												? <SafeImage src={item.img} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
												: <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
													<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
												</div>}
										</div>
										<div style={{ padding: "14px 16px" }}>
											<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{item.name}</p>
											{item.desc ? <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 12 }}>{item.desc}</p> : <div style={{ marginBottom: 12 }} />}
											<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
												<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14 }}>{fmt(item.price, getUserRegion().currency, i18n.language)}</span>
												{inCart ? (
													<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
														<button type="button" onClick={() => decItem(item.id)} style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)", cursor: "pointer", fontSize: 16 }}>−</button>
														<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600 }}>{inCart.qty}</span>
														<button type="button" onClick={() => incItem(item.id)} style={{ width: 26, height: 26, borderRadius: "50%", background: "#2563eb", border: "none", color: "#fff", cursor: "pointer", fontSize: 16 }}>+</button>
													</div>
												) : (
													<button type="button" onClick={() => addItem(item)} style={{ padding: "6px 14px", background: "#2563eb", border: "none", borderRadius: 8, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{t("catering.add")}</button>
												)}
											</div>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: 0.4, paddingTop: 60 }}>
							<svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>{t("catering.noPackages")}</p>
						</div>
					)}
				</div>
				{totalItems > 0 && (
					<div style={{ position: "fixed", bottom: isMobile ? 78 : 24, left: "50%", transform: "translateX(-50%)", zIndex: 50, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
						<button type="button" onClick={() => setCaterView("cart")} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 28px", background: "#2563eb", border: "none", borderRadius: 50, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
							<span style={{ background: "rgba(255,255,255,0.2)", borderRadius: 20, padding: "2px 10px", fontSize: 13 }}>{totalItems}</span>
							{t("catering.viewOrder")}
							<span>{fmt(cart.reduce((s, c) => s + c.price * c.qty, 0), getUserRegion().currency, i18n.language)}</span>
						</button>
						{hasActiveEvent && (
							<button
								onClick={() => {
									const items = cart.map((c) => ({ food_item_id: Number(c.lineId), qty: c.qty, modifier_option_ids: [] }));
									const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
									eventCart.setLine("catering", {
										vendor_id: activeVendor,
										seller_id: activeVendor,
										title: selectedStoreObj?.name || "Catering",
										items,
										line_total: Number((subtotal * 1.08).toFixed(2)),
									});
									window.__nav?.("event-plan");
								}}
								style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 22px", background: "#f97316", border: "none", borderRadius: 50, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 8px 28px rgba(249,115,22,0.5)" }}
							>
								{eventCart.has("catering") ? i18n.t("event.updateInEvent", { defaultValue: "Update in my event" }) : i18n.t("event.addToEvent", { defaultValue: "Add to my event" })}
							</button>
						)}
					</div>
				)}
			</div>
			<EventCartPill bottom={isMobile ? 132 : 78} />
		</div>
	);
}

export { CateringPage };
