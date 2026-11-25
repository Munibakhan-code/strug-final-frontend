import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import i18n from "../i18n/index.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon, ProServicesIcon } from "../components/icons.jsx";
import { Skel, SkeletonCircle, SkeletonHeading, SkeletonServiceCard } from "../components/skeletons.jsx";
import { LeoButton, ODCategoryBubble, HostListingCTA } from "../components/shared.jsx";
import { getBookingListings, createBooking } from "../api/booking";
import { CardPaymentField, useBookingPayment } from "../components/BookingPayment.jsx";
import { bindCheckoutReferralCode } from "../api/user";
import { isAuthenticated } from "../store/auth";
import { SaveButton } from "../components/SaveButton.jsx";

// "8:00 AM" -> "08:00" (24h) for the booking engine's start_time field.
function to24h(label) {
	const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(label || "");
	if (!m) return label;
	let h = Number(m[1]) % 12;
	if (/PM/i.test(m[3])) h += 12;
	return `${String(h).padStart(2, "0")}:${m[2]}`;
}

const DIG_SVC_REVIEWS = [
	{ id: 1, user: "AlexT_Dev",   avatar: "AT", color: "#2563eb", rating: 5, time: "2 weeks ago", text: "Absolutely incredible work. Delivered ahead of schedule and the quality was beyond expectations. Will definitely hire again." },
	{ id: 2, user: "MariaFC",     avatar: "MF", color: "#db2777", rating: 5, time: "1 month ago",  text: "Very professional and responsive. Understood exactly what I needed and executed it perfectly." },
	{ id: 3, user: "NoahBuilds",  avatar: "NB", color: "#059669", rating: 4, time: "1 month ago",  text: "Great work overall. Minor revision needed but was handled quickly. Highly recommend." },
];

const PROSVCS_DATA = [
	{ id: 1,  title: "Home Deep Clean",         category: "Cleaning",     price: 85,  unit: "per visit",  rating: 4.9, reviews: 1203, provider: "SparkleTeam", thumb: "linear-gradient(135deg,#0c1a2e,#2563eb)" },
	{ id: 2,  title: "TV Mounting & Setup",      category: "Handyman",     price: 60,  unit: "per job",    rating: 4.8, reviews: 876,  provider: "FixItFast",   thumb: "linear-gradient(135deg,#1c1917,#ef4444)" },
	{ id: 3,  title: "Personal Training (1hr)",  category: "Fitness",      price: 70,  unit: "per session",rating: 4.9, reviews: 541,  provider: "EliteCoach",  thumb: "linear-gradient(135deg,#052e16,#16a34a)" },
	{ id: 4,  title: "Dog Walking (60 min)",     category: "Pet Care",     price: 30,  unit: "per walk",   rating: 4.7, reviews: 2104, provider: "PawPals",     thumb: "linear-gradient(135deg,#451a03,#f59e0b)" },
	{ id: 5,  title: "Furniture Assembly",       category: "Handyman",     price: 55,  unit: "per job",    rating: 4.8, reviews: 689,  provider: "BuildRight",  thumb: "linear-gradient(135deg,#1e1b4b,#7c3aed)" },
	{ id: 6,  title: "Garden Tidy & Mow",        category: "Gardening",    price: 65,  unit: "per visit",  rating: 4.6, reviews: 412,  provider: "GreenScene",  thumb: "linear-gradient(135deg,#052e16,#16a34a,#86efac)" },
	{ id: 7,  title: "Grocery Run & Delivery",   category: "Errands",      price: 20,  unit: "per trip",   rating: 4.8, reviews: 3401, provider: "QuickRunners",thumb: "linear-gradient(135deg,#0f172a,#06b6d4)" },
	{ id: 8,  title: "Laptop Repair & Tune-up",  category: "Tech Support", price: 90,  unit: "per job",    rating: 4.9, reviews: 234,  provider: "TechFixPro",  thumb: "linear-gradient(135deg,#1c1917,#78716c)" },
];

const PROSVC_CATEGORY_DEFS = [
	{ id: "all", labelKey: "common.all", color: "#2563eb", match: null },
	{ id: "fitness", labelKey: "meet.categories.fitness", color: "#dc2626", match: "Fitness" },
];

