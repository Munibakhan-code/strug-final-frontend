import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import i18n from "../i18n/index.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon, InfluencerIcon } from "../components/icons.jsx";
import { Skel, SkeletonCircle, SkeletonHeading, SkeletonServiceCard } from "../components/skeletons.jsx";
import { LeoButton, ODCategoryBubble, HostListingCTA } from "../components/shared.jsx";
import { EcomTrackingPage } from "./Ecommerce.jsx";
import { getBookingListings, createBooking } from "../api/booking";
import { CardPaymentField, useBookingPayment } from "../components/BookingPayment.jsx";
import { isAuthenticated } from "../store/auth";

const INF_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#2563eb", match: null },
	{ id: "fashion", labelKey: "pinboard.categories.fashion", color: "#a855f7", match: "Fashion" },
	{ id: "tech", labelKey: "meet.categories.tech", color: "#06b6d4", match: "Tech" },
	{ id: "food", labelKey: "discounts.categories.food", color: "#f59e0b", match: "Food" },
	{ id: "travel", labelKey: "discounts.categories.travel", color: "#0891b2", match: "Travel" },
	{ id: "health", labelKey: "discounts.categories.health", color: "#059669", match: "Health" },
	{ id: "fitness", labelKey: "meet.categories.fitness", color: "#16a34a", match: "Fitness" },
	{ id: "art", labelKey: "pinboard.categories.art", color: "#7c3aed", match: "Art" },
	{ id: "design", labelKey: "learn.categories.design", color: "#db2777", match: "Design" },
];


