import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from "react";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { LearnIcon, SearchIcon, StarIcon } from "../components/icons.jsx";
import { Skel, SkeletonServiceCard, SkeletonProductCard, SkeletonCircle, SkeletonHeading } from "../components/skeletons.jsx";
import { LeoButton, ODCategoryBubble } from "../components/shared.jsx";

const LEARN_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#2563eb", match: null },
	{ id: "technology", labelKey: "learn.categories.technology", color: "#7c3aed", match: "Technology" },
	{ id: "business", labelKey: "learn.categories.business", color: "#059669", match: "Business" },
	{ id: "design", labelKey: "learn.categories.design", color: "#db2777", match: "Design" },
	{ id: "finance", labelKey: "automotive.finance", color: "#d97706", match: "Finance" },
	{ id: "marketing", labelKey: "learn.categories.marketing", color: "#0891b2", match: "Marketing" },
	{ id: "photography", labelKey: "learn.categories.photography", color: "#65a30d", match: "Photography" },
	{ id: "music", labelKey: "events.categories.music", color: "#f59e0b", match: "Music" },
];

const LEARN_COURSES = [
	{ title: "Complete Python Bootcamp",         instructor: "James K.",  students: "124K", rating: 4.8, price: 89,  thumb: "linear-gradient(135deg, #1e3a5f, #0f2744)",  category: "Technology" },
	{ title: "UI/UX Design Masterclass",         instructor: "Sara M.",   students: "87K",  rating: 4.9, price: 79,  thumb: "linear-gradient(135deg, #2a1a3a, #1a0f2a)",  category: "Design" },
	{ title: "Financial Freedom: Investing 101", instructor: "Carlos R.", students: "56K",  rating: 4.7, price: 59,  thumb: "linear-gradient(135deg, #2a1a0a, #1c1006)",  category: "Finance" },
	{ title: "Digital Marketing Pro",            instructor: "Aisha T.",  students: "93K",  rating: 4.8, price: 69,  thumb: "linear-gradient(135deg, #0a2a3a, #061c28)",  category: "Marketing" },
	{ title: "React & Next.js Full Stack",       instructor: "Dave W.",   students: "211K", rating: 4.9, price: 99,  thumb: "linear-gradient(135deg, #1a2a0a, #101c06)",  category: "Technology" },
	{ title: "Photography for Beginners",        instructor: "Mia L.",    students: "41K",  rating: 4.6, price: 49,  thumb: "linear-gradient(135deg, #2a0a1a, #1c0610)",  category: "Photography" },
	{ title: "Brand Strategy & Identity",        instructor: "Noah B.",   students: "38K",  rating: 4.7, price: 64,  thumb: "linear-gradient(135deg, #0f1f3a, #081428)",  category: "Business" },
	{ title: "Music Production in Ableton",      instructor: "Kai S.",    students: "62K",  rating: 4.8, price: 74,  thumb: "linear-gradient(135deg, #1a3a2a, #0d2218)",  category: "Music" },
];