const PROSVC_TIME_SLOTS = ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM"];

function ProSvcDetailPage({ svc, onBack, onBook }) {
	const { isMobile, isTablet } = useViewport();
	const loading = usePageLoad(150);
	const [contactMsg, setContactMsg] = useState("");
	const [contactSent, setContactSent] = useState(false);
	const [contactOpen, setContactOpen] = useState(false);
	const providerJoined = "March 2022";
	const providerJobs = 80 + (svc.id * 23) % 300;

	if (loading) return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<Skel w={160} h={18} r={6} style={{ marginTop: 24, marginBottom: 20 }} />
				<Skel w="100%" h={220} r={18} style={{ marginBottom: 24 }} />
				<div style={{ display: "flex", gap: 24 }}>
					<div style={{ flex: 2 }}>
						<Skel w="60%" h={28} r={8} style={{ marginBottom: 12 }} />
						<Skel w="100%" h={80} r={10} style={{ marginBottom: 20 }} />
						<Skel w="100%" h={160} r={10} />
					</div>
					<div style={{ flex: 1 }}>
						<Skel w="100%" h={260} r={14} />
					</div>
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
			<button onClick={onBack} className="text-text-secondary" style={{ marginTop: 24, marginBottom: 20, display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}>
				<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
				Pro Services
			</button>
			{/* Banner: svc.thumb + a dark gradient scrim under white text — stays dark in both
				themes for legibility, same call as Hub.jsx's hero photo treatment. */}
			<div style={{ width: "100%", height: 220, background: svc.thumb, borderRadius: 18, marginBottom: 28, position: "relative", overflow: "hidden" }}>
				<div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(6,8,16,0.85) 0%, transparent 50%)" }} />
				<SaveButton entityType="service" entityId={svc.listingId || svc.id}
					meta={{ title: svc.title, sub: `by ${svc.provider}`, price: `$${svc.price}${svc.unit ? ` ${svc.unit}` : ''}`, thumb: svc.thumb, accent: "#2563eb" }}
					style={{ position: "absolute", top: 14, right: 14 }} />
				<div style={{ position: "absolute", bottom: 20, left: 24, right: 24, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
					<div>
						<span style={{ background: "rgba(255,255,255,0.12)", borderRadius: 6, padding: "3px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(255,255,255,0.7)", marginBottom: 8, display: "inline-block" }}>{svc.category}</span>
						<h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, color: "#fff", marginBottom: 2 }}>{svc.title}</h2>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>by {svc.provider}</p>
					</div>
					<div style={{ textAlign: "right" }}>
						<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, color: "#2563eb" }}>${svc.price}</p>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{svc.unit}</p>
					</div>
				</div>
			</div>
			<div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start" }}>
				{/* Left: about + portfolio + reviews */}
				<div style={{ flex: 2, minWidth: 280 }}>
					{/* Provider profile */}
					<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "18px 20px", marginBottom: 22 }}>
						<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 14 }}>About {svc.provider}</p>
						<div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
							{/* Initial rendered over svc.thumb (an arbitrary brand gradient) — stays white for guaranteed contrast, like the review avatars below. */}
							<div className="border-2 border-border" style={{ width: 52, height: 52, borderRadius: "50%", background: svc.thumb, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, color: "#fff", flexShrink: 0 }}>{svc.provider[0]}</div>
							<div style={{ flex: 1 }}>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 3 }}>{svc.provider}</p>
								<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
									<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
										{svc.reviews > 0 && (
											<>
												<span style={{ color: "#f59e0b", fontSize: 12 }}>★</span>
												<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>{svc.rating}</span>
											</>
										)}
										<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>({svc.reviews} reviews)</span>
									</div>
									<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{providerJobs} jobs · Joined {providerJoined}</span>
								</div>
							</div>
							<button onClick={() => setContactOpen(v => !v)} className="bg-surface-raised border border-border text-text-primary" style={{ borderRadius: 10, padding: "8px 16px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>{i18n.t("automotive.message")}</button>
						</div>
						{contactOpen && (
							contactSent ? (
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#059669" }}>Message sent! {svc.provider} will reply soon.</p>
							) : (
								<>
									<textarea value={contactMsg} onChange={e => setContactMsg(e.target.value)} rows={3} placeholder={`Hi ${svc.provider}, I'd like to enquire about your service...`}
										className="bg-surface-raised border border-border text-text-primary"
										style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, resize: "none", outline: "none", marginBottom: 10 }} />
									<button onClick={() => { if (!contactMsg.trim()) return; setContactSent(true); }} style={{ background: "#2563eb", border: "none", borderRadius: 10, padding: "10px 22px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>{i18n.t("common.send")}</button>
								</>
							)
						)}
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.75, marginTop: contactOpen ? 16 : 0 }}>
							{svc.provider} is a trusted professional specialising in {svc.title.toLowerCase()} and {svc.category.toLowerCase()} services. With a track record of {providerJobs}+ completed jobs{svc.reviews > 0 ? ` and a ${svc.rating}-star rating` : ""}, you can expect reliable, punctual, and high-quality service.
						</p>
					</div>
					{/* Portfolio grid */}
					<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "18px 20px", marginBottom: 22 }}>
						<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 14 }}>{i18n.t("portfolio.title")}</p>
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2,1fr)" : "repeat(3,1fr)", gap: 8 }}>
							{Array.from({ length: 6 }, (_, i) => (
								<div key={i} style={{ aspectRatio: "1", borderRadius: 10, background: svc.thumb, opacity: 0.7 + (i % 3) * 0.1, position: "relative", overflow: "hidden" }}>
									{/* Decorative depth shading over the brand-color thumb, not a theme role — stays dark. */}
									<div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, rgba(0,0,0,${0.1 + i * 0.05}), rgba(0,0,0,0.1))` }} />
								</div>
							))}
						</div>
					</div>
					{/* Reviews */}
					<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "18px 20px" }}>
						<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
							<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: "0.05em", textTransform: "uppercase" }}>{i18n.t("books.tabReviews")}</p>
							<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
								{svc.reviews > 0 && (
									<>
										<span style={{ color: "#f59e0b" }}>★</span>
										<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700 }}>{svc.rating}</span>
										<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>·</span>
									</>
								)}
								<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{svc.reviews.toLocaleString()} reviews</span>
							</div>
						</div>
						{DIG_SVC_REVIEWS.slice(0, 3).map((r, i) => (
							<div key={r.id} style={{ paddingBottom: 14, marginBottom: 14, borderBottom: i < 2 ? "1px solid var(--color-border-subtle)" : "none" }}>
								<div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
									<div style={{ width: 32, height: 32, borderRadius: "50%", background: r.color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 12, color: "#fff", flexShrink: 0 }}>{r.avatar}</div>
									<div>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 1 }}>{r.user}</p>
										<div style={{ display: "flex", gap: 4 }}>
											<span style={{ color: "#f59e0b", fontSize: 11 }}>{"★".repeat(r.rating)}</span>
											<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{r.time}</span>
										</div>
									</div>
								</div>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.6, paddingLeft: 42 }}>{r.text}</p>
							</div>
						))}
					</div>
				</div>
				{/* Right: booking panel */}
				<div style={{ ...(isMobile ? { width: "100%", maxWidth: "100%" } : { flex: 1, minWidth: 220, maxWidth: 280, position: "sticky", top: 0 }) }}>
					<div className="bg-surface border border-border" style={{ borderRadius: 16, padding: "20px" }}>
						<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, marginBottom: 2 }}>${svc.price}</p>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 20 }}>{svc.unit}</p>
						<div style={{ marginBottom: 20 }}>
							{["24h cancellation", "Identity verified", "Background checked"].map(f => (
								<div key={f} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
									<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{f}</span>
								</div>
							))}
						</div>
						<button onClick={onBook} style={{ width: "100%", background: "#2563eb", border: "none", borderRadius: 12, padding: "14px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer", marginBottom: 10 }}>{i18n.t("common.bookNow")}</button>
						<button onClick={() => setContactOpen(v => !v)} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 12, padding: "12px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{i18n.t("proservices.contactProvider")}</button>
					</div>
				</div>
			</div>
			</div>
		</div>
	);
}

function ProSvcBookingPage({ svc, onBack, onConfirm }) {
	const today = new Date();
	const dates = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() + i + 1); return d; });
	const [selDate, setSelDate] = useState(null);
	const [selTime, setSelTime] = useState(null);
	const [note, setNote] = useState("");
	const [refCode, setRefCode] = useState("");
	const [refApplied, setRefApplied] = useState(false);
	const [refLoading, setRefLoading] = useState(false);
	const [refError, setRefError] = useState(null);
	const [booking, setBooking] = useState(false);
	const [bookError, setBookError] = useState(null);
	const payBooking = useBookingPayment();
	const isReal = svc.isReal === true && !!svc.listingId;
	const fmt = d => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
	const { isMobile } = useViewport();

	async function handleConfirm() {
		if (booking) return;
		setBookError(null);
		if (!isReal) { setBookError("This is a demo listing — booking opens once a provider lists this service on Strug."); return; }
		if (!isAuthenticated()) { setBookError("Please log in to book this service."); return; }
		setBooking(true);
		try {
			// One scheduled session: server prices it from the listing, then charges the card.
			const res = await createBooking({ booking_listing_id: svc.listingId, start_date: selDate.toISOString().slice(0, 10), start_time: to24h(selTime), notes: note });
			const bk = res?.data ?? res;
			if (!bk?.booking_id) { setBookError("Could not complete your booking. Please try again."); setBooking(false); return; }
			const pay = await payBooking(bk.booking_id);
			if (!pay.ok) { setBookError(pay.error); setBooking(false); return; }
			onConfirm({ svc, date: selDate, time: selTime, note, refCode, bookingId: bk.booking_id });
		} catch (err) {
			const status = err?.response?.status;
			setBookError(err?.response?.data?.message || (status === 409 ? "That slot was just taken — pick another time." : "Could not complete your booking. Please try again."));
			setBooking(false);
		}
	}

	return (
		<div style={{ flex: 1, overflowY: "auto", paddingTop: 32, paddingRight: 40, paddingBottom: 24, paddingLeft: isMobile ? 16 : 108, maxWidth: 680 }}>
			<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 28, display: "flex", alignItems: "center", gap: 6, padding: 0 }}>← Back</button>
			<div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 28 }}>
				<div style={{ width: 52, height: 52, borderRadius: 12, background: svc.thumb, flexShrink: 0 }} />
				<div>
					<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 24, marginBottom: 2 }}>{svc.title}</h2>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{svc.provider} · ${svc.price} {svc.unit}</p>
				</div>
			</div>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 10 }}>{i18n.t("common.selectDate")}</p>
			<div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 20 }}>
				{/* Text color made conditional (was hardcoded #fff for both states) — with the
					unselected background now a token that goes light in light mode, fixed white
					text on it would be unreadable. Ternary mixes a token with a non-token brand
					color (#2563eb / #fff), so it stays inline per the spread-conflict / mixed-ternary rule. */}
				{dates.map((d, i) => <button key={i} onClick={() => setSelDate(d)} style={{ background: selDate && d.toDateString() === selDate.toDateString() ? "#2563eb" : "var(--color-surface-raised)", border: `1px solid ${selDate && d.toDateString() === selDate.toDateString() ? "#2563eb" : "var(--color-border)"}`, borderRadius: 12, padding: "10px 16px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: selDate && d.toDateString() === selDate.toDateString() ? "#fff" : "var(--color-text-primary)", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, transition: "all 0.15s" }}>{fmt(d)}</button>)}
			</div>
			{selDate && (
				<>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 10 }}>{i18n.t("common.selectTime")}</p>
					<div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
						{/* Same mixed token/non-token ternary as the date buttons above — left inline. */}
						{PROSVC_TIME_SLOTS.map(t => <button key={t} onClick={() => setSelTime(t)} style={{ background: selTime === t ? "#2563eb" : "var(--color-surface-raised)", border: `1px solid ${selTime === t ? "#2563eb" : "var(--color-border)"}`, borderRadius: 10, padding: "9px 16px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: selTime === t ? "#fff" : "var(--color-text-primary)", cursor: "pointer", transition: "all 0.15s" }}>{t}</button>)}
					</div>
				</>
			)}
			<label className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "block", marginBottom: 8 }}>{i18n.t("proservices.notesOptional")}</label>
			<textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder={i18n.t("proservices.providerNotesPlaceholder")}
				className="bg-surface-raised border border-border text-text-primary"
				style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, padding: "12px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, resize: "vertical", outline: "none", marginBottom: 16 }} />
			<label className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "block", marginBottom: 8 }}>{i18n.t("proservices.referralOptional")}</label>
			<div style={{ display: "flex", gap: 8, marginBottom: refError ? 6 : 22 }}>
				<input value={refCode} onChange={e => { setRefCode(e.target.value); setRefApplied(false); setRefError(null); }} placeholder={i18n.t("proservices.referralPlaceholder")}
					className="bg-surface-raised border border-border text-text-primary"
					style={{ flex: 1, borderRadius: 12, padding: "11px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none" }} />
				{/* Three-way ternary mixing tokens (surface-raised) with non-token brand/green
					values across background/border/color — left inline, not a pure single-token or
					two-token case. */}
				<button onClick={async () => { if (!refCode.trim() || refLoading || refApplied) return; setRefLoading(true); setRefError(null); try { await bindCheckoutReferralCode(refCode.trim()); setRefApplied(true); } catch (e) { setRefError(e?.response?.data?.message || "Invalid referral code."); } finally { setRefLoading(false); } }} style={{ padding: "10px 16px", background: refApplied ? "rgba(16,185,129,0.15)" : refCode.trim() ? "#2563eb" : "var(--color-surface-raised)", border: refApplied ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(37,99,235,0.3)", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: refApplied ? "#10b981" : "#2563eb", cursor: (!refCode.trim() || refLoading) ? "default" : "pointer", whiteSpace: "nowrap" }}>{refLoading ? "…" : refApplied ? "✓ Applied" : "Apply"}</button>
			</div>
			{refError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 16 }}>{refError}</p>}
			{selDate && selTime && (
				<>
					{isReal ? <CardPaymentField /> : (
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 16 }}>Demo listing — booking opens once a provider lists this service on Strug.</p>
					)}
					{bookError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 12 }}>{bookError}</p>}
					<button onClick={handleConfirm} disabled={booking || !isReal}
						style={{ background: booking ? "#059669" : (!isReal ? "rgba(37,99,235,0.5)" : "#2563eb"), border: "none", borderRadius: 12, padding: "14px 32px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#fff", cursor: (booking || !isReal) ? "default" : "pointer", transition: "background 0.2s" }}>
						{booking ? "Processing…" : `Confirm & Pay — ${fmt(selDate)} at ${selTime} · $${svc.price}`}
					</button>
				</>
			)}
		</div>
	);
}

function ProSvcConfirmPage({ info, onDone }) {
	const [showRateModal, setShowRateModal] = React.useState(false);
	const [rating, setRating] = React.useState(0);
	const [ratingComment, setRatingComment] = React.useState("");
	const [rated, setRated] = React.useState(false);
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
			<div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(5,150,105,0.15)", border: "2px solid #059669", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, fontSize: 32 }}>✓</div>
			<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, marginBottom: 10 }}>{i18n.t("proservices.bookingConfirmed")}</h2>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 6 }}><span className="text-text-primary" style={{ fontWeight: 600 }}>{info.svc.title}</span> with {info.svc.provider}</p>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 28 }}>{info.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at {info.time}</p>
			{!rated && <button onClick={() => setShowRateModal(true)} style={{ width: "100%", maxWidth: 320, background: "#2563eb", border: "none", borderRadius: 12, padding: "12px 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 10 }}>{i18n.t("proservices.rateProfessional")}</button>}
			<button onClick={onDone} className="bg-surface border border-border text-text-secondary" style={{ borderRadius: 12, padding: "12px 32px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{i18n.t("common.done")}</button>
			{showRateModal && (
				// Modal backdrop stays a hardcoded dark scrim regardless of theme — same
				// convention used for every other modal overlay in this codebase (Food.jsx etc).
				<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
					<div className="bg-surface border border-border" style={{ borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, animation: "fadeUp 0.25s ease both" }}>
						<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{i18n.t("proservices.rateProfessionalTitle")}</h3>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 18 }}>{i18n.t("rideshare.howWasExperience")}</p>
						<div style={{ display: "flex", gap: 8, marginBottom: 18, justifyContent: "center" }}>
							{[1,2,3,4,5].map(n => (
								<button key={n} onClick={() => setRating(n)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
									<svg width={30} height={30} viewBox="0 0 24 24" fill={n <= rating ? "#f59e0b" : "none"} stroke={n <= rating ? "#f59e0b" : "var(--color-text-muted)"} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
								</button>
							))}
						</div>
						<textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder={i18n.t("common.optionalComment")} rows={3} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 16 }} />
						<div style={{ display: "flex", gap: 10 }}>
							<button onClick={() => { setShowRateModal(false); onDone(); }} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, padding: "11px 0", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{i18n.t("ondemand.hire.skip")}</button>
							<button disabled={rating === 0} onClick={() => { setShowRateModal(false); setRated(true); }} style={{ flex: 1, padding: "11px 0", background: rating > 0 ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: rating > 0 ? "#fff" : "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: rating > 0 ? "pointer" : "default" }}>{i18n.t("common.submit")}</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function ProServicesPage({ onNavigate }) {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("proservices");
const categories = useI18nCategoryList(PROSVC_CATEGORY_DEFS);
	const { isMobile } = useViewport();
	const loading = usePageLoad();
	const [cat, setCat] = useState("All");
	const [psView, setPsView] = useState("grid");
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [psView]);
	const [selectedSvc, setSelectedSvc] = useState(null);
	const [bookingInfo, setBookingInfo] = useState(null);
	// Demo services are display-only; real ones (booking_listing rows) are bookable.
	const [svcData, setSvcData] = useState(() => PROSVCS_DATA.map(s => ({ ...s, isReal: false })));
	const [listError, setListError] = useState(false);
	const loadServices = useCallback(() => {
		getBookingListings({ vertical: 'professional' }).then(res => {
			setListError(false);
			const arr = Array.isArray(res) ? res : (res?.data ?? []);
			if (!arr.length) return;
			setSvcData(arr.map(l => {
				const a = l.attributes ?? {};
				const imgs = Array.isArray(l.images) ? l.images.filter(Boolean) : [];
				return {
					id: l.booking_listing_id,
					listingId: l.booking_listing_id,
					isReal: true,
					title: l.title || 'Service',
					category: a.category || 'Service',
					price: Number(l.price) || 0,
					unit: a.unit || 'per session',
					rating: a.rating ?? 0,
					reviews: a.reviews ?? 0,
					provider: a.provider || 'Provider',
					thumb: imgs[0] || a.thumb || "linear-gradient(135deg,#0c1a2e,#2563eb)",
				};
			}));
		}).catch(() => setListError(true));
	}, []);
	useEffect(() => { loadServices(); }, [loadServices]);
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
	}, []);

	const filtered = useMemo(
		() => cat === "All" ? svcData : svcData.filter(s => s.category === cat),
		[cat, svcData]
	);

	if (psView === "detail" && selectedSvc) return <ProSvcDetailPage svc={selectedSvc} onBack={() => setPsView("grid")} onBook={() => setPsView("booking")} />;
	if (psView === "booking" && selectedSvc) return <ProSvcBookingPage svc={selectedSvc} onBack={() => setPsView("detail")} onConfirm={info => { setBookingInfo(info); setPsView("confirm"); }} />;
	if (psView === "confirm") return <ProSvcConfirmPage info={bookingInfo} onDone={() => { setPsView("detail"); setBookingInfo(null); }} />;

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<div style={{ padding: "32px 0 0" }}>
					<div style={{ textAlign: "center", marginBottom: 24 }}>
						<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(24px,3vw,36px)", letterSpacing: "0.03em", marginBottom: 4 }}>{landingTitle}</h2>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 14 }}>{i18n.t("proservices.subtitle")}</p>
						{listError && (
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#fbbf24", marginBottom: 14 }}>{i18n.t("common.listError.sampleServices")}</p>
						)}
						<div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
							<HostListingCTA vertical="professional" label="List a service" onCreated={loadServices} />
							<button style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.35)", borderRadius: 10, padding: "10px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "#60a5fa", cursor: "pointer" }} onClick={() => onNavigate && onNavigate("sd-proservices")}>{t("proservices.becomeProvider")}</button>
						</div>
					</div>
					<div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 28 }}>
						{/* Prev-arrow: both sides of each background/border/color ternary are pure
							tokens (surface vs surface-raised, border-subtle vs border, muted vs primary),
							so it's convertible per the two-token ternary rule. */}
						<button onClick={() => catScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })} className={catScrollState.atStart ? "bg-surface border border-border-subtle text-text-muted" : "bg-surface-raised border border-border text-text-primary"} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, cursor: catScrollState.atStart ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", transition: "transform 0.12s, background 0.2s" }}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
						</button>
						<div ref={catScrollRef} className="ecom-cat-scroll" style={{ flex: 1, display: "flex", gap: 20, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none", justifyContent: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "center" : "flex-start" }}>
							{categories.map((c, i) => (
								<LeoButton key={c.label} cat={c} active={cat === c.label} onClick={() => setCat(c.label)} delay={i * 30} />
							))}
						</div>
						{/* Next-arrow: background/border/color ternaries each mix a token with a
							non-token brand color (#2563eb / transparent / #fff), so they stay inline. */}
						<button onClick={() => catScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: catScrollState.atEnd ? "var(--color-surface)" : "#2563eb", border: `1px solid ${catScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`, color: catScrollState.atEnd ? "var(--color-text-muted)" : "#fff", cursor: catScrollState.atEnd ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", transition: "transform 0.12s, background 0.2s", boxShadow: catScrollState.atEnd ? "none" : "0 2px 14px rgba(37,99,235,0.55)" }}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
						</button>
					</div>
				</div>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18 }}>
				{loading ? Array.from({ length: 8 }).map((_, i) => (
					<div key={i} className="bg-surface border border-border" style={{ borderRadius: 14, padding: 18, animation: `fadeUp 0.3s ease ${i * 40}ms both` }}>
						<div style={{ display: "flex", gap: 12, marginBottom: 14 }}><Skel w={48} h={48} r={10} /><div style={{ flex: 1 }}><Skel w="70%" h={14} r={6} style={{ marginBottom: 6 }} /><Skel w="50%" h={12} r={5} /></div></div>
						<Skel h={34} r={8} />
					</div>
				)) : filtered.map((svc, i) => (
					<div key={svc.id}
						className="bg-surface border border-border-subtle"
						style={{ borderRadius: 14, padding: "18px", transition: "border-color 0.15s", animation: `fadeUp 0.35s ease ${i * 40}ms both` }}
						onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-border)"}
						onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border-subtle)"}>
						<div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
							<div style={{ width: 48, height: 48, borderRadius: 10, background: svc.thumb, flexShrink: 0 }} />
							<div style={{ flex: 1 }}>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{svc.title}</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{svc.provider}</p>
							</div>
							<div style={{ textAlign: "right" }}>
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#60a5fa" }}>${svc.price}</p>
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10 }}>{svc.unit}</p>
							</div>
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
							<div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4 }}>{svc.reviews > 0 && <span style={{ color: "#f59e0b", fontSize: 12 }}>★</span>}<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{svc.reviews > 0 ? `${svc.rating} ` : ""}({svc.reviews})</span></div>
							<button onClick={() => { setSelectedSvc(svc); setPsView("detail"); }} style={{ background: "#2563eb", border: "none", borderRadius: 8, padding: "8px 16px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, color: "#fff", cursor: "pointer" }}>{i18n.t("common.view")}</button>
						</div>
					</div>
				))}
			</div>
			</div>
		</div>
	);
}

export { ProServicesPage };
