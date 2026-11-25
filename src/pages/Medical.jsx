import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from "react";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList } from "../hooks/useI18nCategoryList.js";
import i18n from "../i18n/index.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { Skel } from "../components/skeletons.jsx";
import { LeoButton } from "../components/shared.jsx";
import { messageUser } from "../api/chat";
import { getBookingListings, createBooking, getListingAvailability, submitBookingReview, getListingReviews } from "../api/booking";
import { CardPaymentField, useBookingPayment } from "../components/BookingPayment.jsx";
import { bindCheckoutReferralCode } from "../api/user";
import { isAuthenticated } from "../store/auth";
import { Avatar } from "../components/SafeImage.jsx";
import {
	DEFAULT_TIME_SLOTS,
	MEDICAL_SPECIALTY_DEFS,
	MEDICAL_RADIUS_OPTIONS_KM,
	MEDICAL_INSURANCE_OPTIONS,
	MEDICAL_SORT_IDS,
	MEDICAL_FAQ_DEFS,
	medTo24h,
	normalizeConsultType,
	filterMedicalDoctors,
	canBookDoctor,
	doctorPhotoIsUrl,
	dayKeyFromDate,
	parseMedicalAvailability,
	isDateUnavailable,
	slotsForDate,
	groupMedicalListings,
	buildDoctorProfileModel,
	sortMedicalDoctors,
	medicalPageMeta,
	buildMedicalJsonLd,
	buildMedicalFaqJsonLd,
	withNextAvailableFromLegs,
	isVerifiedDoctor,
	isHighlyRecommended,
	mergeListingReviewPayloads,
	doctorSchedule,
} from "../utils/medicalBrowse.js";
import { setPageMeta, resetPageMeta } from "../utils/pageMeta.js";

// Display-only fallback so the grid isn't empty before the medical listings seed
// runs; these can't be booked (no listingId) until a real provider lists.

const ACCENT = "#2563eb";

function pageShell(isMobile) {
	return {
		flex: 1,
		minHeight: 0,
		overflowY: "auto",
		overflowX: "hidden",
		WebkitOverflowScrolling: "touch",
		overscrollBehavior: "contain",
		paddingLeft: isMobile ? 16 : 108,
		paddingRight: isMobile ? 16 : 48,
		paddingBottom: isMobile ? "calc(28px + env(safe-area-inset-bottom, 0px))" : 32,
	};
}

function backBtnStyle(isMobile) {
	return {
		background: "none",
		border: "none",
		cursor: "pointer",
		fontFamily: "'DM Sans', sans-serif",
		fontSize: 14,
		marginBottom: isMobile ? 16 : 24,
		display: "inline-flex",
		alignItems: "center",
		gap: 6,
		padding: isMobile ? "8px 4px 8px 0" : 0,
		minHeight: 44,
		marginLeft: -4,
	};
}

function fieldStyle(isMobile, extra = {}) {
	return {
		borderRadius: 12,
		padding: isMobile ? "12px 14px" : "11px 14px",
		fontFamily: "'DM Sans', sans-serif",
		fontSize: isMobile ? 16 : 13,
		outline: "none",
		minHeight: isMobile ? 44 : undefined,
		boxSizing: "border-box",
		width: extra.width ?? "100%",
		...extra,
	};
}

// Specialty filter pills live in medicalBrowse.js (Phase 2 — seed-aligned catalog).

function DoctorPhoto({ doctor, size = 56, radius = 14 }) {
	if (doctorPhotoIsUrl(doctor.photo)) {
		return (
			<Avatar
				url={doctor.photo}
				initials={doctor.name}
				size={size}
				alt={doctor.name}
				style={{ borderRadius: radius, background: "#000", flexShrink: 0 }}
			/>
		);
	}
	return (
		<div
			style={{
				width: size,
				height: size,
				borderRadius: radius,
				background: doctor.photo,
				flexShrink: 0,
				overflow: "hidden",
			}}
			role="img"
			aria-label={doctor.name}
		/>
	);
}

