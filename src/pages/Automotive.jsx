import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useViewport } from "../hooks/useViewport";
import { usePageLoad } from "../hooks/usePageLoad";
import { useMoney } from "../hooks/useMoney.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList";
import { getAllAutomotiveVehicles, createTestDriveRequest, getBookedTestDriveTimes } from "../api/vehicle";
import { getVerticalProfileByUser } from "../api/verticalProfile";
import { getBookingListings, getListingAvailability, createBooking, getListingReviews } from "../api/booking";
import { openDmChannel } from "../api/chat";
import { CardInput, useBookingPayment } from "../components/BookingPayment.jsx";
import { isAuthenticated } from "../store/auth";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { SearchIcon, AutomotiveIcon } from "../components/icons.jsx";
import { Skel, SkeletonCircle, SkeletonHeading, SkeletonServiceCard, SkeletonVehicleCard } from "../components/skeletons.jsx";
import { LeoButton } from "../components/shared.jsx";
import { SaveButton } from "../components/SaveButton.jsx";
import { getSaves } from "../api/saves";
import { bindCheckoutReferralCode } from "../api/user";
import { useTheme } from "../utils/theme.js";
import { useClosingTransition, glassBackdropStyle, glassPanelStyle, GLASS_PANEL_CLASS } from "../components/modalKit.jsx";

// Auto-dismiss delay for the booking-confirmed modal.
const BOOKING_CONFIRMED_AUTO_CLOSE_MS = 3000;

