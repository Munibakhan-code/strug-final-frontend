import React, { useCallback, useEffect, useMemo, useState } from "react";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon, ArtistsIcon } from "../components/icons.jsx";
import { Skel, SkeletonCircle, SkeletonHeading, SkeletonProductCard } from "../components/skeletons.jsx";
import {LeoButton, ODCategoryBubble, QuickContactChat, HostListingCTA} from "../components/shared.jsx";
import { EcomTrackingPage } from "./Ecommerce.jsx";
import { getBookingListings, createBooking } from "../api/booking";
import { CardPaymentField, useBookingPayment } from "../components/BookingPayment.jsx";
import { isAuthenticated } from "../store/auth";
import { useI18nCategoryList } from "../hooks/useI18nCategoryList.js";

// Art medium filter pills. Labels resolve via i18n (artists.mediums.*) and match the
// `medium` values on artwork records, so label-based filtering below works.
const ART_MEDIUM_DEFS = [
	{ id: "all", labelKey: "artists.mediums.all", color: "#2563eb", match: null },
	{ id: "digital", labelKey: "artists.mediums.digital", color: "#7c3aed", match: "Digital" },
	{ id: "oil", labelKey: "artists.mediums.oil", color: "#f59e0b", match: "Oil" },
	{ id: "watercolor", labelKey: "artists.mediums.watercolor", color: "#06b6d4", match: "Watercolor" },
	{ id: "photography", labelKey: "artists.mediums.photography", color: "#78716c", match: "Photography" },
	{ id: "mixed", labelKey: "artists.mediums.mixed", color: "#16a34a", match: "Mixed" },
];

const ARTWORKS_DATA = [
	{ id: 1,  title: "Neon Drift",          artist: "Kenji Mori",       medium: "Digital",    price: 180,  thumb: "linear-gradient(135deg,#0d1b35,#2563eb,#7c3aed)" },
	{ id: 2,  title: "Harmattan",           artist: "Adaeze Chukwu",    medium: "Oil",        price: 420,  thumb: "linear-gradient(135deg,#451a03,#f59e0b,#fef3c7)" },
	{ id: 3,  title: "Silence IV",          artist: "Leila Nazari",     medium: "Watercolor", price: 95,   thumb: "linear-gradient(135deg,#0f172a,#06b6d4,#e0f2fe)" },
	{ id: 4,  title: "Grid Memory",         artist: "Sam Delacroix",    medium: "Digital",    price: 220,  thumb: "linear-gradient(135deg,#1a1a2e,#e50914,#ff6b6b)" },
	{ id: 5,  title: "Sacred Geometry",     artist: "Amara Diallo",     medium: "Mixed",      price: 340,  thumb: "linear-gradient(135deg,#052e16,#16a34a,#bbf7d0)" },
	{ id: 6,  title: "Urban Fracture",      artist: "Leo Park",         medium: "Photography",price: 75,   thumb: "linear-gradient(135deg,#1c1917,#78716c,#d4d4d8)" },
	{ id: 7,  title: "Bloom Protocol",      artist: "Iris Voss",        medium: "Digital",    price: 150,  thumb: "linear-gradient(135deg,#4a044e,#ec4899,#fce7f3)" },
	{ id: 8,  title: "Threshold",           artist: "Omar Bakr",        medium: "Oil",        price: 550,  thumb: "linear-gradient(135deg,#172554,#3b82f6,#bfdbfe)" },
];



