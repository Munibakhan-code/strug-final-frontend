import React, { useEffect, useMemo, useState, useCallback } from "react";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import i18n from "../i18n/index.js";
import { getBookingListings, getBookingQuote, createBooking } from '../api/booking';
import { CardInput, useBookingPayment } from "../components/BookingPayment.jsx";
import { isAuthenticated } from '../store/auth';
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon, ExperiencesIcon } from "../components/icons.jsx";
import { Skel, SkeletonCircle, SkeletonHeading, SkeletonServiceCard } from "../components/skeletons.jsx";
import { LeoButton, ODCategoryBubble, HostListingCTA } from "../components/shared.jsx";
import { messageUser } from "../api/chat";
import { mediaUrls } from "../utils/mediaUrl";
import { SaveButton } from "../components/SaveButton.jsx";


const EXP_CATEGORY_DEFS = [
	{ id: "all", labelKey: "common.all", color: "#2563eb", match: null },
	{ id: "category-outdoor", labelKey: "experiences.categoryOutdoor", color: "#059669", match: "Outdoor" },
	{ id: "category-culture", labelKey: "experiences.categoryCulture", color: "#7c3aed", match: "Culture" },
	{ id: "food", labelKey: "discounts.categories.food", color: "#d97706", match: "Food" },
	{ id: "arts", labelKey: "events.categories.arts", color: "#db2777", match: "Arts" },
	{ id: "category-nature", labelKey: "experiences.categoryNature", color: "#65a30d", match: "Nature" },
];