function AutoServiceCard({ service, delay = 0, onBook, initialSaved = false }) {
	const [theme] = useTheme();
	const isLight = theme === "light";
	const light = !!service.cardLight;
	const textColor = light ? "var(--color-text-primary)" : "#fff";
	const mutedColor = light ? "var(--color-text-secondary)" : "rgba(255,255,255,0.3)";
	const tagColor = light ? "var(--color-text-secondary)" : "rgba(255,255,255,0.55)";
	const tagBg = light ? "var(--color-wash-2)" : "rgba(255,255,255,0.05)";
	return (
		<div onClick={() => onBook && onBook(service)} style={{ borderRadius: 16, background: light ? "var(--color-surface)" : service.gradient, border: light ? "1px solid var(--color-border)" : isLight ? "1px solid rgba(255,255,255,0.4)" : "1px solid rgba(255,255,255,0.08)", boxShadow: isLight ? "0 4px 16px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.1)" : "none", overflow: "hidden", display: "flex", flexDirection: "column", animation: `fadeUp 0.4s ease ${delay}ms both`, cursor: "pointer" }}>
			<div style={{ height: 150, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
				{service.images?.[0] ? (
					<img src={service.images[0]} alt={service.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
				) : (
					<AutomotiveIcon s={38} />
				)}
				<div style={{ position: "absolute", top: 10, left: 10, background: "rgba(0,0,0,0.5)", borderRadius: 20, padding: "4px 10px" }}>
					<span style={{ fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase" }}>{service.category}</span>
				</div>
				{/* Shared cross-vertical /saves toggle — was local-only UI state that reset on every
				    reload and never actually saved anything (see the same fix on vehicle favourites). */}
				<SaveButton
					entityType="service"
					entityId={service.id}
					initialSaved={initialSaved}
					meta={{
						title: service.name,
						sub: service.category,
						price: `$${service.price}`,
						thumb: service.images?.[0] || null,
					}}
					size={30}
					style={{ position: "absolute", top: 10, right: 10 }}
				/>
			</div>
			<div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
				<p style={{ fontSize: 15, fontWeight: 700, color: textColor, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.3 }}>{service.name}</p>
				<div style={{ display: "flex", alignItems: "center", gap: 5 }}>
					{service.reviews > 0 && (
						<>
							<svg width={12} height={12} viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
							<span style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", fontFamily: "'DM Sans', sans-serif" }}>{service.rating}</span>
						</>
					)}
					<span style={{ fontSize: 11, color: mutedColor, fontFamily: "'DM Sans', sans-serif" }}>({service.reviews} reviews)</span>
				</div>
				<div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
					{service.tags.map(t => (
						<span key={t} style={{ fontSize: 10, color: tagColor, fontFamily: "'DM Sans', sans-serif", background: tagBg, padding: "2px 7px", borderRadius: 10 }}>{t}</span>
					))}
				</div>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 6 }}>
					<div>
						<span style={{ fontSize: 20, fontWeight: 800, color: "#d97706", fontFamily: "'Barlow Condensed', sans-serif" }}>${service.price}</span>
						<span style={{ fontSize: 11, color: mutedColor, fontFamily: "'DM Sans', sans-serif" }}>/{service.unit}</span>
					</div>
					<button onClick={e => { e.stopPropagation(); onBook && onBook(service); }} style={{ background: "#d97706", border: "none", borderRadius: 8, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, padding: "7px 14px", cursor: "pointer" }}>{i18n.t("common.book")}</button>
				</div>
			</div>
		</div>
	);
}

const AUTO_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#d97706", match: null, img: "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=100&h=100&fit=crop" },
	{ id: "Maintenance & Service", label: "Maintenance & Service", color: "#10b981", match: "Maintenance & Service", img: "https://images.unsplash.com/photo-1487754180451-c456f719a1fc?w=100&h=100&fit=crop" },
	{ id: "Repairs", label: "Repairs", color: "#ef4444", match: "Repairs", img: "https://images.unsplash.com/photo-1625047509168-a7026f36de04?w=100&h=100&fit=crop" },
	{ id: "Electrical & Diagnostics", label: "Electrical & Diagnostics", color: "#eab308", match: "Electrical & Diagnostics", img: "https://images.unsplash.com/photo-1752230343707-e798e44a2b89?w=100&h=100&fit=crop" },
	{ id: "AC & Heating", label: "AC & Heating", color: "#14b8a6", match: "AC & Heating", img: "https://images.unsplash.com/photo-1748621020484-7319ec89bf0c?w=100&h=100&fit=crop" },
	{ id: "Tires & Wheels", label: "Tires & Wheels", color: "#f97316", match: "Tires & Wheels", img: "https://images.unsplash.com/photo-1744294126658-564d403a23d2?w=100&h=100&fit=crop" },
	{ id: "Detailing & Cleaning", label: "Detailing & Cleaning", color: "#ec4899", match: "Detailing & Cleaning", img: "https://images.unsplash.com/photo-1632823469850-2f77dd9c7f93?w=100&h=100&fit=crop" },
	{ id: "Body & Exterior", label: "Body & Exterior", color: "#a855f7", match: "Body & Exterior", img: "https://images.unsplash.com/photo-1712885046114-5ea81a2f7555?w=100&h=100&fit=crop" },
	{ id: "Glass & Windows", label: "Glass & Windows", color: "#64748b", match: "Glass & Windows", img: "https://images.unsplash.com/photo-1555681734-fc927c91822a?w=100&h=100&fit=crop" },
	{ id: "Performance & Customization", label: "Performance & Customization", color: "#f43f5e", match: "Performance & Customization", img: "https://images.unsplash.com/photo-1580414057403-c5f451f30e1c?w=100&h=100&fit=crop" },
	{ id: "Inspection & Pre-Purchase", label: "Inspection & Pre-Purchase", color: "#84cc16", match: "Inspection & Pre-Purchase", img: "https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=100&h=100&fit=crop" },
	{ id: "Commercial & Heavy Vehicle", label: "Commercial & Heavy Vehicle", color: "#92400e", match: "Commercial & Heavy Vehicle", img: "https://images.unsplash.com/photo-1519003722824-194d4455a60c?w=100&h=100&fit=crop" },
];

// Confirmation modal for a completed mechanic booking — auto-dismisses, or closes on "Done".
function BookingConfirmedModal({ serviceName, dateLabel, onClose }) {
	const { closing, requestClose } = useClosingTransition();

	useEffect(() => {
		const timer = setTimeout(() => requestClose(onClose), BOOKING_CONFIRMED_AUTO_CLOSE_MS);
		return () => clearTimeout(timer);
	}, [requestClose, onClose]);

	return (
		<div style={glassBackdropStyle(closing, { zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 })} onClick={() => requestClose(onClose)}>
			<div
				role="dialog"
				aria-modal="true"
				className={GLASS_PANEL_CLASS}
				onClick={(e) => e.stopPropagation()}
				style={glassPanelStyle(closing, { borderRadius: 20, padding: "40px 32px", maxWidth: 340, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" })}
			>
				<div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(5,150,105,0.15)", border: "2px solid #059669", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, fontSize: 32 }}>✓</div>
				<h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, marginBottom: 10 }} className="text-text-primary">Appointment Request Sent to Mechanic!</h2>
				<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 6 }} className="text-text-secondary"><span style={{ fontWeight: 600 }} className="text-text-primary">{serviceName}</span></p>
				<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 28 }} className="text-text-secondary">{dateLabel}</p>
				<button onClick={() => requestClose(onClose)} style={{ background: "#2563eb", border: "none", borderRadius: 12, padding: "12px 32px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>{i18n.t("common.done")}</button>
			</div>
		</div>
	);
}

function MechanicServiceDetailPage({ service, onBack }) {
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [theme] = useTheme();
	const isLight = theme === "light";
	const today = new Date();
	const TIME_SLOTS = ["09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM"];
	const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
	const isReal = service.isReal === true && service.listingId;
	const [selDate, setSelDate] = useState(null);
	const [selTime, setSelTime] = useState(null);
	const [notes, setNotes] = useState("");
	const [contactName, setContactName] = useState("");
	const [contactEmail, setContactEmail] = useState("");
	const [contactPhone, setContactPhone] = useState("");
	const [contactAddress, setContactAddress] = useState("");
	const [refCode, setRefCode] = useState("");
	const [refApplied, setRefApplied] = useState(false);
	const [refLoading, setRefLoading] = useState(false);
	const [refError, setRefError] = useState(null);
	const [booked, setBooked] = useState(false);
	const [payProcessing, setPayProcessing] = useState(false);
	const [payError, setPayError] = useState(null);
	const [unavailable, setUnavailable] = useState(() => new Set());
	const [bookedTimes, setBookedTimes] = useState(() => new Map());
	const [sellerInfo, setSellerInfo] = useState(null);
	const [messaging, setMessaging] = useState(false);
	const [bookingModalOpen, setBookingModalOpen] = useState(false);
	const [calMonth, setCalMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
	const [calendarOpen, setCalendarOpen] = useState(false);

	// Without this, the background page stays scrollable behind the fixed overlay — on mobile
	// touch drags over the modal fight with the page's own scroll instead of scrolling the modal's
	// content, so fields below the fold (contact details, total, confirm button) can't be reached.
	// Mirrors the lock in SlideOutPanel.jsx.
	useEffect(() => {
		if (!bookingModalOpen) return undefined;
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => { document.body.style.overflow = prev; };
	}, [bookingModalOpen]);
	const payBooking = useBookingPayment();
	const fmt = d => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
	const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	const todayKey = dayKey(today);
	const to24Hour = t => {
		const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(t).trim());
		if (!m) return null;
		let h = parseInt(m[1], 10) % 12;
		if (/pm/i.test(m[3])) h += 12;
		return `${String(h).padStart(2, "0")}:${m[2]}`;
	};
	const minutesOfDay = hhmm => {
		const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
		return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
	};
	const APPOINTMENT_MINUTES = 60;
	const timeSlotTaken = (dateKey, slotLabel) => {
		const ranges = bookedTimes.get(dateKey);
		if (!ranges || !ranges.length) return false;
		const start = minutesOfDay(to24Hour(slotLabel));
		if (start == null) return false;
		const end = start + APPOINTMENT_MINUTES;
		return ranges.some(r => {
			const rs = minutesOfDay(r.start);
			if (rs == null) return false;
			const re = r.end && minutesOfDay(r.end) != null ? minutesOfDay(r.end) : rs + APPOINTMENT_MINUTES;
			return start < re && rs < end;
		});
	};
	const isDateAvailable = d => dayKey(d) > todayKey && !unavailable.has(dayKey(d));
	const buildCalendarCells = monthDate => {
		const year = monthDate.getFullYear();
		const month = monthDate.getMonth();
		const startWeekday = new Date(year, month, 1).getDay();
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
		return Array.from({ length: totalCells }, (_, i) => {
			const date = new Date(year, month, i - startWeekday + 1);
			return { date, inMonth: date.getMonth() === month };
		});
	};
	const calendarCells = buildCalendarCells(calMonth);
	const canGoPrevMonth = calMonth.getFullYear() > today.getFullYear() || (calMonth.getFullYear() === today.getFullYear() && calMonth.getMonth() > today.getMonth());
	const locationParts = service.location ? service.location.split(",").map(s => s.trim()).filter(Boolean) : [];
	const locationLine1 = locationParts[0] || service.location;
	const locationLine2 = locationParts.slice(1).join(", ");

	useEffect(() => {
		if (!isReal) return;
		let alive = true;
		getListingAvailability(service.listingId)
			.then(res => {
				const data = res?.data ?? res ?? {};
				const set = new Set();
				const byDay = new Map();
				(data.booked || []).forEach(b => {
					if (!b.start_date) return;
					const key = String(b.start_date).slice(0, 10);
					if (!b.start_time) { set.add(key); return; }
					if (!byDay.has(key)) byDay.set(key, []);
					byDay.get(key).push({ start: b.start_time, end: b.end_time || null });
				});
				(data.blocked || []).forEach(b => { if (b.is_blocked && b.date && !b.time_from && !b.time_to) set.add(String(b.date).slice(0, 10)); });
				if (alive) { setUnavailable(set); setBookedTimes(byDay); }
			})
			.catch(() => {});
		return () => { alive = false; };
	}, [isReal, service.listingId]);

	useEffect(() => {
		if (!service.ownerId) return;
		let alive = true;
		getVerticalProfileByUser(service.ownerId, 'automotive')
			.then(r => { if (alive) setSellerInfo(r?.data || r); })
			.catch(() => {});
		return () => { alive = false; };
	}, [service.ownerId]);

	const [recentReviews, setRecentReviews] = useState([]);
	useEffect(() => {
		if (!isReal || !service.listingId) return;
		let alive = true;
		getListingReviews(service.listingId, { limit: 3 })
			.then(r => { if (alive) setRecentReviews(r?.data?.reviews ?? []); })
			.catch(() => {});
		return () => { alive = false; };
	}, [isReal, service.listingId]);

	const [showAllReviews, setShowAllReviews] = useState(false);
	const [allReviews, setAllReviews] = useState([]);
	const [allReviewsLoading, setAllReviewsLoading] = useState(false);
	const [allReviewsPage, setAllReviewsPage] = useState(1);
	const allReviewsPerPage = 10;
	useEffect(() => {
		if (!showAllReviews || !isReal || !service.listingId) return;
		let alive = true;
		setAllReviewsLoading(true);
		setAllReviewsPage(1);
		getListingReviews(service.listingId, { limit: 50 })
			.then(r => { if (alive) setAllReviews(r?.data?.reviews ?? []); })
			.finally(() => { if (alive) setAllReviewsLoading(false); });
		return () => { alive = false; };
	}, [showAllReviews, isReal, service.listingId]);
	const allReviewsTotalPages = Math.max(1, Math.ceil(allReviews.length / allReviewsPerPage));
	const allReviewsPageCurrent = Math.min(allReviewsPage, allReviewsTotalPages);
	const allReviewsPageItems = allReviews.slice((allReviewsPageCurrent - 1) * allReviewsPerPage, allReviewsPageCurrent * allReviewsPerPage);
	const allReviewsDist = [5, 4, 3, 2, 1].map(star => ({ star, count: allReviews.filter(r => r.rating === star).length }));

	async function messageSeller() {
		if (!service.ownerId || messaging) return;
		if (!isAuthenticated()) {
			setPayError(i18n.t("automotive.loginToMessage", { defaultValue: "Please log in to message the seller." }));
			return;
		}
		setMessaging(true);
		try {
			const channel = await openDmChannel(service.ownerId, { sourceVertical: "automotive" });
			const channelId = channel?.channel_id ?? channel?.id;
			if (channelId) {
				window.__openChatChannelId = Number(channelId);
				if (window.__nav) window.__nav("messages");
			}
		} catch (err) {
			console.error("Failed to open chat channel:", err);
		} finally {
			setMessaging(false);
		}
	}

	const isMobileService = service.serviceType === "mobile";
	const contactInfoComplete = Boolean(contactName.trim() && contactPhone.trim() && contactEmail.trim()) && (!isMobileService || Boolean(contactAddress.trim()));

	async function confirmBooking() {
		if (!selDate || !selTime || payProcessing) return;
		setPayError(null);
		if (!contactInfoComplete) { setPayError(isMobileService ? i18n.t("automotive.mobileDetailsRequired", { defaultValue: "Please fill in your name, email, phone, and address for mobile service." }) : i18n.t("automotive.contactDetailsRequired", { defaultValue: "Please fill in your name, email, and phone number." })); return; }
		if (!isReal) { setBooked(true); return; }
		if (!isAuthenticated()) { setPayError(i18n.t("events.loginToBook", { defaultValue: "Please log in to book." })); return; }
		setPayProcessing(true);
		try {
			const contactDetails = `\nContact — Name: ${contactName.trim()} · Email: ${contactEmail.trim()} · Phone: ${contactPhone.trim()}${isMobileService ? ` · Address: ${contactAddress.trim()}` : ""}`;
			const res = await createBooking({
				booking_listing_id: service.listingId,
				start_date: selDate.toISOString().slice(0, 10),
				start_time: to24Hour(selTime),
				notes: `Mechanic — ${service.name} · ${selTime}${contactDetails}${notes ? `\n${notes}` : ""}`,
			});
			const booking = res?.data ?? res;
			if (!booking?.booking_id) { setPayError(i18n.t("automotive.couldNotBook", { defaultValue: "Could not place the booking." })); setPayProcessing(false); return; }
			const pay = await payBooking(booking.booking_id);
			if (!pay.ok) { setPayError(pay.error); setPayProcessing(false); return; }
			setBooked(true);
		} catch (err) {
			const status = err?.response?.status;
			setPayError(err?.response?.data?.message || (status === 409 ? i18n.t("automotive.slotTaken", { defaultValue: "That date is no longer available." }) : i18n.t("automotive.couldNotBook", { defaultValue: "Could not complete the booking." })));
			setPayProcessing(false);
		}
	}

	if (loading) return (
		<div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 32, paddingBottom: 24 }}>
			<div style={{ maxWidth: 920, margin: "0 auto", width: "100%" }}>
			<Skel w={110} h={14} r={6} style={{ marginBottom: 24 }} />
			<div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
				<div style={{ flex: 2, minWidth: 280 }}><Skel w="100%" h={180} r={14} style={{ marginBottom: 20 }} /><Skel w="60%" h={24} r={8} style={{ marginBottom: 12 }} /><Skel w="100%" h={60} r={8} /></div>
				<div style={{ flex: 1, minWidth: 240, maxWidth: 300 }}><Skel w="100%" h={320} r={16} /></div>
			</div>
			</div>
		</div>
	);

	if (showAllReviews) return (
		<div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 32, paddingBottom: 24 }}>
			<div style={{ maxWidth: 920, margin: "0 auto", width: "100%" }}>
				<button onClick={() => setShowAllReviews(false)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 24, display: "flex", alignItems: "center", gap: 6, padding: 0 }} className="text-text-secondary">← {service.name}</button>
				<h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 24, marginBottom: 16 }} className="text-text-primary">{i18n.t("automotive.reviews", { defaultValue: "Reviews" })}</h3>
				{!allReviewsLoading && allReviews.length > 0 && (
					<div style={{ background: isLight ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.03)", border: isLight ? "1px solid rgba(10,10,14,0.12)" : "1px solid var(--color-border-subtle)", borderRadius: 16, padding: "24px 28px", marginBottom: 24, display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
						<div style={{ textAlign: "center" }}>
							<p style={{ fontSize: 56, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1, margin: 0 }} className="text-text-primary">{service.rating}</p>
							<p style={{ fontSize: 18, color: "#f59e0b", marginTop: 4, margin: "4px 0 0" }}>{"★".repeat(Math.round(Number(service.rating) || 0))}</p>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 4, margin: "4px 0 0" }} className="text-text-secondary">{service.reviews} {i18n.t("common.reviews", { defaultValue: "reviews" })}</p>
						</div>
						<div style={{ flex: 1, minWidth: 220 }}>
							{allReviewsDist.map(({ star, count }) => (
								<div key={star} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, width: 14 }} className="text-text-secondary">{star}</span>
									<div style={{ flex: 1, height: 7, borderRadius: 4, overflow: "hidden", background: isLight ? "rgba(10,10,14,0.08)" : "rgba(255,255,255,0.06)" }}>
										<div style={{ width: `${allReviews.length ? (count / allReviews.length) * 100 : 0}%`, height: "100%", background: "#d97706", borderRadius: 4 }} />
									</div>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, width: 16 }} className="text-text-secondary">{count}</span>
								</div>
							))}
						</div>
					</div>
				)}
				{allReviewsLoading ? (
					<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "24px 0" }} className="text-text-secondary">{i18n.t("common.loading", { defaultValue: "Loading…" })}</p>
				) : allReviews.length === 0 ? (
					<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", padding: "24px 0" }} className="text-text-secondary">{i18n.t("automotive.noReviewsYet", { defaultValue: "No reviews yet" })}</p>
				) : (
					<>
					<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
						{allReviewsPageItems.map(r => {
							const reviewerName = r.user?.name?.trim() || r.user?.username?.trim() || i18n.t("shared.anonymous", { defaultValue: "Anonymous" });
							return (
								<div key={r.booking_review_id} style={{ background: isLight ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.03)", borderRadius: 14, padding: "16px 18px", border: isLight ? "1px solid rgba(10,10,14,0.12)" : "1px solid var(--color-border-subtle)" }}>
									<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
										<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
											<div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(217,119,6,0.15)", border: "1px solid rgba(217,119,6,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#d97706", flexShrink: 0 }}>{reviewerName[0]}</div>
											<div>
												<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, margin: 0 }} className="text-text-primary">{reviewerName}</p>
												<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0 }} className="text-text-secondary">{r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}</p>
											</div>
										</div>
										<span style={{ fontSize: 13, color: "#f59e0b", flexShrink: 0 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
									</div>
									{r.review && (
										<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5, margin: 0 }} className="text-text-secondary">{r.review}</p>
									)}
								</div>
							);
						})}
					</div>
					{allReviewsTotalPages > 1 && (
						<div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 20 }}>
							<button
								onClick={() => setAllReviewsPage(prev => Math.max(1, prev - 1))}
								disabled={allReviewsPageCurrent === 1}
								style={{ padding: "8px 16px", background: allReviewsPageCurrent === 1 ? "var(--color-wash-2)" : "#d97706", border: "1px solid var(--color-border)", borderRadius: 8, color: allReviewsPageCurrent === 1 ? "var(--color-text-muted)" : "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: allReviewsPageCurrent === 1 ? "not-allowed" : "pointer" }}
							>
								{i18n.t("common.previous", { defaultValue: "Previous" })}
							</button>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }} className="text-text-secondary">
								{i18n.t("common.pageOf", { defaultValue: "Page {{current}} of {{total}}", current: allReviewsPageCurrent, total: allReviewsTotalPages })}
							</span>
							<button
								onClick={() => setAllReviewsPage(prev => Math.min(allReviewsTotalPages, prev + 1))}
								disabled={allReviewsPageCurrent === allReviewsTotalPages}
								style={{ padding: "8px 16px", background: allReviewsPageCurrent === allReviewsTotalPages ? "var(--color-wash-2)" : "#d97706", border: "1px solid var(--color-border)", borderRadius: 8, color: allReviewsPageCurrent === allReviewsTotalPages ? "var(--color-text-muted)" : "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: allReviewsPageCurrent === allReviewsTotalPages ? "not-allowed" : "pointer" }}
							>
								{i18n.t("common.next", { defaultValue: "Next" })}
							</button>
						</div>
					)}
					</>
				)}
			</div>
		</div>
	);

	return (
		<>
		{booked && (
			<BookingConfirmedModal
				serviceName={service.name}
				dateLabel={`${selDate ? fmt(selDate) : ""}${selTime ? ` · ${selTime}` : ""}`}
				onClose={() => setBooked(false)}
			/>
		)}
		<div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 32, paddingBottom: 24 }}>
			<div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
			<button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 24, display: "flex", alignItems: "center", gap: 6, padding: 0 }} className="text-text-secondary">← Automotive Services</button>

			{/* Two Column Layout */}
			<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 380px", gap: 28, marginBottom: 32 }}>
				{/* Left Column */}
				<div>
					<div style={{ width: "100%", height: isMobile ? 240 : 360, background: service.gradient, borderRadius: 18, marginBottom: 16, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", border: isLight ? "1px solid rgba(255,255,255,0.3)" : "none", boxShadow: isLight ? "0 4px 16px rgba(0,0,0,0.15)" : "none" }}>
						{service.images?.[0] ? (
							<img src={service.images[0]} alt={service.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
						) : (
							<AutomotiveIcon s={64} />
						)}
						{service.images.length > 1 && (
							<div style={{ position: "absolute", bottom: 14, right: 16, display: "flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,0.55)", borderRadius: 6, padding: "4px 10px" }}>
								<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(255,255,255,0.9)", fontWeight: 600 }}>1 / {service.images.length}</span>
							</div>
						)}
					</div>

					{/* Highlight chips */}
					{service.tags.length > 0 && (
						<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
							{service.tags.map(t => (
								<span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: isLight ? "rgba(217,119,6,0.08)" : "rgba(217,119,6,0.12)", borderRadius: 20, padding: "6px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }} className="border border-[#d97706]/30 text-text-primary">
									<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{highlightIconPath(t)}</svg>
									{t}
								</span>
							))}
						</div>
					)}

					{service.description && (
						<div style={{ marginBottom: 24 }}>
							<h4 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 10 }} className="text-text-primary">{i18n.t("common.description", { defaultValue: "Description" })}</h4>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.7, margin: 0 }} className="text-text-secondary">{service.description}</p>
						</div>
					)}

					{/* Quick facts strip */}
					<div style={{ display: "flex", flexWrap: "wrap", gap: 24, paddingBottom: 20, marginBottom: 24, borderBottom: isLight ? "1px solid rgba(10,10,14,0.12)" : "1px solid var(--color-border-subtle)" }}>
						{service.location && (
							<div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 150 }}>
								<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
								<div>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0, marginBottom: 2 }} className="text-text-secondary">{i18n.t("common.location", { defaultValue: "Location" })}</p>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, margin: 0 }} className="text-text-primary">{locationLine1}</p>
									{locationLine2 && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, margin: 0 }} className="text-text-primary">{locationLine2}</p>}
									<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(service.location)}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "#d97706", textDecoration: "none" }}>{i18n.t("automotive.viewOnMap", { defaultValue: "View on map" })}</a>
								</div>
							</div>
						)}
						<div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 110 }}>
							<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/></svg>
							<div>
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0, marginBottom: 2 }} className="text-text-secondary">{i18n.t("automotive.serviceType", { defaultValue: "Service Type" })}</p>
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, margin: 0 }} className="text-text-primary">{service.serviceType === "mobile" ? i18n.t("automotive.mobileService", { defaultValue: "Mobile Service" }) : i18n.t("automotive.atWorkshop", { defaultValue: "At Workshop" })}</p>
							</div>
						</div>
						{service.estimatedTime && (
							<div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 110 }}>
								<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
								<div>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0, marginBottom: 2 }} className="text-text-secondary">{i18n.t("automotive.estimatedTime", { defaultValue: "Estimated Time" })}</p>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, margin: 0 }} className="text-text-primary">{service.estimatedTime}</p>
								</div>
							</div>
						)}
						{service.requirements && (
							<div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 150 }}>
								<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
								<div>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0, marginBottom: 2 }} className="text-text-secondary">{i18n.t("automotive.requirements", { defaultValue: "Requirements" })}</p>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, margin: 0 }} className="text-text-primary">{service.requirements}</p>
								</div>
							</div>
						)}
					</div>

					{/* What's Included */}
					{service.whatsIncluded.length > 0 && (
						<div>
							<h4 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 14 }} className="text-text-primary">{i18n.t("automotive.whatsIncluded", { defaultValue: "What's Included" })}</h4>
							<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
								{service.whatsIncluded.map((w, i) => (
									<div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
										<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><polyline points="20 6 9 17 4 12"/></svg>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }} className="text-text-primary">{w}</span>
									</div>
								))}
							</div>
						</div>
					)}
				</div>

				{/* Right Column — name/reviews, price, CTAs, info cards */}
				<div>
					<h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, margin: 0, marginBottom: 10 }} className="text-text-primary">{service.name}</h1>
					<div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 16 }}>
						{service.reviews > 0 && (
							<>
								<span style={{ color: "#f59e0b" }}>★</span>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }} className="text-text-primary">{service.rating}</span>
							</>
						)}
						<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }} className="text-text-secondary">({service.reviews} {i18n.t("common.reviews", { defaultValue: "reviews" })})</span>
					</div>
					<div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 34, color: "#d97706", marginBottom: 20, letterSpacing: "0.02em" }}>
						${service.price}<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: 14 }} className="text-text-secondary">/{service.unit}</span>
					</div>

					{/* CTA Buttons */}
					<div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
						<button onClick={() => setBookingModalOpen(true)} style={{ background: "#d97706", border: "none", borderRadius: 12, padding: "14px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#fff", cursor: "pointer" }}>
							{i18n.t("automotive.bookAppointment", { defaultValue: "Book Appointment" })}
						</button>
						<button onClick={messageSeller} disabled={!service.ownerId || messaging} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "transparent", borderRadius: 12, padding: "13px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, cursor: !service.ownerId || messaging ? "default" : "pointer", opacity: !service.ownerId ? 0.5 : 1 }} className="border-2 border-[#d97706] text-[#d97706]">
							<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
							{messaging ? i18n.t("automotive.processing", { defaultValue: "Processing…" }) : i18n.t("automotive.messageSeller", { defaultValue: "Message Seller" })}
						</button>
					</div>

					{/* Service Information Card */}
					<div style={{ background: isLight ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.03)", borderRadius: 18, padding: "20px", marginBottom: 24, border: isLight ? "1px solid rgba(10,10,14,0.2)" : "1px solid var(--color-border-subtle)", boxShadow: isLight ? "0 2px 8px rgba(0,0,0,0.08)" : "none" }}>
						<h4 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 16 }} className="text-text-primary">{i18n.t("automotive.serviceInformation", { defaultValue: "Service Information" })}</h4>
						<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
								<div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(217,119,6,0.15)", border: "1px solid rgba(217,119,6,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
									<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
								</div>
								<div>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0, marginBottom: 2 }} className="text-text-secondary">{i18n.t("common.posted", { defaultValue: "Posted" })}</p>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, margin: 0 }} className="text-text-primary">{formatPostedDate(service.createdAt)}</p>
								</div>
							</div>
							<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
								<div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(217,119,6,0.15)", border: "1px solid rgba(217,119,6,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
									<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
								</div>
								<div>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0, marginBottom: 2 }} className="text-text-secondary">{i18n.t("common.category", { defaultValue: "Category" })}</p>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, margin: 0 }} className="text-text-primary">{service.category}</p>
								</div>
							</div>
						</div>
					</div>

					{/* Seller Information Card */}
					<div style={{ background: isLight ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.03)", borderRadius: 18, padding: "24px", border: isLight ? "1px solid rgba(10,10,14,0.2)" : "1px solid var(--color-border-subtle)", boxShadow: isLight ? "0 2px 8px rgba(0,0,0,0.08)" : "none" }}>
						<h4 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 16 }} className="text-text-primary">{i18n.t("automotive.sellerInformation", { defaultValue: "Seller Information" })}</h4>
						<div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
							<div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #f59e0b, #d97706)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>
								{sellerInfo?.profile_pic_url ? (
									<img src={sellerInfo.profile_pic_url} alt={sellerInfo.name} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
								) : (
									<span>🔧</span>
								)}
							</div>
							<div>
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, margin: 0 }} className="text-text-primary">{sellerInfo?.business_name || sellerInfo?.display_name || i18n.t("common.seller", { defaultValue: "Seller" })}</p>
								<div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
									<svg width={14} height={14} viewBox="0 0 24 24" fill="#fbbf24" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }} className="text-text-secondary">{sellerInfo?.is_verified ? i18n.t("automotive.verifiedSeller", { defaultValue: "Verified Seller" }) : i18n.t("automotive.newSeller", { defaultValue: "New seller" })}</span>
								</div>
							</div>
						</div>
						<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
							<div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, flexShrink: 0 }} className="text-text-secondary">{i18n.t("common.location", { defaultValue: "Location" })}</span>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, textAlign: "right", wordBreak: "break-word", flex: "1 1 auto", minWidth: 0 }} className="text-text-primary">{sellerInfo?.location || '—'}</span>
							</div>
							{sellerInfo?.website && (
								<div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, flexShrink: 0 }} className="text-text-secondary">{i18n.t("common.website", { defaultValue: "Website" })}</span>
									<a
										href={/^https?:\/\//i.test(sellerInfo.website) ? sellerInfo.website : `https://${sellerInfo.website}`}
										target="_blank"
										rel="noopener noreferrer"
										style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, textAlign: "right", wordBreak: "break-word", flex: "1 1 auto", minWidth: 0, color: "#d97706", textDecoration: "none" }}
										onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
										onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
									>
										{sellerInfo.website}
									</a>
								</div>
							)}
						</div>
						{sellerInfo?.is_verified && (
							<div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, paddingTop: 14, borderTop: isLight ? "1px solid rgba(10,10,14,0.12)" : "1px solid var(--color-border-subtle)" }}>
								<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }} className="text-text-primary">{i18n.t("automotive.verifiedBusiness", { defaultValue: "Verified business" })}</span>
							</div>
						)}
					</div>
				</div>
			</div>

			{recentReviews.length > 0 && (
				<div style={{ marginTop: 32 }}>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
						<h4 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, margin: 0 }} className="text-text-primary">{i18n.t("automotive.reviews", { defaultValue: "Reviews" })}</h4>
						<button onClick={() => setShowAllReviews(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "#d97706" }}>{i18n.t("common.seeAll", { defaultValue: "See all" })}</button>
					</div>
					<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
						{recentReviews.map(r => {
							const reviewerName = r.user?.name?.trim() || r.user?.username?.trim() || i18n.t("shared.anonymous", { defaultValue: "Anonymous" });
							return (
								<div key={r.booking_review_id} style={{ background: isLight ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.03)", borderRadius: 14, padding: "16px 18px", border: isLight ? "1px solid rgba(10,10,14,0.12)" : "1px solid var(--color-border-subtle)" }}>
									<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
										<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
											<div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(217,119,6,0.15)", border: "1px solid rgba(217,119,6,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#d97706", flexShrink: 0 }}>{reviewerName[0]}</div>
											<div>
												<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, margin: 0 }} className="text-text-primary">{reviewerName}</p>
												<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0 }} className="text-text-secondary">{r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}</p>
											</div>
										</div>
										<span style={{ fontSize: 13, color: "#f59e0b", flexShrink: 0 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
									</div>
									{r.review && (
										<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5, margin: 0 }} className="text-text-secondary">{r.review}</p>
									)}
								</div>
							);
						})}
					</div>
				</div>
			)}
			</div>
		</div>

		{/* Book Appointment Modal — portaled to <body>: the page wrapper in App.jsx runs a
		    transform-based pageEnter animation with overflow:hidden, which makes it the containing
		    block for any position:fixed descendant. Rendered inline, this modal got clipped to that
		    wrapper's box (between the header and bottom nav) instead of covering the real viewport. */}
		{bookingModalOpen && createPortal(
			<div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0, 0, 0, 0.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
				<div style={{ position: "relative", backdropFilter: "blur(20px)", borderRadius: 20, boxShadow: "0 25px 50px -12px var(--color-shadow), 0 0 60px rgba(217,119,6,0.12)", maxWidth: 480, width: "100%", maxHeight: "95vh", display: "flex", flexDirection: "column", overflow: "hidden" }} className="bg-surface border border-border-subtle">
					<button onClick={() => setBookingModalOpen(false)} style={{ position: "absolute", top: 20, right: 20, background: "transparent", border: "none", cursor: "pointer", padding: 4, display: "flex", zIndex: 1 }} className="text-text-secondary">
						<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
					</button>
					<div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", padding: isMobile ? 20 : 28, paddingBottom: 4 }}>
					<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }} className="text-text-secondary">{i18n.t("automotive.bookThisService")}</p>
					<h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 4, marginTop: 0 }} className="text-text-primary">{service.name}</h3>
					<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 18, marginTop: 0 }} className="text-text-secondary">{i18n.t("automotive.chooseDateTime", { defaultValue: "Choose your preferred date and time" })}</p>

					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: calendarOpen ? 8 : 16 }}>
						<div>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginBottom: 8 }} className="text-text-secondary">{i18n.t("common.selectDate")}<span style={{ color: "#ef4444" }}> *</span></p>
							<button onClick={() => setCalendarOpen(v => !v)} style={{ width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "space-between", background: isLight ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.05)", border: `1px solid ${calendarOpen ? "#d97706" : isLight ? "rgba(10,10,14,0.2)" : "var(--color-border-subtle)"}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}>
								<span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
									<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} className="text-text-secondary"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: selDate ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className={selDate ? "text-text-primary" : "text-text-secondary"}>{selDate ? fmt(selDate) : i18n.t("automotive.selectDatePlaceholder", { defaultValue: "Select a date" })}</span>
								</span>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: calendarOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} className="text-text-secondary"><polyline points="6 9 12 15 18 9"/></svg>
							</button>
						</div>

						<div>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginBottom: 8 }} className="text-text-secondary">{i18n.t("common.selectTime", { defaultValue: "Select Time" })}<span style={{ color: "#ef4444" }}> *</span></p>
							<div style={{ position: "relative" }}>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} className="text-text-secondary"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
								<select value={selTime || ""} onChange={e => setSelTime(e.target.value)} disabled={!selDate}
									style={{ width: "100%", boxSizing: "border-box", appearance: "none", WebkitAppearance: "none", MozAppearance: "none", background: isLight ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.05)", border: `1px solid ${selTime ? "#d97706" : isLight ? "rgba(10,10,14,0.2)" : "var(--color-border-subtle)"}`, borderRadius: 10, padding: "10px 30px 10px 34px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: selTime ? 600 : 400, color: !selDate ? "var(--color-text-muted)" : "var(--color-text-primary)", cursor: selDate ? "pointer" : "default", opacity: !selDate ? 0.6 : 1 }}>
									<option value="" disabled>{selDate ? i18n.t("automotive.selectTimePlaceholder", { defaultValue: "Choose a time" }) : i18n.t("automotive.pickDateFirst", { defaultValue: "Pick a date first" })}</option>
									{selDate && TIME_SLOTS.map(t => {
										const taken = timeSlotTaken(dayKey(selDate), t);
										return <option key={t} value={t} disabled={taken}>{t}{taken ? ` · ${i18n.t("automotive.booked", { defaultValue: "Booked" })}` : ""}</option>;
									})}
								</select>
								<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} className="text-text-secondary"><polyline points="6 9 12 15 18 9"/></svg>
							</div>
						</div>
					</div>

					{calendarOpen && (
						<div style={{ marginBottom: 16 }}>
							<div style={{ width: 216, maxWidth: "100%", borderRadius: 12, padding: 8, border: isLight ? "1px solid rgba(10,10,14,0.14)" : "1px solid var(--color-border-subtle)", background: isLight ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.03)" }}>
								<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
									<button onClick={() => canGoPrevMonth && setCalMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} disabled={!canGoPrevMonth} style={{ background: "none", border: "none", padding: 2, display: "flex", cursor: canGoPrevMonth ? "pointer" : "default", opacity: canGoPrevMonth ? 1 : 0.3 }} className="text-text-secondary">
										<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
									</button>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 11 }} className="text-text-primary">{calMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
									<button onClick={() => setCalMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} style={{ background: "none", border: "none", padding: 2, display: "flex", cursor: "pointer" }} className="text-text-secondary">
										<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
									</button>
								</div>
								<div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
									{WEEKDAY_LABELS.map(w => (
										<span key={w} style={{ textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 8, fontWeight: 600 }} className="text-text-secondary">{w}</span>
									))}
								</div>
								<div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 1 }}>
									{calendarCells.map(({ date, inMonth }) => {
										const key = dayKey(date);
										const isToday = key === todayKey;
										const isAvailable = inMonth && isDateAvailable(date);
										const isSelected = selDate && key === dayKey(selDate);
										return (
											<button key={key + (inMonth ? "" : "-o")} disabled={!isAvailable}
												onClick={() => { setSelDate(date); setSelTime(null); setCalendarOpen(false); }}
												style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", aspectRatio: "1", background: isSelected ? "#d97706" : "transparent", border: isToday && !isSelected ? "1px solid #d97706" : "1px solid transparent", borderRadius: "50%", cursor: isAvailable ? "pointer" : "default", padding: 0 }}>
												<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: isSelected || isToday ? 700 : 500, color: isSelected ? "#fff" : !inMonth ? "var(--color-text-muted)" : !isAvailable ? "var(--color-text-muted)" : "var(--color-text-primary)", opacity: !inMonth ? 0.35 : 1 }}>{date.getDate()}</span>
												{isAvailable && !isSelected && <span style={{ position: "absolute", bottom: 1, width: 3, height: 3, borderRadius: "50%", background: "#d97706" }} />}
											</button>
										);
									})}
								</div>
							</div>
							<div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
								<span style={{ width: 6, height: 6, borderRadius: "50%", background: "#d97706", flexShrink: 0 }} />
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }} className="text-text-secondary">{i18n.t("automotive.availableDates", { defaultValue: "Available dates" })}</span>
							</div>
						</div>
					)}
					<div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 16 }}>
						<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-secondary"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
						<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }} className="text-text-secondary">{i18n.t("automotive.localTimeNote", { defaultValue: "All times are in your local time" })}</span>
					</div>

					<div style={{ marginBottom: 16 }}>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginBottom: 8 }} className="text-text-secondary">{i18n.t("automotive.contactDetails", { defaultValue: "Contact details" })}<span style={{ color: "#ef4444" }}> *</span></p>
						<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
							<div style={{ position: "relative" }}>
								<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", top: 11, left: 12 }} className="text-text-secondary"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
								<input value={contactName} onChange={e => setContactName(e.target.value)} placeholder={i18n.t("automotive.fullNamePlaceholder", { defaultValue: "Full name" })}
									style={{ width: "100%", boxSizing: "border-box", background: isLight ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.05)", border: isLight ? "1px solid rgba(10,10,14,0.2)" : "1px solid var(--color-border-subtle)", borderRadius: 10, padding: "9px 12px 9px 34px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none" }} className="text-text-primary" />
							</div>
							<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
								<div style={{ position: "relative" }}>
									<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", top: 11, left: 12 }} className="text-text-secondary"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
									<input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder={i18n.t("automotive.phoneNumberPlaceholder", { defaultValue: "Phone number" })}
										style={{ width: "100%", boxSizing: "border-box", background: isLight ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.05)", border: isLight ? "1px solid rgba(10,10,14,0.2)" : "1px solid var(--color-border-subtle)", borderRadius: 10, padding: "9px 12px 9px 34px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none" }} className="text-text-primary" />
								</div>
								<div style={{ position: "relative" }}>
									<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", top: 11, left: 12 }} className="text-text-secondary"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
									<input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder={i18n.t("automotive.emailAddressPlaceholder", { defaultValue: "Email address" })}
										style={{ width: "100%", boxSizing: "border-box", background: isLight ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.05)", border: isLight ? "1px solid rgba(10,10,14,0.2)" : "1px solid var(--color-border-subtle)", borderRadius: 10, padding: "9px 12px 9px 34px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none" }} className="text-text-primary" />
								</div>
							</div>
							{isMobileService && (
								<div style={{ position: "relative" }}>
									<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", top: 11, left: 12 }} className="text-text-secondary"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
									<input value={contactAddress} onChange={e => setContactAddress(e.target.value)} placeholder={i18n.t("automotive.serviceAddressPlaceholder", { defaultValue: "Service address" })}
										style={{ width: "100%", boxSizing: "border-box", background: isLight ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.05)", border: isLight ? "1px solid rgba(10,10,14,0.2)" : "1px solid var(--color-border-subtle)", borderRadius: 10, padding: "9px 12px 9px 34px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none" }} className="text-text-primary" />
								</div>
							)}
						</div>
					</div>

					<div style={{ position: "relative", marginBottom: 10 }}>
						<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", top: 11, left: 12 }} className="text-text-secondary"><path d="M5 17h-2v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
						<textarea value={notes} onChange={e => setNotes(e.target.value.slice(0, 250))} rows={2} maxLength={250} placeholder={i18n.t("automotive.vehicleNotesPlaceholder")}
							style={{ width: "100%", boxSizing: "border-box", background: isLight ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 12px 18px 34px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, resize: "none", outline: "none", border: isLight ? "1px solid rgba(10,10,14,0.2)" : "1px solid var(--color-border-subtle)" }} className="text-text-primary" />
						<span style={{ position: "absolute", bottom: 6, right: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 10 }} className="text-text-secondary">{notes.length}/250</span>
					</div>
					<div style={{ marginBottom: refError ? 6 : 14 }}>
						<div style={{ position: "relative", display: "flex", gap: 6 }}>
							<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", top: 11, left: 12 }} className="text-text-secondary"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8"/><path d="M16.5 8a2.5 2.5 0 0 0 0-5C13 3 12 8 12 8"/></svg>
							<input value={refCode} onChange={e => { setRefCode(e.target.value); setRefApplied(false); setRefError(null); }} placeholder={i18n.t("automotive.referralCodeOptional", { defaultValue: "Referral code (optional)" })}
								style={{ flex: 1, boxSizing: "border-box", background: refApplied ? "rgba(5,150,105,0.1)" : isLight ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.05)", border: `1px solid ${refApplied ? "rgba(5,150,105,0.4)" : isLight ? "rgba(10,10,14,0.2)" : "var(--color-border-subtle)"}`, borderRadius: 10, padding: "9px 10px 9px 34px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, outline: "none" }} className="text-text-primary" />
							<button onClick={async () => { if (!refCode.trim() || refLoading || refApplied) return; setRefLoading(true); setRefError(null); try { await bindCheckoutReferralCode(refCode.trim()); setRefApplied(true); } catch (e) { setRefError(e?.response?.data?.message || i18n.t("automotive.invalidReferralCode")); } finally { setRefLoading(false); } }}
								style={{ padding: "9px 14px", background: refApplied ? "#059669" : "#d97706", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, cursor: refApplied || refLoading ? "default" : "pointer", whiteSpace: "nowrap", opacity: !refCode.trim() ? 0.5 : 1, transition: "background 0.2s" }}>
								{refApplied ? "✓" : refLoading ? "…" : i18n.t("common.apply")}
							</button>
						</div>
						{refError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#f87171", marginTop: 4 }}>{refError}</p>}
					</div>
					<div style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
						<div>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, margin: 0 }} className="text-text-primary">{i18n.t("ondemand.hire.total")}</p>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0 }} className="text-text-secondary">{i18n.t("automotive.servicePrice", { defaultValue: "Service price" })}</p>
						</div>
						<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 24, color: "#d97706" }}>${service.price}</span>
					</div>
					{isReal && selDate && selTime && (
						<div style={{ marginBottom: 12 }}>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 8 }} className="text-text-secondary">{i18n.t("common.cardDetails", { defaultValue: "Card details" })}<span style={{ color: "#ef4444" }}> *</span></p>
							<CardInput />
						</div>
					)}
					{payError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 10 }}>{payError}</p>}
					</div>
					<div style={{ padding: isMobile ? "12px 20px 20px" : "12px 28px 28px", borderTop: "1px solid var(--color-border-subtle)" }}>
					<button onClick={confirmBooking} disabled={!selDate || !selTime || !contactInfoComplete || payProcessing}
						style={{ width: "100%", background: selDate && selTime && contactInfoComplete ? "#d97706" : "var(--color-wash-3)", border: selDate && selTime && contactInfoComplete ? "none" : "1px solid var(--color-border)", borderRadius: 12, padding: "13px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: selDate && selTime && contactInfoComplete ? "#fff" : "var(--color-text-muted)", cursor: selDate && selTime && contactInfoComplete && !payProcessing ? "pointer" : "default", transition: "all 0.2s" }}>
						{payProcessing ? i18n.t("automotive.processing", { defaultValue: "Processing…" }) : !selDate || !selTime ? i18n.t("automotive.pickDateTime") : !contactInfoComplete ? i18n.t("automotive.completeYourDetails", { defaultValue: "Complete your details" }) : i18n.t("automotive.confirmBooking")}
					</button>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12 }}>
						<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-secondary"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
						<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }} className="text-text-secondary">
							{isReal ? i18n.t("automotive.secureBookingReal", { defaultValue: "Secure booking · Payment processed securely" }) : i18n.t("automotive.secureBookingDemo", { defaultValue: "Secure booking · No payment required now" })}
						</span>
					</div>
					</div>
				</div>
			</div>,
			document.body
		)}
	</>
	);
}

