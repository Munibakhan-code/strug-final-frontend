import React, { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { EventsIcon, SearchIcon } from "../components/icons.jsx";
import { Skel, SkeletonEventCard, SkeletonCircle, SkeletonHeading, SkeletonListRow } from "../components/skeletons.jsx";
import { LeoButton, QuickContactChat, HostListingCTA } from "../components/shared.jsx";
import { getBookingListings, getBookingListing, createBooking, getBookingQuote, getBookings, cancelBooking } from "../api/booking";
import { CardInput, useBookingPayment } from "../components/BookingPayment.jsx";
import { PayPalButtons } from "@paypal/react-paypal-js";
import { createPaypalOrder, capturePaypalOrder } from "../api/payment";
import { bindCheckoutReferralCode } from "../api/user";
import { isAuthenticated, getUser } from "../store/auth";
import { rsvpEvent } from "../api/events";
import { mapBookingListingToEvent, mapBookingListingsToEvents, eventStartDateISO } from "../utils/eventMappers.js";
import { SaveButton } from "../components/SaveButton.jsx";
import { ConciergeEntryBanner } from "../components/ConciergeEntryBanner.jsx";
import { messageUser } from "../api/chat";
import { getVerticalProfileByUser } from "../api/verticalProfile.js";
import { EVENT_PROFILE_VERTICAL, LEGACY_HOSTING_PROFILE_VERTICAL } from "../utils/bookingIsolation.js";
import { mapGuestBookingsToEventTickets, filterEventTicketsByBucket } from "../utils/eventTickets.js";
import { slugify } from "../utils/slugify.js";
import { Avatar } from "../components/SafeImage.jsx";

const EVENTS_CATEGORY_DEFS = [
	{ id: "all", labelKey: "common.all", color: "#2563eb", match: null, img: "/img/Events.jpg" },
	{ id: "music", labelKey: "events.categories.music", color: "#7c3aed", match: "Music", img: "/img/cat/video/Music.png" },
	{ id: "sports", labelKey: "events.categories.sports", color: "#059669", match: "Sports", img: "/img/cat/video/Sports.png" },
	{ id: "arts", labelKey: "events.categories.arts", color: "#d97706", match: "Arts", img: "/img/Experiences.jpg" },
	{ id: "food-drink", labelKey: "events.categories.foodDrink", color: "#dc2626", match: "Food & Drink", img: "/img/Catering.jpg" },
	{ id: "comedy", labelKey: "events.categories.comedy", color: "#db2777", match: "Comedy", img: "/img/cat/video/Comedy.png" },
	{ id: "networking", labelKey: "events.categories.networking", color: "#0891b2", match: "Networking", img: "/img/Community.jpg" },
	{ id: "family", labelKey: "events.categories.family", color: "#65a30d", match: "Family", img: "/img/Wedding.jpg" },
	{ id: "nightlife", labelKey: "events.categories.nightlife", color: "#6d28d9", match: "Nightlife", img: "/img/Live.jpg" },
];

function eventListingPath(event) {
	if (!event?.id) return "/events";
	const slug = slugify(event.title || "event");
	return `/listing/event/${event.id}${slug ? `-${slug}` : ""}`;
}

function eventSaveMeta(event) {
	return {
		title: event.title,
		sub: [event.venue, event.location].filter(Boolean).join(" · "),
		price: event.price > 0 ? `$${event.price}` : i18n.t("meet.free"),
		thumb: event.image || `linear-gradient(135deg, ${event.color} 0%, ${event.accent}66 100%)`,
		accent: event.accent,
	};
}

function EventHeroMedia({ event, featured }) {
	const h = featured ? 180 : 130;
	return (
		<div style={{ height: h, background: `linear-gradient(135deg, ${event.color} 0%, ${event.accent}44 100%)`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
			{event.image
				? <img loading="lazy" decoding="async" src={event.image} alt={event.title} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none"; }} />
				: <svg width={featured ? 48 : 36} height={featured ? 48 : 36} viewBox="0 0 24 24" fill="none" stroke={event.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
					<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
				</svg>
			}
			<div style={{ position: "absolute", top: 10, left: 10, background: `${event.accent}22`, border: `1px solid ${event.accent}55`, borderRadius: 20, padding: "3px 10px" }}>
				<span style={{ fontSize: 10, fontWeight: 600, color: event.accent, fontFamily: "'DM Sans', sans-serif" }}>{event.category}</span>
			</div>
			<SaveButton entityType="event" entityId={event.id} meta={eventSaveMeta(event)} size={30} style={{ position: "absolute", top: 10, right: 10 }} />
			{event.price === 0 && (
				<div style={{ position: "absolute", bottom: 10, right: 10, background: "#059669", borderRadius: 20, padding: "3px 10px" }}>
					<span style={{ fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("meet.free")}</span>
				</div>
			)}
		</div>
	);
}

function EventCard({ event, featured, onClick }) {
	const [hov, setHov] = useState(false);
	return (
		<div
			onClick={onClick}
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			style={{ borderRadius: 16, overflow: "hidden", background: event.color, border: `1px solid ${event.accent}33`, cursor: "pointer", transition: "transform 0.18s, box-shadow 0.18s", transform: hov ? "translateY(-3px)" : "none", boxShadow: hov ? `0 12px 32px ${event.accent}22` : "none", position: "relative" }}
		>
			<EventHeroMedia event={event} featured={featured} />
			<div style={{ padding: "12px 14px 14px" }}>
				<p style={{ fontSize: featured ? 15 : 13, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", marginBottom: 6, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{event.title}</p>
				{(event.date || event.time) && (
					<div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
						<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={event.accent} strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
						<span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif" }}>{[event.date, event.time].filter(Boolean).join(" · ")}</span>
					</div>
				)}
				{(event.venue || event.location) && (
					<div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
						<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
						<span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif" }}>{[event.venue, event.location].filter(Boolean).join(" · ")}</span>
					</div>
				)}
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
					{event.attending != null ? (
						<div style={{ display: "flex", alignItems: "center", gap: 5 }}>
							<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
							<span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif" }}>{event.attending.toLocaleString()} {i18n.t("events.attending").toLowerCase()}</span>
						</div>
					) : <div />}
					<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
						{event.price > 0 ? (
							<span style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>${event.price}</span>
						) : (
							<span style={{ fontSize: 13, fontWeight: 700, color: "#4ade80", fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("events.freeEntry")}</span>
						)}
						<div style={{ background: event.accent, borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 600, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{event.price > 0 ? i18n.t("events.buyTickets") : i18n.t("events.rsvpFree").split("—")[0].trim()}</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function EventDetailPage({ event, onBack, onBook }) {
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [qty, setQty] = useState(1);
	const maxQty = event.maxQty || 10;
	const subtotal = event.price * qty;
	const [evChat, setEvChat] = useState(false);
	const [quote, setQuote] = useState(null);
	const [quoteLoading, setQuoteLoading] = useState(false);
	const [hostProfile, setHostProfile] = useState(null);
	useEffect(() => {
		if (!event.id || event.source === "meetup") { setQuote(null); setQuoteLoading(false); return; }
		let cancelled = false;
		setQuoteLoading(true);
		getBookingQuote({ booking_listing_id: event.id, start_date: eventStartDateISO(event.date), quantity: qty })
			.then(res => { if (!cancelled) setQuote(res?.successful ? (res.data ?? null) : null); })
			.catch(() => { if (!cancelled) setQuote(null); })
			.finally(() => { if (!cancelled) setQuoteLoading(false); });
		return () => { cancelled = true; };
	}, [event.id, event.date, event.source, qty]);
	useEffect(() => {
		setHostProfile(null);
		if (!event.hostId) return;
		let alive = true;
		const uid = event.hostId;
		getVerticalProfileByUser(uid, EVENT_PROFILE_VERTICAL)
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
	}, [event.hostId]);
	const hostName = hostProfile?.display_name || hostProfile?.business_name || event.organiser;
	const hostPhoto = hostProfile?.profile_pic_url || null;
	const hostInitial = (hostName || event.avatar || "E").toString().trim().charAt(0).toUpperCase() || "E";
	const serviceFee = quote ? quote.service_fee : null;
	const total = quote ? quote.total : subtotal;
	const unavailable = !!quote && quote.available === false;
	const isMeetup = event.source === "meetup";

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflowY: "auto" }}>
			<div style={{ maxWidth: 920, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<Skel w={140} h={18} r={6} style={{ marginTop: 24, marginBottom: 20 }} />
				<Skel w="100%" h={300} r={18} style={{ marginBottom: 28 }} />
				<div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
					<div style={{ flex: 2, minWidth: 280 }}>
						<Skel w="80%" h={32} r={8} style={{ marginBottom: 14 }} />
						{[...Array(3)].map((_,i) => <Skel key={i} w="60%" h={14} r={6} style={{ marginBottom: 10 }} />)}
						<Skel w="100%" h={80} r={8} style={{ marginTop: 10 }} />
					</div>
					<div style={{ flex: 1, minWidth: 240 }}>
						<Skel w="100%" h={220} r={18} />
					</div>
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 920, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<button onClick={onBack} className="text-text-secondary" style={{ marginTop: 24, marginBottom: 20, display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}>
					<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					{i18n.t("events.backToEvents")}
				</button>
				<div style={{ height: 300, borderRadius: 18, background: `linear-gradient(135deg, ${event.color} 0%, ${event.accent}66 100%)`, position: "relative", overflow: "hidden", marginBottom: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
					{event.image
						? <img src={event.image} alt={event.title} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none"; }} />
						: <svg width={64} height={64} viewBox="0 0 24 24" fill="none" stroke={event.accent} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
					}
					<div style={{ position: "absolute", top: 14, left: 14, background: `${event.accent}22`, border: `1px solid ${event.accent}55`, borderRadius: 20, padding: "5px 14px" }}>
						<span style={{ fontSize: 11, fontWeight: 700, color: event.accent, fontFamily: "'DM Sans', sans-serif" }}>{event.category}</span>
					</div>
					<SaveButton entityType="event" entityId={event.id} meta={eventSaveMeta(event)} style={{ position: "absolute", bottom: 14, right: 14 }} />
					{event.price === 0 && (
						<div style={{ position: "absolute", top: 14, right: 14, background: "#059669", borderRadius: 20, padding: "5px 14px" }}>
							<span style={{ fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("meet.free")}</span>
						</div>
					)}
				</div>
				<div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
					<div style={{ flex: 2, minWidth: 280 }}>
						<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: "0.02em", marginBottom: 14, lineHeight: 1.2 }}>{event.title}</h1>
						<div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--color-border-subtle)" }}>
							{(event.date || event.time) && (
								<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
									<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={event.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
									<span className="text-text-primary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>{[event.date, event.time].filter(Boolean).join(" · ")}</span>
								</div>
							)}
							{(event.venue || event.location) && (
								<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
									<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
									<span className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{[event.venue, event.location].filter(Boolean).join(" · ")}</span>
								</div>
							)}
							{event.attending != null && (
								<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
									<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
									<span className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{event.attending.toLocaleString()} {i18n.t("events.attending").toLowerCase()}</span>
								</div>
							)}
						</div>
						{(hostName || event.hostId) && (
							<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
								<div
									onClick={() => { if (event.hostId) { window.__profileTargetId = event.hostId; window.__profileVertical = EVENT_PROFILE_VERTICAL; window.__nav?.("profile"); } }}
									style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, cursor: event.hostId ? "pointer" : "default" }}
								>
									<Avatar url={hostPhoto} initials={hostInitial} size={44} alt="" style={{ background: event.avatarColor, fontSize: 18, fontWeight: 800 }} />
									<div>
										<p style={{ fontSize: 13, fontWeight: 700, color: event.hostId ? "#60a5fa" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("events.organisedBy")}{hostName ? ` ${hostName}` : ""}</p>
										<p className="text-text-secondary" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{event.hostId ? i18n.t("events.viewProfile") : i18n.t("events.eventOrganiser")}</p>
									</div>
								</div>
							</div>
						)}
						{event.description ? (
							<p className="text-text-secondary" style={{ fontSize: 14, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.75, marginBottom: 20, whiteSpace: "pre-wrap" }}>
								{event.description}
							</p>
						) : null}
						<button onClick={() => setEvChat(v => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: evChat ? "rgba(37,99,235,0.12)" : "rgba(255,255,255,0.06)", border: `1px solid ${evChat ? "rgba(37,99,235,0.3)" : "var(--color-border)"}`, borderRadius: 10, padding: "10px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: evChat ? "#60a5fa" : "var(--color-text-secondary)", cursor: "pointer", marginBottom: 16, transition: "all 0.15s" }}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
							{evChat ? i18n.t("events.closeChat") : i18n.t("events.contactOrganiser")}
						</button>
						{evChat && <div style={{ marginBottom: 16 }}><QuickContactChat toName={hostName || i18n.t("events.eventOrganiser")} context={event.title} onClose={() => setEvChat(false)} /></div>}
					</div>
					<div className="bg-surface-raised border border-border" style={{ flex: 1, minWidth: 240, borderRadius: 18, padding: 22, position: "sticky", top: 20 }}>
						<div style={{ marginBottom: 16 }}>
							{event.price > 0 ? (
								<div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
									<span className="text-text-primary" style={{ fontSize: 26, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>${event.price}</span>
									<span className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>/ {i18n.t("events.ticketUnit")}</span>
								</div>
							) : (
								<span style={{ fontSize: 22, fontWeight: 800, color: "#4ade80", fontFamily: "'Barlow Condensed', sans-serif" }}>{i18n.t("events.freeAdmission")}</span>
							)}
						</div>
						{!isMeetup && (
						<div style={{ marginBottom: 16 }}>
							<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>{i18n.t("events.ticketsLabel")}</p>
							<div style={{ display: "flex", alignItems: "center", gap: 14 }}>
								<button onClick={() => setQty(q => Math.max(1, q - 1))} className="border border-border text-text-primary" style={{ width: 32, height: 32, borderRadius: "50%", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>−</button>
								<span className="text-text-primary" style={{ fontSize: 18, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", minWidth: 20, textAlign: "center" }}>{qty}</span>
								<button onClick={() => setQty(q => Math.min(maxQty, q + 1))} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: event.accent, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>+</button>
							</div>
							{event.price > 0 && (
								<div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(255,255,255,0.05)", borderRadius: 10 }}>
									<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
										<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${event.price} × {qty}</span>
										<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>${quote ? quote.subtotal : subtotal}</span>
									</div>
									<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
										<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("common.serviceFee")}</span>
										<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{serviceFee != null ? `$${serviceFee}` : "—"}</span>
									</div>
									<div style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 8, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
										<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("ondemand.hire.total")}</span>
										<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>${total}</span>
									</div>
									{unavailable && quote.reason && (
										<p style={{ fontSize: 12, color: "#f87171", fontFamily: "'DM Sans', sans-serif", marginTop: 8, marginBottom: 0 }}>{quote.reason}</p>
									)}
								</div>
							)}
							{event.price === 0 && unavailable && quote?.reason && (
								<p style={{ fontSize: 12, color: "#f87171", fontFamily: "'DM Sans', sans-serif", marginTop: 8, marginBottom: 0 }}>{quote.reason}</p>
							)}
						</div>
						)}
						<button onClick={() => onBook({ qty: isMeetup ? 1 : qty, total: event.price > 0 ? total : 0, service_fee: serviceFee })} disabled={!isMeetup && (quoteLoading || unavailable)} style={{ width: "100%", background: (!isMeetup && (quoteLoading || unavailable)) ? "rgba(255,255,255,0.12)" : event.accent, border: "none", borderRadius: 12, padding: "14px 0", color: (!isMeetup && (quoteLoading || unavailable)) ? "var(--color-text-secondary)" : "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: (!isMeetup && (quoteLoading || unavailable)) ? "default" : "pointer", marginTop: 4 }}>
							{event.price === 0 ? i18n.t("events.rsvpFree") : isMeetup ? i18n.t("events.rsvpFree") : quoteLoading ? i18n.t("events.checkingAvailability") : unavailable ? (quote.reason || i18n.t("common.unavailable")) : i18n.t("events.getTickets", { total })}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function EventCheckoutPage({ event, bookingInfo, onBack, onConfirm }) {
	const { isMobile } = useViewport();
	const payBooking = useBookingPayment();
	const [payMethod, setPayMethod] = useState("card");
	const [refCode, setRefCode] = useState("");
	const [refApplied, setRefApplied] = useState(false);
	const [refLoading, setRefLoading] = useState(false);
	const [refError, setRefError] = useState(null);
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState("");
	const isFree = event.price === 0;
	const isMeetup = event.source === "meetup";

	function bookingPayload(paymentMethod) {
		const payload = {
			booking_listing_id: event.id,
			start_date: eventStartDateISO(event.date),
			quantity: bookingInfo.qty || 1,
			guests: bookingInfo.qty || 1,
			notes: `${bookingInfo.qty || 1} ticket(s)`,
		};
		if (paymentMethod) payload.payment_method = paymentMethod;
		return payload;
	}

	async function handleConfirm() {
		if (!isAuthenticated()) {
			setSubmitError(i18n.t("events.loginToBook"));
			return;
		}
		if (!isFree && !isMeetup && payMethod !== "card") {
			setSubmitError(i18n.t("events.payPalUseButton"));
			return;
		}
		setSubmitting(true); setSubmitError("");
		try {
			if (isMeetup) {
				const uid = getUser()?.id ?? getUser()?.user_id;
				if (!uid) {
					setSubmitError(i18n.t("events.loginToBook"));
					setSubmitting(false);
					return;
				}
				const order = await rsvpEvent({ meetup_event_id: event.id, user_id: uid, role: "attendee" });
				onConfirm(order?._id ?? order?.id ?? order?.meetup_attendee_id ?? null, true);
				return;
			}
			const res = await createBooking(bookingPayload(isFree ? null : "card"));
			const booking = res?.data ?? res;
			if (!booking?.booking_id) {
				setSubmitError(i18n.t("events.unableConfirm"));
				setSubmitting(false);
				return;
			}
			if (!isFree) {
				const pay = await payBooking(booking.booking_id);
				if (!pay.ok) { setSubmitError(pay.error); setSubmitting(false); return; }
			}
			onConfirm(booking.booking_id, booking.status === "confirmed");
		} catch (err) {
			const status = err?.response?.status;
			setSubmitError(
				err?.response?.data?.message ||
				(status === 409 ? i18n.t("events.soldOutMsg") :
				 status === 401 ? i18n.t("events.loginToBook") :
				 status === 403 ? i18n.t("events.notAllowedBook") :
				 i18n.t("events.unableConfirm"))
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
				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 24 }}>{isFree ? i18n.t("events.confirmRsvp") : i18n.t("events.completePurchase")}</h2>
				<div className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 16, padding: 20, marginBottom: 20 }}>
					<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{i18n.t("events.yourOrder")}</p>
					<p className="text-text-primary" style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>{event.title}</p>
					<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{[event.date, event.time].filter(Boolean).join(" · ")}</p>
					<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}>{[event.venue, event.location].filter(Boolean).join(" · ")}</p>
					<div style={{ display: "flex", justifyContent: "space-between", marginBottom: isFree ? 0 : 4 }}>
						<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("events.ticketsLabel")} × {bookingInfo.qty}</span>
						<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{isFree ? i18n.t("events.freeEntry") : `$${event.price * bookingInfo.qty}`}</span>
					</div>
					{!isFree && (
						<>
							<div style={{ height: 1, background: "var(--color-border-subtle)", margin: "12px 0" }} />
							<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
								<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("common.serviceFee")}</span>
								<span className="text-text-primary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{bookingInfo.service_fee != null ? `$${bookingInfo.service_fee}` : `$${Math.max(0, bookingInfo.total - event.price * bookingInfo.qty)}`}</span>
							</div>
							<div style={{ display: "flex", justifyContent: "space-between" }}>
								<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("ondemand.hire.total")}</span>
								<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>${bookingInfo.total}</span>
							</div>
						</>
					)}
				</div>
				<div className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 16, padding: 20, marginBottom: 20 }}>
					<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{i18n.t("tempstay.referralCode")}</p>
					<div style={{ display: "flex", gap: 10 }}>
						<input value={refCode} onChange={e => { setRefCode(e.target.value); setRefApplied(false); setRefError(null); }} placeholder={i18n.t("events.referralPlaceholder")} className="border border-border text-text-primary" style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 9, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", caretColor: "#2563eb" }} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
						<button onClick={async () => { if (!refCode.trim() || refLoading || refApplied) return; setRefLoading(true); setRefError(null); try { await bindCheckoutReferralCode(refCode.trim()); setRefApplied(true); } catch (e) { setRefError(e?.response?.data?.message || i18n.t("events.invalidReferral")); } finally { setRefLoading(false); } }} style={{ padding: "10px 16px", background: refCode.trim() ? "#2563eb" : "rgba(255,255,255,0.06)", border: "none", borderRadius: 9, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: refCode.trim() ? "#fff" : "var(--color-text-muted)", cursor: refCode.trim() ? "pointer" : "default" }}>{refApplied ? i18n.t("events.applied") : refLoading ? "…" : i18n.t("common.apply")}</button>
					</div>
					{refError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginTop: 6 }}>{refError}</p>}
				</div>
				{!isFree && !isMeetup && (
					<div className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 16, padding: 20, marginBottom: 24 }}>
						<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>{i18n.t("common.paymentMethod")}</p>
						{["card", "paypal"].map(m => (
							<label key={m} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 10 }}>
								<input type="radio" name="evpay" checked={payMethod === m} onChange={() => { setPayMethod(m); setSubmitError(""); }} style={{ accentColor: "#2563eb" }} />
								<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
									{m === "card" ? i18n.t("events.creditCard") : i18n.t("events.paypal")}
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
										if (!isAuthenticated()) { setSubmitError(i18n.t("events.loginToBook")); throw new Error("not authenticated"); }
										setSubmitError("");
										const { id } = await createPaypalOrder(Number(bookingInfo.total || 0).toFixed(2), {
											purpose: "booking",
											vertical: "events",
										});
										return id;
									}}
									onApprove={async (data) => {
										setSubmitting(true);
										setSubmitError("");
										let bookingCreated = false;
										let createdBookingId = null;
										try {
											const res = await createBooking(bookingPayload("paypal"));
											const booking = res?.data ?? res;
											if (!booking?.booking_id) throw new Error("no booking id");
											bookingCreated = true;
											createdBookingId = booking.booking_id;
											await capturePaypalOrder(data.orderID);
											onConfirm(booking.booking_id, booking.status === "confirmed");
										} catch (e) {
											if (bookingCreated && createdBookingId) {
												setSubmitError(i18n.t("events.paypalCaptureFailed", { id: createdBookingId }));
											} else {
												const status = e?.response?.status;
												setSubmitError(
													e?.response?.data?.message ||
													(status === 409 ? i18n.t("events.soldOutMsg") :
													 status === 401 ? i18n.t("events.loginToBook") :
													 status === 403 ? i18n.t("events.notAllowedBook") :
													 i18n.t("events.unableConfirm"))
												);
											}
										} finally {
											setSubmitting(false);
										}
									}}
									onError={() => setSubmitError(i18n.t("events.paypalFailed"))}
								/>
							</div>
						)}
					</div>
				)}
				{submitError && <p style={{ fontSize: 12, color: "#ef4444", fontFamily: "'DM Sans', sans-serif", marginBottom: 10, textAlign: "center" }}>{submitError}</p>}
				{(isFree || isMeetup || payMethod !== "paypal") && (
					<button onClick={handleConfirm} disabled={submitting} style={{ width: "100%", background: submitting ? "rgba(37,99,235,0.5)" : event.accent, border: "none", borderRadius: 14, padding: "16px 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700, cursor: submitting ? "default" : "pointer" }}>
						{submitting ? i18n.t("events.confirming") : (isFree || isMeetup) ? i18n.t("events.confirmRsvp") : i18n.t("events.payAmount", { total: bookingInfo.total })}
					</button>
				)}
			</div>
		</div>
	);
}

function TicketQr({ value }) {
	const canvasRef = useCallback((node) => {
		if (!node || !value) return;
		QRCode.toCanvas(node, value, { width: 120, margin: 1, color: { dark: "#000", light: "#fff" } }).catch(() => {});
	}, [value]);
	if (!value) return null;
	return (
		<div style={{ background: "#fff", borderRadius: 12, display: "inline-block", padding: 8, margin: "0 auto 12px" }}>
			<canvas ref={canvasRef} style={{ display: "block" }} />
		</div>
	);
}

function EventConfirmPage({ event, bookingInfo, onDone, orderId, isConfirmed = true }) {
	const { isMobile } = useViewport();
	const ref = orderId ? `EVT-${orderId}`.toUpperCase() : null;
	const qrValue = isConfirmed && orderId ? `STRUG-EVT-${orderId}` : null;
	const isFree = event.price === 0;
	const headline = isConfirmed
		? (isFree ? i18n.t("events.registered") : i18n.t("events.ticketsConfirmed"))
		: i18n.t("events.requestSubmitted");
	const body = isConfirmed
		? (isFree ? i18n.t("events.rsvpReadyBody") : i18n.t("events.ticketReadyBody"))
		: i18n.t("events.awaitingHostBody");
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 40, paddingBottom: 24, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflowY: "auto" }}>
			<div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
				<div style={{ width: 72, height: 72, borderRadius: "50%", background: `${event.accent}20`, border: `2px solid ${event.accent}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
					<svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={event.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				</div>
				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8 }}>{headline}</h2>
				<p className="text-text-secondary" style={{ fontSize: 14, fontFamily: "'DM Sans', sans-serif", marginBottom: 28 }}>{body}</p>
				<div className="bg-surface-raised" style={{ border: `1px solid ${event.accent}33`, borderRadius: 18, overflow: "hidden", marginBottom: 20, textAlign: "left" }}>
					<div style={{ height: 8, background: `linear-gradient(90deg, ${event.accent}, ${event.accent}55)` }} />
					<div style={{ padding: 24 }}>
						<p className="text-text-primary" style={{ fontSize: 16, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>{event.title}</p>
						<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{[event.date, event.time].filter(Boolean).join(" · ")}</p>
						<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 20 }}>{[event.venue, event.location].filter(Boolean).join(" · ")}</p>
						{qrValue && (
							<div style={{ textAlign: "center" }}>
								<TicketQr value={qrValue} />
								<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>{i18n.t("events.scanAtDoor")}</p>
							</div>
						)}
						<div style={{ borderTop: "1px dashed var(--color-border)", paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
							<div>
								<p className="text-text-muted" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{i18n.t("common.bookingReference")}</p>
								<p style={{ fontSize: 16, fontWeight: 800, color: event.accent, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.12em" }}>{ref || "—"}</p>
								{!isConfirmed && (
									<div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
										<div style={{ width: 7, height: 7, borderRadius: "50%", background: "#f59e0b" }} />
										<span style={{ fontSize: 12, color: "#f59e0b", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>{i18n.t("venues.awaitingHost")}</span>
									</div>
								)}
							</div>
							<div style={{ textAlign: "right" }}>
								<p className="text-text-muted" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{i18n.t("events.ticketsLabel")}</p>
								<p className="text-text-primary" style={{ fontSize: 16, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{bookingInfo.qty}x</p>
							</div>
						</div>
					</div>
				</div>
				<button onClick={onDone} className="border border-border text-text-primary" style={{ width: "100%", background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: "14px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
					{i18n.t("events.backToEvents")}
				</button>
			</div>
		</div>
	);
}

function EventsPage({ initialListingId } = {}) {
	const { t, landingTitle, searchPlaceholder } = usePageI18n("events");
	const categories = useI18nCategoryList(EVENTS_CATEGORY_DEFS);
	const { isMobile } = useViewport();
	const [activeCategory, setActiveCategory] = useState("all");
	const loading = usePageLoad();

	const [query, setQuery] = useState("");
	const [mainTab, setMainTab] = useState("find");
	const [evView, setEvView] = useState("landing");
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [evView]);
	const [selectedEvent, setSelectedEvent] = useState(null);
	const [bookingInfo, setBookingInfo] = useState(null);
	const [orderId, setOrderId] = useState(null);
	const [orderConfirmed, setOrderConfirmed] = useState(false);
	const [events, setEvents] = useState([]);
	const [loadError, setLoadError] = useState(false);
	const [tickets, setTickets] = useState([]);
	const [ticketBucketFilter, setTicketBucketFilter] = useState("all");
	const [ticketsLoading, setTicketsLoading] = useState(false);
	const [ticketsFetched, setTicketsFetched] = useState(false);
	const [cancellingId, setCancellingId] = useState(null);
	const [ticketError, setTicketError] = useState("");
	const didEventColdLoad = useRef(false);

	const loadEvents = useCallback(() => {
		return getBookingListings({ vertical: "event" }).then(res => {
			const arr = Array.isArray(res) ? res : (res?.data ?? []);
			setLoadError(false);
			setEvents(mapBookingListingsToEvents(arr));
		}).catch(() => {
			setLoadError(true);
		});
	}, []);
	useEffect(() => { loadEvents(); }, [loadEvents]);

	const loadTickets = useCallback(() => {
		if (!isAuthenticated()) {
			setTickets([]);
			setTicketsLoading(false);
			setTicketsFetched(true);
			setTicketError("");
			return;
		}
		setTicketsLoading(true);
		setTicketError("");
		getBookings({ role: "guest", vertical: "event" })
			.then((r) => {
				const arr = Array.isArray(r) ? r : (r?.data ?? []);
				setTickets(mapGuestBookingsToEventTickets(arr));
			})
			.catch(() => setTicketError(t("events.ticketsLoadFailed")))
			.finally(() => { setTicketsLoading(false); setTicketsFetched(true); });
	}, [t]);

	const handleCancelTicket = async (ticket) => {
		if (!ticket?.booking_id || !ticket.can_cancel) return;
		if (!window.confirm(t("events.cancelConfirm"))) return;
		setCancellingId(ticket.booking_id);
		setTicketError("");
		try {
			await cancelBooking(ticket.booking_id, "Guest cancelled from My tickets");
			setTickets((prev) => prev.map((x) =>
				x.booking_id === ticket.booking_id
					? { ...x, status: "cancelled", can_cancel: false, bucket: "cancelled" }
					: x
			));
		} catch {
			setTicketError(t("events.cancelFailed"));
		} finally {
			setCancellingId(null);
		}
	};

	const openEvent = (event) => {
		setSelectedEvent(event);
		setEvView("detail");
		if (event?.id != null) {
			window.history.pushState({ nav: "events" }, "", eventListingPath(event));
		}
	};

	const openEventById = (id) => {
		if (!id) return;
		const cached = events.find((e) => String(e.id) === String(id));
		if (cached) {
			setTicketError("");
			openEvent(cached);
			return;
		}
		setTicketError("");
		getBookingListing(id).then((res) => {
			const row = res?.data ?? res;
			if (!row || (row.vertical && row.vertical !== "event")) {
				setTicketError(t("events.viewEventFailed"));
				return;
			}
			const mapped = mapBookingListingToEvent(row);
			if (mapped) openEvent(mapped);
			else setTicketError(t("events.viewEventFailed"));
		}).catch(() => {
			setTicketError(t("events.viewEventFailed"));
		});
	};

	useEffect(() => {
		const pending = window.__pendingListingId;
		const pendingVertical = window.__pendingListingVertical;
		if (pending && (!pendingVertical || pendingVertical === "event" || pendingVertical === "events")) {
			if (didEventColdLoad.current) return;
			didEventColdLoad.current = true;
			delete window.__pendingListingId;
			delete window.__pendingListingVertical;
			openEventById(pending);
			return;
		}
		const tok = window.location.pathname.match(/^\/listing\/events?\/([^/-]+)/)?.[1] || initialListingId;
		if (!tok || didEventColdLoad.current) return;
		didEventColdLoad.current = true;
		openEventById(tok);
	}, [initialListingId]); // eslint-disable-line react-hooks/exhaustive-deps

	const closeDetail = () => {
		setEvView("landing");
		setSelectedEvent(null);
		window.history.pushState({ nav: "events" }, "", "/events");
	};

	if (evView === "detail" && selectedEvent) return <EventDetailPage event={selectedEvent} onBack={closeDetail} onBook={info => { setBookingInfo(info); setEvView("checkout"); }} />;
	if (evView === "checkout" && selectedEvent) return <EventCheckoutPage event={selectedEvent} bookingInfo={bookingInfo} onBack={() => setEvView("detail")} onConfirm={async (id, confirmed) => {
		setOrderId(id);
		setOrderConfirmed(!!confirmed);
		setEvView("confirm");
		try {
			if (id && selectedEvent.hostId) {
				await messageUser(selectedEvent.hostId, {
					initialMessage: `Hi! I just booked "${selectedEvent.title ?? "your event"}"${bookingInfo?.qty ? ` (${bookingInfo.qty} ticket${bookingInfo.qty > 1 ? "s" : ""})` : ""}. Looking forward to it!`,
					navigate: false,
				});
			}
		} catch { /* noop */ }
	}} />;
	if (evView === "confirm" && selectedEvent) return <EventConfirmPage event={selectedEvent} bookingInfo={bookingInfo} orderId={orderId} isConfirmed={orderConfirmed} onDone={() => {
		setEvView("landing");
		setSelectedEvent(null);
		setBookingInfo(null);
		setOrderId(null);
		setOrderConfirmed(false);
		setMainTab("tickets");
		setTicketsFetched(false);
		loadTickets();
		window.history.pushState({ nav: "events" }, "", "/events");
	}} />;

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, minHeight: 0 }}>
			<div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px" }}>
					<SkeletonHeading />
					<Skel w="100%" h={42} r={12} style={{ margin: "16px 0" }} />
					<div style={{ display: "flex", gap: 20, margin: "20px 0 28px", justifyContent: "center" }}>
						{[...Array(8)].map((_,i) => <SkeletonCircle key={i} />)}
					</div>
				</div>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 32, justifyContent: "center" }}>
					{[...Array(3)].map((_,i) => <SkeletonEventCard key={i} featured />)}
				</div>
				<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
					{[...Array(4)].map((_,i) => <SkeletonListRow key={i} />)}
				</div>
			</div>
		</div>
	);

	const filtered = events.filter(e => {
		const matchCat = matchesCategory(activeCategory, e.category, categories);
		const q = query.toLowerCase();
		const matchQ = !query || e.title.toLowerCase().includes(q) || (e.venue || "").toLowerCase().includes(q) || (e.location || "").toLowerCase().includes(q);
		return matchCat && matchQ;
	});
	const featured = filtered.filter(e => e.featured);
	const rest = filtered.filter(e => !e.featured);
	const visibleTickets = filterEventTicketsByBucket(tickets, ticketBucketFilter);

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingBottom: 24 }}>
			<div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", margin: "0 0 14px", textAlign: "center" }}>{landingTitle}</h1>
					<div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
						<button onClick={() => window.__nav("sd-events")} className="border border-border text-text-primary" style={{ background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: "8px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
							{t("events.manageMyEvents", { defaultValue: "Manage My Events" })}
						</button>
						<HostListingCTA vertical="event" label={t("events.listYourEvent")} onCreated={loadEvents} />
					</div>
					<ConciergeEntryBanner
						title={t("events.conciergeCtaTitle")}
						body={t("events.conciergeCtaBody")}
					/>
					<div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
						{[
							{ id: "find", label: t("events.findEvents") },
							{ id: "tickets", label: t("events.myTickets") },
						].map((tab) => (
							<button
								key={tab.id}
								type="button"
								onClick={() => {
									setMainTab(tab.id);
									if (tab.id === "tickets" && !ticketsFetched) loadTickets();
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
					<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
						<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
							<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={20} /></div>
							<input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} />
						</div>
					</div>
					)}
				</div>
				{ticketError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#ef4444", textAlign: "center", marginBottom: 12 }}>{ticketError}</p>}
				{mainTab === "tickets" && (
					<div style={{ marginBottom: 24 }}>
						{!isAuthenticated() ? (
							<div style={{ textAlign: "center", padding: "40px 16px" }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 14 }}>{t("events.signInForTickets")}</p>
								<button
									type="button"
									onClick={() => {
										try { sessionStorage.setItem("strug_return_to", window.location.pathname + window.location.search); } catch { /* ignore */ }
										window.location.href = import.meta.env.VITE_LOGIN_URL ?? "https://strug.ca/en/login";
									}}
									style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
								>
									{t("events.signIn")}
								</button>
							</div>
						) : (
						<>
						<div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
							{[
								{ id: "all", label: t("events.categories.all") },
								{ id: "upcoming", label: t("events.tripUpcoming") },
								{ id: "past", label: t("events.tripPast") },
								{ id: "cancelled", label: t("events.tripCancelled") },
							].map((f) => (
								<button
									key={f.id}
									type="button"
									onClick={() => setTicketBucketFilter(f.id)}
									style={{
										padding: "6px 14px",
										borderRadius: 16,
										border: `1px solid ${ticketBucketFilter === f.id ? "#2563eb" : "var(--color-border)"}`,
										background: ticketBucketFilter === f.id ? "rgba(37,99,235,0.15)" : "transparent",
										color: ticketBucketFilter === f.id ? "#60a5fa" : "var(--color-text-secondary)",
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
						{ticketsLoading ? (
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 0" }}>{t("events.loadingTickets")}</p>
						) : visibleTickets.length === 0 ? (
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "40px 0" }}>{t("events.noTickets")}</p>
						) : (
							<div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720, margin: "0 auto 28px" }}>
								{visibleTickets.map((ticket) => {
									const statusColor = ticket.status === "confirmed" || ticket.status === "in_progress"
										? "#22c55e"
										: ticket.status === "cancelled" || ticket.status === "declined"
											? "#ef4444"
											: "#f59e0b";
									return (
										<div key={ticket.booking_id} className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
											<div style={{ flex: 1, minWidth: 180 }}>
												<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14 }}>{ticket.title}</p>
												<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 4 }}>
													{[
														ticket.location,
														ticket.event_date || ticket.start_date,
														ticket.quantity > 1 ? `${ticket.quantity}×` : null,
													].filter(Boolean).join(" · ")}
												</p>
												{ticket.total != null && ticket.total > 0 && (
													<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 2 }}>${Number(ticket.total).toLocaleString()}</p>
												)}
											</div>
											<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
												<span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: `${statusColor}22`, color: statusColor, textTransform: "capitalize" }}>{ticket.status?.replace(/_/g, " ")}</span>
												{ticket.listing_id && (
													<button
														type="button"
														onClick={() => openEventById(ticket.listing_id)}
														className="border border-border text-text-secondary" style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
													>
														{t("events.viewEvent")}
													</button>
												)}
												{ticket.can_cancel && (
													<button
														type="button"
														disabled={cancellingId === ticket.booking_id}
														onClick={() => handleCancelTicket(ticket)}
														style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.12)", color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: cancellingId === ticket.booking_id ? "default" : "pointer", opacity: cancellingId === ticket.booking_id ? 0.6 : 1 }}
													>
														{cancellingId === ticket.booking_id ? t("events.cancelling") : t("events.cancelTicket")}
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
				<div style={{ position: "relative", marginBottom: 24, animation: "fadeUp 0.35s ease 60ms both" }}>
					<div style={{ display: "flex", gap: 20, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none", msOverflowStyle: "none", justifyContent: isMobile ? "flex-start" : "center" }}>
						{categories.map((cat, i) => (
							<LeoButton key={cat.id} cat={cat} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 30} />
						))}
					</div>
					{isMobile && (
						<div style={{ position: "absolute", right: 0, top: 0, bottom: 4, width: 48, background: "linear-gradient(to left, var(--color-bg) 20%, transparent 100%)", display: "flex", alignItems: "center", justifyContent: "flex-end", pointerEvents: "none" }}>
							<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
						</div>
					)}
				</div>
				{loadError && (
					<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#f87171", textAlign: "center", marginBottom: 16 }}>{t("events.loadFailed")}</p>
				)}
				{featured.length > 0 && (
					<div style={{ marginBottom: 32, animation: "fadeUp 0.4s ease 120ms both" }}>
						<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14, textAlign: "center" }}>{i18n.t("common.featured")}</p>
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: isMobile ? 10 : 16 }}>
							{featured.map(e => <EventCard key={e.id} event={e} featured onClick={() => openEvent(e)} />)}
						</div>
					</div>
				)}
				{rest.length > 0 && (
					<div style={{ marginBottom: 32, animation: "fadeUp 0.4s ease 180ms both" }}>
						<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14, textAlign: "center" }}>{t("events.upcoming")}</p>
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(240px, 1fr))", gap: isMobile ? 10 : 16 }}>
							{rest.map(e => <EventCard key={e.id} event={e} onClick={() => openEvent(e)} />)}
						</div>
					</div>
				)}
				{filtered.length === 0 && !loadError && (
					<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: 0.4, paddingTop: 60, paddingBottom: 24 }}>
						<EventsIcon s={40} />
						<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>{t("events.noEventsFound")}</p>
					</div>
				)}
				</>
				)}
			</div>
		</div>
	);
}

export { EventsPage, EventDetailPage, EventCheckoutPage, EventConfirmPage };
