import React, { useState, useEffect, useRef, useLayoutEffect , useMemo } from "react";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import i18n from "../i18n/index.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon } from "../components/icons.jsx";
import { Skel, SkeletonServiceCard, SkeletonCircle, SkeletonHeading } from "../components/skeletons.jsx";
import { LeoButton, ODCategoryBubble, HostListingCTA } from "../components/shared.jsx";
import { getBookingListings, createBooking } from "../api/booking";
import { CardInput, useBookingPayment } from "../components/BookingPayment.jsx";
import { isAuthenticated } from "../store/auth";
import { mediaUrls } from "../utils/mediaUrl";

const LEVEL_COLORS = { "Beginner": "#059669", "Intermediate": "#d97706", "All levels": "#2563eb" };

const LESSON_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#2563eb", match: null },
	{ id: "music", labelKey: "events.categories.music", color: "#7c3aed", match: "Music" },
	{ id: "art", labelKey: "pinboard.categories.art", color: "#db2777", match: "Art" },
	{ id: "category-coding", labelKey: "lessons.categoryCoding", color: "#059669", match: "Coding" },
	{ id: "language", labelKey: "books.language", color: "#0891b2", match: "Language" },
	{ id: "fitness", labelKey: "meet.categories.fitness", color: "#dc2626", match: "Fitness" },
	{ id: "category-cooking", labelKey: "lessons.categoryCooking", color: "#d97706", match: "Cooking" },
	{ id: "photography", labelKey: "learn.categories.photography", color: "#ec4899", match: "Photography" },
	{ id: "business", labelKey: "learn.categories.business", color: "#65a30d", match: "Business" },
	{ id: "category-math", labelKey: "lessons.categoryMath", color: "#f59e0b", match: "Math" },
];


const LESSON_TIME_SLOTS = ["9:00 AM", "10:00 AM", "11:00 AM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM"];