const DEALERSHIP_CATEGORY_DEFS = [
	{ id: "all", label: "All", color: "#2563eb", img: "https://images.unsplash.com/photo-1712885046114-5ea81a2f7555?w=100&h=100&fit=crop" },
	{ id: "Cars", label: "Cars", color: "#2563eb", img: "https://images.unsplash.com/photo-1608506436795-af65d01305bf?w=100&h=100&fit=crop" },
	{ id: "Motorcycles", label: "Motorcycles", color: "#7c3aed", img: "https://images.unsplash.com/photo-1584607106736-394705b2648e?w=100&h=100&fit=crop" },
	{ id: "Trucks", label: "Trucks", color: "#ea580c", img: "https://images.unsplash.com/photo-1646531839801-7d0010d7513a?w=100&h=100&fit=crop" },
	{ id: "Vans", label: "Vans", color: "#0891b2", img: "https://images.unsplash.com/photo-1775500819508-47e8cd3ec973?w=100&h=100&fit=crop" },
	{ id: "Commercial Vehicles", label: "Commercial Vehicles", color: "#059669", img: "https://images.unsplash.com/photo-1701637657912-9e23e32155d1?w=100&h=100&fit=crop" },
	{ id: "Agricultural Vehicles", label: "Agricultural Vehicles", color: "#65a30d", img: "https://images.unsplash.com/photo-1655980235599-8e3d642e4993?w=100&h=100&fit=crop" },
	{ id: "Construction Equipment", label: "Construction Equipment", color: "#dc2626", img: "https://images.unsplash.com/photo-1748974302709-20c4b9c76b04?w=100&h=100&fit=crop" },
	{ id: "Bicycles", label: "Bicycles", color: "#2563eb", img: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=100&h=100&fit=crop" },
	{ id: "Boats & Watercraft", label: "Boats & Watercraft", color: "#0ea5e9", img: "https://images.unsplash.com/photo-1525456535336-65e0abf79908?w=100&h=100&fit=crop" },
	{ id: "Other Vehicles", label: "Other Vehicles", color: "#64748b", img: "https://images.unsplash.com/photo-1770204101811-0da97a7e5a31?w=100&h=100&fit=crop" },
];

function formatPostedDate(dateString) {
	if (!dateString) return '—';
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now - date;
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
	
	if (diffDays === 0) return 'Today';
	if (diffDays === 1) return 'Yesterday';
	if (diffDays < 7) return `${diffDays} days ago`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
	if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
	return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}

function highlightIconPath(tag) {
	switch (tag) {
		case "Expert Technicians":
			return <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>;
		case "Quality Parts Used":
			return <path d="M14.7 6.3a4 4 0 10-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 005.4-5.4z"/>;
		case "Warranty Included":
			return <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></>;
		case "Quick Service":
			return <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>;
		case "24/7 Support":
			return <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></>;
		default:
			return <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>;
	}
}

const TEST_DRIVE_TIME_SLOTS = [
	{ value: "9:00", label: "9:00 AM" },
	{ value: "10:00", label: "10:00 AM" },
	{ value: "11:00", label: "11:00 AM" },
	{ value: "12:00", label: "12:00 PM" },
	{ value: "13:00", label: "1:00 PM" },
	{ value: "14:00", label: "2:00 PM" },
	{ value: "15:00", label: "3:00 PM" },
	{ value: "16:00", label: "4:00 PM" },
	{ value: "17:00", label: "5:00 PM" },
];

function DealershipDetailPage({ item, onBack }) {
	const { isMobile } = useViewport();
	const { money } = useMoney();
	const loading = usePageLoad(150);
	const [theme] = useTheme();
	const isLight = theme === "light";
	const [selectedMediaIndex, setSelectedMediaIndex] = useState(item.video_url ? 0 : 0);
	const [similarVehicles, setSimilarVehicles] = useState([]);
	const [sellerInfo, setSellerInfo] = useState(null);
	const [isVideoMuted, setIsVideoMuted] = useState(true);
	const [videoLoaded, setVideoLoaded] = useState(false);
	const [testDriveModalOpen, setTestDriveModalOpen] = useState(false);
	const [vehicleSaved, setVehicleSaved] = useState(false);

	// Hydrate the heart button from the cross-vertical /saves endpoint, so it still shows filled
	// after navigating away and back (it used to be local-only UI state and always reset to unsaved).
	useEffect(() => {
		if (!isAuthenticated() || !item.id) return undefined;
		let alive = true;
		getSaves("vehicle").then(res => {
			if (!alive) return;
			const list = Array.isArray(res) ? res : (res?.data ?? []);
			setVehicleSaved(list.some(s => String(s.entity_id) === String(item.id)));
		}).catch(() => {});
		return () => { alive = false; };
	}, [item.id]);

	// Without this, the background page stays scrollable behind the portaled overlay — mirrors
	// the lock in MechanicServiceDetailPage's Book Appointment modal.
	useEffect(() => {
		if (!testDriveModalOpen) return undefined;
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => { document.body.style.overflow = prev; };
	}, [testDriveModalOpen]);

	const [preferredDate, setPreferredDate] = useState('');
	const [preferredTime, setPreferredTime] = useState('');
	const [fullName, setFullName] = useState('');
	const [phoneNumber, setPhoneNumber] = useState('');
	const [email, setEmail] = useState('');
	const [notes, setNotes] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState(null);
	const [submitSuccess, setSubmitSuccess] = useState(false);
	const [bookedTimes, setBookedTimes] = useState([]);
	const [loadingBookedTimes, setLoadingBookedTimes] = useState(false);
	const [dateCalendarOpen, setDateCalendarOpen] = useState(false);
	const [dateCalMonth, setDateCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
	const videoRef = useRef(null);
	const images = item.images || [];
	const totalMediaCount = images.length + (item.video_url ? 1 : 0);
	const hasVideo = !!item.video_url;
	const todayDateOnly = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); })();
	const dateDayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	const dateFmt = d => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
	const buildDateCalendarCells = monthDate => {
		const year = monthDate.getFullYear();
		const month = monthDate.getMonth();
		const startWeekday = new Date(year, month, 1).getDay();
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
		return Array.from({ length: totalCells }, (_, i) => {
			const date = new Date(year, month, i - startWeekday + 1);
			return { date, inMonth: date.getMonth() === month };
		});
	};
	const dateCalendarCells = buildDateCalendarCells(dateCalMonth);
	const canGoPrevDateMonth = dateCalMonth.getFullYear() > todayDateOnly.getFullYear() || (dateCalMonth.getFullYear() === todayDateOnly.getFullYear() && dateCalMonth.getMonth() > todayDateOnly.getMonth());
	const preferredDateObj = preferredDate ? new Date(`${preferredDate}T00:00:00`) : null;

	useEffect(() => {
		return () => {
			if (videoRef.current) {
				videoRef.current.pause();
				videoRef.current.src = "";
				videoRef.current.load();
			}
			setVideoLoaded(false);
		};
	}, []);

	useEffect(() => {
		if (hasVideo && selectedMediaIndex !== 0 && videoRef.current) {
			videoRef.current.pause();
			videoRef.current.src = "";
			videoRef.current.load();
			setVideoLoaded(false);
		}
	}, [selectedMediaIndex, hasVideo]);

	useEffect(() => {
		if (!testDriveModalOpen || !preferredDate || !item.id) {
			setBookedTimes([]);
			return;
		}
		let cancelled = false;
		setLoadingBookedTimes(true);
		getBookedTestDriveTimes(item.id, preferredDate)
			.then((res) => {
				if (!cancelled) setBookedTimes(Array.isArray(res?.data) ? res.data : []);
			})
			.catch(() => {
				if (!cancelled) setBookedTimes([]);
			})
			.finally(() => {
				if (!cancelled) setLoadingBookedTimes(false);
			});
		return () => { cancelled = true; };
	}, [testDriveModalOpen, preferredDate, item.id]);

	useEffect(() => {
		if (preferredTime && bookedTimes.includes(preferredTime)) {
			setPreferredTime('');
		}
	}, [bookedTimes, preferredTime]);

	useEffect(() => {
		if (submitSuccess) {
			const timer = setTimeout(() => {
				setSubmitSuccess(false);
			}, 3000);
			return () => clearTimeout(timer);
		}
	}, [submitSuccess]);

	const handleTestDriveSubmit = async () => {
		setSubmitError(null);

		if (!preferredDate || !preferredTime || !fullName || !phoneNumber || !email) {
			setSubmitError('Please fill in all required fields');
			return;
		}

		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			setSubmitError('Please enter a valid email address');
			return;
		}

		setIsSubmitting(true);

		try {
			const requestData = {
				vehicle_id: item.id,
				seller_id: item.user_id,
				preferred_date: preferredDate,
				preferred_time: preferredTime,
				full_name: fullName,
				phone_number: phoneNumber,
				email: email,
				notes: notes || null,
			};

			const response = await createTestDriveRequest(requestData);

			if (response.successful) {
				setPreferredDate('');
				setPreferredTime('');
				setFullName('');
				setPhoneNumber('');
				setEmail('');
				setNotes('');
				setTestDriveModalOpen(false);
				setSubmitSuccess(true);
			} else {
				setSubmitError(response.message || 'Failed to submit request');
			}
		} catch (error) {
			console.error('Error submitting test drive request:', error);
			setSubmitError(error.response?.data?.message || 'An error occurred while submitting your request');
		} finally {
			setIsSubmitting(false);
		}
	};

	useEffect(() => {
		getAllAutomotiveVehicles().then(r => {
			if (Array.isArray(r) && r.length) {
				const similar = r
					.filter(v => v.vehicle_id !== item.id && v.vehicle_type === item.sub)
					.slice(0, 6)
					.map(v => ({
						id: v.vehicle_id,
						name: `${v.make || ''} ${v.model || ''}`.trim() || 'Vehicle',
						sub: v.vehicle_type || '',
						price: Number(v.price) || 0,
						year: v.year || '',
						mileage: v.mileage || '',
						make: v.make || '',
						model: v.model || '',
						fuel: v.fuel || '',
						transmission: v.transmission || '',
						engine: v.engine || '',
						color: v.color || '',
						condition: v.condition || '',
						images: v.images ? JSON.parse(v.images) : [],
						video_url: v.video_url || null,
						vehicle_pic_url: v.vehicle_pic_url || null,
						user_id: v.user_id || null,
						created_at: v.created_at || null,
						description: v.description || null,
						is_negotiable: v.is_negotiable || false,
					}));
				setSimilarVehicles(similar);
			}
		}).catch(() => {});
	}, [item.id, item.sub]);

	useEffect(() => {
		if (item.user_id) {
			getVerticalProfileByUser(item.user_id, 'automotive').then(r => {
				setSellerInfo(r?.data || r);
			}).catch(() => {});
		}
	}, [item.user_id]);

	if (loading) return (
		<div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 32, paddingBottom: 24 }}>
			<div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
			<Skel w={100} h={14} r={6} style={{ marginBottom: 24 }} />
			<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 380px", gap: 24 }}>
				<Skel w="100%" h={400} r={16} />
				<div>
					<Skel w="70%" h={28} r={8} style={{ marginBottom: 12 }} />
					<Skel w="40%" h={36} r={8} style={{ marginBottom: 16 }} />
					<Skel w="100%" h={44} r={10} style={{ marginBottom: 12 }} />
					<Skel w="100%" h={44} r={10} />
				</div>
			</div>
			</div>
		</div>
	);

	// You May Also Like — rendered inline after the description on desktop, but moved to the very
	// end of the page on mobile (after price/CTA/seller info) so browsing suggestions come last.
	const similarVehiclesSection = similarVehicles.length > 0 && (
						<div>
							<h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, marginBottom: 16, letterSpacing: "0.02em" }} className="text-text-primary">You May Also Like</h3>
							<div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none" }}>
								{similarVehicles.slice(0, 3).map((vehicle) => {
									const vehicleImages = vehicle.images || [];
									const vehicleDisplayImage = vehicleImages.length > 0 ? vehicleImages[0] : vehicle.vehicle_pic_url;
									return (
										<div
											key={vehicle.id}
											onClick={() => onBack(vehicle)}
											style={{
												minWidth: 280,
												maxWidth: 280,
												borderRadius: 16,
												overflow: "hidden",
												cursor: "pointer",
												transition: "all 0.2s ease",
												flexShrink: 0,
												border: isLight ? "1px solid rgba(10,10,14,0.25)" : "1px solid var(--color-border-subtle)",
												boxShadow: isLight ? "0 2px 8px rgba(0,0,0,0.1)" : "none",
											}} className="bg-surface"
											onMouseEnter={(e) => {
												e.target.style.transform = "translateY(-4px)";
												e.target.style.boxShadow = isLight ? "0 8px 20px rgba(0,0,0,0.15)" : "0 8px 24px var(--color-shadow)";
											}}
											onMouseLeave={(e) => {
												e.target.style.transform = "translateY(0)";
												e.target.style.boxShadow = isLight ? "0 2px 8px rgba(0,0,0,0.1)" : "none";
											}}
										>
											<div style={{ height: 160, position: "relative", overflow: "hidden" }}>
												{vehicleDisplayImage ? (
													<img
														src={vehicleDisplayImage}
														alt={vehicle.name}
														style={{ width: "100%", height: "100%", objectFit: "cover" }}
													/>
												) : (
													<div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #1e293b, #0f172a)", display: "flex", alignItems: "center", justifyContent: "center" }}>
														<AutomotiveIcon s={40} />
													</div>
												)}
												<button
													onClick={(e) => { e.stopPropagation(); }}
													style={{
														position: "absolute",
														top: 10,
														right: 10,
														background: "rgba(0,0,0,0.6)",
														backdropFilter: "blur(10px)",
														border: "1px solid rgba(255,255,255,0.2)",
														borderRadius: "50%",
														width: 32,
														height: 32,
														display: "flex",
														alignItems: "center",
														justifyContent: "center",
														cursor: "pointer",
													}}
												>
													<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
														<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
													</svg>
												</button>
											</div>
											<div style={{ padding: "14px 16px" }}>
												<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, marginBottom: 4, lineHeight: 1.3 }} className="text-text-primary">{vehicle.name}</p>
												<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 8 }} className="text-text-secondary">{vehicle.year} · {vehicle.sub}</p>
												<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, color: "#2563eb" }}>{money(vehicle.price)}</p>
											</div>
										</div>
									);
								})}
							</div>
						</div>
	);

	return (
		<div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 32, paddingBottom: 24 }}>
			<div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
			<button onClick={() => onBack(null)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 24, display: "flex", alignItems: "center", gap: 6, padding: 0 }} className="text-text-secondary">← Dealerships</button>
			
			{/* Two Column Layout */}
			<div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) 380px", gap: 28, marginBottom: 32 }}>
				{/* Left Column - Image Gallery */}
				<div style={{ minWidth: 0 }}>
					{totalMediaCount > 0 ? (
						<div style={{ marginBottom: 24 }}>
							{/* Main Image Display */}
							<div
								style={{
									position: "relative",
									width: "100%",
									height: isMobile ? 300 : 500,
									borderRadius: 18,
									border: isLight ? "1px solid rgba(10,10,14,0.3)" : "1px solid rgba(255,255,255,0.08)",
									overflow: "hidden",
									marginBottom: 16,
									background: "#000",
									boxShadow: isLight ? "0 4px 16px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1)" : "0 8px 32px rgba(0,0,0,0.3)",
								}}
							>
								{/* Image */}
								{(!hasVideo || selectedMediaIndex > 0) && (
									<img
										src={images[hasVideo ? selectedMediaIndex - 1 : selectedMediaIndex] || item.vehicle_pic_url}
										alt={`${item.make} ${item.model}`}
										style={{
											width: "100%",
											height: "100%",
											objectFit: "cover",
											display: "block",
										}}
									/>
								)}

								{/* Video */}
								{hasVideo && selectedMediaIndex === 0 && (
									<video
										ref={videoRef}
										poster={images[0] || item.vehicle_pic_url}
										preload="metadata"
										style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
										controls
										autoPlay
										muted={isVideoMuted}
										onLoadedData={() => setVideoLoaded(true)}
										onCanPlay={() => setVideoLoaded(true)}
									>
										<source src={item.video_url} type="video/mp4" />
									</video>
								)}

								{/* Navigation Arrows */}
								{totalMediaCount > 1 && (
									<>
										<button
											onClick={() => setSelectedMediaIndex(prev => prev > 0 ? prev - 1 : totalMediaCount - 1)}
											style={{
												position: "absolute",
												left: 12,
												top: "50%",
												transform: "translateY(-50%)",
												background: "rgba(0,0,0,0.6)",
												backdropFilter: "blur(10px)",
												border: "1px solid rgba(255,255,255,0.2)",
												borderRadius: "50%",
												width: 44,
												height: 44,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												cursor: "pointer",
												transition: "all 0.2s ease",
											}}
											onMouseEnter={(e) => {
												e.target.style.background = "rgba(0,0,0,0.8)";
											}}
											onMouseLeave={(e) => {
												e.target.style.background = "rgba(0,0,0,0.6)";
											}}
										>
											<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
										</button>
										<button
											onClick={() => setSelectedMediaIndex(prev => prev < totalMediaCount - 1 ? prev + 1 : 0)}
											style={{
												position: "absolute",
												right: 12,
												top: "50%",
												transform: "translateY(-50%)",
												background: "rgba(0,0,0,0.6)",
												backdropFilter: "blur(10px)",
												border: "1px solid rgba(255,255,255,0.2)",
												borderRadius: "50%",
												width: 44,
												height: 44,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												cursor: "pointer",
												transition: "all 0.2s ease",
											}}
											onMouseEnter={(e) => {
												e.target.style.background = "rgba(0,0,0,0.8)";
											}}
											onMouseLeave={(e) => {
												e.target.style.background = "rgba(0,0,0,0.6)";
											}}
										>
											<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
										</button>
									</>
								)}

								{/* Like Button - Top Right — shared cross-vertical /saves toggle (see Favourites page,
								    which already buckets entity_type "vehicle" into its "vehicles" category). */}
								<SaveButton
									entityType="vehicle"
									entityId={item.id}
									initialSaved={vehicleSaved}
									meta={{
										title: item.name,
										sub: item.sub || [item.make, item.model].filter(Boolean).join(" "),
										price: money(item.price),
										thumb: images[0] || item.vehicle_pic_url || item.gradient,
										accent: "#2563eb",
									}}
									size={40}
									style={{ position: "absolute", top: 12, right: 12, zIndex: 10 }}
								/>

								{/* Image Counter */}
								<span style={{
									position: "absolute",
									bottom: 12,
									left: 12,
									background: "rgba(0,0,0,0.6)",
									backdropFilter: "blur(10px)",
									borderRadius: 20,
									padding: "6px 14px",
									fontFamily: "'DM Sans', sans-serif",
									fontSize: 12,
									fontWeight: 600,
									color: "#fff",
								}}>
									{selectedMediaIndex + 1} / {totalMediaCount}
								</span>
							</div>

							{/* Thumbnails */}
							{totalMediaCount > 1 && (
								<div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
									{hasVideo && (
										<button
											key="video"
											onClick={() => setSelectedMediaIndex(0)}
											style={{
												position: "relative",
												width: 90,
												height: 68,
												borderRadius: 10,
												border: selectedMediaIndex === 0 ? "2px solid #2563eb" : isLight ? "1px solid rgba(10,10,14,0.25)" : "1px solid rgba(255,255,255,0.1)",
												overflow: "hidden",
												cursor: "pointer",
												padding: 0,
												flexShrink: 0,
												background: "#000",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												transition: "all 0.2s ease",
											}}
										>
											<svg width={28} height={28} viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
										</button>
									)}
									{images.map((img, idx) => (
										<button
											key={`img-${idx}`}
											onClick={() => setSelectedMediaIndex(hasVideo ? idx + 1 : idx)}
											style={{
												position: "relative",
												width: 90,
												height: 68,
												borderRadius: 10,
												border: selectedMediaIndex === (hasVideo ? idx + 1 : idx) ? "2px solid #2563eb" : isLight ? "1px solid rgba(10,10,14,0.25)" : "1px solid rgba(255,255,255,0.1)",
												overflow: "hidden",
												cursor: "pointer",
												padding: 0,
												flexShrink: 0,
												transition: "all 0.2s ease",
											}}
										>
											<img
												src={img}
												alt={`Thumbnail ${idx + 1}`}
												style={{ width: "100%", height: "100%", objectFit: "cover" }}
											/>
										</button>
									))}
								</div>
							)}
						</div>
					) : (
						<div style={{ width: "100%", height: 400, background: item.gradient, borderRadius: 18, marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
							<AutomotiveIcon s={64} />
						</div>
					)}

					{/* Vehicle Overview Section */}
					<div style={{ marginBottom: 32 }}>
						<h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, marginBottom: 16, letterSpacing: "0.02em" }} className="text-text-primary">Vehicle Overview</h3>
						
						{/* Specification Cards Grid */}
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))", gap: 16, marginBottom: 24 }}>
							{[
								{ label: "Make", value: item.make, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/><path d="M6 6v12"/><path d="M18 6v12"/></svg> },
								{ label: "Model", value: item.model, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M14 10H7"/></svg> },
								{ label: "Year", value: item.year, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
								{ label: "Mileage", value: item.mileage ? `${item.mileage.toLocaleString()} mi` : "—", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/><path d="M6 12a6 6 0 0 1 6-6 6 6 0 0 1 6 6"/></svg> },
								{ label: "Fuel", value: item.fuel, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 22v-8a2 2 0 0 1 2-2h4"/><path d="M15 22v-4"/><path d="M18 22v-4"/><path d="M21 22v-4"/><path d="M21 10V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4"/><path d="M15 10a4 4 0 0 0-4 4v2"/><path d="M15 10v10"/></svg> },
								{ label: "Transmission", value: item.transmission, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
								{ label: "Engine", value: item.engine, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/><path d="M6 12a6 6 0 0 1 6-6 6 6 0 0 1 6 6"/></svg> },
								{ label: "Color", value: item.color, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="19" cy="17" r="2"/><circle cx="6" cy="12" r="3"/><circle cx="12" cy="19" r="2"/><path d="M8.5 2.5a2.121 2.121 0 0 1 3 3L12 12l-5 5"/></svg> },
								{ label: "Condition", value: item.condition, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
							].map((spec, idx) => (
								<div key={idx} style={{
									borderRadius: 18,
									padding: "16px",
									display: "flex",
									alignItems: "center",
									gap: 14,
									minWidth: 0,
									boxShadow: isLight ? "0 2px 8px rgba(0,0,0,0.1)" : "0 2px 8px var(--color-shadow)",
									transition: "all 0.2s ease",
									minHeight: 80,
									border: isLight ? "1px solid rgba(10,10,14,0.2)" : "1px solid var(--color-border-subtle)",
								}} className="bg-surface-raised"
								onMouseEnter={(e) => {
									e.currentTarget.style.transform = "translateY(-4px)";
									e.currentTarget.style.boxShadow = isLight ? "0 8px 20px rgba(0,0,0,0.15)" : "0 8px 24px var(--color-shadow)";
									e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)";
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.transform = "translateY(0)";
									e.currentTarget.style.boxShadow = isLight ? "0 2px 8px rgba(0,0,0,0.1)" : "0 2px 8px var(--color-shadow)";
									e.currentTarget.style.borderColor = isLight ? "rgba(10,10,14,0.2)" : "var(--color-border-subtle)";
								}}
								>
									<div style={{
										width: 40,
										height: 40,
										borderRadius: 10,
										background: "rgba(59,130,246,0.12)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										flexShrink: 0,
									}}>
										{spec.icon}
									</div>
									<div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, overflow: "hidden" }}>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500 }} className="text-text-secondary">{spec.label}</span>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 17, fontWeight: 600 }} className="text-text-primary">{spec.value || "—"}</span>
									</div>
								</div>
							))}
						</div>

						{/* Description Card */}
						<div style={{
							borderRadius: 16,
							padding: "24px",
							border: isLight ? "1px solid rgba(10,10,14,0.2)" : "1px solid var(--color-border-subtle)",
							boxShadow: isLight ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
						}} className="bg-surface-raised">
							<h4 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 12 }} className="text-text-primary">Description</h4>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.7, margin: 0 }} className="text-text-secondary">
								{item.description || `This ${item.year} ${item.make} ${item.model} is in ${item.condition?.toLowerCase() || "excellent"} condition. With ${item.mileage ? `${item.mileage.toLocaleString()} miles` : "low mileage"}, this vehicle offers great value. Features include ${item.transmission} transmission, ${item.fuel} fuel type${item.engine ? `, ${item.engine} engine` : ''}, and comes in ${item.color}. Contact us today to schedule a test drive and experience this vehicle for yourself.`}
							</p>
						</div>
					</div>

					{!isMobile && similarVehiclesSection}
				</div>

				{/* Right Sidebar */}
				<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
					{/* Vehicle Info Card */}
					<div style={{
						background: isLight ? "linear-gradient(135deg, rgba(255,255,255,0.8), rgba(255,255,255,0.6))" : "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
						borderRadius: 18,
						padding: "24px",
						boxShadow: isLight ? "0 4px 16px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)" : "0 8px 32px var(--color-shadow)",
						border: isLight ? "1px solid rgba(10,10,14,0.2)" : "1px solid var(--color-border-subtle)",
					}}>
						{/* Title */}
						<h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, marginBottom: 8, lineHeight: 1.2 }} className="text-text-primary">{item.name}</h2>
						
						{/* Metadata */}
						<div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }} className="text-text-secondary">
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
								{item.year}
							</span>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }} className="text-text-secondary">
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
								{item.transmission || "—"}
							</span>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }} className="text-text-secondary">
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><path d="M12 6v6l4 2"/></svg>
								{item.mileage ? `${item.mileage.toLocaleString()} mi` : "—"}
							</span>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }} className="text-text-secondary">
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.74 5.88-5.74 5.88-5.74-5.88z"/><path d="M12 22.31l5.74-5.88-5.74-5.88-5.74 5.88z"/></svg>
								{item.fuel || "—"}
							</span>
						</div>

						{/* Status Badge */}
						<div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
							<span style={{
								background: "rgba(37,99,235,0.15)",
								border: "1px solid rgba(37,99,235,0.3)",
								borderRadius: 8,
								padding: "6px 14px",
								fontFamily: "'DM Sans', sans-serif",
								fontWeight: 700,
								fontSize: 12,
								color: "#60a5fa",
								textTransform: "uppercase",
								letterSpacing: "0.05em",
							}}>
								{item.condition || "Available"}
							</span>
							{item.is_negotiable && (
								<span style={{
									background: "rgba(34,197,94,0.15)",
									border: "1px solid rgba(34,197,94,0.3)",
									borderRadius: 8,
									padding: "6px 14px",
									fontFamily: "'DM Sans', sans-serif",
									fontWeight: 700,
									fontSize: 12,
									color: "#22c55e",
									textTransform: "uppercase",
									letterSpacing: "0.05em",
								}}>
									Negotiable
								</span>
							)}
						</div>

						{/* Price */}
						<div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 36, color: "#2563eb", marginBottom: 20, letterSpacing: "0.02em" }}>
							{money(item.price)}
						</div>

						{/* CTA Buttons */}
						<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
							<button 
								onClick={() => setTestDriveModalOpen(true)}
								style={{
									background: "#2563eb",
									border: "none",
									borderRadius: 12,
									padding: "14px 20px",
									fontFamily: "'DM Sans', sans-serif",
									fontWeight: 700,
									fontSize: 15,
									color: "#fff",
									cursor: "pointer",
									transition: "all 0.2s ease",
									boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
								}}
								onMouseEnter={(e) => {
									e.target.style.background = "#1d4ed8";
									e.target.style.transform = "translateY(-2px)";
								}}
								onMouseLeave={(e) => {
									e.target.style.background = "#2563eb";
									e.target.style.transform = "translateY(0)";
								}}>
								Schedule Test Drive
							</button>
							<button 
								onClick={async () => {
									if (!item.user_id) return;
									if (!isAuthenticated()) {
										alert("Please log in to message the seller");
										return;
									}
									try {
										const channel = await openDmChannel(item.user_id, { sourceVertical: "automotive" });
										const channelId = channel?.channel_id ?? channel?.id;
										if (channelId) {
											window.__openChatChannelId = Number(channelId);
											if (window.__nav) window.__nav("messages");
										}
									} catch (error) {
										console.error("Failed to open chat channel:", error);
									}
								}}
								style={{
									background: "transparent",
									border: "2px solid #2563eb",
									borderRadius: 12,
									padding: "14px 20px",
									fontFamily: "'DM Sans', sans-serif",
									fontWeight: 700,
									fontSize: 15,
									color: "#2563eb",
									cursor: "pointer",
									transition: "all 0.2s ease",
								}}
								onMouseEnter={(e) => {
									e.target.style.background = "rgba(37,99,235,0.1)";
									e.target.style.transform = "translateY(-2px)";
								}}
								onMouseLeave={(e) => {
									e.target.style.background = "transparent";
									e.target.style.transform = "translateY(0)";
								}}>
								Message Seller
							</button>
						</div>
					</div>

					{/* Vehicle Information Card */}
					<div style={{
						background: isLight ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.03)",
						borderRadius: 18,
						padding: "20px",
						marginBottom: 24,
						border: isLight ? "1px solid rgba(10,10,14,0.2)" : "1px solid var(--color-border-subtle)",
						boxShadow: isLight ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
					}}>
						<h4 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 16 }} className="text-text-primary">Vehicle Information</h4>
						
						<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
							{/* Posted */}
							<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
								<div style={{
									width: 36,
									height: 36,
									borderRadius: 10,
									background: "rgba(59, 130, 246, 0.15)",
									border: "1px solid rgba(59, 130, 246, 0.3)",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									flexShrink: 0,
								}}>
									<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<circle cx="12" cy="12" r="10"/>
										<polyline points="12 6 12 12 16 14"/>
									</svg>
								</div>
								<div>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0, marginBottom: 2 }} className="text-text-secondary">Posted</p>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, margin: 0 }} className="text-text-primary">{formatPostedDate(item.created_at)}</p>
								</div>
							</div>

							{/* Category */}
							<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
								<div style={{
									width: 36,
									height: 36,
									borderRadius: 10,
									background: "rgba(59, 130, 246, 0.15)",
									border: "1px solid rgba(59, 130, 246, 0.3)",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									flexShrink: 0,
								}}>
									<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<rect x="3" y="3" width="7" height="7"/>
										<rect x="14" y="3" width="7" height="7"/>
										<rect x="14" y="14" width="7" height="7"/>
										<rect x="3" y="14" width="7" height="7"/>
									</svg>
								</div>
								<div>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0, marginBottom: 2 }} className="text-text-secondary">Category</p>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, margin: 0 }} className="text-text-primary">{item.sub || item.vehicle_type || '—'}</p>
								</div>
							</div>

							{/* Pricing */}
							<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
								<div style={{
									width: 36,
									height: 36,
									borderRadius: 10,
									background: "rgba(59, 130, 246, 0.15)",
									border: "1px solid rgba(59, 130, 246, 0.3)",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									flexShrink: 0,
								}}>
									<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<line x1="12" y1="1" x2="12" y2="23"/>
										<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
									</svg>
								</div>
								<div>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0, marginBottom: 2 }} className="text-text-secondary">Pricing</p>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, margin: 0 }} className="text-text-primary">{item.is_negotiable ? 'Negotiable' : 'Fixed Price'}</p>
								</div>
							</div>
						</div>
					</div>

					{/* Seller Information Card */}
					<div style={{
						background: "rgba(255,255,255,0.03)",
						borderRadius: 18,
						padding: "24px",
					}} className="border border-border-subtle">
						<h4 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 16 }} className="text-text-primary">Seller Information</h4>
						
						<div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
							<div style={{
								width: 56,
								height: 56,
								borderRadius: "50%",
								background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: 24,
							}}>
								{sellerInfo?.profile_pic_url ? (
									<img src={sellerInfo.profile_pic_url} alt={sellerInfo.name} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
								) : (
									<span>🏢</span>
								)}
							</div>
							<div>
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, margin: 0 }} className="text-text-primary">{sellerInfo?.business_name || sellerInfo?.display_name || 'Seller'}</p>
								<div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
									<svg width={14} height={14} viewBox="0 0 24 24" fill="#fbbf24" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }} className="text-text-secondary">{sellerInfo?.is_verified ? 'Verified Seller' : 'New seller'}</span>
								</div>
							</div>
						</div>

						<div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
							<div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, flexShrink: 0 }} className="text-text-secondary">Location</span>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, textAlign: "right", wordBreak: "break-word", flex: "1 1 auto", minWidth: 0 }} className="text-text-primary">{sellerInfo?.location || '—'}</span>
							</div>
							{sellerInfo?.website && (
								<div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, flexShrink: 0 }} className="text-text-secondary">Website</span>
									<a
										href={/^https?:\/\//i.test(sellerInfo.website) ? sellerInfo.website : `https://${sellerInfo.website}`}
										target="_blank"
										rel="noopener noreferrer"
										style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, textAlign: "right", wordBreak: "break-word", flex: "1 1 auto", minWidth: 0, color: "#3B82F6", textDecoration: "none" }}
										onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
										onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
									>
										{sellerInfo.website}
									</a>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Mobile: You May Also Like moves to the very end of the page, after price/CTA/seller info */}
			{isMobile && similarVehiclesSection}
			</div>

			{/* Schedule Test Drive Modal */}
			{testDriveModalOpen && createPortal(
				<div style={{
					position: "fixed",
					top: 0,
					left: 0,
					right: 0,
					bottom: 0,
					background: "rgba(0, 0, 0, 0.75)",
					backdropFilter: "blur(8px)",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					zIndex: 1000,
					padding: 16
				}}>
					<div style={{
						position: "relative",
						backdropFilter: "blur(20px)",
						borderRadius: 20,
						boxShadow: "0 25px 50px -12px var(--color-shadow), 0 0 60px rgba(37, 99, 235, 0.12)",
						maxWidth: 900,
						width: "100%",
						maxHeight: "95vh",
						overflowY: "auto",
						padding: isMobile ? 24 : 32
					}} className="bg-surface border border-border-subtle">
						{/* Close Button */}
						<button
							onClick={() => setTestDriveModalOpen(false)}
							style={{
								position: "absolute",
								top: 20,
								right: 20,
								background: "transparent",
								border: "none",
								cursor: "pointer",
								padding: 4,
								display: "flex",
								transition: "color 0.2s ease"
							}} className="text-text-secondary"
							onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-text-primary)"; }}
							onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-secondary)"; }}
						>
							<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<line x1="18" y1="6" x2="6" y2="18"/>
								<line x1="6" y1="6" x2="18" y2="18"/>
							</svg>
						</button>

						{/* Two Column Layout */}
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "35% 65%", gap: 32 }}>
							{/* Left Column - Vehicle Image & What to Expect */}
							<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
								{/* Vehicle Image */}
								<div style={{
									position: "relative",
									borderRadius: 16,
									overflow: "hidden",
									boxShadow: "0 8px 24px var(--color-shadow)"
								}} className="border border-border">
									<img
										src={images.length > 0 ? images[0] : item.vehicle_pic_url}
										alt={`${item.make} ${item.model}`}
										style={{
											width: "100%",
											height: isMobile ? "auto" : 300,
											objectFit: "cover",
											display: "block"
										}}
									/>
								</div>

								{/* What to Expect Section */}
								<div style={{
									background: "rgba(25ss5, 255, 255, 0.03)",
									backdropFilter: "blur(10px)",
									borderRadius: 16,
									padding: 32,
									minHeight: 350,
									boxShadow: "0 8px 32px var(--color-shadow)"
								}} className="border border-border-subtle">
									<h3 style={{
										fontFamily: "'DM Sans', sans-serif",
										fontWeight: 600,
										fontSize: 16,
										margin: "0 0 24px 0"
									}} className="text-text-primary">
										What to expect
									</h3>
									<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
										{/* Personal Experience - steering wheel */}
										<div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
											<div style={{
												width: 36,
												height: 36,
												borderRadius: "50%",
												background: "rgba(59, 130, 246, 0.15)",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												flexShrink: 0
											}}>
												<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
													<circle cx="12" cy="12" r="9"/>
													<circle cx="12" cy="12" r="2.5"/>
													<path d="M12 5v4.5M7 15.5l3-2M17 15.5l-3-2"/>
												</svg>
											</div>
											<div>
												<p style={{
													fontFamily: "'DM Sans', sans-serif",
													fontWeight: 700,
													fontSize: 14,
													margin: "0 0 4px 0"
												}} className="text-text-primary">
													Personal Experience
												</p>
												<p style={{
													fontFamily: "'DM Sans', sans-serif",
													fontSize: 13,
													margin: 0,
													lineHeight: 1.5
												}} className="text-text-secondary">
													Get behind the wheel and feel the performance.
												</p>
											</div>
										</div>

										{/* No Obligation - shield check */}
										<div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
											<div style={{
												width: 36,
												height: 36,
												borderRadius: "50%",
												background: "rgba(59, 130, 246, 0.15)",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												flexShrink: 0
											}}>
												<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
													<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
													<path d="M9 12l2 2 4-4"/>
												</svg>
											</div>
											<div>
												<p style={{
													fontFamily: "'DM Sans', sans-serif",
													fontWeight: 700,
													fontSize: 14,
													margin: "0 0 4px 0"
												}} className="text-text-primary">
													No Obligation
												</p>
												<p style={{
													fontFamily: "'DM Sans', sans-serif",
													fontSize: 13,
													margin: 0,
													lineHeight: 1.5
												}} className="text-text-secondary">
													Test drive with no commitment to buy.
												</p>
											</div>
										</div>

										{/* At Your Convenience - clock */}
										<div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
											<div style={{
												width: 36,
												height: 36,
												borderRadius: "50%",
												background: "rgba(59, 130, 246, 0.15)",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												flexShrink: 0
											}}>
												<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
													<circle cx="12" cy="12" r="9"/>
													<polyline points="12 7 12 12 15.5 14"/>
												</svg>
											</div>
											<div>
												<p style={{
													fontFamily: "'DM Sans', sans-serif",
													fontWeight: 700,
													fontSize: 14,
													margin: "0 0 4px 0"
												}} className="text-text-primary">
													At Your Convenience
												</p>
												<p style={{
													fontFamily: "'DM Sans', sans-serif",
													fontSize: 13,
													margin: 0,
													lineHeight: 1.5
												}} className="text-text-secondary">
													Choose a time that works best for you.
												</p>
											</div>
										</div>
									</div>
								</div>
							</div>

							{/* Right Column - Form */}
							<div style={{ display: "flex", flexDirection: "column", gap: 20, paddingLeft: 5, paddingRight: 25 }}>
								{/* Header */}
								<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 8, textAlign: "center" }}>
									<div style={{
										width: 52,
										height: 52,
										borderRadius: "50%",
										background: "rgba(59, 130, 246, 0.15)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center"
									}}>
										<svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
											<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
											<line x1="16" y1="2" x2="16" y2="6"/>
											<line x1="8" y1="2" x2="8" y2="6"/>
											<line x1="3" y1="10" x2="21" y2="10"/>
										</svg>
									</div>
									<div>
										<h2 style={{
											fontFamily: "'Barlow Condensed', sans-serif",
											fontWeight: 800,
											fontSize: 26,
											margin: 0,
											letterSpacing: "0.02em"
										}} className="text-text-primary">
											Schedule a Test Drive
										</h2>
										<p style={{
											fontFamily: "'DM Sans', sans-serif",
											fontSize: 14,
											margin: "8px 0 0 0",
											maxWidth: 340,
											lineHeight: 1.5
										}} className="text-text-secondary">
											Choose your preferred date and time and submit your request. The seller will confirm your appointment.
										</p>
									</div>
								</div>

								{/* Form */}
								<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
									<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
										<label style={{
											fontFamily: "'DM Sans', sans-serif",
											fontSize: 13,
											fontWeight: 600
										}} className="text-text-secondary">
											Preferred Date <span style={{ color: "#ef4444" }}>*</span>
										</label>
										<button type="button" onClick={() => setDateCalendarOpen(v => !v)}
											style={{ width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255, 255, 255, 0.05)", border: dateCalendarOpen ? "1px solid #2563eb" : undefined, borderRadius: 10, padding: "12px 14px 12px 40px", position: "relative", cursor: "pointer", transition: "all 0.2s ease" }}
											className={`text-text-primary${dateCalendarOpen ? "" : " border border-border"}`}
										>
											<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
												<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
												<line x1="16" y1="2" x2="16" y2="6"/>
												<line x1="8" y1="2" x2="8" y2="6"/>
												<line x1="3" y1="10" x2="21" y2="10"/>
											</svg>
											<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: preferredDateObj ? 600 : 400 }} className={preferredDateObj ? "text-text-primary" : "text-text-secondary"}>
												{preferredDateObj ? dateFmt(preferredDateObj) : "Select a date"}
											</span>
											<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: dateCalendarOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><polyline points="6 9 12 15 18 9"/></svg>
										</button>
									</div>

									{/* Preferred Time */}
									<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
										<label style={{
											fontFamily: "'DM Sans', sans-serif",
											fontSize: 13,
											fontWeight: 600
										}} className="text-text-secondary">
											Preferred Time <span style={{ color: "#ef4444" }}>*</span>
										</label>
										<div style={{ position: "relative" }}>
											<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
												<circle cx="12" cy="12" r="9"/>
												<polyline points="12 7 12 12 15.5 14"/>
											</svg>
											<select
												value={preferredTime}
												onChange={(e) => setPreferredTime(e.target.value)}
												disabled={loadingBookedTimes}
												style={{
													width: "100%",
													boxSizing: "border-box",
													background: "rgba(255, 255, 255, 0.05)",
													borderRadius: 10,
													padding: "12px 14px 12px 40px",
													fontFamily: "'DM Sans', sans-serif",
													fontSize: 14,
													outline: "none",
													appearance: "none",
													WebkitAppearance: "none",
													MozAppearance: "none",
													transition: "all 0.2s ease",
													opacity: loadingBookedTimes ? 0.6 : 1,
													cursor: loadingBookedTimes ? "wait" : "pointer"
												}} className="border border-border text-text-primary"
											>
												<option value="" disabled>
													{loadingBookedTimes ? "Checking availability…" : "Select time"}
												</option>
												{(() => {
													const now = new Date();
													const selectedDate = preferredDate ? new Date(preferredDate) : null;
													const isToday = selectedDate && 
														selectedDate.getDate() === now.getDate() &&
														selectedDate.getMonth() === now.getMonth() &&
														selectedDate.getFullYear() === now.getFullYear();
													const currentHour = now.getHours();

													return TEST_DRIVE_TIME_SLOTS
														.filter((slot) => {
															if (bookedTimes.includes(slot.value)) return false;
															if (isToday) {
																const slotHour = parseInt(slot.value.split(':')[0]);
																return slotHour > currentHour;
															}
															return true;
														})
														.map((slot) => (
															<option key={slot.value} value={slot.value}>{slot.label}</option>
														));
												})()}
												{!loadingBookedTimes && preferredDate && (() => {
													const now = new Date();
													const selectedDate = new Date(preferredDate);
													const isToday = 
														selectedDate.getDate() === now.getDate() &&
														selectedDate.getMonth() === now.getMonth() &&
														selectedDate.getFullYear() === now.getFullYear();
													const currentHour = now.getHours();

													const availableSlots = TEST_DRIVE_TIME_SLOTS.filter((slot) => {
														if (bookedTimes.includes(slot.value)) return false;
														if (isToday) {
															const slotHour = parseInt(slot.value.split(':')[0]);
															return slotHour > currentHour;
														}
														return true;
													});

													return availableSlots.length === 0;
												})() && (
													<option value="" disabled>No times available on this date</option>
												)}
											</select>
											<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
												<polyline points="6 9 12 15 18 9"/>
											</svg>
										</div>
										{preferredDate && bookedTimes.length > 0 && (
											<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, margin: 0 }} className="text-text-muted">
												Some times on this date are already booked and aren't shown.
											</p>
										)}
									</div>

									{dateCalendarOpen && (
										<div style={{ gridColumn: isMobile ? "1" : "1 / -1" }}>
											<div style={{ width: 216, maxWidth: "100%", borderRadius: 12, padding: 8, border: "1px solid var(--color-border-subtle)", background: isLight ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.03)" }}>
												<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
													<button type="button" onClick={() => canGoPrevDateMonth && setDateCalMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} disabled={!canGoPrevDateMonth} style={{ background: "none", border: "none", padding: 2, display: "flex", cursor: canGoPrevDateMonth ? "pointer" : "default", opacity: canGoPrevDateMonth ? 1 : 0.3 }} className="text-text-secondary">
														<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
													</button>
													<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 11 }} className="text-text-primary">{dateCalMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
													<button type="button" onClick={() => setDateCalMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} style={{ background: "none", border: "none", padding: 2, display: "flex", cursor: "pointer" }} className="text-text-secondary">
														<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
													</button>
												</div>
												<div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
													{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(w => (
														<span key={w} style={{ textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 8, fontWeight: 600 }} className="text-text-secondary">{w}</span>
													))}
												</div>
												<div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 1 }}>
													{dateCalendarCells.map(({ date, inMonth }) => {
														const key = dateDayKey(date);
														const isToday = key === dateDayKey(todayDateOnly);
														const isPast = date.getTime() < todayDateOnly.getTime();
														const isSelectable = inMonth && !isPast;
														const isSelected = preferredDateObj && key === dateDayKey(preferredDateObj);
														return (
															<button type="button" key={key + (inMonth ? "" : "-o")} disabled={!isSelectable}
																onClick={() => { setPreferredDate(key); setDateCalendarOpen(false); }}
																style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", aspectRatio: "1", background: isSelected ? "#2563eb" : "transparent", border: isToday && !isSelected ? "1px solid #2563eb" : "1px solid transparent", borderRadius: "50%", cursor: isSelectable ? "pointer" : "default", padding: 0 }}>
																<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: isSelected || isToday ? 700 : 500, color: isSelected ? "#fff" : !isSelectable ? "var(--color-text-muted)" : "var(--color-text-primary)", opacity: !inMonth ? 0.35 : 1 }}>{date.getDate()}</span>
															</button>
														);
													})}
												</div>
											</div>
										</div>
									)}

									{/* Full Name */}
									<div style={{ display: "flex", flexDirection: "column", gap: 8, gridColumn: isMobile ? "1" : "1 / -1" }}>
										<label style={{
											fontFamily: "'DM Sans', sans-serif",
											fontSize: 13,
											fontWeight: 600
										}} className="text-text-secondary">
											Full Name <span style={{ color: "#ef4444" }}>*</span>
										</label>
										<div style={{ position: "relative" }}>
											<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
												<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
												<circle cx="12" cy="7" r="4"/>
											</svg>
											<input
												type="text"
												placeholder="Enter your full name"
												value={fullName}
												onChange={(e) => setFullName(e.target.value)}
												style={{
													width: "100%",
													boxSizing: "border-box",
													background: "rgba(255, 255, 255, 0.05)",
													borderRadius: 10,
													padding: "12px 14px 12px 40px",
													fontFamily: "'DM Sans', sans-serif",
													fontSize: 14,
													outline: "none",
													transition: "all 0.2s ease"
												}} className="border border-border text-text-primary"
											/>
										</div>
									</div>

									{/* Phone Number */}
									<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
										<label style={{
											fontFamily: "'DM Sans', sans-serif",
											fontSize: 13,
											fontWeight: 600
										}} className="text-text-secondary">
											Phone Number <span style={{ color: "#ef4444" }}>*</span>
										</label>
										<div style={{ position: "relative" }}>
											<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
												<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
											</svg>
											<input
												type="tel"
												placeholder="Enter your phone number"
												value={phoneNumber}
												onChange={(e) => setPhoneNumber(e.target.value)}
												style={{
													width: "100%",
													boxSizing: "border-box",
													background: "rgba(255, 255, 255, 0.05)",
													borderRadius: 10,
													padding: "12px 14px 12px 40px",
													fontFamily: "'DM Sans', sans-serif",
													fontSize: 14,
													outline: "none",
													transition: "all 0.2s ease"
												}} className="border border-border text-text-primary"
											/>
										</div>
									</div>

									{/* Email */}
									<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
										<label style={{
											fontFamily: "'DM Sans', sans-serif",
											fontSize: 13,
											fontWeight: 600
										}} className="text-text-secondary">
											Email Address <span style={{ color: "#ef4444" }}>*</span>
										</label>
										<div style={{ position: "relative" }}>
											<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
												<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
												<polyline points="22,6 12,13 2,6"/>
											</svg>
											<input
												type="email"
												placeholder="Enter your email"
												value={email}
												onChange={(e) => setEmail(e.target.value)}
												style={{
													width: "100%",
													boxSizing: "border-box",
													background: "rgba(255, 255, 255, 0.05)",
													borderRadius: 10,
													padding: "12px 14px 12px 40px",
													fontFamily: "'DM Sans', sans-serif",
													fontSize: 14,
													outline: "none",
													transition: "all 0.2s ease"
												}} className="border border-border text-text-primary"
											/>
										</div>
									</div>

									{/* Notes */}
									<div style={{ display: "flex", flexDirection: "column", gap: 8, gridColumn: isMobile ? "1" : "1 / -1" }}>
										<label style={{
											fontFamily: "'DM Sans', sans-serif",
											fontSize: 13,
											fontWeight: 600
										}} className="text-text-secondary">
											Notes <span style={{ fontWeight: 400 }} className="text-text-secondary">(Optional)</span>
										</label>
										<div style={{ position: "relative" }}>
											<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 14, top: 14, pointerEvents: "none" }}>
												<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
												<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
											</svg>
											<textarea
												placeholder="Anything the dealer should know?"
												rows={3}
												value={notes}
												onChange={(e) => setNotes(e.target.value)}
												style={{
													width: "100%",
													boxSizing: "border-box",
													background: "rgba(255, 255, 255, 0.05)",
													borderRadius: 10,
													padding: "12px 14px 12px 40px",
													fontFamily: "'DM Sans', sans-serif",
													fontSize: 14,
													outline: "none",
													transition: "all 0.2s ease",
													resize: "vertical"
												}} className="border border-border text-text-primary"
											/>
										</div>
									</div>
								</div>

								{/* Info Banner */}
								<div style={{
									background: "rgba(37, 99, 235, 0.1)",
									border: "1px solid rgba(37, 99, 235, 0.2)",
									borderRadius: 12,
									padding: "14px 16px",
									display: "flex",
									alignItems: "flex-start",
									gap: 12
								}}>
									<div style={{
										width: 24,
										height: 24,
										borderRadius: "50%",
										background: "rgba(59, 130, 246, 0.2)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										flexShrink: 0,
										marginTop: 1
									}}>
										<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
											<circle cx="12" cy="12" r="10"/>
											<line x1="12" y1="16" x2="12" y2="12"/>
											<line x1="12" y1="8" x2="12.01" y2="8"/>
										</svg>
									</div>
									<p style={{
										fontFamily: "'DM Sans', sans-serif",
										fontSize: 13,
										margin: 0,
										lineHeight: 1.5
									}} className="text-text-secondary">
										The dealership will review your request and confirm your appointment.
									</p>
								</div>

								{/* Error Message */}
								{submitError && (
									<div style={{
										background: "rgba(239, 68, 68, 0.1)",
										border: "1px solid rgba(239, 68, 68, 0.2)",
										borderRadius: 12,
										padding: "12px 16px",
										display: "flex",
										alignItems: "flex-start",
										gap: 12
									}}>
										<div style={{
											width: 24,
											height: 24,
											borderRadius: "50%",
											background: "rgba(239, 68, 68, 0.2)",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											flexShrink: 0,
											marginTop: 1
										}}>
											<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
												<circle cx="12" cy="12" r="10"/>
												<line x1="12" y1="8" x2="12" y2="12"/>
												<line x1="12" y1="16" x2="12.01" y2="16"/>
											</svg>
										</div>
										<p style={{
											fontFamily: "'DM Sans', sans-serif",
											fontSize: 13,
											margin: 0,
											lineHeight: 1.5
										}} className="text-text-secondary">
											{submitError}
										</p>
									</div>
								)}

								{/* Action Buttons */}
								<div style={{ display: "flex", gap: 12, marginTop: 8 }}>
									<button
										onClick={() => setTestDriveModalOpen(false)}
										style={{
											flex: 1,
											background: "rgba(255, 255, 255, 0.05)",
											borderRadius: 12,
											padding: "14px 20px",
											fontFamily: "'DM Sans', sans-serif",
											fontWeight: 700,
											fontSize: 15,
											cursor: "pointer",
											transition: "all 0.2s ease"
										}} className="border border-border text-text-secondary"
										onMouseEnter={(e) => {
											e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
										}}
									>
										Cancel
									</button>
									<button
										onClick={handleTestDriveSubmit}
										disabled={isSubmitting}
										style={{
											flex: 1,
											background: isSubmitting ? "rgba(59, 130, 246, 0.5)" : "linear-gradient(135deg, #3B82F6, #1d4ed8)",
											border: "none",
											borderRadius: 12,
											padding: "14px 20px",
											fontFamily: "'DM Sans', sans-serif",
											fontWeight: 700,
											fontSize: 15,
											color: "#fff",
											cursor: isSubmitting ? "not-allowed" : "pointer",
											transition: "all 0.2s ease",
											boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											gap: 8,
											opacity: isSubmitting ? 0.7 : 1
										}}
										onMouseEnter={(e) => {
											if (!isSubmitting) {
												e.currentTarget.style.transform = "translateY(-2px)";
												e.currentTarget.style.boxShadow = "0 6px 16px rgba(37, 99, 235, 0.4)";
											}
										}}
										onMouseLeave={(e) => {
											if (!isSubmitting) {
												e.currentTarget.style.transform = "translateY(0)";
												e.currentTarget.style.boxShadow = "0 4px 12px rgba(37, 99, 235, 0.3)";
											}
										}}
									>
										{isSubmitting ? (
											<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
												<path d="M21 12a9 9 0 1 1-6.219-8.56"/>
											</svg>
										) : (
											<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
												<path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm14 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM5 17V9l2-5h10l2 5v8"/>
											</svg>
										)}
										{isSubmitting ? "Submitting..." : "Request Test Drive"}
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
				, document.body
			)}

			{/* Success Modal */}
			{submitSuccess && createPortal(
				<div
					style={{
						position: "fixed",
						inset: 0,
						background: "rgba(0,0,0,0.7)",
						backdropFilter: "blur(4px)",
						zIndex: 2000,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						animation: "fadeIn 0.3s ease"
					}}
				>
					<div
						style={{
							background: "#13151c",
							border: "1px solid rgba(34, 197, 94, 0.3)",
							borderRadius: 20,
							padding: "32px 40px",
							textAlign: "center",
							boxShadow: "0 8px 32px rgba(34, 197, 94, 0.2)",
							animation: "slideUp 0.3s ease"
						}}
					>
						<div
							style={{
								width: 64,
								height: 64,
								borderRadius: "50%",
								background: "rgba(34, 197, 94, 0.15)",
								border: "2px solid #22c55e",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								margin: "0 auto 20px"
							}}
						>
							<svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
								<polyline points="20 6 9 17 4 12"/>
							</svg>
						</div>
						<h3
							style={{
								fontFamily: "'Barlow Condensed', sans-serif",
								fontWeight: 700,
								fontSize: 24,
								color: "#fff",
								margin: "0 0 8px"
							}}
						>
							Test Drive Request Submitted!
						</h3>
						<p
							style={{
								fontFamily: "'DM Sans', sans-serif",
								fontSize: 14,
								color: "rgba(255,255,255,0.6)",
								margin: 0
							}}
						>
							The dealership will review your request and confirm your appointment.
						</p>
					</div>
				</div>
				, document.body
			)}
		</div>
	);
}

