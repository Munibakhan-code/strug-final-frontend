import React, { useState, useEffect, useRef, useLayoutEffect , useMemo } from "react";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import i18n from "../i18n/index.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon } from "../components/icons.jsx";
import { Skel, SkeletonCircle, SkeletonHeading, SkeletonTempStayCard } from "../components/skeletons.jsx";
import { LeoButton, ODCategoryBubble } from "../components/shared.jsx";
import { ImageLightbox } from "../components/ImageLightbox.jsx";
import { useStripe, useElements, CardElement } from "@stripe/react-stripe-js";
import { useTheme } from "../utils/theme.js";
import { getBookingListings, getBookingListing, getBookingQuote, createBooking, createBookingIntent, getBookings, getBooking, createBookingReview, cancelBooking, getListingAvailability, submitBookingReview, getListingReviews } from "../api/booking";
import { messageUser } from "../api/chat";
import { bindCheckoutReferralCode } from "../api/user";
import { getVerticalProfileByUser } from "../api/verticalProfile.js";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { mediaUrls } from "../utils/mediaUrl";
import { SaveButton } from "../components/SaveButton.jsx";
import { TempStayDetailGallery } from "../components/TempStayDetailGallery.jsx";
import { slugify } from "../utils/slugify";
import { Avatar } from "../components/SafeImage.jsx";
import {
	TEMPSTAY_PROFILE_VERTICAL,
	LEGACY_HOSTING_PROFILE_VERTICAL,
} from "../utils/bookingIsolation.js";
import { mapGuestBookingsToTempStayTrips, filterTripsByBucket } from "../utils/tempstayTrips.js";
import { buildUnavailableNightSet, stayRangeConflicts } from "../utils/tempstayAvailability.js";
import {
	buildTempStayListingsQuery,
	filterTempStayListings,
	browseFiltersActive,
} from "../utils/tempstayBrowseFilters.js";
import {
	resolveTempStayCategory,
	maxGuestsForListing,
	parseListingCoords,
	listingHasMapCoords,
	amenitiesFromListing,
	clientFeePreview,
  isUnavailableNight,
} from "../utils/tempstayListingHelpers.js";

// Availability is one request per card; only probe the first screenful.
const BROWSE_AVAILABILITY_PROBE_LIMIT = 24;

const TEMPSTAY_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#2563eb", match: null, img: "/img/cat/tempstay/All.png" },
	{ id: "entireHome", labelKey: "tempstay.categoryEntireHome", color: "#db2777", match: "Entire Home", img: "/img/cat/tempstay/Entire Home.png" },
	{ id: "privateRoom", labelKey: "tempstay.categoryPrivateRoom", color: "#7c3aed", match: "Private Room", img: "/img/cat/tempstay/Private Room.png" },
	{ id: "sharedRoom", labelKey: "tempstay.categorySharedRoom", color: "#059669", match: "Shared Room", img: "/img/cat/tempstay/Shared Room.png" },
	{ id: "cabin", labelKey: "tempstay.categoryCabin", color: "#d97706", match: "Cabin", img: "/img/cat/tempstay/Cabin.png" },
	{ id: "beachfront", labelKey: "tempstay.categoryBeachfront", color: "#0891b2", match: "Beachfront", img: "/img/cat/tempstay/Beachfront.png" },
	{ id: "luxury", labelKey: "tempstay.categoryLuxury", color: "#f59e0b", match: "Luxury", img: "/img/cat/tempstay/Luxury.png" },
	{ id: "unique", labelKey: "tempstay.categoryUnique", color: "#ec4899", match: "Unique", img: "/img/cat/tempstay/Unique.png" },
];

const AMENITY_MATCH_TO_KEY = {
	"Wi-Fi": "wifi",
	"Kitchen": "kitchen",
	"Washer": "washer",
	"Dryer": "dryer",
	"Free parking": "freeParking",
	"Air conditioning": "airConditioning",
	"Dedicated workspace": "dedicatedWorkspace",
	"TV": "tv",
	"Coffee maker": "coffeeMaker",
	"Hair dryer": "hairDryer",
};
// Amenity chip keys for i18n — hosts store free-text names that map when possible.

function tempstayCategoryLabel(category, t) {
	if (!category) return t("tempstay.categoryUnlisted", "Stay");
	const def = TEMPSTAY_CATEGORY_DEFS.find((d) => d.match === category);
	return def ? t(def.labelKey) : category;
}

function amenityLabel(name, t) {
	const key = AMENITY_MATCH_TO_KEY[name];
	return key ? t(`common.amenities.${key}`) : name;
}

function guestLabel(count, t) {
	return t(count === 1 ? "common.guestCount_one" : "common.guestCount_other", { count });
}

function guestsBedsLabel(guests, beds, t, max = false) {
	// A host who never set a guest count gets a beds-only label rather than an invented
	// number. `capacity` used to be the fallback here, but it is pinned to 1 for stays now
	// (it means concurrent units to the booking engine), so reading it would render every
	// such listing as "1 guests".
	if (guests == null) {
		return t(beds === 1 ? "common.bedCount_one" : "common.bedCount_other", { count: beds });
	}
	const key = max
		? (beds === 1 ? "common.guestsMaxBeds_one" : "common.guestsMaxBeds_other")
		: (beds === 1 ? "common.guestsBeds_one" : "common.guestsBeds_other");
	return t(key, { guests, beds });
}

// #287 discovery: recently-viewed + saved searches, persisted client-side (no BE/migration).
const TS_RECENT_KEY = "strug_tempstay_recent";
const TS_SAVED_SEARCH_KEY = "strug_tempstay_saved_searches";
const tsReadJson = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key) || "null"); return Array.isArray(v) ? v : fallback; } catch { return fallback; } };
function tsPushRecent(listing) {
	if (!listing?.id) return;
	const slim = { id: listing.id, name: listing.name, location: listing.location, priceNum: listing.priceNum, rating: listing.rating, thumb: typeof listing.thumb === "string" ? listing.thumb : null, category: listing.category };
	const prev = tsReadJson(TS_RECENT_KEY, []).filter(l => l.id !== listing.id);
	try { localStorage.setItem(TS_RECENT_KEY, JSON.stringify([slim, ...prev].slice(0, 12))); } catch { /* quota */ }
}

// #2: the Temp Stay grid must show only real, server-backed listings. The former
// hardcoded demo array was rendered as the initial state and as a fallback whenever
// the backend returned no listings (e.g. after the reset), so placeholder stays
// leaked to users. Start empty and render only what the server returns.
const TEMPSTAY_LISTINGS = [];

function TempStayMapBounds({ listings }) {
	const map = useMap();
	const boundsKey = listings.map(l => l.name).join("|");
	useEffect(() => {
		if (!listings.length) return;
		if (listings.length === 1) {
			map.setView([listings[0].lat, listings[0].lng], 10);
		} else {
			map.fitBounds(listings.map(l => [l.lat, l.lng]), { padding: [40, 40] });
		}
	}, [boundsKey]); // eslint-disable-line react-hooks/exhaustive-deps
	return null;
}

function TempStayDetailMapCenter({ lat, lng }) {
	const map = useMap();
	useEffect(() => {
		if (Number.isFinite(lat) && Number.isFinite(lng)) {
			map.setView([lat, lng], 14, { animate: false });
		}
	}, [map, lat, lng]);
	return null;
}

function tempStayReserveLabel({ availError, datesConflict, nights, instantBooking, t }) {
	if (availError) return t("tempstay.availabilityLoadFailed");
	if (datesConflict) return t("tempstay.datesUnavailable");
	if (nights > 0) return instantBooking ? t("tempstay.instantBook", "Instant book") : t("tempstay.reserve");
	return t("tempstay.selectDates");
}

// Thumbnail area (photo/gradient tile + overlaid badges) stays dark-scrimmed in both
// themes for legibility over the image, same call as RestaurantCard in Reservations.jsx.
// The Info section below it sits on the neutral page background, so it uses tokens.
function TempStayCard({ listing, delay, onClick, datesUnavailable = false }) {
	const [hov, setHov] = useState(false);
	const estimate = `$${(listing.priceNum * 5).toLocaleString()} est. for 5 nights`;
	return (
		<a href={`/listing/host/${listing.id}-${slugify(listing.name)}`}
			onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); onClick?.(e); }}
			onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{
			display: "block", textDecoration: "none", color: "inherit",
			width: "100%", cursor: "pointer",
			opacity: datesUnavailable ? 0.55 : 1,
			filter: datesUnavailable ? "grayscale(0.35)" : "none",
			transform: hov && !datesUnavailable ? "translateY(-4px)" : "none",
			transition: "all 0.2s", animation: `fadeUp 0.35s ease ${delay}ms both`,
		}}>
			{/* Thumbnail */}
			<div style={{
				width: "100%", height: 200, borderRadius: 14,
				background: listing.thumbGradient ?? listing.thumb ?? 'linear-gradient(135deg, #1e3a5f, #0f2744)', position: "relative", overflow: "hidden",
				boxShadow: hov ? "0 16px 48px var(--color-shadow)" : "0 2px 12px var(--color-shadow)",
				transition: "box-shadow 0.2s",
			}}>
				{listing.thumb && <img loading="lazy" decoding="async" src={listing.thumb} alt={listing.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none"; }} />}
				{listing.superhost && (
					<div style={{ position: "absolute", top: 10, left: 10, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)", borderRadius: 20, padding: "4px 10px", display: "flex", alignItems: "center", gap: 4 }}>
						<svg width={10} height={10} viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
						<span style={{ fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.04em" }}>{i18n.t("common.superhost")}</span>
					</div>
				)}
				{/* Wishlist heart — same persisted SaveButton as listing detail (#1608) */}
				<div
					onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
					onKeyDown={(e) => e.stopPropagation()}
					style={{ position: "absolute", top: 6, right: 6, zIndex: 2 }}
				>
					<SaveButton
						entityType="stay"
						entityId={listing.id}
						size={30}
						meta={{ title: listing.name, sub: listing.location, price: `$${listing.priceNum}/night`, thumb: listing.thumb, accent: "#2563eb" }}
					/>
				</div>
				{/* Category pill */}
				<div style={{ position: "absolute", bottom: 10, left: 10, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)", borderRadius: 20, padding: "3px 10px" }}>
					<span style={{ fontSize: 10, fontWeight: 600, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{tempstayCategoryLabel(listing.category, i18n.t.bind(i18n))}</span>
				</div>
			</div>
			{/* Availability badge */}
			{datesUnavailable ? (
				<div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.35)", borderRadius: 20, padding: "3px 10px" }}>
					<div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f87171", flexShrink: 0 }} />
					<span style={{ fontSize: 10, fontWeight: 600, color: "#fca5a5", fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("tempstay.datesUnavailable")}</span>
				</div>
			) : listing.badge ? (
				<div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 20, padding: "3px 10px" }}>
					<div style={{ width: 6, height: 6, borderRadius: "50%", background: "#2563eb", flexShrink: 0 }} />
					<span style={{ fontSize: 10, fontWeight: 600, color: "#93c5fd", fontFamily: "'DM Sans', sans-serif" }}>{listing.badge}</span>
				</div>
			) : null}
			{/* Info */}
			<div style={{ padding: (listing.badge || datesUnavailable) ? "6px 2px 0" : "10px 2px 0" }}>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 }}>
					<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.35, flex: 1, marginRight: 8, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{listing.name}</p>
					<div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
						{listing.rating != null && Number(listing.reviews) > 0 ? (
							<>
								<svg width={12} height={12} viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
								<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>{listing.rating}</span>
								<span className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>({listing.reviews})</span>
							</>
						) : (
							<span className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("hotel.newListing")}</span>
						)}
					</div>
				</div>
				<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 2 }}>{listing.location}</p>
				<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>{guestsBedsLabel(listing.guests, listing.beds, i18n.t.bind(i18n))}</p>
				<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
					<div style={{ width: 20, height: 20, borderRadius: "50%", background: listing.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", fontFamily: "'Barlow Condensed', sans-serif", flexShrink: 0 }}>{listing.avatar}</div>
					<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("tempstay.hostedBy", { host: listing.host })}</span>
					<div style={{ marginLeft: "auto", textAlign: "right" }}>
						<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", lineHeight: 1 }}>${listing.priceNum} <span className="text-text-secondary" style={{ fontSize: 11, fontWeight: 400 }}>{i18n.t("common.perNight")}</span></p>
						{hov && <p className="text-text-muted" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>{estimate}</p>}
					</div>
				</div>
			</div>
		</a>
	);
}