function InfluencerProfilePage({ inf, onBack, onBook }) {
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [selPkg, setSelPkg] = useState(null);

	if (loading) return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<Skel w={160} h={18} r={6} style={{ marginTop: 24, marginBottom: 20 }} />
				<Skel w="100%" h={200} r={18} style={{ marginBottom: 28 }} />
				<div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20 }}>
					<Skel w={80} h={80} r={20} />
					<div>
						<Skel w={180} h={26} r={6} style={{ marginBottom: 8 }} />
						<div style={{ display: "flex", gap: 6 }}>
							{[...Array(3)].map((_,i) => <Skel key={i} w={60} h={20} r={6} />)}
						</div>
					</div>
				</div>
				<Skel w="100%" h={60} r={8} style={{ marginBottom: 28 }} />
				<Skel w={120} h={20} r={6} style={{ marginBottom: 16 }} />
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
					{[...Array(3)].map((_,i) => <Skel key={i} w="100%" h={120} r={14} />)}
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginTop: 24, marginBottom: 20, padding: 0 }}>
				<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
				Influencer
			</button>
			<div style={{ height: 200, borderRadius: 18, overflow: "hidden", background: inf.photo, maxWidth: 1060, margin: "0 auto 28px", width: "100%" }} />
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20 }}>
					{/* #211: tapping the provider opens their full influencer profile (other packages + edited identity) */}
					{/* border matches page bg, cutting the avatar out from the photo strip above it */}
					<div onClick={() => { if (inf.ownerId) { window.__profileTargetId = inf.ownerId; window.__profileVertical = "influencer"; window.__nav?.("profile"); } }} style={{ width: 80, height: 80, borderRadius: 20, background: inf.photo, border: "3px solid var(--color-bg)", flexShrink: 0, cursor: inf.ownerId ? "pointer" : "default" }} />
					<div style={{ paddingBottom: 4 }}>
						<h2 onClick={() => { if (inf.ownerId) { window.__profileTargetId = inf.ownerId; window.__profileVertical = "influencer"; window.__nav?.("profile"); } }} className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, marginBottom: 4, cursor: inf.ownerId ? "pointer" : "default" }}>{inf.name}</h2>
						<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
							{inf.niche.map(n => <span key={n} className="bg-surface-raised text-text-secondary" style={{ borderRadius: 6, padding: "2px 8px", fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{n}</span>)}
						</div>
					</div>
					<div style={{ marginLeft: "auto", textAlign: "right", paddingBottom: 4 }}>
						<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 2 }}>{inf.followers}</p>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>followers</p>
					</div>
				</div>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.7, marginBottom: 20, maxWidth: 540 }}>{inf.bio}</p>
				{/* Stats row */}
				<div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
					{[
						{ label: i18n.t("social.followers"), val: inf.followers },
						{ label: "Eng. Rate", val: inf.engRate },
						{ label: "Avg Views", val: inf.avgViews },
					].map(s => (
						<div key={s.label} className="bg-surface border border-border" style={{ borderRadius: 12, padding: "12px 20px", textAlign: "center" }}>
							<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, marginBottom: 2 }}>{s.val}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{s.label}</p>
						</div>
					))}
					{(inf.platforms ?? []).map(p => (
						<div key={p} style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 12, padding: "12px 20px", textAlign: "center" }}>
							<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, color: "#60a5fa", marginBottom: 2 }}>{p}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("influencer.platform")}</p>
						</div>
					))}
				</div>
				{/* Past collaborations */}
				{inf.pastWork && inf.pastWork.length > 0 && (
					<div style={{ marginBottom: 24 }}>
						<h3 className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>{i18n.t("influencer.pastCollaborations")}</h3>
						<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
							{inf.pastWork.map(w => (
								<span key={w} className="bg-surface-raised border border-border text-text-secondary" style={{ borderRadius: 8, padding: "6px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>{w}</span>
							))}
						</div>
					</div>
				)}
				<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, marginBottom: 16, letterSpacing: "0.03em" }}>{i18n.t("influencer.packages")}</h3>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginBottom: 28 }}>
					{(inf.packages ?? []).map((pkg, i) => (
						<div key={i} onClick={() => setSelPkg(pkg === selPkg ? null : pkg)}
							style={{ background: selPkg === pkg ? "rgba(37,99,235,0.12)" : "var(--color-surface)", border: `1px solid ${selPkg === pkg ? "rgba(37,99,235,0.5)" : "var(--color-border)"}`, borderRadius: 14, padding: "18px", cursor: "pointer", transition: "all 0.15s" }}>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{pkg.name}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>{pkg.desc}</p>
							<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, color: "#60a5fa" }}>${pkg.price.toLocaleString()}</p>
						</div>
					))}
				</div>
				{selPkg && (
					// button bg is brand blue in both themes, so its label stays hardcoded white for contrast
					<button onClick={() => onBook(selPkg)} style={{ background: "#2563eb", border: "none", borderRadius: 12, padding: "14px 32px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#fff", cursor: "pointer" }}>
						Continue with {selPkg.name} — ${selPkg.price.toLocaleString()}
					</button>
				)}
			</div>
		</div>
	);
}