function DealershipCard({ item, delay = 0, onClick, initialSaved = false }) {
	const [isHovered, setIsHovered] = useState(false);
	const [theme] = useTheme();
	const isLight = theme === "light";
	const { money } = useMoney();
	const postedDate = formatPostedDate(item.created_at);
	const images = item.images || [];
	const displayImage = images.length > 0 ? images[0] : item.vehicle_pic_url;

	return (
		<div
			onClick={onClick}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			style={{
				borderRadius: 18,
				boxShadow: isHovered 
					? "0 20px 40px var(--color-shadow), 0 8px 16px var(--color-shadow)" 
					: isLight 
						? "0 4px 16px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1)"
						: "0 8px 24px var(--color-shadow), 0 2px 8px var(--color-shadow)",
				overflow: "hidden",
				display: "flex",
				flexDirection: "column",
				animation: `fadeUp 0.4s ease ${delay}ms both`,
				cursor: "pointer",
				transition: "transform 0.3s ease, box-shadow 0.3s ease",
				transform: isHovered ? "translateY(-4px)" : "translateY(0)",
				border: isLight ? "2px solid rgba(10,10,14,0.5)" : "1px solid var(--color-border-subtle)",
			}} className="bg-surface"
		>
			<div style={{ position: "relative", height: 200, overflow: "hidden" }}>
				{displayImage ? (
					<div
						style={{
							width: "100%",
							height: "100%",
							backgroundImage: `url(${displayImage})`,
							backgroundSize: "cover",
							backgroundPosition: "center",
							transition: "transform 0.5s ease",
							transform: isHovered ? "scale(1.05)" : "scale(1)",
						}}
					/>
				) : (
					<div
						style={{
							width: "100%",
							height: "100%",
							background: "linear-gradient(135deg, #1e293b, #0f172a)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<AutomotiveIcon s={48} />
					</div>
				)}
				
				{/* Gradient Overlay */}
				<div style={{
					position: "absolute",
					inset: 0,
					background: isLight 
						? "linear-gradient(to bottom, transparent 0%, rgba(10,10,14,0.01) 70%, rgba(10,10,14,0.08) 100%)"
						: "linear-gradient(to bottom, transparent 0%, rgba(19,21,28,0.3) 60%, rgba(19,21,28,0.8) 100%)",
					pointerEvents: "none",
				}} />

				{/* Glassmorphism Category Badge */}
				<div style={{
					position: "absolute",
					top: 12,
					left: 12,
					background: "rgba(255,255,255,0.1)",
					backdropFilter: "blur(10px)",
					border: "1px solid rgba(255,255,255,0.2)",
					borderRadius: 20,
					padding: "6px 14px",
					boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
				}}>
					<span style={{ 
						fontSize: 11, 
						fontWeight: 700, 
						color: "#fff", 
						fontFamily: "'DM Sans', sans-serif", 
						letterSpacing: "0.08em", 
						textTransform: "uppercase",
						textShadow: "0 1px 2px rgba(0,0,0,0.3)",
					}}>
						{item.sub || "Cars"}
					</span>
				</div>

				{/* Favorite Heart Button — shared cross-vertical /saves toggle, hydrated from the
				    list-level lookup in DealershipsSubPage so already-saved cards show filled. */}
				<SaveButton
					entityType="vehicle"
					entityId={item.id}
					initialSaved={initialSaved}
					meta={{
						title: item.name,
						sub: item.sub || [item.make, item.model].filter(Boolean).join(" "),
						price: money(item.price),
						thumb: displayImage || item.gradient,
						accent: "#2563eb",
					}}
					size={40}
					style={{ position: "absolute", top: 12, right: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}
				/>
			</div>

			{/* Content Area */}
			<div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
				{/* Vehicle Title */}
				<h3 style={{
					fontFamily: "'Barlow Condensed', sans-serif",
					fontWeight: 700,
					fontSize: 20,
					margin: 0,
					lineHeight: 1.2,
					letterSpacing: "0.02em",
				}} className="text-text-primary">
					{item.name}
				</h3>

				{/* Secondary Info Row */}
				<div style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					flexWrap: "wrap",
				}}>
					<span style={{
						fontSize: 13,
						fontFamily: "'DM Sans', sans-serif",
						fontWeight: 500,
					}} className="text-text-secondary">
						{item.year}
					</span>
					<span style={{
						width: 4,
						height: 4,
						background: "rgba(255,255,255,0.3)",
						borderRadius: "50%",
					}} />
					<span style={{
						fontSize: 13,
						fontFamily: "'DM Sans', sans-serif",
						fontWeight: 500,
					}} className="text-text-secondary">
						{item.transmission || "—"}
					</span>
					<span style={{
						width: 4,
						height: 4,
						background: "rgba(255,255,255,0.3)",
						borderRadius: "50%",
					}} />
					<span style={{
						fontSize: 13,
						fontFamily: "'DM Sans', sans-serif",
						fontWeight: 500,
					}} className="text-text-secondary">
						{item.fuel || "—"}
					</span>
				</div>

				{/* Mileage Row */}
				<div style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
				}}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
						<path d="M12 6v6l4 2"/>
					</svg>
					<span style={{
						fontSize: 13,
						fontFamily: "'DM Sans', sans-serif",
						fontWeight: 400,
					}} className="text-text-secondary">
						{item.mileage ? `${item.mileage.toLocaleString()} mi` : "—"}
					</span>
				</div>

				{/* Price */}
				<div style={{
					fontFamily: "'Barlow Condensed', sans-serif",
					fontWeight: 800,
					fontSize: 28,
					color: "#2563eb",
					letterSpacing: "0.02em",
				}}>
					{money(item.price)}
				</div>

				{/* Bottom Row: Date and Button */}
				<div style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginTop: "auto",
					paddingTop: 12,
					borderTop: "1px solid var(--color-border-subtle)",
				}}>
					{/* Posted Date */}
					<div style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
					}}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<circle cx="12" cy="12" r="10"/>
							<polyline points="12 6 12 12 16 14"/>
						</svg>
						<span style={{
							fontSize: 12,
							fontFamily: "'DM Sans', sans-serif",
							fontWeight: 400,
						}} className="text-text-muted">
							{postedDate}
						</span>
					</div>

					{/* View Details Button */}
					<button
						onClick={(e) => { e.stopPropagation(); onClick(); }}
						style={{
							background: isHovered ? "#2563eb" : "transparent",
							border: `1px solid ${isHovered ? "#2563eb" : "rgba(37,99,235,0.4)"}`,
							borderRadius: 10,
							padding: "10px 18px",
							fontFamily: "'DM Sans', sans-serif",
							fontWeight: 600,
							fontSize: 13,
							color: isHovered ? "#fff" : "#2563eb",
							cursor: "pointer",
							transition: "all 0.2s ease",
							display: "flex",
							alignItems: "center",
							gap: 6,
						}}
					>
						View Details
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<polyline points="9 18 15 12 9 6"/>
						</svg>
					</button>
				</div>
			</div>
		</div>
	);
}