function ExperienceDetailPage({ exp, onBack, onBook }) {
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [selDate, setSelDate] = useState(exp.dates?.[0] ?? '');
	const [guests, setGuests] = useState(2);
	const [booking, setBooking] = useState(false);
	const [bookError, setBookError] = useState("");
	const payBooking = useBookingPayment();
	const [hostChat, setHostChat] = useState(false);
	const [hostMsg, setHostMsg] = useState("");
	const [msgSending, setMsgSending] = useState(false);
	const [msgSent, setMsgSent] = useState(false);
	const [galleryImages] = useState(() => mediaUrls(exp.images));
	const [galleryIdx, setGalleryIdx] = useState(0);
	// Server-authoritative price + availability — fee is no longer hardcoded here.
	const [quote, setQuote] = useState(null);
	const [quoteLoading, setQuoteLoading] = useState(false);
	const hasDates = Array.isArray(exp.dates) && exp.dates.length > 0;
	// Fallback (base price × guests) so the UI is never blank if the quote fails.
	const baseSubtotal = exp.price * guests;
	const subtotal = quote?.subtotal ?? baseSubtotal;
	const serviceFee = quote?.service_fee ?? 0;
	const total = quote?.total ?? baseSubtotal;
	const unavailable = quote?.available === false;

	// Experiences are a session vertical: pass start_date + quantity (the guest count), no end_date.
	useEffect(() => {
		if (!selDate || !guests) { setQuote(null); return; }
		let cancelled = false;
		setQuoteLoading(true);
		getBookingQuote({
			booking_listing_id: exp.id,
			start_date: selDate,
			quantity: guests,
		}).then(res => {
			if (cancelled) return;
			const q = res?.data ?? res;
			setQuote(q);
		}).catch(() => { if (!cancelled) setQuote(null); })
		  .finally(() => { if (!cancelled) setQuoteLoading(false); });
		return () => { cancelled = true; };
	}, [exp.id, selDate, guests]);

	async function handleReserve() {
		setBookError("");
		if (!isAuthenticated()) { setBookError("Please log in to book"); return; }
		if (!selDate) { setBookError("Please select a date."); return; }
		setBooking(true);
		try {
			const res = await createBooking({
				booking_listing_id: exp.id,
				start_date: selDate,
				quantity: guests,
				guests,
				notes: undefined,
			});
			const row = res?.data ?? res;
			const pay = await payBooking(row?.booking_id);
			if (!pay.ok) { setBookError(pay.error); setBooking(false); return; }
			// Notify the host (best-effort) — previously done in the Food checkout step.
			if (exp.hostId) { messageUser(exp.hostId, { initialMessage: `Hi! I just booked "${exp.title ?? 'your experience'}"${selDate ? ` for ${selDate}` : ''}. Can't wait!`, navigate: false, sourceVertical: "experiences" }).catch(() => {}); }
			onBook({ exp, date: selDate, guests, total, booking: row });
		} catch (err) {
			const status = err?.response?.status;
			const msg = err?.response?.data?.message
				|| (status === 409 ? "This experience is fully booked for that date."
				: status === 401 ? "Please log in to book"
				: status === 403 ? "You're not allowed to book this experience."
				: "Unable to place booking. Please try again.");
			setBookError(msg);
			setBooking(false);
		}
	}

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
				<div style={{ maxWidth: 920, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
					<Skel w={160} h={18} r={6} style={{ marginTop: 24, marginBottom: 20 }} />
					<Skel w="100%" h={260} r={18} style={{ marginBottom: 28 }} />
					<div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
						<div style={{ flex: 2, minWidth: 280 }}>
							<Skel w={80} h={22} r={6} style={{ marginBottom: 12 }} />
							<Skel w="80%" h={32} r={8} style={{ marginBottom: 14 }} />
							<div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
								{[...Array(4)].map((_,i) => <Skel key={i} w={80} h={14} r={6} />)}
							</div>
							<Skel w="100%" h={80} r={8} style={{ marginBottom: 16 }} />
							<Skel w="100%" h={60} r={8} />
						</div>
						<div style={{ flex: 1, minWidth: 260, maxWidth: 320 }}>
							<Skel w="100%" h={300} r={18} />
						</div>
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
				Back to experiences
			</button>
			{/* Hero / Gallery */}
			<div style={{ height: 260, borderRadius: 18, background: galleryImages.length ? "var(--color-surface-raised)" : (exp.imageUrl ? "linear-gradient(135deg,#172554,#3b82f6,#0ea5e9)" : exp.thumb), backgroundSize: "cover", backgroundPosition: "center", overflow: "hidden", position: "relative", marginBottom: galleryImages.length > 1 ? 8 : 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
				{!galleryImages.length && exp.imageUrl && <img loading="lazy" decoding="async" src={exp.imageUrl} alt={exp.title} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none"; }} />}
					<SaveButton entityType="experience" entityId={exp.id}
						meta={{ title: exp.title, sub: `${exp.location || ''}${exp.category ? ` · ${exp.category}` : ''}`, price: `$${exp.price}/person`, thumb: galleryImages[0] || exp.imageUrl || exp.thumb, accent: "#2563eb" }}
						style={{ position: "absolute", top: 14, right: 14, zIndex: 2 }} />
				{galleryImages.length > 0
					? <img loading="lazy" decoding="async" src={galleryImages[galleryIdx]} alt={exp.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
					: null
				}
				{galleryImages.length > 1 && (
					<>
						{/* Gallery nav controls + counter overlay the hero photo directly — kept dark/white
							regardless of theme for legibility over the image, like Hub.jsx's hero scrim. */}
						<button onClick={() => setGalleryIdx(i => (i - 1 + galleryImages.length) % galleryImages.length)} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
							<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
						</button>
						<button onClick={() => setGalleryIdx(i => (i + 1) % galleryImages.length)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
							<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
						</button>
						<div style={{ position: "absolute", bottom: 10, right: 14, background: "rgba(0,0,0,0.55)", borderRadius: 20, padding: "3px 10px" }}>
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
			<div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
					<div style={{ flex: 2, minWidth: 280 }}>
						<span className="bg-surface-raised border border-border text-text-secondary" style={{ display: "inline-block", borderRadius: 6, padding: "3px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 12 }}>{exp.category}</span>
						<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 32, marginBottom: 8 }}>{exp.title}</h1>
						<div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: "#f59e0b" }}>★</span><span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>{exp.rating}</span><span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>({exp.reviews})</span></div>
							<span className="text-text-muted">·</span>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{exp.duration}</span>
							<span className="text-text-muted">·</span>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Up to {exp.guests} guests</span>
							<span className="text-text-muted">·</span>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{exp.location}</span>
						</div>
						{exp.description ? (
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.75, marginBottom: 16 }}>{exp.description}</p>
						) : (
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.75, marginBottom: 16 }}>
								Hosted by <span onClick={() => { if (exp.hostId) { window.__profileTargetId = exp.hostId; window.__profileVertical = "hosting"; window.__nav?.("profile"); } }} style={{ color: exp.hostId ? "#60a5fa" : "var(--color-text-primary)", fontWeight: 600, cursor: exp.hostId ? "pointer" : "default" }}>{exp.host}</span> in {exp.location}. A unique {exp.duration} experience open to all skill levels — contact the host for more details.
							</p>
						)}
						{exp.rules && (
							<div className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{i18n.t("experiences.rules")}</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.6 }}>{exp.rules}</p>
							</div>
						)}
						<button onClick={() => setHostChat(v => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: hostChat ? "rgba(37,99,235,0.12)" : "var(--color-surface-raised)", border: `1px solid ${hostChat ? "rgba(37,99,235,0.3)" : "var(--color-border)"}`, borderRadius: 10, padding: "10px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: hostChat ? "#60a5fa" : "var(--color-text-secondary)", cursor: "pointer", marginBottom: 16, transition: "all 0.15s" }}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
							{hostChat ? "Close Chat" : "Message Host"}
						</button>
						{hostChat && (
							<div className="bg-surface border border-border" style={{ marginBottom: 16, borderRadius: 12, padding: "12px 14px", animation: "fadeUp 0.2s ease both" }}>
								{msgSent ? (
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#059669" }}>Message sent to {exp.host || "the host"}!</p>
								) : (
									<>
										<textarea value={hostMsg} onChange={e => setHostMsg(e.target.value)} placeholder={`Ask ${exp.host || "the host"} something...`} rows={3}
											className="bg-surface-raised text-text-primary"
											style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--color-border)", borderRadius: 8, padding: "9px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", marginBottom: 8 }}
											onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.4)"}
											onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
										<div style={{ display: "flex", gap: 8 }}>
											<button onClick={() => setHostChat(false)} className="border border-border text-text-secondary" style={{ flex: 1, padding: "8px 0", borderRadius: 8, background: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
											<button onClick={async () => {
												if (!hostMsg.trim() || msgSending) return;
												setMsgSending(true);
												try {
													if (exp.hostId) {
														await messageUser(exp.hostId, {
															initialMessage: hostMsg.trim(),
															navigate: true,
															sourceVertical: "experiences",
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
					</div>
					{/* Booking card */}
					<div style={{ flex: 1, minWidth: 260, maxWidth: 320 }}>
						<div className="bg-surface border border-border" style={{ borderRadius: 18, padding: "22px" }}>
							<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, marginBottom: 16 }}>${exp.price} <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: 14 }}>/ person</span></p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{i18n.t("common.selectDate")}</p>
							{hasDates ? (
								<div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
									{exp.dates.map(d => (
										<button key={d} onClick={() => setSelDate(d)} style={{ background: selDate === d ? "#2563eb" : "var(--color-surface-raised)", border: `1px solid ${selDate === d ? "#2563eb" : "var(--color-border)"}`, borderRadius: 10, padding: "9px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: selDate === d ? "#fff" : "var(--color-text-primary)", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>{d}</button>
									))}
								</div>
							) : (
								<input type="date" value={selDate} onChange={e => setSelDate(e.target.value)} min={new Date().toISOString().slice(0, 10)}
									className={`bg-surface-raised border border-border ${selDate ? "text-text-primary" : "text-text-muted"}`}
									style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", marginBottom: 16, colorScheme: "dark" }} />
							)}
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{i18n.t("common.guests")}</p>
							<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
								<button onClick={() => setGuests(g => Math.max(1, g - 1))} className="border border-border bg-surface-raised text-text-primary" style={{ width: 34, height: 34, borderRadius: "50%", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
								<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16, minWidth: 20, textAlign: "center" }}>{guests}</span>
								<button onClick={() => setGuests(g => Math.min(parseInt(exp.guests.split("–")[1] || 10), g + 1))} className="border border-border bg-surface-raised text-text-primary" style={{ width: 34, height: 34, borderRadius: "50%", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
							</div>
							<div style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 14, marginBottom: 16 }}>
								<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>${exp.price} × {guests} guest{guests > 1 ? "s" : ""}</span>
									<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>${subtotal}</span>
								</div>
								<div style={{ display: "flex", justifyContent: "space-between" }}>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("common.serviceFee")}</span>
									<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>${serviceFee}</span>
								</div>
							</div>
							{unavailable && (
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 10 }}>{quote?.reason || "Not available for the selected date."}</p>
							)}
							{bookError && (
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 10 }}>{bookError}</p>
							)}
							{!unavailable && selDate && (
								<div style={{ marginBottom: 12 }}>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{i18n.t("common.paymentMethod")}</p>
									<CardInput />
								</div>
							)}
							<button onClick={handleReserve} disabled={booking || quoteLoading || unavailable}
								style={{ width: "100%", background: booking ? "#059669" : "#2563eb", border: "none", borderRadius: 12, padding: "13px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#fff", cursor: (booking || quoteLoading || unavailable) ? "not-allowed" : "pointer", opacity: (quoteLoading || unavailable) ? 0.6 : 1, transition: "background 0.2s" }}>
								{booking ? "Booking..." : quoteLoading ? "Checking…" : `Reserve · $${total}`}
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function ExperienceConfirmPage({ info, onDone }) {
	const [showRateModal, setShowRateModal] = React.useState(false);
	const [rating, setRating] = React.useState(0);
	const [ratingComment, setRatingComment] = React.useState("");
	const [rated, setRated] = React.useState(false);
	const { isMobile } = useViewport();
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 40, paddingBottom: 24, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, textAlign: "center" }}>
			<div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(5,150,105,0.15)", border: "2px solid #059669", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, fontSize: 32 }}>✓</div>
			<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, marginBottom: 10 }}>{i18n.t("experiences.youreBooked")}</h2>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 6 }}><span className="text-text-primary" style={{ fontWeight: 600 }}>{info.exp.title}</span></p>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 4 }}>{info.date} · {info.guests} guest{info.guests > 1 ? "s" : ""}</p>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 28 }}>Total paid: ${info.total}</p>
			<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 32 }}>{i18n.t("experiences.meetingPointEmail")}</p>
			{!rated && <button onClick={() => setShowRateModal(true)} style={{ width: "100%", maxWidth: 320, background: "#2563eb", border: "none", borderRadius: 12, padding: "12px 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 10 }}>{i18n.t("experiences.rateExperience")}</button>}
			<button onClick={onDone} className="bg-surface-raised border border-border text-text-primary" style={{ borderRadius: 12, padding: "12px 32px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{i18n.t("common.done")}</button>
			{showRateModal && (
				// Modal scrim stays a fixed dark overlay in both themes (standard modal-dimming
				// convention, matches the same pattern already used in Food.jsx's rating modal).
				<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
					<div className="bg-surface border border-border" style={{ borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, animation: "fadeUp 0.25s ease both" }}>
						<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{i18n.t("experiences.rateExperienceTitle")}</h3>
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
							{/* Brand-blue submit button (incl. its disabled tint) stays hardcoded — it's never a
								neutral surface, same pattern as the rating-modal submit button in Food.jsx. */}
							<button disabled={rating === 0} onClick={() => { setShowRateModal(false); setRated(true); }} style={{ flex: 1, padding: "11px 0", background: rating > 0 ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: rating > 0 ? "#fff" : "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: rating > 0 ? "pointer" : "default" }}>{i18n.t("common.submit")}</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function ExperiencesPage() {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("experiences");
const categories = useI18nCategoryList(EXP_CATEGORY_DEFS);
	const { isMobile } = useViewport();
	const loading = usePageLoad();
	const [cat, setCat] = useState("all");
	const [expView, setExpView] = useState("grid");
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [expView]);
	const [selectedExp, setSelectedExp] = useState(null);
	const [bookingInfo, setBookingInfo] = useState(null);
	const [expData, setExpData] = useState([]);
	const [loadError, setLoadError] = useState(false);
	const loadExperiences = useCallback(() => {
		setLoadError(false);
		getBookingListings({ vertical: 'experience' }).then(res => {
			const arr = Array.isArray(res) ? res : (res?.data ?? []);
			if (arr.length) setExpData(arr.map(l => {
				const a = l.attributes ?? {};
				const imgs = mediaUrls(l.images);
				const durHr = a.duration_hr ?? null;
				return {
					id: l.booking_listing_id,
					title: l.title || 'Experience',
					host: a.host || 'Host',
					hostId: l.owner_id ?? null,
					category: a.category || 'Outdoor',
					price: Number(l.price) || 0,
					duration: durHr != null ? `${durHr} hr${Number(durHr) === 1 ? '' : 's'}` : (a.duration || '2 hrs'),
					guests: `1–${l.capacity ?? a.max_guests ?? 8}`,
					rating: Number(a.rating) || 4.8,
					reviews: Number(a.reviews ?? a.review_count) || 0,
					location: l.location || '',
					description: l.description ?? null,
					rules: a.rules ?? a.requirements ?? null,
					imageUrl: imgs[0] ?? null,
					images: imgs,
					thumb: imgs[0] ? `url(${imgs[0]})` : "linear-gradient(135deg,#172554,#3b82f6,#0ea5e9)",
					dates: Array.isArray(a.available_dates) ? a.available_dates : [],
				};
			}));
		}).catch(() => { setLoadError(true); });
	}, []);
	useEffect(() => { loadExperiences(); }, [loadExperiences]);

	const filtered = useMemo(
		// Filter by stable category id via the def's `match` value ("all" = show everything),
		// so the default selection isn't filtered to an empty feed.
		() => expData.filter(e => matchesCategory(cat, e.category, categories)),
		[cat, expData, categories]
	);

	// Payment is collected in the detail step (booking-linked Stripe intent), then
	// we go straight to confirmation. (No Food checkout step — that double-charged.)
	if (expView === "detail" && selectedExp) return <ExperienceDetailPage exp={selectedExp} onBack={() => setExpView("grid")} onBook={info => { setBookingInfo(info); setExpView("confirm"); }} />;
	if (expView === "confirm") return <ExperienceConfirmPage info={bookingInfo} onDone={() => { setExpView("grid"); setSelectedExp(null); setBookingInfo(null); }} />;

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
			<div style={{ padding: "32px 0 0" }}>
				<div style={{ position: "relative", marginBottom: 16, textAlign: "center" }}>
					<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4 }}>{landingTitle}</h2>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{i18n.t("experiences.subtitle")}</p>
					<div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
						<HostListingCTA vertical="experience" label={t("hostListing.experience")} onCreated={loadExperiences} />
					</div>
				</div>
				<div style={{ display: "flex", gap: 20, marginBottom: 28, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none", justifyContent: "center" }}>
					{categories.map((c, i) => (
						<LeoButton key={c.id} cat={c} active={cat === c.id} onClick={() => setCat(c.id)} delay={i * 30} />
					))}
				</div>
			</div>
			<div style={{ paddingBottom: 24, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 22 }}>
				{loading ? Array.from({ length: 6 }).map((_, i) => (
					<div key={i} className="bg-surface border border-border-subtle" style={{ borderRadius: 16, overflow: "hidden", animation: `fadeUp 0.3s ease ${i * 50}ms both` }}>
						<Skel h={190} r={0} />
						<div style={{ padding: 16 }}>
							<Skel w="75%" h={14} r={6} style={{ marginBottom: 8 }} />
							<Skel w="50%" h={12} r={5} style={{ marginBottom: 10 }} />
							<div style={{ display: "flex", justifyContent: "space-between" }}><Skel w={70} h={12} r={5} /><Skel w={50} h={16} r={6} /></div>
						</div>
					</div>
				)) : filtered.length === 0 ? (
					<div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 20px" }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 8 }}>
							{loadError ? "We couldn't load experiences right now." : "No experiences available yet."}
						</p>
						{loadError && (
							<button onClick={loadExperiences} style={{ background: "#2563eb", border: "none", borderRadius: 10, padding: "9px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>{i18n.t("common.tryAgain")}</button>
						)}
					</div>
				) : filtered.map((exp, i) => (
					<div key={exp.id} onClick={() => { setSelectedExp(exp); setExpView("detail"); }}
						className="bg-surface"
						style={{ border: "1px solid var(--color-border-subtle)", borderRadius: 16, overflow: "hidden", cursor: "pointer", transition: "border-color 0.15s, transform 0.15s", animation: `fadeUp 0.35s ease ${i * 50}ms both` }}
						onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
						onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--color-border-subtle)"; e.currentTarget.style.transform = "none"; }}>
						<div style={{ height: 180, background: exp.imageUrl ? "linear-gradient(135deg,#172554,#3b82f6,#0ea5e9)" : exp.thumb, position: "relative", overflow: "hidden" }}>
							{exp.imageUrl && <img loading="lazy" decoding="async" src={exp.imageUrl} alt={exp.title} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none"; }} />}
							{/* Duration badge overlays the card photo directly — kept dark/translucent
								regardless of theme for legibility over the image. */}
							<div style={{ position: "absolute", bottom: 10, left: 10, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", borderRadius: 6, padding: "3px 9px", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{exp.duration}</div>
						</div>
						<div style={{ padding: "14px 16px" }}>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 3, lineHeight: 1.3 }}>{exp.title}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 10 }}>{exp.location} · {exp.category}</p>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
								<div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: "#f59e0b", fontSize: 12 }}>★</span><span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{exp.rating} ({exp.reviews})</span></div>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#60a5fa" }}>From ${exp.price}</span>
							</div>
						</div>
					</div>
				))}
			</div>
			</div>
		</div>
	);
}

export { ExperiencesPage };
