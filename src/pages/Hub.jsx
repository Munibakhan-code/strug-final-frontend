import React, { useState, useRef, useLayoutEffect, useEffect } from "react";
import { motion as Motion } from "framer-motion";
import { useViewport } from "../hooks/useViewport.js";
import { useTranslation } from "react-i18next";
import i18n from "../i18n/index.js";
import { getStoryFeed } from "../api/social.js";
import { GradientText, TiltCard, SpotlightCard } from "../components/skeletons.jsx";
import { SearchIcon, HomeIcon, ShopIcon, FoodIcon, GroceriesIcon, FloralIcon,
	SecondHandIcon, BooksIcon, DigProductsIcon, DiscountsIcon, OnDemandIcon,
	ProServicesIcon, DigServicesIcon, MedicalIcon, LessonsIcon, LearnIcon,
	CateringIcon, CourierIcon, RaiseIcon, BookArtistIcon, TempStayIcon, HotelIcon,
	VehiclesIcon, EquipmentIcon, VenuesIcon, RealEstateIcon, RideshareIcon,
	PreconstructIcon, AutomotiveIcon, DecorIcon, EventsIcon, ReservationsIcon,
	ExperiencesIcon, WeddingIcon, CelebrityIcon, MeetIcon, SocialIcon, FeedIcon,
	CommunityIcon, LiveIcon, PinBoardIcon, FavouritesIcon, ArtistsIcon,
	InfluencerIcon, PortfolioIcon, VideoIcon, InsuranceIcon, MortgageIcon } from "../components/icons.jsx";
import { StoryComposerModal, StoryViewer } from "./Feed.jsx";
import { SafeImage } from "../components/SafeImage.jsx";
import { sidebarNavLabel } from "../utils/navLabel.js";

const STORY_RING_COLORS = ["#2563eb","#7c3aed","#059669","#dc2626","#d97706","#db2777","#0891b2","#e11d48","#16a34a","#ca8a04"];