function MechanicSubPage({ onBack, showBack = true }) {
	const { isMobile } = useViewport();
	const { searchPlaceholder } = usePageI18n("automotive");
	const categories = useI18nCategoryList(AUTO_CATEGORY_DEFS);
	const loading = usePageLoad(150);
	const [activeCategory, setActiveCategory] = useState("all");
	const [query, setQuery] = useState("");
	const [selectedService, setSelectedService] = useState(null);
	const [currentPage, setCurrentPage] = useState(1);
	const [savedServiceIds, setSavedServiceIds] = useState(() => new Set());
	const itemsPerPage = 12;

	// One list-level /saves lookup for every card's bookmark — same hydration pattern as the
	// vehicle listings grid (DealershipsSubPage).
	useEffect(() => {
		if (!isAuthenticated()) return undefined;
		let alive = true;
		getSaves("service").then(res => {
			if (!alive) return;
			const list = Array.isArray(res) ? res : (res?.data ?? []);
			setSavedServiceIds(new Set(list.map(s => String(s.entity_id))));
		}).catch(() => {});
		return () => { alive = false; };
	}, []);
	const [autoServices, setAutoServices] = useState([]);
	const [servicesLoading, setServicesLoading] = useState(true);
	useEffect(() => {
		let alive = true;
		getBookingListings({ vertical: 'mechanic' })
			.then(res => {
				const arr = Array.isArray(res) ? res : (res?.data ?? []);
				if (!alive) return;
				setAutoServices(arr.map(l => {
					const a = l.attributes ?? {};
					return {
						id: l.booking_listing_id,
						listingId: l.booking_listing_id,
						isReal: true,
						name: l.title || 'Mechanic Service',
						category: a.category || 'General',
						subcategory: a.subcategory || '',
						serviceType: a.service_type || 'workshop',
						estimatedTime: a.estimated_time || '',
						requirements: a.requirements || '',
						whatsIncluded: Array.isArray(a.whats_included) ? a.whats_included : [],
						description: l.description || '',
						location: l.location || '',
						price: Number(l.price) || 0,
						unit: 'visit',
						rating: a.rating ?? 0,
						reviews: a.reviews ?? 0,
						gradient: "#ffffff",
						cardLight: true,
						tags: Array.isArray(a.tags) ? a.tags : [],
						ownerId: l.owner_id || null,
						createdAt: l.created_at || null,
						images: Array.isArray(l.images) ? l.images : (l.images ? JSON.parse(l.images) : []),
					};
				}));
			})
			.catch(() => { if (alive) setAutoServices([]); })
			.finally(() => { if (alive) setServicesLoading(false); });
		return () => { alive = false; };
	}, []);

	useEffect(() => {
		setCurrentPage(1);
	}, [activeCategory, query]);

	if (selectedService) return <MechanicServiceDetailPage service={selectedService} onBack={() => setSelectedService(null)} />;

	const filtered = autoServices.filter(s => {
		const matchCat = matchesCategory(activeCategory, s.category, categories);
		const matchQ = !query || s.name.toLowerCase().includes(query.toLowerCase()) || s.category.toLowerCase().includes(query.toLowerCase());
		return matchCat && matchQ;
	});
	const totalPages = Math.ceil(filtered.length / itemsPerPage);
	const startIndex = (currentPage - 1) * itemsPerPage;
	const paginatedFiltered = filtered.slice(startIndex, startIndex + itemsPerPage);

	if (loading || servicesLoading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1320, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px" }}>
					<SkeletonHeading />
					<div style={{ display: "flex", gap: 20, margin: "16px 0 28px" }}>
						{[...Array(6)].map((_,i) => <SkeletonCircle key={i} />)}
					</div>
				</div>
				<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16 }}>
					{[...Array(8)].map((_,i) => <SkeletonServiceCard key={i} />)}
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1320, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					{showBack && (
						<button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer", marginBottom: 14, padding: 0 }} className="text-text-secondary">
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
							Automotive
						</button>
					)}
					<h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase" , marginBottom: 20, textAlign: "center"}} className="text-text-primary">{i18n.t("automotive.mechanic")}</h1>
					<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
						<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
							<div style={{ flexShrink: 0, display: "flex", alignItems: "center" }} className="text-text-secondary"><SearchIcon s={20} /></div>
							<input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder} style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#d97706" }} className="text-text-primary" />
						</div>
					</div>
				</div>
				<div style={{ position: "relative", marginBottom: 24 }}>
					<div style={{ display: "flex", gap: 12, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4, animation: "fadeUp 0.35s ease 60ms both", scrollbarWidth: "none", justifyContent: isMobile ? "flex-start" : "center" }}>
						{categories.map((cat, i) => (
							<LeoButton key={cat.id} cat={cat} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 30} wrapLabel />
						))}
					</div>
					{isMobile && (
						<div style={{ position: "absolute", right: 0, top: 0, bottom: 4, width: 48, background: "linear-gradient(to left, var(--color-bg) 20%, transparent 100%)", pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
							<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
						</div>
					)}
				</div>
				{filtered.length > 0 && (
					<div style={{ marginBottom: 32, animation: "fadeUp 0.4s ease 180ms both" }}>
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16 }}>
							{paginatedFiltered.map((s, i) => <AutoServiceCard key={s.id} service={s} delay={i * 40} onBook={setSelectedService} initialSaved={savedServiceIds.has(String(s.id))} />)}
						</div>
						{totalPages > 1 && (
							<div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 24 }}>
								<button
									onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
									disabled={currentPage === 1}
									style={{
										padding: "8px 16px",
										background: currentPage === 1 ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)",
										borderRadius: 8,
										fontFamily: "'DM Sans', sans-serif",
										fontSize: 14,
										cursor: currentPage === 1 ? "default" : "pointer",
										transition: "all 0.2s ease",
									}} className={`border border-border ${currentPage === 1 ? "text-text-muted" : "text-text-primary"}`}
								>
									Previous
								</button>
								{Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
									<button
										key={page}
										onClick={() => setCurrentPage(page)}
										style={{
											padding: "8px 12px",
											background: currentPage === page ? "#d97706" : "rgba(255,255,255,0.05)",
											border: currentPage === page ? "none" : "1px solid var(--color-border)",
											borderRadius: 8,
											color: currentPage === page ? "#fff" : "var(--color-text-primary)",
											fontFamily: "'DM Sans', sans-serif",
											fontSize: 14,
											fontWeight: currentPage === page ? 600 : 400,
											cursor: "pointer",
											transition: "all 0.2s ease",
											minWidth: 36,
										}}
									>
										{page}
									</button>
								))}
								<button
									onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
									disabled={currentPage === totalPages}
									style={{
										padding: "8px 16px",
										background: currentPage === totalPages ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)",
										borderRadius: 8,
										fontFamily: "'DM Sans', sans-serif",
										fontSize: 14,
										cursor: currentPage === totalPages ? "default" : "pointer",
										transition: "all 0.2s ease",
									}} className={`border border-border ${currentPage === totalPages ? "text-text-muted" : "text-text-primary"}`}
								>
									Next
								</button>
							</div>
						)}
					</div>
				)}
				{filtered.length === 0 && (
					<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: 0.4, paddingBottom: 24 }}>
						<AutomotiveIcon s={40} />
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }} className="text-text-primary">{i18n.t("common.noServicesFound")}</p>
					</div>
				)}
			</div>
		</div>
	);
}

