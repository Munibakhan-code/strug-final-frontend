import React, { useState, useEffect } from "react";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import { getBookingListings, getListingAvailability, getBookings, createBookingReview, cancelBooking } from '../api/booking';
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon, HotelIcon } from "../components/icons.jsx";
import { Skel, SkeletonCircle, SkeletonHeading, SkeletonTempStayCard } from "../components/skeletons.jsx";
import { LeoButton, ODCategoryBubble } from "../components/shared.jsx";
import { messageUser } from "../api/chat";
import { TempStayDetailPage, TempStayCheckoutPage, TempStayConfirmPage } from "./TempStay.jsx";
import { HostListingCTA } from "../components/shared.jsx";
import { isAuthenticated } from '../store/auth';
import { mediaUrls, mediaUrl } from "../utils/mediaUrl";
import { SaveButton } from "../components/SaveButton.jsx";
import { ImageLightbox } from "../components/ImageLightbox.jsx";
import { buildUnavailableNightSet, stayRangeConflicts } from "../utils/tempstayAvailability.js";
import { mapGuestBookingsToTempStayTrips, filterTripsByBucket, HOTEL_VERTICAL } from "../utils/tempstayTrips.js";

const HOTEL_CATEGORY_DEFS = [
	{ id: "all", labelKey: "common.all", color: "#2563eb", match: null },
	{ id: "category-budget", labelKey: "hotel.categoryBudget", color: "#059669", match: "Budget" },
	{ id: "category-boutique", labelKey: "hotel.categoryBoutique", color: "#db2777", match: "Boutique" },
	{ id: "business", labelKey: "learn.categories.business", color: "#0891b2", match: "Business" },
	{ id: "category-resort", labelKey: "hotel.categoryResort", color: "#d97706", match: "Resort" },
	{ id: "category-luxury", labelKey: "hotel.categoryLuxury", color: "#7c3aed", match: "Luxury" },
];