const GROUP_NAV = [
	{
		id: "home", label: i18n.t("pinboard.categories.home"), color: "#2563eb",
		icon: ({ s=22 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>,
		pages: [{ id: "home", label: i18n.t("pinboard.categories.home"), icon: HomeIcon }],
	},
	{
		id: "shop", label: i18n.t("shop.title"), color: "#f59e0b",
		icon: ({ s=22 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
		pages: [
			{ id: "shop",        label: i18n.t("shop.title"),        icon: ShopIcon },
			{ id: "food",        label: i18n.t("discounts.categories.food"),        icon: FoodIcon },
			{ id: "groceries",   label: i18n.t("groceries.title"),   icon: GroceriesIcon },
			{ id: "floral",      label: i18n.t("floral.title"),      icon: FloralIcon },
			{ id: "secondhand",  label: i18n.t("secondhand.title"),    icon: SecondHandIcon },
			{ id: "books",       label: i18n.t("books.title"),       icon: BooksIcon },
			{ id: "digproducts", label: "Digital Products",   icon: DigProductsIcon },
			{ id: "discounts",   label: i18n.t("discounts.title"),   icon: DiscountsIcon },
		],
	},
	{
		id: "services", label: i18n.t("discounts.categories.services"), color: "#10b981",
		icon: ({ s=22 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>,
		pages: [
			{ id: "ondemand",    label: i18n.t("ondemand.title"),   icon: OnDemandIcon },
			{ id: "proservices", label: "Professional Services",    icon: ProServicesIcon },
			{ id: "digservices", label: "Digital Services",   icon: DigServicesIcon },
			{ id: "medical",     label: i18n.t("medical.title"),     icon: MedicalIcon },
			{ id: "lessons",     label: i18n.t("lessons.title"),     icon: LessonsIcon },
			{ id: "learn",       label: i18n.t("learn.title"),       icon: LearnIcon },
			{ id: "catering",    label: i18n.t("catering.title"),    icon: CateringIcon },
			{ id: "courier",     label: i18n.t("courier.title"),     icon: CourierIcon },
			{ id: "raise",       label: i18n.t("raise.title"),       icon: RaiseIcon },
			{ id: "bookartist",  label: i18n.t("bookartist.title"), icon: BookArtistIcon },
		],
	},
	{
		id: "rentals", label: i18n.t("decor.rentals"), color: "#8b5cf6",
		icon: ({ s=22 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
		pages: [
			{ id: "tempstay",    label: i18n.t("tempstay.title"),   icon: TempStayIcon },
			{ id: "hotel",       label: i18n.t("hotel.title"),      icon: HotelIcon },
			{ id: "vehicles",    label: i18n.t("vehicles.title"),    icon: VehiclesIcon },
			{ id: "equipment",   label: i18n.t("equipment.title"),   icon: EquipmentIcon },
			{ id: "venues",      label: i18n.t("venues.title"),      icon: VenuesIcon },
			{ id: "realestate",  label: i18n.t("realestate.title"), icon: RealEstateIcon },
			{ id: "rideshare",   label: i18n.t("nav.rideshare", { defaultValue: i18n.t("rideshare.title") }),   icon: RideshareIcon },
			{ id: "preconstruct",label: "Construct",   icon: PreconstructIcon },
			{ id: "automotive",  label: i18n.t("automotive.title"),  icon: AutomotiveIcon },
			{ id: "decor",       label: "Décor",       icon: DecorIcon },
		],
	},
	{
		id: "events", label: i18n.t("events.title"), color: "#f97316",
		icon: ({ s=22 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
		pages: [
			{ id: "events",       label: i18n.t("events.title"),      icon: EventsIcon },
			{ id: "reservations", label: "Bookings",    icon: ReservationsIcon },
			{ id: "experiences",  label: i18n.t("experiences.title"), icon: ExperiencesIcon },
			{ id: "wedding",      label: i18n.t("wedding.title"),     icon: WeddingIcon },
			{ id: "celebrity",    label: i18n.t("celebrity.title"),   icon: CelebrityIcon },
			{ id: "meet",         label: i18n.t("meet.title"),        icon: MeetIcon },
		],
	},
	{
		id: "social", label: i18n.t("meet.categories.social"), color: "#ec4899",
		icon: ({ s=22 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
		pages: [
			{ id: "social",    label: i18n.t("social.title"),  icon: SocialIcon },
			{ id: "feed",      label: i18n.t("feed.title"),       icon: FeedIcon },
			{ id: "community", label: i18n.t("community.title"),  icon: CommunityIcon },
			{ id: "live",      label: i18n.t("videos.live"),       icon: LiveIcon },
			{ id: "pinboard",  label: i18n.t("pinboard.title"),  icon: PinBoardIcon },
			{ id: "favourites",label: i18n.t("favourites.title"), icon: FavouritesIcon },
		],
	},
	{
		id: "finance", label: i18n.t("automotive.finance"), color: "#0ea5e9",
		icon: ({ s=22 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
		pages: [
			{ id: "insurance", label: i18n.t("medical.insurance"), icon: InsuranceIcon },
			{ id: "mortgage",  label: "Mortgage",  icon: MortgageIcon },
		],
	},
	{
		id: "creative", label: "Creative", color: "#06b6d4",
		icon: ({ s=22 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>,
		pages: [
			{ id: "artists",    label: "Artists",    icon: ArtistsIcon },
			{ id: "influencer", label: i18n.t("influencer.title"), icon: InfluencerIcon },
			{ id: "portfolio",  label: i18n.t("portfolio.title"),  icon: PortfolioIcon },
			{ id: "videos",     label: i18n.t("videos.title"),     icon: VideoIcon },
		],
	},
];

// Renders inside the hero photo overlay (NavHubPage), which stays dark-scrimmed in both
// themes for legibility over the image — so these colors are intentionally NOT theme
// tokens; they need to stay "white on dark scrim" regardless of light/dark mode.
function StoryBubble({ story, delay, onClick }) {
	const [hov, setHov] = useState(false);
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, animation: `fadeUp 0.35s ease ${delay}ms both` }}>
			<button
				onClick={onClick}
				onMouseEnter={() => setHov(true)}
				onMouseLeave={() => setHov(false)}
				style={{
					width: 72, height: 72, borderRadius: "50%",
					// #457: the photo (objectFit:cover, 100%x100%) fully covers the disc when it loads, so
					// keeping the surface colour underneath is invisible on success and is exactly what we
					// want behind the initial when the photo 404s.
					background: "rgba(28,26,36,0.88)",
					border: `2.5px solid ${hov ? story.ring : story.ring + "99"}`,
					color: "#fff",
					display: "flex", alignItems: "center", justifyContent: "center",
					backdropFilter: "blur(12px)",
					transform: hov ? "translateY(-2px)" : "none",
					boxShadow: hov ? `0 6px 20px ${story.ring}44` : "0 2px 8px rgba(0,0,0,0.35)",
					transition: "all 0.18s",
					cursor: "pointer",
					fontFamily: "'Barlow Condensed', sans-serif",
					fontWeight: 800,
					fontSize: 22,
					overflow: "hidden",
				}}
			>
				<SafeImage loading="lazy" decoding="async" src={story.profile_pic_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} fallback={story.initial} />
			</button>
			<span style={{
				fontSize: 12, color: "rgba(255,255,255,0.7)",
				fontFamily: "'DM Sans', sans-serif", fontWeight: 400,
				whiteSpace: "nowrap",
			}}>{story.name}</span>
		</div>
	);
}

function SpotlightOverlay({ onNavigate, onClose, navItems }) {
	const { t, i18n: i18nInstance } = useTranslation();
	const [q, setQ] = React.useState("");
	const all = React.useMemo(
		() =>
			navItems.map((n) => {
				const label = t(`nav.${n.id}`, { defaultValue: n.label });
				return { id: n.id, label, icon: n.icon, keywords: n.keywords, fallbackLabel: n.label };
			}),
		[navItems, t, i18nInstance.language],
	);
	const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
	const results = q.trim()
		? all.filter(
				(n) =>
					norm(n.label).includes(norm(q)) ||
					norm(n.fallbackLabel).includes(norm(q)) ||
					(n.keywords || []).some((k) => norm(k).includes(norm(q))),
			)
		: all;
	const inputRef = React.useRef(null);
	React.useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);
	React.useEffect(() => {
		const handler = e => { if (e.key === "Escape") onClose(); };
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [onClose]);
	return (
		<div
			onClick={onClose}
			style={{ position: "absolute", inset: 0, zIndex: 60, background: "rgba(6,8,16,0.75)", backdropFilter: "blur(4px)", display: "flex", justifyContent: "center", paddingTop: 80, animation: "spotlightBgIn 0.2s ease both" }}
		>
			<div onClick={e => e.stopPropagation()} className="bg-surface border border-border" style={{ width: "min(560px, 90%)", height: "fit-content", maxHeight: "70vh", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px var(--color-shadow)", animation: "spotlightIn 0.28s cubic-bezier(0.16,1,0.3,1) 0.05s both" }}>
				{/* Search input */}
				<div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid var(--color-border-subtle)" }}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
					<input
						ref={inputRef}
						value={q} onChange={e => setQ(e.target.value)}
						placeholder={i18n.t("spotlight.placeholder")}
						className="text-text-primary"
						style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }}
					/>
					<kbd className="text-text-muted bg-surface-raised border border-border" style={{ fontSize: 11, fontFamily: "sans-serif", padding: "2px 6px", borderRadius: 4 }}>ESC</kbd>
				</div>
				{/* Results */}
				<div style={{ overflowY: "auto" }}>
					{results.length === 0 && (
						<p className="text-text-secondary" style={{ padding: "20px 18px", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{t("spotlight.noResults")}</p>
					)}
					{results.map(item => {
						const Icon = item.icon;
						return (
							<button
								key={item.id}
								onClick={() => { onNavigate(item.id); onClose(); }}
								className="text-text-secondary"
							style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "11px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left", transition: "background 0.1s, color 0.1s" }}
								onMouseEnter={e => { e.currentTarget.style.background = "var(--color-surface-raised)"; e.currentTarget.style.color = "var(--color-text-primary)"; }}
								onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}
							>
								<Icon s={18} />
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{item.label}</span>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}

const staggerContainerVariants = {
	hidden: {},
	show: { transition: { staggerChildren: 0.05 } },
};
const staggerItemVariants = {
	hidden: { opacity: 0, y: 10 },
	show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 340, damping: 26 } },
};

function NavHubPage({ onNavigate, onOpenSpotlight, navItems, pageColors }) {
    const { isMobile, isTablet } = useViewport();
    const [viewStory, setViewStory] = useState(null);
    const [showComposer, setShowComposer] = useState(false); // Ye composer ke liye state
    const [liveStories, setLiveStories] = useState([]);
    const [bgIdx, setBgIdx] = useState(0);

    const BG_TINTS = [
        "rgba(6,8,16,0.45)",
        "rgba(10,4,20,0.42)",
        "rgba(12,8,6,0.44)",
    ];
    const { t } = useTranslation();
    const storiesScrollRef = useRef(null);
    const [storiesScroll, setStoriesScroll] = useState({ atStart: true, atEnd: true });

    useEffect(() => {
        getStoryFeed().then(d => {
            const list = Array.isArray(d) ? d : (d?.data ?? []);

            const mapped = list.map((group, i) => {
                const profile    = group.profile   ?? group.user ?? {};
                const firstStory = group.stories?.[0] ?? group  ?? {};

                const displayName =
                    profile.display_name ??
                    profile.handle       ??
                    profile.username     ??
                    "User";

                return {
                    story_id:        firstStory.story_id ?? firstStory.id ?? i,
                    name:            displayName,
                    initial:         displayName[0].toUpperCase(),
                    ring:            STORY_RING_COLORS[i % STORY_RING_COLORS.length],
                    media_url:       firstStory.media_url ?? group.mediaUrl ?? group.media_url ?? null,
                    profile_pic_url: profile.profile_pic_url ?? null,
                    hasUnseen:       group.hasUnseen ?? true,
                    stories:         group.stories || [group] 
                };
            });

            setLiveStories(mapped);
        }).catch(() => {});
    }, []);


    useEffect(() => {
        if (isMobile) return;
        const timer = setInterval(() => setBgIdx(i => (i + 1) % 3), 8000);
        return () => clearInterval(timer);
    }, [isMobile]);

    useLayoutEffect(() => {
        const el = storiesScrollRef.current;
        if (!el) return;
        const update = () => setStoriesScroll(prev => { const atStart = el.scrollLeft <= 4, atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4; return prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }; });
        update();
        el.addEventListener("scroll", update, { passive: true });
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
    }, []);

    const groupColorMap = {};
    GROUP_NAV.forEach(g => g.pages.forEach(p => { groupColorMap[p.id] = g.color; }));

    return (
        <>
        {/* Integration: Story Viewer */}
        {viewStory && (
            <StoryViewer
                initialStory={viewStory} 
                storyGroups={liveStories} 
                onClose={() => setViewStory(null)} 
            />
        )}

        {showComposer && (
            <StoryComposerModal 
                onClose={() => setShowComposer(false)} 
                onCreated={() => { /* Refresh logic if needed */ }} 
            />
        )}

        <div className="bg-bg styled-scrollbar" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative" }}>
            <style>{`
              @keyframes kenBurns {
                0%   { transform: scale(1.06) translate(0%, 0%); }
                50%  { transform: scale(1.14) translate(-1.5%, 1%); }
                100% { transform: scale(1.06) translate(0%, 0%); }
              }
            `}</style>
            {!isMobile && (
                <div style={{
                    position: "absolute", top: 0, left: 0, right: 0, height: "90vh",
                    backgroundImage: "url('/hero-bg.jpg')", backgroundSize: "cover", backgroundPosition: "center 30%",
                    filter: "blur(6px)", zIndex: 0,
                    animation: "kenBurns 14s ease-in-out infinite",
                }} />
            )}
            {isMobile && (
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "90vh", backgroundImage: "url('/hero-bg.jpg')", backgroundSize: "cover", backgroundPosition: "center 30%", filter: "blur(6px)", zIndex: 0, transform: "scale(1.06)" }} />
            )}
            {/* Scrim over the hero photo — stays a dark gradient regardless of theme (the hero
                image needs it for the white tagline to read), but the final stop matches
                --color-bg so it blends seamlessly into the page below in both themes. */}
            <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: "90vh",
                background: `linear-gradient(to bottom, ${BG_TINTS[bgIdx]} 0%, rgba(6,8,16,0.75) 45%, var(--color-bg) 75%)`,
                zIndex: 1, pointerEvents: "none",
                transition: "background 2s ease",
            }} />

            <div style={{ position: "relative", zIndex: 2, minHeight: "55vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", width: "100%", padding: `${isMobile ? "60px 16px 0 16px" : "60px 48px 0 128px"}`, animation: "fadeUp 0.45s ease both" }}>
                    <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(40px, 5vw, 80px)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center", marginBottom: 28, lineHeight: 1 }}>
                        <GradientText colors={["#ffffff", "#e8f0ff", "#ede8ff", "#ffffff"]} speed={16}>
                            {t("hero.tagline")}
                        </GradientText>
                    </h1>
                    
                    {/* Search Bar kept intact */}
                    <div className="search-wrap" onClick={onOpenSpotlight} style={{ width: "min(700px, 90%)", cursor: "text" }}>
                        <div className="search-inner" style={{ background: "rgba(14,12,20,0.88)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 16px 14px 18px", gap: 12 }}>
                            <div style={{ color: "rgba(255,255,255,0.55)", flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={20} /></div>
                            <span style={{ flex: 1, color: "rgba(255,255,255,0.55)", fontSize: 16, fontFamily: "'DM Sans', sans-serif", userSelect: "none" }}>{t("hero.searchPlaceholder")}</span>
                        </div>
                    </div>
                </div>

                <div style={{ position: "relative", width: "100%", marginTop: 32, marginBottom: 48, paddingLeft: isMobile ? 0 : 128, paddingRight: isMobile ? 0 : 48 }}>
                    {isMobile && !storiesScroll.atStart && (
                        <div style={{ position: "absolute", left: 0, top: 0, height: 72, width: 72, background: "radial-gradient(ellipse at left center, #0a0a0e 0%, rgba(10,10,14,0.85) 40%, transparent 75%)", zIndex: 2, display: "flex", alignItems: "center", paddingLeft: 8, pointerEvents: "none" }}>
                            <div style={{ animation: "hintScrollLeft 1s ease-in-out infinite", color: "rgba(255,255,255,0.85)", display: "flex" }}>
                                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                            </div>
                        </div>
                    )}
                    {isMobile && !storiesScroll.atEnd && (
                        <div style={{ position: "absolute", right: 0, top: 0, height: 72, width: 72, background: "radial-gradient(ellipse at right center, #0a0a0e 0%, rgba(10,10,14,0.85) 40%, transparent 75%)", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 8, pointerEvents: "none" }}>
                            <div style={{ animation: "hintScrollRight 1s ease-in-out infinite", color: "rgba(255,255,255,0.85)", display: "flex" }}>
                                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                            </div>
                        </div>
                    )}
                    <div
                        ref={storiesScrollRef}
                        style={{
                            width: "100%",
                            display: "flex", gap: 20,
                            justifyContent: isMobile ? "flex-start" : "center",
                            overflowX: isMobile ? "auto" : "visible",
                            paddingLeft: isMobile ? 16 : 0,
                            paddingRight: isMobile ? 16 : 0,
                        }}
                    >
                        {liveStories.length === 0 ? (
                            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.3)", paddingLeft: 8 }}>No stories yet</p>
                        ) : liveStories.map((story, i) => (
                            <StoryBubble key={story.story_id} story={story} delay={i * 40} onClick={() => setViewStory(story)} />
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-bg" style={{ padding: `${isMobile ? "48px 16px 80px 16px" : "48px 48px 80px 128px"}`, position: "relative", zIndex: 2 }}>
                <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 24, background: "linear-gradient(90deg, var(--color-shimmer-a) 0%, var(--color-shimmer-a) 35%, var(--color-shimmer-b) 50%, var(--color-shimmer-a) 65%, var(--color-shimmer-a) 100%)", backgroundSize: "300% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "textShimmer 14s linear infinite" }}>
                    {t("home.browseByCategory")}
                </p>

                <Motion.div
                    variants={staggerContainerVariants}
                    initial="hidden"
                    animate="show"
                    style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : isTablet ? "repeat(3,1fr)" : "repeat(4,1fr)", gap: 14 }}
                >
                    {/* "home" is the page we're already on; "become" is the Earn hub (its own
                        sidebar entry + onboarding CTA) — neither is a browse-by-category
                        destination, so keep both out of this grid (bug reports #96/#97: "Earn"
                        was showing up as a category card on the home dashboard). */}
                    {navItems.filter(item => item.id !== "home" && item.id !== "become").map((item) => (
                        <PageCard
                            key={item.id}
                            item={item}
                            groupColor={pageColors[item.id] || groupColorMap[item.id] || "#2563eb"}
                            onNavigate={onNavigate}
                        />
                    ))}
                </Motion.div>
            </div>
        </div>
        </>
    );
}

function HubCategoryCard({ group, onNavigate, delay, selected, dimmed, onSelect }) {
	const [hovered, setHovered] = React.useState(false);
	const [hoveredPage, setHoveredPage] = React.useState(null);

	const hexToRgb = (hex) => {
		const r = parseInt(hex.slice(1,3),16);
		const g = parseInt(hex.slice(3,5),16);
		const b = parseInt(hex.slice(5,7),16);
		return `${r},${g},${b}`;
	};
	const rgb = hexToRgb(group.color);

	return (
		<TiltCard intensity={6} style={{ animation: `fadeUp 0.35s ease ${delay}ms both`, borderRadius: 16, opacity: dimmed ? 0.4 : 1 }}>
		<SpotlightCard color={`rgba(${rgb},0.15)`} size={280}
			onClick={e => { e.stopPropagation(); if (!selected) onSelect(); }}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			style={{
				borderRadius: 16,
				border: `1px solid ${selected ? group.color + "88" : hovered ? group.color + "44" : "var(--color-border-subtle)"}`,
				cursor: selected ? "default" : "pointer",
				transition: "border-color 0.25s, box-shadow 0.25s",
				boxShadow: selected ? `0 0 0 2px ${group.color}33, 0 16px 48px rgba(${rgb},0.3)` : hovered ? `0 12px 40px rgba(${rgb},0.25)` : "0 2px 12px rgba(0,0,0,0.3)",
				background: "var(--color-surface)",
			}}
		>
			{/* Visual thumbnail area */}
			<div style={{
				height: selected ? 120 : 180,
				background: `linear-gradient(135deg, rgba(${rgb},0.35) 0%, rgba(${rgb},0.08) 50%, rgba(6,8,16,0.9) 100%)`,
				position: "relative",
				display: "flex", alignItems: "center", justifyContent: "center",
				overflow: "hidden",
				transition: "height 0.3s cubic-bezier(0.4,0,0.2,1)",
			}}>
				<div style={{ position: "absolute", width: 180, height: 180, borderRadius: "50%", background: `rgba(${rgb},0.08)`, top: -40, right: -40 }} />
				<div style={{ position: "absolute", width: 100, height: 100, borderRadius: "50%", background: `rgba(${rgb},0.12)`, bottom: -20, left: 20 }} />
				{/* Icon + label row when selected */}
				<div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 1 }}>
					<div style={{
						width: selected ? 48 : 72, height: selected ? 48 : 72, borderRadius: selected ? 14 : 20,
						background: `rgba(${rgb},0.2)`,
						border: `1px solid rgba(${rgb},0.3)`,
						display: "flex", alignItems: "center", justifyContent: "center",
						color: group.color,
						transition: "width 0.3s, height 0.3s, border-radius 0.3s",
						flexShrink: 0,
					}}>
						<group.icon s={selected ? 24 : 36} />
					</div>
					{selected && (
						<div>
							<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: "0.04em", textTransform: "uppercase", lineHeight: 1.1 }}>{group.label}</p>
							<p className="text-text-secondary" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginTop: 3 }}>{group.pages.length} sections</p>
						</div>
					)}
				</div>
				{/* Close button when selected */}
				{selected && (
					<button
						onClick={e => { e.stopPropagation(); onSelect(); }}
						className="bg-surface-raised border border-border text-text-secondary"
						style={{ position: "absolute", top: 10, right: 10, width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
					>
						<svg width={12} height={12} viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"/></svg>
					</button>
				)}
				{!selected && (
					<div className="bg-surface-raised border border-border text-text-secondary" style={{ position: "absolute", top: 12, right: 12, padding: "3px 8px", borderRadius: 20, fontSize: 10, fontFamily: "'DM Sans', sans-serif" }}>
						{group.pages.length} pages
					</div>
				)}
			</div>

			{/* Collapsed: preview chips */}
			{!selected && (
				<div style={{ padding: "14px 16px 16px" }}>
					<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8 }}>{group.label}</p>
					<div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
						{group.pages.slice(0, 5).map(page => (
							<span key={page.id} className="text-text-secondary bg-surface-raised border border-border-subtle" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", borderRadius: 4, padding: "2px 7px" }}>
								{page.label}
							</span>
						))}
						{group.pages.length > 5 && (
							<span style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", color: group.color, background: `rgba(${rgb},0.1)`, border: `1px solid rgba(${rgb},0.2)`, borderRadius: 4, padding: "2px 7px" }}>
								+{group.pages.length - 5} more
							</span>
						)}
					</div>
				</div>
			)}

			{/* Expanded: full page list */}
			{selected && (
				<div style={{ padding: "12px 12px 16px" }}>
					<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
						{group.pages.map((page, pi) => (
							<button
								key={page.id}
								onClick={e => { e.stopPropagation(); onNavigate(page.id); }}
								onMouseEnter={() => setHoveredPage(page.id)}
								onMouseLeave={() => setHoveredPage(null)}
								style={{
									width: "100%", textAlign: "left", padding: "9px 12px",
									borderRadius: 10,
									background: hoveredPage === page.id ? `rgba(${rgb},0.15)` : "rgba(255,255,255,0.03)",
									border: `1px solid ${hoveredPage === page.id ? `rgba(${rgb},0.3)` : "transparent"}`,
									cursor: "pointer",
									display: "flex", alignItems: "center", gap: 10,
									transition: "background 0.15s, border-color 0.15s",
									animation: `fadeUp 0.2s ease ${pi * 30}ms both`,
								}}
							>
								<div style={{ width: 6, height: 6, borderRadius: "50%", background: hoveredPage === page.id ? group.color : "rgba(255,255,255,0.2)", flexShrink: 0, transition: "background 0.15s" }} />
								<span className={hoveredPage === page.id ? "text-text-primary" : "text-text-secondary"} style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, transition: "color 0.15s" }}>
									{page.label}
								</span>
								{hoveredPage === page.id && (
									<svg style={{ marginLeft: "auto" }} width={14} height={14} viewBox="0 0 14 14" fill="none"><path d="M3 7h8M7 3l4 4-4 4" stroke={group.color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"/></svg>
								)}
							</button>
						))}
					</div>
				</div>
			)}
		</SpotlightCard>
		</TiltCard>
	);
}

function PageCard({ item, groupColor, onNavigate }) {
	const { t } = useTranslation();
	const [hov, setHov] = React.useState(false);
	const [imageFailed, setImageFailed] = React.useState(false);
	const hexToRgb = hex => { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `${r},${g},${b}`; };
	const rgb = hexToRgb(groupColor);
	const label = sidebarNavLabel(item.id, item.label, t);
	const showImage = Boolean(item.image) && !imageFailed;
	const imageAreaBackground = showImage
		? "var(--color-surface-raised)"
		: `linear-gradient(145deg, rgba(${rgb},0.28) 0%, rgba(${rgb},0.10) 50%, var(--color-surface-raised) 100%)`;
	return (
		<Motion.div
			variants={staggerItemVariants}
			onClick={() => onNavigate(item.id)}
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			className="bg-surface"
			whileHover={{ y: -4 }}
			whileTap={{ scale: 0.97 }}
			transition={{ type: "spring", stiffness: 400, damping: 30 }}
			style={{
				borderRadius: 16,
				border: `1px solid ${hov ? groupColor + "55" : "var(--color-border-subtle)"}`,
				cursor: "pointer",
				display: "flex", flexDirection: "column",
				boxShadow: hov ? `0 10px 32px rgba(${rgb},0.25)` : "0 2px 10px var(--color-shadow)",
				transition: "border-color 0.18s, box-shadow 0.18s",
				overflow: "hidden",
			}}
		>
			{/* Image area — placeholder gradient, swap src prop later */}
			<div style={{
				width: "100%", height: 180,
				background: imageAreaBackground,
				display: "flex", alignItems: "center", justifyContent: "center",
				position: "relative", overflow: "hidden",
				flexShrink: 0,
			}}>
				{showImage && (
					<img
						src={item.image}
						alt={label}
						loading="lazy"
						onError={() => setImageFailed(true)}
						style={{
							position: "absolute",
							inset: 0,
							width: "100%",
							height: "100%",
							objectFit: "cover",
						}}
					/>
				)}
				{!showImage && (
					<div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 60% 35%, rgba(${rgb},0.18) 0%, transparent 70%)`, pointerEvents: "none" }} />
				)}
			</div>
			{/* Label bar */}
			<div className="bg-surface" style={{ padding: "10px 12px 12px" }}>
				<span className={hov ? "text-text-primary" : "text-text-secondary"} style={{
					fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12,
					lineHeight: 1.3, display: "block",
					transition: "color 0.18s",
				}}>
					{label}
				</span>
			</div>
		</Motion.div>
	);
}

export { SpotlightOverlay, NavHubPage, HubCategoryCard, PageCard };
