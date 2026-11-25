import React, { useState, useEffect, useMemo } from "react";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import { getMeetupEvents } from '../api/meetup';
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon, MeetIcon } from "../components/icons.jsx";
import {Skel, SkeletonCircle, SkeletonHeading, SkeletonEventCard, SkeletonListRow} from "../components/skeletons.jsx";
import { LeoButton, ODCategoryBubble } from "../components/shared.jsx";
import { EventDetailPage, EventCheckoutPage, EventConfirmPage } from "./Events.jsx";

const MEET_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#2563eb", match: null },
	{ id: "tech", labelKey: "meet.categories.tech", color: "#7c3aed", match: "Tech" },
	{ id: "fitness", labelKey: "meet.categories.fitness", color: "#059669", match: "Fitness" },
	{ id: "arts", labelKey: "events.categories.arts", color: "#db2877", match: "Arts" },
	{ id: "business", labelKey: "learn.categories.business", color: "#d97706", match: "Business" },
	{ id: "social", labelKey: "meet.categories.social", color: "#0891b2", match: "Social" },
	{ id: "outdoors", labelKey: "meet.categories.outdoors", color: "#65a30d", match: "Outdoors" },
	{ id: "food-drink", labelKey: "events.categories.foodDrink", color: "#dc2626", match: "Food & Drink" },
];

function mapMeetupApiEvent(e) {
	const start = e.meetup_event_start_time ? new Date(e.meetup_event_start_time) : null;
	const startOk = start && !Number.isNaN(start.getTime());
	const imgs = Array.isArray(e.meetup_event_image) ? e.meetup_event_image.map((i) => i.image_url).filter(Boolean) : [];
	const attendees = Array.isArray(e.meetup_attendees) ? e.meetup_attendees.length : 0;
	return {
		id: e.meetup_event_id,
		source: "meetup",
		title: e.meetup_event_name || e.event_name || i18n.t("meet.defaultMeetup"),
		venue: e.meetup_event_location || e.location || "",
		date: startOk ? start.toDateString() : (e.event_date ? new Date(e.event_date).toDateString() : ""),
		time: startOk ? start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : (e.event_time || ""),
		category: e.meetup_category?.meetup_category_name || e.meetup_category?.category_name || "Social",
		price: Number(e.meetup_event_price ?? e.price) || 0,
		attendees,
		capacity: Number(e.meetup_event_max_attendees ?? e.capacity) || null,
		image: imgs[0] ?? null,
		description: e.meetup_event_description || e.description || null,
		thumb: "linear-gradient(135deg, #1e3a5f, #0f2744)",
		accent: "#2563eb",
		featured: false,
	};
}