function ArtworkDetailPage({ artwork, onBack, onBuy }) {
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [buying, setBuying] = useState(false);
	const [artChat, setArtChat] = useState(false);

	if (loading) return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<Skel w={160} h={18} r={6} style={{ marginTop: 24, marginBottom: 20 }} />
				<div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
					<Skel w="min(480px,100%)" h={360} r={20} />
					<div style={{ flex: 1, minWidth: 260 }}>
						<Skel w={80} h={22} r={6} style={{ marginBottom: 12 }} />
						<Skel w="80%" h={36} r={8} style={{ marginBottom: 8 }} />
						<Skel w="40%" h={16} r={6} style={{ marginBottom: 24 }} />
						<Skel w="100%" h={90} r={8} style={{ marginBottom: 28 }} />
						<Skel w={140} h={34} r={8} style={{ marginBottom: 24 }} />
						<div style={{ display: "flex", gap: 12 }}>
							<Skel w={140} h={44} r={12} />
							<Skel w={120} h={44} r={12} />
						</div>
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
				{i18n.t("artists.backToCorner")}
			</button>
			<div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
				<div style={{ width: "min(480px,100%)", aspectRatio: "4/3", borderRadius: 20, background: artwork.thumb, flexShrink: 0, boxShadow: "0 24px 64px var(--color-shadow)" }} />
				<div style={{ flex: 1, minWidth: 260 }}>
					<span className="bg-surface-raised border border-border text-text-secondary" style={{ display: "inline-block", borderRadius: 6, padding: "3px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 12 }}>{artwork.medium}</span>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 36, marginBottom: 6 }}>{artwork.title}</h1>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 20 }}>{i18n.t("artists.byArtist")} {artwork.artist}</p>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.7, marginBottom: 28, maxWidth: 460 }}>
						{i18n.t("artists.description")}
					</p>
					<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 34, marginBottom: 24 }}>${artwork.price.toFixed(2)}</p>
					<div style={{ display: "flex", gap: 12 }}>
						<button onClick={() => setArtChat(v => !v)} style={{ background: artChat ? "rgba(37,99,235,0.15)" : "var(--color-surface-raised)", border: `1px solid ${artChat ? "rgba(37,99,235,0.3)" : "var(--color-border)"}`, borderRadius: 12, padding: "12px 24px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, color: artChat ? "#60a5fa" : "var(--color-text-primary)", cursor: "pointer", transition: "all 0.15s" }}>
							{artChat ? i18n.t("artists.closeChat") : i18n.t("artists.contactArtist")}
						</button>
						<button onClick={() => { setBuying(true); setTimeout(() => onBuy(artwork), 300); }}
							style={{ background: buying ? "#059669" : "#2563eb", border: "none", borderRadius: 12, padding: "12px 28px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer", transition: "background 0.2s" }}>
							{buying ? i18n.t("artists.adding") : i18n.t("artists.buyNow")}
						</button>
					</div>
					{artChat && <div style={{ marginTop: 16, maxWidth: 480 }}><QuickContactChat toName={artwork.artist} context={artwork.title} onClose={() => setArtChat(false)} /></div>}
				</div>
			</div>
			</div>
		</div>
	);
}

function ArtworkCheckoutPage({ artwork, onBack, onConfirm }) {
	const { isMobile } = useViewport();
	const payBooking = useBookingPayment();
	const [submitting, setSubmitting] = useState(false);
	const [orderError, setOrderError] = useState(null);
	const isReal = artwork.isReal === true && artwork.listingId;
	async function handleBuy() {
		setOrderError(null);
		if (!isReal) { setOrderError(i18n.t("artists.demoPieceMessage")); return; }
		if (!isAuthenticated()) { setOrderError("Please log in to purchase"); return; }
		setSubmitting(true);
		try {
			// Each artwork is a booking_listing; the "booking" is the purchase record,
			// priced server-side and charged via its own intent.
			const res = await createBooking({ booking_listing_id: artwork.listingId, guests: 1, notes: `Artwork purchase — ${artwork.title} by ${artwork.artist}` });
			const booking = res?.data ?? res;
			if (!booking?.booking_id) { setOrderError("Could not complete your purchase. Please try again."); setSubmitting(false); return; }
			const pay = await payBooking(booking.booking_id);
			if (!pay.ok) { setOrderError(pay.error); setSubmitting(false); return; }
			onConfirm(booking.booking_id);
		} catch (err) {
			const status = err?.response?.status;
			setOrderError(err?.response?.data?.message || (status === 409 ? "This piece is no longer available." : "Could not complete your purchase. Please try again."));
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
				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 24 }}>{i18n.t("common.confirmAndPay")}</h2>
				<div className="bg-surface border border-border-subtle" style={{ borderRadius: 16, padding: 20, marginBottom: 20 }}>
					<div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 12 }}>
						<div style={{ width: 64, height: 64, borderRadius: 12, background: artwork.thumb, flexShrink: 0 }} />
						<div>
							<p className="text-text-primary" style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 2 }}>{artwork.title}</p>
							<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{artwork.artist} · {artwork.medium}</p>
						</div>
					</div>
					<div className="bg-border-subtle" style={{ height: 1, margin: "12px 0" }} />
					<div style={{ display: "flex", justifyContent: "space-between" }}>
						<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("common.total")}</span>
						<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>${(artwork.price ?? 0).toLocaleString()}</span>
					</div>
				</div>
				{isReal ? <CardPaymentField /> : (
					<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 16, textAlign: "center" }}>{i18n.t("artists.demoPieceMessage")}</p>
				)}
				{orderError && <p style={{ fontSize: 12, color: "#ef4444", fontFamily: "'DM Sans', sans-serif", marginBottom: 10, textAlign: "center" }}>{orderError}</p>}
				<button onClick={handleBuy} disabled={submitting || !isReal} style={{ width: "100%", background: (submitting || !isReal) ? "rgba(37,99,235,0.5)" : "#2563eb", border: "none", borderRadius: 14, padding: "16px 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700, cursor: (submitting || !isReal) ? "default" : "pointer" }}>
					{submitting ? "Processing…" : `Pay $${(artwork.price ?? 0).toLocaleString()}`}
				</button>
			</div>
		</div>
	);
}