function MedicalBookingView({ doctor, mode, onBack, onConfirm }) {
	const { isMobile } = useViewport();
	const today = new Date();
	const dates = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() + i); return d; });
	const [selDate, setSelDate] = useState(null);
	const [selTime, setSelTime] = useState(null);
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState("");
	const [refCode, setRefCode] = useState("");
	const [refApplied, setRefApplied] = useState(false);
	const [refLoading, setRefLoading] = useState(false);
	const [refError, setRefError] = useState(null);
	const [docChat, setDocChat] = useState(false);
	const [docMsg, setDocMsg] = useState("");
	const [docMsgSending, setDocMsgSending] = useState(false);
	const [docMsgSent, setDocMsgSent] = useState(false);
	const [docMsgError, setDocMsgError] = useState("");
	const [availability, setAvailability] = useState(null);
	const [availLoading, setAvailLoading] = useState(false);
	const [availError, setAvailError] = useState(false);
	const payBooking = useBookingPayment();
	const isOnline = mode === "online";
	const leg = doctor[mode];
	const isReal = canBookDoctor(doctor, mode);

	useEffect(() => {
		if (!isReal || !leg?.listingId) {
			setAvailability(null);
			setAvailLoading(false);
			setAvailError(false);
			return;
		}
		let alive = true;
		setAvailLoading(true);
		setAvailError(false);
		getListingAvailability(leg.listingId)
			.then((res) => {
				if (!alive) return;
				setAvailability(parseMedicalAvailability(res));
				setAvailLoading(false);
			})
			.catch(() => {
				if (!alive) return;
				setAvailability(null);
				setAvailError(true);
				setAvailLoading(false);
			});
		return () => { alive = false; };
	}, [isReal, leg?.listingId]);

	const openSlots = useMemo(() => {
		if (!selDate) return [];
		const iso = dayKeyFromDate(selDate);
		const { workHours, workDays } = doctorSchedule(doctor);
		if (!isReal || !availability) {
			return slotsForDate(iso, null, DEFAULT_TIME_SLOTS, workHours, workDays);
		}
		return slotsForDate(iso, availability, DEFAULT_TIME_SLOTS, workHours, workDays);
	}, [selDate, isReal, availability, doctor]);

	async function handleConfirm() {
		setSubmitError("");
		if (!isReal) { setSubmitError(i18n.t("medical.booking.demoDoctorGate")); return; }
		if (!isAuthenticated()) { setSubmitError(i18n.t("medical.booking.loginRequired")); return; }
		if (!selDate || !selTime) { setSubmitError(i18n.t("medical.booking.pickDateTime")); return; }
		const iso = dayKeyFromDate(selDate);
		if (availability && isDateUnavailable(iso, availability)) {
			setSubmitError(i18n.t("medical.booking.dateUnavailable"));
			return;
		}
		const slot = openSlots.find((s) => s.label === selTime);
		if (slot && !slot.available) {
			setSubmitError(i18n.t("medical.booking.slotTaken"));
			return;
		}
		setSubmitting(true);
		try {
			const res = await createBooking({
				booking_listing_id: leg.listingId,
				start_date: iso,
				start_time: medTo24h(selTime),
				notes: `${isOnline ? "Online consultation" : "In-person visit"} — ${doctor.specialty}`,
			});
			const bk = res?.data ?? res;
			if (!bk?.booking_id) { setSubmitError(i18n.t("medical.booking.bookingFailed")); setSubmitting(false); return; }
			const pay = await payBooking(bk.booking_id);
			if (!pay.ok) { setSubmitError(pay.error); setSubmitting(false); return; }
			if (doctor.userId) {
				try {
					await messageUser(doctor.userId, {
						initialMessage: `Hi ${doctor.name ?? "Doctor"}, I just booked a ${mode} appointment with you${selDate ? ` for ${selDate.toLocaleDateString()}` : ""}${selTime ? ` at ${selTime}` : ""}. Looking forward to it!`,
						navigate: false,
						sourceVertical: "medical",
					});
				} catch { /* noop */ }
			}
			onConfirm(bk.booking_id);
		} catch (err) {
			const status = err?.response?.status;
			setSubmitError(err?.response?.data?.message || (status === 409 ? i18n.t("medical.booking.slotTaken") : i18n.t("medical.booking.bookingFailed")));
			setSubmitting(false);
		}
	}

	const fmt = (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

	return (
		<div className="scroll-area" style={pageShell(isMobile)}>
			<div style={{ maxWidth: 680, width: "100%", margin: "0 auto", paddingTop: isMobile ? 16 : 32 }}>
			<button type="button" onClick={onBack} aria-label={i18n.t("medical.backToDoctors")} className="text-text-secondary" style={backBtnStyle(isMobile)}>← {i18n.t("medical.backToDoctors")}</button>
			<div style={{ display: "flex", gap: 16, alignItems: isMobile ? "stretch" : "center", marginBottom: 20, flexDirection: isMobile ? "column" : "row" }}>
				<div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
					<DoctorPhoto doctor={doctor} size={isMobile ? 56 : 64} radius={16} />
					<div style={{ flex: 1, minWidth: 0 }}>
						<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 22 : 24, marginBottom: 2 }}>{doctor.name}</h2>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{doctor.specialty}</p>
					</div>
				</div>
				<div style={{ background: isOnline ? "rgba(37,99,235,0.12)" : "rgba(5,150,105,0.1)", border: `1px solid ${isOnline ? "rgba(37,99,235,0.3)" : "rgba(5,150,105,0.3)"}`, borderRadius: 10, padding: "10px 16px", textAlign: "center", alignSelf: isMobile ? "stretch" : "center", flexShrink: 0 }}>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 2 }}>{isOnline ? i18n.t("medical.booking.online") : i18n.t("medical.booking.inPerson")}</p>
					<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, color: isOnline ? "#60a5fa" : "#059669" }}>{isOnline ? `$${doctor.price}` : i18n.t("medical.booking.free")}</p>
				</div>
			</div>
			{!isOnline && (
				<div style={{ background: "rgba(5,150,105,0.08)", border: "1px solid rgba(5,150,105,0.2)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
					<span style={{ color: "#059669", fontSize: 16, flexShrink: 0 }}>✓</span>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5 }}>{i18n.t("medical.freeConsultBanner")}</p>
				</div>
			)}
			{doctor.bio ? (
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.65, marginBottom: 16 }}>{doctor.bio}</p>
			) : null}
			{doctor.userId && (
			<div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
				<button onClick={() => setDocChat(v => !v)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, background: docChat ? "rgba(37,99,235,0.12)" : "var(--color-surface-raised)", border: `1px solid ${docChat ? "rgba(37,99,235,0.3)" : "var(--color-border)"}`, borderRadius: 10, padding: "10px 18px", minHeight: 44, width: isMobile ? "100%" : undefined, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: docChat ? "#60a5fa" : "var(--color-text-primary)", cursor: "pointer", transition: "all 0.15s" }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
					{docChat ? i18n.t("medical.chat.closeChat") : i18n.t("medical.chat.messageDoctor")}
				</button>
			</div>
			)}
			{docChat && (
				<div className="bg-surface border border-border" style={{ marginBottom: 20, borderRadius: 12, padding: "12px 14px", animation: "fadeUp 0.2s ease both" }}>
					{docMsgSent ? (
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#059669" }}>{i18n.t("medical.chat.messageSent", { name: doctor.name })}</p>
					) : (
						<>
							<textarea value={docMsg} onChange={e => { setDocMsg(e.target.value); setDocMsgError(""); }} placeholder={i18n.t("medical.chat.askPlaceholder", { name: doctor.name })} rows={3}
								className="bg-surface-raised border border-border text-text-primary"
								style={{ width: "100%", boxSizing: "border-box", borderRadius: 8, padding: "9px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 16 : 13, outline: "none", resize: "none", marginBottom: 8 }}
								onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.4)"}
								onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
							{docMsgError && <p role="alert" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 8 }}>{docMsgError}</p>}
							<div style={{ display: "flex", gap: 8 }}>
								<button onClick={() => setDocChat(false)} className="border border-border text-text-secondary" style={{ flex: 1, padding: "8px 0", minHeight: 44, borderRadius: 8, background: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer" }}>{i18n.t("common.cancel")}</button>
								<button onClick={async () => {
									if (!docMsg.trim() || docMsgSending) return;
									setDocMsgSending(true);
									try {
										if (doctor.userId) {
											await messageUser(doctor.userId, {
												initialMessage: docMsg.trim(),
												navigate: false,
												sourceVertical: "medical",
											});
										}
										setDocMsgSent(true);
										setDocMsgError("");
									} catch {
										setDocMsgSent(false);
										setDocMsgError(i18n.t("medical.chat.sendFailed"));
									}
									finally { setDocMsgSending(false); }
								}} style={{ flex: 2, padding: "8px 0", minHeight: 44, borderRadius: 8, border: "none", background: docMsg.trim() ? "#2563eb" : "var(--color-surface-raised)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: docMsg.trim() ? "#fff" : "var(--color-text-muted)", cursor: docMsg.trim() ? "pointer" : "default" }}>
									{docMsgSending ? i18n.t("medical.chat.sending") : i18n.t("medical.chat.send")}
								</button>
							</div>
						</>
					)}
				</div>
			)}
			<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "16px 18px", marginBottom: 24 }}>
				<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 12 }}>{i18n.t("medical.policyTitle")}</p>
				{[
					{ icon: "clock", label: i18n.t("medical.policy.cancellationLabel"), text: i18n.t("medical.policy.cancellationText") },
					{ icon: "list", label: i18n.t("medical.policy.whatToBringLabel"), text: isOnline ? i18n.t("medical.policy.whatToBringOnline") : i18n.t("medical.policy.whatToBringInPerson") },
					{ icon: "lock", label: i18n.t("medical.policy.privacyLabel"), text: i18n.t("medical.policy.privacyText") },
					{ icon: "alert", label: i18n.t("medical.policy.emergencyLabel"), text: i18n.t("medical.policy.emergencyText") },
				].map(p => (
					<div key={p.label} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
						<span aria-hidden="true" style={{ fontSize: 15, flexShrink: 0, marginTop: 1, fontWeight: 700 }}>{p.icon === "alert" ? "!" : "•"}</span>
						<div>
							<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12 }}>{p.label}: </span>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.55 }}>{p.text}</span>
						</div>
					</div>
				))}
			</div>
			<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, marginBottom: 14, textAlign: "center" }}>{i18n.t("common.selectDate")}</p>
			{availLoading && isReal && (
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, textAlign: "center", marginBottom: 10 }}>{i18n.t("medical.booking.loadingAvailability")}</p>
			)}
			{availError && isReal && (
				<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#fbbf24", textAlign: "center", marginBottom: 10 }}>{i18n.t("medical.booking.availabilityFailed")}</p>
			)}
			<div style={{ display: isMobile ? "flex" : "grid", gridTemplateColumns: isMobile ? undefined : "repeat(7, minmax(0, 1fr))", flexWrap: isMobile ? "nowrap" : undefined, overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: isMobile ? "touch" : undefined, scrollbarWidth: "none", gap: 8, marginBottom: 24, paddingBottom: isMobile ? 6 : 0 }}>
				{dates.map((d, i) => {
					const iso = dayKeyFromDate(d);
					const blocked = isReal && availability && isDateUnavailable(iso, availability);
					const selected = selDate && d.toDateString() === selDate.toDateString();
					return (
						<button
							key={i}
							type="button"
							disabled={blocked}
							onClick={() => { if (blocked) return; setSelDate(d); setSelTime(null); }}
							style={{
								background: selected ? "#2563eb" : "var(--color-surface)",
								border: `1px solid ${selected ? "#2563eb" : "var(--color-border)"}`,
								borderRadius: 12,
								padding: isMobile ? "12px 14px" : "10px 8px",
								minHeight: 44,
								minWidth: isMobile ? 118 : 0,
								flexShrink: 0,
								fontFamily: "'DM Sans', sans-serif",
								fontSize: isMobile ? 13 : 12,
								color: blocked ? "var(--color-text-muted)" : (selected ? "#fff" : "var(--color-text-primary)"),
								cursor: blocked ? "not-allowed" : "pointer",
								opacity: blocked ? 0.55 : 1,
								transition: "all 0.15s",
								width: isMobile ? undefined : "100%",
								textAlign: "center",
								whiteSpace: "nowrap",
							}}
						>
							{isMobile
								? `${fmt(d)}${blocked ? " · Unavailable" : ""}`
								: `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getDate()}${blocked ? " · —" : ""}`}
						</button>
					);
				})}
			</div>
			{selDate && (
				<>
					<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, marginBottom: 14, textAlign: "center" }}>{i18n.t("common.selectTime")}</p>
					<div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? "88px" : "100px"}, 1fr))`, gap: 10, marginBottom: 28, justifyContent: "center" }}>
						{openSlots.map((slot) => (
								<button
								key={slot.label}
								type="button"
								disabled={!slot.available}
								aria-pressed={selTime === slot.label}
								aria-label={`${slot.label}${slot.available ? "" : " unavailable"}`}
								onClick={() => { if (!slot.available) return; setSelTime(slot.label); }}
								style={{
									background: selTime === slot.label ? "#2563eb" : "var(--color-surface)",
									border: `1px solid ${selTime === slot.label ? "#2563eb" : "var(--color-border)"}`,
									borderRadius: 10,
									padding: "10px 0",
									minHeight: 44,
									fontFamily: "'DM Sans', sans-serif",
									fontSize: 13,
									color: !slot.available ? "var(--color-text-muted)" : (selTime === slot.label ? "#fff" : "var(--color-text-primary)"),
									cursor: slot.available ? "pointer" : "not-allowed",
									opacity: slot.available ? 1 : 0.45,
									transition: "all 0.15s",
								}}
							>
								{slot.label}
							</button>
						))}
					</div>
				</>
			)}
			{selDate && selTime && (
				<div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 12, width: "100%", maxWidth: 420, margin: "0 auto" }}>
					{isOnline && (
						<div style={{ width: "100%" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 8 }}>{i18n.t("medical.referralOptional")}</p>
							<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8 }}>
								<input value={refCode} onChange={e => { setRefCode(e.target.value); setRefApplied(false); setRefError(null); }} placeholder={i18n.t("discounts.enterCode")} className="bg-surface-raised border border-border text-text-primary" style={fieldStyle(isMobile, { flex: 1, minWidth: 0, width: isMobile ? "100%" : undefined })} />
								<button onClick={async () => { if (!refCode.trim() || refLoading || refApplied) return; setRefLoading(true); setRefError(null); try { await bindCheckoutReferralCode(refCode.trim()); setRefApplied(true); } catch (e) { setRefError(e?.response?.data?.message || "Invalid referral code."); } finally { setRefLoading(false); } }} style={{ padding: "9px 14px", minHeight: 44, background: refApplied ? "rgba(16,185,129,0.15)" : "rgba(37,99,235,0.15)", border: `1px solid ${refApplied ? "rgba(16,185,129,0.35)" : "rgba(37,99,235,0.3)"}`, borderRadius: 9, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: refApplied ? "#10b981" : "#2563eb", cursor: refLoading ? "default" : "pointer", whiteSpace: "nowrap", width: isMobile ? "100%" : undefined }}>{refLoading ? "…" : refApplied ? "✓ Applied" : "Apply"}</button>
							</div>
							{refError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginTop: 6 }}>{refError}</p>}
						</div>
					)}
					{isOnline && isReal && <div style={{ width: "100%" }}><CardPaymentField /></div>}
					{!isReal && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, textAlign: "center" }}>{i18n.t("medical.booking.demoDoctorGate")}</p>}
					<button onClick={handleConfirm} disabled={submitting || !isReal}
						style={{ background: !isReal ? "rgba(37,99,235,0.5)" : (submitting ? "#059669" : "#2563eb"), border: "none", borderRadius: 12, padding: isMobile ? "14px 16px" : "14px 32px", width: "100%", whiteSpace: "normal", lineHeight: 1.35, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#fff", cursor: (submitting || !isReal) ? "default" : "pointer", transition: "background 0.2s" }}>
						{submitting ? "Booking..." : (
							<>
								<div>{isOnline ? `Confirm & Pay $${leg?.price ?? doctor.price}` : "Confirm (Free)"}</div>
								<div style={{ fontSize: 12, fontWeight: 600, opacity: 0.92, marginTop: 4 }}>
									{selDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {selTime}
								</div>
							</>
						)}
					</button>
					{submitError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginTop: 8 }}>{submitError}</p>}
				</div>
			)}
			</div>
		</div>
	);
}

function MedicalConfirmPage({ mode, bookingId, doctor, onDone }) {
	const [showRateModal, setShowRateModal] = React.useState(false);
	const [rating, setRating] = React.useState(0);
	const [ratingComment, setRatingComment] = React.useState("");
	const [rated, setRated] = React.useState(false);
	const [rateBusy, setRateBusy] = React.useState(false);
	const [rateError, setRateError] = React.useState("");
	const modalRef = React.useRef(null);
	const { isMobile } = useViewport();
	const isOnline = mode === "online";

	React.useEffect(() => {
		if (!showRateModal) return undefined;
		const root = modalRef.current;
		const prev = document.activeElement;
		const focusables = () => [...(root?.querySelectorAll("button, textarea, input") || [])].filter((el) => !el.disabled);
		focusables()[0]?.focus();
		function onKey(e) {
			if (e.key === "Escape") {
				e.preventDefault();
				setShowRateModal(false);
				return;
			}
			if (e.key !== "Tab") return;
			const list = focusables();
			if (!list.length) return;
			const i = list.indexOf(document.activeElement);
			if (e.shiftKey && i <= 0) {
				e.preventDefault();
				list[list.length - 1].focus();
			} else if (!e.shiftKey && (i === list.length - 1 || i < 0)) {
				e.preventDefault();
				list[0].focus();
			}
		}
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("keydown", onKey);
			if (prev && typeof prev.focus === "function") prev.focus();
		};
	}, [showRateModal]);

	async function submitRating() {
		if (rating === 0 || rateBusy) return;
		setRateError("");
		if (!bookingId) {
			setRateError("Missing booking — rating isn’t available for this session.");
			return;
		}
		setRateBusy(true);
		try {
			await submitBookingReview(bookingId, { rating, comment: ratingComment.trim() || undefined });
			setShowRateModal(false);
			setRated(true);
		} catch (err) {
			const msg = err?.response?.data?.message || "";
			if (/completed before rating/i.test(msg)) {
				setRateError("Thanks — you can leave a verified rating after your visit is marked complete.");
			} else {
				setRateError(msg || "Couldn’t save your rating. Try again later.");
			}
		} finally {
			setRateBusy(false);
		}
	}

	return (
		<div className="scroll-area" style={{ ...pageShell(isMobile), display: "flex", flexDirection: "column", alignItems: "center" }}>
			<div style={{ width: "100%", maxWidth: 440, margin: "auto 0", paddingTop: isMobile ? 24 : 40, textAlign: "center" }}>
			<div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(5,150,105,0.15)", border: "2px solid #059669", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
				<span style={{ fontSize: 32 }}>✓</span>
			</div>
			<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 26 : 30, marginBottom: 10 }}>{i18n.t("medical.appointmentBooked")}</h2>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 8 }}>{i18n.t("medical.confirmationSaved", { defaultValue: "Your appointment is saved. Find it anytime in Account → Orders." })}</p>
			{isOnline ? (
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 16 }}>{i18n.t("medical.videoConsultationLink", { defaultValue: "Your doctor will send the video-call details in Messages before the visit." })}</p>
			) : (
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 16 }}>
					{doctor?.address
						? i18n.t("medical.directionsWithAddress", { address: doctor.address, defaultValue: `Clinic: ${doctor.address}. Bring a valid health card.` })
						: i18n.t("medical.directionsEmail", { defaultValue: "Bring a valid health card. Clinic details are on the doctor's profile." })}
				</p>
			)}
			<div style={{ background: isOnline ? "rgba(37,99,235,0.08)" : "rgba(5,150,105,0.08)", border: `1px solid ${isOnline ? "rgba(37,99,235,0.2)" : "rgba(5,150,105,0.2)"}`, borderRadius: 10, padding: "12px 24px", marginBottom: 28 }}>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 4 }}>{i18n.t("medical.consultationType")}</p>
				<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, color: isOnline ? "#60a5fa" : "#059669" }}>{isOnline ? i18n.t("medical.onlineVideoCall") : i18n.t("medical.inPersonVisitFree")}</p>
			</div>
			{!rated && <button onClick={() => setShowRateModal(true)} style={{ width: "100%", maxWidth: 320, minHeight: 44, background: "#2563eb", border: "none", borderRadius: 12, padding: "12px 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 10 }}>{i18n.t("medical.rateDoctor")}</button>}
			{rated && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#059669", marginBottom: 10 }}>Thanks for your feedback.</p>}
			<button onClick={onDone} className="bg-surface-raised border border-border text-text-primary" style={{ borderRadius: 12, padding: "12px 32px", minHeight: 44, width: isMobile ? "100%" : undefined, maxWidth: 320, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{i18n.t("common.done")}</button>
			{showRateModal && (
				<div
					role="dialog"
					aria-modal="true"
					aria-labelledby="medical-rate-title"
					style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: isMobile ? "0" : 20 }}
				>
					<div ref={modalRef} className="bg-surface border border-border" style={{ borderRadius: isMobile ? "20px 20px 0 0" : 20, padding: isMobile ? "24px 20px calc(20px + env(safe-area-inset-bottom, 0px))" : 28, width: "100%", maxWidth: 380, animation: "fadeUp 0.25s ease both" }}>
						<h3 id="medical-rate-title" className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{i18n.t("medical.rateDoctorTitle")}</h3>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 18 }}>{i18n.t("medical.howWasAppointment")}</p>
						<div style={{ display: "flex", gap: 8, marginBottom: 18, justifyContent: "center" }}>
							{[1, 2, 3, 4, 5].map((n) => (
								<button key={n} type="button" aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`} onClick={() => setRating(n)} style={{ background: "none", border: "none", cursor: "pointer", padding: 8, minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
									<svg width={30} height={30} viewBox="0 0 24 24" fill={n <= rating ? "#f59e0b" : "none"} stroke={n <= rating ? "#f59e0b" : "var(--color-text-muted)"} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
								</button>
							))}
						</div>
						<textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder={i18n.t("common.optionalComment")} rows={3} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 16 : 13, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 16 }} />
						{rateError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#fbbf24", marginBottom: 12, textAlign: "left" }}>{rateError}</p>}
						<div style={{ display: "flex", gap: 10 }}>
							<button type="button" onClick={() => setShowRateModal(false)} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, padding: "11px 0", minHeight: 44, borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{i18n.t("ondemand.hire.skip")}</button>
							<button type="button" disabled={rating === 0 || rateBusy} onClick={submitRating} style={{ flex: 1, padding: "11px 0", minHeight: 44, background: rating > 0 ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: rating > 0 ? "#fff" : "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: rating > 0 && !rateBusy ? "pointer" : "default" }}>{rateBusy ? "Saving…" : i18n.t("common.submit")}</button>
						</div>
					</div>
				</div>
			)}
			</div>
		</div>
	);
}