function MeetPage() {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("meet");
	const categories = useI18nCategoryList(MEET_CATEGORY_DEFS);
	const { isMobile } = useViewport();
	const [activeCategory, setActiveCategory] = useState("all");
	const loading = usePageLoad();

	const [query, setQuery] = useState("");
	const [meetView, setMeetView] = useState("landing");
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [meetView]);
	const [selectedEvent, setSelectedEvent] = useState(null);
	const [bookingInfo, setBookingInfo] = useState(null);
	const [orderId, setOrderId] = useState(null);
	const [meetEvents, setMeetEvents] = useState([]);
	const [eventsError, setEventsError] = useState("");
	const [eventsLoaded, setEventsLoaded] = useState(false);
	useEffect(() => {
		let mounted = true;
		getMeetupEvents().then(r => {
			if (!mounted) return;
			if (Array.isArray(r) && r.length) {
				setMeetEvents(r.map(mapMeetupApiEvent));
				setEventsError("");
			} else {
				setMeetEvents([]);
				setEventsError("");
			}
		}).catch(() => {
			if (!mounted) return;
			setMeetEvents([]);
			setEventsError(i18n.t("meet.loadFailed", { defaultValue: "Couldn't load meetups. Try again later." }));
		}).finally(() => {
			if (mounted) setEventsLoaded(true);
		});
		return () => { mounted = false; };
	}, []);

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px" }}>
					<SkeletonHeading />
					<Skel w="100%" h={42} r={12} style={{ margin: "16px 0" }} />
					<div style={{ display: "flex", gap: 20, margin: "20px 0 28px" }}>
						{[...Array(8)].map((_,i) => <SkeletonCircle key={i} />)}
					</div>
				</div>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 32 }}>
					{[...Array(3)].map((_,i) => <SkeletonEventCard key={i} featured />)}
				</div>
				<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
					{[...Array(4)].map((_,i) => <SkeletonListRow key={i} />)}
				</div>
			</div>
		</div>
	);

	// Reuse EventDetailPage, EventCheckoutPage, EventConfirmPage — same structure
	if (meetView === "detail" && selectedEvent) return <EventDetailPage event={{...selectedEvent, attending: selectedEvent.attendees, location: selectedEvent.venue, color: "#0f172a"}} onBack={() => setMeetView("landing")} onBook={info => { setBookingInfo(info); setMeetView("checkout"); }} />;
	if (meetView === "checkout" && selectedEvent) return <EventCheckoutPage event={selectedEvent} bookingInfo={bookingInfo} onBack={() => setMeetView("detail")} onConfirm={(id) => { setOrderId(id); setMeetView("confirm"); }} />;
	if (meetView === "confirm" && selectedEvent) return <EventConfirmPage event={selectedEvent} bookingInfo={bookingInfo} orderId={orderId} isConfirmed onDone={() => { setMeetView("landing"); setSelectedEvent(null); setBookingInfo(null); setOrderId(null); }} />;

	const filtered = meetEvents.filter(e => {
		const matchCat = matchesCategory(activeCategory, e.category, categories);
		const matchQ = !query || e.title.toLowerCase().includes(query.toLowerCase()) || e.venue.toLowerCase().includes(query.toLowerCase());
		return matchCat && matchQ;
	});
	const featured = filtered.filter(e => e.featured);
	const rest = filtered.filter(e => !e.featured);

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1060, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center", marginBottom: 20}}>{landingTitle}</h1>
					<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
						<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
							<div className="text-text-secondary" style={{ flexShrink: 0 }}><SearchIcon s={20} /></div>
							<input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} />
						</div>
					</div>
				</div>
				<div style={{ display: "flex", gap: 20, marginBottom: 28, flexWrap: "nowrap", overflowX: "auto", scrollbarWidth: "none", paddingBottom: 4, justifyContent: isMobile ? "flex-start" : "center" }}>
					{categories.map((cat, i) => (
						<LeoButton key={cat.id} cat={cat} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 30} />
					))}
				</div>
				<div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }}>
					{eventsLoaded && filtered.length === 0 && (
						<div className="bg-surface border border-border-subtle" style={{ borderRadius: 16, padding: "36px 24px", textAlign: "center", marginBottom: 24 }}>
							<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8 }}>
								{eventsError ? t("meet.unavailable", { defaultValue: "Meetups unavailable" }) : t("meet.noMeetups", { defaultValue: "No meetups yet" })}
							</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
								{eventsError || t("meet.noMeetupsHint", { defaultValue: "Check back soon — new events will show up here when organizers publish them." })}
							</p>
						</div>
					)}
					{featured.length > 0 && (
						<div style={{ marginBottom: 32 }}>
							<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 16 }}>{t("meet.featured")}</h3>
							<div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
								{featured.map((ev, i) => (
									<div key={ev.id} onClick={() => { setSelectedEvent(ev); setMeetView("detail"); }} className="bg-surface" style={{ width: 300, borderRadius: 16, overflow: "hidden", cursor: "pointer", border: `1px solid ${ev.accent}25`, animation: `fadeUp 0.35s ease ${i * 50}ms both`, flexShrink: 0, transition: "transform 0.15s" }}
										onMouseEnter={e => e.currentTarget.style.transform = "translateY(-3px)"}
										onMouseLeave={e => e.currentTarget.style.transform = ""}>
										<div style={{ height: 130, background: ev.image ? `url(${ev.image}) center/cover no-repeat` : ev.thumb, position: "relative" }}>
											<span style={{ position: "absolute", top: 10, left: 10, background: ev.price === 0 ? "#05966920" : ev.accent + "20", border: `1px solid ${ev.price === 0 ? "#059669" : ev.accent}40`, borderRadius: 6, padding: "3px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: ev.price === 0 ? "#059669" : ev.accent }}>{ev.price === 0 ? t("meet.free") : `$${ev.price}`}</span>
										</div>
										<div style={{ padding: "14px 16px" }}>
											<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, lineHeight: 1.35, marginBottom: 6 }}>{ev.title}</p>
											<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 4 }}>{ev.date} · {ev.time}</p>
											<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 10 }}>{ev.venue}</p>
											<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
												{ev.capacity != null && ev.attendees != null && (
													<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{t("meet.goingSpots", { going: ev.attendees, spots: Math.max(0, ev.capacity - ev.attendees) })}</span>
												)}
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
					{rest.length > 0 && (
						<div>
							<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 16 }}>{t("meet.allMeetups")}</h3>
							<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
								{rest.map((ev, i) => (
									<div key={ev.id} onClick={() => { setSelectedEvent(ev); setMeetView("detail"); }} className="bg-surface border border-border-subtle" style={{ display: "flex", gap: 16, padding: "16px 20px", borderRadius: 14, cursor: "pointer", animation: `fadeUp 0.35s ease ${i * 40}ms both`, transition: "border-color 0.15s" }}
										onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-border)"}
										onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border-subtle)"}>
										<div style={{ width: 80, height: 80, borderRadius: 10, background: ev.image ? `url(${ev.image}) center/cover no-repeat` : ev.thumb, flexShrink: 0 }} />
										<div style={{ flex: 1 }}>
											<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{ev.title}</p>
											<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 2 }}>{ev.date} · {ev.time}</p>
											<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{ev.venue}</p>
										</div>
										<div style={{ textAlign: "right", flexShrink: 0 }}>
											<span style={{ display: "inline-block", background: ev.price === 0 ? "#05966920" : ev.accent + "20", border: `1px solid ${ev.price === 0 ? "#059669" : ev.accent}40`, borderRadius: 6, padding: "3px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: ev.price === 0 ? "#059669" : ev.accent, marginBottom: 6 }}>{ev.price === 0 ? t("meet.free") : `$${ev.price}`}</span>
											{ev.attendees != null && <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{t("meet.going", { count: ev.attendees })}</p>}
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export { MeetPage };
