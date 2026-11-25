import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePageI18n } from "../hooks/usePageI18n.js";
import i18n from "../i18n/index.js";
import { getBookingListings, createBooking, getBookings, cancelBooking, getReservationSlots } from '../api/booking';
import { isAuthenticated, getAuthUserId } from '../store/auth';
import {
	formatVendorHours,
	loadReservationMenu,
	resolveMyRestaurantVendorId,
	vendorPriceLevel,
} from '../utils/reservationMenuLink.js';
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { Skel } from "../components/skeletons.jsx";
import { LeoButton, HostListingCTA } from "../components/shared.jsx";
import {
	ReservationsIcon,
	FoodIcon,
	PinBoardIcon,
	WalletEarningsIcon,
	OnDemandIcon,
	EventsIcon,
	SocialIcon,
	OrdersIcon,
	HelpCenterIcon,
	LiveIcon,
} from "../components/icons.jsx";
import { mediaUrls } from "../utils/mediaUrl";

function rt(key, opts) {
	return i18n.t(`reservations.${key}`, opts);
}

function guestCountLabel(count) {
	return rt("guestCount", { count: Number(count) || 0 });
}

function translateReservationStatus(status) {
	const key = {
		pending: "statusPending",
		confirmed: "statusConfirmed",
		cancelled: "statusCancelled",
		canceled: "statusCancelled",
		declined: "statusDeclined",
		completed: "statusCompleted",
		in_progress: "statusInProgress",
		no_show: "statusNoShow",
		requested: "statusRequested",
		awaiting_host: "statusAwaitingHost",
	}[String(status || "").toLowerCase()];
	return key ? rt(key) : status;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CUISINE_COLORS = ["#7c3aed","#dc2626","#059669","#d97706","#f59e0b","#0891b2","#2563eb","#e11d48","#0d9488"];

/** Category chips: color tiles only (no stock Unsplash). Prefer a real listing image when available. */
function resolveReservationCategoryImage(label, restaurants = []) {
	const key = String(label ?? "").trim().toLowerCase();
	if (!key || key === "all" || key === i18n.t("common.all").toLowerCase()) return undefined;
	const match = restaurants.find(r => String(r.cuisine || "").toLowerCase() === key);
	if (match?.image && String(match.image).startsWith("http")) return match.image;
	return undefined;
}

function buildReservationCuisines(restaurants) {
	const uniqueCuisines = [...new Set(restaurants.map(r => r.cuisine).filter(Boolean))];
	return [
		{ label: i18n.t("common.all"), color: "#2563eb" },
		...uniqueCuisines.map((c, i) => {
			const img = resolveReservationCategoryImage(c, restaurants);
			return {
				label: c,
				color: CUISINE_COLORS[i % CUISINE_COLORS.length],
				...(img ? { img } : {}),
			};
		}),
	];
}

const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8, "9+"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function to24h(slot) {
	if (!slot) return undefined;
	const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(slot.trim());
	if (!m) return slot;
	let h = parseInt(m[1], 10);
	const min = m[2];
	const ap = m[3]?.toUpperCase();
	if (ap === "PM" && h !== 12) h += 12;
	if (ap === "AM" && h === 12) h = 0;
	return `${String(h).padStart(2, "0")}:${min}`;
}

/** Confirmation reference from the server booking id only — never invent one. */
function bookingRefFromServer(booking) {
	const id = booking?.booking_id ?? booking?.data?.booking_id ?? booking?.id;
	if (id == null || id === "") return null;
	return `#STR-${String(id).toUpperCase()}`;
}

function toDateParam(d) {
	if (!d) return undefined;
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function fmtShortDate(d) {
	return d.toLocaleDateString(i18n.language || undefined, { weekday: "short", month: "short", day: "numeric" });
}

function fmtDayNum(d) {
	return d.getDate();
}

function fmtDayName(d) {
	return d.toLocaleDateString(i18n.language || undefined, { weekday: "short" });
}

function fmtMonthShort(d) {
	return d.toLocaleDateString(i18n.language || undefined, { month: "short" });
}

/**
 * Card chips from listing `attributes.time_slots` (configured schedule only).
 * Not live availability — detail page confirms via reservation-slots API.
 */
function resolveQuickBookTimes(slots) {
	if (!Array.isArray(slots) || slots.length === 0) return [];
	return slots
		.filter((s) => {
			if (typeof s === "string") return s.trim().length > 0;
			if (s && typeof s === "object") return Boolean(s.label || s.time);
			return false;
		})
		.map((s) => (typeof s === "string" ? s : (s.label || s.time)))
		.filter(Boolean)
		.slice(0, 3);
}

function addToCalendarUrl(name, date, time, location) {
	const base = new Date(date);
	const [h, m] = to24h(time)?.split(":") ?? ["19", "00"];
	base.setHours(parseInt(h), parseInt(m), 0, 0);
	const end = new Date(base);
	end.setMinutes(end.getMinutes() + 90);
	const fmt = d => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
	return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(rt("calendarTitle", { name }))}&dates=${fmt(base)}/${fmt(end)}&location=${encodeURIComponent(location || "")}`;
}

// ─── Menu Section ─────────────────────────────────────────────────────────────
function ResMenuSection({ section }) {
	return (
		<div style={{ marginBottom: 20 }}>
			<p className="text-text-muted" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>{section.section}</p>
			{section.items.map((item, i) => (
				<div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
					<div className="bg-text-muted" style={{ width: 4, height: 4, borderRadius: "50%", flexShrink: 0 }} />
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{item}</p>
				</div>
			))}
		</div>
	);
}

// ─── Date Strip ───────────────────────────────────────────────────────────────
function DateStrip({ dates, selected, onSelect }) {
	const scrollRef = useRef(null);
	useEffect(() => {
		const idx = dates.findIndex(d => d.toDateString() === selected?.toDateString());
		if (idx >= 0 && scrollRef.current) {
			const item = scrollRef.current.children[idx];
			if (item) item.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
		}
	}, [selected, dates]);

	return (
		<div ref={scrollRef} style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
			{dates.map((d, i) => {
				const isSelected = d.toDateString() === selected?.toDateString();
				const isToday = i === 0;
				return (
					<button key={i} onClick={() => onSelect(d)} style={{
						flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
						width: 56, minHeight: 64, borderRadius: 12, cursor: "pointer", transition: "all 0.18s",
						/* Idle tile uses the translucent border tokens as fill — in light mode
						   --color-surface/-raised are both flat white, so a tinted overlay is what
						   keeps the tile visibly distinct as a tap target (see Hub.jsx pattern notes). */
						border: `1.5px solid ${isSelected ? "#2563eb" : "var(--color-border)"}`,
						background: isSelected ? "linear-gradient(145deg,#2563eb,#1d4ed8)" : "var(--color-border-subtle)",
						boxShadow: isSelected ? "0 4px 18px rgba(37,99,235,0.4)" : "none",
						padding: "8px 0",
					}}
						onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = "var(--color-text-muted)"; }}
						onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = "var(--color-border)"; }}
					>
						<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, color: isSelected ? "rgba(255,255,255,0.8)" : "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>
							{isToday ? rt("today") : fmtDayName(d)}
						</span>
						<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 800, color: isSelected ? "#fff" : "var(--color-text-primary)", lineHeight: 1 }}>
							{fmtDayNum(d)}
						</span>
						<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: isSelected ? "rgba(255,255,255,0.7)" : "var(--color-text-muted)", marginTop: 2 }}>
							{fmtMonthShort(d)}
						</span>
					</button>
				);
			})}
		</div>
	);
}

// ─── Time Slot Grid ───────────────────────────────────────────────────────────
// Only renders times returned by the API. Never invents a default Lunch/Dinner grid
// (that previously let guests "book" after a slots fetch failure).
function TimeSlotGrid({ selected, onSelect, bookedSlots = [], slotRows = null, loading = false, failed = false }) {
	const rows = Array.isArray(slotRows) ? slotRows : [];
	const lunch = rows.filter((s) => {
		const t = s.time || to24h(s.label);
		const [h] = (t || "0").split(":").map(Number);
		return h < 16;
	});
	const dinner = rows.filter((s) => {
		const t = s.time || to24h(s.label);
		const [h] = (t || "0").split(":").map(Number);
		return h >= 16;
	});

	const Section = ({ label, slots }) => (
		<div style={{ marginBottom: 20 }}>
			<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>{label}</p>
			{loading && slots.length === 0 ? (
				<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
					{[...Array(6)].map((_, i) => <Skel key={i} w={72} h={36} r={10} />)}
				</div>
			) : slots.length === 0 ? (
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{rt("noTimesInPeriod")}</p>
			) : (
				<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
					{slots.map((s) => {
						const labelText = s.label || s.time;
						const isBooked = s.available === false || bookedSlots.includes(labelText);
						const isSelected = selected === labelText || selected === s.time;
						return (
							<button key={labelText} onClick={() => !isBooked && onSelect(labelText)} disabled={isBooked} title={s.reason || undefined} style={{
								padding: "8px 14px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
								cursor: isBooked ? "not-allowed" : "pointer", transition: "all 0.15s",
								/* Booked/disabled slots keep a near-invisible literal fill (deliberately flat —
								   struck-through text + not-allowed cursor already convey "unavailable").
								   Selectable idle slots use border tokens so they read as tap targets in both themes. */
								border: `1.5px solid ${isSelected ? "#2563eb" : isBooked ? "rgba(255,255,255,0.05)" : "var(--color-border)"}`,
								background: isSelected ? "linear-gradient(145deg,#2563eb,#1d4ed8)" : isBooked ? "rgba(255,255,255,0.02)" : "var(--color-border-subtle)",
								color: isSelected ? "#fff" : isBooked ? "var(--color-text-muted)" : "var(--color-text-primary)",
								boxShadow: isSelected ? "0 4px 14px rgba(37,99,235,0.35)" : "none",
								textDecoration: isBooked ? "line-through" : "none",
							}}>
								{labelText}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);

	// Parent already shows slotsError; render no selectable times on failure.
	if (failed && !loading) return null;

	if (loading && rows.length === 0) {
		return (
			<div style={{ marginBottom: 20 }}>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
					{[...Array(8)].map((_, i) => <Skel key={i} w={72} h={36} r={10} />)}
				</div>
			</div>
		);
	}

	return (
		<>
			<Section label={rt("lunch")} slots={lunch} />
			<Section label={rt("dinner")} slots={dinner} />
		</>
	);
}

// ─── Party Size Picker ────────────────────────────────────────────────────────
function PartySizePicker({ value, onChange }) {
	return (
		<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
			{PARTY_SIZES.map(n => {
				const isActive = value === n;
				return (
					<button key={n} onClick={() => onChange(n === "9+" ? 9 : n)} style={{
						width: 44, height: 44, borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14,
						cursor: "pointer", transition: "all 0.15s",
						border: `1.5px solid ${isActive ? "#2563eb" : "var(--color-border)"}`,
						background: isActive ? "linear-gradient(145deg,#2563eb,#1d4ed8)" : "var(--color-border-subtle)",
						color: isActive ? "#fff" : "var(--color-text-secondary)",
						boxShadow: isActive ? "0 4px 14px rgba(37,99,235,0.35)" : "none",
					}}
						onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--color-border)"; }}
						onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "var(--color-border-subtle)"; }}
					>{n}</button>
				);
			})}
		</div>
	);
}

// ─── Restaurant Detail Page ───────────────────────────────────────────────────
function ResRestaurantPage({ restaurant, onBack, onConfirm }) {
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const today = new Date();
	const dates = Array.from({ length: 30 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() + i); return d; });
	const [selDate, setSelDate] = useState(dates[0]);
	const [selTime, setSelTime] = useState(restaurant?._quickTime ?? null);
	const [party, setParty] = useState(2);
	const [activeTab, setActiveTab] = useState("book");
	const [confirming, setConfirming] = useState(false);
	const [bookError, setBookError] = useState(null);
	const [specialNotes, setSpecialNotes] = useState("");
	const [imgError, setImgError] = useState(false);
	const [slotRows, setSlotRows] = useState(null);
	const [slotsLoading, setSlotsLoading] = useState(false);
	const [slotsError, setSlotsError] = useState(null);
	const [slotsRefreshKey, setSlotsRefreshKey] = useState(0);
	const [liveMenu, setLiveMenu] = useState(() => (Array.isArray(restaurant?.menu) && restaurant.menu.length ? restaurant.menu : null));
	const [menuLoading, setMenuLoading] = useState(() => !(Array.isArray(restaurant?.menu) && restaurant.menu.length > 0));
	const [vendorInfo, setVendorInfo] = useState(null);
	const heroImg = !imgError && restaurant.images?.[0] ? restaurant.images[0] : null;

	const bookedSlots = useMemo(
		() => (slotRows || []).filter((s) => s.available === false).map((s) => s.label || s.time),
		[slotRows],
	);

	const infoRows = useMemo(() => {
		const hours = restaurant.hours || formatVendorHours(vendorInfo);
		const priceLevel = restaurant.priceLevel || vendorPriceLevel(vendorInfo) || null;
		const cuisine = restaurant.cuisine || vendorInfo?.cuisine_type || null;
		const location = restaurant.location
			|| vendorInfo?.address
			|| vendorInfo?.location
			|| null;
		const phone = restaurant.phone
			|| vendorInfo?.phone
			|| vendorInfo?.phone_number
			|| null;
		const dressCode = restaurant.dressCode || null;
		const notes = restaurant.notes || vendorInfo?.description || null;
		return [
			{ Icon: PinBoardIcon, label: rt("location"), value: location, emptyLabel: rt("locationNotSet") },
			{ Icon: FoodIcon, label: rt("cuisine"), value: cuisine, emptyLabel: rt("cuisineNotSet") },
			{ Icon: WalletEarningsIcon, label: rt("priceRange"), value: priceLevel, emptyLabel: rt("priceLevelNotListed") },
			{ Icon: OnDemandIcon, label: rt("openToday"), value: hours, emptyLabel: rt("hoursNotSet") },
			{ Icon: HelpCenterIcon, label: rt("phone"), value: phone, emptyLabel: rt("phoneNotSet") },
			{ Icon: SocialIcon, label: rt("dressCode"), value: dressCode, emptyLabel: rt("dressCodeNotSet") },
			{ Icon: EventsIcon, label: rt("notes"), value: notes, emptyLabel: null },
		].filter((row) => row.value || row.emptyLabel);
	}, [restaurant, vendorInfo]);

	// Load restaurant food menu from Food dashboard items (via food_vendor_id link).
	useEffect(() => {
		let cancelled = false;
		(async () => {
			setMenuLoading(true);
			try {
				const res = await loadReservationMenu({
					embeddedMenu: Array.isArray(restaurant?.menu) ? restaurant.menu : [],
					foodVendorId: restaurant?.foodVendorId,
					ownerUserId: restaurant?.hostId,
					currentUserId: isAuthenticated() ? getAuthUserId() : null,
					listingId: restaurant?.id,
				});
				if (cancelled) return;
				setLiveMenu(res.menu || []);
				setVendorInfo(res.vendor || null);
			} catch {
				if (!cancelled) {
					setLiveMenu([]);
					setVendorInfo(null);
				}
			} finally {
				if (!cancelled) setMenuLoading(false);
			}
		})();
		return () => { cancelled = true; };
	}, [restaurant?.id, restaurant?.foodVendorId, restaurant?.menu, restaurant?.hostId]);

	const loadSlots = useCallback(() => {
		if (!restaurant?.id || !selDate) return;
		setSlotsLoading(true);
		setSlotsError(null);
		getReservationSlots(restaurant.id, {
			date: toDateParam(selDate),
			party_size: party,
		})
			.then((res) => {
				const data = res?.data ?? res;
				const rows = Array.isArray(data?.slots) ? data.slots : [];
				setSlotRows(rows);
				setSelTime((prev) => {
					if (!prev) return prev;
					const match = rows.find((s) => s.label === prev || s.time === to24h(prev));
					// Drop selection if the slot isn't in the live grid (or is unavailable)
					if (!match || match.available === false) return null;
					return prev;
				});
			})
			.catch(() => {
				setSlotsError(rt("slotsLoadError"));
				setSlotRows([]);
				setSelTime(null);
			})
			.finally(() => setSlotsLoading(false));
	}, [restaurant?.id, selDate, party, slotsRefreshKey]);

	useEffect(() => { loadSlots(); }, [loadSlots]);

	const handleConfirmClick = async () => {
		if (confirming) return;
		setBookError(null);
		if (slotsError || !selTime) {
			setBookError(rt("slotsLoadError"));
			return;
		}
		if (!isAuthenticated()) { setBookError(rt("loginToReserve")); return; }
		setConfirming(true);
		try {
			await onConfirm({ restaurant, date: selDate, time: selTime, party, notes: specialNotes });
		} catch (err) {
			const status = err?.response?.status;
			setBookError(err?.response?.data?.message || (status === 409 ? rt("slotUnavailable") : status === 401 ? rt("loginToBook") : rt("confirmReservationFailed")));
			setConfirming(false);
			if (status === 409) setSlotsRefreshKey((k) => k + 1);
		}
	};

	if (loading) return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<Skel w={160} h={18} r={6} style={{ marginTop: 24, marginBottom: 20 }} />
				<Skel w="100%" h={280} r={18} style={{ marginBottom: 28 }} />
				<Skel w="60%" h={32} r={8} style={{ marginBottom: 12 }} />
				<div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
					{[...Array(3)].map((_,i) => <Skel key={i} w={100} h={14} r={6} />)}
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				{/* Back */}
				<button onClick={onBack} className="text-text-secondary" style={{ marginTop: 24, marginBottom: 20, display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}>
					<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					Reservations
				</button>

				{/* Hero Banner — photo (or the dark placeholder gradient) needs a dark scrim + white
				    chrome to stay legible regardless of theme, so this whole block is intentionally
				    hardcoded dark in both themes (matches Hub.jsx's hero-scrim precedent). */}
				<div style={{ height: isMobile ? 200 : 300, borderRadius: 20, overflow: "hidden", marginBottom: 28, position: "relative" }}>
					{heroImg ? (
						<img src={heroImg} alt={restaurant.name} onError={() => setImgError(true)}
							style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
					) : (
						<div style={{ width: "100%", height: "100%", background: restaurant.thumb ?? "linear-gradient(135deg,#1c1917,#292524)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "rgba(255,255,255,0.45)" }}>
							<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{rt("noPhotosYet")}</span>
						</div>
					)}
					{/* Gradient overlay */}
					<div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)" }} />
					{/* Cuisine badge */}
					{restaurant.cuisine && (
						<span style={{ position: "absolute", top: 16, right: 16, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "5px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "#fff" }}>
							{restaurant.cuisine}
						</span>
					)}
					{/* Gallery thumbnails */}
					{restaurant.images?.length > 1 && (
						<div style={{ position: "absolute", bottom: 12, right: 12, display: "flex", gap: 6 }}>
							{restaurant.images.slice(1, 4).map((img, i) => (
								<div key={i} style={{ width: 48, height: 48, borderRadius: 8, overflow: "hidden", border: "2px solid rgba(255,255,255,0.2)" }}>
									<img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
								</div>
							))}
							{restaurant.images.length > 4 && (
								<div style={{ width: 48, height: 48, borderRadius: 8, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid rgba(255,255,255,0.2)" }}>
									<span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>+{restaurant.images.length - 4}</span>
								</div>
							)}
						</div>
					)}
				</div>

				{/* Header + Booking layout */}
				<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 340px", gap: 32, alignItems: "start" }}>
					<div>
						{/* Restaurant name & meta */}
						<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: isMobile ? 28 : 38, marginBottom: 8, letterSpacing: "0.01em" }}>{restaurant.name}</h1>
						<div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", marginBottom: 12 }}>
							{restaurant.reviews > 0 && restaurant.rating != null && (
								<>
									<div style={{ display: "flex", alignItems: "center", gap: 5 }}>
										{/* Inactive star fill: closest bucket to the 0.15 dark value is text-muted (border
										    tokens read as too faint at glyph size, primary/secondary too heavy for "inactive"). */}
										{[1,2,3,4,5].map(n => <span key={n} style={{ color: n <= Math.round(restaurant.rating) ? "#f59e0b" : "var(--color-text-muted)", fontSize: 14 }}>★</span>)}
										<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, marginLeft: 4 }}>{restaurant.rating}</span>
										<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{rt("reviewsCount", { count: restaurant.reviews })}</span>
									</div>
									<span className="text-text-muted">·</span>
								</>
							)}
							{restaurant.priceLevel && (
								<>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{restaurant.priceLevel}</span>
									<span className="text-text-muted">·</span>
								</>
							)}
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{restaurant.location}</span>
						</div>
						{restaurant.bookedToday > 0 && (
							<div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(5,150,105,0.12)", border: "1px solid rgba(5,150,105,0.3)", borderRadius: 8, padding: "5px 12px", marginBottom: 16, color: "#10b981" }}>
								<LiveIcon s={14} />
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#10b981", fontWeight: 600 }}>{rt("bookedTimesToday", { count: restaurant.bookedToday })}</span>
							</div>
						)}
						{restaurant.description && (
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.65, marginBottom: 24, maxWidth: 560 }}>{restaurant.description}</p>
						)}

						{/* Tabs */}
						<div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
							{["book", "menu", "info"].map(tabKey => (
								<button key={tabKey} onClick={() => setActiveTab(tabKey)} style={{
									padding: "8px 20px", borderRadius: 20, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", textTransform: "capitalize",
									border: `1px solid ${activeTab === tabKey ? "#2563eb" : "var(--color-border)"}`,
									background: activeTab === tabKey ? "rgba(37,99,235,0.15)" : "transparent",
									color: activeTab === tabKey ? "#60a5fa" : "var(--color-text-secondary)",
								}}>
									{tabKey === "book" ? rt("tabBook") : tabKey === "menu" ? rt("tabMenu") : rt("tabInfo")}
								</button>
							))}
						</div>

						{activeTab === "menu" && (
							<div style={{ maxWidth: 520 }}>
								{menuLoading ? (
									<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
										{[...Array(4)].map((_, i) => <Skel key={i} w="100%" h={18} r={6} />)}
									</div>
								) : (liveMenu?.length > 0)
									? liveMenu.map((s, i) => <ResMenuSection key={i} section={s} />)
									: (
										<div style={{ padding: "8px 0" }}>
											<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 8 }}>
												{rt("menuEmptyTitle")}
											</p>
											<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.5 }}>
												{rt("menuNotAvailableHint")}
											</p>
										</div>
									)
								}
							</div>
						)}

						{activeTab === "info" && (
							<div style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 14 }}>
								{infoRows.map(row => (
									<div key={row.label} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
										<span className="text-text-secondary" style={{ flexShrink: 0, display: "flex" }}><row.Icon s={16} /></span>
										<div>
											<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{row.label}</p>
											<p className={row.value ? "text-text-primary" : "text-text-muted"} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontStyle: row.value ? "normal" : "italic" }}>
												{row.value || row.emptyLabel}
											</p>
										</div>
									</div>
								))}
							</div>
						)}

						{/* Mobile booking widget */}
						{activeTab === "book" && isMobile && (
							<BookingPanel
								restaurant={restaurant} dates={dates} selDate={selDate} setSelDate={setSelDate}
								selTime={selTime} setSelTime={setSelTime} party={party} setParty={setParty}
								specialNotes={specialNotes} setSpecialNotes={setSpecialNotes}
								confirming={confirming} bookError={bookError} bookedSlots={bookedSlots}
								slotRows={slotRows} slotsLoading={slotsLoading} slotsError={slotsError}
								onConfirmClick={handleConfirmClick}
							/>
						)}
					</div>

					{/* Desktop sticky booking widget */}
					{activeTab === "book" && !isMobile && (
						<div style={{ position: "sticky", top: 20 }}>
							<BookingPanel
								restaurant={restaurant} dates={dates} selDate={selDate} setSelDate={setSelDate}
								selTime={selTime} setSelTime={setSelTime} party={party} setParty={setParty}
								specialNotes={specialNotes} setSpecialNotes={setSpecialNotes}
								confirming={confirming} bookError={bookError} bookedSlots={bookedSlots}
								slotRows={slotRows} slotsLoading={slotsLoading} slotsError={slotsError}
								onConfirmClick={handleConfirmClick}
							/>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

// ─── Booking Panel (shared between mobile/desktop) ────────────────────────────
function BookingPanel({ restaurant, dates, selDate, setSelDate, selTime, setSelTime, party, setParty, specialNotes, setSpecialNotes, confirming, bookError, bookedSlots, slotRows, slotsLoading, slotsError, onConfirmClick }) {
	return (
		/* Sticky booking panel — matches the surface-raised (opaque) treatment Events.jsx and
		   VehicleRental.jsx use for their analogous sticky booking cards, no backdrop-blur. */
		<div className="bg-surface-raised border border-border" style={{ borderRadius: 20, padding: 24 }}>
			<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: "0.04em", marginBottom: 20, textTransform: "uppercase" }}>{rt("reserveATable")}</p>

			{/* Party size */}
			<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>{rt("partySize")}</p>
			<div style={{ marginBottom: 22 }}>
				<PartySizePicker value={party} onChange={setParty} />
			</div>

			{/* Date strip */}
			<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>{rt("selectDate")}</p>
			<div style={{ marginBottom: 22 }}>
				<DateStrip dates={dates} selected={selDate} onSelect={setSelDate} />
			</div>

			{/* Time slots */}
			<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>{rt("availableTimes")}</p>
			{slotsError && (
				<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#fbbf24", marginBottom: 10 }}>{slotsError}</p>
			)}
			{!slotsError && Array.isArray(slotRows) && slotRows.length > 0
				&& slotRows.every((s) => s.available === false)
				&& slotRows.some((s) => /capacity must be configured/i.test(String(s.reason || ""))) && (
				<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#fbbf24", marginBottom: 10 }}>
					{rt("listingCapacityNotConfigured")}
				</p>
			)}
			<div style={{ marginBottom: 22 }}>
				<TimeSlotGrid
					selected={selTime}
					onSelect={setSelTime}
					bookedSlots={bookedSlots}
					slotRows={slotRows}
					loading={slotsLoading}
					failed={Boolean(slotsError)}
				/>
			</div>

			{/* Special requests */}
			{selTime && !slotsError && (
				<div style={{ marginBottom: 20 }}>
					<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>{rt("specialRequests")} <span className="text-text-muted" style={{ fontSize: 10, textTransform: "none", fontWeight: 400, letterSpacing: 0 }}>{rt("optional")}</span></p>
					<textarea
						value={specialNotes}
						onChange={e => setSpecialNotes(e.target.value.slice(0, 300))}
						placeholder={rt("specialRequestsPlaceholder")}
						rows={3}
						className="border border-border text-text-primary" style={{ width: "100%", background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", colorScheme: "dark" }}
					/>
				</div>
			)}

			{/* Confirm CTA — never offer Confirm when slots failed to load */}
			{selTime && !slotsError ? (
				<button onClick={onConfirmClick} disabled={confirming} style={{
					width: "100%", background: confirming ? "rgba(37,99,235,0.5)" : "linear-gradient(145deg,#2563eb,#1d4ed8)",
					border: "none", borderRadius: 14, padding: "15px 24px", fontFamily: "'DM Sans', sans-serif",
					fontWeight: 800, fontSize: 15, color: "#fff", cursor: confirming ? "not-allowed" : "pointer",
					transition: "all 0.2s", boxShadow: confirming ? "none" : "0 6px 24px rgba(37,99,235,0.45)",
					display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
				}}>
					{confirming ? (
						<>
							<span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
							{rt("confirming")}
						</>
					) : (
						rt("confirmWithDetails", { time: selTime, guests: guestCountLabel(party) })
					)}
				</button>
			) : (
				<div className="bg-border-subtle text-text-muted" style={{ width: "100%", border: "1px dashed var(--color-border)", borderRadius: 14, padding: "15px 24px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, textAlign: "center" }}>
					{rt("selectTimeToContinue")}
				</div>
			)}

			{bookError && (
				<div style={{ marginTop: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "10px 14px" }}>
					<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#f87171" }}>{bookError}</p>
				</div>
			)}

			<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textAlign: "center", marginTop: 14 }}>
				{rt("noChargeNote")}
			</p>
		</div>
	);
}

// ─── Confirmation Page ────────────────────────────────────────────────────────
function ResConfirmPage({ info, onDone, onBack }) {
	const { isMobile } = useViewport();
	const bookingRef = info?.bookingRef || null;
	const lang = i18n.language || undefined;
	const fmtLong = d => d.toLocaleDateString(lang, { weekday: "long", month: "long", day: "numeric" });

	return (
		// Scroll shell matches restaurant/grid views so Done stays reachable when content
		// is taller than the viewport (app shell uses overflow:hidden).
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			{/* minHeight 100% + justify center: short screens stay centered; tall content grows and scrolls */}
			<div style={{ minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", textAlign: "center" }}>
				<button onClick={onBack || onDone} className="text-text-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start", marginBottom: 20, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					{i18n.t("common.back")}
				</button>
				{/* Success Icon — status green, stays hardcoded in both themes */}
				<div style={{ width: 80, height: 80, borderRadius: "50%", background: "radial-gradient(circle, rgba(5,150,105,0.2) 0%, rgba(5,150,105,0.05) 100%)", border: "2px solid #059669", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, fontSize: 34, animation: "fadeUp 0.4s ease" }}>
					✓
				</div>

				{/* Title */}
				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: 32, marginBottom: 6, letterSpacing: "0.03em" }}>{rt("youreAllSet")}</h2>
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 24 }}>{rt("reservationConfirmedShort")}</p>

				{/* Booking card — same surface-raised treatment as BookingPanel above, for consistency */}
				<div className="bg-surface-raised border border-border" style={{ borderRadius: 20, padding: 24, maxWidth: 400, width: "100%", marginBottom: 28, textAlign: "left" }}>
					{bookingRef && (
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--color-border-subtle)" }}>
							<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>{rt("bookingReference")}</span>
							<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 16, color: "#60a5fa", letterSpacing: "0.05em" }}>{bookingRef}</span>
						</div>
					)}
					{[
						{ Icon: FoodIcon, label: rt("restaurant"), value: info.restaurant.name },
						{ Icon: EventsIcon, label: rt("date"), value: fmtLong(info.date) },
						{ Icon: OnDemandIcon, label: rt("time"), value: info.time },
						{ Icon: SocialIcon, label: rt("guests"), value: guestCountLabel(info.party) },
						...(info.notes ? [{ Icon: OrdersIcon, label: rt("notes"), value: info.notes }] : []),
					].map(row => (
						<div key={row.label} style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "flex-start" }}>
							<span className="text-text-secondary" style={{ flexShrink: 0, display: "flex" }}><row.Icon s={15} /></span>
							<div>
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 1 }}>{row.label}</p>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500 }}>{row.value}</p>
							</div>
						</div>
					))}
				</div>

				{/* Action buttons — Rate Restaurant removed: no booking-engine review API exists,
				    and a local-only "rated" state lied to guests (reviewer Issue #6). */}
				<div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginBottom: 16 }}>
					<a
						href={addToCalendarUrl(info.restaurant.name, info.date, info.time, info.restaurant.location)}
						target="_blank" rel="noreferrer"
						className="border border-border text-text-primary" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: "11px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, textDecoration: "none", transition: "background 0.15s" }}
					>
						<EventsIcon s={14} /> {rt("addToCalendar")}
					</a>
				</div>
				<button onClick={onDone} style={{ background: "linear-gradient(145deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 12, padding: "13px 36px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer", boxShadow: "0 4px 18px rgba(37,99,235,0.4)" }}>
					{rt("done")}
				</button>
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 16 }}>
					{rt("confirmationEmailNote")}
				</p>
			</div>
		</div>
	);
}

// ─── My Reservations Tab ──────────────────────────────────────────────────────
function MyReservationsTab({ bookings, loading, onCancelSuccess }) {
	const [cancelling, setCancelling] = useState(null);
	const [cancelError, setCancelError] = useState(null);
	const lang = i18n.language || undefined;

	const handleCancel = async (bookingId) => {
		if (!window.confirm(rt("cancelReservationConfirm"))) return;
		setCancelling(bookingId);
		setCancelError(null);
		try {
			await cancelBooking(bookingId, rt("guestCancelled"));
			onCancelSuccess(bookingId);
		} catch (err) {
			setCancelError(bookingId);
		} finally {
			setCancelling(null);
		}
	};

	if (loading) return (
		<div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
			{[...Array(3)].map((_, i) => <Skel key={i} w="100%" h={80} r={14} />)}
		</div>
	);

	if (bookings.length === 0) return (
		<div style={{ textAlign: "center", padding: "60px 20px", marginBottom: 24 }}>
			<div className="text-text-muted" style={{ marginBottom: 14, display: "flex", justifyContent: "center" }}><ReservationsIcon s={40} /></div>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 6 }}>{rt("noReservationsYet")}</p>
			<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{rt("findRestaurantHint")}</p>
		</div>
	);

	const statusStyles = {
		confirmed:  { bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.25)",  color: "#22c55e" },
		pending:    { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.25)", color: "#f59e0b" },
		requested:  { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.25)", color: "#f59e0b" },
		awaiting_host: { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.25)", color: "#f59e0b" },
		cancelled:  { bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.2)",   color: "#f87171" },
		declined:   { bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.2)",   color: "#f87171" },
		completed:  { bg: "rgba(99,102,241,0.12)", border: "rgba(99,102,241,0.25)", color: "#818cf8" },
		in_progress:{ bg: "rgba(37,99,235,0.12)",  border: "rgba(37,99,235,0.25)",  color: "#60a5fa" },
		no_show:    { bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.2)",   color: "#f87171" },
	};

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
			{bookings.map((b, i) => {
				const st = statusStyles[b.status] ?? statusStyles.pending;
				const canCancel = ["pending", "confirmed"].includes(b.status);
				return (
					<div key={b.reservation_id ?? i} className="bg-surface border border-border-subtle" style={{ borderRadius: 16, padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, transition: "border-color 0.15s" }}
						onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-border)"}
						onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border-subtle)"}
					>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.food_vendor?.vendor_name ?? rt("restaurant")}</p>
								<span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6, background: st.bg, border: `1px solid ${st.border}`, color: st.color, textTransform: "capitalize", whiteSpace: "nowrap" }}>{translateReservationStatus(b.status)}</span>
							</div>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
								{b.date && new Date(b.date + "T00:00:00").toLocaleDateString(lang, { weekday: "short", month: "short", day: "numeric" })}{b.time ? ` ${rt("atTime", { time: b.time })}` : ""}
								{b.party_size ? ` · ${guestCountLabel(b.party_size)}` : ""}
							</p>
							{b.special_notes && <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 3, fontStyle: "italic" }}>"{b.special_notes}"</p>}
							{cancelError === b.reservation_id && <p style={{ fontSize: 12, color: "#f87171", marginTop: 4 }}>{rt("failedToCancel")}</p>}
						</div>
						{canCancel && (
							<button onClick={() => handleCancel(b.reservation_id)} disabled={cancelling === b.reservation_id} style={{
								flexShrink: 0, padding: "8px 16px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12,
								cursor: cancelling === b.reservation_id ? "not-allowed" : "pointer",
								background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171",
								transition: "all 0.15s",
							}}
								onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.15)"; }}
								onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.08)"; }}
							>
								{cancelling === b.reservation_id ? rt("cancelling") : rt("cancel")}
							</button>
						)}
					</div>
				);
			})}
		</div>
	);
}

// ─── Restaurant Card ──────────────────────────────────────────────────────────
function RestaurantCard({ r, idx, onQuickBook, onOpen }) {
	const [imgError, setImgError] = useState(false);
	const img = !imgError && r.images?.[0] ? r.images[0] : null;
	const quickTimes = resolveQuickBookTimes(r.slots);

	return (
		<div
			onClick={() => onOpen(r)}
			className="bg-surface border border-border-subtle" style={{ borderRadius: 18, overflow: "hidden", cursor: "pointer", transition: "all 0.2s", animation: `fadeUp 0.35s ease ${idx * 50}ms both` }}
			onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)"; e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 12px 40px var(--color-shadow)"; }}
			onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--color-border-subtle)"; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
		>
			{/* Image — thumb/fallback is always a dark gradient, so the placeholder label stays
			    hardcoded light regardless of theme, same call as the detail-page hero. */}
			<div style={{ height: 170, position: "relative", overflow: "hidden", background: r.thumb ?? "linear-gradient(135deg,#1c1917,#292524)" }}>
				{img
					? <img src={img} alt={r.name} onError={() => setImgError(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transition: "transform 0.4s" }}
						onMouseEnter={e => e.target.style.transform = "scale(1.06)"}
						onMouseLeave={e => e.target.style.transform = "scale(1)"}
					/>
					: (
						<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{rt("noPhotosYet")}</span>
						</div>
					)
				}
				{/* Gradient overlay */}
				<div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 55%)" }} />
				{/* Rating badge — only when there are real reviews */}
				{r.reviews > 0 && r.rating != null && (
					<div style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", borderRadius: 8, padding: "4px 9px" }}>
						<span style={{ color: "#f59e0b", fontSize: 12 }}>★</span>
						<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#fff" }}>{r.rating}</span>
					</div>
				)}
				{/* Cuisine badge */}
				{r.cuisine && (
					<span style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", borderRadius: 7, padding: "4px 9px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
						{r.cuisine}
					</span>
				)}
			</div>

			{/* Content */}
			<div style={{ padding: "14px 16px 16px" }}>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
					<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, flex: 1, paddingRight: 8 }}>{r.name}</p>
					{r.priceLevel && (
						<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, whiteSpace: "nowrap" }}>{r.priceLevel}</span>
					)}
				</div>
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.location}</p>

				{/* Booked today pill */}
				{r.bookedToday > 0 && (
					<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#10b981", marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
						<LiveIcon s={12} /> {rt("bookedTimesToday", { count: r.bookedToday })}
					</p>
				)}

				{/* Configured schedule chips (not live availability) */}
				{quickTimes.length > 0 && (
					<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>
						{rt("typicalTimes")}
					</p>
				)}
				<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
					{quickTimes.map(t => (
						<button
							key={t}
							type="button"
							title={rt("typicalTimeChipHint")}
							aria-label={rt("typicalTimeChipAria", { time: t })}
							onClick={e => { e.stopPropagation(); onQuickBook(r, t); }}
							className="border border-border text-text-secondary" style={{
								padding: "6px 11px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
								background: "rgba(255,255,255,0.04)", cursor: "pointer", transition: "all 0.15s",
							}}
							onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; }}
							onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}
						>
							{t}
						</button>
					))}
					<button type="button" onClick={(e) => { e.stopPropagation(); onOpen(r); }} className="border border-border text-text-muted" style={{ padding: "6px 11px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, background: "transparent", cursor: "pointer" }}>
						{rt("more")}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── Main Reservations Page ───────────────────────────────────────────────────
function ReservationsPage({ onNavigate }) {
	const { t, landingTitle } = usePageI18n("reservations");
	const { isMobile } = useViewport();
	const loading = usePageLoad();
	const [cuisine, setCuisine] = useState(() => i18n.t("common.all"));
	const [resView, setResView] = useState("grid");
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [resView]);
	const [selectedRestaurant, setSelectedRestaurant] = useState(null);
	const [bookingInfo, setBookingInfo] = useState(null);
	const [mainTab, setMainTab] = useState("find");
	const [myBookings, setMyBookings] = useState([]);
	const [bookingsLoading, setBookingsLoading] = useState(false);
	const [bookingsFetched, setBookingsFetched] = useState(false);
	const [resData, setResData] = useState([]);
	const [resLoading, setResLoading] = useState(true);
	const [resError, setResError] = useState(null);
	const [resCuisines, setResCuisines] = useState(() => buildReservationCuisines([]));
	const [isRestaurantHost, setIsRestaurantHost] = useState(false);
	const catScrollRef = useRef(null);
	const [catScrollState, setCatScrollState] = useState({ atStart: true, atEnd: true });
	const [reservationReturnTo] = useState(() => {
		if (typeof window === "undefined") return null;
		return window.__reservationReturnTo === "dating" ? "dating" : null;
	});

	const loadReservations = useCallback(() => {
		setResLoading(true);
		setResError(null);
		getBookingListings({ vertical: 'reservation' }).then(r => {
			const arr = Array.isArray(r) ? r : (r?.data ?? []);
			if (arr.length) {
				const mapped = arr.map((l, idx) => {
					const images = mediaUrls(l.images);
					const a = typeof l.attributes === "object" && l.attributes !== null ? l.attributes : {};
					const priceLevelRaw = a.price_level ?? a.priceLevel;
					const priceLevel = priceLevelRaw != null && String(priceLevelRaw).trim() !== ""
						? String(priceLevelRaw).trim()
						: null;
					return {
						id: l.booking_listing_id,
						name: l.title || rt("restaurant"),
						cuisine: a.category || a.cuisine || rt("restaurant"),
						location: l.location || "",
						price: Number(l.price) || 0,
						priceLevel,
						description: l.description ?? null,
						images,
						image: images[0] ?? null,
						hostId: l.owner_id ?? null,
						foodVendorId: a.food_vendor_id ?? a.vendor_id ?? null,
						rating: Number(l.avg_rating) || Number(a.rating) || null,
						reviews: Number(l.review_count) || Number(a.reviews) || 0,
						hours: (typeof a.hours === "string" && a.hours.trim())
							? a.hours.trim()
							: (a.opening_hours && a.closing_hours ? `${a.opening_hours} – ${a.closing_hours}` : null),
						phone: (typeof a.phone === "string" && a.phone.trim()) ? a.phone.trim() : null,
						dressCode: (typeof a.dress_code === "string" && a.dress_code.trim()) ? a.dress_code.trim() : null,
						notes: (typeof a.notes === "string" && a.notes.trim()) ? a.notes.trim() : null,
						featured: a.featured ?? false,
						bookedToday: Number(a.booked_today) > 0 ? Number(a.booked_today) : 0,
						thumb: `linear-gradient(135deg,#1c1917,${CUISINE_COLORS[idx % CUISINE_COLORS.length]})`,
						menu: Array.isArray(a.menu) ? a.menu : [],
						slots: Array.isArray(a.time_slots) ? a.time_slots : [],
					};
				});
				setResData(mapped);
				setResCuisines(buildReservationCuisines(mapped));
					// Pre-select vendor if navigated from food store "Book Table" button
					const targetId = window.__reservationVendorId;
					if (targetId) {
						const numericTarget = Number(targetId);
						const match = mapped.find(v => Number(v.id) === numericTarget || Number(v.foodVendorId) === numericTarget);
						if (match) { setSelectedRestaurant(match); setResView("restaurant"); }
						window.__reservationVendorId = null;
					}
				}
		}).catch(() => { setResError(rt("loadRestaurantsError")); }).finally(() => setResLoading(false));
	}, []);

	useEffect(() => { loadReservations(); }, [loadReservations]);

	useEffect(() => {
		if (!isAuthenticated()) {
			setIsRestaurantHost(false);
			return;
		}
		const uid = getAuthUserId();
		if (uid != null && resData.some((r) => r.hostId != null && String(r.hostId) === String(uid))) {
			setIsRestaurantHost(true);
			return;
		}
		let cancelled = false;
		resolveMyRestaurantVendorId().then((id) => {
			if (!cancelled) setIsRestaurantHost(id != null);
		}).catch(() => {
			if (!cancelled) setIsRestaurantHost(false);
		});
		return () => { cancelled = true; };
	}, [resData]);

	useLayoutEffect(() => {
		const el = catScrollRef.current;
		if (!el) return;
		const update = () => setCatScrollState(prev => { const atStart = el.scrollLeft <= 4, atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4; return prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }; });
		update();
		el.addEventListener("scroll", update, { passive: true });
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
	}, [resView]);

	const filtered = useMemo(() => {
		const allLabel = i18n.t("common.all");
		if (cuisine === allLabel || cuisine === "All") return resData;
		return resData.filter(r => r.cuisine === cuisine);
	}, [cuisine, resData]);

	const handleQuickBook = (restaurant, time) => {
		setSelectedRestaurant({ ...restaurant, _quickTime: time });
		setResView("restaurant");
	};

	const handleOpen = (restaurant) => {
		setSelectedRestaurant(restaurant);
		setResView("restaurant");
	};

	const handleCancelSuccess = (bookingId) => {
		setMyBookings(prev => prev.map(b => b.reservation_id === bookingId ? { ...b, status: "cancelled" } : b));
	};

	const handlePageBack = useCallback(() => {
		const cameFromFood = typeof window !== "undefined" && !!window.__fromFood;
		const target = reservationReturnTo || (cameFromFood ? "food" : "home");
		if (typeof window !== "undefined") {
			window.__fromFood = false;
			window.__reservationReturnTo = null;
		}
		if (typeof onNavigate === "function") onNavigate(target);
		else if (typeof window !== "undefined" && window.__nav) window.__nav(target);
	}, [onNavigate, reservationReturnTo]);

	const loadMyBookings = useCallback(() => {
		setBookingsLoading(true);
		getBookings({ role: 'guest' }).then(r => {
			const arr = Array.isArray(r) ? r : (r?.data ?? []);
			const mapped = arr
				.filter(b => b.vertical === 'reservation')
				.map(b => ({
					reservation_id: b.booking_id,
					food_vendor: { vendor_name: b.booking_listing?.title ?? b.title ?? rt("reservationFallback") },
					date: b.start_date ? String(b.start_date).slice(0, 10) : "",
					time: b.start_time ?? "",
					party_size: b.guests ?? b.quantity ?? 1,
					special_notes: b.notes ?? null,
					status: b.status === "awaiting_host" || b.status === "requested" ? "pending" : (b.status ?? "pending"),
				}));
			setMyBookings(mapped);
		}).catch(() => {}).finally(() => { setBookingsLoading(false); setBookingsFetched(true); });
	}, []);

	// ── Sub-views ──
	if (resView === "restaurant" && selectedRestaurant) {
		return <ResRestaurantPage
			restaurant={selectedRestaurant}
			onBack={() => { setResView("grid"); }}
			onConfirm={async info => {
				const d = info.date;
				const startDate = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : undefined;
				const startTime = to24h(info.time);
				const party = Number(info.party) || 1;
				const created = await createBooking({
					booking_listing_id: info.restaurant?.id,
					start_date: startDate,
					start_time: startTime,
					guests: party,
					quantity: party,
					notes: info.notes || `Reservation at ${info.time} for ${party} guest${party > 1 ? 's' : ''}`,
				});
				const booking = created?.data ?? created?.booking ?? created;
				setBookingInfo({ ...info, bookingRef: bookingRefFromServer(booking), booking });
				setResView("confirm");
				// Notify host via DM (best-effort)
				const ownerId = info.restaurant?.hostId ?? info.restaurant?.owner_id;
				if (ownerId) {
					try {
						const { messageUser } = await import('../api/chat');
						const dateStr = info.date?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) ?? '';
						await messageUser(ownerId, {
							initialMessage: `Hi! I just booked a table at ${info.restaurant?.name ?? 'your restaurant'} for ${party} guest${party > 1 ? 's' : ''} on ${dateStr} at ${info.time ?? ''}. Please confirm. Thank you!`,
							navigate: false,
							sourceVertical: "reservations",
						});
					} catch { /* noop */ }
				}
				// Refresh my bookings cache
				if (bookingsFetched) loadMyBookings();
			}}
		/>;
	}

	if (resView === "confirm") {
		return <ResConfirmPage
			info={bookingInfo}
			onBack={() => { setResView("restaurant"); }}
			onDone={() => { setResView("grid"); setSelectedRestaurant(null); setBookingInfo(null); }}
		/>;
	}

	const backLabel = reservationReturnTo === "dating"
		? "Back to Dating"
		: (typeof window !== "undefined" && !!window.__fromFood) ? rt("backToFood") : i18n.t("food.backToHome");

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 40 }}>
					<div style={{ padding: "32px 0 0" }}>
							<button onClick={handlePageBack} className="text-text-secondary" style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, padding: "0 0 16px" }}>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
								{backLabel}
							</button>
						{/* Landing hero — base surface is a token (like Groceries.jsx's groceryPanel) with the
						    blue/green gradient stops kept as small hardcoded accent tints layered over it, and a
						    separate decorative radial-gradient wash (also hardcoded — pure color accent, not a
						    neutral surface) on top; that wash and the accent badge/pill text stay brand-colored
						    in both themes. */}
						<section className="border border-border" style={{ marginBottom: 24, borderRadius: 22, padding: isMobile ? 18 : 24, background: "linear-gradient(135deg, rgba(37,99,235,0.18), var(--color-surface-raised) 46%, rgba(5,150,105,0.12))", boxShadow: "0 22px 70px var(--color-shadow)", overflow: "hidden", position: "relative" }}>
							<div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 18% 10%, rgba(96,165,250,0.16), transparent 32%), radial-gradient(circle at 90% 20%, rgba(16,185,129,0.12), transparent 34%)", pointerEvents: "none" }} />
							<div style={{ position: "relative", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) auto", gap: 18, alignItems: "center" }}>
								<div>
									<div className="border border-border" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 11px", borderRadius: 999, background: "rgba(255,255,255,0.07)", color: "#93c5fd", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
										<ReservationsIcon s={15} /> Reservations
									</div>
									<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: "clamp(32px,5vw,58px)", lineHeight: 0.94, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>{landingTitle}</h1>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.55, maxWidth: 620, marginTop: 10 }}>{i18n.t("reservations.subtitle")}</p>
								</div>
								<div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: isMobile ? "stretch" : "flex-end" }}>
									<HostListingCTA vertical="reservation" label={t("hostListing.reservation")} onCreated={loadReservations} />
									<div className="text-text-secondary" style={{ display: "flex", gap: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 800 }}>
										<span className="border border-border-subtle" style={{ padding: "7px 10px", borderRadius: 999, background: "rgba(255,255,255,0.06)" }}>{resLoading ? "..." : filtered.length} available</span>
										<span className="border border-border-subtle" style={{ padding: "7px 10px", borderRadius: 999, background: "rgba(255,255,255,0.06)" }}>{myBookings.length} bookings</span>
									</div>
								</div>
							</div>
						</section>

					{/* Manage bookings CTA (restaurant host) — main relocated the listing CTA into the header above */}
					{isRestaurantHost && (
						<div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
							<button
								type="button"
								onClick={() => { if (typeof window.__nav === "function") window.__nav("sd-restbookings"); }}
								style={{
									padding: "9px 16px", borderRadius: 20, cursor: "pointer",
									fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
									background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)",
									color: "#fbbf24",
								}}
							>
								{rt("manageBookings")}
							</button>
						</div>
					)}

					{/* Tabs */}
					<div className="bg-border-subtle border border-border" style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 24, padding: 5, borderRadius: 999, width: "fit-content", maxWidth: "100%", marginLeft: "auto", marginRight: "auto" }}>
						{["find", "bookings"].map(tabKey => (
							<button key={tabKey} onClick={() => {
								setMainTab(tabKey);
								if (tabKey === "bookings" && !bookingsFetched) loadMyBookings();
							}} style={{
								padding: isMobile ? "9px 14px" : "10px 24px", borderRadius: 999, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 900, cursor: "pointer", transition: "all 0.15s",
								border: "none",
								/* Active pill is a deliberate "always-white glossy capsule" (like an iOS
								   segmented control) regardless of theme — not a neutral surface, so it
								   stays hardcoded white+dark-text rather than tokenized. */
								background: mainTab === tabKey ? "#fff" : "transparent",
								color: mainTab === tabKey ? "#111217" : "var(--color-text-secondary)",
								boxShadow: mainTab === tabKey ? "0 10px 28px rgba(37,99,235,0.22)" : "none",
							}}>
								<span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
									{tabKey === "find" ? <><ReservationsIcon s={14} /> {rt("findTable")}</> : <><OrdersIcon s={14} /> {rt("myReservations")}</>}
								</span>
							</button>
						))}
					</div>

					{/* My Reservations */}
					{mainTab === "bookings" && (
						<MyReservationsTab bookings={myBookings} loading={bookingsLoading} onCancelSuccess={handleCancelSuccess} />
					)}

					{/* Cuisine filter row */}
					<div style={{ display: mainTab === "find" ? "flex" : "none", alignItems: "flex-start", gap: 10, marginBottom: 28, animation: "fadeUp 0.35s ease 60ms both" }}>
						<button onClick={() => catScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })} className={`${catScrollState.atStart ? "bg-surface" : "bg-surface-raised"} ${catScrollState.atStart ? "text-text-muted" : "text-text-primary"}`} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, border: `1px solid ${catScrollState.atStart ? "var(--color-border-subtle)" : "var(--color-border)"}`, cursor: catScrollState.atStart ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto" }}
							onMouseEnter={e => e.currentTarget.style.transform = "scale(1.12)"} onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
						>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
						</button>
						<div ref={catScrollRef} className="ecom-cat-scroll" style={{ flex: 1, display: "flex", gap: 20, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none", justifyContent: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "center" : "flex-start" }}>
							{resCuisines.map((c, i) => (
								<LeoButton key={c.label} cat={c} active={cuisine === c.label} onClick={() => setCuisine(c.label)} delay={i * 30} />
							))}
						</div>
						<button onClick={() => catScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: catScrollState.atEnd ? "var(--color-surface)" : "#2563eb", border: `1px solid ${catScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`, color: catScrollState.atEnd ? "var(--color-text-muted)" : "#fff", cursor: catScrollState.atEnd ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", boxShadow: catScrollState.atEnd ? "none" : "0 2px 14px rgba(37,99,235,0.55)" }}
							onMouseEnter={e => e.currentTarget.style.transform = "scale(1.12)"} onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
						>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
						</button>
					</div>
					{/* Restaurant Grid */}
					<div style={{ display: mainTab === "find" ? "grid" : "none", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
						{loading ? Array.from({ length: 6 }).map((_, i) => (
							<div key={i} className="bg-surface border border-border-subtle" style={{ borderRadius: 18, overflow: "hidden", animation: `fadeUp 0.3s ease ${i * 50}ms both` }}>
								<Skel h={170} r={0} />
								<div style={{ padding: "14px 16px" }}>
									<Skel w="58%" h={15} r={6} style={{ marginBottom: 8 }} />
									<Skel w="40%" h={11} r={5} style={{ marginBottom: 12 }} />
									<div style={{ display: "flex", gap: 6 }}>
										<Skel w={68} h={28} r={8} />
										<Skel w={68} h={28} r={8} />
										<Skel w={68} h={28} r={8} />
									</div>
								</div>
							</div>
						)) : resLoading ? Array.from({ length: 6 }).map((_, i) => (
							<div key={i} className="bg-surface border border-border-subtle" style={{ borderRadius: 18, overflow: "hidden" }}>
								<Skel h={170} r={0} /><div style={{ padding: "14px 16px" }}><Skel w="60%" h={14} r={6} style={{ marginBottom: 8 }} /><Skel w="40%" h={11} r={5} /></div>
							</div>
						)) : resError ? (
							<div style={{ gridColumn: "1/-1", textAlign: "center", padding: "60px 20px" }}>
								<div style={{ marginBottom: 14, display: "flex", justifyContent: "center", color: "rgba(248,113,113,0.7)" }}><HelpCenterIcon s={36} /></div>
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: "#f87171", marginBottom: 14 }}>{resError}</p>
								<button onClick={loadReservations} style={{ background: "#2563eb", border: "none", borderRadius: 10, padding: "11px 24px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>{i18n.t("common.retry")}</button>
							</div>
						) : filtered.length === 0 ? (
							<div style={{ gridColumn: "1/-1", textAlign: "center", padding: "60px 20px" }}>
								<div className="text-text-muted" style={{ marginBottom: 14, display: "flex", justifyContent: "center" }}><FoodIcon s={36} /></div>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 8 }}>{i18n.t("reservations.noRestaurantsAvailable")}</p>
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("reservations.tryDifferentCategory")}</p>
							</div>
						) : filtered.map((r, i) => (
							<RestaurantCard key={r.id} r={r} idx={i} onOpen={handleOpen} onQuickBook={handleQuickBook} />
						))}
					</div>
				</div>
			</div>

			{/* Spin keyframe for loading button */}
			<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
		</div>
	);
}

export { ReservationsPage };