function DealershipsSubPage({ onBack }) {
	const { isMobile } = useViewport();
	const categories = DEALERSHIP_CATEGORY_DEFS;
	const loading = usePageLoad(150);
	const [activeCategory, setActiveCategory] = useState("all");
	const [query, setQuery] = useState("");
	const [selectedItem, setSelectedItem] = useState(null);
	const [dealershipListings, setDealershipListings] = useState([]);
	const [currentPage, setCurrentPage] = useState(1);
	const [savedVehicleIds, setSavedVehicleIds] = useState(() => new Set());
	const itemsPerPage = 12;

	// One list-level /saves lookup for every card's heart, instead of each card fetching its own —
	// see the same hydration on the detail page (DealershipDetailPage) for why this is needed.
	useEffect(() => {
		if (!isAuthenticated()) return undefined;
		let alive = true;
		getSaves("vehicle").then(res => {
			if (!alive) return;
			const list = Array.isArray(res) ? res : (res?.data ?? []);
			setSavedVehicleIds(new Set(list.map(s => String(s.entity_id))));
		}).catch(() => {});
		return () => { alive = false; };
	}, []);

	useEffect(() => {
		getAllAutomotiveVehicles().then(r => {
			setDealershipListings(Array.isArray(r) ? r.map(v => ({
				id: v.vehicle_id,
				name: `${v.make || ''} ${v.model || ''}`.trim() || 'Vehicle',
				sub: v.vehicle_type || '',
				category: v.vehicle_type || 'Cars',
				price: Number(v.price) || 0,
				featured: false,
				gradient: "linear-gradient(135deg,#0c1a2e,#2563eb)",
				year: v.year || '',
				mileage: v.mileage || '',
				tags: [],
				make: v.make || '',
				model: v.model || '',
				fuel: v.fuel || '',
				transmission: v.transmission || '',
				engine: v.engine || '',
				color: v.color || '',
				condition: v.condition || '',
				images: v.images ? JSON.parse(v.images) : [],
				video_url: v.video_url || null,
				vehicle_pic_url: v.vehicle_pic_url || null,
				user_id: v.user_id || null,
				created_at: v.created_at || null,
				description: v.description || null,
				is_negotiable: v.is_negotiable || false,
			})) : []);
		}).catch(() => {});
	}, []);

	useEffect(() => {
		setCurrentPage(1);
	}, [activeCategory, query]);

	if (selectedItem) return <DealershipDetailPage item={selectedItem} onBack={(newItem) => setSelectedItem(newItem || null)} />;
	const filtered = dealershipListings.filter(item => {
		const matchCat = activeCategory === "all" || item.sub === activeCategory;
		const matchQ = !query || item.name.toLowerCase().includes(query.toLowerCase()) || item.sub.toLowerCase().includes(query.toLowerCase());
		return matchCat && matchQ;
	});
	const featured = filtered.filter(i => i.featured);
	const rest = filtered.filter(i => !i.featured);

	const totalPages = Math.ceil(rest.length / itemsPerPage);
	const startIndex = (currentPage - 1) * itemsPerPage;
	const paginatedRest = rest.slice(startIndex, startIndex + itemsPerPage);

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px" }}>
					<SkeletonHeading />
					<div style={{ display: "flex", gap: 20, margin: "16px 0 28px" }}>
						{[...Array(6)].map((_,i) => <SkeletonCircle key={i} />)}
					</div>
				</div>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
					{[...Array(6)].map((_,i) => <SkeletonVehicleCard key={i} />)}
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					<button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer", marginBottom: 14, padding: 0 }} className="text-text-secondary">
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
						Automotive
					</button>
					<h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 20, textAlign: "center" }} className="text-text-primary">{i18n.t("automotive.dealerships")}</h1>
					<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
						<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
							<div style={{ flexShrink: 0, display: "flex", alignItems: "center" }} className="text-text-secondary"><SearchIcon s={20} /></div>
							<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search makes, models..." style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} className="text-text-primary" />
						</div>
					</div>
				</div>
				<div style={{ position: "relative", marginBottom: 24 }}>
					<div style={{ display: "flex", gap: 12, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 16, animation: "fadeUp 0.35s ease 60ms both", scrollbarWidth: "none", justifyContent: isMobile ? "flex-start" : "center", minHeight: 90 }}>
						{categories.map((cat, i) => (
							<div
								key={cat.id}
								onClick={() => setActiveCategory(cat.id)}
								style={{
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									gap: 8,
									cursor: "pointer",
									flexShrink: 0,
									paddingTop: 4,
								}}
							>
								<div
									style={{
										width: 60,
										height: 60,
										borderRadius: 10,
										overflow: "hidden",
										border: `2px solid ${activeCategory === cat.id ? cat.color : "var(--color-border)"}`,
										transition: "all 0.2s ease",
									}}
									onMouseEnter={(e) => {
										if (activeCategory !== cat.id) {
											e.target.style.borderColor = "var(--color-border)";
											e.target.style.transform = "scale(1.05)";
										}
									}}
									onMouseLeave={(e) => {
										if (activeCategory !== cat.id) {
											e.target.style.borderColor = "var(--color-border)";
											e.target.style.transform = "scale(1)";
										}
									}}
								>
									<img
										src={cat.img || cat.image}
										alt={cat.label}
										style={{
											width: "100%",
											height: "100%",
											objectFit: "cover",
										}}
									/>
								</div>
								<span style={{
									fontSize: 13,
									fontWeight: 600,
									color: activeCategory === cat.id ? cat.color : "var(--color-text-primary)",
									fontFamily: "'DM Sans', sans-serif",
									lineHeight: 1.4,
									maxWidth: 80,
									textAlign: "center",
									wordWrap: "break-word",
								}}>
									{cat.label}
								</span>
							</div>
						))}
					</div>
					{isMobile && (
						<div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 48, background: "linear-gradient(to left, var(--color-bg) 20%, transparent 100%)", pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
							<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
						</div>
					)}
				</div>
				{featured.length > 0 && (
					<div style={{ marginBottom: 32, animation: "fadeUp 0.4s ease 120ms both" }}>
						<p style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }} className="text-text-secondary">{i18n.t("common.featured")}</p>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
							{featured.map((item, i) => <DealershipCard key={item.id} item={item} delay={i * 50} onClick={() => setSelectedItem(item)} initialSaved={savedVehicleIds.has(String(item.id))} />)}
						</div>
					</div>
				)}
				{rest.length > 0 && (
					<div style={{ marginBottom: 32, animation: "fadeUp 0.4s ease 180ms both" }}>
						<p style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }} className="text-text-secondary">{i18n.t("common.allListings")}</p>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
							{paginatedRest.map((item, i) => <DealershipCard key={item.id} item={item} delay={i * 40} onClick={() => setSelectedItem(item)} initialSaved={savedVehicleIds.has(String(item.id))} />)}
						</div>
						{totalPages > 1 && (
							<div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 24 }}>
								<button
									onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
									disabled={currentPage === 1}
									style={{
										padding: "8px 16px",
										background: currentPage === 1 ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)",
										borderRadius: 8,
										fontFamily: "'DM Sans', sans-serif",
										fontSize: 14,
										cursor: currentPage === 1 ? "default" : "pointer",
										transition: "all 0.2s ease",
									}} className={`border border-border ${currentPage === 1 ? "text-text-muted" : "text-text-primary"}`}
								>
									Previous
								</button>
								{Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
									<button
										key={page}
										onClick={() => setCurrentPage(page)}
										style={{
											padding: "8px 12px",
											background: currentPage === page ? "#2563eb" : "rgba(255,255,255,0.05)",
											border: currentPage === page ? "none" : "1px solid var(--color-border)",
											borderRadius: 8,
											color: currentPage === page ? "#fff" : "var(--color-text-primary)",
											fontFamily: "'DM Sans', sans-serif",
											fontSize: 14,
											fontWeight: currentPage === page ? 600 : 400,
											cursor: "pointer",
											transition: "all 0.2s ease",
											minWidth: 36,
										}}
									>
										{page}
									</button>
								))}
								<button
									onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
									disabled={currentPage === totalPages}
									style={{
										padding: "8px 16px",
										background: currentPage === totalPages ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)",
										borderRadius: 8,
										fontFamily: "'DM Sans', sans-serif",
										fontSize: 14,
										cursor: currentPage === totalPages ? "default" : "pointer",
										transition: "all 0.2s ease",
									}} className={`border border-border ${currentPage === totalPages ? "text-text-muted" : "text-text-primary"}`}
								>
									Next
								</button>
							</div>
						)}
					</div>
				)}
				{filtered.length === 0 && (
					<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: 0.4, paddingBottom: 24 }}>
						<AutomotiveIcon s={40} />
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }} className="text-text-primary">{i18n.t("common.noListingsFound")}</p>
					</div>
				)}
			</div>
		</div>
	);
}