function HotelDetailPage({ hotel, onBack, onBook }) {
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [checkIn, setCheckIn] = useState("");
	const [checkOut, setCheckOut] = useState("");
	const [guests, setGuests] = useState(1);
	const [selectedRoom, setSelectedRoom] = useState(null);
	const [lightboxIdx, setLightboxIdx] = useState(null);
	// Real listings carry uploaded photo URLs on `images`; the seed hotels only have a
	// gradient `thumb`. Show the real photos (clickable → lightbox) when present (#307).
	const photos = mediaUrls(hotel.images);
	const [hotelChat, setHotelChat] = useState(false);
	const [hotelMsg, setHotelMsg] = useState("");
	const [hotelMsgSending, setHotelMsgSending] = useState(false);
	const [hotelMsgSent, setHotelMsgSent] = useState(false);
	const [unavailable, setUnavailable] = useState(() => new Set());
	const [availLoading, setAvailLoading] = useState(false);
	const nights = (() => {
		if (!checkIn || !checkOut) return 0;
		const d = (new Date(checkOut) - new Date(checkIn)) / 86400000;
		return d > 0 ? d : 0;
	})();
	// Real room_types only. If none, offer an honest listing-rate stay when price exists —
	// never invent "Standard Room" / Queen / WiFi.
	const hotelRooms = (() => {
		const real = Array.isArray(hotel.room_types) ? hotel.room_types : [];
		// Room photo optional; fall back to hotel gallery so host-added types aren't blank tiles.
		const hotelThumb = photos[0]
			|| (typeof hotel.image === "string" ? mediaUrl(hotel.image) : null)
			|| (typeof hotel.thumb === "string" && !String(hotel.thumb).includes("gradient") ? mediaUrl(hotel.thumb) : null);
		if (real.length > 0) {
			return real.map((rt) => {
				const imgs = mediaUrls(rt.images);
				const roomThumb = imgs[0] || null;
				const perks = Array.isArray(rt.amenities) ? rt.amenities : [];
				const bedLabel = rt.beds
					|| (rt.bed_count != null && Number(rt.bed_count) > 0 ? `${rt.bed_count} bed${Number(rt.bed_count) === 1 ? "" : "s"}` : null);
				return {
					id: rt.room_type_id,
					name: rt.name || i18n.t("hotel.roomTypeFallback"),
					beds: bedLabel,
					size: rt.size_sqm ? `${rt.size_sqm} m²` : null,
					price: Number(rt.nightly_price ?? hotel.priceNum) || 0,
					perks,
					thumb: roomThumb || hotelThumb,
					hasOwnPhoto: Boolean(roomThumb),
					max_guests: rt.max_guests || hotel.maxGuests || 2,
					quantity: rt.quantity || 1,
					isListingRate: false,
				};
			});
		}
		const listingRate = Number(hotel.priceNum) || 0;
		if (listingRate > 0) {
			return [{
				id: null,
				name: i18n.t("hotel.listingRateStay"),
				beds: null,
				size: null,
				price: listingRate,
				perks: [],
				thumb: null,
				max_guests: hotel.maxGuests || 2,
				quantity: 1,
				isListingRate: true,
			}];
		}
		return [];
	})();
	// Room-type inventory calendar — reload when the guest picks a room.
	useEffect(() => {
		if (!hotel.id || selectedRoom?.id == null) {
			setUnavailable(new Set());
			setAvailLoading(false);
			return undefined;
		}
		let alive = true;
		setAvailLoading(true);
		getListingAvailability(hotel.id, { room_type_id: selectedRoom.id })
			.then((res) => {
				if (!alive) return;
				setUnavailable(buildUnavailableNightSet(res));
			})
			.catch(() => {
				if (!alive) return;
				setUnavailable(new Set());
			})
			.finally(() => {
				if (alive) setAvailLoading(false);
			});
		return () => { alive = false; };
	}, [hotel.id, selectedRoom?.id]);
	const datesConflict = stayRangeConflicts(checkIn, checkOut, unavailable);
	const canReserve = nights > 0 && !!selectedRoom && !datesConflict && !availLoading;
	const displayPrice = selectedRoom?.price ?? hotel.priceNum;
	const hasPhotos = photos.length > 0;
	const showGuestRating = hotel.rating != null && Number(hotel.reviews) > 0;

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
				<div style={{ maxWidth: 920, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
					<Skel w={160} h={18} r={6} style={{ marginTop: 24, marginBottom: 20 }} />
					<Skel w="100%" h={260} r={18} style={{ marginBottom: 28 }} />
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 320px", gap: 32 }}>
						<div>
							<Skel w="70%" h={30} r={8} style={{ marginBottom: 8 }} />
							<Skel w="40%" h={14} r={6} style={{ marginBottom: 24 }} />
							<Skel w="100%" h={80} r={8} style={{ marginBottom: 24 }} />
							<Skel w={120} h={14} r={6} style={{ marginBottom: 14 }} />
							<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
								{[...Array(6)].map((_,i) => <Skel key={i} w={80} h={32} r={8} />)}
							</div>
						</div>
						<Skel w="100%" h={320} r={18} />
					</div>
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 920, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
			<button onClick={onBack} className="text-text-secondary" style={{ marginTop: 24, marginBottom: 20, display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}>
				<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
				Back to hotels
			</button>
			<div style={{ height: 260, borderRadius: 18, background: hasPhotos ? "var(--color-surface-raised)" : (hotel.gradient || "linear-gradient(135deg,#0c1a2e,#1e3a5f)"), position: "relative", overflow: "hidden", marginBottom: 28 }}>
					{hasPhotos ? (
						<img src={photos[0]} alt={hotel.name} onClick={() => setLightboxIdx(0)}
							style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }}
							onError={(e) => { e.currentTarget.style.display = "none"; }} />
					) : (
						// No-photo placeholder sits on the branded gradient fallback (always dark, see
						// `hotel.gradient` above), so this text stays hardcoded white regardless of theme.
						<div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "rgba(255,255,255,0.45)" }}>
							<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("hotel.noPhotosYet")}</span>
						</div>
					)}
					{photos.length > 1 && (
						<div style={{ position: "absolute", bottom: 14, right: 14, background: "rgba(0,0,0,0.6)", borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#fff" }}
							onClick={() => setLightboxIdx(0)}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
							{photos.length} photos
						</div>
					)}
				<SaveButton entityType="stay" entityId={hotel.id}
					meta={{ title: hotel.name, sub: hotel.location, price: `$${hotel.priceNum}/night`, thumb: hotel.image || hotel.thumb, accent: "#2563eb" }}
					style={{ position: "absolute", top: 14, left: 14 }} />
				{hotel.stars != null && hotel.stars > 0 && (
					<div style={{ position: "absolute", top: 14, right: 14, background: "rgba(0,0,0,0.55)", borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", gap: 4 }}>
						{[...Array(hotel.stars)].map((_, i) => <span key={i} style={{ color: "#f59e0b", fontSize: 12 }}>★</span>)}
					</div>
				)}
			</div>
			{/* Thumbnail strip for the rest of the gallery */}
			{photos.length > 1 && (
				<div style={{ display: "flex", gap: 8, marginTop: -16, marginBottom: 24, flexWrap: "wrap" }}>
					{photos.slice(0, 6).map((p, i) => (
						<img key={i} src={p} alt="" onClick={() => setLightboxIdx(i)}
							className="border border-border"
							style={{ width: 76, height: 56, objectFit: "cover", borderRadius: 8, cursor: "zoom-in" }}
							onError={(e) => { e.currentTarget.style.display = "none"; }} />
					))}
				</div>
			)}
			{lightboxIdx != null && photos[lightboxIdx] && (
				<ImageLightbox images={photos} index={lightboxIdx} onIndexChange={setLightboxIdx} onClose={() => setLightboxIdx(null)} />
			)}
			<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 320px", gap: 32 }}>
				{/* Left */}
				<div>
					<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: "0.04em", marginBottom: 6 }}>{hotel.name}</h2>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 20 }}>{hotel.location}</p>
					{hotel.desc && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>{hotel.desc}</p>}
					{hotel.rules && (
						<div className="bg-surface border border-border-subtle" style={{ borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{i18n.t("hotel.hotelRules")}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.6 }}>{hotel.rules}</p>
						</div>
					)}
					{Array.isArray(hotel.amenities) && hotel.amenities.length > 0 && <>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{i18n.t("venues.amenities")}</p>
					<div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
						{hotel.amenities.map(a => (
							<span key={a} className="bg-surface-raised border border-border text-text-secondary" style={{ borderRadius: 8, padding: "6px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{a}</span>
						))}
					</div>
					</> }
					{/* Available rooms */}
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>{i18n.t("hotel.availableRooms")}</p>
					{hotelRooms.length === 0 ? (
						<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "20px 16px", marginBottom: 8 }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 6 }}>{i18n.t("hotel.noRoomTypesYet")}</p>
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.5 }}>{i18n.t("hotel.noRoomTypesHint")}</p>
						</div>
					) : (
					<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
						{hotelRooms.some((r) => r.isListingRate) && (
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 2 }}>{i18n.t("hotel.listingRateNote")}</p>
						)}
						{hotelRooms.map(room => (
							<div key={room.id ?? "listing-rate"} onClick={() => setSelectedRoom(room)}
								style={{ display: "flex", gap: 14, borderRadius: 14, border: `1px solid ${selectedRoom === room || (selectedRoom?.id != null && selectedRoom?.id === room.id) || (selectedRoom?.isListingRate && room.isListingRate) ? "rgba(37,99,235,0.5)" : "var(--color-border)"}`, background: (selectedRoom === room || (selectedRoom?.id != null && selectedRoom?.id === room.id) || (selectedRoom?.isListingRate && room.isListingRate)) ? "rgba(37,99,235,0.08)" : "var(--color-surface)", padding: "14px 16px", cursor: "pointer", transition: "all 0.15s" }}>
								<div style={{ width: 64, height: 64, borderRadius: 10, background: room.thumb ? undefined : "linear-gradient(135deg, #1a1a2a, #0f0f1a)", flexShrink: 0, overflow: "hidden", position: "relative" }}>
									{room.thumb ? (
										<img src={mediaUrl(room.thumb)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
									) : null}
								</div>
								<div style={{ flex: 1 }}>
									<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14 }}>{room.name}</p>
										<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 17, color: selectedRoom === room || selectedRoom?.id === room.id ? "#60a5fa" : "var(--color-text-primary)" }}>${room.price}<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: 11 }}>/night</span></p>
									</div>
									{(room.beds || room.size || room.max_guests) && (
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 6 }}>
											{[
												room.beds,
												room.size,
												room.max_guests ? i18n.t("hotel.upToGuests", { count: room.max_guests, defaultValue: `Up to ${room.max_guests} guests` }) : null,
											].filter(Boolean).join(" · ")}
										</p>
									)}
									{room.perks.length > 0 && (
										<div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
											{room.perks.map(p => <span key={p} className="text-text-secondary bg-surface-raised" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", padding: "2px 8px", borderRadius: 10 }}>{p}</span>)}
										</div>
									)}
								</div>
							</div>
						))}
					</div>
					)}
				</div>
				{/* Right — booking panel */}
				<div className="bg-surface-raised border border-border" style={{ borderRadius: 18, padding: 24, alignSelf: "start", position: "sticky", top: 20 }}>
					{selectedRoom && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 4 }}>{selectedRoom.name}</p>}
					<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 22, marginBottom: 2 }}>${displayPrice}<span className="text-text-secondary" style={{ fontSize: 13, fontWeight: 400 }}> / night</span></p>
					<div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 20 }}>
						{showGuestRating ? (
							<>
								<svg width={13} height={13} viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
								<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>{hotel.rating}</span>
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>({Number(hotel.reviews).toLocaleString()} reviews)</span>
							</>
						) : (
							<span className="text-text-muted bg-surface-raised" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, borderRadius: 6, padding: "3px 8px" }}>{i18n.t("hotel.newListing")}</span>
						)}
					</div>
					<div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
						<div>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 4 }}>{i18n.t("common.checkIn")}</p>
							<input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box", colorScheme: "dark" }} />
						</div>
						<div>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 4 }}>{i18n.t("hotel.checkOut")}</p>
							<input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box", colorScheme: "dark" }} />
						</div>
						<div>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 4 }}>{i18n.t("common.guests")}</p>
							<div className="bg-surface-raised border border-border" style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 10, padding: "8px 12px" }}>
								<button onClick={() => setGuests(g => Math.max(1, g - 1))} className="bg-border text-text-primary" style={{ border: "none", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
								<span className="text-text-primary" style={{ flex: 1, textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{guests} guest{guests > 1 ? "s" : ""}</span>
								<button onClick={() => setGuests(g => Math.min(selectedRoom?.max_guests || hotel.maxGuests || 8, g + 1))} className="bg-border text-text-primary" style={{ border: "none", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
							</div>
						</div>
					</div>
					{nights > 0 && (
						<div style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 14, marginBottom: 16 }}>
							{/* Detail-view estimate only — base nightly rate × nights. The authoritative
							    subtotal/fees/total come from the server quote on the checkout page. */}
							<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>${displayPrice} × {nights} nights</span>
								<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>${displayPrice * nights}</span>
							</div>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginTop: 2 }}>{i18n.t("hotel.estBeforeFees")}</p>
						</div>
					)}
					{datesConflict && nights > 0 && (
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 10 }}>
							{i18n.t("tempstay.datesUnavailable", { defaultValue: "Those dates are not available for this room." })}
						</p>
					)}
					<button onClick={() => {
						if (!canReserve) return;
						if (!isAuthenticated()) { alert("Please log in to book"); return; }
						if (!selectedRoom) { alert(i18n.t("hotel.selectRoomPrompt")); return; }
						if (hotelRooms.length === 0) { alert(i18n.t("hotel.noRoomTypesHint")); return; }
						onBook({
							checkIn,
							checkOut,
							nights,
							guests,
							roomName: selectedRoom.name,
							...(selectedRoom.id != null ? { room_type_id: selectedRoom.id } : {}),
							roomPrice: selectedRoom.price,
						});
					}} style={{ width: "100%", background: canReserve ? "#2563eb" : "var(--color-surface)", border: "none", borderRadius: 12, padding: "14px 0", color: canReserve ? "#fff" : "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: canReserve ? "pointer" : "default", transition: "all 0.15s" }}>
						{availLoading
							? "Checking availability…"
							: datesConflict
								? i18n.t("tempstay.datesUnavailable", { defaultValue: "Dates unavailable" })
								: nights > 0
									? `Reserve · ${nights} night${nights > 1 ? "s" : ""}`
									: "Select dates to reserve"}
					</button>
					<div style={{ marginTop: 12 }}>
						{hotelChat ? (
							<div className="bg-surface border border-border" style={{ borderRadius: 12, padding: "12px 14px", animation: "fadeUp 0.2s ease both" }}>
								{hotelMsgSent ? (
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#059669" }}>{i18n.t("hotel.messageSent")}</p>
								) : (
									<>
										<textarea value={hotelMsg} onChange={e => setHotelMsg(e.target.value)} placeholder={i18n.t("hotel.askHotelPlaceholder")} rows={3}
											className="bg-surface-raised border border-border text-text-primary"
											style={{ width: "100%", boxSizing: "border-box", borderRadius: 8, padding: "9px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", marginBottom: 8 }}
											onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.4)"}
											onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
										<div style={{ display: "flex", gap: 8 }}>
											<button onClick={() => setHotelChat(false)} className="border border-border text-text-secondary" style={{ flex: 1, padding: "8px 0", borderRadius: 8, background: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
											<button onClick={async () => {
												if (!hotelMsg.trim() || hotelMsgSending) return;
												setHotelMsgSending(true);
												try {
													if (hotel.hostId) {
														await messageUser(hotel.hostId, {
															initialMessage: hotelMsg.trim(),
															navigate: true,
															sourceVertical: "hotel",
														});
													}
													setHotelMsgSent(true);
												} catch { setHotelMsgSent(true); }
												finally { setHotelMsgSending(false); }
											}} style={{ flex: 2, padding: "8px 0", borderRadius: 8, border: "none", background: hotelMsg.trim() ? "#2563eb" : "var(--color-border)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: hotelMsg.trim() ? "#fff" : "var(--color-text-muted)", cursor: hotelMsg.trim() ? "pointer" : "default" }}>
												{hotelMsgSending ? "Sending…" : "Send"}
											</button>
										</div>
									</>
								)}
							</div>
						) : (
							<button onClick={() => setHotelChat(true)} className="border border-border text-text-secondary" style={{ width: "100%", padding: "10px 0", borderRadius: 10, background: "none", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
								Message Hotel
							</button>
						)}
					</div>
				</div>
			</div>
			</div>
		</div>
	);
}

function HotelPage() {
	const { t, landingTitle, searchPlaceholder } = usePageI18n("hotel");
	const categories = useI18nCategoryList(HOTEL_CATEGORY_DEFS);
const { isMobile } = useViewport();
	const loading = usePageLoad();
	const [activeCategory, setActiveCategory] = useState("all");
	const [query, setQuery] = useState("");
	const [htView, setHtView] = useState("landing"); // landing | detail | checkout | confirm
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [htView]);
	const [selectedHotel, setSelectedHotel] = useState(null);
	const [bookingInfo, setBookingInfo] = useState(null);
	const [orderId, setOrderId] = useState(null);
	const [isInstant, setIsInstant] = useState(false);
	const [hotelsData, setHotelsData] = useState([]);
	const [mainTab, setMainTab] = useState("find"); // find | trips
	const [trips, setTrips] = useState([]);
	const [tripBucketFilter, setTripBucketFilter] = useState("all");
	const [tripsLoading, setTripsLoading] = useState(false);
	const [tripsFetched, setTripsFetched] = useState(false);
	const [tripError, setTripError] = useState("");
	const [cancellingId, setCancellingId] = useState(null);
	const [rateTrip, setRateTrip] = useState(null);
	const [tripRating, setTripRating] = useState(0);
	const [tripRatingComment, setTripRatingComment] = useState("");
	const [tripRateError, setTripRateError] = useState("");
	const [tripRateSubmitting, setTripRateSubmitting] = useState(false);

	const loadTrips = React.useCallback(() => {
		setTripsLoading(true);
		setTripError("");
		getBookings({ role: "guest", vertical: HOTEL_VERTICAL })
			.then((r) => {
				const arr = Array.isArray(r) ? r : (r?.data ?? []);
				setTrips(mapGuestBookingsToTempStayTrips(arr, { vertical: HOTEL_VERTICAL }));
			})
			.catch(() => setTripError(t("tempstay.tripsLoadFailed")))
			.finally(() => { setTripsLoading(false); setTripsFetched(true); });
	}, [t]);

	const openTripRate = (trip) => {
		setRateTrip(trip);
		setTripRating(0);
		setTripRatingComment("");
		setTripRateError("");
	};

	const submitTripReview = async () => {
		if (!rateTrip?.booking_id || tripRating === 0 || tripRateSubmitting) return;
		setTripRateSubmitting(true);
		setTripRateError("");
		try {
			await createBookingReview(rateTrip.booking_id, {
				rating: tripRating,
				review: tripRatingComment.trim() || undefined,
			});
			setTrips((prev) => prev.map((x) =>
				x.booking_id === rateTrip.booking_id
					? { ...x, review: { rating: tripRating }, can_rate: false }
					: x
			));
			setRateTrip(null);
			loadHotels();
		} catch (err) {
			setTripRateError(
				err?.response?.data?.message
				|| err?.message
				|| i18n.t("common.ratingSubmitFailed"),
			);
		} finally {
			setTripRateSubmitting(false);
		}
	};

	const handleCancelTrip = async (trip) => {
		if (!trip?.booking_id || !trip.can_cancel) return;
		if (!window.confirm(t("tempstay.cancelConfirm"))) return;
		setCancellingId(trip.booking_id);
		setTripError("");
		try {
			await cancelBooking(trip.booking_id, "Guest cancelled from My trips");
			setTrips((prev) => prev.map((x) =>
				x.booking_id === trip.booking_id
					? { ...x, status: "cancelled", can_cancel: false, bucket: "cancelled" }
					: x
			));
		} catch {
			setTripError(t("tempstay.cancelFailed"));
		} finally {
			setCancellingId(null);
		}
	};

	const loadHotels = React.useCallback(() => {
		getBookingListings({ vertical: 'hotel' }).then(res => {
			const arr = Array.isArray(res) ? res : (res?.data ?? []);
			setHotelsData(arr.map(l => {
				const a = l.attributes ?? {};
				const imgs = mediaUrls(l.images);
				const rooms = Array.isArray(l.room_types) ? l.room_types : [];
				const fromPrice = rooms.length
					? Math.min(...rooms.map(r => Number(r.nightly_price) || Infinity).filter(Number.isFinite))
					: Number(l.price) || 0;
				const starRaw = a.star_rating ?? a.stars;
				const starsNum = starRaw != null && starRaw !== "" ? Number(starRaw) : NaN;
				const stars = Number.isFinite(starsNum) && starsNum > 0 ? Math.min(5, Math.round(starsNum)) : null;
				const ratingRaw = l.avg_rating ?? a.rating;
				const ratingNum = ratingRaw != null && ratingRaw !== "" ? Number(ratingRaw) : NaN;
				const rating = Number.isFinite(ratingNum) ? ratingNum : null;
				const reviews = Number(l.review_count ?? a.review_count ?? a.reviews) || 0;
				const gradient = "linear-gradient(135deg,#0c1a2e,#2563eb)";
				return {
					id: l.booking_listing_id,
					name: l.title || 'Hotel',
					category: (typeof a.category === "string" && a.category.trim()) ? a.category.trim() : 'Hotel',
					location: l.location || '',
					price: fromPrice || Number(l.price) || 0,
					priceNum: fromPrice || Number(l.price) || 0,
					stars,
					rating,
					reviews,
					featured: a.featured ?? false,
					gradient,
					thumb: imgs[0] ?? gradient,
					image: imgs[0] ?? null,
					images: imgs,
					amenities: Array.isArray(a.amenities) ? a.amenities : [],
					room_types: rooms,
					rooms: [],
					maxGuests: a.maxGuests ?? a.max_guests ?? l.capacity ?? 2,
					host: a.host ?? a.host_name ?? null,
					hostId: l.owner_id ?? null,
					host_user_id: l.owner_id ?? null,
					desc: l.description ?? null,
					rules: a.rules ?? null,
				};
			}));
		}).catch(() => {});
	}, []);
	useEffect(() => { loadHotels(); }, [loadHotels]);

	if (htView === "detail" && selectedHotel) return <HotelDetailPage hotel={selectedHotel} onBack={() => setHtView("landing")} onBook={info => {
		setBookingInfo(info);
		if (info.roomPrice != null) {
			setSelectedHotel((h) => ({ ...h, priceNum: info.roomPrice, price: info.roomPrice }));
		}
		setHtView("checkout");
	}} />;
	if (htView === "checkout" && selectedHotel) return <TempStayCheckoutPage listing={selectedHotel} bookingInfo={bookingInfo} onBack={() => setHtView("detail")} onConfirm={async (id, instant) => {
		setOrderId(id);
		setIsInstant(!!instant);
		if (id && selectedHotel?.hostId) {
			const nights = bookingInfo?.nights ?? 1;
			await messageUser(selectedHotel.hostId, {
				initialMessage: `Hi! I just booked "${selectedHotel?.name ?? 'your hotel'}" for ${nights} night${nights > 1 ? 's' : ''} (${bookingInfo?.checkIn ?? ''} → ${bookingInfo?.checkOut ?? ''}). Looking forward to my stay!`,
				navigate: false,
				sourceVertical: "hotel",
			}).catch(() => {});
		}
		setHtView("confirm");
	}} />;
	if (htView === "confirm" && selectedHotel) return <TempStayConfirmPage listing={selectedHotel} bookingInfo={bookingInfo} orderId={orderId} isInstant={isInstant} onDone={() => { setHtView("landing"); setMainTab("trips"); setSelectedHotel(null); setBookingInfo(null); setOrderId(null); setIsInstant(false); loadTrips(); }} />;

	const filtered = hotelsData.filter(h => {
		const matchCat = matchesCategory(activeCategory, h.category, categories);
		const matchQ = !query || h.name.toLowerCase().includes(query.toLowerCase()) || h.location.toLowerCase().includes(query.toLowerCase());
		return matchCat && matchQ;
	});
	const featured = filtered.filter(h => h.featured);
	const rest = filtered.filter(h => !h.featured);

	if (loading) return (
		<div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1100, margin: "0 auto", width: "100%", padding: "28px 0 20px" }}>
				<SkeletonHeading />
				<Skel h={52} r={12} style={{ marginTop: 20, marginBottom: 20, maxWidth: 680 }} />
				<div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
					{[...Array(5)].map((_,i) => <SkeletonCircle key={i} />)}
				</div>
				<Skel w={80} h={11} r={5} style={{ marginBottom: 14 }} />
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
					{[...Array(6)].map((_,i) => (
						<div key={i} className="bg-surface border border-border-subtle" style={{ borderRadius: 16, overflow: "hidden" }}>
							<Skel h={170} r={0} />
							<div style={{ padding: "12px 14px 14px" }}>
								<Skel w="72%" h={14} r={6} style={{ marginBottom: 6 }} />
								<Skel w="50%" h={11} r={5} style={{ marginBottom: 12 }} />
								<div style={{ display: "flex", justifyContent: "space-between" }}>
									<Skel w={80} h={11} r={5} />
									<Skel w={65} h={13} r={5} />
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 20, textAlign: "center" }}>{landingTitle}</h1>
					<div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
						{["find", "trips"].map((tabKey) => (
							<button
								key={tabKey}
								type="button"
								onClick={() => {
									setMainTab(tabKey);
									if (tabKey === "trips" && !tripsFetched) loadTrips();
								}}
								style={{
									padding: "8px 18px", borderRadius: 20,
									border: `1px solid ${mainTab === tabKey ? "#2563eb" : "rgba(255,255,255,0.12)"}`,
									background: mainTab === tabKey ? "rgba(37,99,235,0.2)" : "transparent",
									color: mainTab === tabKey ? "#fff" : "rgba(255,255,255,0.55)",
									fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer",
								}}
							>
								{tabKey === "find" ? t("tempstay.findStays") || "Find hotels" : t("tempstay.myTrips") || "My trips"}
							</button>
						))}
					</div>
					{mainTab === "find" && (
						<>
					<div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
						<HostListingCTA vertical="hotel" label={t("hostListing.hotel")} onCreated={loadHotels} />
					</div>
					<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
						<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
							<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={20} /></div>
							<input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} />
						</div>
					</div>
						</>
					)}
				</div>
				{mainTab === "trips" && (
					<div style={{ marginBottom: 24, padding: "0 4px" }}>
						<div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
							{[
								{ id: "all", label: t("events.categories.all") },
								{ id: "upcoming", label: t("tempstay.tripUpcoming") },
								{ id: "past", label: t("tempstay.tripPast") },
								{ id: "cancelled", label: t("tempstay.tripCancelled") },
							].map((f) => (
								<button
									key={f.id}
									type="button"
									onClick={() => setTripBucketFilter(f.id)}
									style={{
										padding: "6px 14px", borderRadius: 16,
										border: `1px solid ${tripBucketFilter === f.id ? "#2563eb" : "rgba(255,255,255,0.1)"}`,
										background: tripBucketFilter === f.id ? "rgba(37,99,235,0.15)" : "transparent",
										color: tripBucketFilter === f.id ? "#60a5fa" : "rgba(255,255,255,0.45)",
										fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer",
									}}
								>
									{f.label}
								</button>
							))}
						</div>
						{tripError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#ef4444", textAlign: "center", marginBottom: 12 }}>{tripError}</p>}
						{tripsLoading ? (
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center", padding: "40px 0" }}>{t("tempstay.loadingTrips")}</p>
						) : filterTripsByBucket(trips, tripBucketFilter).length === 0 ? (
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center", padding: "40px 0" }}>{t("tempstay.noTrips")}</p>
						) : (
							<div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720, margin: "0 auto" }}>
								{filterTripsByBucket(trips, tripBucketFilter).map((trip) => {
									const statusColor = trip.status === "confirmed" || trip.status === "in_progress"
										? "#22c55e"
										: trip.status === "cancelled" || trip.status === "declined"
											? "#ef4444"
											: trip.status === "completed"
												? "#60a5fa"
												: "#f59e0b";
									return (
										<div key={trip.booking_id} style={{ background: "#13151c", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
											<div style={{ flex: 1, minWidth: 180 }}>
												<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff" }}>{trip.title}</p>
												<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
													{[trip.location, trip.start_date && trip.end_date ? `${trip.start_date} → ${trip.end_date}` : null].filter(Boolean).join(" · ")}
												</p>
											</div>
											<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
												<span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: `${statusColor}22`, color: statusColor, textTransform: "capitalize" }}>{trip.status?.replace(/_/g, " ")}</span>
												{trip.can_rate && (
													<button type="button" onClick={() => openTripRate(trip)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
														{t("common.rateYourHost")} ★
													</button>
												)}
												{trip.can_cancel && (
													<button type="button" disabled={cancellingId === trip.booking_id} onClick={() => handleCancelTrip(trip)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.12)", color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: cancellingId === trip.booking_id ? "default" : "pointer", opacity: cancellingId === trip.booking_id ? 0.6 : 1 }}>
														{cancellingId === trip.booking_id ? t("tempstay.cancelling") : t("tempstay.cancelTrip")}
													</button>
												)}
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				)}
				{mainTab === "find" && (
				<>
				<div style={{ display: "flex", gap: 20, marginBottom: 24, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4, animation: "fadeUp 0.35s ease 60ms both", scrollbarWidth: "none", justifyContent: "center" }}>
					{categories.map((cat, i) => (
						<LeoButton key={cat.id} cat={cat} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 30} />
					))}
				</div>
				{featured.length > 0 && (
					<div style={{ marginBottom: 32, animation: "fadeUp 0.4s ease 120ms both" }}>
						<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>{i18n.t("common.featured")}</p>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
							{featured.map((h, i) => <HotelCard key={h.id} hotel={h} delay={i * 50} onClick={() => { setSelectedHotel(h); setHtView("detail"); }} />)}
						</div>
					</div>
				)}
				{rest.length > 0 && (
					<div style={{ marginBottom: 32, animation: "fadeUp 0.4s ease 180ms both" }}>
						<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>{t("hotel.allHotels")}</p>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
							{rest.map((h, i) => <HotelCard key={h.id} hotel={h} delay={i * 40} onClick={() => { setSelectedHotel(h); setHtView("detail"); }} />)}
						</div>
					</div>
				)}
				{filtered.length === 0 && (
					<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, paddingBottom: 24, paddingTop: 40 }}>
						<div style={{ opacity: 0.4, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
							<HotelIcon s={40} />
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>{i18n.t("hotel.noHotelsFound")}</p>
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", maxWidth: 320 }}>{i18n.t("hotel.noHotelsHint")}</p>
						</div>
						<HostListingCTA vertical="hotel" label={t("hostListing.hotel")} onCreated={loadHotels} />
					</div>
				)}
				</>
				)}
			</div>
			{rateTrip && (
				<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
					<div style={{ background: "#13131f", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 380 }}>
						<h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, color: "#fff", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{t("common.rateYourHost")}</h3>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 18 }}>{rateTrip.title}</p>
						<div style={{ display: "flex", gap: 8, marginBottom: 18, justifyContent: "center" }}>
							{[1, 2, 3, 4, 5].map((n) => (
								<button key={n} type="button" onClick={() => setTripRating(n)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
									<svg width={30} height={30} viewBox="0 0 24 24" fill={n <= tripRating ? "#f59e0b" : "none"} stroke={n <= tripRating ? "#f59e0b" : "rgba(255,255,255,0.3)"} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
								</button>
							))}
						</div>
						<textarea value={tripRatingComment} onChange={(e) => setTripRatingComment(e.target.value)} placeholder={t("common.optionalComment")} rows={3} style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 12px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 16 }} />
						{tripRateError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#ef4444", marginBottom: 12 }}>{tripRateError}</p>}
						<div style={{ display: "flex", gap: 10 }}>
							<button type="button" onClick={() => setRateTrip(null)} style={{ flex: 1, padding: "11px 0", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{t("ondemand.hire.skip")}</button>
							<button type="button" disabled={tripRating === 0 || tripRateSubmitting} onClick={submitTripReview} style={{ flex: 1, padding: "11px 0", background: tripRating > 0 && !tripRateSubmitting ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: tripRating > 0 ? "#fff" : "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: tripRating > 0 && !tripRateSubmitting ? "pointer" : "default" }}>{tripRateSubmitting ? "…" : t("common.submit")}</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function HotelCard({ hotel, delay, onClick }) {
	const [hov, setHov] = useState(false);
	const [imgError, setImgError] = useState(false);
	const hasPhoto = !imgError && typeof hotel.image === "string" && hotel.image.startsWith("http");
	const showGuestRating = hotel.rating != null && Number(hotel.reviews) > 0;
	return (
		<div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onClick}
			className={`bg-surface border ${hov ? "border-border" : "border-border-subtle"}`}
			style={{ borderRadius: 16, overflow: "hidden", cursor: "pointer", transform: hov ? "translateY(-3px)" : "none", transition: "all 0.2s", animation: `fadeUp 0.35s ease ${delay}ms both` }}>
			<div style={{ height: 170, background: hotel.gradient || "linear-gradient(135deg,#0c1a2e,#2563eb)", position: "relative", overflow: "hidden" }}>
				{hasPhoto ? (
					<img loading="lazy" decoding="async" src={hotel.image} alt={hotel.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={() => setImgError(true)} />
				) : (
					<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
						<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{i18n.t("hotel.noPhotosYet")}</span>
					</div>
				)}
				{hotel.stars != null && hotel.stars > 0 && (
					<div style={{ position: "absolute", top: 10, left: 10, background: "rgba(0,0,0,0.6)", borderRadius: 6, padding: "3px 8px", display: "flex", gap: 2 }}>
						{[...Array(hotel.stars)].map((_, i) => <span key={i} style={{ color: "#f59e0b", fontSize: 10 }}>★</span>)}
					</div>
				)}
				<div style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.6)", borderRadius: 6, padding: "3px 8px" }}>
					<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{hotel.category}</span>
				</div>
			</div>
			<div style={{ padding: "12px 14px 14px" }}>
				<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{hotel.name}</p>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 10 }}>{hotel.location}</p>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
					{showGuestRating ? (
						<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
							<svg width={12} height={12} viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
							<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>{hotel.rating}</span>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>({Number(hotel.reviews).toLocaleString()})</span>
						</div>
					) : (
						<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600 }}>{i18n.t("hotel.newListing")}</span>
					)}
					{hotel.priceNum > 0 && (
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#60a5fa" }}>${hotel.priceNum}<span className="text-text-secondary" style={{ fontWeight: 400, fontSize: 11 }}>/night</span></p>
					)}
				</div>
			</div>
		</div>
	);
}

export { HotelPage };