function MedicalProfileView({ doctor, onBack, onBook }) {
	const { isMobile } = useViewport();
	const listingIds = [doctor?.online?.listingId, doctor?.inperson?.listingId].filter(Boolean);
	const skipReviews = listingIds.length === 0;
	const [reviewsPayloads, setReviewsPayloads] = useState([]);
	const [loadedKey, setLoadedListingKey] = useState(null);

	useEffect(() => {
		if (skipReviews) return undefined;
		const key = listingIds.join(",");
		let alive = true;
		Promise.all(listingIds.map((id) => getListingReviews(id).catch(() => null)))
			.then((res) => {
				if (!alive) return;
				setReviewsPayloads(res);
				setLoadedListingKey(key);
			});
		return () => { alive = false; };
	}, [listingIds.join(","), skipReviews]);

	const reviewsReady = skipReviews || loadedKey === listingIds.join(",");
	const reviewsLoading = !skipReviews && !reviewsReady;
	const profile = useMemo(() => {
		const base = buildDoctorProfileModel(doctor, null);
		if (skipReviews || !reviewsReady) return base;
		return { ...base, reviewSummary: mergeListingReviewPayloads(reviewsPayloads) };
	}, [doctor, skipReviews, reviewsReady, reviewsPayloads]);

	const summary = profile.reviewSummary;

	return (
		<div className="scroll-area" style={pageShell(isMobile)}>
			<div style={{ maxWidth: 720, width: "100%", margin: "0 auto", paddingTop: isMobile ? 16 : 32 }}>
				<nav aria-label="Breadcrumb" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
					<button type="button" onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", padding: "8px 0", minHeight: 36, font: "inherit" }}>{i18n.t("medical.landingTitle")}</button>
					<span aria-hidden="true"> / </span>
					<span className="text-text-primary">{profile.displayName}</span>
				</nav>
				<button
					type="button"
					onClick={onBack}
					className="text-text-secondary"
					style={backBtnStyle(isMobile)}
				>
					← {i18n.t("medical.backToDoctors")}
				</button>
				<div style={{ display: "flex", gap: 18, alignItems: "flex-start", marginBottom: 20, flexDirection: isMobile ? "column" : "row" }}>
					<DoctorPhoto doctor={doctor} size={isMobile ? 72 : 88} radius={18} />
					<div style={{ flex: 1, minWidth: 0 }}>
						<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
							<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 24 : 28, margin: 0 }}>{profile.displayName}</h2>
						</div>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginTop: 4 }}>
							{profile.specialty}{profile.credentials ? ` · ${profile.credentials}` : ""}
						</p>
						<div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
							<span style={{ color: "#f59e0b", fontSize: 13 }}>★</span>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
								{(summary.reviewCount > 0 ? summary.avgRating : profile.cardRating) ?? "—"}
								{" "}({summary.reviewCount > 0 ? summary.reviewCount : profile.cardReviews})
							</span>
						</div>
					</div>
				</div>
				{profile.bio && (
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.55, marginBottom: 18 }}>{profile.bio}</p>
				)}
				<div style={{ display: "grid", gap: 10, marginBottom: 22 }}>
					{profile.credentials && (
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>
							<strong className="text-text-primary">{i18n.t("medical.credentials")}:</strong> {profile.credentials}
						</p>
					)}
					{profile.language && (
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>
							<strong className="text-text-primary">{i18n.t("medical.languages")}:</strong> {profile.language}
						</p>
					)}
					{profile.address && (
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>
							<strong className="text-text-primary">{i18n.t("medical.clinicAddress")}:</strong> {profile.address}
						</p>
					)}
					{(profile.workHoursFrom || profile.workHoursTo) && (
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>
							<strong className="text-text-primary">{i18n.t("medical.hours")}:</strong> {profile.workHoursFrom || "—"} – {profile.workHoursTo || "—"}
						</p>
					)}
					{profile.acceptsUnder18 && (
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>{i18n.t("medical.seesChildren")}</p>
					)}
					{(profile.insurancePlans?.length || profile.insurance) && (
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>
							<strong className="text-text-primary">{i18n.t("medical.insurance")}:</strong> {profile.insurance || profile.insurancePlans.join(", ")}
						</p>
					)}
				</div>
				<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 28, flexDirection: isMobile ? "column" : "row" }}>
					{(profile.modes || []).includes("inperson") && (
						<button
							type="button"
							onClick={() => onBook(doctor, "inperson")}
							style={{ background: "rgba(5,150,105,0.15)", border: "1px solid rgba(5,150,105,0.3)", borderRadius: 10, padding: "10px 16px", minHeight: 44, width: isMobile ? "100%" : undefined, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#059669", cursor: "pointer" }}
						>
							{i18n.t("medical.inPerson")} · Free
						</button>
					)}
					{(profile.modes || []).includes("online") && (
						<button
							type="button"
							onClick={() => onBook(doctor, "online")}
							style={{ background: "#2563eb", border: "none", borderRadius: 10, padding: "10px 16px", minHeight: 44, width: isMobile ? "100%" : undefined, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}
						>
							Online · ${doctor.price ?? doctor.online?.price ?? 0}
						</button>
					)}
				</div>
				<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 12 }}>
					{i18n.t("medical.verifiedReviews")}
				</h3>
				{reviewsLoading ? (
					<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Loading…</p>
				) : summary.reviews.length === 0 ? (
					<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("medical.noReviewsYet")}</p>
				) : (
					<div style={{ display: "grid", gap: 12 }}>
						{summary.reviews.map((r) => (
							<div key={r.id} className="bg-surface border border-border-subtle" style={{ borderRadius: 12, padding: "14px 16px" }}>
								<div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
									<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13 }}>{r.author}</span>
									<span style={{ color: "#f59e0b", fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{"★".repeat(Math.max(0, Math.min(5, r.rating)))}</span>
								</div>
								{r.body && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0, lineHeight: 1.45 }}>{r.body}</p>}
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function MedicalPage() {
	const { landingTitle } = usePageI18n("medical");
	const categories = useI18nCategoryList(MEDICAL_SPECIALTY_DEFS);
	const { isMobile, isTablet } = useViewport();
	const loading = usePageLoad();
	const [spec, setSpec] = useState("all");
	const [consultType, setConsultType] = useState("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [locationQuery, setLocationQuery] = useState("");
	const [insurancePlan, setInsurancePlan] = useState("all");
	const [sortBy, setSortBy] = useState("relevance");
	const [availableOnDate, setAvailableOnDate] = useState("");
	const [acceptsUnder18, setAcceptsUnder18] = useState(false);
	const [providerGender, setProviderGender] = useState("all");
	const [availById, setAvailById] = useState({});
	const [faqOpen, setFaqOpen] = useState(null);
	const [userGeo, setUserGeo] = useState(null); // { lat, lng }
	const [radiusKm, setRadiusKm] = useState(25);
	const [geoError, setGeoError] = useState("");
	const [medView, setMedView] = useState("grid");
	useEffect(() => { window.dispatchEvent(new CustomEvent("strug:view-change")); }, [medView]);
	const [selectedDoc, setSelectedDoc] = useState(null);
	const [selectedMode, setSelectedMode] = useState(null);
	const [bookingFromProfile, setBookingFromProfile] = useState(false);
	const [confirmBookingId, setConfirmBookingId] = useState(null);
	const catScrollRef = useRef(null);
	const [catScrollState, setCatScrollState] = useState({ atStart: true, atEnd: true });
	const [doctors, setDoctors] = useState([]);
	const [listError, setListError] = useState(false);
	useLayoutEffect(() => {
		const el = catScrollRef.current;
		if (!el) return;
		const update = () => setCatScrollState((prev) => {
			const atStart = el.scrollLeft <= 4;
			const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4;
			return prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd };
		});
		update();
		el.addEventListener("scroll", update, { passive: true });
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
	}, []);
	useEffect(() => {
		const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
		return () => clearTimeout(t);
	}, [searchQuery]);
	useEffect(() => {
		const params = { vertical: "medical", limit: 200 };
		if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
		if (insurancePlan && insurancePlan !== "all") params.insurance_plan = insurancePlan;
		if (userGeo && radiusKm) {
			params.lat = userGeo.lat;
			params.lng = userGeo.lng;
			params.radius_km = radiusKm;
		}
		let alive = true;
		getBookingListings(params).then((res) => {
			if (!alive) return;
			const arr = Array.isArray(res) ? res : (res?.data ?? []);
			const grouped = groupMedicalListings(arr);
			setDoctors(grouped);
			setListError(false);
		}).catch(() => {
			if (!alive) return;
			setListError(true);
		});
		return () => { alive = false; };
	}, [debouncedSearch, userGeo, radiusKm, insurancePlan]);

	useEffect(() => {
		const real = doctors.filter((d) => d.isReal && (d.online?.listingId || d.inperson?.listingId));
		if (!real.length) return undefined;
		let alive = true;
		Promise.all(real.slice(0, 50).map(async (d) => {
			const ids = {
				online: d.online?.listingId || null,
				inperson: d.inperson?.listingId || null,
			};
			const [onlineRes, inpersonRes] = await Promise.all([
				ids.online ? getListingAvailability(ids.online).catch(() => null) : null,
				ids.inperson ? getListingAvailability(ids.inperson).catch(() => null) : null,
			]);
			return [d.id, {
				online: onlineRes ? parseMedicalAvailability(onlineRes) : null,
				inperson: inpersonRes ? parseMedicalAvailability(inpersonRes) : null,
			}];
		})).then((entries) => {
			if (!alive) return;
			setAvailById(Object.fromEntries(entries));
		});
		return () => { alive = false; };
	}, [doctors]);

	const doctorsEnriched = useMemo(
		() => doctors.map((d) => (availById[d.id] ? withNextAvailableFromLegs(d, availById[d.id]) : d)),
		[doctors, availById],
	);

	useEffect(() => {
		const meta = medicalPageMeta({ view: medView, doctor: selectedDoc });
		const canonical = typeof window !== "undefined" ? `${window.location.origin}/medical` : "/medical";
		setPageMeta({
			title: meta.title,
			description: meta.description,
			canonical,
			ogType: "website",
		});
	}, [medView, selectedDoc]);
	useEffect(() => () => resetPageMeta(), []);

	const filtered = useMemo(
		() => sortMedicalDoctors(filterMedicalDoctors(doctorsEnriched, {
			specialtyId: spec,
			consultType: normalizeConsultType(consultType),
			searchQuery,
			locationQuery,
			insurancePlan,
			availableOnDate,
			acceptsUnder18,
			providerGender,
			userLat: userGeo?.lat,
			userLng: userGeo?.lng,
			radiusKm: userGeo ? radiusKm : null,
		}), sortBy === "distance" && !userGeo ? "relevance" : sortBy),
		[doctorsEnriched, spec, consultType, searchQuery, locationQuery, insurancePlan, availableOnDate, acceptsUnder18, providerGender, userGeo, radiusKm, sortBy],
	);

	const faqItems = useMemo(
		() => MEDICAL_FAQ_DEFS.map((f) => ({ q: i18n.t(f.qKey), a: i18n.t(f.aKey) })),
		[],
	);
	const jsonLd = useMemo(() => {
		const canonical = typeof window !== "undefined" ? `${window.location.origin}/medical` : "/medical";
		return [
			buildMedicalJsonLd({ doctors: filtered.filter((d) => d.isReal), canonical }),
			buildMedicalFaqJsonLd(faqItems),
		];
	}, [filtered, faqItems]);

	function requestNearMe() {
		setGeoError("");
		if (!navigator.geolocation) {
			setGeoError("Location is not available in this browser.");
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(pos) => setUserGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
			() => setGeoError("Could not read your location. Check browser permissions."),
			{ enableHighAccuracy: false, timeout: 10000 },
		);
	}

	if (medView === "profile" && selectedDoc) {
		return (
			<MedicalProfileView
				doctor={selectedDoc}
				onBack={() => { setMedView("grid"); setBookingFromProfile(false); }}
				onBook={(doc, mode) => {
					setSelectedDoc(doc);
					setSelectedMode(mode);
					setBookingFromProfile(true);
					setMedView("booking");
				}}
			/>
		);
	}
	if (medView === "booking" && selectedDoc) {
		return (
			<MedicalBookingView
				doctor={selectedDoc}
				mode={selectedMode}
				onBack={() => setMedView(bookingFromProfile && selectedDoc ? "profile" : "grid")}
				onConfirm={(bookingId) => {
					setConfirmBookingId(bookingId ?? null);
					setMedView("confirm");
				}}
			/>
		);
	}
	if (medView === "confirm") {
		return (
			<MedicalConfirmPage
				mode={selectedMode}
				bookingId={confirmBookingId}
				doctor={selectedDoc}
				onDone={() => {
					setMedView("grid");
					setSelectedDoc(null);
					setSelectedMode(null);
					setConfirmBookingId(null);
					setBookingFromProfile(false);
				}}
			/>
		);
	}

	return (
		<div className="scroll-area" style={pageShell(isMobile)}>
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd[0]) }} />
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd[1]) }} />
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", padding: `${isMobile ? 16 : 32}px 0 0` }}>
				<nav aria-label="Breadcrumb" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12, textAlign: "center" }}>
					<span>{i18n.t("medical.landingTitle")}</span>
				</nav>
				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 24 : 28, letterSpacing: "0.03em", marginBottom: 4, textAlign: "center" }}>{landingTitle}</h2>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 12, textAlign: "center" }}>{i18n.t("medical.subtitle")}</p>
				<div role="note" style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 12, padding: "10px 14px", marginBottom: 16, textAlign: "center" }}>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0, lineHeight: 1.5 }}>{i18n.t("medical.emergencyBanner")}</p>
				</div>
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 16, textAlign: "center", lineHeight: 1.5 }}>
					{i18n.t("medical.legalDisclaimer")}
				</p>
				{listError && (
					<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#fbbf24", marginBottom: 16, textAlign: "center" }}>{i18n.t("common.listError.listings")}</p>
				)}
				<div style={{ display: "grid", gridTemplateColumns: isMobile || isTablet ? "1fr" : "1.2fr 1fr auto", gap: 10, marginBottom: 14 }}>
					<input
						type="search"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder={i18n.t("medical.searchPlaceholder")}
						aria-label={i18n.t("medical.searchPlaceholder")}
						className="bg-surface border border-border text-text-primary"
						style={fieldStyle(isMobile)}
					/>
					<input
						type="search"
						value={locationQuery}
						onChange={(e) => setLocationQuery(e.target.value)}
						placeholder={i18n.t("medical.locationPlaceholder")}
						aria-label={i18n.t("medical.locationPlaceholder")}
						className="bg-surface border border-border text-text-primary"
						style={fieldStyle(isMobile)}
					/>
					<div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>
						<button
							type="button"
							onClick={requestNearMe}
							style={{
								padding: "10px 14px",
								minHeight: 44,
								flex: isMobile ? 1 : undefined,
								borderRadius: 12,
								border: `1px solid ${userGeo ? ACCENT : "var(--color-border)"}`,
								background: userGeo ? "#2563eb1a" : "transparent",
								color: userGeo ? "#60a5fa" : "var(--color-text-secondary)",
								fontFamily: "'DM Sans', sans-serif",
								fontSize: 12,
								fontWeight: 700,
								cursor: "pointer",
								whiteSpace: "nowrap",
							}}
						>
							{i18n.t("medical.nearMe")}
						</button>
						{userGeo && (
							<>
								<select
									value={radiusKm}
									onChange={(e) => setRadiusKm(Number(e.target.value))}
									aria-label="Search radius"
									className="bg-surface border border-border text-text-primary"
									style={fieldStyle(isMobile, { width: isMobile ? "100%" : "auto", flex: 1, fontSize: isMobile ? 16 : 12 })}
								>
									{MEDICAL_RADIUS_OPTIONS_KM.map((km) => (
										<option key={km} value={km}>{i18n.t("medical.radiusKm", { km })}</option>
									))}
								</select>
								<button
									type="button"
									onClick={() => setUserGeo(null)}
									className="text-text-muted"
									style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12, minHeight: 44, padding: "0 8px" }}
								>
									Clear
								</button>
							</>
						)}
					</div>
				</div>
				{geoError && (
					<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 12, textAlign: "center" }}>{geoError}</p>
				)}
				<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 16, alignItems: "end" }}>
					<label className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6 }}>
						{i18n.t("medical.insurance")}
						<select
							value={insurancePlan}
							onChange={(e) => setInsurancePlan(e.target.value)}
							aria-label={i18n.t("medical.insurancePlaceholder")}
							className="bg-surface border border-border text-text-primary"
							style={fieldStyle(isMobile, { fontSize: isMobile ? 16 : 12, fontWeight: 600 })}
						>
							{MEDICAL_INSURANCE_OPTIONS.map((opt) => (
								<option key={opt.id} value={opt.id}>{opt.labelKey ? i18n.t(opt.labelKey) : opt.label}</option>
							))}
						</select>
					</label>
					<label className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6 }}>
						{i18n.t("medical.sortLabel")}
						<select
							value={sortBy}
							onChange={(e) => setSortBy(e.target.value)}
							aria-label={i18n.t("medical.sortLabel")}
							className="bg-surface border border-border text-text-primary"
							style={fieldStyle(isMobile, { fontSize: isMobile ? 16 : 12, fontWeight: 600 })}
						>
							{MEDICAL_SORT_IDS.map((id) => (
								<option key={id} value={id}>
									{id === "relevance" ? i18n.t("medical.sortRelevance")
										: id === "rating" ? i18n.t("medical.sortRating")
										: id === "price" ? i18n.t("medical.sortPrice")
										: id === "availability" ? i18n.t("medical.sortAvailability")
										: i18n.t("medical.sortDistance")}
								</option>
							))}
						</select>
					</label>
					<label className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6 }}>
						{i18n.t("medical.availableOn")}
						<input
							type="date"
							value={availableOnDate}
							onChange={(e) => setAvailableOnDate(e.target.value)}
							aria-label={i18n.t("medical.availableOn")}
							className="bg-surface border border-border text-text-primary"
							style={fieldStyle(isMobile, { fontSize: isMobile ? 16 : 12 })}
						/>
					</label>
					<label className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6 }}>
						{i18n.t("medical.providerGender")}
						<select
							value={providerGender}
							onChange={(e) => setProviderGender(e.target.value)}
							aria-label={i18n.t("medical.providerGender")}
							className="bg-surface border border-border text-text-primary"
							style={fieldStyle(isMobile, { fontSize: isMobile ? 16 : 12, fontWeight: 600 })}
						>
							<option value="all">{i18n.t("medical.genderAny")}</option>
							<option value="woman">{i18n.t("medical.genderWoman")}</option>
							<option value="man">{i18n.t("medical.genderMan")}</option>
							<option value="nonbinary">{i18n.t("medical.genderNonbinary")}</option>
						</select>
					</label>
					<label className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, minHeight: 44, paddingBottom: isMobile ? 0 : 8 }}>
						<input type="checkbox" checked={acceptsUnder18} onChange={(e) => setAcceptsUnder18(e.target.checked)} style={{ width: 18, height: 18 }} />
						{i18n.t("medical.seesChildren")}
					</label>
				</div>
				<div style={{ display: "flex", gap: 8, marginBottom: 20, justifyContent: isMobile ? "flex-start" : "center", flexWrap: isMobile ? "nowrap" : "wrap", overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: isMobile ? "touch" : undefined, paddingBottom: isMobile ? 4 : 0 }}>
					{[
						{ id: "all", label: i18n.t("medical.specialties.all", { defaultValue: "All" }) },
						{ id: "online", label: i18n.t("medical.booking.online") },
						{ id: "inperson", label: `${i18n.t("medical.booking.inPerson")} · ${i18n.t("medical.booking.free")}` },
					].map((opt) => (
						<button
							key={opt.id}
							type="button"
							aria-pressed={consultType === opt.id}
							onClick={() => setConsultType(normalizeConsultType(opt.id))}
							style={{
								padding: isMobile ? "10px 16px" : "8px 18px",
								minHeight: 40,
								flexShrink: 0,
								borderRadius: 20,
								border: `1px solid ${consultType === opt.id ? ACCENT : "var(--color-border)"}`,
								background: consultType === opt.id ? "#2563eb1a" : "transparent",
								color: consultType === opt.id ? "#60a5fa" : "var(--color-text-secondary)",
								fontFamily: "'DM Sans', sans-serif",
								fontSize: 13,
								fontWeight: 600,
								cursor: "pointer",
								transition: "all 0.15s",
								whiteSpace: "nowrap",
							}}
						>
							{opt.label}
						</button>
					))}
				</div>
				<div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 28 }}>
					<button type="button" aria-label="Previous specialties" onClick={() => catScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })} className={`border ${catScrollState.atStart ? "bg-surface border-border-subtle text-text-muted" : "bg-surface-raised border-border text-text-primary"}`} style={{ flexShrink: 0, width: isMobile ? 40 : 32, height: isMobile ? 40 : 32, borderRadius: "50%", marginTop: isMobile ? 12 : 16, cursor: catScrollState.atStart ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", transition: "transform 0.12s, background 0.2s" }} onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					</button>
					<div ref={catScrollRef} className="ecom-cat-scroll" style={{ flex: 1, display: "flex", gap: 20, flexWrap: "nowrap", overflowX: "auto", scrollbarWidth: "none", justifyContent: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "center" : "flex-start" }}>
						{categories.map((s, i) => (
							<LeoButton key={s.id} cat={s} active={spec === s.id} onClick={() => setSpec(s.id)} delay={i * 30} />
						))}
					</div>
					<button type="button" aria-label="Next specialties" onClick={() => catScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })} style={{ flexShrink: 0, width: isMobile ? 40 : 32, height: isMobile ? 40 : 32, borderRadius: "50%", marginTop: isMobile ? 12 : 16, background: catScrollState.atEnd ? "var(--color-surface)" : ACCENT, border: `1px solid ${catScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`, color: catScrollState.atEnd ? "var(--color-text-muted)" : "#fff", cursor: catScrollState.atEnd ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", transition: "transform 0.12s, background 0.2s", boxShadow: catScrollState.atEnd ? "none" : "0 2px 14px rgba(37,99,235,0.55)" }} onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</button>
				</div>
			</div>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 18 }}>
				{loading ? Array.from({ length: 8 }).map((_, i) => (
					<div key={i} className="bg-surface border border-border" style={{ borderRadius: 16, padding: 20, animation: `fadeUp 0.3s ease ${i * 40}ms both` }}>
						<div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
							<Skel w={56} h={56} r={14} />
							<div style={{ flex: 1 }}>
								<Skel w="70%" h={14} r={6} style={{ marginBottom: 6 }} />
								<Skel w="50%" h={12} r={6} />
							</div>
						</div>
						<Skel h={36} r={8} />
					</div>
				)) : filtered.length === 0 ? (
					<p className="text-text-muted" style={{ gridColumn: "1 / -1", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 14, padding: "24px 0" }}>
						{doctors.length === 0 && !searchQuery.trim() && insurancePlan === "all" && spec === "all"
							? i18n.t("medical.emptyDirectory", { defaultValue: "No doctors listed yet. Providers can list on Strug to appear here." })
							: i18n.t("medical.noMatchFilters", { defaultValue: "No doctors match these filters." })}
					</p>
				) : filtered.map((doc, i) => {
					return (
					<div key={doc.id}
						className="bg-surface border border-border-subtle"
						style={{ borderRadius: 16, padding: "20px", transition: "border-color 0.15s", animation: `fadeUp 0.35s ease ${i * 40}ms both` }}
						onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-border)"}
						onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border-subtle)"}>
						<div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 12 }}>
							<DoctorPhoto doctor={doc} size={56} radius={14} />
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, margin: 0 }}>{doc.name}</p>
									{isVerifiedDoctor(doc) && (
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(37,99,235,0.12)", color: "#60a5fa", border: "1px solid rgba(37,99,235,0.3)" }}>{i18n.t("medical.verified")}</span>
									)}
									{isHighlyRecommended(doc) && (
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(5,150,105,0.12)", color: "#059669", border: "1px solid rgba(5,150,105,0.3)" }}>{i18n.t("medical.highlyRecommended")}</span>
									)}
								</div>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 4 }}>
									{doc.specialty}{doc.credentials ? ` · ${doc.credentials}` : ""}
								</p>
								{(doc.address || doc.language || doc.distanceKm != null) && (
									<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 4 }}>
										{[
											doc.address,
											doc.language,
											doc.distanceKm != null ? i18n.t("medical.distanceAway", { km: doc.distanceKm.toFixed(1) }) : null,
										].filter(Boolean).join(" · ")}
									</p>
								)}
								{(doc.insurancePlans?.length || doc.insurance) && (
									<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 4 }}>
										{i18n.t("medical.insurance")}: {doc.insurance || doc.insurancePlans.join(", ")}
									</p>
								)}
								<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
									{doc.rating != null ? (
										<>
											<span style={{ color: "#f59e0b", fontSize: 12 }}>★</span>
											<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
												{doc.rating}{doc.reviews > 0 ? ` (${doc.reviews})` : ""}
											</span>
										</>
									) : (
										<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
											{i18n.t("medical.noReviewsYet", { defaultValue: "No reviews yet" })}
										</span>
									)}
								</div>
							</div>
						</div>
						<div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
							{doc.modes.includes("online") && <span style={{ background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.25)", borderRadius: 5, padding: "3px 8px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#60a5fa", fontWeight: 600 }}>Online · ${doc.price}</span>}
							{doc.modes.includes("inperson") && <span style={{ background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.25)", borderRadius: 5, padding: "3px 8px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#059669", fontWeight: 600 }}>In Person · Free</span>}
						</div>
						<div style={{ display: "flex", gap: 8, alignItems: isMobile ? "stretch" : "center", flexWrap: "wrap", flexDirection: isMobile ? "column" : "row" }}>
							<button
								type="button"
								onClick={() => { setBookingFromProfile(false); setSelectedDoc(doc); setMedView("profile"); }}
								className="bg-surface-raised border border-border text-text-primary"
								style={{ borderRadius: 8, padding: "10px 12px", minHeight: 44, width: isMobile ? "100%" : undefined, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
							>
								{i18n.t("medical.viewProfile")}
							</button>
							<span style={{ flex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: doc.nextAvailableLabel ? "#059669" : "var(--color-text-muted)", order: isMobile ? 3 : undefined }}>
								{doc.nextAvailableLabel
									? `${i18n.t("medical.nextAvailable")}: ${doc.nextAvailableLabel}`
									: (doc.available ? i18n.t("medical.availableSoon") : i18n.t("medical.checkAvailability"))}
							</span>
							{doc.modes.length > 1 ? (
								<div style={{ display: "flex", gap: 6, width: isMobile ? "100%" : undefined }}>
									<button type="button" aria-label={`${i18n.t("medical.bookAppointment")} — ${i18n.t("medical.inPerson")}`} onClick={() => { setBookingFromProfile(false); setSelectedDoc(doc); setSelectedMode("inperson"); setMedView("booking"); }}
										style={{ background: "rgba(5,150,105,0.15)", border: "1px solid rgba(5,150,105,0.3)", borderRadius: 8, padding: "10px 12px", minHeight: 44, flex: 1, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "#059669", cursor: "pointer" }}>
										{i18n.t("medical.inPerson")}
									</button>
									<button type="button" aria-label={`${i18n.t("medical.bookAppointment")} — Online`} onClick={() => { setBookingFromProfile(false); setSelectedDoc(doc); setSelectedMode("online"); setMedView("booking"); }}
										style={{ background: ACCENT, border: "none", borderRadius: 8, padding: "10px 12px", minHeight: 44, flex: 1, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "#fff", cursor: "pointer" }}>
										Online
									</button>
								</div>
							) : (
								<button type="button" aria-label={i18n.t("medical.bookAppointment")} onClick={() => { setBookingFromProfile(false); setSelectedDoc(doc); setSelectedMode(doc.modes[0]); setMedView("booking"); }}
									style={{ background: doc.modes[0] === "online" ? ACCENT : "rgba(5,150,105,0.15)", border: doc.modes[0] === "online" ? "none" : "1px solid rgba(5,150,105,0.3)", borderRadius: 8, padding: "10px 14px", minHeight: 44, width: isMobile ? "100%" : undefined, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: doc.modes[0] === "online" ? "#fff" : "#059669", cursor: "pointer" }}>
									Book
								</button>
							)}
						</div>
					</div>
					);
				})}
			</div>
			<div style={{ maxWidth: 720, margin: "0 auto", width: "100%", padding: "8px 0 40px" }}>
				<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 12, textAlign: "center" }}>
					{i18n.t("medical.faqTitle")}
				</h3>
				<div style={{ display: "grid", gap: 8 }}>
					{faqItems.map((item, idx) => (
						<div key={item.q} className="bg-surface border border-border-subtle" style={{ borderRadius: 12, overflow: "hidden" }}>
							<button
								type="button"
								aria-expanded={faqOpen === idx}
								onClick={() => setFaqOpen((open) => (open === idx ? null : idx))}
								className="text-text-primary"
								style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "14px 16px", minHeight: 48, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13 }}
							>
								{item.q}
							</button>
							{faqOpen === idx && (
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.55, margin: "0 16px 14px" }}>{item.a}</p>
							)}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

export { MedicalPage };