function InfluencerCheckoutPage({ inf, pkg, onBack, onConfirm }) {
	const { isMobile } = useViewport();
	const payBooking = useBookingPayment();
	const [submitting, setSubmitting] = useState(false);
	const [orderError, setOrderError] = useState(null);
	async function handlePlaceOrder() {
		setOrderError(null);
		if (!isAuthenticated()) { setOrderError("Please log in to book"); return; }
		if (!pkg?.listingId) { setOrderError("This package isn't available right now."); return; }
		setSubmitting(true);
		try {
			// Engine creates the async influencer booking and prices it server-side.
			const res = await createBooking({ booking_listing_id: pkg.listingId, guests: 1, notes: `Influencer campaign — ${inf.name} · ${pkg.name}` });
			const booking = res?.data ?? res;
			if (!booking?.booking_id) { setOrderError("Could not place your order. Please try again."); setSubmitting(false); return; }
			// Pay the booking's own intent so the charge is tied to the booking row.
			const pay = await payBooking(booking.booking_id);
			if (!pay.ok) { setOrderError(pay.error); setSubmitting(false); return; }
			onConfirm(booking.booking_id);
		} catch (err) {
			const status = err?.response?.status;
			setOrderError(err?.response?.data?.message || (status === 401 ? "Please log in to book" : status === 403 ? "This creator isn't accepting bookings right now." : "Could not place your order. Please try again."));
			setSubmitting(false);
		}
	}
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 560, width: "100%", margin: "0 auto", paddingBottom: 24 }}>
				<button onClick={onBack} className="text-text-secondary" style={{ marginTop: 24, marginBottom: 20, display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}>
					<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					Back
				</button>
				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 24 }}>{i18n.t("influencer.confirmPay")}</h2>
				<div className="bg-surface border border-border" style={{ borderRadius: 16, padding: 20, marginBottom: 20 }}>
					<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{i18n.t("influencer.yourOrder")}</p>
					<p className="text-text-primary" style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>{inf.name} — {pkg.name}</p>
					{pkg.desc && <p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{pkg.desc}</p>}
					<div className="bg-border" style={{ height: 1, margin: "12px 0" }} />
					<div style={{ display: "flex", justifyContent: "space-between" }}>
						<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("common.total")}</span>
						<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>${(pkg.price ?? 0).toLocaleString()}</span>
					</div>
				</div>
				<CardPaymentField />
				{orderError && <p style={{ fontSize: 12, color: "#ef4444", fontFamily: "'DM Sans', sans-serif", marginBottom: 10, textAlign: "center" }}>{orderError}</p>}
				{/* button bg is brand blue in both themes, so its label stays hardcoded white for contrast */}
				<button onClick={handlePlaceOrder} disabled={submitting} style={{ width: "100%", background: submitting ? "rgba(37,99,235,0.5)" : "#2563eb", border: "none", borderRadius: 14, padding: "16px 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700, cursor: submitting ? "default" : "pointer" }}>
					{submitting ? "Placing order…" : `Pay $${(pkg.price ?? 0).toLocaleString()}`}
				</button>
			</div>
		</div>
	);
}