function LessonCard({ lesson, delay, onClick }) {
	const [hov, setHov] = useState(false);
	return (
		<div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} className={`bg-surface ${hov ? "border border-border" : "border border-border-subtle"}`} style={{
			width: "100%", borderRadius: 16, overflow: "hidden", cursor: "pointer",
			transform: hov ? "translateY(-4px)" : "none",
			boxShadow: hov ? "0 16px 48px var(--color-shadow)" : "0 2px 12px var(--color-shadow)",
			transition: "all 0.2s", animation: `fadeUp 0.35s ease ${delay}ms both`,
		}}>
			{/* Thumbnail */}
			<div style={{ width: "100%", height: 160, background: lesson.thumb, position: "relative" }}>
				{/* Level badge — white text sits on a brand-colored chip, not theme-dependent */}
				<div style={{ position: "absolute", bottom: 10, left: 10, background: LEVEL_COLORS[lesson.level] + "cc", backdropFilter: "blur(6px)", borderRadius: 5, padding: "3px 8px" }}>
					<span style={{ fontSize: 10, fontWeight: 600, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{lesson.level}</span>
				</div>
				{/* Free badge — white text on solid brand-green chip, not theme-dependent */}
				{lesson.free && (
					<div style={{ position: "absolute", top: 10, right: 10, background: "#059669", borderRadius: 5, padding: "3px 8px" }}>
						<span style={{ fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("meet.free")}</span>
					</div>
				)}
			</div>
			{/* Info */}
			<div style={{ padding: "12px 14px 14px" }}>
				<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{lesson.title}</p>
				{/* Instructor */}
				<div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
					<div style={{ width: 22, height: 22, borderRadius: "50%", background: lesson.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", fontFamily: "'Barlow Condensed', sans-serif", flexShrink: 0 }}>{lesson.avatar}</div>
					<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lesson.instructor}</span>
				</div>
				{/* Duration + lessons */}
				<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
					<span className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{lesson.duration}</span>
					<span className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>·</span>
					<span className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{lesson.lessons} lessons</span>
				</div>
				{/* Price */}
				<span style={{ fontSize: 16, fontWeight: 700, color: lesson.free ? "#059669" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif" }}>{lesson.price}</span>
			</div>
		</div>
	);
}

function LessonConfirmPage({ lesson, mode, selDate, selTime, onDone }) {
	const [showRateModal, setShowRateModal] = React.useState(false);
	const [rating, setRating] = React.useState(0);
	const [ratingComment, setRatingComment] = React.useState("");
	const [rated, setRated] = React.useState(false);
	return (
		<>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
				<div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(5,150,105,0.15)", border: "2px solid #059669", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
					<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				</div>
				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 32, marginBottom: 8 }}>{lesson.free ? i18n.t("enrolled") : i18n.t("paymentSuccess")}</h2>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 6, maxWidth: 440 }}>{lesson.title}</p>
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 6 }}>with {lesson.instructor}</p>
				{mode === "inperson" && selDate && selTime && (
					<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#60a5fa", marginBottom: 6 }}>
						📅 {selDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at {selTime}
					</p>
				)}
				{mode === "online" && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#60a5fa", marginBottom: 6 }}>📺 Access added to your account — watch anytime.</p>}
				{!rated && (
					<button onClick={() => setShowRateModal(true)} style={{ marginTop: 28, background: "#2563eb", border: "none", borderRadius: 12, padding: "12px 32px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>{i18n.t("lessons.rateInstructor")}</button>
				)}
				<button onClick={onDone} style={{ marginTop: rated ? 28 : 12, background: rated ? "#2563eb" : "var(--color-surface-raised)", border: rated ? "none" : "1px solid var(--color-border)", borderRadius: 12, padding: "12px 32px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>{i18n.t("lessons.continueBrowsing")}</button>
			</div>
			{showRateModal && (
				// Modal dimmer scrim — stays a fixed dark overlay in both themes, consistent with the same pattern elsewhere (e.g. Ecommerce.jsx rating modal).
				<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
					<div className="bg-surface border border-border" style={{ borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, animation: "fadeUp 0.25s ease both" }}>
						<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>Rate Your Instructor</h3>
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
							<button onClick={() => setShowRateModal(false)} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, padding: "11px 0", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{i18n.t("ondemand.hire.skip")}</button>
							<button disabled={rating === 0} onClick={() => { setShowRateModal(false); setRated(true); }} style={{ flex: 1, padding: "11px 0", background: rating > 0 ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: rating > 0 ? "#fff" : "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: rating > 0 ? "pointer" : "default" }}>{i18n.t("common.submit")}</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}

function LessonDetailPage({ lesson, onBack }) {
	const { isMobile } = useViewport();
	const [mode, setMode] = useState("online"); // "online" | "inperson"
	const [selDate, setSelDate] = useState(null);
	const [selTime, setSelTime] = useState(null);
	const [enrolling, setEnrolling] = useState(false);
	const [enrolled, setEnrolled] = useState(false);
	const [enrollError, setEnrollError] = useState(null);
	const payBooking = useBookingPayment();
	const rating = (4.5 + (lesson.title.length % 7) * 0.07).toFixed(1);
	const ratingCount = 200 + (lesson.title.length * 17) % 800;
	const students = 1000 + (lesson.title.length * 31) % 8000;
	const today = new Date();
	const dates = Array.from({ length: 14 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() + i + 1); return d; });
	const canEnroll = mode === "online" || (selDate && selTime);
	const levelColor = LEVEL_COLORS[lesson.level] ?? "#2563eb";

	if (enrolled) return <LessonConfirmPage lesson={lesson} mode={mode} selDate={selDate} selTime={selTime} onDone={onBack} />;

	return (
		<div style={{ flex: 1, overflowY: "auto" }}>
			{/* Banner — floats over the lesson.thumb photo/gradient, so the back button and chips
			    stay hardcoded dark/white regardless of theme for legibility, same reasoning as
			    Hub.jsx's hero-photo overlay. */}
			<div style={{ height: 220, background: lesson.thumb, position: "relative", flexShrink: 0 }}>
				<button onClick={onBack} style={{ position: "absolute", top: 18, left: isMobile ? 18 : 126, background: "rgba(0,0,0,0.55)", border: "none", borderRadius: 8, padding: "8px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#fff", cursor: "pointer" }}>← Back</button>
				{lesson.free && <div style={{ position: "absolute", top: 18, right: 18, background: "#059669", borderRadius: 8, padding: "5px 12px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: "#fff" }}>{i18n.t("meet.free")}</div>}
				<div style={{ position: "absolute", bottom: 18, left: isMobile ? 18 : 108, display: "flex", alignItems: "center", gap: 8 }}>
					<div style={{ background: levelColor + "cc", backdropFilter: "blur(6px)", borderRadius: 6, padding: "4px 10px" }}>
						<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: isMobile ? 11 : 13, color: "#fff" }}>{lesson.level}</span>
					</div>
					<div style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", borderRadius: 6, padding: "4px 10px" }}>
						<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 11 : 13, color: "rgba(255,255,255,0.8)" }}>{lesson.category}</span>
					</div>
				</div>
			</div>
			{/* Content */}
			<div style={{ paddingTop: 28, paddingBottom: 24, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 40, display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
				{/* Left */}
				<div style={{ flex: 2, minWidth: 280 }}>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, letterSpacing: "0.02em", marginBottom: 10, lineHeight: 1.2 }}>{lesson.title}</h1>
					{/* Instructor row */}
					<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
						<div style={{ width: 36, height: 36, borderRadius: "50%", background: lesson.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff", fontFamily: "'Barlow Condensed', sans-serif", flexShrink: 0 }}>{lesson.avatar}</div>
						<div>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>{lesson.instructor}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("lessons.instructor")}</p>
						</div>
					</div>
					{/* Rating */}
					<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--color-border-subtle)" }}>
						<div style={{ display: "flex", gap: 1 }}>{[1,2,3,4,5].map(s => <span key={s} style={{ color: s <= Math.round(rating) ? "#f59e0b" : "var(--color-text-muted)", fontSize: 13 }}>★</span>)}</div>
						<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13 }}>{rating}</span>
						<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>({ratingCount.toLocaleString()} reviews)</span>
						<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>· {students.toLocaleString()} students</span>
					</div>
					{/* Mode toggle */}
					<div style={{ marginBottom: 20 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 10, letterSpacing: "0.05em", textTransform: "uppercase" }}>{i18n.t("lessons.lessonFormat")}</p>
						<div className="bg-surface" style={{ display: "flex", borderRadius: 12, padding: 4, gap: 4, width: "fit-content" }}>
							{[{ id: "online", label: i18n.t("lessons.online"), sub: "Watch anytime" }, { id: "inperson", label: i18n.t("lessons.inPerson"), sub: "Live sessions" }].map(m => (
								<button key={m.id} onClick={() => setMode(m.id)} style={{ padding: "8px 20px", borderRadius: 10, border: "none", cursor: "pointer", background: mode === m.id ? "rgba(37,99,235,0.3)" : "transparent", outline: mode === m.id ? "1px solid rgba(37,99,235,0.5)" : "none", transition: "all 0.15s" }}>
									{/* Selected state sits on a brand-tinted pill, so its text stays hardcoded white; unselected sits on the neutral surface above and tokenizes. */}
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: mode === m.id ? "#fff" : "var(--color-text-secondary)", marginBottom: 1 }}>{m.label}</p>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: mode === m.id ? "rgba(255,255,255,0.5)" : "var(--color-text-muted)" }}>{m.sub}</p>
								</button>
							))}
						</div>
					</div>
					{/* Course highlights */}
					<div style={{ marginBottom: 24 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 12, letterSpacing: "0.05em", textTransform: "uppercase" }}>{i18n.t("learn.whatYouLearn")}</p>
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
							{[`${lesson.lessons} lessons (${lesson.duration})`, `${lesson.level} difficulty`, "Certificate on completion", "Lifetime access", "Mobile & desktop", "Q&A support included"].map((h, i) => (
								<div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
									<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{h}</span>
								</div>
							))}
						</div>
					</div>
					{/* In-person scheduling */}
					{mode === "inperson" && (
						<div>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 12, letterSpacing: "0.05em", textTransform: "uppercase" }}>{i18n.t("lessons.chooseDate")}</p>
							<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
								{dates.slice(0, 8).map((d, i) => {
									const isSelected = selDate && d.toDateString() === selDate.toDateString();
									return (
										<button key={i} onClick={() => setSelDate(d)} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${isSelected ? "#2563eb" : "var(--color-border)"}`, background: isSelected ? "rgba(37,99,235,0.2)" : "var(--color-surface)", cursor: "pointer", transition: "all 0.15s" }}>
											<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, color: isSelected ? "#93c5fd" : "var(--color-text-primary)", marginBottom: 1 }}>{d.toLocaleDateString("en-US", { weekday: "short" })}</p>
											<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: isSelected ? "rgba(147,197,253,0.7)" : "var(--color-text-secondary)" }}>{d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
										</button>
									);
								})}
							</div>
							{selDate && (
								<>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 10, letterSpacing: "0.05em", textTransform: "uppercase" }}>{i18n.t("lessons.chooseTime")}</p>
									<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
										{LESSON_TIME_SLOTS.map(t => (
											<button key={t} onClick={() => setSelTime(t)} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${selTime === t ? "#2563eb" : "var(--color-border)"}`, background: selTime === t ? "rgba(37,99,235,0.2)" : "var(--color-surface)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: selTime === t ? "#93c5fd" : "var(--color-text-secondary)", transition: "all 0.15s" }}>{t}</button>
										))}
									</div>
								</>
							)}
						</div>
					)}
				</div>
				{/* Right: booking card */}
				<div style={{ ...(isMobile ? { width: "100%", maxWidth: "100%" } : { flex: 1, minWidth: 240, maxWidth: 300, position: "sticky", top: 20 }) }}>
					<div className="bg-surface-raised border border-border" style={{ borderRadius: 18, padding: "22px" }}>
						<div style={{ marginBottom: 16 }}>
							{lesson.free ? (
								<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, color: "#059669" }}>{i18n.t("lessons.free")}</p>
							) : (
								<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30 }}>{lesson.price}</p>
							)}
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{mode === "online" ? "One-time purchase · lifetime access" : "Per session"}</p>
						</div>
						{mode === "inperson" && selDate && selTime && (
							<div style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 2 }}>{i18n.t("lessons.yourSession")}</p>
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#60a5fa" }}>{selDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at {selTime}</p>
							</div>
						)}
						{!lesson.free && canEnroll && (
							<div style={{ marginBottom: 12 }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{i18n.t("common.paymentMethod")}</p>
								<CardInput />
							</div>
						)}
						<button
							onClick={async () => {
								if (!canEnroll || enrolling) return;
								setEnrollError(null);
								if (!isAuthenticated()) { setEnrollError("Please log in to book"); return; }
								setEnrolling(true);
								try {
									const res = await createBooking({ booking_listing_id: lesson.id, start_date: selDate ? selDate.toISOString().slice(0,10) : undefined, start_time: selTime || undefined, guests: 1, notes: mode ? `Mode: ${mode}` : undefined });
									const booking = res?.data ?? res;
									// Paid lessons charge the card; free lessons skip payment.
									if (!lesson.free) {
										const pay = await payBooking(booking?.booking_id);
										if (!pay.ok) { setEnrollError(pay.error); setEnrolling(false); return; }
									}
									setEnrolled(true);
								} catch (err) {
									const status = err?.response?.status;
									setEnrollError(err?.response?.data?.message || (status === 409 ? "This lesson is fully booked." : status === 401 ? "Please log in to book" : "Could not complete enrollment. Please try again."));
								} finally {
									setEnrolling(false);
								}
							}}
							style={{ width: "100%", background: enrolling ? "#059669" : canEnroll ? "#2563eb" : "var(--color-surface)", border: "none", borderRadius: 12, padding: "13px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: canEnroll ? "#fff" : "var(--color-text-muted)", cursor: canEnroll ? "pointer" : "default", transition: "all 0.2s", marginBottom: 10 }}>
							{enrolling ? "Processing..." : canEnroll ? (lesson.free ? "Enroll for Free" : `Enroll — ${lesson.price}`) : "Select a date & time"}
						</button>
						{enrollError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 10, textAlign: "center" }}>{enrollError}</p>}
						<div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 14 }}>
							{["30-day money-back guarantee", "Access on all devices", "Certificate of completion"].map((t, i) => (
								<div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
									<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
									<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{t}</span>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function LessonsPage() {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("lessons");
	const categories = useI18nCategoryList(LESSON_CATEGORY_DEFS);
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [activeCategory, setActiveCategory] = useState("all");
	const [query, setQuery] = useState("");
	const [lessonView, setLessonView] = useState("grid");
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [lessonView]);
	const [selectedLesson, setSelectedLesson] = useState(null);
	const catScrollRef = useRef(null);
	const [catScrollState, setCatScrollState] = useState({ atStart: true, atEnd: true });
	const [lessonItems, setLessonItems] = useState([]);
	useLayoutEffect(() => {
		const el = catScrollRef.current;
		if (!el) return;
		const update = () => setCatScrollState(prev => { const atStart = el.scrollLeft <= 4, atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4; return prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }; });
		update();
		el.addEventListener("scroll", update, { passive: true });
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
	}, [lessonView]);
	const loadLessons = React.useCallback(() => {
		getBookingListings({ vertical: 'lesson' }).then(res => {
			const arr = Array.isArray(res) ? res : (res?.data ?? []);
			if (arr.length) setLessonItems(arr.map(l => {
				const a = l.attributes ?? {};
				const imgs = mediaUrls(l.images);
				const price = Number(l.price) || 0;
				const dur = a.duration_min != null ? Number(a.duration_min) : null;
				const name = l.title || 'Lesson';
				const instructor = a.instructor ?? 'Instructor';
				return {
					id: l.booking_listing_id,
					title: name,
					name,
					instructor,
					avatar: (instructor || 'I')[0].toUpperCase(),
					avatarColor: '#2563eb',
					duration: dur != null ? `${Math.floor(dur / 60)}h ${dur % 60}m` : '1h 0m',
					lessons: 1,
					price: price ? `$${price}` : 'Free',
					free: !price,
					level: a.level ?? 'All levels',
					category: a.subject ?? a.category ?? 'General',
					subject: a.subject ?? null,
					location: l.location || '',
					description: l.description ?? null,
					image: imgs[0] ?? null,
					images: imgs,
					thumb: imgs[0] ? `url(${imgs[0]}) center/cover` : 'linear-gradient(135deg, #1e3a5f, #0f2744)',
					hostId: l.owner_id ?? null,
				};
			}));
		}).catch(() => {});
	}, []);
	useEffect(() => { loadLessons(); }, [loadLessons]);
	// Category state holds the lowercase def id; match against each item's canonical category
	// via the def's `match` value (matchesCategory treats "all" as show-everything).
	const filtered = lessonItems.filter(l => matchesCategory(activeCategory, l.category, categories));

	if (lessonView === "detail" && selectedLesson) return <LessonDetailPage lesson={selectedLesson} onBack={() => setLessonView("grid")} />;

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", width: "100%" }}>
				<div style={{ padding: "28px 0 20px" }}>
					<SkeletonHeading />
					<div style={{ display: "flex", gap: 20, margin: "16px 0 28px" }}>
						{[...Array(6)].map((_,i) => <SkeletonCircle key={i} />)}
					</div>
				</div>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
					{[...Array(6)].map((_,i) => <SkeletonServiceCard key={i} />)}
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", width: "100%", overflow: "hidden" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center", marginBottom: 20 }}>{landingTitle}</h1>
					<div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
						<HostListingCTA vertical="lesson" label={t("hostListing.lesson")} onCreated={loadLessons} />
					</div>
					<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
						<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
							<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={20} /></div>
							<input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} />
						</div>
					</div>
				</div>
				<div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 28, animation: "fadeUp 0.35s ease 60ms both" }}>
					<button
						onClick={() => catScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })}
						className={catScrollState.atStart ? "bg-surface border border-border-subtle text-text-muted" : "bg-surface-raised border border-border text-text-primary"}
						style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, cursor: catScrollState.atStart ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", transition: "transform 0.12s, background 0.2s" }}
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
						style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: catScrollState.atEnd ? "var(--color-surface)" : "#2563eb", border: `1px solid ${catScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`, color: catScrollState.atEnd ? "var(--color-text-muted)" : "#fff", cursor: catScrollState.atEnd ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", transition: "transform 0.12s, background 0.2s", boxShadow: catScrollState.atEnd ? "none" : "0 2px 14px rgba(37,99,235,0.55)" }}
						onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
					>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</button>
				</div>
				<div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }}>
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: isMobile ? 12 : 20 }}>
						{filtered.map((lesson, i) => (
							<LessonCard key={lesson.title} lesson={lesson} delay={i * 40} onClick={() => { setSelectedLesson(lesson); setLessonView("detail"); }} />
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

export { LessonsPage };
