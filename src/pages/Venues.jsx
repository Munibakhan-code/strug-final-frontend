import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from "react";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import i18n from "../i18n/index.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon, VenuesIcon } from "../components/icons.jsx";
import { Skel, SkeletonCircle, SkeletonHeading, SkeletonVenueCard } from "../components/skeletons.jsx";
import { LeoButton, HostListingCTA } from "../components/shared.jsx";
import { ConciergeEntryBanner } from "../components/ConciergeEntryBanner.jsx";
import { useSharedEventFields } from "../store/eventPlan.js";
import { useEventCart } from "../store/eventCart.js";
import { EventCartPill } from "../components/EventCartPill.jsx";
import { messageUser } from "../api/chat";
import { getBookingListings, getBookingListing, getBookingQuote, createBooking, getBookings, cancelBooking, getListingAvailability, getListingReviews, createBookingReview } from "../api/booking";
import { slugify } from "../utils/slugify.js";
import { indexVenueAvailability, venuePassesBrowseDateFilter } from "../utils/venueBrowseAvailability.js";
import { CardInput, useBookingPayment } from "../components/BookingPayment.jsx";
import { PayPalButtons } from "@paypal/react-paypal-js";
import { createPaypalOrder, capturePaypalOrder } from "../api/payment";
import { bindCheckoutReferralCode } from "../api/user";
import { isAuthenticated } from "../store/auth";
import { mediaUrls } from "../utils/mediaUrl";
import { SaveButton } from "../components/SaveButton.jsx";
import { mapBookingListingToVenue, mapBookingListingsToVenues } from "../utils/venueMappers.js";
import { mapGuestBookingsToVenueTrips, filterVenueTripsByBucket } from "../utils/venueTrips.js";
import { buildUnavailableNightSet, eventDateConflicts, todayISODate } from "../utils/venueAvailability.js";
import {
	buildVenueListingsQuery,
	filterVenueListings,
	venueBrowseFiltersActive,
} from "../utils/venueBrowseFilters.js";
import {
	parseVenueCheckoutResumeQuery,
	parseVenueListingIdFromPath,
	venuePopstateAction,
} from "../utils/venueNavigation.js";
import { getVerticalProfileByUser } from "../api/verticalProfile.js";
import {
	VENUE_PROFILE_VERTICAL,
	LEGACY_HOSTING_PROFILE_VERTICAL,
} from "../utils/bookingIsolation.js";
import { Avatar } from "../components/SafeImage.jsx";

const LOGIN_URL = import.meta.env.VITE_LOGIN_URL ?? "https://strug.ca/en/login";

function redirectToSignIn(returnPath) {
	try {
		sessionStorage.setItem("strug_return_to", returnPath || (window.location.pathname + window.location.search));
	} catch { /* ignore */ }
	window.location.href = LOGIN_URL;
}

function venueListingPath(venue) {
	return `/listing/venue/${venue.id}-${slugify(venue.name)}`;
}

function venueCheckoutReturnUrl(venue, info) {
	const params = new URLSearchParams({
		checkout: "1",
		eventDate: info.eventDate,
		attendees: String(info.attendees),
	});
	return `${venueListingPath(venue)}?${params.toString()}`;
}

function venueShareUrl(venue) {
	return `${window.location.origin}${venueListingPath(venue)}`;
}

const VENUES_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#2563eb", match: null },
	{ id: "title", labelKey: "wedding.title", color: "#db2777", match: "Wedding" },
	{ id: "corporate", labelKey: "catering.categories.corporate", color: "#0891b2", match: "Corporate" },
	{ id: "birthday", labelKey: "floral.birthday", color: "#d97706", match: "Birthday" },
	{ id: "category-concert", labelKey: "venues.categoryConcert", color: "#7c3aed", match: "Concert" },
	{ id: "category-outdoor", labelKey: "venues.categoryOutdoor", color: "#059669", match: "Outdoor" },
	{ id: "category-rooftop", labelKey: "venues.categoryRooftop", color: "#dc2626", match: "Rooftop" },
	{ id: "category-gallery", labelKey: "venues.categoryGallery", color: "#b45309", match: "Gallery" },
];