const AUTO_TILES = [
  {
    id: "setprice",
    label: "Set Your Price",
    desc: "Set your price — the nearest mechanic is matched to you.",
    accent: "#10b981",
    image: "https://images.unsplash.com/photo-1734535677978-b97074e264f0?w=800&fit=crop&q=80",
    icon: (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
        <line x1="7" y1="7" x2="7.01" y2="7"/>
      </svg>
    )
  },
  {
    id: "mechanic",
    label: "Mechanic",
    desc: "Book trusted mechanics for repairs & maintenance.",
    accent: "#f59e0b",
    image: "https://images.unsplash.com/photo-1703632940893-5e8d668dd7a8?w=800&fit=crop&q=80",
    icon: (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
    )
  },
  {
    id: "dealerships",
    label: "Dealerships",
    desc: "Browse cars for sale, leases, and dealer services.",
    accent: "#3b82f6",
    image: "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&fit=crop&q=80",
    icon: (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
        <circle cx="7" cy="17" r="2"/>
        <path d="M9 17h6"/>
        <circle cx="17" cy="17" r="2"/>
      </svg>
    )
  },
  {
    id: "roadside",
    label: "Roadside",
    desc: "Emergency towing, tire changes, jump starts & more.",
    accent: "#ef4444",
    image: "https://images.unsplash.com/photo-1771768360466-87ad7e00acb6?w=800&fit=crop&q=80",
    icon: (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13"/>
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
        <circle cx="5.5" cy="18.5" r="2.5"/>
        <circle cx="18.5" cy="18.5" r="2.5"/>
      </svg>
    )
  }
];


