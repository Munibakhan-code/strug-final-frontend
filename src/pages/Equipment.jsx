import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import i18n from "../i18n/index.js";
import { getBookingListings, getBookingListing, createBooking, getBookingQuote, getBookings, cancelBooking, getListingAvailability } from '../api/booking';
import { CardPaymentField, useBookingPayment } from "../components/BookingPayment.jsx";
import { isAuthenticated } from '../store/auth';
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon, EquipmentIcon } from "../components/icons.jsx";
import { Skel, SkeletonCircle, SkeletonHeading, SkeletonEquipmentCard } from "../components/skeletons.jsx";
import { LeoButton, AddressAutocomplete, HostListingCTA } from "../components/shared.jsx";
import { messageUser } from "../api/chat";
import { PLATFORM_FEE } from "../utils/regionConfig";
import { bindCheckoutReferralCode } from "../api/user";
import { mediaUrls } from "../utils/mediaUrl";
import { mapBookingListingToEquipment, mapBookingListingsToEquipment, clampEquipmentQuantity, equipmentShowsQuantityStepper, maxEquipmentQuantity } from "../utils/equipmentMappers.js";
import { mapGuestBookingsToEquipmentTrips, filterEquipmentTripsByBucket } from "../utils/equipmentTrips.js";
import { buildEquipmentUnavailableNightSet, stayRangeConflicts } from "../utils/equipmentAvailability.js";
import {
	buildEquipmentListingsQuery,
	filterEquipmentListings,
	equipmentBrowseFiltersActive,
} from "../utils/equipmentBrowseFilters.js";
import { EQUIPMENT_CATEGORY_DEFS } from "../utils/equipmentCategories.js";
import { slugify } from "../utils/slugify.js";
import { getVerticalProfileByUser } from "../api/verticalProfile.js";
import {
	EQUIPMENT_PROFILE_VERTICAL,
	LEGACY_HOSTING_PROFILE_VERTICAL,
	filterRowsByVertical,
} from "../utils/bookingIsolation.js";
import { Avatar } from "../components/SafeImage.jsx";