function LearnPage() {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("learn");
	const categories = useI18nCategoryList(LEARN_CATEGORY_DEFS);
const { isMobile } = useViewport();
	const [activeCategory, setActiveCategory] = useState("all");
	const loading = usePageLoad();

	const [query, setQuery] = useState("");
	const [clickedCourse, setClickedCourse] = useState(null);
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
	}, [clickedCourse]);
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [clickedCourse]);

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ width: "100%" }}>
				<div style={{ padding: "28px 0 16px" }}><SkeletonHeading /></div>
				<Skel w="100%" h={42} r={12} style={{ marginBottom: 16 }} />
				<div style={{ display: "flex", gap: 20, marginBottom: 28 }}>
					{[...Array(8)].map((_,i) => <SkeletonCircle key={i} />)}
				</div>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
					{[...Array(6)].map((_,i) => <SkeletonProductCard key={i} w={260} imgH={140} />)}
				</div>
			</div>
		</div>
	);

	const filtered = LEARN_COURSES.filter(c => {
		const matchCat = matchesCategory(activeCategory, c.category, categories);
		const matchQ = !query || c.title.toLowerCase().includes(query.toLowerCase()) || c.instructor.toLowerCase().includes(query.toLowerCase());
		return matchCat && matchQ;
	});

	if (clickedCourse) {
		const COURSE_OUTCOMES = [
			t("learn.outcomeMaster", { category: clickedCourse.category }),
			t("learn.outcomeProjects"),
			t("learn.outcomeCareer"),
			t("learn.outcomeCertificate"),
			t("learn.outcomeLifetime"),
			t("learn.outcomePractitioner"),
		];
		const COURSE_MODULES = [
			{ titleKey: "learn.modGettingStarted", lessons: 5,  duration: "45 min"  },
			{ titleKey: "learn.modCoreFundamentals", lessons: 8,  duration: "1h 20min" },
			{ titleKey: "learn.modHandsOn", lessons: 11, duration: "2h 05min" },
			{ titleKey: "learn.modAdvanced", lessons: 9,  duration: "1h 50min" },
			{ titleKey: "learn.modCareer", lessons: 4,  duration: "32 min"  },
		];
		const totalLessons = COURSE_MODULES.reduce((s, m) => s + m.lessons, 0);
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
				<div style={{ width: "100%", paddingBottom: 24 }}>
					<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
						<button onClick={() => setClickedCourse(null)} className="text-text-secondary" style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer", marginBottom: 24, padding: 0 }}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
							{t("learn.backToLearn")}
						</button>
						{/* Banner — the thumb is a decorative color gradient with a dark scrim for the
						    category badge text to stay legible, same treatment as Hub's photo cards.
						    Stays dark regardless of theme. */}
						<div style={{ height: 220, borderRadius: 18, background: clickedCourse.thumb, marginBottom: 28, position: "relative", overflow: "hidden" }}>
							<div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 40%, rgba(10,10,14,0.88))" }} />
							<div style={{ position: "absolute", bottom: 22, left: 28 }}>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: "#2563eb", background: "rgba(37,99,235,0.18)", borderRadius: 6, padding: "3px 10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>{clickedCourse.category}</span>
							</div>
						</div>
						{/* Title + meta */}
						<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(26px, 3vw, 40px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10 }}>{clickedCourse.title}</h1>
						<div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginBottom: 20 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
								<div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(37,99,235,0.18)", border: "1.5px solid rgba(37,99,235,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 11, color: "#60a5fa" }}>{clickedCourse.instructor.charAt(0)}</div>
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{clickedCourse.instructor}</span>
							</div>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("learn.ratingLabel", { rating: clickedCourse.rating })}</span>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("learn.studentsCount", { count: clickedCourse.students })}</span>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("learn.lessonsCount", { count: totalLessons })}</span>
						</div>
						{/* Enroll CTA */}
						<div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 36, padding: "18px 22px", borderRadius: 14, background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.2)" }}>
							<div style={{ flex: 1 }}>
								<div className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 32, letterSpacing: "0.02em" }}>${clickedCourse.price}</div>
								<div className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{t("learn.oneTimePayment")}</div>
							</div>
							<button style={{ padding: "12px 32px", borderRadius: 12, background: "#2563eb", border: "none", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, cursor: "pointer", boxShadow: "0 4px 20px rgba(37,99,235,0.4)" }}>{t("learn.enrollNow")}</button>
						</div>
						{/* What you'll learn */}
						<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>{t("learn.whatYouLearn")}</p>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10, marginBottom: 36 }}>
							{COURSE_OUTCOMES.map((outcome, i) => (
								<div key={i} className="bg-surface border border-border-subtle" style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 10 }}>
									<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><polyline points="20 6 9 17 4 12"/></svg>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5 }}>{outcome}</span>
								</div>
							))}
						</div>
						{/* Curriculum */}
						<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>{t("learn.courseCurriculum")}</p>
						<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
							{COURSE_MODULES.map((mod, i) => (
								<div key={i} className="bg-surface border border-border-subtle" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderRadius: 10, animation: `fadeUp 0.35s ease ${i * 50}ms both` }}>
									<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
										<div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(37,99,235,0.1)", border: "1.5px solid rgba(37,99,235,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 13, color: "#2563eb", flexShrink: 0 }}>{i + 1}</div>
										<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14 }}>{t(mod.titleKey)}</span>
									</div>
									<div style={{ display: "flex", gap: 14, flexShrink: 0 }}>
										<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{t("learn.lessonDuration", { count: mod.lessons })}</span>
										<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{mod.duration}</span>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1060, margin: "0 auto", width: "100%", overflow: "hidden" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center", marginBottom: 20}}>{landingTitle}</h1>
					<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
						<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
							<div className="text-text-secondary" style={{ flexShrink: 0 }}><SearchIcon s={20} /></div>
							<input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} />
						</div>
					</div>
				</div>
				<div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 28, animation: "fadeUp 0.35s ease 60ms both", flexShrink: 0 }}>
					<button
						onClick={() => catScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })}
						className={catScrollState.atStart ? "border border-border-subtle text-text-muted" : "border border-border text-text-primary"}
						style={{
							flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16,
							background: catScrollState.atStart ? "var(--color-surface)" : "var(--color-surface-raised)",
							cursor: catScrollState.atStart ? "default" : "pointer",
							display: "flex", alignItems: "center", justifyContent: "center",
							visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible",
							pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto",
							transition: "transform 0.12s, background 0.2s, box-shadow 0.15s",
						}}
						onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; e.currentTarget.style.background = catScrollState.atStart ? "var(--color-surface-raised)" : "var(--color-border)"; }}
						onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = catScrollState.atStart ? "var(--color-surface)" : "var(--color-surface-raised)"; }}
						onMouseDown={e => { e.currentTarget.style.transform = "scale(0.88)"; }}
						onMouseUp={e => { e.currentTarget.style.transform = "scale(1.15)"; }}
					>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					</button>
					<div ref={catScrollRef} className="ecom-cat-scroll" style={{ flex: 1, display: "flex", gap: 20, flexWrap: "nowrap", overflowX: "auto", scrollbarWidth: "none", justifyContent: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "center" : "flex-start" }}>
						{categories.map((cat, i) => (
							<LeoButton key={cat.id} cat={cat} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 30} />
						))}
					</div>
					<button
						onClick={() => catScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
						style={{
							flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16,
							background: catScrollState.atEnd ? "var(--color-surface)" : "#2563eb",
							border: `1px solid ${catScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`,
							color: catScrollState.atEnd ? "var(--color-text-muted)" : "#fff",
							cursor: catScrollState.atEnd ? "default" : "pointer",
							display: "flex", alignItems: "center", justifyContent: "center",
							visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible",
							pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto",
							transition: "transform 0.12s, background 0.2s, box-shadow 0.15s",
						}}
						onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; e.currentTarget.style.background = catScrollState.atEnd ? "var(--color-surface-raised)" : "rgba(37,99,235,0.8)"; }}
						onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = catScrollState.atEnd ? "var(--color-surface)" : "#2563eb"; }}
						onMouseDown={e => { e.currentTarget.style.transform = "scale(0.88)"; }}
						onMouseUp={e => { e.currentTarget.style.transform = "scale(1.15)"; }}
					>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</button>
				</div>
				<div style={{ flex: 1, paddingBottom: 24 }}>
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(260px, 1fr))", gap: isMobile ? 12 : 20 }}>
						{filtered.map((course, i) => (
							<div key={course.title} onClick={() => setClickedCourse(course)} className="bg-surface" style={{ borderRadius: 16, overflow: "hidden", cursor: "pointer", border: "1px solid var(--color-border-subtle)", animation: `fadeUp 0.35s ease ${i * 40}ms both`, transition: "transform 0.15s, border-color 0.15s" }}
								onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}
								onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = "var(--color-border-subtle)"; }}>
								<div style={{ height: isMobile ? 100 : 140, background: course.thumb }} />
								<div style={{ padding: "14px 16px" }}>
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, lineHeight: 1.35, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{course.title}</p>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 8 }}>{course.instructor} · {t("learn.studentsCount", { count: course.students })}</p>
									<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
										<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
											<StarIcon />
											<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{course.rating}</span>
										</div>
										<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14 }}>${course.price}</span>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

export { LearnPage };