function TempStayDetailPage({ listing, onBack, onBook, initialCheckIn = "", initialCheckOut = "", initialGuests = 1 }) {
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [checkIn, setCheckIn] = useState(initialCheckIn || "");
	const [checkOut, setCheckOut] = useState(initialCheckOut || "");
	const [guests, setGuests] = useState(initialGuests);
	const [msgOpen, setMsgOpen] = useState(false);
	const [hostMsg, setHostMsg] = useState("");
	const [msgSent, setMsgSent] = useState(false);
	const [msgError, setMsgError] = useState("");
	const [msgSending, setMsgSending] = useState(false);
	const [shareCopied, setShareCopied] = useState(false);
	const [listingReviews, setListingReviews] = useState([]);
	const [reviewsLoading, setReviewsLoading] = useState(false);
	const [galleryImages, setGalleryImages] = useState(() => mediaUrls(listing.images));
	const [galleryIdx, setGalleryIdx] = useState(0);
	const [lightboxOpen, setLightboxOpen] = useState(false);
	const [unavailable, setUnavailable] = useState(() => new Set());
	const [availLoading, setAvailLoading] = useState(() => !!listing.id);
	const [availError, setAvailError] = useState(false);
	const [dateInputError, setDateInputError] = useState("");
	const galleryTouchStartX = useRef(null);
	const bookingCardRef = useRef(null);
	// #394: listing payload carries only owner_id — hydrate host name/photo from the
	// scoped tempstay vertical profile (fallback to legacy "hosting" for older hosts).
	const [hostProfile, setHostProfile] = useState(null);
	useEffect(() => {
		setHostProfile(null);
		if (!listing.host_user_id) return;
		let alive = true;
		const uid = listing.host_user_id;
		getVerticalProfileByUser(uid, TEMPSTAY_PROFILE_VERTICAL)
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
	}, [listing.host_user_id]);
	useEffect(() => {
		if (!listing.id) { setAvailLoading(false); return; }
		let alive = true;
		setAvailLoading(true);
		setAvailError(false);
		getListingAvailability(listing.id)
			.then((res) => {
				if (!alive) return;
				setUnavailable(buildUnavailableNightSet(res));
				setAvailLoading(false);
			})
			.catch(() => {
				if (!alive) return;
				setAvailError(true);
				setAvailLoading(false);
			});
		return () => { alive = false; };
	}, [listing.id]);
	useEffect(() => {
		if (!listing.id) { setListingReviews([]); return; }
		let alive = true;
		setReviewsLoading(true);
		getListingReviews(listing.id)
			.then((res) => {
				if (!alive) return;
				const rows = res?.data?.reviews ?? (Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []));
				setListingReviews(Array.isArray(rows) ? rows : []);
			})
			.catch(() => { if (alive) setListingReviews([]); })
			.finally(() => { if (alive) setReviewsLoading(false); });
		return () => { alive = false; };
	}, [listing.id]);
	const hostName = hostProfile?.display_name || hostProfile?.business_name || listing.host;
	const hostPhoto = hostProfile?.profile_pic_url || null;
	useEffect(() => {
		if (galleryImages.length || !listing.id) return;
		getBookingListing(listing.id).then(res => {
			const data = res?.data ?? res;
			const imgs = mediaUrls(data?.images);
			if (imgs.length) setGalleryImages(imgs);
		}).catch(() => {});
	}, [listing.id]); // eslint-disable-line react-hooks/exhaustive-deps
	const nights = checkIn && checkOut ? Math.max(0, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000)) : 0;
	const datesConflict = stayRangeConflicts(checkIn, checkOut, unavailable);
	const canReserve = nights > 0 && !datesConflict && !availLoading && !availError;
	const total = nights * listing.priceNum;
	const amenities = amenitiesFromListing(listing);
	const maxGuests = maxGuestsForListing(listing);
	const feePreview = clientFeePreview(nights, listing.priceNum, listing);
	const t = i18n.t.bind(i18n);

	function applyCheckIn(value) {
		if (isUnavailableNight(value, unavailable)) {
			setDateInputError(t("tempstay.datesUnavailable"));
			setCheckIn("");
			return;
		}
		setDateInputError("");
		setCheckIn(value);
	}
	function applyCheckOut(value) {
		// Checkout day is half-open [checkIn, checkOut) — departure night is not a booked night.
		setDateInputError("");
		setCheckOut(value);
	}

	const hasMapCoords = listingHasMapCoords(listing);
	const reserveLabel = tempStayReserveLabel({
		availError,
		datesConflict,
		nights,
		instantBooking: listing.instant_booking,
		t,
	});
	const handleReserve = () => {
		if (canReserve) onBook({ checkIn, checkOut, guests, nights });
	};
	const openGalleryAt = (index = 0) => {
		setGalleryIdx(index);
		setLightboxOpen(true);
	};
	const onGalleryTouchStart = (e) => {
		galleryTouchStartX.current = e.touches[0]?.clientX ?? null;
	};
	const onGalleryTouchEnd = (e) => {
		if (galleryTouchStartX.current == null || galleryImages.length < 2) return;
		const dx = (e.changedTouches[0]?.clientX ?? 0) - galleryTouchStartX.current;
		if (Math.abs(dx) > 44) {
			setGalleryIdx((i) =>
				dx < 0
					? (i + 1) % galleryImages.length
					: (i - 1 + galleryImages.length) % galleryImages.length,
			);
		}
		galleryTouchStartX.current = null;
	};

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, overflowY: "auto", width: "100%", paddingBottom: 24 }}>
				<Skel w={160} h={18} r={6} style={{ marginTop: 24, marginBottom: 20 }} />
				<Skel w="100%" h={320} r={18} style={{ marginBottom: 24 }} />
				<div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
					<div style={{ flex: 2, minWidth: 280 }}>
						<Skel w="80%" h={28} r={8} style={{ marginBottom: 8 }} />
						<Skel w="50%" h={14} r={6} style={{ marginBottom: 20 }} />
						<Skel w="100%" h={80} r={8} style={{ marginBottom: 20 }} />
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
							{[...Array(6)].map((_,i) => <Skel key={i} w="100%" h={28} r={8} />)}
						</div>
					</div>
					<div style={{ flex: 1, minWidth: 240 }}>
						<SkeletonTempStayCard />
					</div>
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingBottom: isMobile ? 96 : 0 }}>
			<div style={{ width: "100%", paddingBottom: 24 }}>
				{/* Back + Share */}
				<div style={{ marginTop: 24, marginBottom: isMobile ? 16 : 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
					<button onClick={onBack} className="text-text-secondary" style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}>
						<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
						{i18n.t("tempstay.backToListings")}
					</button>
					<button onClick={() => { const url = `${window.location.origin}/listing/host/${listing.id}-${slugify(listing.name)}`; navigator.clipboard?.writeText(url); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: shareCopied ? "#22c55e" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: 0 }}>
						{shareCopied ? <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> : <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>}
						{shareCopied ? t("common.copied") : t("common.share")}
					</button>
				</div>
				{/* Title + meta above gallery (Airbnb-style hierarchy) */}
				<div style={{ marginBottom: isMobile ? 12 : 16 }}>
					{listing.badge && (
						<div style={{ marginBottom: 10, display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 20, padding: "4px 12px" }}>
							<div style={{ width: 6, height: 6, borderRadius: "50%", background: "#2563eb" }} />
							<span style={{ fontSize: 11, fontWeight: 600, color: "#93c5fd", fontFamily: "'DM Sans', sans-serif" }}>{listing.badge}</span>
						</div>
					)}
					<h1 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: isMobile ? 22 : 26, letterSpacing: "-0.01em", marginBottom: 8, lineHeight: 1.25 }}>{listing.name}</h1>
					<div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
						{listing.rating != null && Number(listing.reviews) > 0 ? (
							<>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
								<span className="text-text-primary" style={{ fontWeight: 600 }}>{listing.rating}</span>
								<span className="text-text-secondary">· {t(listing.reviews === 1 ? "common.reviewCount_one" : "common.reviewCount_other", { count: listing.reviews })}</span>
								<span className="text-text-secondary">·</span>
							</>
						) : (
							<span className="text-text-secondary">{i18n.t("hotel.newListing")}</span>
						)}
						<span className="text-text-secondary">{listing.location}</span>
						<span className="text-text-secondary">·</span>
						<span className="text-text-secondary">{guestsBedsLabel(listing.guests, listing.beds, t, true)}</span>
					</div>
				</div>
				<TempStayDetailGallery
					listing={listing}
					galleryImages={galleryImages}
					galleryIdx={galleryIdx}
					isMobile={isMobile}
					onOpenLightbox={openGalleryAt}
					onTouchStart={onGalleryTouchStart}
					onTouchEnd={onGalleryTouchEnd}
					t={t}
				/>
				{lightboxOpen && galleryImages.length > 0 && (
					<ImageLightbox images={galleryImages} index={galleryIdx} onIndexChange={setGalleryIdx} onClose={() => setLightboxOpen(false)} />
				)}
				<div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
					{/* Left: info */}
					<div style={{ flex: 2, minWidth: 280 }}>
						{/* Host */}
						<div
							onClick={() => { if (listing.host_user_id) { window.__profileTargetId = listing.host_user_id; window.__profileVertical = TEMPSTAY_PROFILE_VERTICAL; window.__nav?.("profile"); } }}
							style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--color-border-subtle)", cursor: listing.host_user_id ? "pointer" : "default" }}
						>
							{/* #457: a 404'd host photo falls back to the host initial, not a broken-image icon. */}
							<Avatar url={hostPhoto} initials={listing.avatar} size={44} alt="" style={{ background: listing.avatarColor, fontSize: 18, fontWeight: 800 }} />
							<div>
								<p style={{ fontSize: 13, fontWeight: 700, color: listing.host_user_id ? "#60a5fa" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif" }}>{t("tempstay.hostedBy", { host: hostName })}</p>
								{listing.superhost ? <p style={{ fontSize: 11, color: "#f59e0b", fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("common.superhost")}</p> : (listing.host_user_id && <p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("tempstay.viewProfile")}</p>)}
							</div>
						</div>
						{/* Description */}
						<p className="text-text-secondary" style={{ fontSize: 14, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.7, marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--color-border-subtle)" }}>
							{listing.description
								? listing.description
								: t("tempstay.defaultDescription", {
									category: tempstayCategoryLabel(listing.category, t).toLowerCase(),
									location: listing.location,
									spaceHint: listing.guests === 1
										? t("tempstay.privateSpaceHint")
										: t("tempstay.guestSpaceHint", { guests: listing.guests }),
								})}
						</p>
						{hasMapCoords && (
							<div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--color-border-subtle)" }}>
								<h2 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 22, marginBottom: 8, lineHeight: 1.3 }}>{t("tempstay.whereYoullBe")}</h2>
								<p className="text-text-secondary" style={{ fontSize: 14, fontFamily: "'DM Sans', sans-serif", marginBottom: 14 }}>{listing.location}</p>
								<div style={{ height: 320, borderRadius: 12, overflow: "hidden", border: "1px solid var(--color-border-subtle)" }}>
									<MapContainer
										center={[listing.lat, listing.lng]}
										zoom={14}
										style={{ height: "100%", width: "100%" }}
										scrollWheelZoom={false}
										attributionControl={false}
									>
										<TileLayer
											url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
											attribution='&copy; OpenStreetMap &copy; CARTO'
										/>
										<TempStayDetailMapCenter lat={listing.lat} lng={listing.lng} />
										<Marker position={[listing.lat, listing.lng]}>
											<Popup>{listing.name}</Popup>
										</Marker>
									</MapContainer>
								</div>
							</div>
						)}
						{/* House rules + stay policies (#1612) */}
						{(listing.rules || listing.check_in_time || listing.check_out_time || listing.cancellation_policy) && (
							<div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--color-border-subtle)" }}>
								<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 10, letterSpacing: "0.04em", textTransform: "uppercase" }}>{i18n.t("common.houseRules")}</p>
								{listing.rules && (
									<p className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.65, marginBottom: 8 }}>{listing.rules}</p>
								)}
								{(listing.check_in_time || listing.check_out_time) && (
									<p className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.65, marginBottom: 4 }}>
										{[listing.check_in_time && t("tempstay.checkInTime", { time: listing.check_in_time, defaultValue: `Check-in: ${listing.check_in_time}` }),
											listing.check_out_time && t("tempstay.checkOutTime", { time: listing.check_out_time, defaultValue: `Check-out: ${listing.check_out_time}` })]
											.filter(Boolean).join(" · ")}
									</p>
								)}
								{listing.cancellation_policy && (
									<p className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.65 }}>
										{t("tempstay.cancellationPolicy", { policy: listing.cancellation_policy, defaultValue: `Cancellation: ${listing.cancellation_policy}` })}
									</p>
								)}
							</div>
						)}
						{/* Amenities — only host-stored values (#1598) */}
						<div style={{ marginBottom: 24 }}>
							<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 14, letterSpacing: "0.04em", textTransform: "uppercase" }}>{i18n.t("common.whatPlaceOffers")}</p>
							{amenities.length ? (
								<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
									{amenities.map(a => (
										<div key={a} style={{ display: "flex", alignItems: "center", gap: 10 }}>
											<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
											<span className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{amenityLabel(a, t)}</span>
										</div>
									))}
								</div>
							) : (
								<p className="text-text-muted" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{t("tempstay.noAmenitiesListed", "No amenities listed.")}</p>
							)}
						</div>
						{/* Reviews (#1612) */}
						<div style={{ marginBottom: 24 }}>
							<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 14, letterSpacing: "0.04em", textTransform: "uppercase" }}>{i18n.t("common.reviews", "Reviews")}</p>
							{reviewsLoading ? (
								<p className="text-text-muted" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{t("common.loading", "Loading…")}</p>
							) : listingReviews.length ? (
								<div style={{ display: "grid", gap: 12 }}>
									{listingReviews.slice(0, 8).map((rev, idx) => (
										<div key={rev.booking_review_id ?? rev.id ?? idx} className="bg-surface-raised" style={{ borderRadius: 12, padding: "12px 14px" }}>
											<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
												<svg width={12} height={12} viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
												<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{rev.rating ?? "—"}</span>
											</div>
											{(rev.review || rev.comment) && (
												<p className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.55, margin: 0 }}>{rev.review || rev.comment}</p>
											)}
										</div>
									))}
								</div>
							) : (
								<p className="text-text-muted" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{t("tempstay.noReviewsYet", "No reviews yet.")}</p>
							)}
						</div>
					</div>
					{/* Right: booking card */}
					<div
						ref={bookingCardRef}
						className="bg-surface-raised border border-border"
						style={{
							...(isMobile
								? { width: "100%", maxWidth: "100%" }
								: { flex: "0 0 380px", width: "100%", maxWidth: 380, position: "sticky", top: 20 }),
							borderRadius: 12,
							padding: 24,
							boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
						}}
					>
						<div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 18 }}>
							<span className="text-text-primary" style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>${listing.priceNum}</span>
							<span className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{t("common.perNight")}</span>
						</div>
						{/* Dates */}
						<div style={{ borderRadius: 12, border: `1px solid ${datesConflict ? "rgba(248,113,113,0.45)" : "var(--color-border)"}`, overflow: "hidden", marginBottom: 10 }}>
							<div style={{ display: "flex" }}>
								<div style={{ flex: 1, padding: "10px 14px", borderRight: "1px solid var(--color-border-subtle)" }}>
									<p className="text-text-secondary" style={{ fontSize: 9, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>{i18n.t("common.checkIn")}</p>
									{/* colorScheme stays "dark" regardless of theme — matches the established
									    pattern for native date/time inputs across the app: the browser's own
									    picker chrome isn't retheme'd. */}
									<input type="date" value={checkIn} onChange={e => applyCheckIn(e.target.value)} className={checkIn ? "text-text-primary" : "text-text-muted"} style={{ background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer", colorScheme: "dark", width: "100%" }} />
								</div>
								<div style={{ flex: 1, padding: "10px 14px" }}>
									<p className="text-text-secondary" style={{ fontSize: 9, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>{i18n.t("floral.checkout")}</p>
									<input type="date" value={checkOut} min={checkIn || undefined} onChange={e => applyCheckOut(e.target.value)} className={checkOut ? "text-text-primary" : "text-text-muted"} style={{ background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer", colorScheme: "dark", width: "100%" }} />
								</div>
							</div>
							{/* Guests */}
							<div style={{ borderTop: "1px solid var(--color-border-subtle)", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
								<div>
									<p className="text-text-secondary" style={{ fontSize: 9, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>{i18n.t("common.guests")}</p>
									<p className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{guestLabel(guests, t)}</p>
								</div>
								{/* Decrement sits on a transparent fill over this now-conditionally-light card,
								    so its icon color needs a text token (was fixed #fff — invisible in light
								    theme); increment's bg is always brand blue, so #fff there is correct. */}
								<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
									<button onClick={() => setGuests(g => Math.max(1, g - 1))} className="border border-border text-text-primary" style={{ width: 26, height: 26, borderRadius: "50%", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>−</button>
									<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", minWidth: 14, textAlign: "center" }}>{guests}</span>
									<button onClick={() => setGuests(g => Math.min(maxGuests, g + 1))} style={{ width: 26, height: 26, borderRadius: "50%", border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>+</button>
								</div>
							</div>
						</div>
						{availLoading && (
							<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>{t("tempstay.checkingAvailability")}</p>
						)}
						{availError && (
							<p style={{ fontSize: 11, color: "#fbbf24", fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>{t("tempstay.availabilityLoadFailed")}</p>
						)}
						{(dateInputError || datesConflict) && (
							<p style={{ fontSize: 12, color: "#f87171", fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>{dateInputError || t("tempstay.datesUnavailable")}</p>
						)}
						{nights > 0 && !datesConflict && (
							<div style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
								<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
									<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{t("tempstay.priceTimesNights", { price: listing.priceNum, nights })}</span>
									<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${total}</span>
								</div>
								{feePreview.cleaningFee != null && (
									<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
										<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("common.cleaningFee")}</span>
										<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${feePreview.cleaningFee}</span>
									</div>
								)}
								{feePreview.serviceFee != null && (
									<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
										<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("common.serviceFee")}</span>
										<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${feePreview.serviceFee}</span>
									</div>
								)}
								<div style={{ borderTop: "1px solid var(--color-border-subtle)", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
									<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("ondemand.hire.total")}</span>
									<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{feePreview.total != null ? `$${feePreview.total}` : t("tempstay.totalAtCheckout", "Total at checkout")}</span>
								</div>
							</div>
						)}
						{/* Disabled fill is a translucent overlay over the card (lightens with it in
						    light theme), so its label uses a text token; the enabled state sits on
						    brand blue, so #fff there is correct. */}
						<button onClick={handleReserve} disabled={!canReserve} style={{ width: "100%", background: canReserve ? "#2563eb" : "rgba(255,255,255,0.08)", border: "none", borderRadius: 12, padding: "14px 0", color: canReserve ? "#fff" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: canReserve ? "pointer" : "default", transition: "all 0.2s", opacity: canReserve ? 1 : 0.7 }}>
							{reserveLabel}
						</button>
						<p className="text-text-muted" style={{ textAlign: "center", fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginTop: 10 }}>{i18n.t("common.notChargedYet")}</p>
						{/* Message Host */}
						<div style={{ marginTop: 16, borderTop: "1px solid var(--color-border-subtle)", paddingTop: 14 }}>
							{msgSent ? (
								<div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
									<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#059669" }}>{t("tempstay.messageSentTo", { host: listing.host })}</span>
								</div>
							) : msgOpen ? (
								<div>
									<textarea value={hostMsg} onChange={e => setHostMsg(e.target.value)} placeholder={t("tempstay.askHostPlaceholder", { host: listing.host })} rows={3}
										className="bg-surface-raised border border-border text-text-primary"
										style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", marginBottom: 8 }}
										onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.4)"}
										onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"} />
									<div style={{ display: "flex", gap: 8 }}>
										<button onClick={() => setMsgOpen(false)} className="border border-border text-text-secondary" style={{ flex: 1, padding: "8px 0", borderRadius: 8, background: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
										<button onClick={async () => {
										if (!hostMsg.trim() || msgSending) return;
										if (!listing.host_user_id) {
											setMsgError(t("tempstay.messageHostMissing", "Host contact is unavailable for this listing."));
											return;
										}
										setMsgSending(true);
										setMsgError("");
										try {
											await messageUser(listing.host_user_id, {
												initialMessage: hostMsg.trim(),
												navigate: true,
												sourceVertical: "tempstay",
											});
											setMsgSent(true);
										} catch (err) {
											setMsgError(err?.response?.data?.message || t("tempstay.messageHostFailed", "Could not send message. Try again."));
										} finally {
											setMsgSending(false);
										}
									}} style={{ flex: 2, padding: "8px 0", borderRadius: 8, border: "none", background: hostMsg.trim() ? "#2563eb" : "rgba(255,255,255,0.08)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: hostMsg.trim() ? "#fff" : "rgba(255,255,255,0.3)", cursor: hostMsg.trim() ? "pointer" : "default" }}>{msgSending ? t("common.sending") : t("common.send")}</button>
									</div>
									{msgError && <p role="alert" style={{ fontSize: 12, color: "#f87171", fontFamily: "'DM Sans', sans-serif", marginTop: 8 }}>{msgError}</p>}
								</div>
							) : (
								<button onClick={() => setMsgOpen(true)} className="border border-border text-text-secondary" style={{ width: "100%", padding: "10px 0", borderRadius: 10, background: "none", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
									onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"}
									onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"}>
									<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
									{t("tempstay.messageHost")}
								</button>
							)}
						</div>
					</div>
				</div>
			</div>
			{isMobile && (
				<div
					className="bg-surface border-t border-border"
					style={{
						position: "fixed",
						left: 0,
						right: 0,
						bottom: 0,
						zIndex: 50,
						padding: "12px 16px calc(12px + env(safe-area-inset-bottom, 0px))",
						boxShadow: "0 -4px 24px rgba(0,0,0,0.12)",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, maxWidth: 640, margin: "0 auto" }}>
						<div style={{ minWidth: 0 }}>
							<div style={{ display: "flex", alignItems: "baseline", gap: 4, flexWrap: "wrap" }}>
								<span className="text-text-primary" style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>${listing.priceNum}</span>
								<span className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{t("common.perNight")}</span>
							</div>
							{nights > 0 && !datesConflict && (
								<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", margin: "2px 0 0" }}>
									{t("tempstay.priceTimesNights", { price: listing.priceNum, nights })} · ${feePreview.total != null ? feePreview.total : total}
								</p>
							)}
						</div>
						<button
							type="button"
							onClick={() => {
								if (canReserve) handleReserve();
								else bookingCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
							}}
							style={{
								flexShrink: 0,
								minHeight: 48,
								minWidth: 120,
								padding: "0 24px",
								borderRadius: 8,
								border: "none",
								background: "#2563eb",
								color: "#fff",
								fontFamily: "'DM Sans', sans-serif",
								fontSize: 15,
								fontWeight: 700,
								cursor: "pointer",
							}}
						>
							{reserveLabel}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

// Stripe's CardElement iframe cannot resolve CSS custom properties, so we pass the
// live token values (text/placeholder) computed from :root for light and dark.
function stripeCardElementOptions(theme) {
	const isLight = theme === "light";
	const root = typeof document !== "undefined" ? document.documentElement : null;
	const cs = root ? getComputedStyle(root) : null;
	const text = cs?.getPropertyValue("--color-text-primary").trim() || (isLight ? "#0a0a0e" : "#ffffff");
	const muted = cs?.getPropertyValue("--color-text-muted").trim() || (isLight ? "rgba(10, 10, 14, 0.42)" : "rgba(255, 255, 255, 0.35)");
	return {
		style: {
			base: {
				color: text,
				iconColor: text,
				fontFamily: "'DM Sans', sans-serif",
				fontSize: "14px",
				"::placeholder": { color: muted },
			},
			invalid: { color: "#f87171" },
		},
	};
}

function TempStayCheckoutPage({ listing, bookingInfo, onBack, onConfirm }) {
	const { isMobile } = useViewport();
	const [theme] = useTheme();
	const stripe = useStripe();
	const elements = useElements();
	const cardElementOptions = useMemo(() => stripeCardElementOptions(theme), [theme]);
	const [refCode, setRefCode] = useState("");
	const [refApplied, setRefApplied] = useState(false);
	const [refError, setRefError] = useState(null);
	const [refLoading, setRefLoading] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState("");
	const [quote, setQuote] = useState(null);
	const [quoteFailed, setQuoteFailed] = useState(false);
	const feePreview = clientFeePreview(bookingInfo.nights, listing.priceNum, listing);
	const total = quote?.total ?? feePreview.total;
	const quoteUnavailable = quote && quote.available === false;
	useEffect(() => {
		setQuoteFailed(false);
		getBookingQuote({
			booking_listing_id: listing.id,
			start_date: bookingInfo.checkIn,
			end_date: bookingInfo.checkOut,
			guests: bookingInfo.guests,
			...(bookingInfo.room_type_id ? { room_type_id: bookingInfo.room_type_id } : {}),
		}).then(res => {
			const q = res?.data ?? res;
			setQuote(q);
			if (q && q.available === false) setSubmitError(q.reason || "These dates are no longer available.");
		}).catch(() => {
			setQuoteFailed(true);
			setSubmitError("Could not load price quote. Please go back and try again.");
		});
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	async function handleConfirm() {
		if (quoteFailed || !quote) {
			setSubmitError("Could not load price quote. Please go back and try again.");
			return;
		}
		if (quoteUnavailable) {
			setSubmitError(quote?.reason || "These dates are no longer available.");
			return;
		}
		if (!stripe || !elements) {
			setSubmitError("Payment form is not ready. Please wait a moment and try again.");
			return;
		}
		setSubmitting(true); setSubmitError("");
		try {
			// 1) Create the booking — server computes the price and rejects date conflicts.
			let booking;
			try {
				const res = await createBooking({
					booking_listing_id: listing.id,
					start_date: bookingInfo.checkIn,
					end_date: bookingInfo.checkOut,
					guests: bookingInfo.guests,
					payment_method: "card",
					...(bookingInfo.room_type_id ? { room_type_id: bookingInfo.room_type_id } : {}),
				});
				booking = res?.data ?? res;
			} catch (e) {
				setSubmitError(e?.response?.data?.message || "These dates are no longer available.");
				setSubmitting(false); return;
			}
			if (!booking?.booking_id) { setSubmitError("Unable to place booking. Please try again."); setSubmitting(false); return; }
			// 2) Pay — require Stripe success for paid stays; never treat missing clientSecret as paid (#1597).
			const intent = await createBookingIntent(booking.booking_id);
			const clientSecret = intent?.clientSecret ?? intent?.client_secret ?? intent?.data?.clientSecret;
			const amountDue = Number(intent?.amount ?? booking.total ?? quote?.total ?? NaN);
			if (!clientSecret) {
				if (Number.isFinite(amountDue) && amountDue <= 0) {
					onConfirm(booking.booking_id, booking.status === 'confirmed');
					return;
				}
				setSubmitError("Payment could not be started. Please try again.");
				setSubmitting(false);
				return;
			}
			const result = await stripe.confirmCardPayment(clientSecret, {
				payment_method: { card: elements.getElement(CardElement) },
			});
			if (result.error) { setSubmitError(result.error.message); setSubmitting(false); return; }
			onConfirm(booking.booking_id, booking.status === 'confirmed');
		} catch {
			setSubmitError("Unable to place booking. Please try again.");
			setSubmitting(false);
		}
	}
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 560, width: "100%", margin: "0 auto", paddingBottom: 24 }}>
				<button onClick={onBack} className="text-text-secondary" style={{ marginTop: 24, marginBottom: 20, display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}>
					<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					Back
				</button>
				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 24 }}>{i18n.t("common.confirmAndPay")}</h2>
				{/* Booking summary */}
				<div className="bg-surface border border-border-subtle" style={{ borderRadius: 16, padding: 20, marginBottom: 20 }}>
					<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{i18n.t("common.yourTrip")}</p>
					<div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
						<div style={{ flex: 1 }}>
							<p className="text-text-secondary" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginBottom: 2 }}>{i18n.t("common.checkIn")}</p>
							<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{bookingInfo.checkIn}</p>
						</div>
						<div style={{ flex: 1 }}>
							<p className="text-text-secondary" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginBottom: 2 }}>{i18n.t("floral.checkout")}</p>
							<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{bookingInfo.checkOut}</p>
						</div>
					</div>
					<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t(bookingInfo.nights === 1 ? "common.nightCount_one" : "common.nightCount_other", { count: bookingInfo.nights })} · {guestLabel(bookingInfo.guests, i18n.t.bind(i18n))}</p>
					<div className="bg-border-subtle" style={{ height: 1, margin: "14px 0" }} />
					<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{listing.name}</p>
					<p className="text-text-secondary" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{listing.location} · {i18n.t("tempstay.hostedBy", { host: listing.host })}</p>
				</div>
				{/* Price breakdown */}
				<div className="bg-surface border border-border-subtle" style={{ borderRadius: 16, padding: 20, marginBottom: 20 }}>
					<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{i18n.t("common.priceDetails")}</p>
					{(quote ? [
						{ label: `$${listing.priceNum} × ${bookingInfo.nights} night${bookingInfo.nights > 1 ? 's' : ''}`, val: quote.subtotal },
						{ label: "Cleaning fee", val: quote.cleaning_fee },
						{ label: "Service fee", val: quote.service_fee },
						...(quote.deposit ? [{ label: "Deposit", val: quote.deposit }] : []),
					] : feePreview.cleaningFee != null && feePreview.serviceFee != null ? [
						{ label: `$${listing.priceNum} × ${bookingInfo.nights} nights`, val: feePreview.subtotal },
						{ label: "Cleaning fee", val: feePreview.cleaningFee },
						{ label: "Service fee", val: feePreview.serviceFee },
					] : [
						{ label: `$${listing.priceNum} × ${bookingInfo.nights} nights`, val: feePreview.subtotal },
					]).map(r => (
						<div key={r.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
							<span className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{r.label}</span>
							<span className="text-text-primary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>${r.val}</span>
						</div>
					))}
					<div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
						<span className="text-text-primary" style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("tempstay.totalCad")}</span>
						<span className="text-text-primary" style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{total != null ? `$${total}` : "—"}</span>
					</div>
					{quoteFailed && <p style={{ fontSize: 12, color: "#f87171", fontFamily: "'DM Sans', sans-serif", marginTop: 10 }}>Could not load server quote.</p>}
				</div>
				{/* Referral code */}
				<div className="bg-surface border border-border-subtle" style={{ borderRadius: 16, padding: 20, marginBottom: 20 }}>
					<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{i18n.t("tempstay.referralCode")}</p>
					<div style={{ display: "flex", gap: 10 }}>
						<input
							value={refCode}
							onChange={e => { setRefCode(e.target.value); setRefApplied(false); setRefError(null); }}
							placeholder={i18n.t("tempstay.referralPlaceholder")}
							className="bg-surface-raised border border-border text-text-primary"
							style={{ flex: 1, borderRadius: 9, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", caretColor: "#2563eb" }}
						/>
						<button
							type="button"
							onClick={async () => {
								if (!refCode.trim() || refLoading || refApplied) return;
								setRefLoading(true);
								setRefError(null);
								try {
									await bindCheckoutReferralCode(refCode.trim());
									setRefApplied(true);
								} catch (e) {
									setRefError(e?.response?.data?.message || i18n.t("tempstay.invalidReferral"));
								} finally {
									setRefLoading(false);
								}
							}}
							className={refApplied ? "" : refCode.trim() ? "" : "border border-border"}
							style={{
								padding: "10px 16px",
								background: refApplied ? "rgba(16,185,129,0.15)" : refCode.trim() ? "#2563eb" : "var(--color-surface-raised)",
								border: refApplied ? "1px solid rgba(16,185,129,0.35)" : refCode.trim() ? "none" : undefined,
								borderRadius: 9,
								fontFamily: "'DM Sans', sans-serif",
								fontWeight: 700,
								fontSize: 13,
								color: refApplied ? "#10b981" : refCode.trim() ? "#fff" : "var(--color-text-muted)",
								cursor: (!refCode.trim() || refLoading) ? "default" : "pointer",
								whiteSpace: "nowrap",
							}}
						>
							{refLoading ? "…" : refApplied ? i18n.t("tempstay.referralApplied") : i18n.t("common.apply")}
						</button>
					</div>
					{refError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginTop: 8 }}>{refError}</p>}
				</div>
				{/* Payment */}
				<div className="bg-surface border border-border-subtle" style={{ borderRadius: 16, padding: 20, marginBottom: 24 }}>
					<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>{i18n.t("common.paymentMethod")}</p>
					<div className="bg-surface-raised border border-border" style={{ borderRadius: 10, padding: "14px" }}>
						<CardElement options={cardElementOptions} />
					</div>
				</div>
				{submitError && <p style={{ fontSize: 12, color: "#ef4444", fontFamily: "'DM Sans', sans-serif", marginBottom: 10, textAlign: "center" }}>{submitError}</p>}
				<button onClick={handleConfirm} disabled={submitting || quoteUnavailable || quoteFailed || total == null} style={{ width: "100%", background: (submitting || quoteUnavailable || quoteFailed || total == null) ? "rgba(37,99,235,0.5)" : "#2563eb", border: "none", borderRadius: 14, padding: "16px 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700, cursor: (submitting || quoteUnavailable || quoteFailed || total == null) ? "default" : "pointer" }}>
					{submitting ? "Placing booking…" : quoteUnavailable ? "Dates unavailable" : quoteFailed || total == null ? "Quote unavailable" : `Confirm booking · $${total}`}
				</button>
			</div>
		</div>
	);
}

function guestBookingStatusMeta(rawStatus, isInstantFallback) {
	const s = String(rawStatus || "").toLowerCase();
	if (s === "confirmed") return { label: "Booking confirmed", color: "#10b981" };
	if (s === "in_progress") return { label: "Checked in", color: "#a78bfa" };
	if (s === "completed") return { label: "Stay completed", color: "#60a5fa" };
	if (s === "declined") return { label: "Declined by host", color: "#ef4444" };
	if (s === "cancelled" || s === "canceled") return { label: "Cancelled", color: "#ef4444" };
	if (s === "awaiting_host" || s === "requested" || s === "pending") {
		return { label: "Awaiting host confirmation", color: "#f59e0b" };
	}
	if (isInstantFallback) return { label: "Booking confirmed", color: "#10b981" };
	return { label: "Awaiting host confirmation", color: "#f59e0b" };
}

function TempStayConfirmPage({ listing, bookingInfo, onDone, orderId, isInstant }) {
	const [showRateModal, setShowRateModal] = React.useState(false);
	const [rating, setRating] = React.useState(0);
	const [ratingComment, setRatingComment] = React.useState("");
	const [rated, setRated] = React.useState(false);
	const [rateNotice, setRateNotice] = React.useState("");
	const [rateError, setRateError] = React.useState("");
	const [rateSubmitting, setRateSubmitting] = React.useState(false);
	const [liveStatus, setLiveStatus] = React.useState(isInstant ? "confirmed" : "awaiting_host");
	const [code] = useState(() => orderId ? `ORD-${orderId}`.slice(0, 12).toUpperCase() : "STG-" + Math.random().toString(36).slice(2,8).toUpperCase());
	// Keep guest status in sync with host Accept / Check in / Complete (confirm page used to freeze).
	React.useEffect(() => {
		if (!orderId) return undefined;
		let cancelled = false;
		let attempts = 0;
		const TERMINAL = new Set(["completed", "declined", "cancelled", "canceled"]);
		const MAX_POLLS = 60;
		let id;
		const pull = () => {
			if (cancelled) return;
			attempts += 1;
			getBooking(orderId)
				.then((res) => {
					const row = res?.data ?? res;
					const status = row?.status ? String(row.status).toLowerCase() : "";
					if (!cancelled && status) setLiveStatus(status);
					if (!cancelled && row?.booking_review) setRated(true);
					if (TERMINAL.has(status) || attempts >= MAX_POLLS) clearInterval(id);
				})
				.catch(() => {
					if (attempts >= MAX_POLLS) clearInterval(id);
				});
		};
		pull();
		id = setInterval(pull, 4000);
		return () => {
			cancelled = true;
			clearInterval(id);
		};
	}, [orderId]);
	const statusMeta = guestBookingStatusMeta(liveStatus, isInstant);
	const headlineConfirmed = ["confirmed", "in_progress", "completed"].includes(String(liveStatus || "").toLowerCase())
		|| (!liveStatus && isInstant);
	// Rate only after host marks the stay Complete (status === completed).
	const canRateHost = String(liveStatus || "").toLowerCase() === "completed" && !!orderId;
	const submitReview = async () => {
		if (!orderId || rating === 0 || rateSubmitting) return;
		setRateSubmitting(true);
		setRateError("");
		try {
			await submitBookingReview(orderId, { rating, comment: ratingComment.trim() || undefined });
			setShowRateModal(false);
			setRated(true);
			setRateNotice(i18n.t("common.ratingThanks", { defaultValue: "Thanks for your feedback." }));
		} catch (err) {
			const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message;
			if (/completed before rating/i.test(String(msg))) {
				setRateError(i18n.t("common.rateAfterStay", { defaultValue: "You can leave a verified rating after your stay is marked complete." }));
			} else {
				setRateError(String(msg || i18n.t("common.ratingSubmitFailed", { defaultValue: "Couldn't save your rating. Try again later." })));
			}
		} finally {
			setRateSubmitting(false);
		}
	};
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 32px", overflowY: "auto" }}>
			<div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
				<div style={{ width: 72, height: 72, borderRadius: "50%", background: headlineConfirmed ? "rgba(16,185,129,0.15)" : "rgba(37,99,235,0.15)", border: `2px solid ${headlineConfirmed ? "#10b981" : "#2563eb"}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
					<svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={headlineConfirmed ? "#10b981" : "#2563eb"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				</div>
				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8 }}>{headlineConfirmed ? `${i18n.t("common.bookingConfirmed")}!` : "Request submitted"}</h2>
				<p className="text-text-secondary" style={{ fontSize: 14, fontFamily: "'DM Sans', sans-serif", marginBottom: 28 }}>{i18n.t("tempstay.reservationSent")}</p>
				{/* Reservation card */}
				<div className="bg-surface border border-border" style={{ borderRadius: 18, padding: 24, textAlign: "left", marginBottom: 20 }}>
					{(() => {
						const cover =
							(typeof listing.image === "string" && listing.image.startsWith("http") && listing.image)
							|| (typeof listing.thumb === "string" && listing.thumb.startsWith("http") && listing.thumb)
							|| (Array.isArray(listing.images) && listing.images.find((u) => typeof u === "string" && u.startsWith("http")))
							|| null;
						const fallbackBg =
							(typeof listing.thumb === "string" && listing.thumb.includes("gradient") && listing.thumb)
							|| listing.thumbGradient
							|| listing.gradient
							|| "linear-gradient(135deg, #1e3a5f, #0f2744)";
						return (
							<div style={{ height: 120, borderRadius: 12, background: cover ? "#0f0f1a" : fallbackBg, marginBottom: 16, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
								{cover ? (
									<img src={cover} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
								) : (
									<svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
								)}
							</div>
						);
					})()}
					<p className="text-text-primary" style={{ fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{listing.name}</p>
					<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>{listing.location}{listing.host ? ` · ${i18n.t("tempstay.hostedBy", { host: listing.host })}` : ""}</p>
					<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
						{[
							{ label: i18n.t("common.checkIn"), val: bookingInfo.checkIn },
							{ label: i18n.t("floral.checkout"), val: bookingInfo.checkOut },
							{ label: i18n.t("common.guests"), val: guestLabel(bookingInfo.guests, i18n.t.bind(i18n)) },
							{ label: i18n.t("rideshare.duration"), val: i18n.t(bookingInfo.nights === 1 ? "common.nightCount_one" : "common.nightCount_other", { count: bookingInfo.nights }) },
						].map(r => (
							<div key={r.label}>
								<p className="text-text-muted" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{r.label}</p>
								<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{r.val}</p>
							</div>
						))}
					</div>
					<div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 16 }}>
						<p className="text-text-muted" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{i18n.t("common.bookingReference")}</p>
						<p style={{ fontSize: 18, fontWeight: 800, color: "#2563eb", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.12em" }}>{code}</p>
						<div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
							<div style={{ width: 7, height: 7, borderRadius: "50%", background: statusMeta.color }} />
							<span style={{ fontSize: 12, color: statusMeta.color, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>{statusMeta.label}</span>
						</div>
					</div>
				</div>
				{rateNotice && (
					<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#10b981", marginBottom: 12 }}>{rateNotice}</p>
				)}
				{canRateHost && !rated && (
					<button onClick={() => { setRateError(""); setShowRateModal(true); }} style={{ width: "100%", padding: "13px", background: "#2563eb", border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>{i18n.t("common.rateYourHost")} ★</button>
				)}
				{!canRateHost && !rated && (
					<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 12 }}>{i18n.t("common.rateHostAfterStay")}</p>
				)}
				<button onClick={onDone} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 14, padding: "14px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
					{i18n.t("tempstay.backToTrips")}
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
									<svg width={30} height={30} viewBox="0 0 24 24" fill={n <= rating ? "#f59e0b" : "none"} stroke={n <= rating ? "#f59e0b" : "rgba(255,255,255,0.3)"} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
								</button>
							))}
						</div>
						<textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder={i18n.t("common.optionalComment")} rows={3} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 16 }} />
						{rateError ? <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#fbbf24", marginBottom: 12, textAlign: "left" }}>{rateError}</p> : null}
						<div style={{ display: "flex", gap: 10 }}>
							<button onClick={() => { setShowRateModal(false); setRateError(""); }} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, padding: "11px 0", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{i18n.t("ondemand.hire.skip")}</button>
							<button disabled={rating === 0 || rateSubmitting} onClick={submitReview} style={{ flex: 1, padding: "11px 0", background: rating > 0 && !rateSubmitting ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: rating > 0 ? "#fff" : "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: rating > 0 && !rateSubmitting ? "pointer" : "default" }}>{rateSubmitting ? i18n.t("common.loading", { defaultValue: "Loading…" }) : i18n.t("common.submit")}</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function TempStayPage({ onNavigate, initialListingId } = {}) {
	const { t, landingTitle, searchPlaceholder } = usePageI18n("tempstay");
	const categories = useI18nCategoryList(TEMPSTAY_CATEGORY_DEFS);
	const { isMobile } = useViewport();
	const [activeCategory, setActiveCategory] = useState("all");
	const [query, setQuery] = useState("");
	const [browseCheckIn, setBrowseCheckIn] = useState("");
	const [browseCheckOut, setBrowseCheckOut] = useState("");
	const [browseGuests, setBrowseGuests] = useState(1);
	const [minPrice, setMinPrice] = useState("");
	const [maxPrice, setMaxPrice] = useState("");
	const [showMap, setShowMap] = useState(false);
	const [tsView, setTsView] = useState("landing");
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [tsView]);
	const loading = usePageLoad();

	const [listings, setListings] = useState(TEMPSTAY_LISTINGS);
	const [selectedListing, setSelectedListing] = useState(null);
	const [bookingInfo, setBookingInfo] = useState(null);
	const [orderId, setOrderId] = useState(null);
	const [isInstant, setIsInstant] = useState(false);
	const didTsColdLoad = useRef(false);

	// Phase 2: guest trips (list + cancel), isolated to tempstay vertical.
	const [mainTab, setMainTab] = useState("find"); // find | trips
	const [trips, setTrips] = useState([]);
	const [tripBucketFilter, setTripBucketFilter] = useState("all"); // all | upcoming | past | cancelled
	const [tripsLoading, setTripsLoading] = useState(false);
	const [tripsFetched, setTripsFetched] = useState(false);
	const [cancellingId, setCancellingId] = useState(null);
	const [tripError, setTripError] = useState("");
	const [rateTrip, setRateTrip] = useState(null);
	const [tripRating, setTripRating] = useState(0);
	const [tripRatingComment, setTripRatingComment] = useState("");
	const [tripRateError, setTripRateError] = useState("");
	const [tripRateSubmitting, setTripRateSubmitting] = useState(false);

	const loadTrips = () => {
		setTripsLoading(true);
		setTripError("");
		getBookings({ role: "guest", vertical: "tempstay" })
			.then((r) => {
				const arr = Array.isArray(r) ? r : (r?.data ?? []);
				setTrips(mapGuestBookingsToTempStayTrips(arr));
			})
			.catch(() => setTripError(t("tempstay.tripsLoadFailed")))
			.finally(() => { setTripsLoading(false); setTripsFetched(true); });
	};

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

	// #287: recently-viewed + saved searches (client-side).
	const [recentlyViewed, setRecentlyViewed] = useState(() => tsReadJson(TS_RECENT_KEY, []));
	const [savedSearches, setSavedSearches] = useState(() => tsReadJson(TS_SAVED_SEARCH_KEY, []));
	const openDetail = (listing) => {
		tsPushRecent(listing);
		setRecentlyViewed(tsReadJson(TS_RECENT_KEY, []));
		setSelectedListing(listing);
		setTsView("detail");
		window.history.pushState({ nav: 'tempstay' }, '', `/listing/host/${listing.id}-${slugify(listing.name)}`);
	};
	const saveCurrentSearch = () => {
		const entry = {
			id: `ss-${query.trim().toLowerCase()}-${activeCategory}-${browseGuests}-${minPrice}-${maxPrice}-${browseCheckIn}-${browseCheckOut}`,
			query: query.trim(),
			category: activeCategory,
			guests: browseGuests,
			minPrice,
			maxPrice,
			checkIn: browseCheckIn,
			checkOut: browseCheckOut,
			alert: true,
		};
		const active = browseFiltersActive({
			query: entry.query,
			category: entry.category,
			minPrice: entry.minPrice,
			maxPrice: entry.maxPrice,
			minGuests: entry.guests,
			checkIn: entry.checkIn,
			checkOut: entry.checkOut,
		});
		if (!active) return;
		const next = [entry, ...savedSearches.filter(s => s.id !== entry.id)].slice(0, 10);
		setSavedSearches(next);
		try { localStorage.setItem(TS_SAVED_SEARCH_KEY, JSON.stringify(next)); } catch { /* quota */ }
	};
	const applySavedSearch = (s) => {
		setQuery(s.query || "");
		setActiveCategory(s.category || "all");
		if (s.guests != null) setBrowseGuests(Number(s.guests) || 1);
		if (s.minPrice != null) setMinPrice(s.minPrice === "" || s.minPrice == null ? "" : String(s.minPrice));
		if (s.maxPrice != null) setMaxPrice(s.maxPrice === "" || s.maxPrice == null ? "" : String(s.maxPrice));
		if (s.checkIn != null) setBrowseCheckIn(s.checkIn || "");
		if (s.checkOut != null) setBrowseCheckOut(s.checkOut || "");
	};
	const removeSavedSearch = (id) => { const next = savedSearches.filter(s => s.id !== id); setSavedSearches(next); try { localStorage.setItem(TS_SAVED_SEARCH_KEY, JSON.stringify(next)); } catch { /* quota */ } };
	const toggleSavedSearchAlert = (id) => { const next = savedSearches.map(s => s.id === id ? { ...s, alert: !s.alert } : s); setSavedSearches(next); try { localStorage.setItem(TS_SAVED_SEARCH_KEY, JSON.stringify(next)); } catch { /* quota */ } };

	// Fetch a listing by id and open its detail view. Shared by the cold-load deep link and the
	// browser back/forward handler so a /listing/host/:id URL always resolves to the real detail.
	const openListingById = (id) => {
		if (!id) return;
		getBookingListing(id, { vertical: "tempstay" }).then(res => {
			const l = res?.data ?? res;
			if (!l) return;
			// Isolation: never open hotel/venue/etc. under Temp Stay chrome (#1607).
			if (l.vertical && l.vertical !== "tempstay") return;
			const a = l.attributes ?? {};
			const imgs = mediaUrls(l.images);
			const coords = parseListingCoords(a, l);
			const mapped = {
				id: l.booking_listing_id ?? l.listing_id ?? l.id,
				name: l.title ?? l.name ?? 'Listing',
				host: a.host ?? l.host_name ?? 'Host',
				avatar: (a.host ?? l.host_name ?? 'H')[0].toUpperCase(),
				avatarColor: '#2563eb',
				location: l.location ?? l.address ?? '',
				priceNum: parseFloat(l.price ?? l.amount ?? 0),
				rating: (() => {
					const raw = l.avg_rating ?? a.rating;
					const n = raw != null && raw !== "" ? Number(raw) : NaN;
					return Number.isFinite(n) ? n : null;
				})(),
				reviews: Number(l.review_count ?? a.review_count ?? a.reviews) || 0,
				guests: a.max_guests ?? a.guests ?? null,
				beds: a.beds ?? a.bedrooms ?? 1,
				category: resolveTempStayCategory(a),
				superhost: a.is_superhost ?? false,
				badge: a.badge ?? null,
				lat: coords.lat,
				lng: coords.lng,
				thumb: imgs[0] ?? null,
				thumbGradient: 'linear-gradient(135deg, #1e3a5f, #0f2744)',
				images: imgs,
				description: l.description ?? null,
				rules: a.house_rules ?? a.rules ?? null,
				check_in_time: a.check_in_time ?? null,
				check_out_time: a.check_out_time ?? null,
				cancellation_policy: a.cancellation_policy ?? null,
				amenities: Array.isArray(a.amenities) ? a.amenities : null,
				cleaning_fee: l.cleaning_fee ?? a.cleaning_fee ?? null,
				service_fee_pct: l.service_fee_pct ?? a.service_fee_pct ?? null,
				host_user_id: l.owner_id ?? l.user_id ?? null,
				instant_booking: l.instant_book ?? l.instant_booking ?? false,
			};
			tsPushRecent(mapped);
			setRecentlyViewed(tsReadJson(TS_RECENT_KEY, []));
			setSelectedListing(mapped);
			setTsView("detail");
		}).catch(() => {});
	};

	// Open the deep-linked listing on mount. Read the id from the CURRENT URL (not just the
	// initialListingId prop) so the detail is also restored when this page remounts after Back from
	// another section onto a /listing/host/:id entry — the prop is a cold-load-only seed that
	// navigateTo clears. Plain /tempstay (tok null) → show the grid.
	useEffect(() => {
		const consumeListingHandoff = () => {
			const handoff = typeof window !== "undefined" ? window.__tempstayOpenListingId : null;
			if (!handoff) return;
			try { delete window.__tempstayOpenListingId; } catch { /* noop */ }
			openListingById(handoff);
		};
		consumeListingHandoff();
		window.addEventListener("strug:open-notification-target", consumeListingHandoff);
		return () => window.removeEventListener("strug:open-notification-target", consumeListingHandoff);
	}, []);  

	useEffect(() => {
		const tok = window.location.pathname.match(/^\/listing\/host\/([^/-]+)/)?.[1] || initialListingId;
		if (!tok || didTsColdLoad.current) return;
		didTsColdLoad.current = true;
		openListingById(tok);
	}, [initialListingId]);  

	// Popstate: keep the open listing in sync with browser history. Back/forward that leaves the
	// /listing/host/:id URL closes the detail; back/forward that RE-ENTERS one re-opens that listing
	// (previously only closed → Forward left you stuck on the grid, and a shared/deep listing entry
	// couldn't be restored: #186, #284).
	const tsSelectedRef = useRef(null);
	useEffect(() => { tsSelectedRef.current = selectedListing; }, [selectedListing]);
	useEffect(() => {
		const handler = () => {
			const m = window.location.pathname.match(/^\/listing\/host\/([^/-]+)/);
			if (!m) { setTsView("landing"); setSelectedListing(null); return; }
			const id = m[1];
			if (String(tsSelectedRef.current?.id ?? "") === id) return;
			openListingById(id);
		};
		window.addEventListener('popstate', handler);
		return () => window.removeEventListener('popstate', handler);
	}, []);

	useEffect(() => {
		const mapListing = (l) => {
			const a = l.attributes ?? {};
			const imgs = mediaUrls(l.images);
			const coords = parseListingCoords(a, l);
			return {
				id: l.booking_listing_id ?? l.listing_id ?? l.id,
				name: l.title ?? l.name ?? 'Listing',
				host: a.host ?? l.host_name ?? 'Host',
				avatar: (a.host ?? l.host_name ?? 'H')[0].toUpperCase(),
				avatarColor: '#2563eb',
				location: l.location ?? l.address ?? '',
				priceNum: parseFloat(l.price ?? l.amount ?? 0),
				rating: (() => {
					const raw = l.avg_rating ?? a.rating;
					const n = raw != null && raw !== "" ? Number(raw) : NaN;
					return Number.isFinite(n) ? n : null;
				})(),
				reviews: Number(l.review_count ?? a.review_count ?? a.reviews) || 0,
				guests: a.max_guests ?? a.guests ?? null,
				beds: a.beds ?? a.bedrooms ?? 1,
				category: resolveTempStayCategory(a),
				superhost: a.is_superhost ?? false,
				badge: a.badge ?? null,
				lat: coords.lat,
				lng: coords.lng,
				thumb: imgs[0] ?? null,
				thumbGradient: 'linear-gradient(135deg, #1e3a5f, #0f2744)',
				images: imgs,
				description: l.description ?? null,
				rules: a.house_rules ?? a.rules ?? null,
				check_in_time: a.check_in_time ?? null,
				check_out_time: a.check_out_time ?? null,
				cancellation_policy: a.cancellation_policy ?? null,
				amenities: Array.isArray(a.amenities) ? a.amenities : null,
				cleaning_fee: l.cleaning_fee ?? a.cleaning_fee ?? null,
				service_fee_pct: l.service_fee_pct ?? a.service_fee_pct ?? null,
				host_user_id: l.owner_id ?? l.user_id ?? null,
				instant_booking: l.instant_book ?? l.instant_booking ?? false,
			};
		};
		const handle = setTimeout(() => {
			const params = buildTempStayListingsQuery({
				q: query,
				minPrice,
				maxPrice,
				minGuests: browseGuests,
			});
			getBookingListings(params).then(data => {
				const arr = Array.isArray(data) ? data : (data?.data ?? data?.listings ?? []);
				const mapped = arr.map(mapListing);
				setListings(mapped);
				const liveIds = new Set(mapped.map(m => String(m.id)));
				const cur = tsReadJson(TS_RECENT_KEY, []);
				const pruned = cur.filter(r => liveIds.has(String(r.id)));
				if (pruned.length !== cur.length) {
					try { localStorage.setItem(TS_RECENT_KEY, JSON.stringify(pruned)); } catch { /* quota */ }
					setRecentlyViewed(pruned);
				}
			}).catch(() => {});
		}, 280);
		return () => clearTimeout(handle);
	}, [query, minPrice, maxPrice, browseGuests]);
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
	}, [tsView]);

	const filtered = filterTempStayListings(listings, {
		category: activeCategory,
		categories,
		query,
		minPrice,
		maxPrice,
		minGuests: browseGuests,
		matchesCategoryFn: matchesCategory,
	});
	const filtersOn = browseFiltersActive({
		query,
		category: activeCategory,
		minPrice,
		maxPrice,
		minGuests: browseGuests,
		checkIn: browseCheckIn,
		checkOut: browseCheckOut,
	});
	const filteredListingIds = useMemo(
		() => filtered.map((l) => l.id).filter(Boolean).join("|"),
		[filtered],
	);
	const browseDatesValid = Boolean(browseCheckIn && browseCheckOut
		&& new Date(`${browseCheckOut.slice(0, 10)}T12:00:00`) > new Date(`${browseCheckIn.slice(0, 10)}T12:00:00`));
	const [browseDateConflicts, setBrowseDateConflicts] = useState(() => new Set());
	useEffect(() => {
		if (!browseDatesValid) {
			setBrowseDateConflicts(new Set());
			return;
		}
		// There is no bulk availability endpoint, so this is one GET per card. Cap the
		// fan-out to the cards a guest can actually see without scrolling far, and debounce
		// it so typing in the date picker can't fire a burst per keystroke.
		const ids = filtered.map((l) => l.id).filter(Boolean).slice(0, BROWSE_AVAILABILITY_PROBE_LIMIT);
		if (!ids.length) {
			setBrowseDateConflicts(new Set());
			return;
		}
		let alive = true;
		const timer = setTimeout(() => {
			Promise.all(
				ids.map((id) =>
					getListingAvailability(id)
						.then((res) => ({
							id: String(id),
							conflict: stayRangeConflicts(browseCheckIn, browseCheckOut, buildUnavailableNightSet(res)),
						}))
						.catch(() => ({ id: String(id), conflict: false })),
				),
			).then((results) => {
				if (!alive) return;
				setBrowseDateConflicts(new Set(results.filter((r) => r.conflict).map((r) => r.id)));
			});
		}, 300);
		return () => { alive = false; clearTimeout(timer); };
	}, [browseCheckIn, browseCheckOut, browseDatesValid, filteredListingIds]);

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 32, overflow: "hidden" }}>
			<div style={{ width: "100%", overflow: "hidden" }}>
				{/* heading row */}
				<div style={{ padding: "28px 0 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<SkeletonHeading />
					<div style={{ display: "flex", gap: 8 }}>
						<Skel w={110} h={34} r={20} />
						<Skel w={100} h={34} r={20} />
					</div>
				</div>
				{/* search bar */}
				<Skel h={52} r={14} style={{ marginBottom: 20, width: "min(680px,100%)" }} />
				{/* category bubbles */}
				<div style={{ display: "flex", gap: 20, marginBottom: 24 }}>
					{[...Array(7)].map((_,i) => <SkeletonCircle key={i} />)}
				</div>
				{/* cards */}
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
					{[...Array(6)].map((_,i) => <SkeletonTempStayCard key={i} />)}
				</div>
			</div>
		</div>
	);

	if (tsView === "detail" && selectedListing) return (
		<TempStayDetailPage
			key={`${selectedListing.id}-${browseCheckIn}-${browseCheckOut}-${browseGuests}`}
			listing={selectedListing}
			initialCheckIn={browseCheckIn}
			initialCheckOut={browseCheckOut}
			initialGuests={browseGuests}
			onBack={() => { setTsView("landing"); setSelectedListing(null); window.history.pushState({ nav: 'tempstay' }, '', '/tempstay'); }}
			onBook={info => { setBookingInfo(info); setTsView("checkout"); }}
		/>
	);
	if (tsView === "checkout" && selectedListing) return <TempStayCheckoutPage listing={selectedListing} bookingInfo={bookingInfo} onBack={() => setTsView("detail")} onConfirm={async (id, instant) => {
		setOrderId(id);
		setIsInstant(!!instant);
		setTsView("confirm");
		if (id && selectedListing?.host_user_id) {
			const nights = bookingInfo?.nights ?? 1;
			await messageUser(selectedListing.host_user_id, {
				initialMessage: `Hi! I just booked your property "${selectedListing?.name ?? 'your listing'}" for ${nights} night${nights > 1 ? 's' : ''} (${bookingInfo?.checkIn ?? ''} → ${bookingInfo?.checkOut ?? ''}). Looking forward to my stay!`,
				navigate: false,
				sourceVertical: "tempstay",
			}).catch(() => {});
		}
	}} />;
	if (tsView === "confirm" && selectedListing) return <TempStayConfirmPage listing={selectedListing} bookingInfo={bookingInfo} orderId={orderId} isInstant={isInstant} onDone={() => {
		setTsView("landing");
		setSelectedListing(null);
		setBookingInfo(null);
		setOrderId(null);
		setIsInstant(false);
		setMainTab("trips");
		setTripsFetched(false);
		loadTrips();
	}} />;

	const mapEl = (
		<MapContainer
			center={[46, -90]}
			zoom={3}
			style={{ flex: 1, minHeight: isMobile ? 0 : 400 }}
			scrollWheelZoom
			attributionControl={false}
		>
			<TileLayer
				url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
				attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
			/>
			<TempStayMapBounds listings={filtered.filter(listingHasMapCoords)} />
			{filtered.filter(listingHasMapCoords).map(listing => (
				<Marker
					key={listing.id ?? listing.name}
					position={[listing.lat, listing.lng]}
					icon={L.divIcon({
						className: "",
						html: `<div style="transform:translate(-50%,-100%);cursor:pointer;"><div style="background:#2563eb;border-radius:8px;padding:4px 9px;font-family:'DM Sans',sans-serif;font-weight:700;font-size:12px;color:#fff;white-space:nowrap;box-shadow:0 2px 12px rgba(37,99,235,0.5);">$${listing.priceNum}</div><div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #2563eb;margin:0 auto;"></div></div>`,
						iconSize: [0, 0],
						iconAnchor: [0, 0],
						popupAnchor: [12, -8],
					})}
				>
					<Popup>
						<div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5 }}>
							<strong style={{ display: "block", marginBottom: 2 }}>{listing.name}</strong>
							<span style={{ color: "#666" }}>{listing.location}</span>
							<strong style={{ display: "block", marginTop: 4, color: "#2563eb" }}>${listing.priceNum}/night</strong>
						</div>
					</Popup>
				</Marker>
			))}
		</MapContainer>
	);

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 32, overflow: "hidden" }}>
			<div style={{ flex: 1, display: "flex", gap: 0, overflow: "hidden" }}>
				{/* Left panel */}
				<div style={{ flex: 1, display: "flex", flexDirection: "column", width: "100%", overflowY: "auto", minHeight: 0 }}>
					<div style={{ padding: "28px 0 16px", animation: "fadeUp 0.3s ease both", position: "sticky", top: 0, zIndex: 10, background: "var(--color-bg)" }}>
						<div style={{ textAlign: "center", marginBottom: 16 }}>
							<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10 }}>{landingTitle}</h1>
							<div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
								<button onClick={() => onNavigate && onNavigate("sd-host")} className="bg-surface-raised border border-border text-text-secondary" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 20, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
									<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
									Become a Host
								</button>
								{mainTab === "find" && (
									<button onClick={() => setShowMap(v => !v)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 20, background: showMap ? "#2563eb" : "rgba(255,255,255,0.08)", border: `1px solid ${showMap ? "#2563eb" : "rgba(255,255,255,0.15)"}`, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>
										<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
										{showMap ? "Hide map" : "Show map"}
									</button>
								)}
							</div>
							<div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14 }}>
								{["find", "trips"].map((tabKey) => (
									<button
										key={tabKey}
										onClick={() => {
											setMainTab(tabKey);
											if (tabKey === "trips") {
												setShowMap(false);
												if (!tripsFetched) loadTrips();
											}
										}}
										style={{
											padding: "8px 22px", borderRadius: 20,
											border: `1px solid ${mainTab === tabKey ? "#2563eb" : "rgba(255,255,255,0.12)"}`,
											background: mainTab === tabKey ? "#2563eb18" : "transparent",
											color: mainTab === tabKey ? "#2563eb" : "rgba(255,255,255,0.5)",
											fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
										}}
									>
										{tabKey === "find" ? t("tempstay.findStays") : t("tempstay.myTrips")}
									</button>
								))}
							</div>
						</div>
						{mainTab === "find" && (
						<>
						{/* Search bar */}
						<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
							<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "0 18px", gap: 12, height: 52, boxSizing: "border-box" }}>
								<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={18} /></div>
								<input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 14, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} />
								{(query.trim() || activeCategory !== "all" || filtersOn) && (
									<button onClick={saveCurrentSearch} title={t("tempstay.saveSearch")} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 18, padding: "6px 12px", color: "#60a5fa", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
										<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
										{t("tempstay.saveSearch")}
									</button>
								)}
							</div>
							<div data-testid="tempstay-browse-filters" style={{ width: "min(680px, 100%)", margin: "12px auto 0", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "center" }}>
								<input type="date" aria-label={t("common.checkIn")} value={browseCheckIn} onChange={(e) => setBrowseCheckIn(e.target.value)} className="bg-surface-raised border border-border text-text-primary" style={{ borderRadius: 10, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, colorScheme: "dark", outline: "none" }} />
								<input type="date" aria-label={i18n.t("floral.checkout")} value={browseCheckOut} onChange={(e) => setBrowseCheckOut(e.target.value)} className="bg-surface-raised border border-border text-text-primary" style={{ borderRadius: 10, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, colorScheme: "dark", outline: "none" }} />
								<div className="bg-surface-raised border border-border" style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 10, padding: "6px 10px" }}>
									<span className="text-text-secondary" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("common.guests")}</span>
									<button type="button" onClick={() => setBrowseGuests((g) => Math.max(1, g - 1))} className="border border-border text-text-primary" style={{ width: 24, height: 24, borderRadius: "50%", background: "none", cursor: "pointer" }}>−</button>
									<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", minWidth: 14, textAlign: "center" }}>{browseGuests}</span>
									<button type="button" onClick={() => setBrowseGuests((g) => Math.min(16, g + 1))} style={{ width: 24, height: 24, borderRadius: "50%", border: "none", background: "#2563eb", color: "#fff", cursor: "pointer" }}>+</button>
								</div>
								<input type="number" min="0" placeholder={t("tempstay.minPrice")} value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="bg-surface-raised border border-border text-text-primary" style={{ width: 88, borderRadius: 10, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, outline: "none" }} />
								<input type="number" min="0" placeholder={t("tempstay.maxPrice")} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="bg-surface-raised border border-border text-text-primary" style={{ width: 88, borderRadius: 10, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, outline: "none" }} />
								{filtersOn && (
									<button type="button" onClick={() => { setQuery(""); setActiveCategory("all"); setBrowseCheckIn(""); setBrowseCheckOut(""); setBrowseGuests(1); setMinPrice(""); setMaxPrice(""); }} className="border border-border bg-surface-raised text-text-secondary" style={{ padding: "8px 12px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
										{t("tempstay.clearFilters")}
									</button>
								)}
							</div>
							{(browseCheckIn || browseCheckOut) && (
								<p className="text-text-muted" style={{ width: "min(680px, 100%)", margin: "8px auto 0", fontFamily: "'DM Sans', sans-serif", fontSize: 11, textAlign: "center" }}>{t("tempstay.datesFilterHint")}</p>
							)}
							{savedSearches.length > 0 && (
								<div style={{ width: "min(680px, 100%)", margin: "10px auto 0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("tempstay.savedSearches")}</span>
									{savedSearches.map(s => (
										<span key={s.id} className="bg-surface-raised border border-border" style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 18, padding: "4px 6px 4px 12px" }}>
											<button onClick={() => applySavedSearch(s)} className="text-text-secondary" style={{ background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>{s.query || tempstayCategoryLabel(s.category, t)}</button>
											<button onClick={() => toggleSavedSearchAlert(s.id)} title={s.alert ? t("tempstay.alertsOn") : t("tempstay.alertsOff")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: s.alert ? "#60a5fa" : "rgba(255,255,255,0.3)" }}>
												<svg width={13} height={13} viewBox="0 0 24 24" fill={s.alert ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
											</button>
											<button onClick={() => removeSavedSearch(s.id)} className="text-text-muted" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
												<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
											</button>
										</span>
									))}
								</div>
							)}
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
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 0" }}>{t("tempstay.loadingTrips")}</p>
							) : filterTripsByBucket(trips, tripBucketFilter).length === 0 ? (
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 0" }}>{t("tempstay.noTrips")}</p>
							) : (
								<div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720, margin: "0 auto" }}>
									{filterTripsByBucket(trips, tripBucketFilter).map((trip) => {
										const statusColor = trip.status === "confirmed" || trip.status === "in_progress"
											? "#22c55e"
											: trip.status === "cancelled" || trip.status === "declined"
												? "#ef4444"
												: "#f59e0b";
										return (
											<div key={trip.booking_id} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-subtle)", borderRadius: 14, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
												<div style={{ flex: 1, minWidth: 180 }}>
													<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "var(--color-text-primary)" }}>{trip.title}</p>
													<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
														{[trip.location, trip.start_date && trip.end_date ? `${trip.start_date} → ${trip.end_date}` : null, trip.guests != null ? guestLabel(trip.guests, t) : null].filter(Boolean).join(" · ")}
													</p>
													{trip.total != null && (
														<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>${Number(trip.total).toLocaleString()}</p>
													)}
												</div>
												<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
													<span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: `${statusColor}22`, color: statusColor, textTransform: "capitalize" }}>{trip.status?.replace(/_/g, " ")}</span>
													{trip.listing_id && (
														<button
															type="button"
															onClick={() => openListingById(trip.listing_id)}
															className="border border-border bg-surface-raised text-text-secondary"
															style={{ padding: "6px 12px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
														>
															{t("tempstay.viewListing")}
														</button>
													)}
													{trip.can_rate && (
														<button
															type="button"
															onClick={() => openTripRate(trip)}
															style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
														>
															{t("common.rateYourHost")} ★
														</button>
													)}
													{trip.can_cancel && (
														<button
															type="button"
															disabled={cancellingId === trip.booking_id}
															onClick={() => handleCancelTrip(trip)}
															style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.12)", color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: cancellingId === trip.booking_id ? "default" : "pointer", opacity: cancellingId === trip.booking_id ? 0.6 : 1 }}
														>
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
					<div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 24, animation: "fadeUp 0.35s ease 60ms both", flexShrink: 0 }}>
						<button
							onClick={() => catScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })}
							className={catScrollState.atStart ? "text-text-muted" : "text-text-primary"}
							style={{
								flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16,
								background: catScrollState.atStart ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.08)",
								border: `1px solid ${catScrollState.atStart ? "var(--color-border-subtle)" : "rgba(255,255,255,0.18)"}`,
								cursor: catScrollState.atStart ? "default" : "pointer",
								display: "flex", alignItems: "center", justifyContent: "center",
								visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible",
								pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto",
								transition: "transform 0.12s, background 0.2s, box-shadow 0.15s",
							}}
							onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; e.currentTarget.style.background = catScrollState.atStart ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.16)"; }}
							onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = catScrollState.atStart ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.08)"; }}
							onMouseDown={e => { e.currentTarget.style.transform = "scale(0.88)"; }}
							onMouseUp={e => { e.currentTarget.style.transform = "scale(1.15)"; }}
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
							style={{
								flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16,
								background: catScrollState.atEnd ? "rgba(255,255,255,0.03)" : "#2563eb",
								border: `1px solid ${catScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`,
								color: catScrollState.atEnd ? "var(--color-text-muted)" : "#fff",
								cursor: catScrollState.atEnd ? "default" : "pointer",
								display: "flex", alignItems: "center", justifyContent: "center",
								visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible",
								pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto",
								transition: "transform 0.12s, background 0.2s, box-shadow 0.15s",
								boxShadow: catScrollState.atEnd ? "none" : "0 2px 14px rgba(37,99,235,0.55)",
							}}
							onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; e.currentTarget.style.background = catScrollState.atEnd ? "rgba(255,255,255,0.08)" : "#3b82f6"; e.currentTarget.style.boxShadow = catScrollState.atEnd ? "none" : "0 4px 22px rgba(37,99,235,0.8)"; }}
							onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = catScrollState.atEnd ? "rgba(255,255,255,0.03)" : "#2563eb"; e.currentTarget.style.boxShadow = catScrollState.atEnd ? "none" : "0 2px 14px rgba(37,99,235,0.55)"; }}
							onMouseDown={e => { e.currentTarget.style.transform = "scale(0.88)"; }}
							onMouseUp={e => { e.currentTarget.style.transform = "scale(1.15)"; }}
						>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
						</button>
					</div>
					{/* #287 recently-viewed row — only on the unfiltered landing to avoid clutter. */}
					{recentlyViewed.length > 0 && !showMap && !query.trim() && activeCategory === "all" && (
						<div style={{ marginBottom: 28 }}>
							<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
								<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>{t("tempstay.recentlyViewed")}</h3>
								<button onClick={() => { try { localStorage.removeItem(TS_RECENT_KEY); } catch { /* noop */ } setRecentlyViewed([]); }} className="text-text-secondary" style={{ background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer", padding: 0 }}>{t("tempstay.clear")}</button>
							</div>
							<div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none" }}>
								{recentlyViewed.map((r) => (
									<div key={r.id} onClick={() => openDetail(r)} style={{ flexShrink: 0, width: 220, cursor: "pointer" }}>
										<div style={{ width: "100%", height: 130, borderRadius: 12, marginBottom: 8, overflow: "hidden", background: r.thumb && r.thumb.startsWith("http") ? `center/cover url(${r.thumb})` : (r.thumb || "linear-gradient(135deg, #1e3a5f, #0f2744)") }} />
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</p>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{r.location}{r.priceNum ? ` · $${r.priceNum}/night` : ""}</p>
									</div>
								))}
							</div>
						</div>
					)}
					<div style={{ paddingBottom: 24 }}>
						{filtered.length === 0 ? (
							<p data-testid="tempstay-empty-filters" className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, textAlign: "center", padding: "48px 16px" }}>
								{filtersOn ? t("tempstay.noFilterResults") : t("tempstay.noListings")}
							</p>
						) : (
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
							{filtered.map((listing, i) => (
								<div key={listing.id ?? listing.name} style={{ animation: `fadeUp 0.35s ease ${i * 40}ms both` }}>
									<TempStayCard
										listing={listing}
										delay={i * 40}
										datesUnavailable={browseDatesValid && browseDateConflicts.has(String(listing.id))}
										onClick={() => openDetail(listing)}
									/>
								</div>
							))}
						</div>
						)}
					</div>
					</>
					)}
				</div>
				{/* Map panel — desktop side panel */}
				{showMap && !isMobile && mainTab === "find" && (
					<div className="border border-border-subtle" style={{ width: 380, flexShrink: 0, margin: "24px 24px 24px 0", borderRadius: 16, overflow: "hidden", animation: "fadeUp 0.25s ease both", display: "flex", flexDirection: "column" }}>
						{mapEl}
					</div>
				)}
			</div>
			{/* Map panel — mobile fullscreen overlay with a close button. This whole shell stays
			    dark in both themes — it's the map-browsing chrome wrapped around the Leaflet map,
			    same reasoning as Preconstruct.jsx's mobile map overlay. */}
			{showMap && isMobile && mainTab === "find" && (
				<div style={{ position: "fixed", inset: 0, zIndex: 300, background: "#0a0a0e", display: "flex", flexDirection: "column", animation: "fadeUp 0.2s ease both" }}>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top,0px) + 14px) 16px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
						<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em" }}>{i18n.t("common.map")}</span>
						<button onClick={() => setShowMap(false)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 20, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
							<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
							Close
						</button>
					</div>
					{mapEl}
				</div>
			)}
			{rateTrip && (
				<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
					<div className="bg-surface border border-border" style={{ borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, animation: "fadeUp 0.25s ease both" }}>
						<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{t("common.rateYourHost")}</h3>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 18 }}>{rateTrip.title}</p>
						<div style={{ display: "flex", gap: 8, marginBottom: 18, justifyContent: "center" }}>
							{[1, 2, 3, 4, 5].map((n) => (
								<button key={n} type="button" onClick={() => setTripRating(n)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
									<svg width={30} height={30} viewBox="0 0 24 24" fill={n <= tripRating ? "#f59e0b" : "none"} stroke={n <= tripRating ? "#f59e0b" : "var(--color-text-muted)"} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
								</button>
							))}
						</div>
						<textarea value={tripRatingComment} onChange={(e) => setTripRatingComment(e.target.value)} placeholder={t("common.optionalComment")} rows={3} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 16 }} />
						{tripRateError && (
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#ef4444", marginBottom: 12 }}>{tripRateError}</p>
						)}
						<div style={{ display: "flex", gap: 10 }}>
							<button type="button" onClick={() => setRateTrip(null)} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, padding: "11px 0", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{t("ondemand.hire.skip")}</button>
							<button type="button" disabled={tripRating === 0 || tripRateSubmitting} onClick={submitTripReview} style={{ flex: 1, padding: "11px 0", background: tripRating > 0 && !tripRateSubmitting ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: tripRating > 0 ? "#fff" : "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: tripRating > 0 && !tripRateSubmitting ? "pointer" : "default" }}>{tripRateSubmitting ? "…" : t("common.submit")}</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

export { TempStayPage, TempStayDetailPage, TempStayCheckoutPage, TempStayConfirmPage };