// Card face is item.gradient — either a product photo or a hardcoded dark gradient
// fallback (never a themeable neutral), so all colors inside stay hardcoded "white on
// dark photo" treatments, matching the hero-scrim pattern used elsewhere (see Floral.jsx).
function EquipmentItemCard({ item, delay = 0, onClick }) {
	const [saved, setSaved] = useState(false);
	return (
		<div style={{ borderRadius: 14, background: item.gradient, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", display: "flex", flexDirection: "column", animation: `fadeUp 0.4s ease ${delay}ms both`, position: "relative" }}>
			{/* Image area */}
			<div style={{ height: 140, background: item.gradient, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
				{item.image && <img loading="lazy" decoding="async" src={item.image} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none"; }} />}
				{!item.available && (
					<div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
						<span style={{ fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", background: "rgba(220,38,38,0.8)", padding: "4px 10px", borderRadius: 20 }}>{i18n.t("common.unavailable")}</span>
					</div>
				)}
				{!item.image && <EquipmentIcon s={36} />}
				{/* Bookmark */}
				<button onClick={() => setSaved(v => !v)} style={{ position: "absolute", top: 10, right: 10, zIndex: 3, background: "rgba(0,0,0,0.45)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: saved ? "#2563eb" : "rgba(255,255,255,0.6)" }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
				</button>
			</div>
			{/* Info */}
			<div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
				<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
					<p style={{ fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.3 }}>{item.name}</p>
					<span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif", flexShrink: 0, background: "rgba(255,255,255,0.05)", padding: "2px 8px", borderRadius: 20 }}>{item.category}</span>
				</div>
				{/* Tags — only attrs.tags; never invent from description */}
				{(item.tags?.length > 0) && (
					<div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
						{item.tags.map(t => (
							<span key={t} style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif", background: "rgba(255,255,255,0.05)", padding: "2px 7px", borderRadius: 10 }}>{t}</span>
						))}
					</div>
				)}
				{/* Price row */}
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 8 }}>
					<div>
						<span style={{ fontSize: 18, fontWeight: 800, color: "#2563eb", fontFamily: "'Barlow Condensed', sans-serif" }}>${item.priceDay}</span>
						<span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif" }}>/day</span>
						<p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: "'DM Sans', sans-serif", marginTop: 1 }}>${item.deposit} deposit</p>
					</div>
					{item.available && (
						<button onClick={onClick} style={{ background: "#2563eb", border: "none", borderRadius: 8, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, padding: "7px 14px", cursor: "pointer" }}>
							Rent Now
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

function EquipmentDetailPage({ item, mode, onBack, onBook }) {
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [galleryImages] = useState(() => mediaUrls(item.images));
	const [galleryIdx, setGalleryIdx] = useState(0);
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");
	const [quantity, setQuantity] = useState(1);
	const [equipChat, setEquipChat] = useState(false);
	const [hostMsg, setHostMsg] = useState("");
	const [msgSending, setMsgSending] = useState(false);
	const [msgSent, setMsgSent] = useState(false);
	// Listing payload carries owner_id — hydrate host name/photo from the
	// scoped equipment vertical profile (fallback to legacy "hosting" for older hosts).
	const [hostProfile, setHostProfile] = useState(null);
	const days = startDate && endDate ? Math.max(0, Math.round((new Date(endDate) - new Date(startDate)) / 86400000)) : 0;
	const maxQty = maxEquipmentQuantity(item.capacity);
	const qty = clampEquipmentQuantity(quantity, item.capacity);
	const showQty = equipmentShowsQuantityStepper(item.capacity);
	// Server-authoritative price + availability — fees are no longer hardcoded here.
	const [quote, setQuote] = useState(null);
	const [quoteLoading, setQuoteLoading] = useState(false);
	const [unavailableDays, setUnavailableDays] = useState(() => new Set());
	const [availLoading, setAvailLoading] = useState(() => !!item.id);
	const [availError, setAvailError] = useState(false);
	// Client-side estimate used only as a fallback when the quote call fails.
	const estSubtotal = days * item.priceDay * qty;
	const estServiceFee = Math.round(estSubtotal * PLATFORM_FEE);
	const estDeposit = item.deposit * qty;
	const estTotal = estSubtotal + estDeposit + estServiceFee;
	const subtotal = quote?.subtotal ?? estSubtotal;
	const serviceFee = quote?.service_fee ?? estServiceFee;
	const deposit = quote?.deposit ?? estDeposit;
	const total = quote?.total ?? estTotal;
	const unavailable = quote ? quote.available === false : false;
	const datesConflict = stayRangeConflicts(startDate, endDate, unavailableDays);
	const canBook = days > 0 && !quoteLoading && !unavailable && !datesConflict && !availLoading;
	const remaining = quote?.remaining != null && Number.isFinite(Number(quote.remaining))
		? Number(quote.remaining)
		: null;
	useEffect(() => {
		if (!item.id) { setAvailLoading(false); return; }
		let alive = true;
		setAvailLoading(true);
		setAvailError(false);
		getListingAvailability(item.id)
			.then((res) => {
				if (!alive) return;
				setUnavailableDays(buildEquipmentUnavailableNightSet(res, { capacity: item.capacity }));
				setAvailLoading(false);
			})
			.catch(() => {
				if (!alive) return;
				setAvailError(true);
				setAvailLoading(false);
			});
		return () => { alive = false; };
	}, [item.id, item.capacity]);
	useEffect(() => {
		setHostProfile(null);
		if (!item.hostId) return;
		let alive = true;
		const uid = item.hostId;
		getVerticalProfileByUser(uid, EQUIPMENT_PROFILE_VERTICAL)
			.then(async (res) => {
				const primary = res?.data ?? res ?? null;
				const hasIdentity = !!(primary?.display_name || primary?.business_name || primary?.profile_pic_url);
				if (hasIdentity) return primary;
				try {
					const legacy = await getVerticalProfileByUser(uid, LEGACY_HOSTING_PROFILE_VERTICAL);
					return legacy?.data ?? legacy ?? primary;
				} catch {
					return primary;
				}
			})
			.then((profile) => { if (alive) setHostProfile(profile); })
			.catch(() => {});
		return () => { alive = false; };
	}, [item.hostId]);
	const hostName = hostProfile?.display_name || hostProfile?.business_name || item.host;
	const hostPhoto = hostProfile?.profile_pic_url || null;
	const hostInitial = (hostName || item.avatar || "E").toString().trim().charAt(0).toUpperCase() || "E";
	useEffect(() => {
		setQuantity((q) => clampEquipmentQuantity(q, item.capacity));
	}, [item.capacity]);
	useEffect(() => {
		if (!(days > 0)) { setQuote(null); return; }
		let cancelled = false;
		setQuoteLoading(true);
		getBookingQuote({
			booking_listing_id: item.id,
			start_date: startDate,
			end_date: endDate,
			quantity: qty,
		}).then(res => {
			if (cancelled) return;
			const q = res?.data ?? res;
			setQuote(q);
		}).catch(() => { if (!cancelled) setQuote(null); })
		  .finally(() => { if (!cancelled) setQuoteLoading(false); });
		return () => { cancelled = true; };
	}, [startDate, endDate, days, item.id, qty]);

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, overflowY: "auto", maxWidth: 920, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<Skel w={160} h={18} r={6} style={{ marginTop: 24, marginBottom: 20 }} />
				<Skel w="100%" h={280} r={18} style={{ marginBottom: 28 }} />
				<div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
					<div style={{ flex: 2, minWidth: 280 }}>
						<Skel w="70%" h={28} r={8} style={{ marginBottom: 12 }} />
						<div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
							{[...Array(3)].map((_,i) => <Skel key={i} w={60} h={24} r={20} />)}
						</div>
						<Skel w="100%" h={60} r={8} style={{ marginBottom: 20 }} />
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
							{[...Array(4)].map((_,i) => <Skel key={i} w="100%" h={60} r={10} />)}
						</div>
					</div>
					<div style={{ flex: 1, minWidth: 240 }}>
						<Skel w="100%" h={240} r={18} />
					</div>
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 920, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<button onClick={onBack} className="text-text-secondary" style={{ marginTop: 24, marginBottom: 20, display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}>
					<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					{i18n.t("equipment.backToEquipment")}
				</button>
				{/* Hero / Gallery — photo (or gradient fallback) with dark overlay badges/controls.
				    Stays hardcoded dark in both themes for legibility over the image, same
				    judgment call as the Hub.jsx hero scrim. */}
				<div style={{ marginBottom: 28, borderRadius: 18, overflow: "hidden", position: "relative" }}>
					<div style={{ height: 280, background: galleryImages.length ? "none" : item.gradient, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
						{galleryImages.length > 0 ? (
							<img loading="lazy" decoding="async" src={galleryImages[galleryIdx]} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
						) : (
							<EquipmentIcon s={56} />
						)}
						<div style={{ position: "absolute", top: 14, left: 14, background: "rgba(0,0,0,0.6)", borderRadius: 20, padding: "5px 14px" }}>
							<span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", fontFamily: "'DM Sans', sans-serif" }}>{item.category}</span>
						</div>
						<div style={{ position: "absolute", top: 14, right: 14, background: mode === "delivery" ? "rgba(37,99,235,0.8)" : "rgba(5,150,105,0.8)", borderRadius: 20, padding: "5px 14px", display: "flex", alignItems: "center", gap: 5 }}>
							<svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								{mode === "delivery"
									? <><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>
									: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></>}
							</svg>
							<span style={{ fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{mode === "delivery" ? "Delivery" : "Pickup"}</span>
						</div>
						{galleryImages.length > 1 && (
							<>
								<button onClick={() => setGalleryIdx(i => (i - 1 + galleryImages.length) % galleryImages.length)} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
									<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
								</button>
								<button onClick={() => setGalleryIdx(i => (i + 1) % galleryImages.length)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
									<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
								</button>
								<div style={{ position: "absolute", bottom: 10, right: 14, background: "rgba(0,0,0,0.55)", borderRadius: 20, padding: "3px 10px" }}>
									<span style={{ fontSize: 11, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{galleryIdx + 1} / {galleryImages.length}</span>
								</div>
							</>
						)}
						{!item.available && (
							<div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
								<span style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", background: "rgba(220,38,38,0.8)", padding: "6px 14px", borderRadius: 20, letterSpacing: "0.08em", textTransform: "uppercase" }}>{i18n.t("common.unavailable")}</span>
							</div>
						)}
					</div>
					{galleryImages.length > 1 && (
						<div style={{ display: "flex", gap: 6, padding: "8px 0 0", overflowX: "auto", scrollbarWidth: "none" }}>
							{galleryImages.map((src, i) => (
								<div key={i} onClick={() => setGalleryIdx(i)} style={{ flexShrink: 0, width: 72, height: 56, borderRadius: 8, overflow: "hidden", cursor: "pointer", border: `2px solid ${i === galleryIdx ? "#2563eb" : "transparent"}`, transition: "border-color 0.15s" }}>
									<img loading="lazy" decoding="async" src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
								</div>
							))}
						</div>
					)}
				</div>
				<div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
					{/* Left */}
					<div style={{ flex: 2, minWidth: 280 }}>
						<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, letterSpacing: "0.02em", marginBottom: 6, lineHeight: 1.2 }}>{item.name}</h1>
						{item.location && (
							<div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
								<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{item.location}</span>
							</div>
						)}
						{(item.tags?.length > 0) && (
							<div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--color-border-subtle)" }}>
								{item.tags.map(t => (
									<span key={t} className="text-text-secondary bg-border" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", padding: "3px 10px", borderRadius: 20 }}>{t}</span>
								))}
							</div>
						)}
						{item.description && (
							<p className="text-text-secondary" style={{ fontSize: 14, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.75, marginBottom: item.rules ? 10 : 16 }}>
								{item.description}
							</p>
						)}
						{item.rules && (
							<div className="bg-surface-raised border border-border" style={{ borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{i18n.t("equipment.requirementsRules")}</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.6 }}>{item.rules}</p>
							</div>
						)}
						{(hostName || item.hostId) && (
							<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
								<div
									onClick={() => { if (item.hostId) { window.__profileTargetId = item.hostId; window.__profileVertical = EQUIPMENT_PROFILE_VERTICAL; window.__nav?.("profile"); } }}
									style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, cursor: item.hostId ? "pointer" : "default" }}
								>
									<Avatar url={hostPhoto} initials={hostInitial} size={44} alt="" style={{ background: item.avatarColor || "#2563eb", fontSize: 18, fontWeight: 800 }} />
									<div>
										<p style={{ fontSize: 13, fontWeight: 700, color: item.hostId ? "#60a5fa" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif" }}>
											{i18n.t("equipment.hostedBy")}{hostName ? ` ${hostName}` : ""}
										</p>
										{item.hostId ? (
											<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("equipment.viewProfile")}</p>
										) : null}
									</div>
								</div>
								<button type="button" onClick={() => { setEquipChat(v => !v); setMsgSent(false); }} style={{ background: equipChat ? "rgba(37,99,235,0.12)" : "var(--color-surface-raised)", border: `1px solid ${equipChat ? "rgba(37,99,235,0.3)" : "var(--color-border)"}`, borderRadius: 8, padding: "6px 14px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, color: equipChat ? "#60a5fa" : "var(--color-text-secondary)", cursor: "pointer", flexShrink: 0, transition: "all 0.15s" }}>
									{equipChat ? i18n.t("equipment.closeChat") : i18n.t("common.contact")}
								</button>
							</div>
						)}
						{!(hostName || item.hostId) && (
							<button onClick={() => { setEquipChat(v => !v); setMsgSent(false); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: equipChat ? "rgba(37,99,235,0.12)" : "var(--color-surface-raised)", border: `1px solid ${equipChat ? "rgba(37,99,235,0.3)" : "var(--color-border)"}`, borderRadius: 10, padding: "10px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: equipChat ? "#60a5fa" : "var(--color-text-secondary)", cursor: "pointer", marginBottom: 16, transition: "all 0.15s" }}>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
								{equipChat ? i18n.t("equipment.closeChat") : i18n.t("equipment.messageOwner")}
							</button>
						)}
						{equipChat && (
							<div className="bg-surface border border-border" style={{ marginBottom: 16, borderRadius: 12, padding: "12px 14px", animation: "fadeUp 0.2s ease both" }}>
								{msgSent ? (
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#059669" }}>{i18n.t("equipment.messageSent")}</p>
								) : (
									<>
										<textarea value={hostMsg} onChange={e => setHostMsg(e.target.value)} placeholder={i18n.t("equipment.askOwnerPlaceholder")} rows={3} className="bg-surface-raised border border-border text-text-primary"
											style={{ width: "100%", boxSizing: "border-box", borderRadius: 8, padding: "9px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", marginBottom: 8 }}
											onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.4)"}
											onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
										<div style={{ display: "flex", gap: 8 }}>
											<button onClick={() => setEquipChat(false)} className="border border-border text-text-secondary" style={{ flex: 1, padding: "8px 0", borderRadius: 8, background: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
											<button onClick={async () => {
												if (!hostMsg.trim() || msgSending) return;
												setMsgSending(true);
												try {
													if (item.hostId) {
														await messageUser(item.hostId, {
															initialMessage: hostMsg.trim(),
															navigate: true,
															sourceVertical: "equipment",
														});
													}
													setMsgSent(true);
												} catch { setMsgSent(true); }
												finally { setMsgSending(false); }
											}} style={{ flex: 2, padding: "8px 0", borderRadius: 8, border: "none", background: hostMsg.trim() ? "#2563eb" : "var(--color-border)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: hostMsg.trim() ? "#fff" : "var(--color-text-muted)", cursor: hostMsg.trim() ? "pointer" : "default" }}>
												{msgSending ? "Sending…" : "Send"}
											</button>
										</div>
									</>
								)}
							</div>
						)}
						<div style={{ paddingBottom: 20, borderBottom: "1px solid var(--color-border-subtle)", marginBottom: 20 }} />
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
							{[
								{ label: "Daily rate", val: `$${item.priceDay}/day` },
								{ label: "Security deposit", val: `$${item.deposit}` },
								{ label: i18n.t("pinboard.category"), val: item.category },
								{ label: "Fulfillment", val: mode === "delivery" ? "Delivery" : "Pickup" },
								...(item.capacityKnown ? [{ label: i18n.t("equipment.copiesLabel"), val: String(item.capacity) }] : []),
							].map(r => (
								<div key={r.label} className="bg-surface-raised" style={{ borderRadius: 10, padding: "12px 14px" }}>
									<p className="text-text-muted" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{r.label}</p>
									<p className="text-text-primary" style={{ fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{r.val}</p>
								</div>
							))}
						</div>
					</div>
					{/* Right: booking card */}
					{item.available && (
						<div className="bg-surface-raised border border-border" style={{ ...(isMobile ? { width: "100%", maxWidth: "100%" } : { flex: 1, minWidth: 240, position: "sticky", top: 20 }), borderRadius: 18, padding: 22 }}>
							<div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 18 }}>
								<span className="text-text-primary" style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>${item.priceDay}</span>
								<span className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>/ day</span>
							</div>
							{/* Date range */}
							<div style={{ borderRadius: 12, border: `1px solid ${datesConflict ? "rgba(248,113,113,0.45)" : "var(--color-border)"}`, overflow: "hidden", marginBottom: 10 }}>
								<div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border-subtle)" }}>
									<p className="text-text-secondary" style={{ fontSize: 9, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>{i18n.t("equipment.startDate")}</p>
									<input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={startDate ? "text-text-primary" : "text-text-muted"} style={{ background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer", colorScheme: "dark", width: "100%" }} />
								</div>
								<div style={{ padding: "10px 14px" }}>
									<p className="text-text-secondary" style={{ fontSize: 9, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>{i18n.t("equipment.endDate")}</p>
									<input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={endDate ? "text-text-primary" : "text-text-muted"} style={{ background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer", colorScheme: "dark", width: "100%" }} />
								</div>
							</div>
							{availLoading && (
								<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>{i18n.t("equipment.checkingAvailability")}</p>
							)}
							{availError && (
								<p style={{ fontSize: 11, color: "#fbbf24", fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>{i18n.t("equipment.availabilityLoadFailed")}</p>
							)}
							{datesConflict && (
								<p style={{ fontSize: 12, color: "#f87171", fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>{i18n.t("equipment.datesUnavailable")}</p>
							)}
							{showQty && (
								<div className="border border-border" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "10px 14px", borderRadius: 12 }}>
									<div>
										<p className="text-text-secondary" style={{ fontSize: 9, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>{i18n.t("equipment.quantity")}</p>
										<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>
											{remaining != null
												? i18n.t("equipment.copiesLeft", { count: remaining })
												: i18n.t("equipment.copiesAvailable", { count: maxQty })}
										</p>
									</div>
									<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
										<button type="button" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQuantity(clampEquipmentQuantity(qty - 1, item.capacity))} className={`border border-border ${qty <= 1 ? "bg-surface-raised text-text-muted" : "bg-border text-text-primary"}`} style={{ width: 28, height: 28, borderRadius: 8, cursor: qty <= 1 ? "default" : "pointer", fontSize: 16, lineHeight: 1 }}>−</button>
										<span className="text-text-primary" style={{ minWidth: 20, textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14 }}>{qty}</span>
										<button type="button" aria-label="Increase quantity" disabled={qty >= maxQty} onClick={() => setQuantity(clampEquipmentQuantity(qty + 1, item.capacity))} className={`border border-border ${qty >= maxQty ? "bg-surface-raised text-text-muted" : "bg-border text-text-primary"}`} style={{ width: 28, height: 28, borderRadius: 8, cursor: qty >= maxQty ? "default" : "pointer", fontSize: 16, lineHeight: 1 }}>+</button>
									</div>
								</div>
							)}
							{days > 0 && (
								<div style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
									<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
										<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${item.priceDay} × {days} day{days > 1 ? "s" : ""}{qty > 1 ? ` × ${qty}` : ""}</span>
										<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${subtotal}</span>
									</div>
									<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
										<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("common.serviceFee")}</span>
										<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${serviceFee}</span>
									</div>
									<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
										<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("equipment.securityDeposit")}</span>
										<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${deposit}</span>
									</div>
									<div style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 8, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
										<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("equipment.totalDue")}</span>
										<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>${total}</span>
									</div>
									<p className="text-text-muted" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", marginTop: 6 }}>{i18n.t("equipment.depositRefunded")}</p>
								</div>
							)}
							{unavailable && !datesConflict && (
								<p style={{ fontSize: 12, color: "#f87171", fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>{quote?.reason || "These dates are no longer available."}</p>
							)}
							<button onClick={() => { if (!canBook) return; onBook({ startDate, endDate, days, quantity: qty, subtotal, serviceFee, deposit, total }); }} disabled={!canBook} style={{ width: "100%", background: canBook ? "#2563eb" : "var(--color-border)", border: "none", borderRadius: 12, padding: "14px 0", color: canBook ? "#fff" : "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: canBook ? "pointer" : "default", transition: "all 0.2s" }}>
								{days > 0 ? (availLoading || quoteLoading ? i18n.t("equipment.checkingAvailability") : datesConflict || unavailable ? i18n.t("common.unavailable") : "Confirm rental") : "Select rental dates"}
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function EquipmentCheckoutPage({ item, bookingInfo, mode, onBack, onConfirm }) {
	const { isMobile } = useViewport();
	const payBooking = useBookingPayment();
	const [address, setAddress] = useState("");
	const [refCode, setRefCode] = useState("");
	const [refApplied, setRefApplied] = useState(false);
	const [refLoading, setRefLoading] = useState(false);
	const [refError, setRefError] = useState(null);
	const [paying, setPaying] = useState(false);
	const [payError, setPayError] = useState("");

	async function handlePay() {
		setPayError("");
		if (!isAuthenticated()) { setPayError("Please log in to book."); return; }
		setPaying(true);
		try {
			const res = await createBooking({
				booking_listing_id: item.id,
				start_date: bookingInfo.startDate,
				end_date: bookingInfo.endDate,
				quantity: bookingInfo.quantity ?? 1,
				guests: 1,
				payment_method: "card",
				notes: mode === "delivery" && address ? `Delivery to: ${address}` : `Pickup`,
			});
			const booking = res?.data ?? res;
			// Charge the card for this booking (server-authoritative amount).
			const pay = await payBooking(booking?.booking_id);
			if (!pay.ok) { setPayError(pay.error); setPaying(false); return; }
			// Only advance to the confirmation screen on a real success.
			onConfirm(booking?.status === 'confirmed', booking?.booking_id ?? null);
		} catch (err) {
			const status = err?.response?.status;
			const msg = err?.response?.data?.message
				|| (status === 409 ? "These dates are no longer available."
					: status === 403 ? "You are not allowed to book this item."
					: status === 401 ? "Please log in to book."
					: status === 400 ? "Please check your rental details and try again."
					: "Unable to place booking. Please try again.");
			setPayError(msg);
			setPaying(false);
		}
	}
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 640, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<button onClick={onBack} className="text-text-secondary" style={{ marginTop: 24, marginBottom: 20, display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}>
					<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					Back
				</button>
				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 24 }}>{i18n.t("common.confirmAndPay")}</h2>
				{/* Rental summary */}
				<div className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: 20, marginBottom: 16 }}>
					<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{i18n.t("equipment.rentalSummary")}</p>
					<p className="text-text-primary" style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>{item.name}</p>
					<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{bookingInfo.startDate} → {bookingInfo.endDate} · {bookingInfo.days} day{bookingInfo.days > 1 ? "s" : ""}{(bookingInfo.quantity ?? 1) > 1 ? ` · ${bookingInfo.quantity} copies` : ""}</p>
					<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}>{i18n.t("equipment.fulfillment")}: {mode === "delivery" ? i18n.t("food.delivery") : i18n.t("food.pickup")}</p>
					<div className="bg-border" style={{ height: 1, marginBottom: 12 }} />
					<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
						<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("equipment.rentalLine", { days: bookingInfo.days, priceDay: item.priceDay })}</span>
						<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${bookingInfo.subtotal}</span>
					</div>
					<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
						<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("common.serviceFee")}</span>
						<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${bookingInfo.serviceFee}</span>
					</div>
					<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
						<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("equipment.securityDeposit")}</span>
						<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${bookingInfo.deposit ?? item.deposit}</span>
					</div>
					<div style={{ display: "flex", justifyContent: "space-between" }}>
						<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("equipment.totalDueToday")}</span>
						<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>${bookingInfo.total}</span>
					</div>
				</div>
				{/* Delivery address or pickup info */}
				<div className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: 20, marginBottom: 16 }}>
					<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{mode === "delivery" ? i18n.t("equipment.deliveryAddress") : i18n.t("equipment.pickupLocation")}</p>
					{mode === "delivery" ? (
						<AddressAutocomplete useLocation value={address} onChange={setAddress} placeholder="Enter delivery address..." inputStyle={{ width: "100%", background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "12px 14px", color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
					) : (
						<div style={{ background: "rgba(5,150,105,0.08)", border: "1px solid rgba(5,150,105,0.2)", borderRadius: 10, padding: "12px 14px" }}>
							{item.location ? (
								<>
									<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", marginBottom: 2 }}>{i18n.t("equipment.pickupFromHost")}</p>
									<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{item.location}</p>
								</>
							) : (
								<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("equipment.pickupLocationPending")}</p>
							)}
						</div>
					)}
				</div>
				{/* Payment */}
				<CardPaymentField label={i18n.t("common.paymentMethod")} />
				<div className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: 20, marginBottom: 16 }}>
					<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{i18n.t("tempstay.referralCode")}</p>
					<div style={{ display: "flex", gap: 8 }}>
						<input value={refCode} onChange={e => { setRefCode(e.target.value); setRefApplied(false); setRefError(null); }} placeholder="Enter referral code (optional)" className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, borderRadius: 9, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none" }} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
						<button onClick={async () => { if (!refCode.trim() || refLoading || refApplied) return; setRefLoading(true); setRefError(null); try { await bindCheckoutReferralCode(refCode.trim()); setRefApplied(true); } catch (e) { setRefError(e?.response?.data?.message || "Invalid referral code."); } finally { setRefLoading(false); } }} style={{ padding: "10px 16px", background: refCode.trim() ? "#2563eb" : "var(--color-surface-raised)", border: "none", borderRadius: 9, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: refCode.trim() ? "#fff" : "var(--color-text-muted)", cursor: refCode.trim() ? "pointer" : "default" }}>{refApplied ? "Applied ✓" : refLoading ? "…" : "Apply"}</button>
					</div>
					{refError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginTop: 6 }}>{refError}</p>}
				</div>
				{payError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#f87171", marginBottom: 12, textAlign: "center" }}>{payError}</p>}
				<button onClick={handlePay} disabled={paying} style={{ width: "100%", background: paying ? "rgba(37,99,235,0.6)" : "#2563eb", border: "none", borderRadius: 14, padding: "16px 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700, cursor: paying ? "default" : "pointer" }}>
					{paying ? "Processing…" : `Pay $${bookingInfo.total}`}
				</button>
			</div>
		</div>
	);
}

function EquipmentConfirmPage({ item, bookingInfo, mode, onDone, isInstant, orderId }) {
	// Rating UI hidden until a real review API is wired (do not leave a non-POSTing modal).
	const { isMobile } = useViewport();
	const ref = orderId != null ? String(orderId) : "—";
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 40, paddingBottom: 24, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflowY: "auto" }}>
			<div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
				<div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(37,99,235,0.15)", border: "2px solid #2563eb", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
					<svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				</div>
				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8 }}>{i18n.t("equipment.rentalConfirmed")}</h2>
				<p className="text-text-secondary" style={{ fontSize: 14, fontFamily: "'DM Sans', sans-serif", marginBottom: 28 }}>{i18n.t("equipment.rentalEmailSent")}</p>
				<div className="bg-surface-raised" style={{ border: "1px solid rgba(37,99,235,0.25)", borderRadius: 18, overflow: "hidden", marginBottom: 20, textAlign: "left" }}>
					<div style={{ height: 8, background: "linear-gradient(90deg, #2563eb, #1d4ed8)" }} />
					<div style={{ padding: 24 }}>
						<p className="text-text-primary" style={{ fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>{item.name}</p>
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
							{[
								{ label: i18n.t("equipment.start"), val: bookingInfo.startDate },
								{ label: i18n.t("equipment.end"), val: bookingInfo.endDate },
								{ label: i18n.t("rideshare.duration"), val: `${bookingInfo.days} day${bookingInfo.days > 1 ? "s" : ""}` },
								{ label: i18n.t("equipment.fulfillment"), val: mode === "delivery" ? i18n.t("food.delivery") : i18n.t("food.pickup") },
								{ label: i18n.t("equipment.rentalCost"), val: `$${bookingInfo.subtotal}` },
								{ label: i18n.t("common.serviceFee"), val: `$${bookingInfo.serviceFee}` },
								{ label: i18n.t("equipment.deposit"), val: `$${bookingInfo.deposit ?? item.deposit}` },
							].map(r => (
								<div key={r.label}>
									<p className="text-text-muted" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{r.label}</p>
									<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{r.val}</p>
								</div>
							))}
						</div>
						<div style={{ borderTop: "1px dashed var(--color-border)", paddingTop: 16 }}>
							<p className="text-text-muted" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{i18n.t("common.bookingReference")}</p>
							<p style={{ fontSize: 18, fontWeight: 800, color: "#2563eb", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.12em" }}>{ref}</p>
							<div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
								<div style={{ width: 7, height: 7, borderRadius: "50%", background: isInstant ? "#10b981" : "#f59e0b" }} />
								<span style={{ fontSize: 12, color: isInstant ? "#10b981" : "#f59e0b", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>{isInstant ? "Rental confirmed" : "Awaiting owner confirmation"}</span>
							</div>
						</div>
					</div>
				</div>
				<button onClick={onDone} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 14, padding: "14px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
					Back to Equipment
				</button>
			</div>
	</div>
	);
}

function EquipmentPage({ initialListingId } = {}) {
	const { t, landingTitle, searchPlaceholder } = usePageI18n("equipment");
	const categories = useI18nCategoryList(EQUIPMENT_CATEGORY_DEFS);
	const { isMobile } = useViewport();
	const loading = usePageLoad();
	const [activeCategory, setActiveCategory] = useState("all");
	const [query, setQuery] = useState("");
	const [browseStartDate, setBrowseStartDate] = useState("");
	const [browseEndDate, setBrowseEndDate] = useState("");
	const [minPrice, setMinPrice] = useState("");
	const [maxPrice, setMaxPrice] = useState("");
	const [mode, setMode] = useState("delivery"); // "delivery" | "pickup"
	const [eqView, setEqView] = useState("landing");
	const [mainTab, setMainTab] = useState("find");
	const didEquipmentColdLoad = useRef(false);
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [eqView]);
	const [selectedItem, setSelectedItem] = useState(null);
	const [bookingInfo, setBookingInfo] = useState(null);
	const [eqIsInstant, setEqIsInstant] = useState(false);
	const [orderId, setOrderId] = useState(null);
	const [equipItems, setEquipItems] = useState([]);
	const [loadError, setLoadError] = useState(false);
	const [trips, setTrips] = useState([]);
	const [tripBucketFilter, setTripBucketFilter] = useState("all");
	const [tripsLoading, setTripsLoading] = useState(false);
	const [tripsFetched, setTripsFetched] = useState(false);
	const [cancellingId, setCancellingId] = useState(null);
	const [tripError, setTripError] = useState("");
	const filtersOn = equipmentBrowseFiltersActive({
		query,
		category: activeCategory,
		minPrice,
		maxPrice,
	});
	const loadEquipment = useCallback((isAlive = () => true) => {
		const params = buildEquipmentListingsQuery({
			q: query,
			minPrice,
			maxPrice,
		});
		getBookingListings(params).then(res => {
			if (!isAlive()) return;
			const arr = Array.isArray(res) ? res : (res?.data ?? []);
			setLoadError(false);
			setEquipItems(mapBookingListingsToEquipment(filterRowsByVertical(arr, 'equipment')));
		}).catch(() => {
			if (!isAlive()) return;
			setLoadError(true);
			setEquipItems([]);
		});
	}, [query, minPrice, maxPrice]);
	useEffect(() => {
		let alive = true;
		const handle = setTimeout(() => {
			loadEquipment(() => alive);
		}, 220);
		return () => {
			alive = false;
			clearTimeout(handle);
		};
	}, [loadEquipment]);
	const loadTrips = useCallback(() => {
		if (!isAuthenticated()) {
			setTrips([]);
			setTripsLoading(false);
			setTripsFetched(true);
			setTripError("");
			return;
		}
		setTripsLoading(true);
		setTripError("");
		getBookings({ role: "guest", vertical: "equipment" })
			.then((r) => {
				const arr = Array.isArray(r) ? r : (r?.data ?? []);
				setTrips(mapGuestBookingsToEquipmentTrips(arr));
			})
			.catch(() => setTripError(t("equipment.rentalsLoadFailed")))
			.finally(() => { setTripsLoading(false); setTripsFetched(true); });
	}, [t]);
	const handleCancelTrip = async (trip) => {
		if (!trip?.booking_id || !trip.can_cancel) return;
		if (!window.confirm(t("equipment.cancelConfirm"))) return;
		setCancellingId(trip.booking_id);
		setTripError("");
		try {
			await cancelBooking(trip.booking_id, "Guest cancelled from My rentals");
			setTrips((prev) => prev.map((x) =>
				x.booking_id === trip.booking_id
					? { ...x, status: "cancelled", can_cancel: false, bucket: "cancelled" }
					: x
			));
		} catch {
			setTripError(t("equipment.cancelFailed"));
		} finally {
			setCancellingId(null);
		}
	};
	const openEquipment = (item) => {
		setSelectedItem(item);
		setEqView("detail");
		if (item?.id != null) {
			window.history.pushState({ nav: "equipment" }, "", `/listing/equipment/${item.id}-${slugify(item.name || "equipment")}`);
		}
	};
	const openEquipmentById = (id) => {
		const listing = equipItems.find((v) => String(v.id) === String(id));
		if (listing) {
			openEquipment(listing);
			return;
		}
		setTripError("");
		getBookingListing(id).then((res) => {
			const row = res?.data ?? res;
			const mapped = mapBookingListingToEquipment(row);
			if (mapped) openEquipment(mapped);
			else setTripError(t("equipment.viewEquipmentFailed"));
		}).catch(() => {
			setTripError(t("equipment.viewEquipmentFailed"));
		});
	};
	// Cold-load /listing/equipment/:id (and App-seeded initialListingId).
	useEffect(() => {
		const tok = window.location.pathname.match(/^\/listing\/equipment\/([^/-]+)/)?.[1] || initialListingId;
		if (!tok || didEquipmentColdLoad.current) return;
		didEquipmentColdLoad.current = true;
		openEquipmentById(tok);
	}, [initialListingId]); // eslint-disable-line react-hooks/exhaustive-deps
	const catScrollRef = useRef(null);
	const [catScrollState, setCatScrollState] = useState({ atStart: true, atEnd: true });
	useLayoutEffect(() => {
		const el = catScrollRef.current;
		if (!el) return;
		const update = () => setCatScrollState(prev => { const atStart = el.scrollLeft <= 4, atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4; return prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }; });
		update();
		el.addEventListener("scroll", update, { passive: true });
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
	}, [eqView, mainTab]);

	if (eqView === "detail" && selectedItem) return <EquipmentDetailPage item={selectedItem} mode={mode} onBack={() => { setEqView("landing"); setSelectedItem(null); window.history.pushState({ nav: "equipment" }, "", "/equipment"); }} onBook={info => { setBookingInfo(info); setEqView("checkout"); }} />;
	if (eqView === "checkout" && selectedItem) return <EquipmentCheckoutPage item={selectedItem} bookingInfo={bookingInfo} mode={mode} onBack={() => setEqView("detail")} onConfirm={async (instant, bookingId) => {
		setEqIsInstant(!!instant);
		setOrderId(bookingId ?? null);
		setEqView("confirm");
		if (bookingId && selectedItem.hostId) {
			await messageUser(selectedItem.hostId, {
				initialMessage: `Hi! I just booked "${selectedItem.name ?? 'your equipment'}"${bookingInfo?.startDate ? ` from ${bookingInfo.startDate} to ${bookingInfo.endDate}` : ''}. Thanks!`,
				navigate: false,
				sourceVertical: "equipment",
			}).catch(() => {});
		}
	}} />;
	if (eqView === "confirm" && selectedItem) return <EquipmentConfirmPage item={selectedItem} bookingInfo={bookingInfo} mode={mode} isInstant={eqIsInstant} orderId={orderId} onDone={() => { setEqView("landing"); setSelectedItem(null); setBookingInfo(null); setEqIsInstant(false); setOrderId(null); setMainTab("trips"); setTripsFetched(false); loadTrips(); }} />;

	const clearFilters = () => {
		setQuery("");
		setActiveCategory("all");
		setBrowseStartDate("");
		setBrowseEndDate("");
		setMinPrice("");
		setMaxPrice("");
	};

	if (loading) return (
		<div style={{ flex: 1, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px" }}>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
						<SkeletonHeading />
						<Skel w={180} h={36} r={20} />
					</div>
					<Skel w="100%" h={42} r={12} style={{ marginBottom: 16 }} />
					<div style={{ display: "flex", gap: 12, margin: "16px 0 28px" }}>
						{[...Array(5)].map((_,i) => <SkeletonCircle key={i} />)}
					</div>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
						{[...Array(6)].map((_,i) => <SkeletonEquipmentCard key={i} />)}
					</div>
				</div>
			</div>
		</div>
	);

	const filtered = filterEquipmentListings(equipItems, {
		category: activeCategory,
		categories,
		query,
		minPrice,
		maxPrice,
		matchesCategoryFn: matchesCategory,
	});
	const featured = filtered.filter(i => i.featured);
	const rest = filtered.filter(i => !i.featured);
	const visibleTrips = filterEquipmentTripsByBucket(trips, tripBucketFilter);
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					{isMobile ? (
						<div style={{ textAlign: "center", marginBottom: 20 }}>
							<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 12 }}>{landingTitle}</h1>
							<div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
								<HostListingCTA vertical="equipment" label={t("hostListing.equipment")} onCreated={() => loadEquipment()} />
							</div>
							{mainTab === "find" && (
								<div style={{ display: "flex", justifyContent: "center" }}>
									<div className="bg-surface-raised border border-border" style={{ display: "flex", borderRadius: 12, padding: 4, gap: 2 }}>
										{[{ id: "delivery", label: i18n.t("shop.delivery") }, { id: "pickup", label: i18n.t("rideshare.pickup") }].map(opt => (
											<button key={opt.id} onClick={() => setMode(opt.id)} style={{ padding: "7px 18px", borderRadius: 9, border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", background: mode === opt.id ? "#2563eb" : "transparent", color: mode === opt.id ? "#fff" : "var(--color-text-secondary)" }}>{opt.label}</button>
										))}
									</div>
								</div>
							)}
						</div>
					) : (
						<div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20, gap: 12 }}>
							<div style={{ display: "flex", alignItems: "center", width: "100%" }}>
								<div style={{ visibility: "hidden", display: "flex", background: "transparent", borderRadius: 12, padding: 4, gap: 2, flexShrink: 0 }}>
									{[{ id: "delivery", label: i18n.t("shop.delivery") }, { id: "pickup", label: i18n.t("rideshare.pickup") }].map(opt => (
										<button key={opt.id} style={{ padding: "7px 18px", borderRadius: 9, border: "none", fontSize: 13, fontWeight: 600 }}>{opt.label}</button>
									))}
								</div>
								<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", flex: 1, textAlign: "center" }}>{i18n.t("equipment.landingTitle")}</h1>
								<div className="bg-surface-raised border border-border" style={{ display: "flex", borderRadius: 12, padding: 4, gap: 2, flexShrink: 0, visibility: mainTab === "find" ? "visible" : "hidden" }}>
									{[{ id: "delivery", label: i18n.t("shop.delivery") }, { id: "pickup", label: i18n.t("rideshare.pickup") }].map(opt => (
										<button key={opt.id} onClick={() => setMode(opt.id)} style={{ padding: "7px 18px", borderRadius: 9, border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", background: mode === opt.id ? "#2563eb" : "transparent", color: mode === opt.id ? "#fff" : "var(--color-text-secondary)" }}>{opt.label}</button>
									))}
								</div>
							</div>
							<HostListingCTA vertical="equipment" label={t("hostListing.equipment")} onCreated={() => loadEquipment()} />
						</div>
					)}
					<div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
						{[
							{ id: "find", label: t("equipment.findEquipment") },
							{ id: "trips", label: t("equipment.myRentals") },
						].map((tab) => (
							<button
								key={tab.id}
								type="button"
								onClick={() => {
									setMainTab(tab.id);
									if (tab.id === "trips" && !tripsFetched) loadTrips();
								}}
								style={{
									padding: "8px 22px",
									borderRadius: 20,
									border: `1px solid ${mainTab === tab.id ? "#2563eb" : "var(--color-border)"}`,
									background: mainTab === tab.id ? "#2563eb18" : "transparent",
									color: mainTab === tab.id ? "#2563eb" : "var(--color-text-secondary)",
									fontFamily: "'DM Sans', sans-serif",
									fontSize: 13,
									fontWeight: 600,
									cursor: "pointer",
								}}
							>
								{tab.label}
							</button>
						))}
					</div>
					{mainTab === "find" && (
						<>
						<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
							<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
								<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={20} /></div>
								<input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} />
							</div>
						</div>
						<div data-testid="equipment-browse-filters" style={{ width: "min(680px, 100%)", margin: "12px auto 0", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "center" }}>
							<input type="date" aria-label={t("equipment.startDate")} value={browseStartDate} onChange={(e) => setBrowseStartDate(e.target.value)} className="bg-surface-raised border border-border text-text-primary" style={{ borderRadius: 10, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, colorScheme: "dark", outline: "none" }} />
							<input type="date" aria-label={t("equipment.endDate")} value={browseEndDate} onChange={(e) => setBrowseEndDate(e.target.value)} className="bg-surface-raised border border-border text-text-primary" style={{ borderRadius: 10, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, colorScheme: "dark", outline: "none" }} />
							<input type="number" min="0" aria-label={t("equipment.minPrice")} placeholder={t("equipment.minPrice")} value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="bg-surface-raised border border-border text-text-primary" style={{ width: 92, borderRadius: 10, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, outline: "none" }} />
							<input type="number" min="0" aria-label={t("equipment.maxPrice")} placeholder={t("equipment.maxPrice")} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="bg-surface-raised border border-border text-text-primary" style={{ width: 92, borderRadius: 10, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, outline: "none" }} />
							{filtersOn && (
								<button type="button" onClick={clearFilters} className="border border-border bg-surface-raised text-text-secondary" style={{ padding: "8px 12px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
									{t("equipment.clearFilters")}
								</button>
							)}
						</div>
						{(browseStartDate || browseEndDate) && (
							<p className="text-text-muted" style={{ width: "min(680px, 100%)", margin: "8px auto 0", fontFamily: "'DM Sans', sans-serif", fontSize: 11, textAlign: "center" }}>{t("equipment.datesFilterHint")}</p>
						)}
						</>
					)}
				</div>
				{mainTab === "find" && (
				<div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 24, animation: "fadeUp 0.35s ease 60ms both" }}>
					<button
						onClick={() => catScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })}
						className={catScrollState.atStart ? "bg-surface text-text-muted" : "bg-surface-raised text-text-primary"}
						style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, border: `1px solid ${catScrollState.atStart ? "var(--color-border-subtle)" : "var(--color-border)"}`, cursor: catScrollState.atStart ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", transition: "transform 0.12s, background 0.2s" }}
						onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
					>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					</button>
					<div ref={catScrollRef} className="ecom-cat-scroll" style={{ flex: 1, display: "flex", gap: 20, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none", justifyContent: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "center" : "flex-start" }}>
						{categories.map((cat, i) => (
							<LeoButton key={cat.id} cat={cat} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 30} />
						))}
					</div>
					<button
						onClick={() => catScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
						style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: catScrollState.atEnd ? "var(--color-surface)" : "#2563eb", border: `1px solid ${catScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`, color: catScrollState.atEnd ? "var(--color-text-muted)" : "#fff", cursor: catScrollState.atEnd ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", transition: "transform 0.12s, background 0.2s", boxShadow: catScrollState.atEnd ? "none" : "0 2px 14px rgba(37,99,235,0.55)" }}
						onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
					>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</button>
				</div>
				)}
				{mainTab === "trips" && (
					<div style={{ marginBottom: 24 }}>
						{!isAuthenticated() ? (
							<div style={{ textAlign: "center", padding: "40px 16px" }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 14 }}>{t("equipment.signInForRentals")}</p>
								<button
									type="button"
									onClick={() => window.__nav?.("login")}
									style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
								>
									{t("equipment.signIn")}
								</button>
							</div>
						) : (
						<>
						<div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
							{[
								{ id: "all", label: t("events.categories.all") },
								{ id: "upcoming", label: t("equipment.tripUpcoming") },
								{ id: "past", label: t("equipment.tripPast") },
								{ id: "cancelled", label: t("equipment.tripCancelled") },
							].map((f) => (
								<button
									key={f.id}
									type="button"
									onClick={() => setTripBucketFilter(f.id)}
									style={{
										padding: "6px 14px",
										borderRadius: 16,
										border: `1px solid ${tripBucketFilter === f.id ? "#2563eb" : "var(--color-border)"}`,
										background: tripBucketFilter === f.id ? "rgba(37,99,235,0.15)" : "transparent",
										color: tripBucketFilter === f.id ? "#60a5fa" : "var(--color-text-secondary)",
										fontFamily: "'DM Sans', sans-serif",
										fontSize: 12,
										fontWeight: 600,
										cursor: "pointer",
									}}
								>
									{f.label}
								</button>
							))}
						</div>
						{tripError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#ef4444", textAlign: "center", marginBottom: 12 }}>{tripError}</p>}
						{tripsLoading ? (
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 0" }}>{t("equipment.loadingRentals")}</p>
						) : visibleTrips.length === 0 ? (
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 0" }}>{t("equipment.noRentals")}</p>
						) : (
							<div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720, margin: "0 auto 28px" }}>
								{visibleTrips.map((trip) => {
									const statusColor = trip.status === "confirmed" || trip.status === "in_progress"
										? "#22c55e"
										: trip.status === "cancelled" || trip.status === "declined"
											? "#ef4444"
											: "#f59e0b";
									return (
										<div key={trip.booking_id} className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
											<div style={{ flex: 1, minWidth: 180 }}>
												<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14 }}>{trip.title}</p>
												<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 4 }}>
													{[
														trip.location,
														trip.start_date && trip.end_date ? `${trip.start_date} → ${trip.end_date}` : null,
														trip.days != null ? `${trip.days} day${trip.days === 1 ? "" : "s"}` : null,
														trip.quantity > 1 ? `${trip.quantity} copies` : null,
													].filter(Boolean).join(" · ")}
												</p>
												{trip.total != null && (
													<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 2 }}>${Number(trip.total).toLocaleString()}</p>
												)}
											</div>
											<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
												<span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: `${statusColor}22`, color: statusColor, textTransform: "capitalize" }}>{trip.status?.replace(/_/g, " ")}</span>
												{trip.listing_id && (
													<button
														type="button"
														onClick={() => openEquipmentById(trip.listing_id)}
														className="border border-border bg-surface-raised text-text-secondary"
														style={{ padding: "6px 12px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
													>
														{t("equipment.viewEquipment")}
													</button>
												)}
												{trip.can_cancel && (
													<button
														type="button"
														disabled={cancellingId === trip.booking_id}
														onClick={() => handleCancelTrip(trip)}
														style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.12)", color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: cancellingId === trip.booking_id ? "default" : "pointer", opacity: cancellingId === trip.booking_id ? 0.6 : 1 }}
													>
														{cancellingId === trip.booking_id ? t("equipment.cancelling") : t("equipment.cancelRental")}
													</button>
												)}
											</div>
										</div>
									);
								})}
							</div>
						)}
						</>
						)}
					</div>
				)}
				{mainTab === "find" && (
				<>
				{featured.length > 0 && (
					<div style={{ marginBottom: 32, animation: "fadeUp 0.4s ease 120ms both" }}>
						<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>{i18n.t("common.featured")}</p>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
							{featured.map((item, i) => <EquipmentItemCard key={item.id} item={item} delay={i * 50} onClick={() => openEquipment(item)} />)}
						</div>
					</div>
				)}
				{rest.length > 0 && (
					<div style={{ marginBottom: 32, animation: "fadeUp 0.4s ease 180ms both" }}>
						<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>{i18n.t("equipment.allEquipment")}</p>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
							{rest.map((item, i) => <EquipmentItemCard key={item.id} item={item} delay={i * 40} onClick={() => openEquipment(item)} />)}
						</div>
					</div>
				)}
				{filtered.length === 0 && (
					<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: loadError ? 0.7 : 0.4, paddingBottom: 24 }}>
						<EquipmentIcon s={40} />
						<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>
							{loadError
								? t("equipment.loadFailed")
								: filtersOn
									? t("equipment.noFilterResults")
									: t("equipment.noEquipmentFound")}
						</p>
						{loadError && (
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Please check your connection and try again.</p>
						)}
					</div>
				)}
				</>
				)}
			</div>
		</div>
	);
}

export { EquipmentPage };