function InfluencerPage({ onNavigate }) {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("influencer");
	const categories = useI18nCategoryList(INF_CATEGORY_DEFS);
const { isMobile } = useViewport();
	const loading = usePageLoad();
	const [infView, setInfView] = useState("grid");
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [infView]);
	const [selectedInf, setSelectedInf] = useState(null);
	const [selectedPkg, setSelectedPkg] = useState(null);
	const [showRateModal, setShowRateModal] = React.useState(false);
	const [infRating, setInfRating] = React.useState(0);
	const [infRatingComment, setInfRatingComment] = React.useState("");
	const handleRatingDone = () => { setShowRateModal(false); setInfView("grid"); setSelectedInf(null); setSelectedPkg(null); };
	const [activeCategory, setActiveCategory] = useState("all");
	const [infData, setInfData] = useState([]);
	const [listError, setListError] = useState(false);
	const loadInfluencers = useCallback(() => {
		// Each influencer package is a booking_listing (vertical 'influencer'); group
		// them back into one influencer card so booking a package creates a real
		// booking tied to its Stripe charge.
		getBookingListings({ vertical: 'influencer' }).then(res => {
			setListError(false);
			const arr = Array.isArray(res) ? res : (res?.data ?? []);
			if (!arr.length) return;
			const groups = {};
			arr.forEach(l => {
				const a = l.attributes ?? {};
				const key = a.group_id ?? a.influencer_id ?? l.title ?? l.booking_listing_id;
				if (!groups[key]) {
					const imgs = Array.isArray(l.images) ? l.images.filter(Boolean) : [];
					groups[key] = {
						id: key,
						ownerId: l.owner_id ?? l.user_id ?? null,
						name: a.influencer_name || l.title || 'Influencer',
						niche: a.niche ? (Array.isArray(a.niche) ? a.niche : [a.niche]) : ['General'],
						followers: a.followers || '—',
						engRate: a.eng_rate || '—',
						avgViews: a.avg_views || '—',
						photo: imgs[0] || "linear-gradient(135deg,#1e3a5f,#2563eb)",
						bio: a.bio || l.description || '',
						platforms: Array.isArray(a.platforms) ? a.platforms : [],
						pastWork: Array.isArray(a.past_work) ? a.past_work : [],
						packages: [],
					};
				}
				groups[key].packages.push({
					listingId: l.booking_listing_id,
					name: a.package_name || l.title || 'Package',
					desc: a.package_desc || l.description || '',
					price: Number(l.price) || 0,
				});
			});
			setInfData(Object.values(groups).map(g => ({
				...g,
				fromPrice: g.packages.length ? Math.min(...g.packages.map(p => p.price || 0)) : 0,
			})));
		}).catch(() => setListError(true));
	}, []);
	useEffect(() => { loadInfluencers(); }, [loadInfluencers]);
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
		// Category ids are lowercase slugs ("all"/"fashion") while niches are canonical
		// ("Fashion"); compare via the def's `match` value so the feed isn't filtered to empty.
		() => activeCategory === "all" ? infData : infData.filter(inf => (inf.niche || []).some(n => matchesCategory(activeCategory, n, categories))),
		[activeCategory, infData, categories]
	);

	if (infView === "profile" && selectedInf) {
		return <InfluencerProfilePage inf={selectedInf} onBack={() => setInfView("grid")} onBook={pkg => { setSelectedPkg(pkg); setInfView("checkout"); }} />;
	}
	if (infView === "checkout" && selectedPkg) {
		return <InfluencerCheckoutPage inf={selectedInf} pkg={selectedPkg} onBack={() => setInfView("profile")} onConfirm={() => setInfView("confirm")} />;
	}
	if (infView === "confirm") {
		return (
			<>
				<EcomTrackingPage onDone={() => setShowRateModal(true)} />
				{showRateModal && (
					// modal backdrop scrim stays a fixed dark dimmer in both themes
					<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
						<div className="bg-surface border border-border" style={{ borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, animation: "fadeUp 0.25s ease both" }}>
							<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{i18n.t("influencer.rateCreator")}</h3>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 18 }}>{i18n.t("rideshare.howWasExperience")}</p>
							<div style={{ display: "flex", gap: 8, marginBottom: 18, justifyContent: "center" }}>
								{[1,2,3,4,5].map(n => (
									<button key={n} onClick={() => setInfRating(n)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
										<svg width={30} height={30} viewBox="0 0 24 24" fill={n <= infRating ? "#f59e0b" : "none"} stroke={n <= infRating ? "#f59e0b" : "var(--color-text-muted)"} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
									</button>
								))}
							</div>
							<textarea value={infRatingComment} onChange={e => setInfRatingComment(e.target.value)} placeholder={i18n.t("common.optionalComment")} rows={3} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 16 }} />
							<div style={{ display: "flex", gap: 10 }}>
								<button onClick={handleRatingDone} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, padding: "11px 0", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{i18n.t("ondemand.hire.skip")}</button>
								{/* submit button bg is brand blue (both states), so its label stays hardcoded white/dim-white for contrast */}
								<button disabled={infRating === 0} onClick={() => { handleRatingDone(); }} style={{ flex: 1, padding: "11px 0", background: infRating > 0 ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: infRating > 0 ? "#fff" : "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: infRating > 0 ? "pointer" : "default" }}>{i18n.t("common.submit")}</button>
							</div>
						</div>
					</div>
				)}
			</>
		);
	}

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", padding: "32px 0 0" }}>
				<div style={{ textAlign: "center", marginBottom: 20 }}>
					<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, letterSpacing: "0.03em", marginBottom: 4 }}>{landingTitle}</h2>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 14 }}>{i18n.t("influencer.subtitle")}</p>
					<div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
						<HostListingCTA vertical="influencer" label="List a package" onCreated={loadInfluencers} />
						<button style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.35)", borderRadius: 10, padding: "10px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "#60a5fa", cursor: "pointer" }} onClick={() => onNavigate && onNavigate("sd-influencer")}>{t("influencer.becomeInfluencer")}</button>
					</div>
				</div>
				<div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 28 }}>
					<button onClick={() => catScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })} className={`border ${catScrollState.atStart ? "bg-surface border-border-subtle text-text-muted" : "bg-surface-raised border-border text-text-primary"}`} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, cursor: catScrollState.atStart ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", transition: "transform 0.12s, background 0.2s" }} onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					</button>
					<div ref={catScrollRef} className="ecom-cat-scroll" style={{ flex: 1, display: "flex", gap: 20, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none", justifyContent: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "center" : "flex-start" }}>
						{categories.map((cat, i) => (
							<LeoButton key={cat.id} cat={cat} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 30} />
						))}
					</div>
					{/* atEnd:false uses brand blue bg, so its icon color stays hardcoded white for contrast */}
					<button onClick={() => catScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: catScrollState.atEnd ? "var(--color-surface)" : "#2563eb", border: `1px solid ${catScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`, color: catScrollState.atEnd ? "var(--color-text-muted)" : "#fff", cursor: catScrollState.atEnd ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", transition: "transform 0.12s, background 0.2s", boxShadow: catScrollState.atEnd ? "none" : "0 2px 14px rgba(37,99,235,0.55)" }} onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</button>
				</div>
			</div>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 18 }}>
				{loading ? Array.from({ length: 6 }).map((_, i) => (
					<div key={i} className="bg-surface border border-border" style={{ borderRadius: 16, overflow: "hidden", animation: `fadeUp 0.3s ease ${i * 50}ms both` }}>
						<div style={{ position: "relative" }}>
							<Skel h={110} r={0} />
							{/* border matches page bg, cutting the avatar out from the photo strip above it */}
							<div className="skel" style={{ position: "absolute", bottom: -28, left: 16, width: 56, height: 56, borderRadius: 14, border: "3px solid var(--color-bg)" }} />
						</div>
						<div style={{ padding: "36px 16px 16px" }}>
							<Skel w="60%" h={14} r={6} style={{ marginBottom: 8 }} />
							<Skel w="80%" h={12} r={6} style={{ marginBottom: 12 }} />
							<Skel w="40%" h={16} r={6} />
						</div>
					</div>
				)) : filtered.map((inf, i) => (
					<div key={inf.id} onClick={() => { setSelectedInf(inf); setInfView("profile"); }}
						className="bg-surface border border-border"
						style={{ borderRadius: 16, overflow: "hidden", cursor: "pointer", transition: "border-color 0.15s", animation: `fadeUp 0.35s ease ${i * 50}ms both` }}
						onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-border)"}
						onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border-subtle)"}>
						<div style={{ height: 110, background: inf.photo, position: "relative" }}>
							{/* border matches page bg, cutting the avatar out from the photo strip above it */}
							<div style={{ position: "absolute", bottom: -28, left: 16, width: 56, height: 56, borderRadius: 14, background: inf.photo, border: "3px solid var(--color-bg)" }} />
						</div>
						<div style={{ padding: "36px 16px 16px" }}>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15 }}>{inf.name}</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{inf.followers}</p>
							</div>
							<div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
								{inf.niche.map(n => <span key={n} className="bg-surface-raised text-text-secondary" style={{ borderRadius: 5, padding: "2px 7px", fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{n}</span>)}
								{(inf.platforms ?? []).map(p => <span key={p} style={{ background: "rgba(37,99,235,0.12)", borderRadius: 5, padding: "2px 7px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#60a5fa", fontWeight: 600 }}>{p}</span>)}
							</div>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#60a5fa" }}>From ${(inf.fromPrice ?? 0).toLocaleString()}</p>
						</div>
					</div>
				))}
				{!loading && filtered.length === 0 && (
					<div className="text-text-secondary" style={{ gridColumn: "1 / -1", textAlign: "center", padding: "56px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
						{listError ? i18n.t("common.listError.retryLater") : i18n.t("common.listError.noInfluencers")}
					</div>
				)}
			</div>
		</div>
	);
}

export { InfluencerPage };