function ArtistCornerPage({ onNavigate }) {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("artists");
const { isMobile } = useViewport();
	const loading = usePageLoad();
	const [medium, setMedium] = useState("All");
	const categories = useI18nCategoryList(ART_MEDIUM_DEFS);
	const [artView, setArtView] = useState("grid");
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [artView]);
	const [selectedArtwork, setSelectedArtwork] = useState(null);
	// Demo artworks are display-only; real ones (booking_listing rows) are buyable.
	const [artData, setArtData] = useState(() => ARTWORKS_DATA.map(a => ({ ...a, isReal: false })));
	const [listError, setListError] = useState(false);
	const loadArtworks = useCallback(() => {
		getBookingListings({ vertical: 'artwork' }).then(res => {
			setListError(false);
			const arr = Array.isArray(res) ? res : (res?.data ?? []);
			if (arr.length) setArtData(arr.map(l => {
				const a = l.attributes ?? {};
				const imgs = Array.isArray(l.images) ? l.images.filter(Boolean) : [];
				return {
					id: l.booking_listing_id,
					listingId: l.booking_listing_id,
					isReal: true,
					title: l.title || 'Artwork',
					artist: a.artist || 'Artist',
					medium: a.medium || 'Mixed',
					price: Number(l.price) || 0,
					thumb: imgs[0] || a.thumb || "linear-gradient(135deg,#1e3a5f,#2563eb)",
				};
			}));
		}).catch(() => setListError(true));
	}, []);
	useEffect(() => { loadArtworks(); }, [loadArtworks]);

	const filtered = useMemo(
		() => medium === "All" ? artData : artData.filter(a => a.medium === medium),
		[medium, artData]
	);

	if (artView === "detail" && selectedArtwork) {
		return <ArtworkDetailPage artwork={selectedArtwork} onBack={() => setArtView("grid")} onBuy={() => setArtView("checkout")} />;
	}
	if (artView === "checkout" && selectedArtwork) {
		return <ArtworkCheckoutPage artwork={selectedArtwork} onBack={() => setArtView("detail")} onConfirm={() => setArtView("confirm")} />;
	}
	if (artView === "confirm") {
		return <EcomTrackingPage onDone={() => { setArtView("grid"); setSelectedArtwork(null); }} />;
	}

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<div style={{ padding: "32px 0 0" }}>
					<div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24, gap: 16 }}>
						<div style={{ textAlign: "center" }}>
							<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(24px,3vw,36px)", letterSpacing: "0.03em", marginBottom: 4 }}>{landingTitle}</h2>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{t("artists.subtitle")}</p>
							{listError && (
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#fbbf24", marginTop: 6 }}>{i18n.t("common.listError.sampleArtwork")}</p>
							)}
						</div>
						<div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center" }}>
							<HostListingCTA vertical="artwork" label="List artwork" onCreated={loadArtworks} />
							<button style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.35)", borderRadius: 10, padding: "10px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "#60a5fa", cursor: "pointer" }} onClick={() => onNavigate && onNavigate("sd-artist")}>{t("artists.becomeArtist")}</button>
						</div>
					</div>
					<div style={{ display: "flex", gap: 20, marginBottom: 28, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
						{categories.map((m, i) => (
							<LeoButton key={m.label} cat={m} active={medium === m.label} onClick={() => setMedium(m.label)} delay={i * 30} />
						))}
					</div>
				</div>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 20 }}>
				{loading ? Array.from({ length: 8 }).map((_, i) => (
					<div key={i} style={{ animation: `fadeUp 0.3s ease ${i * 40}ms both` }}>
						<div style={{ width: "100%", paddingBottom: "75%", position: "relative", borderRadius: 14, overflow: "hidden", marginBottom: 10 }}>
							<div className="skel" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />
						</div>
						<Skel w="75%" h={14} r={6} style={{ marginBottom: 6 }} />
						<Skel w="50%" h={12} r={6} style={{ marginBottom: 6 }} />
						<Skel w="35%" h={12} r={5} />
					</div>
				)) : filtered.map((art, i) => (
					<div key={art.id} onClick={() => { setSelectedArtwork(art); setArtView("detail"); }}
						className="bg-surface border border-border-subtle"
						style={{ borderRadius: 16, overflow: "hidden", cursor: "pointer", transition: "border-color 0.15s, transform 0.15s", animation: `fadeUp 0.35s ease ${i * 40}ms both` }}
						onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
						onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--color-border-subtle)"; e.currentTarget.style.transform = "none"; }}>
						<div style={{ width: "100%", paddingBottom: "75%", position: "relative" }}>
							<div style={{ position: "absolute", inset: 0, background: art.thumb }} />
						</div>
						<div style={{ padding: "14px 16px" }}>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{art.title}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 8 }}>{art.artist} · {art.medium}</p>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#60a5fa" }}>${art.price.toFixed(2)}</p>
						</div>
					</div>
				))}
			</div>
			</div>
		</div>
	);
}

export { ArtistCornerPage };
