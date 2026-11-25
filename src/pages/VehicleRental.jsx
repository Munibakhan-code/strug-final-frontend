import React, { useState, useEffect , useMemo } from "react";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import { getBookingListings, getBookingListing, createBooking, getBookingQuote, getBookings, cancelBooking, getListingAvailability } from '../api/booking';
import { CardPaymentField, useBookingPayment } from "../components/BookingPayment.jsx";
import { isAuthenticated } from '../store/auth';
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon, VehiclesIcon } from "../components/icons.jsx";
import { Skel, SkeletonCircle, SkeletonHeading, SkeletonVehicleCard } from "../components/skeletons.jsx";
import { LeoButton, HostListingCTA } from "../components/shared.jsx";
import { messageUser } from "../api/chat";
import { bindCheckoutReferralCode } from "../api/user";
import { getVerticalProfileByUser } from "../api/verticalProfile.js";
import { mediaUrls } from "../utils/mediaUrl";
import { SaveButton } from "../components/SaveButton.jsx";
import { mapBookingListingToVehicle, mapBookingListingsToVehicles } from "../utils/vehicleMappers.js";
import { mapGuestBookingsToVehicleTrips, filterVehicleTripsByBucket } from "../utils/vehicleTrips.js";
import {
	buildVehicleListingsQuery,
	filterVehicleListings,
	vehicleBrowseFiltersActive,
} from "../utils/vehicleBrowseFilters.js";
import { buildUnavailableNightSet, stayRangeConflicts } from "../utils/tempstayAvailability.js";
import {
	VEHICLE_PROFILE_VERTICAL,
	LEGACY_HOSTING_PROFILE_VERTICAL,
} from "../utils/bookingIsolation.js";
import { Avatar } from "../components/SafeImage.jsx";

const VEHICLE_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#2563eb", match: null },
	{ id: "sports", labelKey: "events.categories.sports", color: "#dc2626", match: "Sports" },
];

function vehicleDayLabel(days, t) {
	return t(days === 1 ? "vehicles.dayCount_one" : "vehicles.dayCount_other", { count: days });
}