// Card background/text stay hardcoded in both themes: venue.color/venue.accent are
// fixed per-venue branding values (always a dark teal + accent gradient, like a photo
// tile), not neutral page chrome, so the white text/icons overlaid on them are intentional.
function VenueCard({ venue, onClick }) {
	const [saved, setSaved] = useState(false);
	const [hov, setHov] = useState(false);
	return (
		<div
			onClick={onClick}
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			style={{ borderRadius: 16, overflow: "hidden", background: venue.color, border: `1px solid ${venue.accent}33`, cursor: "pointer", transition: "transform 0.18s, box-shadow 0.18s", transform: hov ? "translateY(-3px)" : "none", boxShadow: hov ? `0 12px 32px ${venue.accent}22` : "none" }}
		>
			{/* Image */}
			<div style={{ height: venue.featured ? 180 : 140, background: `linear-gradient(135deg, ${venue.color} 0%, ${venue.accent}44 100%)`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
				{venue.image
					? <img loading="lazy" decoding="async" src={venue.image} alt={venue.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none"; }} />
					: <svg width={venue.featured ? 48 : 36} height={venue.featured ? 48 : 36} viewBox="0 0 24 24" fill="none" stroke={venue.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
						<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
					</svg>
				}
				<div style={{ position: "absolute", top: 10, left: 10, background: `${venue.accent}22`, border: `1px solid ${venue.accent}55`, borderRadius: 20, padding: "3px 10px" }}>
					<span style={{ fontSize: 10, fontWeight: 600, color: venue.accent, fontFamily: "'DM Sans', sans-serif" }}>{venue.category}</span>
				</div>
				<button onClick={e => { e.stopPropagation(); setSaved(s => !s); }} style={{ position: "absolute", top: 10, right: 10, width: 30, height: 30, borderRadius: "50%", background: "rgba(0,0,0,0.45)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill={saved ? "#2563eb" : "none"} stroke={saved ? "#2563eb" : "rgba(255,255,255,0.7)"} strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
				</button>
				{venue.capacityKnown && (
					<div style={{ position: "absolute", bottom: 10, left: 10, display: "flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,0.5)", borderRadius: 20, padding: "3px 10px" }}>
						<svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 0v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
						<span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("venues.upToGuests", { n: venue.capacity })}</span>
					</div>
				)}
			</div>
			{/* Info */}
			<div style={{ padding: "12px 14px 14px" }}>
				<p style={{ fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", marginBottom: 4, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{venue.name}</p>
				<div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
					<svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
					<span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif" }}>{venue.location}</span>
				</div>
				{/* Amenity tags */}
				{(venue.amenities || []).length > 0 && (
					<div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
						{venue.amenities.map(a => (
							<span key={a} style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif", background: "rgba(255,255,255,0.08)", borderRadius: 6, padding: "2px 7px" }}>{a}</span>
						))}
					</div>
				)}
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
					{(venue.host || venue.rating != null) ? (
						<div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, overflow: "hidden" }}>
							{venue.host && (
								<>
									<div style={{ width: 20, height: 20, borderRadius: "50%", background: venue.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", fontFamily: "'Barlow Condensed', sans-serif", flexShrink: 0 }}>{venue.avatar}</div>
									<span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{venue.host}</span>
								</>
							)}
							{venue.rating != null && (
								<div style={{ display: "flex", alignItems: "center", gap: 3, marginLeft: venue.host ? 6 : 0, flexShrink: 0 }}>
									<svg width={11} height={11} viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
									<span style={{ fontSize: 11, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{venue.rating}</span>
								</div>
							)}
						</div>
					) : <div />}
					<div style={{ textAlign: "right", flexShrink: 0, whiteSpace: "nowrap" }}>
						<span style={{ fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>${venue.price.toLocaleString()}</span>
						<span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif" }}> {venue.priceUnit}</span>
					</div>
				</div>
			</div>
		</div>
	);
}

function VenueDetailPage({ venue, onBack, onBook }) {
	const { t } = usePageI18n("venues");
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const shared = useSharedEventFields();
	const eventCart = useEventCart();
	const [eventDate, setEventDate] = useState(() => shared.date || "");
	const [attendees, setAttendees] = useState(() => (
		shared.guests ? Number(shared.guests)
			: venue.capacityKnown ? Math.min(50, venue.capacity) : 1
	));
	// Shared Event: keep the venue's date/guests in step with the event the customer
	// is planning (one-way — the page reflects the shared values; edits are pushed back
	// only when they add this venue to the event).
	useEffect(() => {
		if (!shared.hasActiveEvent) return;
		if (shared.date) setEventDate(shared.date);
		if (shared.guests) setAttendees(Number(shared.guests));
	}, [shared.hasActiveEvent, shared.date, shared.guests]);
	const maxAttendees = venue.capacityKnown ? venue.capacity : null;
	const attendeeStep = venue.capacityKnown ? 10 : 1;
	const [venueChat, setVenueChat] = useState(false);
	const [hostMsg, setHostMsg] = useState("");
	const [msgSending, setMsgSending] = useState(false);
	const [msgSent, setMsgSent] = useState(false);
	const [msgError, setMsgError] = useState("");
	const [shareCopied, setShareCopied] = useState(false);
	const [listingReviews, setListingReviews] = useState([]);
	const [reviewsLoading, setReviewsLoading] = useState(false);
	const [galleryImages] = useState(() => mediaUrls(venue.images));
	const [galleryIdx, setGalleryIdx] = useState(0);
	// Listing payload carries owner_id — hydrate host name/photo from the
	// scoped venue vertical profile (fallback to legacy "hosting" for older hosts).
	const [hostProfile, setHostProfile] = useState(null);
	const [unavailableDays, setUnavailableDays] = useState(() => new Set());
	const [availLoading, setAvailLoading] = useState(() => !!venue.id);
	const [availError, setAvailError] = useState(false);
	// Server-authoritative price + availability — fee is no longer hardcoded.
	const [quote, setQuote] = useState(null);
	const [quoteLoading, setQuoteLoading] = useState(false);
	useEffect(() => {
		setHostProfile(null);
		if (!venue.hostId) return;
		let alive = true;
		const uid = venue.hostId;
		getVerticalProfileByUser(uid, VENUE_PROFILE_VERTICAL)
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
	}, [venue.hostId]);
	const hostName = hostProfile?.display_name || hostProfile?.business_name || venue.host;
	const hostPhoto = hostProfile?.profile_pic_url || null;
	const hostInitial = (hostName || venue.avatar || "V").toString().trim().charAt(0).toUpperCase() || "V";
	useEffect(() => {
		if (!venue.id) { setAvailLoading(false); return; }
		let alive = true;
		setAvailLoading(true);
		setAvailError(false);
		getListingAvailability(venue.id)
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
	}, [venue.id]);
	useEffect(() => {
		if (!venue.id) { setListingReviews([]); return; }
		let alive = true;
		setReviewsLoading(true);
		getListingReviews(venue.id)
			.then((res) => {
				if (!alive) return;
				const rows = res?.data?.reviews ?? (Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []));
				setListingReviews(Array.isArray(rows) ? rows : []);
			})
			.catch(() => { if (alive) setListingReviews([]); })
			.finally(() => { if (alive) setReviewsLoading(false); });
		return () => { alive = false; };
	}, [venue.id]);
	useEffect(() => {
		if (!eventDate || attendees < 1) { setQuote(null); return; }
		let cancelled = false;
		setQuoteLoading(true);
		getBookingQuote({ booking_listing_id: venue.id, start_date: eventDate, quantity: 1, guests: attendees })
			.then(res => { if (!cancelled) setQuote(res?.data ?? res); })
			.catch(() => { if (!cancelled) setQuote(null); })
			.finally(() => { if (!cancelled) setQuoteLoading(false); });
		return () => { cancelled = true; };
	}, [eventDate, venue.id, attendees]);
	const deposit = quote?.deposit != null ? Number(quote.deposit) : 0;
	const serviceFee = quote?.service_fee ?? Math.round(venue.price * 0.1);
	const total = quote?.total ?? (venue.price + Math.round(venue.price * 0.1) + (deposit > 0 ? deposit : 0));
	const quoteUnavailable = !!quote && quote.available === false;
	const dateConflict = eventDateConflicts(eventDate, unavailableDays);
	const overCapacity = venue.capacityKnown && attendees > maxAttendees;
	const unavailable = quoteUnavailable || dateConflict || overCapacity;
	// availError is honest amber — guest may still try; server confirms on quote/book.
	const bookDisabled = !eventDate || quoteLoading || unavailable || availLoading;

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 920, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<Skel w={160} h={18} r={6} style={{ marginTop: 24, marginBottom: 20 }} />
				<Skel w="100%" h={300} r={18} style={{ marginBottom: 28 }} />
				<div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
					<div style={{ flex: 2, minWidth: 280 }}>
						<Skel w="70%" h={30} r={8} style={{ marginBottom: 10 }} />
						<Skel w="50%" h={14} r={6} style={{ marginBottom: 20 }} />
						<Skel w="100%" h={80} r={8} style={{ marginBottom: 20 }} />
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
							{[...Array(4)].map((_,i) => <Skel key={i} w="100%" h={32} r={8} />)}
						</div>
					</div>
					<div style={{ flex: 1, minWidth: 240 }}>
						<Skel w="100%" h={280} r={18} />
					</div>
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 920, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<div style={{ marginTop: 24, marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
					<button onClick={onBack} className="text-text-secondary" style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}>
						<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
						{t("venues.backToVenues")}
					</button>
					<button type="button" onClick={() => { navigator.clipboard?.writeText(venueShareUrl(venue)); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: shareCopied ? "#22c55e" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: 0 }}>
						{shareCopied ? i18n.t("common.copied") : i18n.t("common.share")}
					</button>
				</div>
				{/* Hero / Gallery — a photo (or dark venue.color/accent gradient placeholder when
				    there's no image) needs a dark backdrop for the overlaid white chrome to read,
				    so this stays hardcoded in both themes rather than using surface tokens. */}
				<div style={{ height: 300, borderRadius: 18, background: galleryImages.length ? "#000" : `linear-gradient(135deg, ${venue.color} 0%, ${venue.accent}55 100%)`, position: "relative", overflow: "hidden", marginBottom: galleryImages.length > 1 ? 8 : 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
					{galleryImages.length > 0
						? <img loading="lazy" decoding="async" src={galleryImages[galleryIdx]} alt={venue.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
						: <svg width={64} height={64} viewBox="0 0 24 24" fill="none" stroke={venue.accent} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
					}
					<div style={{ position: "absolute", top: 14, left: 14, background: `${venue.accent}22`, border: `1px solid ${venue.accent}55`, borderRadius: 20, padding: "5px 14px" }}>
						<span style={{ fontSize: 11, fontWeight: 700, color: venue.accent, fontFamily: "'DM Sans', sans-serif" }}>{venue.category}</span>
					</div>
					<SaveButton entityType="venue" entityId={venue.id}
						meta={{ title: venue.name, sub: venue.location, price: `$${Number(venue.price).toLocaleString()}${venue.priceUnit ? ` ${venue.priceUnit}` : ''}`, thumb: galleryImages[0] || `linear-gradient(135deg, ${venue.color} 0%, ${venue.accent}55 100%)`, accent: venue.accent }}
						style={{ position: "absolute", top: 14, right: 14 }} />
					{venue.capacityKnown && (
						<div style={{ position: "absolute", bottom: 14, right: 14, background: "rgba(0,0,0,0.6)", borderRadius: 20, padding: "5px 14px", display: "flex", alignItems: "center", gap: 6 }}>
							<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 0v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
							<span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("venues.upToGuests", { n: venue.capacity })}</span>
						</div>
					)}
					{galleryImages.length > 1 && (
						<>
							<button onClick={() => setGalleryIdx(i => (i - 1 + galleryImages.length) % galleryImages.length)} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
								<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
							</button>
							<button onClick={() => setGalleryIdx(i => (i + 1) % galleryImages.length)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "pointer", color: "#fff" }}>
								<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
							</button>
							<div style={{ position: "absolute", bottom: 14, left: 14, background: "rgba(0,0,0,0.55)", borderRadius: 20, padding: "3px 10px" }}>
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
						<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: "0.02em", marginBottom: 8, lineHeight: 1.2 }}>{venue.name}</h1>
						<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
							<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
							<span className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{venue.location}</span>
						</div>
						{(venue.rating != null || venue.reviews != null) && (
							<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--color-border-subtle)" }}>
								{venue.rating != null && (
									<>
										<svg width={13} height={13} viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
										<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{venue.rating}</span>
									</>
								)}
								{venue.reviews != null && (
									<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{venue.rating != null ? "· " : ""}{venue.reviews} {i18n.t("venues.reviews")}</span>
								)}
							</div>
						)}
						{/* Host */}
						{(hostName || venue.hostId) && (
						<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
							<div
								onClick={() => { if (venue.hostId) { window.__profileTargetId = venue.hostId; window.__profileVertical = VENUE_PROFILE_VERTICAL; window.__nav?.("profile"); } }}
								style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, cursor: venue.hostId ? "pointer" : "default" }}
							>
								<Avatar url={hostPhoto} initials={hostInitial} size={44} alt="" style={{ background: venue.avatarColor, fontSize: 18, fontWeight: 800 }} />
								<div>
									<p style={{ fontSize: 13, fontWeight: 700, color: venue.hostId ? "#60a5fa" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("venues.managedBy")}{hostName ? ` ${hostName}` : ""}</p>
									<p className="text-text-secondary" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{venue.hostId ? i18n.t("venues.viewProfile") : i18n.t("venues.respondsWithin")}</p>
								</div>
							</div>
							{/* Idle fill/border are a translucent white overlay, not a solid dark
							    surface — it lightens along with the page bg in light theme, so the
							    idle label uses a text token instead of fixed white/near-white. */}
							<button onClick={() => { setVenueChat(v => !v); setMsgSent(false); }} style={{ background: venueChat ? "rgba(37,99,235,0.12)" : "rgba(255,255,255,0.06)", border: `1px solid ${venueChat ? "rgba(37,99,235,0.3)" : "var(--color-border)"}`, borderRadius: 8, padding: "6px 14px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, color: venueChat ? "#60a5fa" : "var(--color-text-secondary)", cursor: "pointer", flexShrink: 0, transition: "all 0.15s" }}>{i18n.t("common.contact")}</button>
						</div>
						)}
						{venueChat && (
							<div className="bg-surface border border-border" style={{ marginBottom: 16, borderRadius: 12, padding: "12px 14px", animation: "fadeUp 0.2s ease both" }}>
								{msgSent ? (
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#059669" }}>{t("venues.messageSent")}</p>
								) : (
									<>
										<textarea value={hostMsg} onChange={e => { setHostMsg(e.target.value); setMsgError(""); }} placeholder={t("venues.contactHostPlaceholder", { name: venue.name })} rows={3}
											className="border border-border text-text-primary" style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "9px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", marginBottom: 8 }}
											onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.4)"}
											onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
										{msgError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#ef4444", marginBottom: 8 }}>{msgError}</p>}
										<div style={{ display: "flex", gap: 8 }}>
											<button onClick={() => setVenueChat(false)} className="border border-border text-text-secondary" style={{ flex: 1, padding: "8px 0", borderRadius: 8, background: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
											<button
												disabled={!venue.hostId || !hostMsg.trim() || msgSending}
												onClick={async () => {
													if (!hostMsg.trim() || msgSending) return;
													if (!venue.hostId) {
														setMsgError(t("venues.contactHostUnavailable"));
														return;
													}
													setMsgSending(true);
													setMsgError("");
													try {
														await messageUser(venue.hostId, {
															initialMessage: hostMsg.trim(),
															navigate: true,
															sourceVertical: "venues",
														});
														setMsgSent(true);
													} catch {
														setMsgError(t("venues.contactHostFailed"));
													} finally {
														setMsgSending(false);
													}
												}}
												style={{ flex: 2, padding: "8px 0", borderRadius: 8, border: "none", background: hostMsg.trim() && venue.hostId ? "#2563eb" : "var(--color-border)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: hostMsg.trim() && venue.hostId ? "#fff" : "var(--color-text-muted)", cursor: hostMsg.trim() && venue.hostId ? "pointer" : "default" }}
											>
												{msgSending ? t("venues.sending") : t("venues.send")}
											</button>
										</div>
									</>
								)}
							</div>
						)}
						{(venue.squareFeet != null || venue.venueType) && (
							<div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--color-border-subtle)" }}>
								{venue.squareFeet != null && (
									<div>
										<p className="text-text-muted" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{t("venues.squareFeet")}</p>
										<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{venue.squareFeet.toLocaleString()} {i18n.t("realestate.sqft")}</p>
									</div>
								)}
								{venue.venueType && venue.venueType !== venue.category && (
									<div>
										<p className="text-text-muted" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{t("venues.venueType")}</p>
										<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{venue.venueType}</p>
									</div>
								)}
							</div>
						)}
						<div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--color-border-subtle)" }} />
						{/* Description */}
						{venue.description && (
							<p className="text-text-secondary" style={{ fontSize: 14, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.75, marginBottom: venue.rules ? 10 : 24, paddingBottom: venue.rules ? 0 : 20, borderBottom: venue.rules ? "none" : "1px solid var(--color-border-subtle)" }}>
								{venue.description}
							</p>
						)}
						{venue.rules && (
							<div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--color-border-subtle)" }}>
								<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 10, letterSpacing: "0.04em", textTransform: "uppercase" }}>{i18n.t("venues.rulesRequirements")}</p>
								<p className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.65 }}>{venue.rules}</p>
							</div>
						)}
						{/* Amenities */}
						{venue.amenities.length > 0 && <div style={{ marginBottom: 24 }}>
							<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 12, letterSpacing: "0.04em", textTransform: "uppercase" }}>{i18n.t("venues.whatsIncluded")}</p>
							<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
								{venue.amenities.map(a => (
									<div key={a} style={{ display: "flex", alignItems: "center", gap: 10 }}>
										<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={venue.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
										<span className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{a}</span>
									</div>
								))}
							</div>
						</div>}
						<div style={{ marginBottom: 24 }}>
							<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 14, letterSpacing: "0.04em", textTransform: "uppercase" }}>{i18n.t("common.reviews", "Reviews")}</p>
							{reviewsLoading ? (
								<p className="text-text-muted" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("common.loading")}</p>
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
								<p className="text-text-muted" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{t("venues.noReviewsYet")}</p>
							)}
						</div>
					</div>
					{/* Right: booking card */}
					<div className="bg-surface-raised border border-border" style={{ ...(isMobile ? { width: "100%", maxWidth: "100%" } : { flex: 1, minWidth: 240, position: "sticky", top: 20 }), borderRadius: 18, padding: 22 }}>
						<div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 18 }}>
							<span className="text-text-primary" style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>${venue.price.toLocaleString()}</span>
							<span className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{venue.priceUnit}</span>
						</div>
						{/* Event date */}
						<div style={{ borderRadius: 12, border: `1px solid ${dateConflict || quoteUnavailable ? "rgba(239,68,68,0.45)" : "var(--color-border)"}`, overflow: "hidden", marginBottom: 10 }}>
							<div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border-subtle)" }}>
								<p className="text-text-secondary" style={{ fontSize: 9, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>{i18n.t("venues.eventDate")}</p>
								{/* colorScheme stays "dark" regardless of theme — matches the established
								    pattern for native date/time inputs across the app: the browser's own
								    picker chrome isn't retheme'd. */}
								<input type="date" min={todayISODate()} value={eventDate} onChange={e => setEventDate(e.target.value)} className={eventDate ? "text-text-primary" : "text-text-muted"} style={{ background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer", colorScheme: "dark", width: "100%" }} />
							</div>
							{/* Attendees */}
							<div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
								<div>
									<p className="text-text-secondary" style={{ fontSize: 9, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>{i18n.t("venues.attendees")}</p>
									<p className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{attendees} {t("venues.guests")}</p>
								</div>
								<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
									<button onClick={() => setAttendees((a) => Math.max(1, a - attendeeStep))} className="border border-border text-text-primary" style={{ width: 26, height: 26, borderRadius: "50%", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>−</button>
									<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", minWidth: 28, textAlign: "center" }}>{attendees}</span>
									<button onClick={() => setAttendees((a) => {
										const next = a + attendeeStep;
										if (maxAttendees != null) return Math.min(maxAttendees, next);
										return next;
									})} style={{ width: 26, height: 26, borderRadius: "50%", border: "none", background: venue.accent, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>+</button>
								</div>
							</div>
						</div>
						{availLoading && (
							<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>{i18n.t("venues.checkingAvailability")}</p>
						)}
						{availError && (
							<p style={{ fontSize: 11, color: "#fbbf24", fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>{i18n.t("venues.availabilityLoadFailed")}</p>
						)}
						{dateConflict && (
							<p style={{ fontSize: 12, color: "#f87171", fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>{i18n.t("venues.dateUnavailable")}</p>
						)}
						{overCapacity && (
							<p style={{ fontSize: 12, color: "#f87171", fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>{t("venues.tooManyAttendees", { n: maxAttendees })}</p>
						)}
						{/* Price breakdown */}
						<div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
							<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
								<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{t("venues.venueFee")}</span>
								<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${venue.price.toLocaleString()}</span>
							</div>
							<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
								<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("common.serviceFee")}</span>
								<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${serviceFee.toLocaleString()}</span>
							</div>
							{deposit > 0 && (
								<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
									<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{t("venues.deposit")}</span>
									<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${deposit.toLocaleString()}</span>
								</div>
							)}
							<div style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 8, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
								<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("ondemand.hire.total")}</span>
								<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>${total.toLocaleString()}</span>
							</div>
						</div>
						{/* Disabled fill is a translucent overlay (lightens with the page in light
						    theme), so its label uses a text token instead of fixed white; the
						    enabled state sits on venue.accent (always-dark/brand), so #fff stays. */}
						<button onClick={() => !bookDisabled && onBook({ eventDate, attendees, total, serviceFee, deposit })} disabled={bookDisabled} style={{ width: "100%", background: !bookDisabled ? venue.accent : "rgba(255,255,255,0.12)", border: "none", borderRadius: 12, padding: "14px 0", color: !bookDisabled ? "#fff" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: !bookDisabled ? "pointer" : "default", transition: "all 0.2s" }}>
							{!eventDate ? t("venues.selectDate") : availLoading || quoteLoading ? t("venues.checking") : unavailable ? t("venues.unavailable") : t("venues.requestToBook")}
						</button>
						{shared.hasActiveEvent && (
							<button
								onClick={() => {
									eventCart.setLine("venue", { listing_id: venue.id, title: venue.name, price: venue.price, line_total: total });
									if (eventDate) shared.setDate(eventDate);
									if (attendees) shared.setGuests(attendees);
									window.__nav?.("event-plan");
								}}
								disabled={!eventDate || unavailable}
								className="border border-border text-text-primary"
								style={{ width: "100%", background: "none", borderRadius: 12, padding: "12px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, cursor: (!eventDate || unavailable) ? "default" : "pointer", marginTop: 8, opacity: (!eventDate || unavailable) ? 0.5 : 1 }}
							>
								{eventCart.has("venue") ? i18n.t("event.updateInEvent", { defaultValue: "Update in my event" }) : i18n.t("event.addToEvent", { defaultValue: "Add to my event" })}
							</button>
						)}
						{quoteUnavailable && !dateConflict && !overCapacity && <p style={{ textAlign: "center", fontSize: 11, color: "#f87171", fontFamily: "'DM Sans', sans-serif", marginTop: 8 }}>{quote?.reason || t("venues.dateUnavailable")}</p>}
						<p className="text-text-muted" style={{ textAlign: "center", fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginTop: 10 }}>{t("venues.noChargeYet")}</p>
					</div>
				</div>
			</div>
		</div>
	);
}

function VenueCheckoutPage({ venue, bookingInfo, onBack, onConfirm }) {
	const { t } = usePageI18n("venues");
	const { isMobile } = useViewport();
	const payBooking = useBookingPayment();
	const deposit = Number(bookingInfo?.deposit ?? 0);
	const [payMethod, setPayMethod] = useState("card");
	const [refCode, setRefCode] = useState("");
	const [refApplied, setRefApplied] = useState(false);
	const [refLoading, setRefLoading] = useState(false);
	const [refError, setRefError] = useState(null);
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState("");

		async function handleConfirm() {
			if (!isAuthenticated()) { setSubmitError(t("venues.signInToBook")); return; }
			if (payMethod !== "card") { setSubmitError(t("venues.usePaymentButton")); return; }
			setSubmitting(true); setSubmitError("");
			try {
				const res = await createBooking({
					booking_listing_id: venue.id,
					start_date: bookingInfo.eventDate,
					guests: bookingInfo.attendees,
					payment_method: payMethod,
					notes: `Event date: ${bookingInfo.eventDate} · ${bookingInfo.attendees} attendees`,
				});
			const booking = res?.data ?? res;
			if (!booking?.booking_id) { setSubmitError(t("venues.bookingFailed")); setSubmitting(false); return; }
			if (payMethod === "card") {
				const pay = await payBooking(booking.booking_id);
				if (!pay.ok) { setSubmitError(pay.error); setSubmitting(false); return; }
			}
			onConfirm(booking.booking_id, booking.status === 'confirmed');
		} catch (e) {
			const status = e?.response?.status;
			setSubmitError(
				status === 409 ? (e?.response?.data?.message || t("venues.dateUnavailable"))
				: status === 401 ? t("venues.signInToBook")
				: status === 403 ? (e?.response?.data?.message || t("venues.notAllowedToBook"))
				: (e?.response?.data?.message || t("venues.bookingFailed"))
			);
			setSubmitting(false);
		}
	}
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 640, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<button onClick={onBack} className="text-text-secondary" style={{ marginTop: 24, marginBottom: 20, display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}>
					<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					{i18n.t("common.back")}
				</button>
				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 24 }}>{i18n.t("common.confirmAndPay")}</h2>
				{/* Booking summary */}
				<div className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 16, padding: 20, marginBottom: 20 }}>
					<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{t("venues.bookingSummary")}</p>
					<p className="text-text-primary" style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>{venue.name}</p>
					<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{venue.location} · {venue.category}</p>
					<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{t("venues.eventDate")}: {bookingInfo.eventDate}</p>
					<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}>{t("venues.attendees")}: {bookingInfo.attendees} {t("venues.guests")}</p>
					<div className="bg-border-subtle" style={{ height: 1, marginBottom: 12 }} />
					<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
						<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{t("venues.venueFee")}</span>
						<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${venue.price.toLocaleString()}</span>
					</div>
					<div style={{ display: "flex", justifyContent: "space-between", marginBottom: deposit > 0 ? 4 : 8 }}>
						<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("common.serviceFee")}</span>
						<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${(bookingInfo.serviceFee ?? Math.round(venue.price * 0.1)).toLocaleString()}</span>
					</div>
					{deposit > 0 && (
						<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
							<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{t("venues.deposit")}</span>
							<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${deposit.toLocaleString()}</span>
						</div>
					)}
					<div style={{ display: "flex", justifyContent: "space-between" }}>
						<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("ondemand.hire.total")}</span>
						<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>${bookingInfo.total.toLocaleString()}</span>
					</div>
				</div>
				{/* Payment */}
				<div className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 16, padding: 20, marginBottom: 24 }}>
					<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>{i18n.t("common.paymentMethod")}</p>
						{["card", "paypal"].map(m => (
						<label key={m} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 10 }}>
							<input type="radio" name="vpay" checked={payMethod === m} onChange={() => { setPayMethod(m); setSubmitError(""); }} style={{ accentColor: "#2563eb" }} />
							<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
									{m === "card" ? "Credit / Debit Card" : "PayPal"}
								</span>
							</label>
						))}
					{payMethod === "card" && (
						<div style={{ marginTop: 10 }}>
							<CardInput />
						</div>
					)}
						{payMethod === "paypal" && (
						<div style={{ marginTop: 10 }}>
							<PayPalButtons
								style={{ layout: "vertical", color: "blue", shape: "rect", label: "pay", height: 44 }}
								createOrder={async () => {
									if (!isAuthenticated()) { setSubmitError(t("venues.signInToBook")); throw new Error("not authenticated"); }
									setSubmitError("");
									const { id } = await createPaypalOrder(Number(bookingInfo.total || 0).toFixed(2), {
										purpose: "booking",
										vertical: "venues",
										booking_listing_id: venue.id,
										start_date: bookingInfo.eventDate,
										guests: bookingInfo.attendees,
										quantity: 1,
									});
									return id;
								}}
								onApprove={async (data) => {
									setSubmitting(true);
									setSubmitError("");
									let bookingCreated = false;
									let createdBookingId = null;
									try {
										const res = await createBooking({
											booking_listing_id: venue.id,
											start_date: bookingInfo.eventDate,
											guests: bookingInfo.attendees,
											payment_method: "paypal",
											notes: `Event date: ${bookingInfo.eventDate} · ${bookingInfo.attendees} attendees`,
										});
										const booking = res?.data ?? res;
										if (!booking?.booking_id) throw new Error("no booking id");
										bookingCreated = true;
										createdBookingId = booking.booking_id;
										await capturePaypalOrder(data.orderID);
										onConfirm(booking.booking_id, booking.status === 'confirmed');
									} catch (e) {
										if (bookingCreated && createdBookingId) {
											setSubmitError(t("venues.paypalCaptureFailed", { id: createdBookingId }));
										} else {
											const status = e?.response?.status;
											setSubmitError(
												status === 409 ? (e?.response?.data?.message || t("venues.dateUnavailable"))
												: status === 401 ? t("venues.signInToBook")
												: status === 403 ? (e?.response?.data?.message || t("venues.notAllowedToBook"))
												: (e?.response?.data?.message || t("venues.bookingFailed"))
											);
										}
									} finally {
										setSubmitting(false);
									}
								}}
								onError={() => setSubmitError(t("venues.paypalBookingFailed"))}
							/>
						</div>
					)}
				</div>
				<div className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 16, padding: 20, marginBottom: 16 }}>
					<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{i18n.t("tempstay.referralCode")}</p>
					<div style={{ display: "flex", gap: 8 }}>
						<input value={refCode} onChange={e => { setRefCode(e.target.value); setRefApplied(false); setRefError(null); }} placeholder="Enter referral code (optional)" className="border border-border text-text-primary" style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 9, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none" }} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
						{/* Empty-input state's bg is a translucent fill (not solid dark), so its
						    label uses a text token; filled state's bg is always accent blue. */}
						<button onClick={async () => { if (!refCode.trim() || refLoading || refApplied) return; setRefLoading(true); setRefError(null); try { await bindCheckoutReferralCode(refCode.trim()); setRefApplied(true); } catch (e) { setRefError(e?.response?.data?.message || "Invalid referral code."); } finally { setRefLoading(false); } }} style={{ padding: "10px 16px", background: refCode.trim() ? "#2563eb" : "rgba(255,255,255,0.06)", border: "none", borderRadius: 9, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: refCode.trim() ? "#fff" : "var(--color-text-muted)", cursor: refCode.trim() ? "pointer" : "default" }}>{refApplied ? "Applied ✓" : refLoading ? "…" : "Apply"}</button>
					</div>
					{refError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginTop: 6 }}>{refError}</p>}
				</div>
				{submitError && <p style={{ fontSize: 12, color: "#ef4444", fontFamily: "'DM Sans', sans-serif", marginBottom: 10, textAlign: "center" }}>{submitError}</p>}
				{payMethod !== "paypal" && (
					<button onClick={handleConfirm} disabled={submitting} style={{ width: "100%", background: submitting ? "rgba(37,99,235,0.5)" : venue.accent, border: "none", borderRadius: 14, padding: "16px 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700, cursor: submitting ? "default" : "pointer" }}>
						{submitting ? t("venues.confirming") : t("venues.payAmount", { amount: bookingInfo.total.toLocaleString() })}
					</button>
				)}
			</div>
		</div>
	);
}

function VenueConfirmPage({ venue, bookingInfo, onDone, orderId, isInstant }) {
	const { t } = usePageI18n("venues");
	const { isMobile } = useViewport();
	const deposit = Number(bookingInfo?.deposit ?? 0);
	const [ref] = useState(() => orderId ? `VEN-${orderId}`.slice(0, 12).toUpperCase() : "VEN-" + Math.random().toString(36).slice(2, 8).toUpperCase());
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 40, paddingBottom: 24, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflowY: "auto" }}>
			<div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
				<div style={{ width: 72, height: 72, borderRadius: "50%", background: `${venue.accent}20`, border: `2px solid ${venue.accent}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
					<svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={venue.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				</div>
				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8 }}>{isInstant ? t("venues.venueBooked") : t("venues.requestSubmitted")}</h2>
				<p className="text-text-secondary" style={{ fontSize: 14, fontFamily: "'DM Sans', sans-serif", marginBottom: 28 }}>{isInstant ? t("venues.bookingConfirmedDetail") : t("venues.hostWillConfirmRequest")}</p>
				<div className="bg-surface-raised" style={{ border: `1px solid ${venue.accent}33`, borderRadius: 18, overflow: "hidden", marginBottom: 20, textAlign: "left" }}>
					<div style={{ height: 8, background: `linear-gradient(90deg, ${venue.accent}, ${venue.accent}55)` }} />
					<div style={{ padding: 24 }}>
						<p className="text-text-primary" style={{ fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>{venue.name}</p>
						<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{venue.location} · {venue.category}</p>
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16, marginBottom: 20 }}>
							{[
								{ label: t("venues.eventDate"), val: bookingInfo.eventDate },
								{ label: t("venues.attendees"), val: `${bookingInfo.attendees} ${t("venues.guests")}` },
								{ label: t("venues.managedBy"), val: venue.host },
								{ label: t("venues.totalPaid"), val: `$${bookingInfo.total.toLocaleString()}${deposit > 0 ? ` (${t("venues.deposit")}: $${deposit.toLocaleString()})` : ""}` },
							].map(r => (
								<div key={r.label}>
									<p className="text-text-muted" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{r.label}</p>
									<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{r.val}</p>
								</div>
							))}
						</div>
						<div style={{ borderTop: "1px dashed var(--color-border)", paddingTop: 16 }}>
							<p className="text-text-muted" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{i18n.t("common.bookingReference")}</p>
							<p style={{ fontSize: 18, fontWeight: 800, color: venue.accent, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.12em" }}>{ref}</p>
							<div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
								<div style={{ width: 7, height: 7, borderRadius: "50%", background: isInstant ? "#10b981" : "#f59e0b" }} />
								<span style={{ fontSize: 12, color: isInstant ? "#10b981" : "#f59e0b", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>{isInstant ? t("venues.bookingConfirmed") : t("venues.awaitingHost")}</span>
							</div>
						</div>
					</div>
				</div>
				{/* Fill is a translucent overlay over the page bg, not a solid dark surface —
				    lightens with the page in light theme, so the label needs a text token. */}
				<button onClick={onDone} className="border border-border text-text-primary" style={{ width: "100%", background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: "14px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
					{t("venues.backToVenuesButton")}
				</button>
			</div>
		</div>
	);
}

function VenuesPage({ initialListingId } = {}) {
	const { t, landingTitle, searchPlaceholder } = usePageI18n("venues");
	const categories = useI18nCategoryList(VENUES_CATEGORY_DEFS);
	const { isMobile } = useViewport();
	const loading = usePageLoad();
	const [activeCategory, setActiveCategory] = useState("all");
	const [query, setQuery] = useState("");
	const [browseEventDate, setBrowseEventDate] = useState("");
	const [browseAttendees, setBrowseAttendees] = useState(1);
	const [minPrice, setMinPrice] = useState("");
	const [maxPrice, setMaxPrice] = useState("");
	const [mainTab, setMainTab] = useState("find");
	const [venView, setVenView] = useState("landing");
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [venView]);
	const [selectedVenue, setSelectedVenue] = useState(null);
	const [bookingInfo, setBookingInfo] = useState(null);
	const [orderId, setOrderId] = useState(null);
	const [isInstant, setIsInstant] = useState(false);
	const catScrollRef = useRef(null);
	const didVenueColdLoad = useRef(false);
	const didResumeCheckout = useRef(false);
	const [catScrollState, setCatScrollState] = useState({ atStart: true, atEnd: true });
	const [venues, setVenues] = useState([]);
	const [loadError, setLoadError] = useState(false);
	const [trips, setTrips] = useState([]);
	const [tripBucketFilter, setTripBucketFilter] = useState("all");
	const [tripsLoading, setTripsLoading] = useState(false);
	const [tripsFetched, setTripsFetched] = useState(false);
	const [cancellingId, setCancellingId] = useState(null);
	const [tripError, setTripError] = useState("");
	const [rateTrip, setRateTrip] = useState(null);
	const [tripRating, setTripRating] = useState(0);
	const [tripRatingComment, setTripRatingComment] = useState("");
	const [tripRateError, setTripRateError] = useState("");
	const [tripRateSubmitting, setTripRateSubmitting] = useState(false);
	const [browseAvailByVenue, setBrowseAvailByVenue] = useState(() => new Map());
	const [browseDateLoading, setBrowseDateLoading] = useState(false);
	const filtersOn = venueBrowseFiltersActive({
		query,
		category: activeCategory,
		minPrice,
		maxPrice,
		minAttendees: browseAttendees,
	});
	useLayoutEffect(() => {
		const el = catScrollRef.current;
		if (!el) return;
		const update = () => setCatScrollState(prev => { const atStart = el.scrollLeft <= 4, atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4; return prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }; });
		update();
		el.addEventListener("scroll", update, { passive: true });
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
	}, [venView]);
	const loadVenues = useCallback((isAlive = () => true) => {
		const params = buildVenueListingsQuery({
			q: query,
			minPrice,
			maxPrice,
		});
		return getBookingListings(params).then((data) => {
			if (!isAlive()) return;
			const items = Array.isArray(data) ? data : (data?.data ?? []);
			setLoadError(false);
			setVenues(mapBookingListingsToVenues(items));
		}).catch(() => {
			if (!isAlive()) return;
			setLoadError(true);
		});
	}, [query, minPrice, maxPrice]);
	useEffect(() => {
		let alive = true;
		const handle = setTimeout(() => {
			loadVenues(() => alive);
		}, 220);
		return () => {
			alive = false;
			clearTimeout(handle);
		};
	}, [loadVenues]);

	const venueIdsKey = useMemo(
		() => venues.map((v) => String(v.id)).sort().join(","),
		[venues],
	);

	useEffect(() => {
		if (!browseEventDate || !venueIdsKey) {
			setBrowseAvailByVenue(new Map());
			setBrowseDateLoading(false);
			return;
		}
		const ids = venueIdsKey.split(",").filter(Boolean);
		let alive = true;
		const controller = new AbortController();
		setBrowseDateLoading(true);
		Promise.all(
			ids.map(async (id) => {
				try {
					const payload = await getListingAvailability(id, { signal: controller.signal });
					return { id, ok: true, payload };
				} catch (e) {
					if (e?.code === "ERR_CANCELED" || e?.name === "CanceledError") return null;
					return { id, ok: false };
				}
			}),
		).then((rows) => {
			if (!alive) return;
			setBrowseAvailByVenue(indexVenueAvailability(rows.filter(Boolean)));
		}).finally(() => {
			if (alive) setBrowseDateLoading(false);
		});
		return () => {
			alive = false;
			controller.abort();
		};
	}, [browseEventDate, venueIdsKey]);

	const clearFilters = () => {
		setQuery("");
		setActiveCategory("all");
		setBrowseEventDate("");
		setBrowseAttendees(1);
		setMinPrice("");
		setMaxPrice("");
	};

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
		getBookings({ role: "guest", vertical: "venue" })
			.then((r) => {
				const arr = Array.isArray(r) ? r : (r?.data ?? []);
				setTrips(mapGuestBookingsToVenueTrips(arr));
			})
			.catch(() => setTripError(t("venues.bookingsLoadFailed")))
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
		if (!window.confirm(t("venues.cancelConfirm"))) return;
		setCancellingId(trip.booking_id);
		setTripError("");
		try {
			await cancelBooking(trip.booking_id, "Guest cancelled from My bookings");
			setTrips((prev) => prev.map((x) =>
				x.booking_id === trip.booking_id
					? { ...x, status: "cancelled", can_cancel: false, bucket: "cancelled" }
					: x
			));
		} catch {
			setTripError(t("venues.cancelFailed"));
		} finally {
			setCancellingId(null);
		}
	};

	const openVenue = (venue) => {
		setSelectedVenue(venue);
		setVenView("detail");
		window.history.pushState({ nav: "venues", venView: "detail" }, "", venueListingPath(venue));
	};

	const openVenueById = (id) => {
		if (!id) return;
		const cached = venues.find((v) => String(v.id) === String(id));
		if (cached) {
			setTripError("");
			openVenue(cached);
			return;
		}
		setTripError("");
		getBookingListing(id, { vertical: "venue" }).then((res) => {
			const row = res?.data ?? res;
			if (!row || (row.vertical && row.vertical !== 'venue')) {
				setTripError(t("venues.viewVenueFailed"));
				return;
			}
			const mapped = mapBookingListingToVenue(row);
			if (mapped) openVenue(mapped);
			else setTripError(t("venues.viewVenueFailed"));
		}).catch(() => {
			setTripError(t("venues.viewVenueFailed"));
		});
	};

	// Cold-load /listing/venue/:id (and App-seeded initialListingId / Event Concierge pending).
	useEffect(() => {
		const pending = window.__pendingListingId;
		const pendingVertical = window.__pendingListingVertical;
		if (pending && (!pendingVertical || pendingVertical === "venue")) {
			if (didVenueColdLoad.current) return;
			didVenueColdLoad.current = true;
			delete window.__pendingListingId;
			delete window.__pendingListingVertical;
			openVenueById(pending);
			return;
		}
		const tok = parseVenueListingIdFromPath(window.location.pathname) || initialListingId;
		if (!tok || didVenueColdLoad.current) return;
		didVenueColdLoad.current = true;
		openVenueById(tok);
	}, [initialListingId]); // eslint-disable-line react-hooks/exhaustive-deps

	// Popstate: keep detail/landing in sync with browser Back/Forward (same pattern as TempStay).
	const venueSelectedRef = useRef(null);
	useEffect(() => { venueSelectedRef.current = selectedVenue; }, [selectedVenue]);
	useEffect(() => {
		const handler = () => {
			const action = venuePopstateAction(window.location.pathname, venueSelectedRef.current?.id);
			if (action === "landing") {
				setVenView("landing");
				setSelectedVenue(null);
				setBookingInfo(null);
				return;
			}
			if (action === "same") return;
			openVenueById(action.openId);
		};
		window.addEventListener("popstate", handler);
		return () => window.removeEventListener("popstate", handler);
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	const goVenueLanding = () => {
		setVenView("landing");
		setSelectedVenue(null);
		window.history.pushState({ nav: "venues" }, "", "/venues");
	};

	const handleVenueBook = (info) => {
		if (!isAuthenticated()) {
			if (selectedVenue) redirectToSignIn(venueCheckoutReturnUrl(selectedVenue, info));
			return;
		}
		setBookingInfo(info);
		setVenView("checkout");
	};

	// Post-login checkout resume: keep checkout query until quote succeeds so refresh/fail can retry.
	useEffect(() => {
		if (!selectedVenue || !isAuthenticated() || didResumeCheckout.current) return;
		const resume = parseVenueCheckoutResumeQuery(window.location.search);
		if (!resume) return;
		let cancelled = false;
		let succeeded = false;
		didResumeCheckout.current = true;
		getBookingQuote({
			booking_listing_id: selectedVenue.id,
			start_date: resume.eventDate,
			quantity: 1,
			guests: resume.attendees,
		})
			.then((res) => {
				if (cancelled) return;
				const q = res?.data ?? res;
				const deposit = q?.deposit != null ? Number(q.deposit) : 0;
				const serviceFee = q?.service_fee ?? Math.round(selectedVenue.price * 0.1);
				const total = q?.total ?? (selectedVenue.price + serviceFee + (deposit > 0 ? deposit : 0));
				succeeded = true;
				window.history.replaceState(
					{ nav: "venues", venView: "checkout" },
					"",
					venueListingPath(selectedVenue),
				);
				setBookingInfo({
					eventDate: resume.eventDate,
					attendees: resume.attendees,
					total,
					serviceFee,
					deposit,
				});
				setVenView("checkout");
			})
			.catch(() => {
				if (!cancelled) didResumeCheckout.current = false;
			});
		return () => {
			cancelled = true;
			if (!succeeded) didResumeCheckout.current = false;
		};
	}, [selectedVenue]);

	if (venView === "detail" && selectedVenue) return <><VenueDetailPage venue={selectedVenue} onBack={goVenueLanding} onBook={handleVenueBook} /><EventCartPill bottom={24} /></>;
	if (venView === "checkout" && selectedVenue) return <VenueCheckoutPage venue={selectedVenue} bookingInfo={bookingInfo} onBack={() => setVenView("detail")} onConfirm={async (id, instant) => {
		setOrderId(id);
		setIsInstant(!!instant);
		setVenView("confirm");
		const intro = `Hi! I just booked "${selectedVenue.name ?? 'your venue'}"${bookingInfo?.eventDate ? ` for ${bookingInfo.eventDate}` : ''}. Looking forward to it!`;
		try {
			if (id && selectedVenue.hostId) {
				await messageUser(selectedVenue.hostId, { initialMessage: intro, navigate: false, sourceVertical: "venues" });
			}
		} catch { /* noop */ }
	}} />;
	if (venView === "confirm" && selectedVenue) return <VenueConfirmPage venue={selectedVenue} bookingInfo={bookingInfo} orderId={orderId} isInstant={isInstant} onDone={() => {
		setVenView("landing");
		setSelectedVenue(null);
		setBookingInfo(null);
		setOrderId(null);
		setIsInstant(false);
		setMainTab("trips");
		setTripsFetched(false);
		loadTrips();
	}} />;

	if (loading) return (
		<div style={{ flex: 1, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px" }}>
					<SkeletonHeading />
					<Skel w="100%" h={42} r={12} style={{ margin: "16px 0" }} />
					<div style={{ display: "flex", gap: 12, margin: "16px 0 28px", justifyContent: "center" }}>
						{[...Array(5)].map((_,i) => <SkeletonCircle key={i} />)}
					</div>
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
						{[...Array(6)].map((_,i) => <SkeletonVenueCard key={i} />)}
					</div>
				</div>
			</div>
		</div>
	);

	const filtered = filterVenueListings(venues, {
		category: activeCategory,
		categories,
		query,
		minPrice,
		maxPrice,
		minAttendees: browseAttendees,
		matchesCategoryFn: matchesCategory,
	}).filter((v) => venuePassesBrowseDateFilter(browseAvailByVenue.get(String(v.id)), browseEventDate));
	const featured = filtered.filter(v => v.featured);
	const rest = filtered.filter(v => !v.featured);
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingBottom: 24 }}>
			<div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 20, textAlign: "center" }}>{landingTitle}</h1>
					<div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
						<HostListingCTA vertical="venue" label={t("hostListing.venue")} onCreated={() => loadVenues()} />
					</div>
					<ConciergeEntryBanner
						to="event-plan"
						title={i18n.t("event.bannerTitle", { defaultValue: "Planning a whole event?" })}
						body={i18n.t("event.bannerBody", { defaultValue: "Book venue, catering & flowers together — one date, one cart, one checkout." })}
					/>
					<div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
						{[
							{ id: "find", label: t("venues.findVenues") },
							{ id: "trips", label: t("venues.myBookings") },
						].map((tab) => (
							<button
								key={tab.id}
								type="button"
								onClick={() => {
									setMainTab(tab.id);
									if (tab.id === "trips" && !tripsFetched) loadTrips();
								}}
								style={{
									padding: "8px 18px",
									borderRadius: 20,
									border: `1px solid ${mainTab === tab.id ? "#2563eb" : "var(--color-border)"}`,
									background: mainTab === tab.id ? "rgba(37,99,235,0.18)" : "transparent",
									color: mainTab === tab.id ? "#60a5fa" : "var(--color-text-secondary)",
									fontFamily: "'DM Sans', sans-serif",
									fontSize: 13,
									fontWeight: 700,
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
					{/* colorScheme stays "dark" regardless of theme — matches the established
					    pattern for native date/time inputs across the app: the browser's own
					    picker chrome isn't retheme'd. */}
					<div data-testid="venue-browse-filters" style={{ width: "min(680px, 100%)", margin: "12px auto 0", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "center" }}>
						<input type="date" min={todayISODate()} aria-label={t("venues.eventDateFilter")} value={browseEventDate} onChange={(e) => setBrowseEventDate(e.target.value)} className="border border-border text-text-primary" style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, colorScheme: "dark", outline: "none" }} />
						<div className="border border-border" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "6px 10px" }}>
							<span className="text-text-secondary" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{t("venues.attendeesFilter")}</span>
							<button type="button" aria-label={t("venues.decreaseAttendees")} onClick={() => setBrowseAttendees((g) => Math.max(1, g - 10))} className="border border-border text-text-primary" style={{ width: 24, height: 24, borderRadius: "50%", background: "none", cursor: "pointer" }}>−</button>
							<span aria-live="polite" aria-atomic="true" className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", minWidth: 28, textAlign: "center" }}>{browseAttendees}</span>
							<button type="button" aria-label={t("venues.increaseAttendees")} onClick={() => setBrowseAttendees((g) => Math.min(500, g + 10))} style={{ width: 24, height: 24, borderRadius: "50%", border: "none", background: "#2563eb", color: "#fff", cursor: "pointer" }}>+</button>
						</div>
						<input type="number" min="0" aria-label={t("venues.minPrice")} placeholder={t("venues.minPrice")} value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="border border-border text-text-primary" style={{ width: 92, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, outline: "none" }} />
						<input type="number" min="0" aria-label={t("venues.maxPrice")} placeholder={t("venues.maxPrice")} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="border border-border text-text-primary" style={{ width: 92, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, outline: "none" }} />
						{filtersOn && (
							<button type="button" onClick={clearFilters} className="border border-border text-text-secondary" style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
								{t("venues.clearFilters")}
							</button>
						)}
					</div>
					{browseEventDate && (
						<p className="text-text-muted" style={{ width: "min(680px, 100%)", margin: "8px auto 0", fontFamily: "'DM Sans', sans-serif", fontSize: 11, textAlign: "center" }}>
							{browseDateLoading ? t("venues.filteringByDate") : t("venues.datesFilterHint")}
						</p>
					)}
					</>
					)}
				</div>
				{mainTab === "trips" && (
					<div style={{ marginBottom: 24 }}>
						{!isAuthenticated() ? (
							<div style={{ textAlign: "center", padding: "40px 16px" }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 14 }}>{t("venues.signInForBookings")}</p>
								<button
									type="button"
									onClick={() => redirectToSignIn()}
									style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
								>
									{t("venues.signIn")}
								</button>
							</div>
						) : (
						<>
						<div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
							{[
								{ id: "all", label: t("events.categories.all") },
								{ id: "upcoming", label: t("venues.tripUpcoming") },
								{ id: "past", label: t("venues.tripPast") },
								{ id: "cancelled", label: t("venues.tripCancelled") },
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
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 0" }}>{t("venues.loadingBookings")}</p>
						) : filterVenueTripsByBucket(trips, tripBucketFilter).length === 0 ? (
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 0" }}>{t("venues.noBookings")}</p>
						) : (
							<div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720, margin: "0 auto 28px" }}>
								{filterVenueTripsByBucket(trips, tripBucketFilter).map((trip) => {
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
														trip.event_date || trip.start_date,
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
														onClick={() => openVenueById(trip.listing_id)}
														className="border border-border text-text-secondary" style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
													>
														{t("venues.viewVenue")}
													</button>
												)}
												{trip.can_rate && (
													<button
														type="button"
														onClick={() => openTripRate(trip)}
														style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
													>
														{t("venues.rateYourVenue")} ★
													</button>
												)}
												{trip.can_cancel && (
													<button
														type="button"
														disabled={cancellingId === trip.booking_id}
														onClick={() => handleCancelTrip(trip)}
														style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.12)", color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: cancellingId === trip.booking_id ? "default" : "pointer", opacity: cancellingId === trip.booking_id ? 0.6 : 1 }}
													>
														{cancellingId === trip.booking_id ? t("venues.cancelling") : t("venues.cancelBooking")}
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
				<div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 24, animation: "fadeUp 0.35s ease 60ms both" }}>
					<button
						onClick={() => catScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })}
						className={catScrollState.atStart ? "text-text-muted" : "text-text-primary"}
						style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: catScrollState.atStart ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.08)", border: `1px solid ${catScrollState.atStart ? "var(--color-border-subtle)" : "rgba(255,255,255,0.18)"}`, cursor: catScrollState.atStart ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", transition: "transform 0.12s, background 0.2s" }}
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
						style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: catScrollState.atEnd ? "rgba(255,255,255,0.03)" : "#2563eb", border: `1px solid ${catScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`, color: catScrollState.atEnd ? "var(--color-text-muted)" : "#fff", cursor: catScrollState.atEnd ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", transition: "transform 0.12s, background 0.2s", boxShadow: catScrollState.atEnd ? "none" : "0 2px 14px rgba(37,99,235,0.55)" }}
						onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
					>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</button>
				</div>
				{featured.length > 0 && (
					<div style={{ marginBottom: 32, animation: "fadeUp 0.4s ease 120ms both" }}>
						<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14, textAlign: "center" }}>{i18n.t("common.featured")}</p>
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: isMobile ? 10 : 16 }}>
							{featured.map(v => <VenueCard key={v.id} venue={v} onClick={() => openVenue(v)} />)}
						</div>
					</div>
				)}
				{rest.length > 0 && (
					<div style={{ marginBottom: 32, animation: "fadeUp 0.4s ease 180ms both" }}>
						<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14, textAlign: "center" }}>{i18n.t("venues.allVenues")}</p>
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(240px, 1fr))", gap: isMobile ? 10 : 16 }}>
							{rest.map(v => <VenueCard key={v.id} venue={v} onClick={() => openVenue(v)} />)}
						</div>
					</div>
				)}
				{filtered.length === 0 && (
					<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: loadError ? 0.7 : 0.4, paddingTop: 60, paddingBottom: 24 }}>
						<VenuesIcon s={40} />
						<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>
							{loadError
								? t("venues.loadFailed")
								: filtersOn
									? t("venues.noFilterResults")
									: t("venues.noVenuesFound")}
						</p>
						{loadError && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Please check your connection and try again.</p>}
						{!loadError && filtersOn && (
							<button type="button" onClick={clearFilters} className="border border-border text-text-secondary" style={{ marginTop: 4, padding: "8px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
								{t("venues.clearFilters")}
							</button>
						)}
					</div>
				)}
				</>
				)}
			</div>
			<EventCartPill />
			{rateTrip && (
				<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
					<div style={{ background: "#13131f", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, animation: "fadeUp 0.25s ease both" }}>
						<h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, color: "#fff", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{t("venues.rateYourVenue")}</h3>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 18 }}>{rateTrip.title}</p>
						<div style={{ display: "flex", gap: 8, marginBottom: 18, justifyContent: "center" }}>
							{[1, 2, 3, 4, 5].map((n) => (
								<button key={n} type="button" onClick={() => setTripRating(n)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
									<svg width={30} height={30} viewBox="0 0 24 24" fill={n <= tripRating ? "#f59e0b" : "none"} stroke={n <= tripRating ? "#f59e0b" : "rgba(255,255,255,0.3)"} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
								</button>
							))}
						</div>
						<textarea value={tripRatingComment} onChange={(e) => setTripRatingComment(e.target.value)} placeholder={i18n.t("common.optionalComment")} rows={3} style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 12px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 16 }} />
						{tripRateError && (
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#ef4444", marginBottom: 12 }}>{tripRateError}</p>
						)}
						<div style={{ display: "flex", gap: 10 }}>
							<button type="button" onClick={() => setRateTrip(null)} style={{ flex: 1, padding: "11px 0", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{i18n.t("ondemand.hire.skip")}</button>
							<button type="button" disabled={tripRating === 0 || tripRateSubmitting} onClick={submitTripReview} style={{ flex: 1, padding: "11px 0", background: tripRating > 0 && !tripRateSubmitting ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: tripRating > 0 ? "#fff" : "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: tripRating > 0 && !tripRateSubmitting ? "pointer" : "default" }}>{tripRateSubmitting ? "…" : i18n.t("common.submit")}</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

export { VenuesPage };