function AutoSetPriceRedirect({ onBack }) {
	useEffect(() => {
		window.__ondemandPresetMacro = "automotive-roadside";
		onBack();
		if (window.__nav) window.__nav("ondemand");
	}, []); // eslint-disable-line react-hooks/exhaustive-deps
	return null;
}

function RoadsideRedirect({ onBack }) {
	useEffect(() => {
		window.__ondemandPresetMacro = "automotive-roadside";
		onBack();
		if (window.__nav) window.__nav("ondemand");
	}, []); // eslint-disable-line react-hooks/exhaustive-deps
	return null;
}


function AutomotivePage({ subSection, setSubSection }) {
  const { isMobile } = useViewport();
  const loading = usePageLoad();
  const [theme] = useTheme();
  const isLight = theme === "light";

  if (subSection === "mechanic") return <MechanicSubPage onBack={() => setSubSection(null)} />;
  if (subSection === "dealerships") return <DealershipsSubPage onBack={() => setSubSection(null)} />;
  if (subSection === "setprice") return <AutoSetPriceRedirect onBack={() => setSubSection(null)} />;
  if (subSection === "roadside") return <RoadsideRedirect onBack={() => setSubSection(null)} />;
  if (subSection === "all") return <MechanicSubPage onBack={() => setSubSection(null)} />;

  if (loading) {
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
        <div style={{ maxWidth: 860, margin: "0 auto", width: "100%" }}>
          <div style={{ padding: "28px 0 28px" }}>
            <SkeletonHeading />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginTop: 28, marginBottom: 16 }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{ borderRadius: 16, overflow: "hidden", background: "rgba(255,255,255,0.05)" }} className="border border-border-subtle">
                  <Skel h={110} r={0} />
                  <div style={{ padding: "18px 22px 22px" }}>
                    <Skel w="55%" h={20} r={6} style={{ marginBottom: 10 }} />
                    <Skel w="85%" h={12} r={5} style={{ marginBottom: 4 }} />
                    <Skel w="70%" h={12} r={5} style={{ marginBottom: 20 }} />
                    <Skel w={60} h={12} r={5} />
                  </div>
                </div>
              ))}
            </div>
            <Skel h={60} r={14} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      overflowY: "auto",
      paddingLeft: isMobile ? 16 : 48,
      paddingRight: isMobile ? 16 : 48
    }} className="bg-bg">
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        maxWidth: 1200,
        margin: "0 auto",
        width: "100%",
        padding: isMobile ? "24px 0" : "36px 0"
      }}>
        
        {/* Hero Section */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "38% 62%",
		  gap: isMobile ? 20 : -20,
          alignItems: "center",
          marginBottom: isMobile ? 24 : 32,
          position: "relative",
          paddingBottom: isMobile ? 0 : 20,
          borderBottom: isLight ? "1px solid rgba(10,10,14,0.1)" : "none",
        }}>
          {/* Hero Left Content */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            zIndex: 1,
            paddingRight: 0
          }}>
            {/* Category Eyebrow */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase"
              }} className="text-text-secondary">
                Automotive
              </span>
            </div>

            {/* Title */}
            <h1 style={{
              fontWeight: 800,
              fontSize: isMobile ? "32px" : "44px",
              lineHeight: 1.1,
              margin: 0,
              letterSpacing: "-0.02em"
            }} className="text-text-primary">
              Your Complete<br />
              <span style={{
                background: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent"
              }}>
                Automotive Hub
              </span>
            </h1>

            {/* Subtitle */}
            <p style={{
              fontSize: 14,
              margin: "12px 0 20px 0",
              lineHeight: 1.5,
              maxWidth: 360
            }} className="text-text-secondary">
              Find services, experts, and solutions for every need on the road.
            </p>

          </div>

          {/* Hero Right Image */}
          <div style={{
            position: "relative",
			height: isMobile ? 220 : 320,
			zIndex: 1,
			display: "flex",
			alignItems: "center",
			marginLeft: isMobile ? 0 : -90,
          }}>
            <img
              src="https://images.unsplash.com/photo-1674514377288-96cbff0551fb?w=1000&fit=crop&q=80"
              alt="Car Hero"
              style={{
                width: "130%",
				height: "100%",
				objectFit: "cover",
				borderRadius: 18,
				border: isLight ? "1px solid rgba(10,10,14,0.4)" : "1px solid var(--color-border-subtle)",
				boxSizing: "border-box",
				maskImage:
				"linear-gradient(to right, transparent 0%, rgba(0,0,0,0.1) 5%, rgba(0,0,0,0.25) 10%, rgba(0,0,0,0.45) 16%, rgba(0,0,0,0.65) 22%, rgba(0,0,0,0.85) 28%, black 35%, black 100%)",
				WebkitMaskImage:
				"linear-gradient(to right, transparent 0%, rgba(0,0,0,0.1) 5%, rgba(0,0,0,0.25) 10%, rgba(0,0,0,0.45) 16%, rgba(0,0,0,0.65) 22%, rgba(0,0,0,0.85) 28%, black 35%, black 100%)",
              }}
            />
          </div>
        </div>

        {/* 2x2 Service Cards Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
          gap: 16,
          marginBottom: 16
        }}>
          {AUTO_TILES.map((tile) => (
            <button
              key={tile.id}
              onClick={() => setSubSection(tile.id)}
              style={{
                borderRadius: 14,
                padding: "20px",
                cursor: "pointer",
                textAlign: "left",
                position: "relative",
                overflow: "hidden",
                minHeight: 160,
                border: isLight ? "1px solid rgba(10,10,14,0.35)" : "1px solid var(--color-border-subtle)",
                borderLeft: `3px solid ${tile.accent}`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                transition: "all 0.2s ease",
                boxShadow: isLight ? "0 4px 12px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)" : "none"
              }} className="bg-surface"
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = tile.accent;
                e.currentTarget.style.boxShadow = `0 8px 24px -6px ${tile.accent}${isLight ? "25" : "30"}`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.border = isLight ? "1px solid rgba(10,10,14,0.35)" : "1px solid var(--color-border-subtle)";
                e.currentTarget.style.borderLeft = `3px solid ${tile.accent}`;
                e.currentTarget.style.boxShadow = isLight ? "0 4px 12px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)" : "none";
              }}
            >
              <img
                src={tile.image}
                alt=""
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: isLight ? "70%" : "70%",
                  height: "100%",
                  objectFit: "cover",
                  maskImage: `linear-gradient(to left, black ${isLight ? 40 : 15}%, rgba(0,0,0,0.8) ${isLight ? 50 : 25}%, rgba(0,0,0,0.4) ${isLight ? 60 : 35}%, rgba(0,0,0,0.15) ${isLight ? 70 : 45}%, transparent 100%)`,
                  WebkitMaskImage: `linear-gradient(to left, black ${isLight ? 40 : 15}%, rgba(0,0,0,0.8) ${isLight ? 50 : 25}%, rgba(0,0,0,0.4) ${isLight ? 60 : 35}%, rgba(0,0,0,0.15) ${isLight ? 70 : 45}%, transparent 100%)`,
                  opacity: isLight ? 0.85 : 0.35,
                  pointerEvents: "none"
                }}
              />

              {/* Card Header & Content */}
              <div style={{ position: "relative", zIndex: 1, display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: `${tile.accent}15`,
                  border: `1px solid ${tile.accent}30`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}>
                  {tile.icon}
                </div>

                <div style={{ maxWidth: 240 }}>
                  <h3 style={{
                    fontSize: 18,
                    fontWeight: 700,
                    margin: "0 0 6px 0",
                    lineHeight: 1.2
                  }} className="text-text-primary">
                    {tile.label}
                  </h3>
                  <p style={{
                    fontSize: 12.5,
                    margin: 0,
                    lineHeight: 1.4
                  }} className="text-text-secondary">
                    {tile.desc}
                  </p>
                </div>
              </div>

              {/* Card Footer Link */}
              <div style={{
                position: "relative",
                zIndex: 1,
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: tile.accent,
                fontSize: 13,
                fontWeight: 600,
                marginTop: 16
              }}>
                <span>Explore</span>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}

export { AutomotivePage };