// Card background/text stay hardcoded in both themes: vehicle.gradient is a fixed
// dark navy-to-blue decorative gradient (not neutral page chrome), so the white
// text/icons overlaid on it are intentional.
function VehicleCard({ vehicle, delay = 0, onClick }) {
	const [saved, setSaved] = useState(false);
	return (
		<div onClick={onClick} style={{ borderRadius: 16, background: vehicle.gradient, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", display: "flex", flexDirection: "column", animation: `fadeUp 0.4s ease ${delay}ms both`, cursor: "pointer" }}>
			<div style={{ height: 155, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
				{vehicle.image && <img loading="lazy" decoding="async" src={vehicle.image} alt={vehicle.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none"; }} />}
				{!vehicle.image && <VehiclesIcon s={42} />}
				<div style={{ position: "absolute", top: 10, left: 10, background: "rgba(0,0,0,0.5)", borderRadius: 20, padding: "4px 10px" }}>
					<span style={{ fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase" }}>{vehicle.category}</span>
				</div>
				<button onClick={e => { e.stopPropagation(); setSaved(v => !v); }} style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.45)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: saved ? "#2563eb" : "rgba(255,255,255,0.6)" }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
				</button>
				{vehicle.distance && (
					<div style={{ position: "absolute", bottom: 10, left: 10, background: "rgba(0,0,0,0.55)", borderRadius: 20, padding: "3px 9px" }}>
						<span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontFamily: "'DM Sans', sans-serif" }}>{vehicle.distance}</span>
					</div>
				)}
			</div>
			<div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
				<div>
					<p style={{ fontSize: 15, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", marginBottom: 2 }}>{vehicle.name}</p>
					<p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif" }}>{[vehicle.year, vehicle.location].filter(Boolean).join(" · ")}</p>
				</div>
				{(vehicle.seatsKnown || vehicle.transmissionKnown) && (
					<div style={{ display: "flex", gap: 14 }}>
						{vehicle.seatsKnown && (
							<span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif" }}>{i18n.t(vehicle.seats === 1 ? "vehicles.seatCount_one" : "vehicles.seatCount_other", { count: vehicle.seats })}</span>
						)}
						{vehicle.transmissionKnown && (
							<span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif" }}>{vehicle.transmission}</span>
						)}
					</div>
				)}
				<div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
					{(vehicle.tags || []).map(t => (
						<span key={t} style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif", background: "rgba(255,255,255,0.05)", padding: "2px 7px", borderRadius: 10 }}>{t}</span>
					))}
				</div>
				{(vehicle.host || vehicle.trips != null || vehicle.rating != null) && (
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 2 }}>
						<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
							{vehicle.host && (
								<div style={{ width: 22, height: 22, borderRadius: "50%", background: vehicle.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "'Barlow Condensed', sans-serif", flexShrink: 0 }}>{vehicle.avatar}</div>
							)}
							{vehicle.trips != null && (
								<span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif" }}>{vehicle.trips} trips</span>
							)}
							{vehicle.host && vehicle.trips == null && (
								<span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif" }}>{vehicle.host}</span>
							)}
						</div>
						{vehicle.rating != null && (
							<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
								<svg width={11} height={11} viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
								<span style={{ fontSize: 12, fontWeight: 600, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{vehicle.rating}</span>
							</div>
						)}
					</div>
				)}
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
					<div>
						<span style={{ fontSize: 20, fontWeight: 800, color: "#2563eb", fontFamily: "'Barlow Condensed', sans-serif" }}>${vehicle.priceDay}</span>
						<span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif" }}>/day</span>
					</div>
					<button onClick={e => { e.stopPropagation(); onClick && onClick(); }} style={{ background: "#2563eb", border: "none", borderRadius: 8, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, padding: "7px 14px", cursor: "pointer" }}>{i18n.t("realestate.rent")}</button>
				</div>
			</div>
		</div>
	);
}

const VEHICLE_PROTECTION_PLANS = [
	{ id: "basic",    label: "Basic",    price: 14, desc: "$3,000 deductible" },
	{ id: "standard", label: i18n.t("floral.standard"), price: 28, desc: "$1,000 deductible" },
	{ id: "premium",  label: i18n.t("rideshare.premium"),  price: 45, desc: "$0 deductible" },
];

function VehicleDetailPage({ vehicle, onBack, onBook }) {
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");
	const [plan, setPlan] = useState("standard");
	const [vehChat, setVehChat] = useState(false);
	const [hostMsg, setHostMsg] = useState("");
	const [msgSending, setMsgSending] = useState(false);
	const [msgSent, setMsgSent] = useState(false);
	const [galleryImages] = useState(() => mediaUrls(vehicle.images));
	const [galleryIdx, setGalleryIdx] = useState(0);
	// Listing payload carries owner_id — hydrate host name/photo from the
	// scoped vehicle vertical profile (fallback to legacy "hosting" for older hosts).
	const [hostProfile, setHostProfile] = useState(null);
	const [unavailableDays, setUnavailableDays] = useState(() => new Set());
	const [availLoading, setAvailLoading] = useState(() => !!vehicle.id);
	const [availError, setAvailError] = useState(false);
	useEffect(() => {
		setHostProfile(null);
		if (!vehicle.hostId) return;
		let alive = true;
		const uid = vehicle.hostId;
		getVerticalProfileByUser(uid, VEHICLE_PROFILE_VERTICAL)
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
	}, [vehicle.hostId]);
	const hostName = hostProfile?.display_name || hostProfile?.business_name || vehicle.host;
	const hostPhoto = hostProfile?.profile_pic_url || null;
	const hostInitial = (hostName || vehicle.avatar || "H").toString().trim().charAt(0).toUpperCase() || "H";
	useEffect(() => {
		if (!vehicle.id) { setAvailLoading(false); return; }
		let alive = true;
		setAvailLoading(true);
		setAvailError(false);
		getListingAvailability(vehicle.id)
			.then((res) => {
				if (!alive) return;
				setUnavailableDays(buildUnavailableNightSet(res));
				setAvailLoading(false);
			})
			.catch(() => {
				if (!alive) return;
				setAvailError(true);
				setAvailLoading(false);
			});
		return () => { alive = false; };
	}, [vehicle.id]);
	const days = startDate && endDate ? Math.max(0, Math.round((new Date(endDate) - new Date(startDate)) / 86400000)) : 0;
	const datesConflict = stayRangeConflicts(startDate, endDate, unavailableDays);
	const planPrice = VEHICLE_PROTECTION_PLANS.find(p => p.id === plan)?.price ?? 0;
	const subtotal = days * vehicle.priceDay;
	const protection = days * planPrice;
	// Server-authoritative price + availability — fees are no longer hardcoded here.
	const [quote, setQuote] = useState(null);
	const [quoteLoading, setQuoteLoading] = useState(false);
	useEffect(() => {
		if (!startDate || !endDate || days <= 0) { setQuote(null); return; }
		let cancelled = false;
		setQuoteLoading(true);
		getBookingQuote({
			booking_listing_id: vehicle.id,
			start_date: startDate,
			end_date: endDate,
			quantity: 1,
		}).then(res => {
			if (cancelled) return;
			const q = res?.data ?? res;
			setQuote(q || null);
		}).catch(() => { if (!cancelled) setQuote(null); })
		.finally(() => { if (!cancelled) setQuoteLoading(false); });
		return () => { cancelled = true; };
	}, [vehicle.id, startDate, endDate, days]);
	// Base-price fallback if the quote is unavailable.
	const serviceFee = quote?.service_fee ?? Math.round(subtotal * 0.12);
	const total = (quote?.total ?? (subtotal + serviceFee)) + protection;
	const unavailable = quote?.available === false;
	const canBook = days > 0 && !quoteLoading && !unavailable && !datesConflict && !availLoading;

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1100, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<Skel w={160} h={18} r={6} style={{ marginTop: 24, marginBottom: 20 }} />
				<Skel w="100%" h={280} r={18} style={{ marginBottom: 28 }} />
				<div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
					<div style={{ flex: 2, minWidth: 280 }}>
						<Skel w="75%" h={30} r={8} style={{ marginBottom: 10 }} />
						<Skel w="40%" h={14} r={6} style={{ marginBottom: 20 }} />
						<Skel w="100%" h={60} r={10} style={{ marginBottom: 20 }} />
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
							{[...Array(4)].map((_,i) => <Skel key={i} w="100%" h={60} r={10} />)}
						</div>
					</div>
					<div style={{ flex: 1, minWidth: 240 }}>
						<Skel w="100%" h={260} r={18} />
					</div>
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1100, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<button onClick={onBack} className="text-text-secondary" style={{ marginTop: 24, marginBottom: 20, display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}>
					<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					Back to vehicles
				</button>
				{/* Hero / Gallery — sits over a listing photo (or the fixed vehicle.gradient fallback
				    when no photo), so the dark scrim overlays and white text/icons stay hardcoded
				    in both themes for legibility over the image. */}
				<div style={{ height: 280, borderRadius: 18, background: galleryImages.length ? "#000" : vehicle.gradient, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", marginBottom: galleryImages.length > 1 ? 8 : 28 }}>
					{galleryImages.length > 0
						? <img loading="lazy" decoding="async" src={galleryImages[galleryIdx]} alt={vehicle.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
						: <VehiclesIcon s={64} />
					}
					<div style={{ position: "absolute", top: 14, left: 14, background: "rgba(0,0,0,0.55)", borderRadius: 20, padding: "5px 14px" }}>
						<span style={{ fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase" }}>{vehicle.category}</span>
					</div>
					<SaveButton entityType="vehicle" entityId={vehicle.id}
						meta={{ title: vehicle.name, sub: vehicle.location, price: `$${vehicle.priceDay}/day`, thumb: galleryImages[0] || vehicle.gradient, accent: "#2563eb" }}
						style={{ position: "absolute", top: 14, right: 14 }} />
					<div style={{ position: "absolute", top: 56, right: 14, background: "rgba(5,150,105,0.85)", borderRadius: 20, padding: "5px 12px", display: "flex", alignItems: "center", gap: 5 }}>
						<svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
						<span style={{ fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>Free cancellation</span>
					</div>
					{vehicle.distance && (
						<div style={{ position: "absolute", bottom: 14, left: 14, background: "rgba(0,0,0,0.55)", borderRadius: 20, padding: "4px 12px" }}>
							<span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontFamily: "'DM Sans', sans-serif" }}>{vehicle.distance} away</span>
						</div>
					)}
					{galleryImages.length > 1 && (
						<>
							<button onClick={() => setGalleryIdx(i => (i - 1 + galleryImages.length) % galleryImages.length)} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
								<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
							</button>
							<button onClick={() => setGalleryIdx(i => (i + 1) % galleryImages.length)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
								<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
							</button>
							<div style={{ position: "absolute", bottom: 14, right: 14, background: "rgba(0,0,0,0.55)", borderRadius: 20, padding: "3px 10px" }}>
								<span style={{ fontSize: 11, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{galleryIdx + 1} / {galleryImages.length}</span>
							</div>
						</>
					)}
				</div>
				{galleryImages.length > 1 && (
					<div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 28, paddingBottom: 4 }}>
						{galleryImages.map((src, i) => (
							<div key={i} onClick={() => setGalleryIdx(i)} style={{ flexShrink: 0, width: 72, height: 56, borderRadius: 8, overflow: "hidden", cursor: "pointer", border: `2px solid ${i === galleryIdx ? "#2563eb" : "transparent"}`, transition: "border-color 0.15s" }}>
								<img loading="lazy" decoding="async" src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
							</div>
						))}
					</div>
				)}
				<div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
					{/* Left */}
					<div style={{ flex: 2, minWidth: 280 }}>
						<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: "0.02em", marginBottom: 6, lineHeight: 1.2 }}>{vehicle.year} {vehicle.name}</h1>
						<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 14 }}>{vehicle.location}</p>
						{/* Rating + trips — only when attributes provide real values */}
						{(vehicle.rating != null || vehicle.trips != null) && (
							<div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--color-border-subtle)" }}>
								{vehicle.rating != null && (
									<div style={{ display: "flex", alignItems: "center", gap: 5 }}>
										<svg width={14} height={14} viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
										<span className="text-text-primary" style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{vehicle.rating}</span>
									</div>
								)}
								{vehicle.rating != null && vehicle.trips != null && (
									<span className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>·</span>
								)}
								{vehicle.trips != null && (
									<span className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{vehicle.trips} trips</span>
								)}
							</div>
						)}
						{/* Host */}
						<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
							<div
								onClick={() => { if (vehicle.hostId) { window.__profileTargetId = vehicle.hostId; window.__profileVertical = VEHICLE_PROFILE_VERTICAL; window.__nav?.("profile"); } }}
								style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, cursor: vehicle.hostId ? "pointer" : "default" }}
							>
								<Avatar url={hostPhoto} initials={hostInitial} size={44} alt="" style={{ background: vehicle.avatarColor, fontSize: 18, fontWeight: 800 }} />
								<div>
									<p style={{ fontSize: 13, fontWeight: 700, color: vehicle.hostId ? "#60a5fa" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif" }}>Hosted by {hostName || "Host"}</p>
									{vehicle.hostId ? (
										<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>View Profile →</p>
									) : null}
								</div>
							</div>
							{/* Idle state's fill/border are a translucent white overlay, not a solid dark
							    surface — it lightens along with the page bg in light theme, so the
							    idle label uses a text token (not fixed white) to stay legible. */}
							<button onClick={() => { setVehChat(v => !v); setMsgSent(false); }} style={{ background: vehChat ? "rgba(37,99,235,0.12)" : "rgba(255,255,255,0.06)", border: `1px solid ${vehChat ? "rgba(37,99,235,0.3)" : "var(--color-border)"}`, borderRadius: 8, padding: "6px 14px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, color: vehChat ? "#60a5fa" : "var(--color-text-secondary)", cursor: "pointer", flexShrink: 0, transition: "all 0.15s" }}>{i18n.t("automotive.message")}</button>
						</div>
						{vehChat && (
							<div className="bg-surface border border-border" style={{ marginBottom: 16, borderRadius: 12, padding: "12px 14px", animation: "fadeUp 0.2s ease both" }}>
								{msgSent ? (
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#059669" }}>Message sent to {hostName || "host"}!</p>
								) : (
									<>
										<textarea value={hostMsg} onChange={e => setHostMsg(e.target.value)} placeholder={`Ask ${hostName || "the host"} something...`} rows={3}
											className="border border-border text-text-primary"
											style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "9px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", marginBottom: 8 }}
											onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.4)"}
											onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
										<div style={{ display: "flex", gap: 8 }}>
											<button onClick={() => setVehChat(false)} className="border border-border text-text-secondary" style={{ flex: 1, padding: "8px 0", borderRadius: 8, background: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
											<button onClick={async () => {
												if (!hostMsg.trim() || msgSending) return;
												setMsgSending(true);
												try {
													if (vehicle.hostId) {
														await messageUser(vehicle.hostId, {
															initialMessage: hostMsg.trim(),
															navigate: true,
															sourceVertical: "rental",
														});
													}
													setMsgSent(true);
												} catch { setMsgSent(true); }
												finally { setMsgSending(false); }
											}} style={{ flex: 2, padding: "8px 0", borderRadius: 8, border: "none", background: hostMsg.trim() ? "#2563eb" : "rgba(255,255,255,0.08)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: hostMsg.trim() ? "#fff" : "var(--color-text-muted)", cursor: hostMsg.trim() ? "pointer" : "default" }}>
												{msgSending ? "Sending…" : "Send"}
											</button>
										</div>
									</>
								)}
							</div>
						)}
						<div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--color-border-subtle)" }} />
						{/* Specs */}
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--color-border-subtle)" }}>
							{[
								vehicle.seatsKnown && {
									label: i18n.t("vehicles.seats"),
									val: i18n.t(vehicle.seats === 1 ? "vehicles.passengerCount_one" : "vehicles.passengerCount_other", { count: vehicle.seats }),
								},
								vehicle.transmissionKnown && { label: i18n.t("automotive.transmission"), val: vehicle.transmission },
								vehicle.year && { label: i18n.t("automotive.year"), val: vehicle.year },
								vehicle.category && { label: i18n.t("pinboard.category"), val: vehicle.category },
							].filter(Boolean).map(r => (
								<div key={r.label} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 14px" }}>
									<p className="text-text-muted" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{r.label}</p>
									<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{r.val}</p>
								</div>
							))}
						</div>
						{/* Description */}
						{vehicle.description && (
							<p className="text-text-secondary" style={{ fontSize: 14, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.75, marginBottom: 16 }}>{vehicle.description}</p>
						)}
						{/* Rules */}
						{vehicle.rules && (
							<div className="border border-border-subtle" style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Rental Rules</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.6 }}>{vehicle.rules}</p>
							</div>
						)}
						{/* Features */}
						<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
							{(vehicle.tags || []).map(t => (
								<span key={t} className="text-text-secondary" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", background: "rgba(255,255,255,0.05)", padding: "4px 12px", borderRadius: 20 }}>{t}</span>
							))}
						</div>
					</div>
					{/* Right: booking card */}
					<div className="bg-surface-raised border border-border" style={{ flex: 1, minWidth: 250, borderRadius: 18, padding: 22, position: "sticky", top: 20 }}>
						<div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 18 }}>
							<span className="text-text-primary" style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>${vehicle.priceDay}</span>
							<span className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>/ day</span>
						</div>
						{/* Dates */}
						<div style={{ borderRadius: 12, border: `1px solid ${datesConflict ? "rgba(248,113,113,0.45)" : "var(--color-border)"}`, overflow: "hidden", marginBottom: 12 }}>
							<div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border-subtle)" }}>
								<p className="text-text-secondary" style={{ fontSize: 9, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Pick-up</p>
								{/* colorScheme stays "dark" regardless of theme — matches the established pattern
								    for native date/time inputs across the app: browser picker chrome isn't retheme'd. */}
								<input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={startDate ? "text-text-primary" : "text-text-muted"} style={{ background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer", colorScheme: "dark", width: "100%" }} />
							</div>
							<div style={{ padding: "10px 14px" }}>
								<p className="text-text-secondary" style={{ fontSize: 9, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>{i18n.t("rideshare.dropoff")}</p>
								<input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={endDate ? "text-text-primary" : "text-text-muted"} style={{ background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer", colorScheme: "dark", width: "100%" }} />
							</div>
						</div>
						{availLoading && (
							<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>{i18n.t("vehicles.checkingAvailability")}</p>
						)}
						{availError && (
							<p style={{ fontSize: 11, color: "#fbbf24", fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>{i18n.t("vehicles.availabilityLoadFailed")}</p>
						)}
						{datesConflict && (
							<p style={{ fontSize: 12, color: "#f87171", fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>{i18n.t("vehicles.datesUnavailable")}</p>
						)}
						{/* Protection plan */}
						<div style={{ marginBottom: 12 }}>
							<p className="text-text-secondary" style={{ fontSize: 9, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Protection plan</p>
							<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
								{VEHICLE_PROTECTION_PLANS.map(p => (
									<div key={p.id} onClick={() => setPlan(p.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${plan === p.id ? "#2563eb" : "var(--color-border-subtle)"}`, background: plan === p.id ? "rgba(37,99,235,0.1)" : "transparent", cursor: "pointer", transition: "all 0.15s" }}>
										<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
											<div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${plan === p.id ? "#2563eb" : "rgba(255,255,255,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
												{plan === p.id && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#2563eb" }} />}
											</div>
											<span className="text-text-primary" style={{ fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{p.label}</span>
											<span className="text-text-secondary" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif" }}>{p.desc}</span>
										</div>
										<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>+${p.price}/day</span>
									</div>
								))}
							</div>
						</div>
						{days > 0 && (
							<div style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
								<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
									<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${vehicle.priceDay} × {days} day{days > 1 ? "s" : ""}</span>
									<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${subtotal}</span>
								</div>
								<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
									<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>Protection</span>
									<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${protection}</span>
								</div>
								<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
									<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("common.serviceFee")}</span>
									<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${serviceFee}</span>
								</div>
								<div style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 8, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
									<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("ondemand.hire.total")}</span>
									<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>${total}</span>
								</div>
							</div>
						)}
						{unavailable && (
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 10 }}>{quote?.reason || "These dates are no longer available."}</p>
						)}
						{/* Disabled fill is a translucent overlay (lightens with the page in light theme),
						    so its label uses a text token; the enabled state sits on brand blue, so #fff stays. */}
						<button disabled={!canBook} onClick={() => canBook && onBook({ startDate, endDate, days, subtotal, protection, serviceFee, total, plan })} style={{ width: "100%", background: canBook ? "#2563eb" : "rgba(255,255,255,0.08)", border: "none", borderRadius: 12, padding: "14px 0", color: canBook ? "#fff" : "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: canBook ? "pointer" : "default", transition: "all 0.2s" }}>
							{days <= 0 ? "Select dates" : availLoading || quoteLoading ? "Checking availability…" : datesConflict || unavailable ? "Unavailable" : "Continue"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function VehicleCheckoutPage({ vehicle, bookingInfo, onBack, onConfirm }) {
	const { isMobile } = useViewport();
	const payBooking = useBookingPayment();
	const [refCode, setRefCode] = useState("");
	const [refApplied, setRefApplied] = useState(false);
	const [refLoading, setRefLoading] = useState(false);
	const [refError, setRefError] = useState(null);
	const [paying, setPaying] = useState(false);
	const [payError, setPayError] = useState("");
	const planLabel = VEHICLE_PROTECTION_PLANS.find(p => p.id === bookingInfo.plan)?.label ?? "";
	async function handlePay() {
		setPayError("");
		if (!isAuthenticated()) { setPayError("Please log in to book."); return; }
		setPaying(true);
		let orderId = null;
		try {
			// Engine creates the booking (server price + date conflict check + host visibility).
			const res = await createBooking({
				booking_listing_id: vehicle.id,
				start_date: bookingInfo.startDate,
				end_date: bookingInfo.endDate,
				guests: 1,
				payment_method: "card",
				// Server prices the chosen tier and adds it to the charged total.
				protection_plan: bookingInfo.plan,
				notes: planLabel ? `Protection plan: ${planLabel}` : null,
			});
			const booking = res?.data ?? res;
			orderId = booking?.booking_id ?? null;
			if (!orderId) { setPayError("Unable to place booking. Please try again."); setPaying(false); return; }
			// Charge the card for this booking (server-authoritative amount).
			const pay = await payBooking(orderId);
			if (!pay.ok) { setPayError(pay.error); setPaying(false); return; }
			if (vehicle.hostId) {
				try {
					await messageUser(vehicle.hostId, {
						initialMessage: `Hi! I've just booked your ${vehicle.name} on Strug from ${bookingInfo.startDate} to ${bookingInfo.endDate}. Looking forward to it!`,
						navigate: false,
						sourceVertical: "rental",
					});
				} catch { /* noop */ }
			}
		} catch (e) {
			const status = e?.response?.status;
			setPayError(e?.response?.data?.message || (status === 409 ? "These dates are no longer available." : status === 401 ? "Please log in to book." : "Unable to place booking. Please try again."));
			setPaying(false);
			return; // only advance to confirmation on success
		}
		setPaying(false);
		onConfirm(orderId);
	}
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 720, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<button onClick={onBack} className="text-text-secondary" style={{ marginTop: 24, marginBottom: 20, display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}>
					<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					Back
				</button>
				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 24 }}>{i18n.t("common.confirmAndPay")}</h2>
				<div className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 16, padding: 20, marginBottom: 16 }}>
					<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Trip details</p>
					<p className="text-text-primary" style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{vehicle.year} {vehicle.name}</p>
					<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{bookingInfo.startDate} → {bookingInfo.endDate} · {vehicleDayLabel(bookingInfo.days, (k, o) => i18n.t(k, o))}</p>
					<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}>Protection: {planLabel}</p>
					<div className="bg-border-subtle" style={{ height: 1, marginBottom: 12 }} />
					{[
						{ label: `$${vehicle.priceDay}/day × ${bookingInfo.days}`, val: bookingInfo.subtotal },
						{ label: `${planLabel} protection`, val: bookingInfo.protection },
						{ label: "Service fee", val: bookingInfo.serviceFee },
					].map(r => (
						<div key={r.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
							<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{r.label}</span>
							<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${r.val}</span>
						</div>
					))}
					<div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
						<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("ondemand.hire.total")}</span>
						<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>${bookingInfo.total}</span>
					</div>
				</div>
				<CardPaymentField label={i18n.t("common.paymentMethod")} />
				<div className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 16, padding: 20, marginBottom: 16 }}>
					<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{i18n.t("tempstay.referralCode")}</p>
					<div style={{ display: "flex", gap: 8 }}>
						<input value={refCode} onChange={e => { setRefCode(e.target.value); setRefApplied(false); setRefError(null); }} placeholder="Enter referral code (optional)" className="border border-border text-text-primary" style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 9, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none" }} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
						{/* Empty-input state sits on a translucent fill (not solid dark), so its label
						    uses a text token; filled state's bg is always accent blue. */}
						<button onClick={async () => { if (!refCode.trim() || refLoading || refApplied) return; setRefLoading(true); setRefError(null); try { await bindCheckoutReferralCode(refCode.trim()); setRefApplied(true); } catch (e) { setRefError(e?.response?.data?.message || "Invalid referral code."); } finally { setRefLoading(false); } }} style={{ padding: "10px 16px", background: refCode.trim() ? "#2563eb" : "rgba(255,255,255,0.06)", border: "none", borderRadius: 9, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: refCode.trim() ? "#fff" : "var(--color-text-muted)", cursor: refCode.trim() ? "pointer" : "default" }}>{refApplied ? "Applied ✓" : refLoading ? "…" : "Apply"}</button>
					</div>
					{refError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginTop: 6 }}>{refError}</p>}
				</div>
				{payError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#f87171", marginBottom: 12, textAlign: "center" }}>{payError}</p>}
				<button onClick={handlePay} disabled={paying} style={{ width: "100%", background: "#2563eb", border: "none", borderRadius: 14, padding: "16px 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700, cursor: paying ? "default" : "pointer", opacity: paying ? 0.7 : 1 }}>
					{paying ? "Processing…" : `Pay $${bookingInfo.total}`}
				</button>
			</div>
		</div>
	);
}

function VehicleConfirmPage({ vehicle, bookingInfo, orderId, onDone }) {
	const [showRateModal, setShowRateModal] = React.useState(false);
	const [rating, setRating] = React.useState(0);
	const [ratingComment, setRatingComment] = React.useState("");
	const [rated, setRated] = React.useState(false);
	const { isMobile } = useViewport();
	const [ref] = useState(() => orderId ? String(orderId).toUpperCase() : "VEH-" + Math.random().toString(36).slice(2, 8).toUpperCase());
	const planLabel = VEHICLE_PROTECTION_PLANS.find(p => p.id === bookingInfo.plan)?.label ?? "";
	return (
		<div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: `40px ${isMobile ? 16 : 48}px`, paddingLeft: isMobile ? 16 : 108, overflowY: "auto" }}>
			<div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
				<div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(37,99,235,0.15)", border: "2px solid #2563eb", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
					<svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				</div>
				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8 }}>Trip Confirmed!</h2>
				<p className="text-text-secondary" style={{ fontSize: 14, fontFamily: "'DM Sans', sans-serif", marginBottom: 28 }}>Your rental details have been sent to your email.</p>
				<div className="bg-surface-raised" style={{ border: "1px solid rgba(37,99,235,0.25)", borderRadius: 18, overflow: "hidden", marginBottom: 20, textAlign: "left" }}>
					<div style={{ height: 8, background: "linear-gradient(90deg, #2563eb, #1d4ed8)" }} />
					<div style={{ padding: 24 }}>
						<p className="text-text-primary" style={{ fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{vehicle.year} {vehicle.name}</p>
						<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>Hosted by {vehicle.host} · {vehicle.location}</p>
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
							{[
								{ label: "Pick-up", val: bookingInfo.startDate },
								{ label: i18n.t("rideshare.dropoff"), val: bookingInfo.endDate },
								{ label: i18n.t("rideshare.duration"), val: vehicleDayLabel(bookingInfo.days, (k, o) => i18n.t(k, o)) },
								{ label: "Protection", val: planLabel },
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
						</div>
					</div>
				</div>
								{!rated && (
					<button onClick={() => setShowRateModal(true)} style={{ width: "100%", background: "#2563eb", border: "none", borderRadius: 14, padding: "13px 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>{i18n.t("common.rateYourHost")} ★</button>
				)}
				{/* Fill is a translucent overlay over the page bg, not a solid dark surface —
				    lightens with the page in light theme, so the label needs a text token. */}
				<button onClick={onDone} className="border border-border text-text-primary" style={{ width: "100%", background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: "14px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
					Back to Vehicles
				</button>
			</div>
					{showRateModal && (
				<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
					<div className="bg-surface border border-border" style={{ borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, animation: "fadeUp 0.25s ease both" }}>
						<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{i18n.t("common.rateYourHost")}</h3>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 18 }}>{i18n.t("rideshare.howWasExperience")}</p>
						<div style={{ display: "flex", gap: 8, marginBottom: 18, justifyContent: "center" }}>
							{[1,2,3,4,5].map(n => (
								<button key={n} onClick={() => setRating(n)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
									<svg width={30} height={30} viewBox="0 0 24 24" fill={n <= rating ? "#f59e0b" : "none"} stroke={n <= rating ? "#f59e0b" : "var(--color-text-muted)"} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
								</button>
							))}
						</div>
						<textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder={i18n.t("common.optionalComment")} rows={3} className="border border-border text-text-primary" style={{ width: "100%", background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 16 }} />
						<div style={{ display: "flex", gap: 10 }}>
							<button onClick={() => { setShowRateModal(false); onDone(); }} className="border border-border text-text-primary" style={{ flex: 1, padding: "11px 0", background: "rgba(255,255,255,0.06)", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{i18n.t("ondemand.hire.skip")}</button>
							<button disabled={rating === 0} onClick={() => { setShowRateModal(false); setRated(true); }} style={{ flex: 1, padding: "11px 0", background: rating > 0 ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: rating > 0 ? "#fff" : "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: rating > 0 ? "pointer" : "default" }}>{i18n.t("common.submit")}</button>
						</div>
					</div>
				</div>
			)}
	</div>
	);
}

function VehicleRentalPage() {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("vehicles");
	const categories = useI18nCategoryList(VEHICLE_CATEGORY_DEFS);
	const { isMobile } = useViewport();
	const loading = usePageLoad();
	const [activeCategory, setActiveCategory] = useState("all");
	const [query, setQuery] = useState("");
	const [browseStartDate, setBrowseStartDate] = useState("");
	const [browseEndDate, setBrowseEndDate] = useState("");
	const [browseSeats, setBrowseSeats] = useState(1);
	const [minPrice, setMinPrice] = useState("");
	const [maxPrice, setMaxPrice] = useState("");
	const [vehView, setVehView] = useState("landing");
	const [mainTab, setMainTab] = useState("find");
	const [selectedVehicle, setSelectedVehicle] = useState(null);
	const [bookingInfo, setBookingInfo] = useState(null);
	const [orderId, setOrderId] = useState(null);
	const [vehicleListings, setVehicleListings] = useState([]);
	const [trips, setTrips] = useState([]);
	const [tripBucketFilter, setTripBucketFilter] = useState("all");
	const [tripsLoading, setTripsLoading] = useState(false);
	const [tripsFetched, setTripsFetched] = useState(false);
	const [cancellingId, setCancellingId] = useState(null);
	const [tripError, setTripError] = useState("");
	const filtersOn = vehicleBrowseFiltersActive({
		query,
		category: activeCategory,
		minPrice,
		maxPrice,
		minSeats: browseSeats,
	});
	const loadVehicles = React.useCallback((isAlive = () => true) => {
		const params = buildVehicleListingsQuery({
			q: query,
			minPrice,
			maxPrice,
		});
		return getBookingListings(params).then(res => {
			if (!isAlive()) return;
			const arr = Array.isArray(res) ? res : (res?.data ?? []);
			setVehicleListings(mapBookingListingsToVehicles(arr));
		}).catch(() => {});
	}, [query, minPrice, maxPrice]);
	useEffect(() => {
		let alive = true;
		const handle = setTimeout(() => {
			loadVehicles(() => alive);
		}, 220);
		return () => {
			alive = false;
			clearTimeout(handle);
		};
	}, [loadVehicles]);
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [vehView]);
	const loadTrips = () => {
		if (!isAuthenticated()) {
			setTrips([]);
			setTripsLoading(false);
			setTripsFetched(true);
			setTripError("");
			return;
		}
		setTripsLoading(true);
		setTripError("");
		getBookings({ role: "guest", vertical: "vehicle" })
			.then((r) => {
				const arr = Array.isArray(r) ? r : (r?.data ?? []);
				setTrips(mapGuestBookingsToVehicleTrips(arr));
			})
			.catch(() => setTripError(t("vehicles.rentalsLoadFailed")))
			.finally(() => { setTripsLoading(false); setTripsFetched(true); });
	};
	const handleCancelTrip = async (trip) => {
		if (!trip?.booking_id || !trip.can_cancel) return;
		if (!window.confirm(t("vehicles.cancelConfirm"))) return;
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
			setTripError(t("vehicles.cancelFailed"));
		} finally {
			setCancellingId(null);
		}
	};
	const openVehicle = (vehicle) => {
		setSelectedVehicle(vehicle);
		setVehView("detail");
	};
	const openVehicleById = (id) => {
		const listing = vehicleListings.find((v) => String(v.id) === String(id));
		if (listing) {
			openVehicle(listing);
			return;
		}
		setTripError("");
		getBookingListing(id).then((res) => {
			const row = res?.data ?? res;
			const mapped = mapBookingListingToVehicle(row);
			if (mapped) openVehicle(mapped);
			else setTripError(t("vehicles.viewVehicleFailed"));
		}).catch(() => {
			setTripError(t("vehicles.viewVehicleFailed"));
		});
	};
	const clearFilters = () => {
		setQuery("");
		setActiveCategory("all");
		setBrowseStartDate("");
		setBrowseEndDate("");
		setBrowseSeats(1);
		setMinPrice("");
		setMaxPrice("");
	};

	if (vehView === "detail" && selectedVehicle) return <VehicleDetailPage vehicle={selectedVehicle} onBack={() => setVehView("landing")} onBook={info => { setBookingInfo(info); setVehView("checkout"); }} />;
	if (vehView === "checkout" && selectedVehicle) return <VehicleCheckoutPage vehicle={selectedVehicle} bookingInfo={bookingInfo} onBack={() => setVehView("detail")} onConfirm={id => { setOrderId(id); setVehView("confirm"); }} />;
	if (vehView === "confirm" && selectedVehicle) return <VehicleConfirmPage vehicle={selectedVehicle} bookingInfo={bookingInfo} orderId={orderId} onDone={() => { setVehView("landing"); setSelectedVehicle(null); setBookingInfo(null); setOrderId(null); setMainTab("trips"); setTripsFetched(false); loadTrips(); }} />;

	if (loading) return (
		<div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1100, margin: "0 auto", width: "100%", padding: "28px 0 20px" }}>
				<SkeletonHeading />
				<Skel w="100%" h={42} r={12} style={{ margin: "16px 0" }} />
				<div style={{ display: "flex", gap: 12, margin: "16px 0 28px" }}>
					{[...Array(5)].map((_,i) => <SkeletonCircle key={i} />)}
				</div>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
					{[...Array(6)].map((_,i) => <SkeletonVehicleCard key={i} />)}
				</div>
			</div>
		</div>
	);

	const filtered = filterVehicleListings(vehicleListings, {
		category: activeCategory,
		categories,
		query,
		minPrice,
		maxPrice,
		minSeats: browseSeats,
		matchesCategoryFn: matchesCategory,
	});
	const featured = filtered.filter(v => v.featured);
	const rest = filtered.filter(v => !v.featured);
	return (
		<div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 20, textAlign: "center" }}>{landingTitle}</h1>
					<div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
						<HostListingCTA vertical="vehicle" label={t("hostListing.vehicle")} onCreated={loadVehicles} />
					</div>
					<div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
						{[
							{ id: "find", label: t("vehicles.findVehicles") },
							{ id: "trips", label: t("vehicles.myRentals") },
						].map((tab) => (
							<button
								key={tab.id}
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
					<div data-testid="vehicle-browse-filters" style={{ width: "min(680px, 100%)", margin: "12px auto 0", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "center" }}>
						<input type="date" aria-label={t("vehicles.pickupDate")} value={browseStartDate} onChange={(e) => setBrowseStartDate(e.target.value)} className="border border-border text-text-primary" style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, colorScheme: "dark", outline: "none" }} />
						<input type="date" aria-label={t("vehicles.dropoffDate")} value={browseEndDate} onChange={(e) => setBrowseEndDate(e.target.value)} className="border border-border text-text-primary" style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, colorScheme: "dark", outline: "none" }} />
						<div className="border border-border" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "6px 10px" }}>
							<span className="text-text-secondary" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{t("vehicles.seats")}</span>
							<button type="button" aria-label={t("vehicles.decreaseSeats")} onClick={() => setBrowseSeats((g) => Math.max(1, g - 1))} className="border border-border text-text-primary" style={{ width: 24, height: 24, borderRadius: "50%", background: "none", cursor: "pointer" }}>−</button>
							<span aria-live="polite" aria-atomic="true" className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", minWidth: 14, textAlign: "center" }}>{browseSeats}</span>
							<button type="button" aria-label={t("vehicles.increaseSeats")} onClick={() => setBrowseSeats((g) => Math.min(16, g + 1))} style={{ width: 24, height: 24, borderRadius: "50%", border: "none", background: "#2563eb", color: "#fff", cursor: "pointer" }}>+</button>
						</div>
						<input type="number" min="0" aria-label={t("vehicles.minPrice")} placeholder={t("vehicles.minPrice")} value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="border border-border text-text-primary" style={{ width: 92, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, outline: "none" }} />
						<input type="number" min="0" aria-label={t("vehicles.maxPrice")} placeholder={t("vehicles.maxPrice")} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="border border-border text-text-primary" style={{ width: 92, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, outline: "none" }} />
						{filtersOn && (
							<button type="button" onClick={clearFilters} className="border border-border text-text-secondary" style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
								{t("vehicles.clearFilters")}
							</button>
						)}
					</div>
					{(browseStartDate || browseEndDate) && (
						<p className="text-text-secondary" style={{ width: "min(680px, 100%)", margin: "8px auto 0", fontFamily: "'DM Sans', sans-serif", fontSize: 11, textAlign: "center" }}>{t("vehicles.datesFilterHint")}</p>
					)}
						</>
					)}
				</div>
				{mainTab === "find" && (
				<div style={{ display: "flex", gap: 20, marginBottom: 24, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4, animation: "fadeUp 0.35s ease 60ms both", scrollbarWidth: "none", justifyContent: "center" }}>
					{categories.map((cat, i) => (
						<LeoButton key={cat.id} cat={cat} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 30} />
					))}
				</div>
				)}
				{mainTab === "trips" && (
					<div style={{ marginBottom: 24 }}>
						{!isAuthenticated() ? (
							<div style={{ textAlign: "center", padding: "40px 16px" }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 14 }}>{t("vehicles.signInForRentals")}</p>
								<button
									type="button"
									onClick={() => window.__nav?.("login")}
									style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
								>
									{t("vehicles.signIn")}
								</button>
							</div>
						) : (
						<>
						<div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
							{[
								{ id: "all", label: t("events.categories.all") },
								{ id: "upcoming", label: t("vehicles.tripUpcoming") },
								{ id: "past", label: t("vehicles.tripPast") },
								{ id: "cancelled", label: t("vehicles.tripCancelled") },
							].map((f) => (
								<button
									key={f.id}
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
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 0" }}>{t("vehicles.loadingRentals")}</p>
						) : filterVehicleTripsByBucket(trips, tripBucketFilter).length === 0 ? (
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 0" }}>{t("vehicles.noRentals")}</p>
						) : (
							<div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720, margin: "0 auto 28px" }}>
								{filterVehicleTripsByBucket(trips, tripBucketFilter).map((trip) => {
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
														trip.days != null ? vehicleDayLabel(trip.days, t) : null,
													].filter(Boolean).join(" · ")}
												</p>
												{trip.total != null && (
													<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 2 }}>${Number(trip.total).toLocaleString()}</p>
												)}
											</div>
											<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
												<span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: `${statusColor}22`, color: statusColor, textTransform: "capitalize" }}>{trip.status?.replace(/_/g, " ")}</span>
												{trip.listing_id && (
													<button
														type="button"
														onClick={() => openVehicleById(trip.listing_id)}
														className="border border-border text-text-secondary"
														style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
													>
														{t("vehicles.viewVehicle")}
													</button>
												)}
												{trip.can_cancel && (
													<button
														type="button"
														disabled={cancellingId === trip.booking_id}
														onClick={() => handleCancelTrip(trip)}
														style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.12)", color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: cancellingId === trip.booking_id ? "default" : "pointer", opacity: cancellingId === trip.booking_id ? 0.6 : 1 }}
													>
														{cancellingId === trip.booking_id ? t("vehicles.cancelling") : t("vehicles.cancelRental")}
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
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
							{featured.map((v, i) => <VehicleCard key={v.id} vehicle={v} delay={i * 50} onClick={() => openVehicle(v)} />)}
						</div>
					</div>
				)}
				{rest.length > 0 && (
					<div style={{ marginBottom: 32, animation: "fadeUp 0.4s ease 180ms both" }}>
						<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>All Vehicles</p>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
							{rest.map((v, i) => <VehicleCard key={v.id} vehicle={v} delay={i * 40} onClick={() => openVehicle(v)} />)}
						</div>
					</div>
				)}
				{filtered.length === 0 && (
					<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: 0.4, paddingBottom: 24 }}>
						<VehiclesIcon s={40} />
						<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>{filtersOn ? t("vehicles.noFilterResults") : t("vehicles.noVehicles")}</p>
					</div>
				)}
				</>
				)}
			</div>
		</div>
	);
}

export { VehicleRentalPage };
