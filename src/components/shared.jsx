import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useViewport } from "../hooks/useViewport.js";
import { useTheme } from "../utils/theme.js";
import { loadGoogleMaps } from "../utils/googleMaps.js";
import { Skel, SkeletonCommentDark } from "./skeletons.jsx";
import { Tooltip } from "./Tooltip.jsx";
import { useDialog } from "./ConfirmDialog.jsx";
import { ProviderStatCard } from "./providerKit.jsx";
import { fmtMoney, fmtPayoutCad } from "../utils/regionConfig.js";
import {
  sellerOrderNet,
  sellerPayoutBucket,
  sellerWalletTotalsFromOrders,
  buildEarningsDataPoints,
  earningsExportWindow,
  filterOrdersInPeriod,
  earningsSummaryFromOrders,
} from "../utils/shopSellerHelpers.js";
import { SellerChatTab } from "./SellerChatTab.jsx";
import { getMyProfile, updateProfilePhoto } from "../api/social.js";
import { getVerticalProfile, updateVerticalProfile, updateVerticalProfilePhoto } from "../api/verticalProfile.js";
import client from "../api/client.js";
import { getUser, setUser, isAuthenticated } from "../store/auth.js";
import BookingListingForm from "./BookingListingForm.jsx";
import HlsVideo from "./HlsVideo.jsx";
import { Avatar, SafeImage } from "./SafeImage.jsx";
import i18n from "../i18n/index.js";
import { getMyReferralCode, getReferralOverview } from "../api/referral.js";
import {
  getCelebrityProfile,
  updateCelebrityProfile,
  uploadCelebrityImage,
} from "../api/celebrity.js";

/** Leave-guard so ProviderTopNav / SellerTabBar can confirm before leaving Edit Profile. */
let _sellerEditProfileLeaveGuard = null;
function registerSellerEditProfileLeaveGuard(fn) {
	_sellerEditProfileLeaveGuard = fn;
	return () => {
		if (_sellerEditProfileLeaveGuard === fn) _sellerEditProfileLeaveGuard = null;
	};
}
async function runSellerEditProfileLeaveGuard() {
	if (!_sellerEditProfileLeaveGuard) return true;
	try {
		return !!(await _sellerEditProfileLeaveGuard());
	} catch {
		return true;
	}
}

const EDIT_PROFILE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const EDIT_PROFILE_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function validateEditProfileImage(file) {
	if (!file) return i18n.t("shared.imageRequired", { defaultValue: "Please choose an image file." });
	const typeOk = EDIT_PROFILE_IMAGE_TYPES.includes(file.type) || /\.(jpe?g|png|webp|gif)$/i.test(file.name || "");
	if (!typeOk) {
		return i18n.t("shared.imageTypeInvalid", { defaultValue: "Use JPEG, PNG, WebP, or GIF." });
	}
	if (file.size > EDIT_PROFILE_MAX_IMAGE_BYTES) {
		return i18n.t("shared.imageTooLarge", { defaultValue: "Image must be 5 MB or smaller." });
	}
	return null;
}

function revokeIfBlobUrl(url) {
	if (url && String(url).startsWith("blob:")) {
		try { URL.revokeObjectURL(url); } catch { /* ignore */ }
	}
}

function isDocumentVerifiedUser(user) {
	return user?.document_verified === true || user?.document_verification_status === "verified";
}

function readUserVerificationStatus(user) {
	if (!user) {
		return { email: false, phone: false, id: false };
	}
	// Prefer explicit verification flags from the API; fall back to "has email" only when no flag exists.
	const emailExplicit = user.email_verified ?? user.is_email_verified ?? user.email_confirmed ?? user.verified_email;
	const emailOk = emailExplicit == null
		? !!(user.email && String(user.email).includes("@"))
		: emailExplicit === true;
	const phoneExplicit = user.phone_verified ?? user.is_phone_verified ?? user.phone_confirmed;
	const phoneOk = phoneExplicit === true;
	return {
		email: emailOk,
		phone: phoneOk,
		id: isDocumentVerifiedUser(user),
	};
}

function translateOrderStatus(status) {
	if (!status) return i18n.t("shared.statusCompleted");
	const norm = String(status).toLowerCase();
	const key = {
		completed: "shared.statusCompleted",
		processed: "shared.statusProcessed",
		pending: "shared.statusPending",
		cancelled: "shared.statusCancelled",
		canceled: "shared.statusCancelled",
	}[norm];
	return key ? i18n.t(key) : status;
}

function sharedMonthNames() {
	return [
		i18n.t("shared.monthJan"), i18n.t("shared.monthFeb"), i18n.t("shared.monthMar"),
		i18n.t("shared.monthApr"), i18n.t("shared.monthMay"), i18n.t("shared.monthJun"),
		i18n.t("shared.monthJul"), i18n.t("shared.monthAug"), i18n.t("shared.monthSep"),
		i18n.t("shared.monthOct"), i18n.t("shared.monthNov"), i18n.t("shared.monthDec"),
	];
}

function sharedDayNames() {
	return [
		i18n.t("shared.daySu"), i18n.t("shared.dayMo"), i18n.t("shared.dayTu"),
		i18n.t("shared.dayWe"), i18n.t("shared.dayTh"), i18n.t("shared.dayFr"),
		i18n.t("shared.daySa"),
	];
}

// A consistent "back to the /provider portal hub" link shown on every seller dashboard
// ("Become a ___" page). Uses the global window.__nav (set by AppInner) so the memoized
// header needs no extra nav prop threaded through ~40 dispatch branches.
function SellerHubBack() {
	return (
		<button
			onClick={() => { if (typeof window !== "undefined" && window.__nav) window.__nav("provider"); }}
			className="text-text-secondary"
			style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 12, padding: 0 }}
		>
			<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
			Become a Provider
		</button>
	);
}

const SellerDashHeader = React.memo(function SellerDashHeader({ title, subtitle, accentColor = "#2563eb", titleColor, children, rounded = false }) {
	const { isMobile } = useViewport();
	const labelColor = titleColor || accentColor;
	if (rounded) return (
		<div style={{ paddingTop: 16, paddingBottom: 4, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 40 }}>
			<SellerHubBack />
			<div style={{
				height: 190, borderRadius: 18, overflow: "hidden", position: "relative",
				background: `linear-gradient(135deg, ${accentColor}26 0%, var(--color-surface) 62%, var(--color-bg) 100%)`,
				border: `1px solid ${accentColor}33`,
				display: "flex", alignItems: "center", justifyContent: "center",
			}}>
				<div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% -10%, ${accentColor}26, transparent 62%)` }} />
				<div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
					<p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: labelColor, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 4 }}>{i18n.t("shared.sellerPortal")}</p>
					<h1 className="text-text-primary" style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.03em", textTransform: "uppercase", lineHeight: 1.02 }}>{title}</h1>
					<p className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>{subtitle}</p>
				</div>
				{children && <div style={{ position: "absolute", top: 14, right: 14, display: "flex", gap: 10 }}>{children}</div>}
			</div>
		</div>
	);
	return (
		<div className="border-b border-border-subtle" style={{
			background: `linear-gradient(135deg, ${accentColor}26 0%, var(--color-surface) 62%, var(--color-bg) 100%)`,
			marginLeft: isMobile ? 0 : 108,
			padding: isMobile ? "28px 16px 24px 16px" : "28px 40px 24px 28px",
		}}>
			<SellerHubBack />
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
				<div style={{ flex: 1, textAlign: "center" }}>
					<p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: labelColor, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 4 }}>{i18n.t("shared.sellerPortal")}</p>
					<h1 className="text-text-primary" style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.03em", textTransform: "uppercase", lineHeight: 1.02 }}>{title}</h1>
					<p className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>{subtitle}</p>
				</div>
				<div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
					{children}
				</div>
			</div>
		</div>
	);
});
const SellerStatCards = React.memo(function SellerStatCards({ stats, accentColor = "#2563eb", mobilePadding = "24px 16px 0 16px" }) {
	const { isMobile, isTablet } = useViewport();
	// Column count tracks stats.length (capped per breakpoint) instead of a hardcoded
	// 4, so a dashboard passing a 5th card (e.g. automotive's "Services Listed") gets
	// one even row instead of an orphaned card wrapping under the first 4. Every
	// existing 4-stat dashboard is unaffected: min(4, cap) === the old hardcoded value.
	const cols = isMobile ? Math.min(stats.length, 2) : isTablet ? Math.min(stats.length, 3) : Math.min(stats.length, 5);
	return (
		<div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 16, padding: `${isMobile ? mobilePadding : "24px 40px 0 108px"}` }}>
			{stats.map((s, i) => (
				<ProviderStatCard
					key={i}
					label={s.label}
					value={s.value}
					change={s.change}
					foot={s.foot || (s.change ? i18n.t("sellerDash.common.vsLastMonth") : undefined)}
					icon={s.icon}
					accentColor={s.c || accentColor}
					delay={i * 40}
				/>
			))}
		</div>
	);
});
function sellerTabLabel(tab) {
	const keyMap = {
		Overview: "tabOverview",
		Requests: "tabRequests",
		Earnings: "tabEarnings",
		Wallet: "tabWallet",
		Reviews: "tabReviews",
		"Edit Profile": "tabEditProfile",
		Orders: "tabOrders",
		Products: "tabProducts",
		Analytics: "tabAnalytics",
		Messages: "tabMessages",
		"Ref Code": "tabRefCode",
		Bookings: "tabBookings",
		Listings: "tabListings",
		Content: "tabContent",
		"Go Live": "tabGoLive",
		Menu: "tabMenu",
		Services: "tabServices",
		Applicants: "tabApplicants",
		Jobs: "tabJobs",
		Reservations: "tabReservations",
		VODs: "tabVods",
		"Media Kit": "tabMediaKit",
		Seasonal: "tabSeasonal",
		Rentals: "tabRentals",
		Shop: "tabShop",
	};
	const key = keyMap[tab];
	return key ? i18n.t(`sellerDash.common.${key}`) : tab;
}

const SellerTabBar = React.memo(function SellerTabBar({ tabs, active, onTab, accentColor = "#2563eb", badges = {} }) {
	const { isMobile } = useViewport();
	const scrollRef = useRef(null);
	const [scrollState, setScrollState] = useState({ hasOverflow: false, canScrollLeft: false, canScrollRight: false });

	const chevronW = isMobile ? 30 : 34;
	const edgePad = isMobile ? 16 : 40;
	const sidebarPad = isMobile ? 16 : 108;
	const tabScrollGutter = isMobile ? 10 : 14;

	const updateScrollState = React.useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		const maxScroll = el.scrollWidth - el.clientWidth;
		const hasOverflow = maxScroll > 4;
		setScrollState({
			hasOverflow,
			canScrollLeft: hasOverflow && el.scrollLeft > 4,
			canScrollRight: hasOverflow && el.scrollLeft < maxScroll - 4,
		});
	}, []);

	useLayoutEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		updateScrollState();
		el.addEventListener("scroll", updateScrollState, { passive: true });
		const ro = new ResizeObserver(updateScrollState);
		ro.observe(el);
		return () => {
			el.removeEventListener("scroll", updateScrollState);
			ro.disconnect();
		};
	}, [tabs, updateScrollState]);

	useLayoutEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const activeBtn = el.querySelector(`[data-seller-tab="${CSS.escape(active)}"]`);
		if (!activeBtn) return;
		const tabLeft = activeBtn.offsetLeft;
		const tabRight = tabLeft + activeBtn.offsetWidth;
		const viewLeft = el.scrollLeft;
		const viewRight = viewLeft + el.clientWidth;
		if (tabLeft < viewLeft + tabScrollGutter) {
			el.scrollTo({ left: Math.max(0, tabLeft - tabScrollGutter), behavior: "smooth" });
		} else if (tabRight > viewRight - tabScrollGutter) {
			el.scrollTo({ left: tabRight - el.clientWidth + tabScrollGutter, behavior: "smooth" });
		}
	}, [active, tabs, tabScrollGutter]);

	const scrollTabs = (direction) => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollBy({ left: direction * Math.max(120, el.clientWidth * 0.55), behavior: "smooth" });
	};

	const chevronBtnCls = (enabled) => enabled
		? "border border-border bg-surface-raised text-text-secondary"
		: "border border-border-subtle bg-surface text-text-muted";
	const chevronBtnStyle = (enabled) => ({
		flexShrink: 0,
		width: chevronW,
		height: 36,
		borderRadius: 8,
		cursor: enabled ? "pointer" : "default",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		padding: 0,
		transition: "background 0.15s, border-color 0.15s, color 0.15s",
	});

	return (
		<div
			className="border-b border-border-subtle"
			style={{
				display: "flex",
				alignItems: "center",
				gap: 6,
				width: "100%",
				minWidth: 0,
				padding: `20px ${edgePad}px 0 ${sidebarPad}px`,
				boxSizing: "border-box",
			}}
		>
			{scrollState.hasOverflow && (
				<button
					type="button"
					aria-label="Scroll tabs left"
					onClick={() => scrollTabs(-1)}
					disabled={!scrollState.canScrollLeft}
					className={chevronBtnCls(scrollState.canScrollLeft)}
					style={chevronBtnStyle(scrollState.canScrollLeft)}
				>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
				</button>
			)}
			<div
				ref={scrollRef}
				className="seller-tab-scroll"
				style={{
					display: "flex",
					gap: 4,
					flexWrap: "nowrap",
					flex: 1,
					minWidth: 0,
					overflowX: "auto",
					overflowY: "hidden",
					scrollbarWidth: "none",
					msOverflowStyle: "none",
					WebkitOverflowScrolling: "touch",
					touchAction: "pan-x",
					overscrollBehaviorX: "contain",
				}}
			>
				{tabs.map((t) => (
					<button
						key={t}
						data-seller-tab={t}
						onClick={async () => {
							if (t === active) return;
							if (!(await runSellerEditProfileLeaveGuard())) return;
							onTab(t);
						}}
						className={active === t ? "text-white" : "text-text-muted"}
						style={{
							padding: "8px 18px",
							borderRadius: "8px 8px 0 0",
							border: "none",
							cursor: "pointer",
							fontSize: 13,
							fontWeight: 600,
							fontFamily: "'DM Sans', sans-serif",
							background: active === t ? accentColor : "transparent",
							transition: "all 0.15s",
							flexShrink: 0,
							position: "relative",
							whiteSpace: "nowrap",
						}}
					>
						{sellerTabLabel(t)}
						{badges[t] > 0 && (
							<span
								style={{
									position: "absolute",
									top: 4,
									right: 6,
									width: 8,
									height: 8,
									borderRadius: "50%",
									background: "#ef4444",
									border: "1.5px solid var(--color-bg)",
								}}
							/>
						)}
					</button>
				))}
				<div aria-hidden style={{ flexShrink: 0, width: tabScrollGutter }} />
			</div>
			{scrollState.hasOverflow && (
				<button
					type="button"
					aria-label="Scroll tabs right"
					onClick={() => scrollTabs(1)}
					disabled={!scrollState.canScrollRight}
					className={chevronBtnCls(scrollState.canScrollRight)}
					style={chevronBtnStyle(scrollState.canScrollRight)}
				>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
				</button>
			)}
		</div>
	);
});

// ── Provider "command dashboard" top-nav ─────────────────────────────────────
// Adopts the internal-dashboard signature language — icon-tile nav items, a live
// clock, an operator avatar chip, and a highlighted active section — laid out
// HORIZONTALLY across the top instead of a left rail, while keeping the
// provider's own identity (per-vertical accent, Barlow Condensed headings, DM
// Sans body). Drop-in replacement for a dashboard's <SellerDashHeader> +
// <SellerTabBar> pair. Prototype lives on the Services dashboard first.

// Per-section line glyph (matches the icons.jsx stroke style). Falls back to a
// target-dot for any section without a dedicated glyph.
const PROVIDER_NAV_GLYPH = {
	Overview: "grid", Services: "briefcase", Requests: "inbox", Orders: "bag",
	Wallet: "wallet", Earnings: "trend", Analytics: "bars", Reviews: "star",
	Messages: "chat", Products: "box", "Edit Profile": "user", "Ref Code": "gift",
	Bookings: "inbox", Listings: "box", Menu: "box", Shop: "bag", Jobs: "briefcase",
	Applicants: "user", Reservations: "inbox", Content: "box", "Go Live": "chat",
	VODs: "box", "Media Kit": "box", Seasonal: "gift", Rentals: "box",
};
function PNIcon({ name, size = 14 }) {
	const g = PROVIDER_NAV_GLYPH[name] || "dot";
	const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
	switch (g) {
		case "grid": return (<svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>);
		case "briefcase": return (<svg {...p}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>);
		case "inbox": return (<svg {...p}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>);
		case "bag": return (<svg {...p}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>);
		case "wallet": return (<svg {...p}><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>);
		case "trend": return (<svg {...p}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>);
		case "bars": return (<svg {...p}><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>);
		case "star": return (<svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>);
		case "chat": return (<svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>);
		case "box": return (<svg {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>);
		case "user": return (<svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>);
		case "gift": return (<svg {...p}><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>);
		default: return (<svg {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>);
	}
}

// Which category each section falls under, so the nav can cluster them into
// Manage / Money / Account groups. Unknown sections default to Manage.
const PROVIDER_GROUP_ORDER = ["Manage", "Money", "Account"];
const PROVIDER_SECTION_GROUP = {
	Overview: "Manage", Services: "Manage", Products: "Manage", Orders: "Manage",
	Requests: "Manage", Bookings: "Manage", Listings: "Manage", Reservations: "Manage",
	Menu: "Manage", Shop: "Manage", Rentals: "Manage", Applicants: "Manage", Jobs: "Manage",
	Content: "Manage", "Go Live": "Manage", VODs: "Manage", "Media Kit": "Manage",
	Seasonal: "Manage", Messages: "Manage",
	Wallet: "Money", Earnings: "Money", Analytics: "Money",
	Reviews: "Account", "Edit Profile": "Account", "Ref Code": "Account",
};

const ProviderTopNav = React.memo(function ProviderTopNav({
	title,
	subtitle,
	accentColor = "#2563eb",
	titleColor,
	tabs,
	active,
	onTab,
	badges = {},
	children,
	rounded,
}) {
	const { isMobile } = useViewport();
	const [theme] = useTheme();
	// Fixed alpha over the surface reads as washed-out on light — punched up below.
	const isLight = theme === "light";
	const padX = isMobile ? 16 : 40;
	const padL = isMobile ? 16 : 108;

	// `tabs` is a fresh array each render, so key off a stable signature (not the array
	// identity) — otherwise the layout effect below would re-run every render → infinite loop.
	const tabsKey = tabs.join("|");
	// Cluster the flat `tabs` list into Manage / Money / Account groups (order preserved).
	const grouped = React.useMemo(() => {
		const buckets = { Manage: [], Money: [], Account: [] };
		tabs.forEach((t) => { (buckets[PROVIDER_SECTION_GROUP[t] || "Manage"]).push(t); });
		return PROVIDER_GROUP_ORDER.map((name) => ({ name, items: buckets[name] })).filter((g) => g.items.length);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tabsKey]);

	// Sliding glass indicator — measures the active section button and animates the glider to it.
	const navRef = useRef(null);
	const animRef = useRef(false);
	const lastRef = useRef(null);
	const [glider, setGlider] = useState(null);
	const tabScrollGutter = isMobile ? 10 : 14;

	const place = React.useCallback(() => {
		const nav = navRef.current;
		if (!nav) return;
		const sel = (typeof CSS !== "undefined" && CSS.escape) ? CSS.escape(active) : active;
		const btn = nav.querySelector(`[data-seller-tab="${sel}"]`);
		if (!btn) return;
		const nr = nav.getBoundingClientRect();
		const r = btn.getBoundingClientRect();
		const next = { x: r.left - nr.left + nav.scrollLeft, y: r.top - nr.top, w: r.width, h: r.height };
		const prev = lastRef.current;
		// skip redundant state updates so a stray re-render can't churn the glider
		if (prev && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5 && Math.abs(prev.w - next.w) < 0.5 && Math.abs(prev.h - next.h) < 0.5) return;
		lastRef.current = next;
		setGlider({ ...next, animate: animRef.current });
	}, [active]);

	useLayoutEffect(() => { place(); animRef.current = true; }, [place, tabsKey, isMobile]);
	useLayoutEffect(() => {
		const el = navRef.current;
		if (!el) return;
		const onScroll = () => {
			animRef.current = false;
			place();
			animRef.current = true;
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		const ro = new ResizeObserver(() => {
			animRef.current = false;
			place();
			animRef.current = true;
		});
		ro.observe(el);
		return () => {
			el.removeEventListener("scroll", onScroll);
			ro.disconnect();
		};
	}, [place, tabsKey]);

	useLayoutEffect(() => {
		const el = navRef.current;
		if (!el) return;
		const btn = el.querySelector(`[data-seller-tab="${CSS.escape(active)}"]`);
		if (!btn) return;
		const tabLeft = btn.offsetLeft;
		const tabRight = tabLeft + btn.offsetWidth;
		const viewLeft = el.scrollLeft;
		const viewRight = viewLeft + el.clientWidth;
		if (tabLeft < viewLeft + tabScrollGutter) {
			el.scrollTo({ left: Math.max(0, tabLeft - tabScrollGutter), behavior: "smooth" });
		} else if (tabRight > viewRight - tabScrollGutter) {
			el.scrollTo({ left: tabRight - el.clientWidth + tabScrollGutter, behavior: "smooth" });
		}
	}, [active, tabsKey, tabScrollGutter]);

	useEffect(() => {
		const onResize = () => { animRef.current = false; place(); animRef.current = true; };
		window.addEventListener("resize", onResize);
		let cancelled = false;
		if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
			document.fonts.ready.then(() => { if (!cancelled) { animRef.current = false; place(); animRef.current = true; } });
		}
		return () => { cancelled = true; window.removeEventListener("resize", onResize); };
	}, [place]);

	return (
		<div className="bg-bg">
			{/* Header — original PR#975 "premium" gradient banner (SellerDashHeader) */}
			<SellerDashHeader title={title} subtitle={subtitle} accentColor={accentColor} titleColor={titleColor} rounded={rounded}>
				{children}
			</SellerDashHeader>
			{/* Band B — grouped nav bar with swipe/scroll + sliding glass indicator */}
			<div style={{ padding: `12px ${padX}px 4px ${padL}px`, width: "100%", boxSizing: "border-box", minWidth: 0 }}>
				<div ref={navRef} className="seller-tab-scroll bg-surface border border-border" style={{
					position: "relative", display: "flex", alignItems: "stretch",
					width: "100%", maxWidth: "100%", minWidth: 0,
					borderRadius: 15, padding: "9px 14px",
					overflowX: "auto", overflowY: "hidden",
					scrollbarWidth: "none", msOverflowStyle: "none",
					WebkitOverflowScrolling: "touch", touchAction: "pan-x", overscrollBehaviorX: "contain",
				}}>
					{glider && (
						<span aria-hidden style={{
							position: "absolute", left: 0, top: 0, zIndex: 1, pointerEvents: "none",
							width: glider.w, height: glider.h, transform: `translate(${glider.x}px, ${glider.y}px)`,
							transition: glider.animate ? "transform .42s cubic-bezier(.34,1.35,.5,1), width .42s cubic-bezier(.34,1.35,.5,1), height .42s cubic-bezier(.34,1.35,.5,1)" : "none",
							borderRadius: 11, overflow: "hidden",
							background: `linear-gradient(135deg, ${accentColor}${isLight ? "8c" : "5c"}, ${accentColor}${isLight ? "50" : "2b"})`,
							border: `1px solid ${accentColor}${isLight ? "a0" : "70"}`,
							boxShadow: `0 4px 12px -6px ${accentColor}${isLight ? "80" : "52"}, inset 0 1px 0 rgba(255,255,255,0.22)`,
						}}>
							<span style={{ position: "absolute", top: 0, left: 0, right: 0, height: "40%", background: "linear-gradient(180deg, rgba(255,255,255,0.14), transparent)", borderRadius: "11px 11px 40px 40px" }} />
						</span>
					)}
					{grouped.map((grp, gi) => (
						<React.Fragment key={grp.name}>
							{gi > 0 && <span aria-hidden className="bg-border-subtle" style={{ width: 1, alignSelf: "stretch", borderRadius: 1, margin: "2px 12px" }} />}
							<div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8, flexShrink: 0 }}>
								<div className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", textAlign: "center" }}>
									{grp.name}
								</div>
								<div style={{ display: "flex", gap: 2 }}>
									{grp.items.map((t) => {
										const on = active === t;
										return (
											<button
												key={t}
												data-seller-tab={t}
												onClick={async () => {
													if (t === active) return;
													if (!(await runSellerEditProfileLeaveGuard())) return;
													onTab(t);
												}}
												className={on ? "text-white" : "text-text-secondary"}
												style={{
													position: "relative", zIndex: 2, flexShrink: 0,
													display: "flex", alignItems: "center", gap: 8,
													padding: "8px 13px", borderRadius: 11,
													border: "none", background: "transparent", cursor: "pointer",
													fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: on ? 700 : 600,
													letterSpacing: "0.01em", whiteSpace: "nowrap",
													transition: "color 0.28s",
												}}
											>
												<span className={on ? "text-white" : "text-text-secondary"} style={{ display: "flex", flexShrink: 0, transition: "color 0.28s" }}>
													<PNIcon name={t} />
												</span>
												{sellerTabLabel(t)}
												{badges[t] > 0 && (
													<span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />
												)}
											</button>
										);
									})}
								</div>
							</div>
						</React.Fragment>
					))}
					<div aria-hidden style={{ flexShrink: 0, width: tabScrollGutter }} />
				</div>
			</div>
		</div>
	);
});
const SellerRefCodeSection = React.memo(function SellerRefCodeSection({ showStats = true }) {
	const [loading, setLoading] = React.useState(true);
	const [loadError, setLoadError] = React.useState(null);
	const [code, setCode] = React.useState(null);
	const [username, setUsername] = React.useState(null);
	const [usageCount, setUsageCount] = React.useState(null);
	const [overview, setOverview] = React.useState(null);
	const [copied, setCopied] = React.useState(false);
	const [copiedUser, setCopiedUser] = React.useState(false);
	const [copiedLink, setCopiedLink] = React.useState(false);
	const [actionError, setActionError] = React.useState(null);
	const [sharing, setSharing] = React.useState(false);
	const copyTimers = React.useRef({});

	const clearCopyTimer = (key) => {
		if (copyTimers.current[key]) {
			clearTimeout(copyTimers.current[key]);
			delete copyTimers.current[key];
		}
	};

	React.useEffect(() => () => {
		Object.values(copyTimers.current).forEach(clearTimeout);
	}, []);

	const flashCopied = (key, setter) => {
		setter(true);
		clearCopyTimer(key);
		copyTimers.current[key] = setTimeout(() => setter(false), 2000);
	};

	const load = React.useCallback(async () => {
		setLoading(true);
		setLoadError(null);
		setActionError(null);
		const user = getUser();
		const cachedCode = user?.ref_code || null;
		const cachedUser = user?.username || user?.handle || null;
		if (cachedCode) setCode(cachedCode);
		if (cachedUser) setUsername(cachedUser);

		try {
			const [codeRes, overviewRes] = await Promise.allSettled([
				getMyReferralCode(),
				showStats ? getReferralOverview("28d") : Promise.resolve(null),
			]);

			if (codeRes.status === "fulfilled") {
				const payload = codeRes.value?.data ?? codeRes.value ?? {};
				const nextCode = payload.ref_code ?? payload.code ?? null;
				const nextUsage = payload.usage_count ?? payload.uses ?? null;
				if (nextCode) {
					setCode(nextCode);
					const current = getUser();
					if (current && current.ref_code !== nextCode) {
						try { setUser({ ...current, ref_code: nextCode }); } catch { /* ignore */ }
					}
				} else if (!cachedCode) {
					setCode(null);
				}
				if (nextUsage != null) setUsageCount(Number(nextUsage) || 0);
			} else if (!cachedCode) {
				setLoadError(
					codeRes.reason?.response?.data?.message
					?? i18n.t("shared.failedLoadRefCode", { defaultValue: "Could not load your referral code. Please try again." }),
				);
			}

			if (overviewRes.status === "fulfilled" && overviewRes.value) {
				setOverview(overviewRes.value?.data ?? overviewRes.value);
			}
		} catch (err) {
			if (!cachedCode) {
				setLoadError(err?.response?.data?.message ?? i18n.t("shared.failedLoadRefCode", { defaultValue: "Could not load your referral code. Please try again." }));
			}
		} finally {
			setLoading(false);
		}
	}, [showStats]);

	React.useEffect(() => { load(); }, [load]);

	const shareUrl = React.useMemo(() => {
		if (!code || typeof window === "undefined") return "";
		const origin = window.location?.origin || "https://strug.ca";
		return `${origin}/?ref=${encodeURIComponent(code)}`;
	}, [code]);

	const writeClipboard = async (text) => {
		if (!text) throw new Error("empty");
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return;
		}
		const ta = document.createElement("textarea");
		ta.value = text;
		ta.setAttribute("readonly", "");
		ta.style.position = "absolute";
		ta.style.left = "-9999px";
		document.body.appendChild(ta);
		ta.select();
		const ok = document.execCommand("copy");
		document.body.removeChild(ta);
		if (!ok) throw new Error("copy failed");
	};

	const handleCopy = async () => {
		if (!code) return;
		setActionError(null);
		try {
			await writeClipboard(code);
			flashCopied("code", setCopied);
		} catch {
			setActionError(i18n.t("shared.copyFailed", { defaultValue: "Could not copy. Please copy the code manually." }));
		}
	};

	const handleCopyUser = async () => {
		if (!username) return;
		setActionError(null);
		try {
			await writeClipboard(username);
			flashCopied("user", setCopiedUser);
		} catch {
			setActionError(i18n.t("shared.copyFailed", { defaultValue: "Could not copy. Please copy the code manually." }));
		}
	};

	const handleShare = async () => {
		if (!code || !shareUrl) return;
		setActionError(null);
		setSharing(true);
		try {
			if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
				await navigator.share({
					title: i18n.t("shared.shareReferralTitle", { defaultValue: "Join me on Strug" }),
					text: i18n.t("shared.shareReferralText", { code, defaultValue: `Use my referral code ${code} on Strug` }),
					url: shareUrl,
				});
			} else {
				await writeClipboard(shareUrl);
				flashCopied("link", setCopiedLink);
			}
		} catch (err) {
			if (err?.name === "AbortError") { /* user cancelled share sheet */ }
			else {
				try {
					await writeClipboard(shareUrl);
					flashCopied("link", setCopiedLink);
				} catch {
					setActionError(i18n.t("shared.shareFailed", { defaultValue: "Could not share. Copy your code instead." }));
				}
			}
		} finally {
			setSharing(false);
		}
	};

	const totals = overview?.summary || overview?.totals || {};
	const recruitedCount = totals.referred_users ?? usageCount ?? null;
	const lifetimeEarnings = totals.lifetime_total ?? totals.lifetime ?? null;
	const pendingEarnings = totals.pending_total ?? totals.pending ?? null;

	const fmtMoneyLocal = (n) => {
		if (n == null || Number.isNaN(Number(n))) return "—";
		return fmtMoney(Number(n));
	};

	const sectionLabelStyle = {
		fontSize: 12,
		fontWeight: 700,
		letterSpacing: "0.1em",
		textTransform: "uppercase",
		fontFamily: "'DM Sans', sans-serif",
		marginBottom: 12,
	};

	if (loading && !code) {
		return (
			<div role="status" aria-busy="true" aria-label={i18n.t("shared.loadingRefCode", { defaultValue: "Loading referral code" })} className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "20px 24px" }}>
				<Skel h={14} w="40%" style={{ marginBottom: 14 }} />
				<div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
					<Skel h={44} w="100%" r={10} />
					<Skel h={44} w={88} r={10} />
				</div>
				<Skel h={12} w="80%" />
				{showStats && (
					<div style={{ marginTop: 20 }}>
						<Skel h={14} w="30%" style={{ marginBottom: 12 }} />
						<Skel h={18} w="100%" style={{ marginBottom: 10 }} />
						<Skel h={18} w="100%" style={{ marginBottom: 10 }} />
						<Skel h={18} w="100%" />
					</div>
				)}
			</div>
		);
	}

	if (loadError && !code) {
		return (
			<div role="alert" className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "28px 24px", textAlign: "center" }}>
				<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 14 }}>{loadError}</p>
				<button
					type="button"
					onClick={() => load()}
					style={{ padding: "10px 20px", background: "var(--color-accent, #2563eb)", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
				>
					{i18n.t("common.retry", { defaultValue: "Retry" })}
				</button>
			</div>
		);
	}

	return (
		<div style={{ maxWidth: 520 }}>
			<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "20px 24px" }} aria-busy={loading || undefined}>
				<p className="text-text-secondary" style={sectionLabelStyle}>{i18n.t("shared.yourReferralCode")}</p>

				{actionError && (
					<div role="alert" style={{ background: "#ef444422", border: "1px solid #ef444444", borderRadius: 10, padding: "10px 14px", marginBottom: 12, color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>
						{actionError}
					</div>
				)}

				{code ? (
					<>
						<div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
							<div
								className="bg-surface-raised border border-border text-text-primary"
								style={{ flex: "1 1 160px", borderRadius: 10, padding: "10px 14px", fontFamily: "monospace", fontSize: 15, letterSpacing: "0.12em", minWidth: 0, wordBreak: "break-all" }}
								aria-label={i18n.t("shared.yourReferralCode")}
							>
								{code}
							</div>
							<button
								type="button"
								onClick={handleCopy}
								aria-label={i18n.t("shared.copyReferralCode", { defaultValue: "Copy referral code" })}
								style={{ padding: "10px 16px", background: copied ? "#22c55e" : "var(--color-accent, #2563eb)", border: "none", borderRadius: 10, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", flexShrink: 0 }}
							>
								{copied ? i18n.t("common.copied") : i18n.t("common.copy")}
							</button>
							<button
								type="button"
								onClick={handleShare}
								disabled={sharing}
								aria-label={i18n.t("shared.shareReferralCode", { defaultValue: "Share referral link" })}
								className="bg-surface-raised border border-border text-text-primary"
								style={{ padding: "10px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: sharing ? "default" : "pointer", opacity: sharing ? 0.7 : 1, flexShrink: 0 }}
							>
								{copiedLink
									? i18n.t("shared.linkCopied", { defaultValue: "Link copied" })
									: (sharing ? i18n.t("shared.sharing", { defaultValue: "Sharing…" }) : i18n.t("shared.share", { defaultValue: "Share" }))}
							</button>
						</div>
						<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginTop: 10, lineHeight: 1.45, marginBottom: username ? 14 : 0 }}>
							{i18n.t("shared.referralCodeHint")}
						</p>
						<span aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>
							{copied ? i18n.t("common.copied") : copiedLink ? i18n.t("shared.linkCopied", { defaultValue: "Link copied" }) : ""}
						</span>
					</>
				) : (
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: username ? 14 : 0 }}>
						{i18n.t("shared.noReferralCodeYet", { defaultValue: "Your referral code isn’t available yet. Try again in a moment, or check Account → Saved Ref Code." })}
					</p>
				)}

				{username && (
					<div className="border-t border-border-subtle" style={{ paddingTop: 14 }}>
						<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif", marginBottom: 8 }}>
							{i18n.t("shared.usernameAlsoCode")}
						</p>
						<div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
							<div className="bg-surface-raised border border-border text-text-primary" style={{ flex: "1 1 160px", borderRadius: 10, padding: "9px 14px", fontFamily: "monospace", fontSize: 14, letterSpacing: "0.08em", minWidth: 0, wordBreak: "break-all" }}>
								{username}
							</div>
							<button
								type="button"
								onClick={handleCopyUser}
								aria-label={i18n.t("shared.copyUsername", { defaultValue: "Copy username" })}
								style={{ padding: "9px 16px", background: copiedUser ? "#22c55e" : "var(--color-surface-raised)", border: copiedUser ? "none" : "1px solid var(--color-border)", borderRadius: 10, color: copiedUser ? "#fff" : "var(--color-text-primary)", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", flexShrink: 0 }}
							>
								{copiedUser ? i18n.t("common.copied") : i18n.t("common.copy")}
							</button>
						</div>
						<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginTop: 8, lineHeight: 1.45 }}>
							{i18n.t("shared.usernameReferralHint")}
						</p>
					</div>
				)}
			</div>

			{showStats && (
				<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "18px 22px", marginTop: 16 }}>
					<p className="text-text-secondary" style={{ ...sectionLabelStyle, marginBottom: 14 }}>
						{i18n.t("shared.referralStats", { defaultValue: "Referral Stats" })}
					</p>
					{[
						[i18n.t("sellerDash.common.totalReferrals", { defaultValue: "Total Referrals" }), recruitedCount != null ? String(recruitedCount) : "—"],
						[i18n.t("shared.pendingEarnings", { defaultValue: "Pending earnings" }), pendingEarnings != null ? fmtMoneyLocal(pendingEarnings) : "—"],
						[i18n.t("sellerDash.common.earningsFromRefs", { defaultValue: "Earnings from Refs" }), lifetimeEarnings != null ? fmtMoneyLocal(lifetimeEarnings) : "—"],
					].map(([label, value], i, arr) => (
						<div
							key={label}
							className={i < arr.length - 1 ? "border-b border-border-subtle" : undefined}
							style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, paddingBottom: 10, marginBottom: i < arr.length - 1 ? 10 : 0 }}
						>
							<span className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
							<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{value}</span>
						</div>
					))}
					<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginTop: 12, lineHeight: 1.4 }}>
						{i18n.t("shared.referralStatsHint", { defaultValue: "Stats refresh from your Affiliate activity. Full details are in Account → Saved Ref Code." })}
					</p>
				</div>
			)}
		</div>
	);
});
const SellerAddBtn = React.memo(function SellerAddBtn({ label, color = "#2563eb", onClick }) {
	const [hov, setHov] = React.useState(false);
	const [theme] = useTheme();
	const isLight = theme === "light";
	return (
		<button
			onClick={onClick}
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			style={{
				padding: "8px 18px 8px 8px", borderRadius: 24, cursor: "pointer",
				display: "inline-flex", alignItems: "center", gap: 10,
				fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700,
				color: "var(--color-text-primary)",
				background: hov
					? `linear-gradient(135deg, ${color}${isLight ? "60" : "38"}, ${color}${isLight ? "30" : "17"})`
					: `linear-gradient(135deg, ${color}${isLight ? "45" : "26"}, ${color}${isLight ? "20" : "0d"})`,
				border: `1px solid ${hov ? `${color}${isLight ? "a0" : "70"}` : `${color}${isLight ? "80" : "4d"}`}`,
				boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)",
				transform: hov ? "translateY(-1px)" : "none",
				transition: "transform 0.18s, background 0.2s, border-color 0.2s",
			}}
		>
			<span style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `${color}${isLight ? "40" : "24"}`, border: `1px solid ${color}${isLight ? "60" : "40"}`, color: "var(--color-text-primary)" }}>
				<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
			</span>
			{label}
		</button>
	);
});


function unwrapWalletPayload(res) {
	if (!res || typeof res !== "object") return null;
	const data = res.data && typeof res.data === "object" && (res.data.available_balance != null || res.data.pending_balance != null)
		? res.data
		: res;
	if (data.available_balance == null && data.pending_balance == null && data.total_earned == null) return null;
	return data;
}

const PAYOUT_STATUS_COLORS = { PENDING: "#fbbf24", APPROVED: "#60a5fa", PAID: "#4ade80", REJECTED: "#f87171" };

const SellerWalletTab = React.memo(function SellerWalletTab({
	color,
	orders = [],
	fetchWallet,
	fetchTransactions,
	scopeNote,
	requestPayout,
	fetchConnectStatus,
	startConnectOnboarding,
	fetchPayoutHistory,
	payoutMode = false,
}) {
	const derived = React.useMemo(() => sellerWalletTotalsFromOrders(orders), [orders]);
	const [ledger, setLedger] = React.useState(null);
	const [txRows, setTxRows] = React.useState(null);
	const [connect, setConnect] = React.useState(null);
	const [payouts, setPayouts] = React.useState([]);
	const [amount, setAmount] = React.useState("");
	const [busy, setBusy] = React.useState(false);
	const [msg, setMsg] = React.useState(null);
	const [walletTick, setWalletTick] = React.useState(0);
	const [walletLoading, setWalletLoading] = React.useState(typeof fetchWallet === "function");
	const [walletError, setWalletError] = React.useState(false);
	const [payoutDialog, { confirm: confirmPayout }] = useDialog();
	const payoutReady = payoutMode || typeof requestPayout === "function";
	const useCad = payoutReady;
	const money = useCad ? fmtPayoutCad : fmtMoney;

	React.useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const connectFlag = params.get("connect");
		if (connectFlag !== "done" && connectFlag !== "refresh") return undefined;
		setMsg({
			type: connectFlag === "done" ? "success" : "warning",
			text: connectFlag === "done"
				? i18n.t("sd.live.connectReturned", { defaultValue: "Payout setup updated. Status will refresh shortly." })
				: i18n.t("sd.live.connectRefresh", { defaultValue: "Finish payout setup to receive automatic transfers." }),
		});
		params.delete("connect");
		const qs = params.toString();
		window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
		return undefined;
	}, []);

	React.useEffect(() => {
		if (typeof fetchWallet !== "function") {
			setLedger(null);
			setWalletError(false);
			setWalletLoading(false);
			return undefined;
		}
		let cancelled = false;
		setWalletLoading(true);
		setWalletError(false);
		fetchWallet()
			.then((res) => {
				if (cancelled) return;
				setLedger(unwrapWalletPayload(res));
				setWalletError(false);
			})
			.catch(() => {
				if (!cancelled) {
					setLedger(null);
					setWalletError(true);
				}
			})
			.finally(() => {
				if (!cancelled) setWalletLoading(false);
			});
		return () => { cancelled = true; };
	}, [fetchWallet, walletTick, payoutMode]);

	React.useEffect(() => {
		if (typeof fetchTransactions !== "function") {
			setTxRows(null);
			return undefined;
		}
		let cancelled = false;
		fetchTransactions({ limit: 50 })
			.then((res) => {
				if (cancelled) return;
				const rows = Array.isArray(res) ? res : (res?.data ?? []);
				setTxRows(Array.isArray(rows) ? rows : []);
			})
			.catch(() => {
				if (!cancelled) setTxRows(null);
			});
		return () => { cancelled = true; };
	}, [fetchTransactions, walletTick]);

	React.useEffect(() => {
		if (!payoutReady || typeof fetchConnectStatus !== "function") {
			setConnect(null);
			return undefined;
		}
		let cancelled = false;
		fetchConnectStatus()
			.then((res) => { if (!cancelled) setConnect(res); })
			.catch(() => { if (!cancelled) setConnect(null); });
		return () => { cancelled = true; };
	}, [payoutReady, fetchConnectStatus, walletTick]);

	React.useEffect(() => {
		if (!payoutReady || typeof fetchPayoutHistory !== "function") {
			setPayouts([]);
			return undefined;
		}
		let cancelled = false;
		fetchPayoutHistory()
			.then((res) => {
				if (cancelled) return;
				const rows = Array.isArray(res) ? res : (res?.data ?? []);
				setPayouts(Array.isArray(rows) ? rows : []);
			})
			.catch(() => { if (!cancelled) setPayouts([]); });
		return () => { cancelled = true; };
	}, [payoutReady, fetchPayoutHistory, walletTick]);

	const ledgerAvailable = ledger?.available_balance != null ? parseFloat(ledger.available_balance) : null;
	const ledgerPending = ledger?.pending_balance != null ? parseFloat(ledger.pending_balance) : null;
	const ledgerLifetime = ledger?.total_earned != null ? parseFloat(ledger.total_earned) : null;
	const ledgerReady = !walletLoading && !walletError && ledger != null;
	const walletWaitingForVendor = payoutReady && typeof fetchWallet !== "function";
	const available = payoutReady
		? (ledgerReady ? ledgerAvailable : null)
		: (ledgerAvailable != null ? ledgerAvailable : derived.available);
	const pending = payoutReady
		? (ledgerReady ? ledgerPending : null)
		: (ledgerPending != null ? ledgerPending : derived.pending);
	const lifetime = payoutReady
		? (ledgerReady ? ledgerLifetime : null)
		: (ledgerLifetime != null ? ledgerLifetime : derived.lifetime);
	const formatBalance = (val) => {
		if (payoutReady && !ledgerReady) return "—";
		return money(val ?? 0);
	};
	const canRequestPayout = typeof requestPayout === "function";
	const canRequest = canRequestPayout && ledgerReady && ledgerAvailable != null && ledgerAvailable >= 100 && !busy;
	const needMinCad = canRequestPayout && ledgerReady && !busy && ledgerAvailable != null && ledgerAvailable < 100;
	const hasPendingPayout = payouts.some((p) => p.status === "PENDING");
	const accent = color || "#22c55e";
	const availableColor = ledgerReady && (Number(available) || 0) < 0 ? "#f87171" : ledgerReady ? "#22c55e" : "var(--color-text-muted)";
	const msgColor = msg?.type === "success" ? "#4ade80" : msg?.type === "warning" ? "#f59e0b" : "#f87171";

	const onboard = async () => {
		if (typeof startConnectOnboarding !== "function") return;
		setBusy(true);
		setMsg(null);
		try {
			const r = await startConnectOnboarding();
			if (r?.url) { window.location.href = r.url; return; }
			setMsg({ type: "error", text: r?.message || i18n.t("sd.live.connectUnavailable", { defaultValue: "Payout connect is unavailable right now." }) });
		} catch (err) {
			const message = err?.response?.data?.message || err?.message;
			setMsg({ type: "error", text: message || i18n.t("sd.live.connectUnavailable", { defaultValue: "Payout connect is unavailable right now." }) });
		} finally {
			setBusy(false);
		}
	};

	const submitPayout = async () => {
		const amt = Number(amount);
		if (!Number.isFinite(amt) || amt < 100) {
			setMsg({ type: "error", text: i18n.t("sd.live.payoutMin", { defaultValue: "Minimum payout is CAD 100." }) });
			return;
		}
		if (ledgerAvailable != null && amt > ledgerAvailable) {
			setMsg({ type: "error", text: i18n.t("sd.live.payoutInsufficient", { defaultValue: "Amount exceeds your balance." }) });
			return;
		}
		const ok = await confirmPayout({
			title: i18n.t("sd.live.payoutConfirmTitle", { defaultValue: "Request payout?" }),
			message: i18n.t("sd.live.payoutConfirmMsg", { defaultValue: "Request a payout of {{amt}}? This holds the funds while it is reviewed.", amt: money(amt) }),
			confirmText: i18n.t("sd.live.payoutConfirmCta", { defaultValue: "Request payout" }),
		});
		if (!ok) return;
		setBusy(true);
		setMsg(null);
		try {
			await requestPayout(amt);
			setAmount("");
			setMsg({ type: "success", text: i18n.t("sd.live.payoutRequested", { defaultValue: "Payout requested. A platform admin will review it on Admin → Food Payouts." }) });
			setWalletTick((n) => n + 1);
		} catch (e) {
			const m = e?.response?.data?.message;
			const status = e?.response?.status;
			const stripeDown = status === 503 || (typeof m === "string" && /stripe/i.test(m));
			setMsg({
				type: "error",
				text: m === "Insufficient_Balance"
					? i18n.t("sd.live.payoutInsufficient", { defaultValue: "Amount exceeds your balance." })
					: m === "Invalid_Amount"
						? i18n.t("sd.live.payoutInvalidAmount", { defaultValue: "Enter a valid amount of at least CAD 100." })
						: stripeDown
							? i18n.t("sd.live.payoutStripeUnavailable", { defaultValue: "Payouts are temporarily unavailable. Try again later." })
							: i18n.t("common.somethingWrong", { defaultValue: "Something went wrong." }),
			});
		} finally {
			setBusy(false);
		}
	};

	const renderHistoryRow = (o, i, { ledgerTxn = false } = {}) => {
		const isLedgerTxn = ledgerTxn || (typeof o.source === "string" && String(o.source).startsWith("food_"));
		const bucket = isLedgerTxn
			? (o.type === "debit" || o.source === "food_order_reverse" || o.source === "food_payout_hold" ? "none" : "available")
			: sellerPayoutBucket(o.status ?? o.rawStatus);
		const net = isLedgerTxn
			? Math.abs(parseFloat(o.amount) || 0)
			: (bucket === "none" ? 0 : sellerOrderNet(o));
		const dateRaw = o.created_at ?? o.date;
		const dateStr = dateRaw ? new Date(dateRaw).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
		const tone = bucket === "available" ? "#22c55e" : bucket === "pending" ? "#f59e0b" : "#94a3b8";
		const signed = isLedgerTxn && (o.type === "debit" || o.source === "food_order_reverse" || o.source === "food_payout_hold") ? "-" : (bucket === "available" ? "+" : "");
		const amountLabel = !isLedgerTxn && bucket === "none"
			? i18n.t("shared.noPayout", { defaultValue: "No payout" })
			: `${signed}${money(net)}`;
		const title = isLedgerTxn
			? (o.description || i18n.t("shared.walletTxn", { defaultValue: "Wallet transaction" }))
			: i18n.t("shared.orderLabel", { id: o.id ?? `#${i + 1}` });
		const statusLabel = isLedgerTxn ? (o.source || o.type) : translateOrderStatus(o.status);
		return (
			<div key={o.transaction_id ?? o._id ?? o.id ?? i} className="bg-surface border border-border-subtle" style={{ borderRadius: 12, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
				<div>
					<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{title}</p>
					<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>{dateStr}</p>
				</div>
				<div style={{ textAlign: "right" }}>
					<p style={{ fontSize: 14, fontWeight: 700, color: tone, fontFamily: "'DM Sans', sans-serif" }}>{amountLabel}</p>
					<span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: `${tone}22`, color: tone }}>{statusLabel}</span>
				</div>
			</div>
		);
	};

	return (
		<div>
			{payoutDialog}
			<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
				<div className="bg-surface border border-border-subtle" style={{ borderRadius: 16, padding: "20px 22px", borderTop: `3px solid ${accent}` }}>
					<p className="text-text-muted" style={{ fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{i18n.t("shared.availableBalance")}</p>
					<p className="text-text-primary" style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em", color: availableColor }}>{formatBalance(available)}</p>
				</div>
				<div className="bg-surface border border-border-subtle" style={{ borderRadius: 16, padding: "20px 22px" }}>
					<p className="text-text-muted" style={{ fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{i18n.t("shared.pendingBalance", { defaultValue: "Pending Balance" })}</p>
					<p className="text-text-primary" style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em", color: ledgerReady ? "#f59e0b" : "var(--color-text-muted)" }}>{formatBalance(pending)}</p>
				</div>
			</div>
			<div className="bg-surface border border-border-subtle" style={{ borderRadius: 16, padding: "24px 28px", marginBottom: 20 }}>
				<p className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>{i18n.t("shared.lifetimeNetEarnings", { amount: formatBalance(lifetime) })}</p>
				{walletWaitingForVendor && (
					<p className="text-text-muted" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}>{i18n.t("shared.walletWaitingForVendor", { defaultValue: "Loading your store profile…" })}</p>
				)}
				{walletLoading && !walletWaitingForVendor && (
					<p className="text-text-muted" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}>{i18n.t("shared.walletLoading", { defaultValue: "Loading wallet…" })}</p>
				)}
				{walletError && (
					<div style={{ marginBottom: 12 }}>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#f87171", margin: 0 }}>{i18n.t("shared.walletLoadError", { defaultValue: "Couldn't load wallet. Try again." })}</p>
						<button type="button" onClick={() => setWalletTick((n) => n + 1)} style={{ marginTop: 8, background: accent, color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
							{i18n.t("shared.walletRetry", { defaultValue: "Retry" })}
						</button>
					</div>
				)}
				{payoutReady && !walletWaitingForVendor ? (
					<>
						<div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
							{connect?.payouts_enabled ? (
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#4ade80" }}>● {i18n.t("sd.live.connectReady", { defaultValue: "Connected — payouts sent automatically" })}</span>
							) : (
								<>
									<button type="button" onClick={onboard} disabled={busy || typeof startConnectOnboarding !== "function"} style={{ background: accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif" }}>
										{connect?.connected ? i18n.t("sd.live.connectFinish", { defaultValue: "Finish payout setup" }) : i18n.t("sd.live.connectStart", { defaultValue: "Connect payouts" })}
									</button>
									<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("sd.live.connectOptional", { defaultValue: "Optional — otherwise payouts are sent manually." })}</span>
								</>
							)}
						</div>
						<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
							<input
								type="number"
								min="100"
								step="0.01"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
								placeholder={i18n.t("sd.live.payoutAmount", { defaultValue: "Amount (CAD, min 100)" })}
								aria-label={i18n.t("sd.live.payoutAmount", { defaultValue: "Amount (CAD, min 100)" })}
								className="bg-bg border border-border text-text-primary"
								style={{ borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "'DM Sans', sans-serif", width: 220 }}
							/>
							<button type="button" onClick={submitPayout} disabled={!canRequest} style={{ background: canRequest ? accent : "var(--color-surface-raised)", color: canRequest ? "#fff" : "var(--color-text-muted)", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: canRequest ? "pointer" : "not-allowed", fontFamily: "'DM Sans', sans-serif" }}>
								{i18n.t("sd.live.payoutRequest", { defaultValue: "Request payout" })}
							</button>
						</div>
						{needMinCad && (
							<p className="text-text-muted" style={{ margin: "8px 0 0", fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
								{i18n.t("sd.live.payoutNeed100", { defaultValue: "Available must be at least CAD 100." })}
							</p>
						)}
						{msg && (
							<p style={{ margin: "12px 0 0", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: msgColor }}>{msg.text}</p>
						)}
						{payouts.length > 0 && (
							<div style={{ marginTop: 18, borderTop: "1px solid var(--color-border-subtle)", paddingTop: 14 }}>
								<p className="text-text-muted" style={{ margin: "0 0 8px", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase" }}>{i18n.t("sd.live.payoutHistory", { defaultValue: "Payout History" })}</p>
								{hasPendingPayout && (
									<p className="text-text-muted" style={{ margin: "0 0 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.45 }}>
										{i18n.t("sd.live.payoutPendingHelp", { defaultValue: "PENDING is waiting for a platform admin on Admin → Food Payouts." })}
									</p>
								)}
								<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
									{payouts.slice(0, 20).map((p) => (
										<div key={p.payout_id}>
											<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
												<span className="text-text-primary">{money(p.amount)}</span>
												<span style={{ display: "flex", alignItems: "center", gap: 10 }}>
													<span className="text-text-muted" style={{ fontSize: 11 }}>{p.created_at ? new Date(p.created_at).toLocaleDateString() : ""}</span>
													<span style={{ color: PAYOUT_STATUS_COLORS[p.status] || "var(--color-text-secondary)", fontSize: 11, fontWeight: 600 }}>{p.status}</span>
												</span>
											</div>
										</div>
									))}
								</div>
							</div>
						)}
					</>
				) : (
					<>
						<button disabled className="bg-surface-raised border border-border text-text-muted" style={{ padding: "10px 24px", borderRadius: 10, fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "not-allowed" }}>{i18n.t("shared.withdrawComingSoon")}</button>
						<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginTop: 8 }}>{i18n.t("shared.manualPayoutNote")}</p>
					</>
				)}
				<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginTop: 8, lineHeight: 1.45 }}>
					{payoutReady || ledger
						? i18n.t("shared.walletLedgerNote", { defaultValue: "Available is settled net minus withdrawals. Pending is paid but not yet fulfilled." })
						: i18n.t("shared.walletEstimateNote", { defaultValue: "Estimated seller net after the 21% platform fee. Not a withdrawable ledger until payouts ship." })}
				</p>
				{scopeNote ? (
					<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginTop: 6, lineHeight: 1.45 }}>{scopeNote}</p>
				) : null}
			</div>
			{txRows && txRows.length > 0 && (
				<>
					<p className="text-text-muted" style={{ fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{i18n.t("shared.ledgerHistory", { defaultValue: "Ledger" })}</p>
					<div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
						{txRows.slice(0, 50).map((o, i) => renderHistoryRow(o, i, { ledgerTxn: true }))}
					</div>
				</>
			)}
			<p className="text-text-muted" style={{ fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{i18n.t("shared.orderHistory")}</p>
			{orders.length === 0 ? (
				<p className="text-text-muted" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{i18n.t("shared.noOrdersYet")}</p>
			) : (
				<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
					{orders.slice(0, 50).map((o, i) => renderHistoryRow(o, i))}
				</div>
			)}
		</div>
	);
});
/** Clamp a star rating to an integer 0–5 (safe for String.repeat). */
function clampReviewStars(value) {
	const n = Math.round(Number(value));
	if (!Number.isFinite(n) || n <= 0) return 0;
	return Math.min(5, n);
}

/** Parse review stars; returns null when missing/invalid (never invents a 5★ default). */
function parseReviewStars(r) {
	const raw = r?.stars ?? r?.rating;
	if (raw == null || raw === "") return null;
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) return null;
	return clampReviewStars(n);
}

function reviewStarGlyphs(filled) {
	const n = clampReviewStars(filled);
	return `${"★".repeat(n)}${"☆".repeat(5 - n)}`;
}

function reviewStableId(r, index) {
	const id = r?.id ?? r?.rating_id ?? r?.food_order_rating_id ?? r?.order_id;
	return id != null && id !== "" ? String(id) : `idx-${index}`;
}

function reviewSortTime(r) {
	const raw = r?.created_at ?? r?.date ?? r?.sortedAt ?? null;
	if (!raw) return 0;
	const t = new Date(raw).getTime();
	return Number.isFinite(t) ? t : 0;
}

/**
 * Shared seller Reviews tab — stats, distribution, list.
 * Reply compose is off by default (no seller-reply API); server-side replies still display.
 */
const SellerReviewsTab = React.memo(function SellerReviewsTab({
	color,
	reviews = [],
	loading = false,
	error = null,
	onRetry = null,
	avgRating = null,
	reviewCount = null,
	emptyTitle = null,
	emptyHint = null,
	allowReply = false,
	onReply = null,
}) {
	const { isMobile } = useViewport();
	const [starFilter, setStarFilter] = React.useState(0);
	const [replyId, setReplyId] = React.useState(null);
	const [replyText, setReplyText] = React.useState("");
	const [replyBusy, setReplyBusy] = React.useState(false);
	const [replyError, setReplyError] = React.useState(null);
	const [localReplies, setLocalReplies] = React.useState({});
	const [liveMsg, setLiveMsg] = React.useState("");

	const list = Array.isArray(reviews) ? reviews : [];
	const rated = list
		.map((r) => ({ r, stars: parseReviewStars(r) }))
		.filter((x) => x.stars != null);

	const computedAvg = rated.length
		? rated.reduce((s, x) => s + x.stars, 0) / rated.length
		: null;
	const serverAvg = avgRating != null && Number.isFinite(Number(avgRating)) ? Number(avgRating) : null;
	const displayAvg = serverAvg != null ? serverAvg : computedAvg;
	const avgLabel = displayAvg != null ? (Math.round(displayAvg * 10) / 10).toFixed(1) : null;
	const avgFilled = displayAvg != null ? clampReviewStars(Math.round(displayAvg)) : 0;
	const totalCount = reviewCount != null && Number.isFinite(Number(reviewCount))
		? Number(reviewCount)
		: list.length;

	const dist = [5, 4, 3, 2, 1].map((star) => ({
		star,
		count: rated.filter((x) => x.stars === star).length,
	}));
	const distDenom = Math.max(rated.length, 1);

	const sortedFiltered = React.useMemo(() => {
		const rows = list
			.map((r, i) => ({ r, i, stars: parseReviewStars(r), id: reviewStableId(r, i) }))
			.filter((x) => (starFilter > 0 ? x.stars === starFilter : true));
		rows.sort((a, b) => reviewSortTime(b.r) - reviewSortTime(a.r));
		return rows;
	}, [list, starFilter]);

	const handleSend = async (id) => {
		const text = replyText.trim();
		if (!text || replyBusy) return;
		if (text.length > 1000) {
			setReplyError(i18n.t("shared.replyTooLong", { defaultValue: "Reply must be 1000 characters or fewer." }));
			return;
		}
		if (!allowReply || typeof onReply !== "function") return;
		setReplyBusy(true);
		setReplyError(null);
		try {
			await onReply(id, text);
			setLocalReplies((v) => ({ ...v, [id]: text }));
			setReplyId(null);
			setReplyText("");
			setLiveMsg(i18n.t("shared.replySent", { defaultValue: "Reply sent." }));
		} catch (err) {
			const msg = err?.message || i18n.t("shared.replyFailed", { defaultValue: "Couldn't send reply. Try again." });
			setReplyError(msg);
			setLiveMsg(msg);
		} finally {
			setReplyBusy(false);
		}
	};

	if (loading) {
		return (
			<div role="status" aria-busy="true" aria-label={i18n.t("shared.reviewsLoading", { defaultValue: "Loading reviews" })} style={{ padding: "24px 0" }}>
				<div className="bg-surface border border-border-subtle" style={{ borderRadius: 16, padding: isMobile ? 18 : "24px 28px", marginBottom: 16 }}>
					<Skel w="40%" h={48} style={{ marginBottom: 12 }} />
					<Skel w="100%" h={10} style={{ marginBottom: 8 }} />
					<Skel w="90%" h={10} style={{ marginBottom: 8 }} />
					<Skel w="70%" h={10} />
				</div>
				<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: 18, marginBottom: 12 }}>
					<Skel w="35%" h={14} style={{ marginBottom: 10 }} />
					<Skel w="100%" h={12} />
				</div>
				<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: 18 }}>
					<Skel w="30%" h={14} style={{ marginBottom: 10 }} />
					<Skel w="85%" h={12} />
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div style={{ textAlign: "center", padding: "48px 16px" }} role="alert">
				<p className="text-text-muted" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "0.04em", textTransform: "uppercase" }}>
					{i18n.t("shared.reviewsLoadError", { defaultValue: "Couldn't load reviews" })}
				</p>
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginTop: 8, maxWidth: 420, marginInline: "auto", lineHeight: 1.5 }}>
					{typeof error === "string" ? error : i18n.t("shared.reviewsLoadErrorHint", { defaultValue: "Check your connection and try again." })}
				</p>
				{typeof onRetry === "function" && (
					<button
						type="button"
						onClick={onRetry}
						style={{ marginTop: 16, padding: "10px 18px", background: color, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
					>
						{i18n.t("shared.reviewsRetry", { defaultValue: "Retry" })}
					</button>
				)}
			</div>
		);
	}

	if (list.length === 0) {
		return (
			<div style={{ textAlign: "center", padding: "48px 0" }}>
				<p className="text-text-muted" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "0.04em", textTransform: "uppercase" }}>
					{emptyTitle || i18n.t("shared.noReviewsYet")}
				</p>
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginTop: 8, maxWidth: 420, marginInline: "auto", lineHeight: 1.5 }}>
					{emptyHint || i18n.t("shared.completeOrdersForReview")}
				</p>
			</div>
		);
	}

	return (
		<div>
			<span
				aria-live="polite"
				style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
			>
				{liveMsg}
			</span>
			<div
				className="bg-surface border border-border-subtle"
				style={{
					borderRadius: 16,
					padding: isMobile ? "18px 16px" : "24px 28px",
					marginBottom: 24,
					display: "flex",
					flexDirection: isMobile ? "column" : "row",
					gap: isMobile ? 20 : 32,
					alignItems: isMobile ? "stretch" : "center",
					maxWidth: "100%",
					overflow: "hidden",
				}}
			>
				<div style={{ textAlign: "center", flexShrink: 0 }}>
					<p className="text-text-primary" style={{ fontSize: isMobile ? 44 : 56, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>
						{avgLabel ?? "—"}
					</p>
					<p
						style={{ fontSize: 18, color: "#f59e0b", marginTop: 4, letterSpacing: 1 }}
						aria-label={i18n.t("shared.ratingOutOfFive", { rating: avgFilled, defaultValue: `${avgFilled} of 5 stars` })}
					>
						{reviewStarGlyphs(avgFilled)}
					</p>
					<p className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>
						{i18n.t("shared.reviewsCount", { count: totalCount })}
					</p>
				</div>
				<div style={{ flex: 1, minWidth: 0, width: "100%" }} role="list" aria-label={i18n.t("shared.ratingDistribution", { defaultValue: "Rating distribution" })}>
					{dist.map(({ star, count }) => (
						<div key={star} role="listitem" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
							<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", width: 14, flexShrink: 0 }}>{star}</span>
							<div
								className="bg-surface-raised"
								style={{ flex: 1, minWidth: 0, height: 7, borderRadius: 4, overflow: "hidden" }}
								role="progressbar"
								aria-valuenow={count}
								aria-valuemin={0}
								aria-valuemax={rated.length}
								aria-label={i18n.t("shared.starBarLabel", { star, count, defaultValue: `${star} stars: ${count}` })}
							>
								<div style={{ width: `${(count / distDenom) * 100}%`, height: "100%", background: color, borderRadius: 4 }} />
							</div>
							<span className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", width: 20, flexShrink: 0, textAlign: "right" }}>{count}</span>
						</div>
					))}
				</div>
			</div>

			<div
				role="group"
				aria-label={i18n.t("shared.filterByRating", { defaultValue: "Filter by rating" })}
				style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 14 }}
			>
				{[
					{ value: 0, label: "All", ariaLabel: i18n.t("shared.filterAllRatings", { defaultValue: "All ratings" }) },
					...[5, 4, 3, 2, 1].map((s) => ({
						value: s,
						label: `${s}★`,
						ariaLabel: i18n.t("shared.filterStars", { count: s, defaultValue: `${s} stars` }),
					})),
				].map((opt) => {
					const active = starFilter === opt.value;
					return (
						<button
							key={opt.value}
							type="button"
							aria-pressed={active}
							aria-label={opt.ariaLabel}
							onClick={() => setStarFilter(opt.value)}
							style={{
								padding: "6px 12px",
								borderRadius: 999,
								border: "none",
								outline: "none",
								cursor: "pointer",
								fontSize: 12,
								fontWeight: active ? 700 : 500,
								fontFamily: "'DM Sans', sans-serif",
								background: active ? `${color}33` : "transparent",
								color: active ? color : "var(--color-text-muted)",
								boxShadow: "none",
								transition: "background 0.15s, color 0.15s",
							}}
							onFocus={(e) => {
								e.currentTarget.style.boxShadow = `0 0 0 2px ${color}66`;
							}}
							onBlur={(e) => {
								e.currentTarget.style.boxShadow = "none";
							}}
						>
							{opt.label}
						</button>
					);
				})}
			</div>

			{sortedFiltered.length === 0 ? (
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: "24px 0", textAlign: "center" }}>
					{i18n.t("shared.noReviewsMatchFilter", { defaultValue: "No reviews match this filter." })}
				</p>
			) : (
				<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
					{sortedFiltered.map(({ r, stars, id }) => {
						const comment = String(r.comment ?? r.text ?? "").trim();
						const serverReply = r.reply ?? r.seller_reply ?? r.vendor_reply ?? null;
						const shownReply = localReplies[id] || serverReply;
						const contextLine = r.listing || (r.order_id != null ? i18n.t("shared.orderLabel", { id: r.order_id }) : null);
						const filled = stars ?? 0;
						return (
							<div key={id} className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: isMobile ? "14px 16px" : "18px 22px" }}>
								<div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
									<div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
										<div
											style={{
												width: 34,
												height: 34,
												borderRadius: "50%",
												background: `${color}33`,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												fontSize: 13,
												fontWeight: 700,
												color,
												flexShrink: 0,
											}}
											aria-hidden
										>
											{(r.name ?? "U")[0]}
										</div>
										<div style={{ minWidth: 0 }}>
											<p className="text-text-primary" style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
												{r.name ?? i18n.t("shared.anonymous")}
											</p>
											<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", margin: "2px 0 0" }}>
												{[r.date, contextLine].filter(Boolean).join(" · ")}
											</p>
										</div>
									</div>
									<div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
										<span
											style={{ fontSize: 13, color: "#f59e0b", letterSpacing: 1 }}
											aria-label={i18n.t("shared.ratingOutOfFive", { rating: filled, defaultValue: `${filled} of 5 stars` })}
										>
											{reviewStarGlyphs(filled)}
										</span>
										<span className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
											{filled}/5
										</span>
									</div>
								</div>
								{comment ? (
									<p className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5, marginBottom: 10, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
										{comment}
									</p>
								) : (
									<p className="text-text-muted" style={{ fontSize: 12.5, fontFamily: "'DM Sans', sans-serif", fontStyle: "italic", marginBottom: 10 }}>
										{i18n.t("shared.noWrittenComment", { defaultValue: "No written comment" })}
									</p>
								)}
								{shownReply ? (
									<div className="bg-surface-raised" style={{ borderRadius: 8, padding: "10px 14px" }}>
										<p className="text-text-muted" style={{ fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", marginBottom: 3 }}>
											{i18n.t("shared.yourReply")}
										</p>
										<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
											{shownReply}
										</p>
									</div>
								) : allowReply && typeof onReply === "function" ? (
									replyId === id ? (
										<div>
											<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8 }}>
												<input
													value={replyText}
													onChange={(e) => setReplyText(e.target.value)}
													onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(id); } }}
													placeholder={i18n.t("shared.writeReply")}
													aria-label={i18n.t("shared.writeReply")}
													disabled={replyBusy}
													maxLength={1000}
													className="bg-surface-raised border border-border text-text-primary"
													style={{ flex: 1, padding: "9px 13px", borderRadius: 8, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none" }}
												/>
												<div style={{ display: "flex", gap: 8 }}>
													<button
														type="button"
														onClick={() => handleSend(id)}
														disabled={replyBusy || !replyText.trim()}
														aria-label={i18n.t("common.send")}
														style={{ padding: "9px 16px", background: color, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: replyBusy ? "default" : "pointer", opacity: replyBusy || !replyText.trim() ? 0.6 : 1 }}
													>
														{replyBusy ? i18n.t("shared.saving", { defaultValue: "Saving..." }) : i18n.t("common.send")}
													</button>
													<button
														type="button"
														onClick={() => { setReplyId(null); setReplyText(""); setReplyError(null); }}
														disabled={replyBusy}
														className="bg-surface-raised text-text-muted"
														style={{ padding: "9px 14px", border: "none", borderRadius: 8, fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
													>
														{i18n.t("common.cancel")}
													</button>
												</div>
											</div>
											{replyError && (
												<p role="alert" style={{ color: "#ef4444", fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginTop: 8 }}>{replyError}</p>
											)}
										</div>
									) : (
										<button
											type="button"
											onClick={() => { setReplyId(id); setReplyText(""); setReplyError(null); }}
											className="bg-surface-raised border border-border text-text-secondary"
											style={{ padding: "6px 14px", borderRadius: 8, fontSize: 11, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
										>
											{i18n.t("common.reply")}
										</button>
									)
								) : null}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
});
// `vertical` (e.g. "rideshare", "food", "work") scopes this editor to a per-vertical
// identity so seller-dashboard edits never bleed into the user's main (Social) profile
// (bug #3). When omitted it falls back to onLoad/onUploadPhoto, then the legacy shared
// social-profile behaviour.
//
// Identity field values use stable keys (business_name, display_name, bio, website,
// location, prep_time). onLoad may still return translated labels; those are normalized.
// onSave receives both stable keys and legacy label keys for dashboard back-compat.
const SellerEditProfileTab = React.memo(function SellerEditProfileTab({
	config,
	onSave,
	vertical,
	onLoad,
	onUploadPhoto,
	onRemovePhoto,
	onUploadCover,
	onRemoveCover,
	onUploadBanner,
	onRemoveBanner,
}) {
	const profileFields = (config && config.profileFields) || [];
	const fieldsKey = profileFields.map((row) => row[0]).join("\0");
	const fields = React.useMemo(
		() => profileFields,
		// eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by field labels
		[fieldsKey],
	);
	const bizLabel = (config && config.businessNameLabel) || i18n.t("shared.fieldBusinessName");
	const hideWebsite = !!(config && config.hideWebsite);
	const hidePrepTime = !!(config && config.hidePrepTime);
	const isStoreProfile = !!(config && config.isStoreProfile);
	const labelDisplayName = i18n.t("shared.fieldDisplayName");
	const labelBio = i18n.t("shared.fieldBio");
	const labelWebsite = i18n.t("shared.fieldWebsite");
	const labelLocation = i18n.t("shared.fieldLocation");
	const labelPrepTime = i18n.t("shared.fieldPrepTime");

	const [dialog, { confirm }] = useDialog();
	const [saved, setSaved] = React.useState(false);
	const [saveError, setSaveError] = React.useState(null);
	const [mediaError, setMediaError] = React.useState(null);
	const [fieldErrors, setFieldErrors] = React.useState({});
	const [saving, setSaving] = React.useState(false);
	const [loading, setLoading] = React.useState(true);
	const [loadError, setLoadError] = React.useState(null);
	const [vals, setVals] = React.useState({});
	const [snapshot, setSnapshot] = React.useState(null);
	const [photoUrl, setPhotoUrl] = React.useState(null);
	const [photoUploading, setPhotoUploading] = React.useState(false);
	const [photoRemoving, setPhotoRemoving] = React.useState(false);
	const photoInputRef = React.useRef(null);
	const [coverUrl, setCoverUrl] = React.useState(null);
	const [coverUploading, setCoverUploading] = React.useState(false);
	const [coverRemoving, setCoverRemoving] = React.useState(false);
	const coverInputRef = React.useRef(null);
	const [bannerUrl, setBannerUrl] = React.useState(null);
	const [bannerUploading, setBannerUploading] = React.useState(false);
	const [bannerRemoving, setBannerRemoving] = React.useState(false);
	const bannerInputRef = React.useRef(null);
	const loadGenRef = React.useRef(0);
	const onLoadRef = React.useRef(onLoad);
	React.useEffect(() => { onLoadRef.current = onLoad; }, [onLoad]);
	const verification = React.useMemo(() => readUserVerificationStatus(getUser()), []);

	const normalizeLoadedVals = React.useCallback((data = {}) => {
		const next = { ...data };
		const pairs = [
			["business_name", bizLabel],
			["display_name", labelDisplayName],
			["bio", labelBio],
			["website", labelWebsite],
			["location", labelLocation],
			["prep_time", labelPrepTime],
		];
		for (const [stable, label] of pairs) {
			if ((next[stable] == null || next[stable] === "") && next[label] != null && next[label] !== "") {
				next[stable] = next[label];
			}
			if (next[stable] == null) next[stable] = "";
		}
		return next;
	}, [bizLabel, labelDisplayName, labelBio, labelWebsite, labelLocation, labelPrepTime]);

	const valsForSave = React.useCallback((current) => {
		const out = { ...current };
		out.business_name = current.business_name ?? "";
		out.display_name = current.display_name ?? "";
		out.bio = current.bio ?? "";
		out.website = current.website ?? "";
		out.location = current.location ?? "";
		out.prep_time = current.prep_time ?? "";
		// Legacy label keys for dashboards that still read translated labels.
		out[bizLabel] = out.business_name;
		out[labelDisplayName] = out.display_name;
		out[labelBio] = out.bio;
		out[labelWebsite] = out.website;
		out[labelLocation] = out.location;
		out[labelPrepTime] = out.prep_time;
		return out;
	}, [bizLabel, labelDisplayName, labelBio, labelWebsite, labelLocation, labelPrepTime]);

	const identitySnapshot = React.useCallback((v) => JSON.stringify({
		business_name: v.business_name ?? "",
		display_name: v.display_name ?? "",
		bio: v.bio ?? "",
		website: v.website ?? "",
		location: v.location ?? "",
		prep_time: v.prep_time ?? "",
		lat: v.lat ?? null,
		lng: v.lng ?? null,
		...Object.fromEntries(
			fields.map(([label]) => [label, v[label] ?? ""]),
		),
	}), [fields]);

	const isDirty = snapshot != null && identitySnapshot(vals) !== snapshot;

	const commitSnapshot = React.useCallback((v) => {
		setSnapshot(identitySnapshot(v));
	}, [identitySnapshot]);

	const applyLoadedData = React.useCallback((data) => {
		const normalized = normalizeLoadedVals(data || {});
		setVals(normalized);
		commitSnapshot(normalized);
		// Always sync media from the load payload (including explicit null clears) so a
		// removed banner/cover does not linger when the tab remounts.
		const nextPhoto = data?.photo_url || data?.profile_pic_url || null;
		setPhotoUrl(nextPhoto);
		setCoverUrl(data?.cover_url ?? null);
		setBannerUrl(data?.banner_url ?? null);
		return normalized;
	}, [normalizeLoadedVals, commitSnapshot]);

	const loadProfile = React.useCallback(() => {
		const gen = ++loadGenRef.current;
		const loadFn = onLoadRef.current;
		setLoading(true);
		setLoadError(null);
		let cancelled = false;

		const finish = () => {
			if (!cancelled && gen === loadGenRef.current) setLoading(false);
		};

		const overlayVertical = () => {
			if (!vertical) {
				finish();
				return Promise.resolve();
			}
			return getVerticalProfile(vertical)
				.then((r) => r?.data ?? {})
				.then((profile) => {
					if (cancelled || gen !== loadGenRef.current) return;
					setVals((prev) => {
						const next = { ...prev };
						if (profile.business_name && !String(next.business_name || "").trim()) next.business_name = profile.business_name;
						if (profile.display_name && !String(next.display_name || "").trim()) next.display_name = profile.display_name;
						if (profile.bio && !String(next.bio || "").trim()) next.bio = profile.bio;
						if (profile.website && !String(next.website || "").trim()) next.website = profile.website;
						if (profile.location && !String(next.location || "").trim()) next.location = profile.location;
						Promise.resolve().then(() => {
							if (!cancelled && gen === loadGenRef.current) commitSnapshot(next);
						});
						return next;
					});
					// When onLoad owns storefront media (food/shop), never resurrect cover/banner
					// from vertical profile after an intentional remove. Only fill empty photo.
					if (!loadFn) {
						const pic = profile.profile_pic_url ?? profile.photo_url;
						if (pic) setPhotoUrl(pic);
						if (profile.cover_url) setCoverUrl(profile.cover_url);
						if (profile.banner_url) setBannerUrl(profile.banner_url);
					} else {
						const pic = profile.profile_pic_url ?? profile.photo_url;
						if (pic) {
							setPhotoUrl((prev) => prev || pic);
						}
					}
				})
				.catch(() => {})
				.finally(finish);
		};

		const failLoad = (err) => {
			if (cancelled || gen !== loadGenRef.current) return;
			setLoadError(err?.response?.data?.message ?? i18n.t("shared.failedLoadProfile", { defaultValue: "Could not load profile. Please try again." }));
			finish();
		};

		if (vertical && loadFn) {
			loadFn()
				.then((data) => {
					if (cancelled || gen !== loadGenRef.current) return;
					applyLoadedData(data);
					return overlayVertical();
				})
				.catch(() => {
					if (cancelled || gen !== loadGenRef.current) return;
					return overlayVertical();
				});
		} else if (vertical) {
			overlayVertical();
		} else if (loadFn) {
			loadFn()
				.then((data) => {
					if (cancelled || gen !== loadGenRef.current) return;
					applyLoadedData(data);
					finish();
				})
				.catch(failLoad);
		} else {
			getMyProfile()
				.then((profile) => {
					if (cancelled || gen !== loadGenRef.current) return;
					applyLoadedData({
						display_name: profile.display_name ?? "",
						bio: profile.bio ?? "",
						website: profile.website ?? "",
						location: profile.location ?? "",
						photo_url: profile.photo_url || null,
					});
					finish();
				})
				.catch(failLoad);
		}

		return () => { cancelled = true; };
	}, [vertical, applyLoadedData, commitSnapshot]);

	React.useEffect(() => {
		const cleanup = loadProfile();
		return typeof cleanup === "function" ? cleanup : undefined;
	}, [loadProfile]);

	const isDirtyRef = React.useRef(false);
	React.useEffect(() => {
		isDirtyRef.current = isDirty;
	}, [isDirty]);

	React.useEffect(() => {
		return registerSellerEditProfileLeaveGuard(async () => {
			if (!isDirtyRef.current) return true;
			return confirm({
				title: i18n.t("shared.unsavedChangesTitle", { defaultValue: "Unsaved changes" }),
				message: i18n.t("shared.unsavedChangesMessage", { defaultValue: "You have unsaved profile changes. Leave without saving?" }),
				confirmLabel: i18n.t("shared.discardChanges", { defaultValue: "Discard" }),
				cancelLabel: i18n.t("shared.keepEditing", { defaultValue: "Keep editing" }),
				danger: true,
			});
		});
	}, [confirm]);

	React.useEffect(() => {
		if (!isDirty) return undefined;
		const onBeforeUnload = (e) => {
			e.preventDefault();
			e.returnValue = "";
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	}, [isDirty]);

	const set = (k, v) => {
		setVals((prev) => ({ ...prev, [k]: v }));
		setFieldErrors((prev) => {
			if (!prev[k]) return prev;
			const next = { ...prev };
			delete next[k];
			return next;
		});
	};

	const resetFileInput = (ref) => {
		if (ref.current) ref.current.value = "";
	};

	const handlePhotoChange = async (e) => {
		const file = e.target.files?.[0];
		resetFileInput(photoInputRef);
		if (!file) return;
		const invalid = validateEditProfileImage(file);
		if (invalid) {
			setMediaError(invalid);
			return;
		}
		const previous = photoUrl;
		const preview = URL.createObjectURL(file);
		setPhotoUrl(preview);
		setPhotoUploading(true);
		setMediaError(null);
		try {
			let remoteUrl = null;
			// Prefer operational onUploadPhoto (food/shop) over vertical — otherwise Change Photo
			// only writes vertical_profile and reload resurrects the old vendor/store logo.
			if (onUploadPhoto) {
				const result = await onUploadPhoto(file);
				remoteUrl = result?.photo_url || result?.profile_pic_url || null;
			} else if (vertical) {
				const result = await updateVerticalProfilePhoto(vertical, file);
				remoteUrl = result?.profile_pic_url ?? result?.photo_url ?? null;
			} else {
				const result = await updateProfilePhoto(file);
				remoteUrl = result?.photo_url ?? null;
			}

			if (remoteUrl) {
				revokeIfBlobUrl(preview);
				setPhotoUrl(remoteUrl);
			} else {
				revokeIfBlobUrl(preview);
				setPhotoUrl(previous);
				setMediaError(i18n.t("shared.failedUploadPhoto", { defaultValue: "Photo upload failed. Please try again." }));
			}
			if (previous && previous !== remoteUrl) revokeIfBlobUrl(previous);
		} catch (err) {
			revokeIfBlobUrl(preview);
			setPhotoUrl(previous);
			setMediaError(err?.response?.data?.message ?? i18n.t("shared.failedUploadPhoto", { defaultValue: "Photo upload failed. Please try again." }));
		}
		setPhotoUploading(false);
	};

	const handleRemovePhoto = async () => {
		if (!photoUrl || photoRemoving) return;
		setPhotoRemoving(true);
		setMediaError(null);
		const previous = photoUrl;
		try {
			if (onRemovePhoto) await onRemovePhoto();
			revokeIfBlobUrl(previous);
			setPhotoUrl(null);
		} catch (err) {
			setMediaError(err?.response?.data?.message ?? i18n.t("shared.failedRemovePhoto", { defaultValue: "Could not remove photo. Please try again." }));
		}
		setPhotoRemoving(false);
	};

	const handleCoverChange = async (e) => {
		const file = e.target.files?.[0];
		resetFileInput(coverInputRef);
		if (!file || !onUploadCover) return;
		const invalid = validateEditProfileImage(file);
		if (invalid) {
			setMediaError(invalid);
			return;
		}
		const previous = coverUrl;
		const preview = URL.createObjectURL(file);
		setCoverUrl(preview);
		setCoverUploading(true);
		setMediaError(null);
		try {
			const result = await onUploadCover(file);
			if (result?.cover_url) {
				revokeIfBlobUrl(preview);
				setCoverUrl(result.cover_url);
			} else {
				revokeIfBlobUrl(preview);
				setCoverUrl(previous);
				setMediaError(i18n.t("shared.failedUploadCover", { defaultValue: "Cover upload failed. Please try again." }));
			}
			if (previous && previous !== result?.cover_url) revokeIfBlobUrl(previous);
		} catch (err) {
			revokeIfBlobUrl(preview);
			setCoverUrl(previous);
			setMediaError(err?.response?.data?.message ?? i18n.t("shared.failedUploadCover", { defaultValue: "Cover upload failed. Please try again." }));
		}
		setCoverUploading(false);
	};

	const handleRemoveCover = async () => {
		if (!coverUrl || coverRemoving) return;
		setCoverRemoving(true);
		setMediaError(null);
		const previous = coverUrl;
		try {
			if (onRemoveCover) await onRemoveCover();
			revokeIfBlobUrl(previous);
			setCoverUrl(null);
		} catch (err) {
			setMediaError(err?.response?.data?.message ?? i18n.t("shared.failedRemoveCover", { defaultValue: "Could not remove cover. Please try again." }));
		}
		setCoverRemoving(false);
	};

	const handleBannerChange = async (e) => {
		const file = e.target.files?.[0];
		resetFileInput(bannerInputRef);
		if (!file || !onUploadBanner) return;
		const invalid = validateEditProfileImage(file);
		if (invalid) {
			setMediaError(invalid);
			return;
		}
		const previous = bannerUrl;
		const preview = URL.createObjectURL(file);
		setBannerUrl(preview);
		setBannerUploading(true);
		setMediaError(null);
		try {
			const result = await onUploadBanner(file);
			if (result?.banner_url) {
				revokeIfBlobUrl(preview);
				setBannerUrl(result.banner_url);
			} else {
				revokeIfBlobUrl(preview);
				setBannerUrl(previous);
				setMediaError(i18n.t("shared.failedUploadBanner", { defaultValue: "Banner upload failed. Please try again." }));
			}
			if (previous && previous !== result?.banner_url) revokeIfBlobUrl(previous);
		} catch (err) {
			revokeIfBlobUrl(preview);
			setBannerUrl(previous);
			setMediaError(err?.response?.data?.message ?? i18n.t("shared.failedUploadBanner", { defaultValue: "Banner upload failed. Please try again." }));
		}
		setBannerUploading(false);
	};

	const handleRemoveBanner = async () => {
		if (!bannerUrl || bannerRemoving) return;
		setBannerRemoving(true);
		setMediaError(null);
		const previous = bannerUrl;
		try {
			if (onRemoveBanner) await onRemoveBanner();
			revokeIfBlobUrl(previous);
			setBannerUrl(null);
		} catch (err) {
			setMediaError(err?.response?.data?.message ?? i18n.t("shared.failedRemoveBanner", { defaultValue: "Could not remove banner. Please try again." }));
		}
		setBannerRemoving(false);
	};

	const validateForm = () => {
		const errors = {};
		if (!String(vals.business_name || "").trim()) {
			errors.business_name = i18n.t("shared.businessNameRequired", { defaultValue: "Business name is required." });
		}
		if (!hideWebsite && vals.website && String(vals.website).trim()) {
			const site = String(vals.website).trim();
			if (!/^https?:\/\/.+/i.test(site) && !/^[a-z0-9.-]+\.[a-z]{2,}/i.test(site)) {
				errors.website = i18n.t("shared.websiteInvalid", { defaultValue: "Enter a valid website URL." });
			}
		}
		const seatingLabel = i18n.t("sellerDash.common.seatingCapacity", { defaultValue: "Seating capacity" });
		const seatingVal = vals[seatingLabel];
		if (seatingVal != null && String(seatingVal).trim() !== "") {
			const n = parseInt(String(seatingVal).trim(), 10);
			if (!Number.isFinite(n) || n < 1) {
				errors[seatingLabel] = i18n.t("shared.seatingInvalid", { defaultValue: "Seating capacity must be a positive number." });
			}
		}
		setFieldErrors(errors);
		return Object.keys(errors).length === 0;
	};

	const handleSave = async () => {
		setSaveError(null);
		if (!validateForm()) {
			setSaveError(i18n.t("shared.fixFixErrors", { defaultValue: "Please fix the highlighted fields." }));
			return;
		}
		setSaving(true);
		const payload = valsForSave(vals);
		try {
			if (vertical) {
				await updateVerticalProfile(vertical, {
					business_name: payload.business_name ?? "",
					display_name: payload.display_name ?? "",
					bio: payload.bio ?? "",
					...(hideWebsite ? {} : { website: payload.website ?? "" }),
					location: payload.location ?? "",
				});
			}
			if (onSave) await onSave(payload);
		} catch (e) {
			setSaveError(e?.response?.data?.message ?? i18n.t("shared.failedSave"));
			setSaving(false);
			return;
		}
		commitSnapshot(vals);
		setSaving(false);
		setSaved(true);
		setTimeout(() => setSaved(false), 2500);
	};

	const handleDiscard = () => {
		if (!snapshot) return;
		try {
			const parsed = JSON.parse(snapshot);
			setVals((prev) => ({ ...prev, ...parsed }));
			setFieldErrors({});
			setSaveError(null);
		} catch { /* ignore */ }
	};

	const sectionLabelStyle = {
		fontSize: 12,
		fontWeight: 700,
		fontFamily: "'DM Sans', sans-serif",
		textTransform: "uppercase",
		letterSpacing: "0.08em",
		marginBottom: 12,
	};
	const btnSecondary = {
		padding: "9px 18px",
		borderRadius: 10,
		fontSize: 12,
		fontWeight: 600,
		fontFamily: "'DM Sans', sans-serif",
	};
	const btnDanger = {
		padding: "9px 14px",
		background: "rgba(239,68,68,0.14)",
		border: "1px solid rgba(239,68,68,0.35)",
		borderRadius: 10,
		color: "#f87171",
		fontSize: 12,
		fontWeight: 600,
		fontFamily: "'DM Sans', sans-serif",
	};

	const defaultFields = isStoreProfile ? [
		["business_name", bizLabel, "text", i18n.t("shared.placeholderMyBusiness")],
		["location", labelLocation, "text", i18n.t("shared.placeholderStoreAddress")],
		["bio", labelBio, "textarea", i18n.t("shared.tellAboutStore")],
		...(!hidePrepTime ? [["prep_time", labelPrepTime, "text", i18n.t("shared.placeholderPrepTime")]] : []),
	] : [
		["business_name", bizLabel, "text", i18n.t("shared.placeholderMyBusiness")],
		["display_name", labelDisplayName, "text", i18n.t("shared.placeholderYourName")],
		["bio", labelBio, "textarea", i18n.t("shared.tellAboutYou")],
		...(hideWebsite ? [] : [["website", labelWebsite, "text", i18n.t("shared.placeholderWebsite")]]),
		["location", labelLocation, "text", i18n.t("shared.placeholderCityCountry")],
	];

	const photoAlt = (vals.business_name || vals.display_name || i18n.t("shared.profilePhoto")) + " — " + i18n.t("shared.profilePhoto");
	const acceptImages = "image/jpeg,image/png,image/webp,image/gif";
	const showBanner = typeof onUploadBanner === "function";
	const showCover = typeof onUploadCover === "function";
	const mediaBusy = photoUploading || coverUploading || bannerUploading;

	if (loading) {
		return (
			<div role="status" aria-busy="true" aria-label={i18n.t("shared.loadingProfile", { defaultValue: "Loading profile" })} style={{ padding: "24px 0" }}>
				<div className="bg-surface border border-border-subtle" style={{ borderRadius: 16, padding: "24px 20px", marginBottom: 20 }}>
					<Skel h={14} w="30%" style={{ marginBottom: 16 }} />
					<div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 24 }}>
						<Skel h={72} w={72} r={36} />
						<Skel h={36} w={120} r={10} />
					</div>
					<Skel h={14} w="24%" style={{ marginBottom: 12 }} />
					<Skel h={100} w="100%" r={12} style={{ marginBottom: 20 }} />
					<Skel h={40} w="100%" r={10} style={{ marginBottom: 12 }} />
					<Skel h={40} w="100%" r={10} />
				</div>
			</div>
		);
	}

	if (loadError) {
		return (
			<div role="alert" style={{ padding: "32px 16px", textAlign: "center" }}>
				<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 16 }}>{loadError}</p>
				<button
					type="button"
					onClick={() => loadProfile()}
					style={{ padding: "10px 20px", background: "var(--color-accent, #2563eb)", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
				>
					{i18n.t("common.retry", { defaultValue: "Retry" })}
				</button>
			</div>
		);
	}

	const renderMediaFrame = (url, emptyHint, aspectStyle, alt) => (
		<div
			className="border border-border bg-surface-raised"
			style={{
				width: "100%",
				borderRadius: 12,
				overflow: "hidden",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				marginBottom: 12,
				position: "relative",
				...aspectStyle,
			}}
		>
			{url ? (
				<SafeImage
					src={url}
					alt={alt}
					loading="lazy"
					decoding="async"
					style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }}
					fallback={
						<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", padding: 16, textAlign: "center" }}>
							{emptyHint}
						</span>
					}
				/>
			) : (
				<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", padding: "16px 20px", textAlign: "center", lineHeight: 1.45 }}>
					{emptyHint}
				</span>
			)}
		</div>
	);

	return (
		<div>
			{dialog}
			{saved && (
				<div role="status" aria-live="polite" style={{ background: "#22c55e22", border: "1px solid #22c55e44", borderRadius: 12, padding: "12px 18px", marginBottom: 16, color: "#22c55e", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>
					{i18n.t("shared.profileSaved")}
				</div>
			)}
			{saveError && (
				<div role="alert" style={{ background: "#ef444422", border: "1px solid #ef444444", borderRadius: 12, padding: "12px 18px", marginBottom: 16, color: "#ef4444", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>
					{saveError}
				</div>
			)}
			{mediaError && (
				<div role="alert" style={{ background: "#ef444422", border: "1px solid #ef444444", borderRadius: 12, padding: "12px 18px", marginBottom: 16, color: "#ef4444", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>
					{mediaError}
				</div>
			)}

				<div
					className="bg-surface border border-border-subtle"
					style={{ borderRadius: 16, padding: "16px", marginBottom: 18 }}
					aria-busy={mediaBusy || undefined}
				>
					{/* Profile photo — own section (not nested with banner/cover) */}
					<section style={{ marginBottom: 16 }} aria-labelledby="edit-profile-photo-heading">
						<p id="edit-profile-photo-heading" className="text-text-secondary" style={sectionLabelStyle}>{i18n.t("shared.profilePhoto")}</p>
						<p className="text-text-secondary" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginBottom: 10, marginTop: -4, lineHeight: 1.4 }}>
							{i18n.t("shared.photosSaveImmediately", { defaultValue: "Photos save immediately when you upload or remove them." })}
						</p>
						<div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
							<div className="bg-surface-raised" style={{ width: 56, height: 56, borderRadius: "50%", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
								<SafeImage src={photoUrl} alt={photoAlt} style={{ width: "100%", height: "100%", objectFit: "cover" }} fallback={i18n.t("shared.defaultUser")} />
							</div>
						<input
							id="edit-profile-photo-input"
							ref={photoInputRef}
							type="file"
							accept={acceptImages}
							style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
							onChange={handlePhotoChange}
							aria-label={i18n.t("shared.changePhoto")}
						/>
						<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
							<button
								type="button"
								onClick={() => photoInputRef.current?.click()}
								disabled={photoUploading || photoRemoving}
								aria-label={i18n.t("shared.changePhoto")}
								className="bg-surface-raised border border-border text-text-primary"
								style={{ ...btnSecondary, cursor: (photoUploading || photoRemoving) ? "default" : "pointer", opacity: (photoUploading || photoRemoving) ? 0.6 : 1 }}
							>
								{photoUploading ? i18n.t("shared.uploading") : i18n.t("shared.changePhoto")}
							</button>
							{photoUrl && onRemovePhoto && (
								<button
									type="button"
									onClick={handleRemovePhoto}
									disabled={photoRemoving || photoUploading}
									aria-label={i18n.t("shared.removePhoto", { defaultValue: "Remove photo" })}
									style={{ ...btnDanger, cursor: (photoRemoving || photoUploading) ? "default" : "pointer", opacity: (photoRemoving || photoUploading) ? 0.6 : 1 }}
								>
									{photoRemoving ? i18n.t("shared.removing", { defaultValue: "Removing…" }) : i18n.t("shared.removePhoto", { defaultValue: "Remove photo" })}
								</button>
							)}
						</div>
					</div>
					<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", marginTop: 10 }}>
						{i18n.t("shared.imageFormatHint", { defaultValue: "JPEG, PNG, WebP, or GIF · max 5 MB" })}
					</p>
					<span
						aria-live="polite"
						style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
					>
						{photoUploading ? i18n.t("shared.uploading") : ""}
					</span>
				</section>

				{/* #332 — wide storefront banner */}
					{showBanner && (
						<section style={{ marginBottom: 16 }} aria-labelledby="edit-profile-banner-heading">
							<p id="edit-profile-banner-heading" className="text-text-secondary" style={sectionLabelStyle}>{i18n.t("shared.bannerPhoto", { defaultValue: "Banner photo" })}</p>
							{renderMediaFrame(
								bannerUrl,
								i18n.t("shared.bannerPhotoHint", { defaultValue: "Hero strip across the top of your storefront (wide landscape)." }),
								{ aspectRatio: "16 / 4", height: 96, maxHeight: 110 },
								i18n.t("shared.bannerPhoto", { defaultValue: "Banner photo" }),
							)}
						<input
							id="edit-profile-banner-input"
							ref={bannerInputRef}
							type="file"
							accept={acceptImages}
							style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
							onChange={handleBannerChange}
							aria-label={bannerUrl ? i18n.t("shared.changeBanner", { defaultValue: "Change banner" }) : i18n.t("shared.addBanner", { defaultValue: "Add banner" })}
						/>
						<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
							<button
								type="button"
								onClick={() => bannerInputRef.current?.click()}
								disabled={bannerUploading || bannerRemoving}
								aria-label={bannerUrl ? i18n.t("shared.changeBanner", { defaultValue: "Change banner" }) : i18n.t("shared.addBanner", { defaultValue: "Add banner" })}
								className="bg-surface-raised border border-border text-text-primary"
								style={{ ...btnSecondary, cursor: (bannerUploading || bannerRemoving) ? "default" : "pointer", opacity: (bannerUploading || bannerRemoving) ? 0.6 : 1 }}
							>
								{bannerUploading ? i18n.t("shared.uploading") : (bannerUrl ? i18n.t("shared.changeBanner", { defaultValue: "Change banner" }) : i18n.t("shared.addBanner", { defaultValue: "Add banner" }))}
							</button>
							{bannerUrl && onRemoveBanner && (
								<button
									type="button"
									onClick={handleRemoveBanner}
									disabled={bannerRemoving || bannerUploading}
									aria-label={i18n.t("shared.removeBanner", { defaultValue: "Remove banner" })}
									style={{ ...btnDanger, cursor: (bannerRemoving || bannerUploading) ? "default" : "pointer", opacity: (bannerRemoving || bannerUploading) ? 0.6 : 1 }}
								>
									{bannerRemoving ? i18n.t("shared.removing", { defaultValue: "Removing…" }) : i18n.t("shared.removeBanner", { defaultValue: "Remove banner" })}
								</button>
							)}
						</div>
					</section>
					)}

					{showCover && (
						<section style={{ marginBottom: 16 }} aria-labelledby="edit-profile-cover-heading">
							<p id="edit-profile-cover-heading" className="text-text-secondary" style={sectionLabelStyle}>{i18n.t("shared.coverPhoto")}</p>
							{renderMediaFrame(
								coverUrl,
								i18n.t("shared.coverPhotoHint"),
								{ aspectRatio: "16 / 5", height: 118, maxHeight: 132 },
								i18n.t("shared.coverPhoto"),
							)}
						<input
							id="edit-profile-cover-input"
							ref={coverInputRef}
							type="file"
							accept={acceptImages}
							style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
							onChange={handleCoverChange}
							aria-label={coverUrl ? i18n.t("shared.changeCover") : i18n.t("shared.addCover")}
						/>
						<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
							<button
								type="button"
								onClick={() => coverInputRef.current?.click()}
								disabled={coverUploading || coverRemoving}
								aria-label={coverUrl ? i18n.t("shared.changeCover") : i18n.t("shared.addCover")}
								className="bg-surface-raised border border-border text-text-primary"
								style={{ ...btnSecondary, cursor: (coverUploading || coverRemoving) ? "default" : "pointer", opacity: (coverUploading || coverRemoving) ? 0.6 : 1 }}
							>
								{coverUploading ? i18n.t("shared.uploading") : (coverUrl ? i18n.t("shared.changeCover") : i18n.t("shared.addCover"))}
							</button>
							{coverUrl && onRemoveCover && (
								<button
									type="button"
									onClick={handleRemoveCover}
									disabled={coverRemoving || coverUploading}
									aria-label={i18n.t("shared.removeCover", { defaultValue: "Remove cover" })}
									style={{ ...btnDanger, cursor: (coverRemoving || coverUploading) ? "default" : "pointer", opacity: (coverRemoving || coverUploading) ? 0.6 : 1 }}
								>
									{coverRemoving ? i18n.t("shared.removing", { defaultValue: "Removing…" }) : i18n.t("shared.removeCover", { defaultValue: "Remove cover" })}
								</button>
							)}
						</div>
					</section>
				)}

				{defaultFields.map(([key, label, type, ph]) => {
					const id = `edit-profile-field-${key}`;
					const err = fieldErrors[key];
					const invalid = !!err;
					return (
						<div key={key} style={{ marginBottom: 14 }}>
							<label htmlFor={id} className="text-text-secondary" style={{ display: "block", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>{label}</label>
							{type === "textarea" ? (
								<textarea
									id={id}
									value={vals[key] || ""}
									onChange={(e) => set(key, e.target.value)}
									placeholder={ph}
									rows={3}
									aria-invalid={invalid || undefined}
									aria-describedby={err ? `${id}-err` : undefined}
									className="bg-surface-raised border border-border text-text-primary"
									style={{ width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontFamily: "'DM Sans', sans-serif", resize: "vertical", boxSizing: "border-box", borderColor: invalid ? "#ef4444" : undefined }}
								/>
							) : key === "location" ? (
								<AddressAutocomplete
									value={vals[key] || ""}
									onChange={(val, lat, lng) => {
										set(key, val);
										if (lat != null && lng != null) { set("lat", lat); set("lng", lng); }
										else { set("lat", null); set("lng", null); }
									}}
									placeholder={ph}
									useLocation
									wrapStyle={{ width: "100%" }}
									inputStyle={{ width: "100%", padding: "10px 14px", background: "var(--color-surface-raised)", border: `1px solid ${invalid ? "#ef4444" : "var(--color-border)"}`, borderRadius: 10, color: "var(--color-text-primary)", fontSize: 13, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }}
								/>
							) : (
								<input
									id={id}
									value={vals[key] || ""}
									onChange={(e) => set(key, e.target.value)}
									placeholder={ph}
									aria-invalid={invalid || undefined}
									aria-describedby={err ? `${id}-err` : undefined}
									className="bg-surface-raised border border-border text-text-primary"
									style={{ width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", borderColor: invalid ? "#ef4444" : undefined }}
								/>
							)}
							{err && <p id={`${id}-err`} role="alert" style={{ color: "#ef4444", fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginTop: 6 }}>{err}</p>}
						</div>
					);
				})}

				{fields.map(([label, ph]) => {
					const id = `edit-profile-extra-${label}`;
					const err = fieldErrors[label];
					const seatingLabel = i18n.t("sellerDash.common.seatingCapacity", { defaultValue: "Seating capacity" });
					const isSeating = label === seatingLabel;
					return (
						<div key={label} style={{ marginBottom: 14 }}>
							<label htmlFor={id} className="text-text-secondary" style={{ display: "block", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>{label}</label>
							<input
								id={id}
								type={isSeating ? "number" : "text"}
								min={isSeating ? 1 : undefined}
								value={vals[label] || ""}
								onChange={(e) => set(label, e.target.value)}
								placeholder={ph}
								aria-invalid={err ? true : undefined}
								aria-describedby={err ? `${id}-err` : undefined}
								className="bg-surface-raised border border-border text-text-primary"
								style={{ width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", borderColor: err ? "#ef4444" : undefined }}
							/>
							{err && <p id={`${id}-err`} role="alert" style={{ color: "#ef4444", fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginTop: 6 }}>{err}</p>}
						</div>
					);
				})}
			</div>

			<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "18px 22px", marginBottom: 20 }}>
				<p className="text-text-secondary" style={{ ...sectionLabelStyle, marginBottom: 14 }}>{i18n.t("shared.verificationStatus")}</p>
				{[
					[i18n.t("shared.verifyEmail"), verification.email],
					[i18n.t("shared.verifyPhone"), verification.phone],
					[i18n.t("shared.verifyId"), verification.id],
				].map(([label, ok]) => (
					<div key={label} className="border-b border-border-subtle" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, marginBottom: 10 }}>
						<span className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
						<span
							style={{
								fontSize: 11,
								fontWeight: 700,
								padding: "3px 9px",
								borderRadius: 6,
								background: ok ? "#22c55e22" : "#ef444422",
								color: ok ? "#22c55e" : "#f87171",
							}}
						>
							{ok ? i18n.t("shared.verified") : i18n.t("shared.notVerified")}
						</span>
					</div>
				))}
			</div>

			<div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
				<button
					type="button"
					onClick={handleSave}
					disabled={saving}
					style={{
						padding: "12px 28px",
						background: "var(--color-accent, #2563eb)",
						border: "none",
						borderRadius: 12,
						color: "#fff",
						fontSize: 14,
						fontWeight: 700,
						fontFamily: "'DM Sans', sans-serif",
						cursor: saving ? "default" : "pointer",
						opacity: saving ? 0.7 : 1,
						minWidth: 140,
						flex: "1 1 160px",
					}}
				>
					{saving ? i18n.t("shared.saving") : i18n.t("shared.saveChanges")}
				</button>
				{isDirty && (
					<button
						type="button"
						onClick={handleDiscard}
						disabled={saving}
						className="bg-surface-raised border border-border text-text-primary"
						style={{ padding: "12px 22px", borderRadius: 12, fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", flex: "0 1 auto" }}
					>
						{i18n.t("common.cancel", { defaultValue: "Cancel" })}
					</button>
				)}
			</div>
		</div>
	);
});

// CelebrityEditProfileTab - Dedicated edit profile for celebrities
const CelebrityEditProfileTab = React.memo(function CelebrityEditProfileTab({ onSave, vertical, onClose, color }) {
	const [saved, setSaved] = React.useState(false);
	const [saveError, setSaveError] = React.useState(null);
	const [saving, setSaving] = React.useState(false);
	const [loading, setLoading] = React.useState(true);
	
	// Celebrity profile fields (matches schema)
	const [vals, setVals] = React.useState({
		display_name: '',
		celebrity_bio: '',
		tagline: '',
		country: '',
		city: '',
		languages: [],
		profile_image: '',
		cover_image: '',
	});

	const [languageInput, setLanguageInput] = React.useState('');
	
	// Image upload states
	const [profileImageUploading, setProfileImageUploading] = React.useState(false);
	const [profileImageRemoving, setProfileImageRemoving] = React.useState(false);
	const profileImageInputRef = React.useRef(null);
	
	const [coverImageUploading, setCoverImageUploading] = React.useState(false);
	const [coverImageRemoving, setCoverImageRemoving] = React.useState(false);
	const coverImageInputRef = React.useRef(null);

	const themeColor = color || '#f59e0b';

	// Load celebrity profile
	React.useEffect(() => {
		let cancelled = false;
		const loadProfile = async () => {
			setLoading(true);
			try {
				const res = await getCelebrityProfile();
				if (!cancelled && res?.successful && res.data) {
					const profile = res.data;
					setVals({
						display_name: profile.display_name || '',
						celebrity_bio: profile.celebrity_bio || '',
						tagline: profile.tagline || '',
						country: profile.country || '',
						city: profile.city || '',
						languages: profile.languages || [],
						profile_image: profile.profile_image || '',
						cover_image: profile.cover_image || '',
					});
				}
			} catch (err) {
				console.error('Failed to load celebrity profile:', err);
			} finally {
				if (!cancelled) setLoading(false);
			}
		};
		loadProfile();
		return () => { cancelled = true; };
	}, []);

	const set = (k, v) => setVals(prev => ({ ...prev, [k]: v }));

	const handleAddLanguage = () => {
		if (languageInput.trim() && !vals.languages.includes(languageInput.trim())) {
			set('languages', [...vals.languages, languageInput.trim()]);
			setLanguageInput('');
		}
	};

	const handleRemoveLanguage = (lang) => {
		set('languages', vals.languages.filter(l => l !== lang));
	};

	// Handle profile image upload
	const handleProfileImageUpload = async (e) => {
		const file = e.target.files?.[0];
		if (!file) return;
		
		const preview = URL.createObjectURL(file);
		setVals(prev => ({ ...prev, profile_image: preview }));
		setProfileImageUploading(true);
		
		try {
			const res = await uploadCelebrityImage(file);
			const url = res?.data?.url || res?.url || res?.data?.image || res?.image;
			if (url) {
				setVals(prev => ({ ...prev, profile_image: url }));
			}
		} catch (err) {
			console.error('Failed to upload profile image:', err);
			setSaveError('Failed to upload profile image. Please try again.');
			setTimeout(() => setSaveError(null), 3000);
		} finally {
			setProfileImageUploading(false);
		}
	};

	// Handle profile image removal
	const handleProfileImageRemove = async () => {
		if (!vals.profile_image || profileImageRemoving) return;
		setProfileImageRemoving(true);
		setVals(prev => ({ ...prev, profile_image: '' }));
		setProfileImageRemoving(false);
	};

	// Handle cover image upload
	const handleCoverImageUpload = async (e) => {
		const file = e.target.files?.[0];
		if (!file) return;
		
		const preview = URL.createObjectURL(file);
		setVals(prev => ({ ...prev, cover_image: preview }));
		setCoverImageUploading(true);
		
		try {
			const res = await uploadCelebrityImage(file);
			const url = res?.data?.url || res?.url || res?.data?.image || res?.image;
			if (url) {
				setVals(prev => ({ ...prev, cover_image: url }));
			}
		} catch (err) {
			console.error('Failed to upload cover image:', err);
			setSaveError('Failed to upload cover image. Please try again.');
			setTimeout(() => setSaveError(null), 3000);
		} finally {
			setCoverImageUploading(false);
		}
	};

	// Handle cover image removal
	const handleCoverImageRemove = async () => {
		if (!vals.cover_image || coverImageRemoving) return;
		setCoverImageRemoving(true);
		setVals(prev => ({ ...prev, cover_image: '' }));
		setCoverImageRemoving(false);
	};

	const handleSave = async () => {
		if (!vals.display_name.trim()) {
			setSaveError('Display name is required.');
			return;
		}
		
		setSaveError(null);
		setSaving(true);
		
		try {
			const payload = {
				display_name: vals.display_name.trim(),
				celebrity_bio: vals.celebrity_bio.trim() || null,
				tagline: vals.tagline.trim() || null,
				country: vals.country.trim() || null,
				city: vals.city.trim() || null,
				languages: vals.languages,
				profile_image: vals.profile_image || null,
				cover_image: vals.cover_image || null,
			};
			
			const res = await updateCelebrityProfile(payload);
			
			if (res?.successful) {
				setSaved(true);
				setTimeout(() => setSaved(false), 2500);
				if (onSave) onSave(res.data);
			} else {
				setSaveError(res?.message || 'Failed to update profile.');
			}
		} catch (err) {
			setSaveError(err?.response?.data?.message || 'Something went wrong.');
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return (
			<div style={{ padding: '20px 0', textAlign: 'center' }}>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
					Loading profile...
				</p>
			</div>
		);
	}

	const inputStyle = {
		width: '100%',
		padding: '10px 14px',
		borderRadius: 10,
		fontSize: 13,
		fontFamily: "'DM Sans', sans-serif",
		outline: 'none',
		boxSizing: 'border-box',
	};
	const inputClassName = "bg-surface-raised border border-border text-text-primary";

	const labelStyle = {
		fontSize: 12,
		fontWeight: 600,
		fontFamily: "'DM Sans', sans-serif",
		marginBottom: 6,
		display: 'block',
	};
	const labelClassName = "text-text-secondary";

	return (
		<div>
			{saved && (
				<div style={{ 
					background: "#22c55e22", 
					border: "1px solid #22c55e44", 
					borderRadius: 12, 
					padding: "12px 18px", 
					marginBottom: 16, 
					color: "#22c55e", 
					fontFamily: "'DM Sans', sans-serif", 
					fontSize: 13, 
					fontWeight: 600 
				}}>
					Profile updated successfully!
				</div>
			)}
			
			{saveError && (
				<div style={{ 
					background: "#ef444422", 
					border: "1px solid #ef444444", 
					borderRadius: 12, 
					padding: "12px 18px", 
					marginBottom: 16, 
					color: "#ef4444", 
					fontFamily: "'DM Sans', sans-serif", 
					fontSize: 13, 
					fontWeight: 600 
				}}>
					{saveError}
				</div>
			)}

			<div className="bg-surface border border-border-subtle" style={{
				borderRadius: 16,
				padding: "24px 28px",
				marginBottom: 20 ,
			}}>
				<p className="text-text-muted" style={{
					fontSize: 12,
					fontWeight: 700,
					fontFamily: "'DM Sans', sans-serif",
					textTransform: "uppercase",
					letterSpacing: "0.08em",
					marginBottom: 16 
				}}>
					Celebrity Profile
				</p>

				{/* Profile Image */}
				<div style={{ marginBottom: 20 }}>
					<p className="text-text-secondary" style={{
						fontSize: 12,
						fontWeight: 600,
						fontFamily: "'DM Sans', sans-serif",
						marginBottom: 10
					}}>
						Profile Image
					</p>
					<div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
						<div className="bg-surface-raised border-2 border-border" style={{
							width: 80,
							height: 80,
							borderRadius: '50%',
							overflow: 'hidden',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							flexShrink: 0,
						}}>
							{vals.profile_image ? (
								<img
									src={vals.profile_image}
									alt="Profile"
									style={{ width: '100%', height: '100%', objectFit: 'cover' }}
									onError={(e) => { e.target.style.display = 'none'; }}
								/>
							) : (
								<span className="text-text-muted" style={{ fontSize: 28 }}>
									{vals.display_name?.charAt(0) || '?'}
								</span>
							)}
						</div>
						<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
							<input 
								ref={profileImageInputRef} 
								type="file" 
								accept="image/jpeg,image/png,image/webp,image/gif" 
								style={{ display: 'none' }} 
								onChange={handleProfileImageUpload} 
							/>
							<button
								onClick={() => profileImageInputRef.current?.click()}
								disabled={profileImageUploading || profileImageRemoving}
								style={{
									padding: "9px 18px",
									background: profileImageUploading || profileImageRemoving ? 'var(--color-surface-raised)' : `${themeColor}22`,
									border: profileImageUploading || profileImageRemoving ? '1px solid var(--color-border)' : `1px solid ${themeColor}44`,
									borderRadius: 10,
									color: profileImageUploading || profileImageRemoving ? 'var(--color-text-muted)' : themeColor,
									fontSize: 12, 
									fontWeight: 600, 
									fontFamily: "'DM Sans', sans-serif", 
									cursor: (profileImageUploading || profileImageRemoving) ? 'default' : 'pointer', 
									opacity: (profileImageUploading || profileImageRemoving) ? 0.6 : 1,
									transition: 'all 0.15s',
								}}
							>
								{profileImageUploading ? 'Uploading...' : (vals.profile_image ? 'Change Photo' : 'Upload Photo')}
							</button>
							{vals.profile_image && (
								<button 
									onClick={handleProfileImageRemove} 
									disabled={profileImageRemoving || profileImageUploading}
									style={{ 
										padding: "9px 14px", 
										background: "rgba(239,68,68,0.1)", 
										border: "1px solid rgba(239,68,68,0.25)", 
										borderRadius: 10, 
										color: "#ef4444", 
										fontSize: 12, 
										fontWeight: 600, 
										fontFamily: "'DM Sans', sans-serif", 
										cursor: (profileImageRemoving || profileImageUploading) ? 'default' : 'pointer', 
										opacity: (profileImageRemoving || profileImageUploading) ? 0.6 : 1,
										transition: 'all 0.15s',
									}}
								>
									{profileImageRemoving ? 'Removing...' : 'Remove Photo'}
								</button>
							)}
						</div>
					</div>
				</div>

				{/* Cover Image */}
				<div style={{ marginBottom: 20 }}>
					<p className="text-text-secondary" style={{
						fontSize: 12,
						fontWeight: 600,
						fontFamily: "'DM Sans', sans-serif",
						marginBottom: 10
					}}>
						Cover Image
					</p>
					<div className="bg-surface-raised border border-border" style={{
						width: '100%',
						height: 160,
						borderRadius: 12,
						overflow: 'hidden',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						marginBottom: 12,
						position: 'relative',
					}}>
						{vals.cover_image ? (
							<img
								src={vals.cover_image}
								alt="Cover"
								style={{ width: '100%', height: '100%', objectFit: 'cover' }}
								onError={(e) => { e.target.style.display = 'none'; }}
							/>
						) : (
							<span className="text-text-muted" style={{
								fontSize: 12,
								fontFamily: "'DM Sans', sans-serif"
							}}>
								No cover image uploaded
							</span>
						)}
					</div>
					<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
						<input 
							ref={coverImageInputRef} 
							type="file" 
							accept="image/jpeg,image/png,image/webp,image/gif" 
							style={{ display: 'none' }} 
							onChange={handleCoverImageUpload} 
						/>
						<button
							onClick={() => coverImageInputRef.current?.click()}
							disabled={coverImageUploading || coverImageRemoving}
							style={{
								padding: "9px 18px",
								background: coverImageUploading || coverImageRemoving ? 'var(--color-surface-raised)' : `${themeColor}22`,
								border: coverImageUploading || coverImageRemoving ? '1px solid var(--color-border)' : `1px solid ${themeColor}44`,
								borderRadius: 10,
								color: coverImageUploading || coverImageRemoving ? 'var(--color-text-muted)' : themeColor,
								fontSize: 12, 
								fontWeight: 600, 
								fontFamily: "'DM Sans', sans-serif", 
								cursor: (coverImageUploading || coverImageRemoving) ? 'default' : 'pointer', 
								opacity: (coverImageUploading || coverImageRemoving) ? 0.6 : 1,
								transition: 'all 0.15s',
							}}
						>
							{coverImageUploading ? 'Uploading...' : (vals.cover_image ? 'Change Cover' : 'Upload Cover')}
						</button>
						{vals.cover_image && (
							<button 
								onClick={handleCoverImageRemove} 
								disabled={coverImageRemoving || coverImageUploading}
								style={{ 
									padding: "9px 14px", 
									background: "rgba(239,68,68,0.1)", 
									border: "1px solid rgba(239,68,68,0.25)", 
									borderRadius: 10, 
									color: "#ef4444", 
									fontSize: 12, 
									fontWeight: 600, 
									fontFamily: "'DM Sans', sans-serif", 
									cursor: (coverImageRemoving || coverImageUploading) ? 'default' : 'pointer', 
									opacity: (coverImageRemoving || coverImageUploading) ? 0.6 : 1,
									transition: 'all 0.15s',
								}}
							>
								{coverImageRemoving ? 'Removing...' : 'Remove Cover'}
							</button>
						)}
					</div>
				</div>

				{/* Display Name */}
				<div style={{ marginBottom: 14 }}>
					<label className={labelClassName} style={labelStyle}>Display Name *</label>
					<input
						value={vals.display_name}
						onChange={e => set('display_name', e.target.value)}
						placeholder="Your public name"
						className={inputClassName}
						style={inputStyle}
					/>
				</div>

				{/* Bio */}
				<div style={{ marginBottom: 14 }}>
					<label className={labelClassName} style={labelStyle}>Bio</label>
					<textarea
						value={vals.celebrity_bio}
						onChange={e => set('celebrity_bio', e.target.value)}
						placeholder="Tell fans about yourself"
						rows={3}
						className={inputClassName}
						style={{ ...inputStyle, resize: 'vertical' }}
					/>
				</div>

				{/* Tagline */}
				<div style={{ marginBottom: 14 }}>
					<label className={labelClassName} style={labelStyle}>Tagline</label>
					<input
						value={vals.tagline}
						onChange={e => set('tagline', e.target.value)}
						placeholder="e.g. Actor, Musician, Athlete"
						className={inputClassName}
						style={inputStyle}
					/>
				</div>

				{/* Country & City */}
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
					<div>
						<label className={labelClassName} style={labelStyle}>Country</label>
						<input
							value={vals.country}
							onChange={e => set('country', e.target.value)}
							placeholder="e.g. Canada"
							className={inputClassName}
							style={inputStyle}
						/>
					</div>
					<div>
						<label className={labelClassName} style={labelStyle}>City</label>
						<input
							value={vals.city}
							onChange={e => set('city', e.target.value)}
							placeholder="e.g. Toronto"
							className={inputClassName}
							style={inputStyle}
						/>
					</div>
				</div>

				{/* Languages */}
				<div style={{ marginBottom: 14 }}>
					<label className={labelClassName} style={labelStyle}>Languages</label>
					<div style={{ display: 'flex', gap: 8 }}>
						<input
							value={languageInput}
							onChange={(e) => setLanguageInput(e.target.value)}
							placeholder="e.g. English"
							className={inputClassName}
							style={{ ...inputStyle, flex: 1 }}
							onKeyDown={(e) => { 
								if (e.key === 'Enter') { 
									e.preventDefault(); 
									handleAddLanguage(); 
								} 
							}}
						/>
						<button
							onClick={handleAddLanguage}
							style={{
								padding: '10px 16px',
								background: `${themeColor}22`,
								border: `1px solid ${themeColor}44`,
								borderRadius: 10,
								color: themeColor,
								fontSize: 13,
								fontWeight: 600,
								cursor: 'pointer',
								whiteSpace: 'nowrap',
								fontFamily: "'DM Sans', sans-serif",
								transition: 'all 0.15s',
							}}
						>
							Add
						</button>
					</div>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
						{vals.languages.map((lang) => (
							<span
								key={lang}
								className="bg-surface-raised border border-border text-text-secondary"
								style={{
									padding: '4px 10px',
									borderRadius: 6,
									fontSize: 12,
									fontFamily: "'DM Sans', sans-serif",
									display: 'flex',
									alignItems: 'center',
									gap: 6,
								}}
							>
								{lang}
								<button
									onClick={() => handleRemoveLanguage(lang)}
									className="text-text-muted"
									style={{
										background: 'none',
										border: 'none',
										cursor: 'pointer',
										padding: '0 2px',
										fontSize: 12,
									}}
								>
									×
								</button>
							</span>
						))}
					</div>
				</div>
			</div>

			{/* Save Button */}
			<div style={{ display: 'flex', gap: 10 }}>
				<button
					onClick={handleSave}
					disabled={saving}
					style={{
						flex: 1,
						padding: "12px 28px",
						background: saving ? `${themeColor}66` : themeColor,
						border: "none",
						borderRadius: 12,
						color: "#fff",
						fontSize: 14,
						fontWeight: 700,
						fontFamily: "'DM Sans', sans-serif",
						cursor: saving ? "default" : "pointer",
						opacity: saving ? 0.7 : 1,
						transition: 'all 0.15s',
					}}
					onMouseEnter={(e) => {
						if (!saving) e.currentTarget.style.background = themeColor;
						e.currentTarget.style.transform = saving ? 'none' : 'translateY(-1px)';
					}}
					onMouseLeave={(e) => {
						if (!saving) e.currentTarget.style.background = themeColor;
						e.currentTarget.style.transform = 'none';
					}}
				>
					{saving ? "Saving..." : "Save Changes"}
				</button>
				{onClose && (
					<button
						onClick={onClose}
						className="bg-surface-raised border border-border text-text-secondary"
						style={{
							padding: "12px 24px",
							borderRadius: 12,
							fontSize: 14,
							fontWeight: 600,
							fontFamily: "'DM Sans', sans-serif",
							cursor: "pointer",
							transition: 'all 0.15s',
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = 'var(--color-border)';
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = 'var(--color-surface-raised)';
						}}
					>
						Cancel
					</button>
				)}
			</div>
		</div>
	);
});

const SellerEarningsTab = React.memo(function SellerEarningsTab({
	color,
	orders = [],
	fetchPayoutHistory,
	onOpenWallet,
}) {
	const TIMEFRAME_LABELS = { Daily: "shared.daily", Weekly: "shared.weekly", Monthly: "shared.monthly" };
	const PERIOD_HINT_KEYS = {
		Daily: "shared.earningsPeriodHintDaily",
		Weekly: "shared.earningsPeriodHintWeekly",
		Monthly: "shared.earningsPeriodHintMonthly",
	};
	const locale = i18n.language || "en";
	const [timeframe, setTimeframe] = React.useState("Daily");
	const [payouts, setPayouts] = React.useState([]);
	const [payoutsLoading, setPayoutsLoading] = React.useState(typeof fetchPayoutHistory === "function");
	const [payoutsError, setPayoutsError] = React.useState(false);
	const [payoutTick, setPayoutTick] = React.useState(0);
	const [earningsDialog, { notify: notifyEarnings }] = useDialog();
	const showPayoutHistory = typeof fetchPayoutHistory === "function";
	const accent = color || "#f59e0b";

	React.useEffect(() => {
		if (!showPayoutHistory) {
			setPayouts([]);
			setPayoutsLoading(false);
			setPayoutsError(false);
			return undefined;
		}
		let cancelled = false;
		setPayoutsLoading(true);
		setPayoutsError(false);
		fetchPayoutHistory()
			.then((res) => {
				if (cancelled) return;
				const rows = Array.isArray(res) ? res : (res?.data ?? []);
				setPayouts(Array.isArray(rows) ? rows : []);
			})
			.catch(() => {
				if (!cancelled) {
					setPayouts([]);
					setPayoutsError(true);
				}
			})
			.finally(() => {
				if (!cancelled) setPayoutsLoading(false);
			});
		return () => { cancelled = true; };
	}, [fetchPayoutHistory, showPayoutHistory, payoutTick]);

	const dataPoints = React.useMemo(
		() => buildEarningsDataPoints(orders, timeframe, new Date(), locale),
		[orders, timeframe, locale],
	);
	const maxVal = Math.max(...dataPoints.map((d) => d.val), 1);
	const periodNet = dataPoints.reduce((s, d) => s + d.val, 0);
	const summary = React.useMemo(
		() => earningsSummaryFromOrders(orders, periodNet),
		[orders, periodNet],
	);
	const periodOrders = React.useMemo(() => {
		const { start, end } = earningsExportWindow(timeframe);
		return filterOrdersInPeriod(orders, start, end, { earnedOnly: true });
	}, [orders, timeframe]);

	const exportCSV = () => {
		const headers = [
			i18n.t("shared.csvOrderId"),
			i18n.t("shared.csvDate"),
			i18n.t("shared.csvCustomer"),
			i18n.t("shared.csvItem"),
			i18n.t("shared.csvNetAmount"),
			i18n.t("shared.csvStatus"),
		];
		const rows = periodOrders.map((o, idx) => {
			const net = sellerOrderNet(o);
			const date = o.created_at || o.delivered_at
				? new Date(o.delivered_at ?? o.created_at).toLocaleDateString(locale)
				: "";
			return [
				o.id ?? o._id ?? `ORD-${idx + 1}`,
				date,
				o.customer ?? i18n.t("shared.guest"),
				o.item ?? i18n.t("shared.na"),
				net.toFixed(2),
				translateOrderStatus(o.status),
			];
		});
		// Blob download (not data: URI) — order ids like "#F-12" contain "#", which would
		// truncate a data: URL at the fragment and leave Excel with headers only.
		const csvBody = [headers.join(","), ...rows.map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
		const blob = new Blob([`\uFEFF${csvBody}`], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.setAttribute("download", `strug_earnings_report_${Date.now()}.csv`);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	};

	const exportPDF = () => {
		const printWindow = window.open("", "_blank");
		if (!printWindow) {
			notifyEarnings({
				title: i18n.t("shared.pdfBlockedTitle", { defaultValue: "Could not open PDF" }),
				message: i18n.t("shared.pdfBlockedMsg", { defaultValue: "Allow pop-ups for this site, then try Export PDF again." }),
			});
			return;
		}
		const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => (
			{ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
		));
		const rowsHtml = periodOrders.map((o, idx) => {
			const net = sellerOrderNet(o);
			const date = o.created_at || o.delivered_at
				? new Date(o.delivered_at ?? o.created_at).toLocaleDateString(locale)
				: "";
			return `
				<tr>
					<td>${esc(o.id ?? o._id ?? `ORD-${idx + 1}`)}</td>
					<td>${esc(date)}</td>
					<td>${esc(o.customer ?? i18n.t("shared.guest"))}</td>
					<td>${esc(o.item ?? i18n.t("shared.na"))}</td>
					<td>${esc(net.toFixed(2))}</td>
					<td>${esc(translateOrderStatus(o.status))}</td>
				</tr>
			`;
		}).join("");
		const totalNetVal = periodOrders.reduce((s, o) => s + sellerOrderNet(o), 0);
		const generatedDate = new Date().toLocaleDateString(locale);

		printWindow.document.write(`
			<html>
			<head>
				<title>${i18n.t("shared.pdfStatementTitle")}</title>
				<style>
					body { font-family: 'DM Sans', sans-serif; background: #fff; color: #1a1a2e; padding: 40px; }
					h1 { font-family: 'Barlow Condensed', sans-serif; font-size: 28px; text-transform: uppercase; margin-bottom: 5px; color: ${accent}; }
					.header { display: flex; justify-content: space-between; margin-bottom: 40px; border-bottom: 2px solid ${accent}; padding-bottom: 20px; }
					table { width: 100%; border-collapse: collapse; margin-top: 20px; }
					th, td { padding: 12px; border: 1px solid #ddd; text-align: left; font-size: 13px; }
					th { background: #f5f5f7; font-weight: bold; }
					.totals { float: right; width: 300px; margin-top: 30px; }
					.totals-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; border-bottom: 1px solid #eee; }
					.totals-row.final { font-weight: bold; font-size: 16px; border-bottom: 2px solid ${accent}; color: #22c55e; }
				</style>
			</head>
			<body>
				<div class="header">
					<div>
						<h1>${i18n.t("shared.pdfAccountStatement")}</h1>
						<div style="font-size: 13px; color: #666;">${i18n.t("shared.pdfGeneratedOn", { date: generatedDate })}</div>
						<div style="font-size: 12px; color: #666; margin-top: 4px;">${esc(i18n.t(PERIOD_HINT_KEYS[timeframe]))}</div>
					</div>
					<div style="text-align: right;">
						<h2 style="margin: 0; font-size: 20px; color: #111;">${i18n.t("shared.pdfMarketplace")}</h2>
						<div style="font-size: 13px; color: #666;">seller-support@strug.ca</div>
					</div>
				</div>
				<h3>${i18n.t("shared.pdfTransactionBreakdown")}</h3>
				<table>
					<thead>
						<tr>
							<th>${i18n.t("shared.csvOrderId")}</th>
							<th>${i18n.t("shared.csvDate")}</th>
							<th>${i18n.t("shared.csvCustomer")}</th>
							<th>${i18n.t("shared.csvItem")}</th>
							<th>${i18n.t("shared.csvNetAmount")}</th>
							<th>${i18n.t("shared.csvStatus")}</th>
						</tr>
					</thead>
					<tbody>
						${rowsHtml}
					</tbody>
				</table>
				<div class="totals">
					<div class="totals-row final"><span>${i18n.t("shared.pdfTotalNetInPeriod", { defaultValue: "Total net in period" })}</span><span>${esc(totalNetVal.toFixed(2))}</span></div>
				</div>
				<script>
					window.onload = function() { window.print(); }
				</script>
			</body>
			</html>
		`);
		printWindow.document.close();
	};

	const summaryRows = [
		[i18n.t("shared.completedOrders", { defaultValue: "Completed orders" }), `${summary.completedCount}`],
		[i18n.t("shared.netInPeriod", { defaultValue: "Net in period" }), fmtMoney(summary.periodNet)],
		[i18n.t("shared.lifetimeNet", { defaultValue: "Lifetime net" }), fmtMoney(summary.lifetimeNet)],
	];

	return (
		<div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 24 }}>
			{earningsDialog}

			<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
				<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "20px 24px" }}>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
						<p className="text-text-muted" style={{ fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em" }}>
							{i18n.t("shared.revenueBreakdown")}
						</p>
						<div className="bg-surface-raised" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 8 }}>
							{["Daily", "Weekly", "Monthly"].map((t) => (
								<button
									key={t}
									type="button"
									onClick={() => setTimeframe(t)}
									className={timeframe === t ? "text-white" : "text-text-secondary"}
									style={{
										padding: "4px 8px",
										background: timeframe === t ? accent : "transparent",
										border: "none",
										borderRadius: 6,
										fontSize: 10,
										fontWeight: 700,
										cursor: "pointer",
										fontFamily: "'DM Sans', sans-serif",
										transition: "all 0.15s",
									}}
								>
									{i18n.t(TIMEFRAME_LABELS[t])}
								</button>
							))}
						</div>
					</div>

					{periodNet <= 0 && periodOrders.length === 0 ? (
						<p className="text-text-muted" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", margin: "8px 0 0" }}>
							{i18n.t("shared.earningsEmptyPeriod", { defaultValue: "No completed earnings in this period yet." })}
						</p>
					) : (
						<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
							{dataPoints.map((dp, i) => (
								<div key={`${dp.label}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
									<span className="text-text-muted" style={{ width: 88, fontSize: 11, fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>{dp.label}</span>
									<div className="bg-surface-raised" style={{ flex: 1, height: 8, borderRadius: 4, overflow: "hidden" }}>
										<div style={{ width: `${(dp.val / maxVal) * 100}%`, height: "100%", background: accent, borderRadius: 4, transition: "width 0.4s ease" }} />
									</div>
									<span className="text-text-primary" style={{ width: 88, fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", textAlign: "right" }}>
										{fmtMoney(dp.val)}
									</span>
								</div>
							))}
						</div>
					)}
				</div>

				<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "20px 24px", display: "flex", gap: 12 }}>
					<button
						type="button"
						onClick={exportCSV}
						className="bg-surface-raised border border-border text-text-primary"
						style={{
							flex: 1,
							padding: "10px 14px",
							borderRadius: 10,
							fontFamily: "'DM Sans', sans-serif",
							fontSize: 12,
							fontWeight: 600,
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: 8,
						}}
					>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
						{i18n.t("shared.exportCsv")}
					</button>
					<button
						type="button"
						onClick={exportPDF}
						className="bg-surface-raised border border-border text-text-primary"
						style={{
							flex: 1,
							padding: "10px 14px",
							borderRadius: 10,
							fontFamily: "'DM Sans', sans-serif",
							fontSize: 12,
							fontWeight: 600,
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: 8,
						}}
					>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/></svg>
						{i18n.t("shared.exportPdf")}
					</button>
				</div>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
				<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "20px 24px" }}>
					<p className="text-text-muted" style={{ fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>
						{i18n.t("shared.earningsSummary")}
					</p>
					{summaryRows.map(([l, v], i) => (
						<div key={l} style={{ display: "flex", justifyContent: "space-between", paddingBottom: 10, marginBottom: 10, borderBottom: i < summaryRows.length - 1 ? "1px solid var(--color-border-subtle)" : "none" }}>
							<span className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{l}</span>
							<span style={{ fontSize: 13, fontWeight: 600, color: i > 0 ? "#22c55e" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif" }}>{v}</span>
						</div>
					))}
					<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", margin: "4px 0 0", lineHeight: 1.45 }}>
						{i18n.t(PERIOD_HINT_KEYS[timeframe])}
					</p>
					{summary.allOrdersCount > summary.completedCount ? (
						<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", margin: "6px 0 0" }}>
							{i18n.t("shared.allOrdersCount", { defaultValue: "All orders: {{count}}", count: summary.allOrdersCount })}
						</p>
					) : null}
				</div>

				<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "20px 24px" }}>
					<p className="text-text-muted" style={{ fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
						{i18n.t("shared.payoutSettings")}
					</p>
					<p className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", margin: "0 0 12px", lineHeight: 1.45 }}>
						{i18n.t("shared.earningsWalletCta", { defaultValue: "Payouts and bank connection live on the Wallet tab." })}
					</p>
					{typeof onOpenWallet === "function" ? (
						<button
							type="button"
							onClick={onOpenWallet}
							style={{
								background: accent,
								border: "none",
								borderRadius: 8,
								color: "#fff",
								fontSize: 12,
								fontWeight: 700,
								padding: "9px 14px",
								cursor: "pointer",
								fontFamily: "'DM Sans', sans-serif",
							}}
						>
							{i18n.t("shared.openWallet", { defaultValue: "Open Wallet" })}
						</button>
					) : (
						<p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
							{i18n.t("shared.earningsWalletHint", { defaultValue: "Open the Wallet tab to connect payouts or request a withdrawal." })}
						</p>
					)}
				</div>

				{showPayoutHistory ? (
					<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "20px 24px" }}>
						<p className="text-text-muted" style={{ fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>
							{i18n.t("shared.payoutHistory")}
						</p>
						{payoutsLoading ? (
							<p className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
								{i18n.t("shared.payoutHistoryLoading", { defaultValue: "Loading payout history…" })}
							</p>
						) : payoutsError ? (
							<div>
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", margin: 0 }}>
									{i18n.t("shared.payoutHistoryError", { defaultValue: "Couldn't load payout history. Try again." })}
								</p>
								<button
									type="button"
									onClick={() => setPayoutTick((n) => n + 1)}
									style={{ marginTop: 8, background: accent, color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
								>
									{i18n.t("shared.walletRetry", { defaultValue: "Retry" })}
								</button>
							</div>
						) : payouts.length === 0 ? (
							<p className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
								{i18n.t("shared.noPayoutHistory")}
							</p>
						) : (
							<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
								{payouts.slice(0, 20).map((ph, idx) => {
									const status = String(ph.status || "").toUpperCase();
									const tone = PAYOUT_STATUS_COLORS[status] || "var(--color-text-secondary)";
									const amount = parseFloat(ph.amount);
									return (
										<div
											key={ph.payout_id ?? ph.id ?? idx}
											style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 6, borderBottom: idx < Math.min(payouts.length, 20) - 1 ? "1px solid var(--color-border-subtle)" : "none" }}
										>
											<div>
												<p className="text-text-primary" style={{ fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
													{ph.payout_id != null ? `#${ph.payout_id}` : (ph.id ?? "—")}
												</p>
												<p className="text-text-muted" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>
													{ph.created_at ? new Date(ph.created_at).toLocaleDateString(locale) : ""}
												</p>
											</div>
											<div style={{ textAlign: "right" }}>
												<p className="text-text-primary" style={{ fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>
													{Number.isFinite(amount) ? fmtPayoutCad(amount) : "—"}
												</p>
												<span style={{ fontSize: 9, fontWeight: 700, color: tone }}>{status || "—"}</span>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				) : null}
			</div>
		</div>
	);
});

function hexToRgbStr(hex) {
	if (!hex || hex.length < 6) return "255,255,255";
	const h = hex.replace("#","");
	return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`;
}
const LeoButton = React.memo(function LeoButton({ label, color, cat, icon: Icon, active, onClick, delay, wrapLabel = false }) {
	
	const resolvedLabel = label ?? cat?.label ?? "";
	const resolvedColor = color ?? cat?.color ?? "#2563eb";
	const img = cat?.img;
	const [hov, setHov] = React.useState(false);
	const isOn = active || hov;
	return (
		<button
			onClick={onClick}
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			style={{
				display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
				background: "none", border: "none", cursor: "pointer", padding: "4px 0 0 0",
				transition: "opacity 0.15s",
				animation: delay != null ? `fadeUp 0.35s ease ${delay}ms both` : undefined,
				flexShrink: 0,
			}}
		>
			<div style={{
				width: 56, height: 56, borderRadius: 14,
				// Photo categories use the image as the tile face; the colored ring still
				// carries the active/hover accent. Non-photo categories keep the tint+icon.
				background: img
					? `url("${encodeURI(img)}") center/cover no-repeat`
					: isOn ? `rgba(${hexToRgbStr(resolvedColor)},0.2)` : "var(--color-surface-raised)",
				border: `1.5px solid ${isOn ? resolvedColor + "66" : "var(--color-border)"}`,
				display: "flex", alignItems: "center", justifyContent: "center",
				color: isOn ? resolvedColor : "var(--color-text-secondary)",
				transition: "background 0.15s, border-color 0.15s, color 0.15s, transform 0.15s, filter 0.15s, opacity 0.15s",
				transform: hov ? "translateY(-2px)" : "none",
				boxShadow: img
					? (isOn ? `0 4px 16px rgba(${hexToRgbStr(resolvedColor)},0.4)` : "0 2px 8px rgba(0,0,0,0.35)")
					: (hov ? `0 4px 16px rgba(${hexToRgbStr(resolvedColor)},0.25)` : "none"),
				// Dim un-selected photo tiles so the active one stands out.
				filter: img && !isOn ? "brightness(0.78) saturate(0.9)" : "none",
				opacity: img && !isOn ? 0.9 : 1,
				flexShrink: 0,
			}}>
				{Icon ? <Icon s={22} /> : null}
			</div>
			<span className={active ? "text-text-primary" : "text-text-secondary"} style={wrapLabel ? {
				fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: active ? 600 : 400,
				transition: "color 0.15s", lineHeight: 1.25,
				maxWidth: 76, wordBreak: "break-word", textAlign: "center",
			} : {
				fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: active ? 600 : 400,
				whiteSpace: "nowrap", transition: "color 0.15s",
				maxWidth: 72, overflow: "hidden", textOverflow: "ellipsis", textAlign: "center",
			}}>{resolvedLabel}</span>
		</button>
	);
});
const SkeletonLeoButton = React.memo(function SkeletonLeoButton() {
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
			<Skel w={56} h={56} r={14} />
			<Skel w={44} h={10} r={5} />
		</div>
	);
});
const ODCategoryBubble = React.memo(function ODCategoryBubble({ cat, active, onClick, delay }) {
	return (
		<div
			onClick={onClick}
			{...clickableProps(onClick)}
			aria-label={cat.label}
			aria-pressed={Boolean(active)}
			style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, animation: `fadeUp 0.35s ease ${delay}ms both`, cursor: "pointer" }}
		>
			<div style={{
				width: 72, height: 72, borderRadius: "50%",
				background: active ? cat.color : "var(--color-surface-raised)",
				border: `2.5px solid ${active ? cat.color : cat.color + "66"}`,
				display: "flex", alignItems: "center", justifyContent: "center",
				backdropFilter: "blur(12px)",
				boxShadow: active ? `0 4px 20px ${cat.color}55` : "0 2px 8px var(--color-shadow)",
				transition: "all 0.18s",
			}} />
			<span className={active ? "text-text-primary" : "text-text-secondary"} style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: active ? 600 : 400, whiteSpace: "nowrap" }}>{cat.label}</span>
		</div>
	);
});
const QuickContactChat = React.memo(function QuickContactChat({ toName, context = "", onClose }) {
	const justNow = i18n.t("shared.justNow");
	const [msgs, setMsgs] = useState([
		{ from: "them", text: i18n.t("shared.quickChatGreeting", { context: context || i18n.t("shared.quickChatContextFallback") }), time: justNow }
	]);
	const [input, setInput] = useState("");
	const autoReplies = [
		i18n.t("shared.autoReply1"),
		i18n.t("shared.autoReply2"),
		i18n.t("shared.autoReply3"),
		i18n.t("shared.autoReply4"),
	];

	function send() {
		if (!input.trim()) return;
		const text = input.trim();
		setInput("");
		setMsgs(prev => [...prev, { from: "me", text, time: justNow }]);
		setTimeout(() => {
			setMsgs(prev => [...prev, { from: "them", text: autoReplies[Math.floor(Math.random() * autoReplies.length)], time: justNow }]);
		}, 1000 + Math.random() * 800);
	}

	return (
		<div className="bg-surface border border-border" style={{ borderRadius: 16, overflow: "hidden", animation: "fadeUp 0.2s ease both" }}>
			<div className="border-b border-border-subtle" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(37,99,235,0.08)" }}>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<div style={{ width: 32, height: 32, borderRadius: "50%", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "'Barlow Condensed', sans-serif", flexShrink: 0 }}>{toName ? toName[0].toUpperCase() : "?"}</div>
					<div>
						<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700 }}>{toName || i18n.t("shared.provider")}</p>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#059669" }}>{i18n.t("shared.onlineNow")}</p>
					</div>
				</div>
				<button onClick={onClose} className="text-text-muted" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>x</button>
			</div>
			<div style={{ height: 200, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8, scrollbarWidth: "none" }}>
				{msgs.map((m, i) => (
					<div key={i} style={{ display: "flex", justifyContent: m.from === "me" ? "flex-end" : "flex-start", animation: "fadeUp 0.15s ease both" }}>
						<div className={m.from === "me" ? "bg-[#2563eb]" : "bg-surface-raised"} style={{ maxWidth: "75%", borderRadius: m.from === "me" ? "14px 14px 4px 14px" : "14px 14px 14px 4px", padding: "9px 13px" }}>
							<p className={m.from === "me" ? "text-white" : "text-text-primary"} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.45 }}>{m.text}</p>
						</div>
					</div>
				))}
			</div>
			<div className="border-t border-border-subtle" style={{ display: "flex", gap: 8, padding: "10px 12px" }}>
				<input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder={i18n.t("shared.typeMessage")}
					className="bg-surface-raised border border-border text-text-primary"
					style={{ flex: 1, padding: "9px 12px", borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
				<button onClick={send} style={{ padding: "9px 16px", background: "#2563eb", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>{i18n.t("common.send")}</button>
			</div>
		</div>
	);
});

function ODMiniCalendar({ value, onChange, label }) {
	const today = new Date();
	const [viewYear, setViewYear] = useState(value ? value.getFullYear() : today.getFullYear());
	const [viewMonth, setViewMonth] = useState(value ? value.getMonth() : today.getMonth());
	const MONTH_NAMES = sharedMonthNames();
	const DAY_NAMES = sharedDayNames();
	const locale = i18n.language || "en";
	const firstDay = new Date(viewYear, viewMonth, 1).getDay();
	const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
	const cells = [];
	for (let i = 0; i < firstDay; i++) cells.push(null);
	for (let d = 1; d <= daysInMonth; d++) cells.push(d);
	while (cells.length % 7 !== 0) cells.push(null);
	function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); }
	function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); }
	function isSelected(d) { return value && value.getDate() === d && value.getMonth() === viewMonth && value.getFullYear() === viewYear; }
	function isPast(d) { const dt = new Date(viewYear, viewMonth, d); dt.setHours(0,0,0,0); const t = new Date(); t.setHours(0,0,0,0); return dt < t; }
	return (
		<div className="bg-surface-raised border border-border" style={{ borderRadius: 14, padding: "14px 16px", width: "100%" }}>
			{label && <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>{label}</p>}
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
				<button onClick={prevMonth} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 6, fontSize: 14, lineHeight: 1 }}>{'<'}</button>
				<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
				<button onClick={nextMonth} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 6, fontSize: 14, lineHeight: 1 }}>{'>'}</button>
			</div>
			<div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
				{DAY_NAMES.map(d => <div key={d} className="text-text-muted" style={{ textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, paddingBottom: 4 }}>{d}</div>)}
			</div>
			<div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
				{cells.map((d, i) => {
					const selectable = Boolean(d && !isPast(d));
					const selected = Boolean(d && isSelected(d));
					const selectDay = () => { if (selectable) onChange(new Date(viewYear, viewMonth, d)); };
					return (
					<div key={i} onClick={selectDay}
						{...(selectable ? clickableProps(selectDay) : {})}
						aria-label={selectable ? new Date(viewYear, viewMonth, d).toLocaleDateString(locale, { month: "long", day: "numeric", year: "numeric" }) : undefined}
						aria-pressed={selectable ? selected : undefined}
						style={{ height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, cursor: d && !isPast(d) ? "pointer" : "default",
							background: selected ? "#2563eb" : "transparent",
							color: !d ? "transparent" : isPast(d) ? "var(--color-text-muted)" : selected ? "#fff" : "var(--color-text-secondary)",
							fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: selected ? 700 : 400, transition: "background 0.15s",
						}}
						onMouseEnter={e => { if (selectable && !selected) e.currentTarget.style.background = "rgba(37,99,235,0.25)"; }}
						onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}
					>{d || ""}</div>
					);
				})}
			</div>
			{value && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#60a5fa", marginTop: 10, textAlign: "center" }}>{value.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</p>}
		</div>
	);
}

/* Tooltip lives in Tooltip.jsx so the app shell can import it without pulling this mega-file. */

function clickableProps(onActivate) {
	return {
		role: "button",
		tabIndex: 0,
		onKeyDown: (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				onActivate?.(e);
			}
		},
	};
}

export {
  Tooltip,
  clickableProps,
  QuickContactChat,
  SellerDashHeader,
  SellerStatCards,
  SellerTabBar,
  ProviderTopNav,
  SellerRefCodeSection,
  SellerAddBtn,
  SellerChatTab,
  SellerWalletTab,
  SellerReviewsTab,
  SellerEditProfileTab,
  CelebrityEditProfileTab,
  SellerEarningsTab,
  LeoButton,
  SkeletonLeoButton,
  ODCategoryBubble,
  AddressAutocomplete,
  ODMiniCalendar,
  ComingSoonOverlay,
  ExpandableText,
  CommentsSheet,
  MediaPostModal,
  HostListingCTA,
};

// Reusable "List your X" host entry point for any booking-engine vertical.
// Renders a pill button that opens the generic BookingListingForm. On a
// successful publish it calls onCreated(listing) so the page can refresh.
// Hidden for signed-out visitors (listing creation requires a JWT anyway).
function HostListingCTA({ vertical, label, onCreated, style, presetAttrs }) {
  const [open, setOpen] = useState(false);
  if (!isAuthenticated()) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "9px 16px",
          background: "rgba(37,99,235,0.14)",
          border: "1px solid rgba(37,99,235,0.5)",
          borderRadius: 24,
          color: "#60a5fa",
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
          whiteSpace: "nowrap",
          ...style,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1, marginTop: -1 }}>＋</span>
        {label || i18n.t("hostListing.default")}
      </button>
      {open && (
        <BookingListingForm
          vertical={vertical}
          presetAttrs={presetAttrs}
          onClose={() => setOpen(false)}
          onSaved={(listing) => {
            setOpen(false);
            onCreated?.(listing);
          }}
        />
      )}
    </>
  );
}

function ComingSoonOverlay({ children }) {
  return (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {children}
      <div style={{
        position: "absolute", inset: 0,
        backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        background: "color-mix(in srgb, var(--color-bg) 55%, transparent)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 10,
        borderRadius: "inherit",
      }}>
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800,
          fontSize: 20, color: "#fff", letterSpacing: "0.1em", textTransform: "uppercase",
          background: "rgba(37,99,235,0.85)", padding: "10px 24px", borderRadius: 30,
        }}>
          {i18n.t("shared.comingSoon")}
        </span>
      </div>
    </div>
  );
}

const AddressAutocomplete = React.memo(function AddressAutocomplete({ value, onChange, onEnter, placeholder, inputStyle, wrapStyle, useLocation, inputId, ariaLabel }) {
	const inputRef = useRef(null);
	const suggestTimer = useRef(null);
	const [locating, setLocating] = React.useState(false);
	const [locError, setLocError] = React.useState(false);
	const [suggestions, setSuggestions] = React.useState([]);
	const [suggestionsOpen, setSuggestionsOpen] = React.useState(false);
	const [activeSuggestion, setActiveSuggestion] = React.useState(-1);
	const [suggestionsLoading, setSuggestionsLoading] = React.useState(false);

	useEffect(() => {
		return () => {
			if (suggestTimer.current) clearTimeout(suggestTimer.current);
		};
	}, []);

	const normalizeSuggestion = React.useCallback((raw) => {
		if (!raw) return null;
		if (typeof raw === "string") {
			const description = raw.trim();
			return description ? { place_id: description, description, lat: null, lng: null } : null;
		}
		const lat = raw.lat ?? raw.latitude ?? raw.geometry?.location?.lat ?? raw.geometry?.lat ?? null;
		const lng = raw.lng ?? raw.lon ?? raw.long ?? raw.longitude ?? raw.geometry?.location?.lng ?? raw.geometry?.lng ?? null;
		const main = raw.description ?? raw.formatted_address ?? raw.address ?? raw.label ?? raw.name ?? raw.display_name ?? raw.structured_formatting?.main_text ?? "";
		const secondary = raw.secondary_text ?? raw.subtitle ?? raw.city ?? raw.region ?? "";
		const description = [main, secondary].filter(Boolean).join(secondary && !String(main).includes(secondary) ? ", " : "");
		if (!description) return null;
		return {
			place_id: raw.place_id ?? raw.placeId ?? raw.osm_id ?? raw.id ?? description,
			description,
			lat: lat != null ? Number(lat) : null,
			lng: lng != null ? Number(lng) : null,
		};
	}, []);

	const resolveGooglePlaceDetails = React.useCallback((suggestion) => {
		if (!suggestion?.place_id || !window.google?.maps?.places?.PlacesService) return Promise.resolve(null);
		const service = new window.google.maps.places.PlacesService(document.createElement("div"));
		return new Promise(resolve => {
			service.getDetails(
				{ placeId: suggestion.place_id, fields: ["formatted_address", "geometry"] },
				(place, status) => {
					if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
						resolve(null);
						return;
					}
					resolve({
						description: place.formatted_address || suggestion.description,
						lat: place.geometry.location.lat(),
						lng: place.geometry.location.lng(),
					});
				},
			);
		});
	}, []);

	const fetchPhotonSuggestions = React.useCallback(async (q) => {
		const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6`);
		if (!res.ok) return [];
		const data = await res.json();
		return (data?.features || []).map(feature => {
			const props = feature.properties || {};
			const coords = feature.geometry?.coordinates || [];
			const description = [
				props.name,
				props.street,
				props.city || props.county,
				props.state,
				props.country,
			].filter(Boolean).join(", ");
			return normalizeSuggestion({
				id: props.osm_id,
				description,
				lat: coords[1],
				lng: coords[0],
			});
		}).filter(Boolean);
	}, [normalizeSuggestion]);

	const fetchSuggestions = React.useCallback((query) => {
		if (suggestTimer.current) clearTimeout(suggestTimer.current);
		const q = String(query || '').trim();
		if (q.length < 2) {
			setSuggestions([]);
			setSuggestionsOpen(false);
			setActiveSuggestion(-1);
			setSuggestionsLoading(false);
			return;
		}
		setSuggestionsLoading(true);
		suggestTimer.current = setTimeout(async () => {
			try {
				let next = [];
				try {
					const res = await client.get('/food/autocomplete', { params: { q } });
					const raw = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
					next = raw.map(normalizeSuggestion).filter(Boolean);
				} catch {
					next = [];
				}
				if (!next.length) {
					try {
						await loadGoogleMaps();
						if (window.google?.maps?.places?.AutocompleteService) {
							const service = new window.google.maps.places.AutocompleteService();
							next = await new Promise(resolve => {
								service.getPlacePredictions({ input: q }, (predictions, status) => {
									if (status === window.google.maps.places.PlacesServiceStatus.OK && Array.isArray(predictions)) {
										resolve(predictions.map(normalizeSuggestion).filter(Boolean));
									} else {
										resolve([]);
									}
								});
							});
						}
					} catch {
						next = [];
					}
				}
				if (!next.length) next = await fetchPhotonSuggestions(q);
				setSuggestions(next);
				setSuggestionsOpen(next.length > 0 && document.activeElement === inputRef.current);
				setActiveSuggestion(next.length ? 0 : -1);
			} catch (err) {
				setSuggestions([]);
				setSuggestionsOpen(false);
				setActiveSuggestion(-1);
			} finally {
				setSuggestionsLoading(false);
			}
		}, 220);
	}, [fetchPhotonSuggestions, normalizeSuggestion]);

	const chooseSuggestion = React.useCallback(async (suggestion) => {
		if (!suggestion) return;
		const fallbackAddress = suggestion.description || value;
		setSuggestionsOpen(false);
		setSuggestions([]);
		setActiveSuggestion(-1);
		if (suggestion.lat != null && suggestion.lng != null) {
			onChange(fallbackAddress, Number(suggestion.lat), Number(suggestion.lng));
			onEnter?.(fallbackAddress, Number(suggestion.lat), Number(suggestion.lng));
			return;
		}
		try {
			await loadGoogleMaps();
			const details = await resolveGooglePlaceDetails(suggestion);
			if (details?.lat != null && details?.lng != null) {
				onChange(details.description || fallbackAddress, details.lat, details.lng);
				onEnter?.(details.description || fallbackAddress, details.lat, details.lng);
				return;
			}
		} catch {
			// Fall through to plain-address selection.
		}
		onChange(fallbackAddress);
		onEnter?.(fallbackAddress);
	}, [onChange, onEnter, resolveGooglePlaceDetails, value]);

	const handleInputChange = (e) => {
		const next = e.target.value;
		onChange(next);
		fetchSuggestions(next);
	};

	const handleGeolocate = () => {
		if (!navigator.geolocation) return;
		setLocating(true);
		setLocError(false);
		navigator.geolocation.getCurrentPosition(
			async (pos) => {
				const lat = pos.coords.latitude;
				const lng = pos.coords.longitude;
				try {
					await loadGoogleMaps();
					if (!window.google?.maps?.Geocoder) throw new Error("Google Maps unavailable");
					const geocoder = new window.google.maps.Geocoder();
					geocoder.geocode({ location: { lat, lng } }, (results, status) => {
						setLocating(false);
						if (status === 'OK' && results[0]) onChange(results[0].formatted_address, lat, lng);
						else {
							onChange(`${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng);
							setLocError(true);
						}
					});
				} catch {
					setLocating(false);
					onChange(`${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng);
					setLocError(true);
				}
			},
			() => { setLocating(false); setLocError(true); },
			{ timeout: 8000 }
		);
	};

	
	useEffect(() => {
		if (!locError) return;
		const t = setTimeout(() => setLocError(false), 3000);
		return () => clearTimeout(t);
	}, [locError]);

	const hasGps = useLocation && !!navigator.geolocation;
	const btnColor = locError ? "#ef4444" : locating ? "#60a5fa" : "var(--color-text-muted)";
	const showSuggestions = suggestionsOpen && suggestions.length > 0;

	return (
		<div style={{ position: "relative", ...wrapStyle }}>
			<input ref={inputRef} value={value} onChange={handleInputChange}
				id={inputId}
				aria-label={ariaLabel}
				onFocus={() => {
					if (suggestions.length) setSuggestionsOpen(true);
				}}
				onBlur={() => {
					setTimeout(() => setSuggestionsOpen(false), 140);
				}}
				onKeyDown={e => {
					if (e.key === 'ArrowDown' && suggestions.length) {
						e.preventDefault();
						setSuggestionsOpen(true);
						setActiveSuggestion(i => Math.min(i + 1, suggestions.length - 1));
						return;
					}
					if (e.key === 'ArrowUp' && suggestions.length) {
						e.preventDefault();
						setActiveSuggestion(i => Math.max(i - 1, 0));
						return;
					}
					if (e.key === 'Escape') {
						setSuggestionsOpen(false);
						return;
					}
					if (e.key !== 'Enter') return;
					if (showSuggestions && activeSuggestion >= 0) {
						e.preventDefault();
						chooseSuggestion(suggestions[activeSuggestion]);
						return;
					}
					if (onEnter) onEnter(value);
				}}
				autoComplete="street-address"
				placeholder={placeholder}
				style={{ ...inputStyle, paddingRight: hasGps ? 40 : inputStyle?.paddingRight }} />
			{showSuggestions && (
				<div
					className="bg-surface-raised border border-border"
					style={{
						position: "absolute",
						top: "calc(100% + 6px)",
						left: 0,
						right: 0,
						zIndex: 9999,
						borderRadius: 12,
						boxShadow: "0 18px 42px var(--color-shadow)",
						overflow: "hidden",
						maxHeight: 260,
						overflowY: "auto",
					}}
				>
					{suggestions.map((suggestion, index) => (
						<button
							key={suggestion.place_id || `${suggestion.description}-${index}`}
							type="button"
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => chooseSuggestion(suggestion)}
							onMouseEnter={() => setActiveSuggestion(index)}
							className="text-text-primary"
							style={{
								width: "100%",
								display: "flex",
								alignItems: "flex-start",
								gap: 10,
								padding: "11px 13px",
								background: index === activeSuggestion ? "rgba(37,99,235,0.16)" : "transparent",
								border: "none",
								borderBottom: index === suggestions.length - 1 ? "none" : "1px solid var(--color-border-subtle)",
								cursor: "pointer",
								textAlign: "left",
								fontFamily: "'DM Sans', sans-serif",
							}}
						>
							<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted" style={{ flexShrink: 0, marginTop: 2 }}>
								<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
								<circle cx="12" cy="10" r="3" />
							</svg>
							<span className="text-text-primary" style={{ fontSize: 13, lineHeight: 1.35 }}>
								{suggestion.description}
							</span>
						</button>
					))}
				</div>
			)}
			{hasGps && (
				<button
					type="button"
					onClick={handleGeolocate}
					title={locError ? i18n.t("shared.locationBlocked") : i18n.t("shared.useMyLocation")}
					style={{
						position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
						background: "none", border: "none", cursor: "pointer", padding: 0,
						color: btnColor, display: "flex", alignItems: "center",
						transition: "color 0.2s",
					}}
				>
					{locating ? (
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite", pointerEvents: "none" }}>
							<circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
							<path d="M12 2a10 10 0 0 1 10 10" />
						</svg>
					) : locError ? (
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ pointerEvents: "none" }}>
							<circle cx="12" cy="12" r="10" />
							<path d="M12 8v4M12 16h.01" strokeLinecap="round" />
						</svg>
					) : (
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ pointerEvents: "none" }}>
							<circle cx="12" cy="12" r="3" />
							<path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
							<circle cx="12" cy="12" r="8" strokeOpacity="0.4" />
						</svg>
					)}
				</button>
			)}
		</div>
	);
});
// ExpandableText ─ clamp long captions/comments in feeds so a single post
// cannot blow out the timeline. Line-clamp is incompatible with white-space:
// pre-wrap, so we only preserve newlines once the text is expanded.
function ExpandableText({
	text,
	prefix,
	lines = 3,
	onOpen,
	className = "text-text-secondary",
	style,
	mb = 0,
	pill = true,
}) {
	const ref = useRef(null);
	const [expanded, setExpanded] = useState(false);
	const [overflowing, setOverflowing] = useState(false);
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		const measure = () => {
			if (expanded) return;
			setOverflowing(el.scrollHeight - el.clientHeight > 4);
		};
		measure();
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, [text, expanded, lines]);
	if (text == null || text === "") return null;
	const clamp = !expanded;
	return (
		<div style={{ marginBottom: mb }}>
			<p
				ref={ref}
				onClick={() => onOpen?.()}
				className={className}
				style={{
					fontFamily: "'DM Sans', sans-serif",
					fontSize: 13,
					lineHeight: 1.5,
					margin: 0,
					wordBreak: "break-word",
					overflowWrap: "anywhere",
					cursor: onOpen ? "pointer" : "default",
					...(clamp
						? { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }
						: { whiteSpace: "pre-wrap" }),
					...style,
				}}
			>
				{prefix}
				{text}
			</p>
			{overflowing && (
				<button
					type="button"
					aria-expanded={expanded}
					onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
					style={pill ? {
						display: "inline-flex", alignItems: "center", gap: 5, marginTop: 7,
						padding: "3px 11px", borderRadius: 999, background: "rgba(37,99,235,0.14)",
						border: "1px solid rgba(96,165,250,0.30)", color: "#93b8fb",
						fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
						cursor: "pointer", lineHeight: 1, letterSpacing: "0.01em",
					} : {
						display: "inline", background: "none", border: "none", padding: 0, marginTop: 4,
						fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700,
						color: "rgba(255,255,255,0.55)", cursor: "pointer",
					}}
				>
					{expanded ? i18n.t("common.showLess") : i18n.t("common.showMore")}
					{pill && (
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}>
							<polyline points="6 9 12 15 18 9" />
						</svg>
					)}
				</button>
			)}
		</div>
	);
}

// CommentsSheet ─ Instagram-style mobile comments bottom sheet ────────────────
// Presentational + controlled. Each surface (feed posts, video watch, shorts)
// maps its data into the normalized `comments` shape and supplies callbacks.
//   comment = { id, user, handle?, avatarUrl?, avatar, avatarColor, verified?,
//               ring?, time, text, likes, liked, replyCount? }
function CommentsSheet({
	open,
	onClose,
	comments = [],
	loading = false,
	title = i18n.t("shared.comments"),
	draft = "",
	onDraftChange,
	onSubmit,
	onToggleLike,
	onReply,
	onDelete,
	onViewReplies,
	onShare,
	onGif,
	onEmoji,
	meAvatarUrl,
	meInitials = "Y",
	meColor = "#2563eb",
	inputPlaceholder = i18n.t("shared.whatDoYouThink"),
	emojis = ["❤️", "🙌", "🔥", "👏", "😢", "😍", "😮", "😂"],
}) {
	const { isMobile } = useViewport();
	// Hide the mobile bottom nav while the sheet is open (it lives in a separate
	// stacking context and would otherwise paint over the sheet).
	useEffect(() => {
		if (!open) return;
		window.dispatchEvent(new CustomEvent("strug:immersive-media", { detail: true }));
		return () => window.dispatchEvent(new CustomEvent("strug:immersive-media", { detail: false }));
	}, [open]);
	if (!open) return null;
	const submit = () => { if (draft.trim()) onSubmit?.(); };
	// Portal to <body>: an ancestor's transform (page-enter animation) would
	// otherwise contain position:fixed, so the backdrop wouldn't cover the full
	// viewport and tapping outside the contained box wouldn't close the sheet.
	return createPortal((
		// Backdrop scrim — stays dark regardless of theme so it reads as a dimming overlay over
		// whatever feed/video/shorts media sits behind the sheet, in both themes.
		<div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 320, background: "rgba(0,0,0,0.6)" }}>
			<style>{`@keyframes csheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
			{/* Sheet chrome is intentionally always a dark Instagram-style surface (not theme-tokenized) —
			    this comments sheet is presented over feed posts, video watch and shorts (immersive media
			    contexts), so a fixed dark panel reads consistently against that content in both themes. */}
			<div onClick={e => e.stopPropagation()} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: isMobile ? "75dvh" : "auto", maxHeight: "88dvh", display: "flex", flexDirection: "column", background: "#0d0d12", borderRadius: "16px 16px 0 0", animation: "csheetUp 0.26s cubic-bezier(0.32,0.72,0,1) both" }}>
				{/* Drag handle */}
				<div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
					<div style={{ width: 40, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.22)" }} />
				</div>
				{/* Header: centered title + share icon */}
				<div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "14px 20px 16px" }}>
					<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 19, color: "#fff" }}>{title}</span>
					<button onClick={() => onShare?.()} aria-label={i18n.t("shared.ariaShare")} style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#fff", padding: 4, lineHeight: 0 }}>
						<svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
					</button>
				</div>
				{/* Comment list */}
				<div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "0 18px 8px" }}>
					{loading && Array.from({ length: 5 }).map((_, i) => <SkeletonCommentDark key={i} />)}
					{!loading && comments.length === 0 && (
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "rgba(255,255,255,0.4)", textAlign: "center", marginTop: 40 }}>{i18n.t("shared.noCommentsYet")}</p>
					)}
					{!loading && comments.map((c, i) => (
						<div key={c.id ?? i} style={{ display: "flex", gap: 12, padding: "14px 0" }}>
							<div style={{ flexShrink: 0, ...(c.ring ? { padding: 2, borderRadius: "50%", background: "linear-gradient(135deg,#f58529,#dd2a7b,#8134af)" } : {}) }}>
								<div style={{ width: 44, height: 44, borderRadius: "50%", overflow: "hidden", background: c.avatarColor || "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", border: c.ring ? "2px solid #0d0d12" : "none" }}>
									<Avatar url={c.avatarUrl} initials={c.avatar} size="100%" style={{ background: "transparent", fontWeight: 800, fontSize: 16 }} />
								</div>
							</div>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#fff" }}>{c.user}</span>
									{c.verified && (
										<svg width={15} height={15} viewBox="0 0 24 24" fill="#2563eb" style={{ flexShrink: 0 }}><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
									)}
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "rgba(255,255,255,0.45)" }}>{c.time}</span>
								</div>
								<ExpandableText
									text={c.text}
									lines={5}
									pill={false}
									className=""
									style={{ fontSize: 15, color: "#fff", lineHeight: 1.4 }}
								/>
								<button onClick={() => onReply?.(c)} style={{ background: "none", border: "none", padding: 0, marginTop: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.55)", cursor: "pointer" }}>{i18n.t("common.reply")}</button>
								{c.canDelete && (
									<button onClick={() => onDelete?.(c)} style={{ background: "none", border: "none", padding: 0, marginTop: 8, marginLeft: 18, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.55)", cursor: "pointer" }}>{i18n.t("common.delete", { defaultValue: "Delete" })}</button>
								)}
								{c.replyCount > 0 && (
									<button onClick={() => onViewReplies?.(c)} style={{ display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", padding: 0, marginTop: 12, cursor: "pointer" }}>
										<span style={{ width: 24, height: 1, background: "rgba(255,255,255,0.25)" }} />
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>{i18n.t("shared.viewMoreReplies", { count: c.replyCount })}</span>
									</button>
								)}
							</div>
							{onToggleLike && (
							<button onClick={() => onToggleLike?.(c)} aria-label={i18n.t("shared.ariaLikeComment")} style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: 2, color: c.liked ? "#ef4444" : "rgba(255,255,255,0.5)" }}>
								<svg width={22} height={22} viewBox="0 0 24 24" fill={c.liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
								{c.likes > 0 && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{Number(c.likes).toLocaleString()}</span>}
							</button>
							)}
						</div>
					))}
				</div>
				{/* Quick emoji reactions */}
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 22px 6px" }}>
					{emojis.map(e => (
						<button key={e} onClick={() => onEmoji ? onEmoji(e) : onDraftChange?.(draft + e)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 26, lineHeight: 1, padding: 0 }}>{e}</button>
					))}
				</div>
				{/* Input bar */}
				<div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px calc(16px + env(safe-area-inset-bottom))" }}>
					<div style={{ width: 38, height: 38, borderRadius: "50%", overflow: "hidden", background: meColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
						<Avatar url={meAvatarUrl} initials={meInitials} size="100%" style={{ background: "transparent", fontWeight: 800, fontSize: 14 }} />
					</div>
					<div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 24, padding: "0 10px 0 18px" }}>
						<input value={draft} maxLength={2000} onChange={e => onDraftChange?.(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} placeholder={inputPlaceholder} style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 15, padding: "12px 0" }} />
						{draft.trim()
							? <button onClick={submit} style={{ background: "none", border: "none", cursor: "pointer", color: "#2563eb", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, padding: "6px 4px" }}>{i18n.t("common.post")}</button>
							: <button onClick={() => onGif?.()} aria-label={i18n.t("shared.addGif")} style={{ background: "none", border: "1.5px solid rgba(255,255,255,0.4)", borderRadius: 6, cursor: "pointer", color: "rgba(255,255,255,0.7)", fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 11, padding: "3px 6px", letterSpacing: "0.04em" }}>{i18n.t("shared.gif")}</button>}
					</div>
				</div>
			</div>
		</div>
	), document.body);
}

// MediaPostModal ─ Instagram-style desktop "zoom-in" modal ────────────────────
// Split layout: media on the left (~60%), engagement panel on the right (~40%):
// header · description · scrollable comments · actions · likes/date · input.
// Presentational + controlled; callers map their own data/handlers.
//   author  = { avatar, avatarColor, avatarUrl, name, handle, verified, time }
//   media   = { url, isVideo, poster, fallbackBg }
//   comment = { id, user, avatarUrl?, avatar, avatarColor, verified?, time, text, likes, liked }
function MediaPostModal({
	open,
	onClose,
	media = {},
	author = {},
	caption,
	comments = [],
	loading = false,
	liked = false,
	likes = 0,
	saved = false,
	time,
	onToggleLike,
	onToggleSave,
	onShare,
	onFocusInput,
	draft = "",
	onDraftChange,
	onSubmit,
	onCommentLike,
	onReply,
	meAvatarUrl,
	meInitials = "Y",
	meColor = "#2563eb",
	inputPlaceholder = i18n.t("shared.addComment"),
	emojis = ["❤️", "🙌", "🔥", "👏", "😢", "😍", "😮", "😂"],
}) {
	const inputRef = useRef(null);
	if (!open) return null;
	const submit = () => { if (draft.trim()) onSubmit?.(); };
	const focusInput = () => { inputRef.current?.focus(); onFocusInput?.(); };
	return createPortal((
		// Full-viewport backdrop scrim — stays dark regardless of theme, same as every other
		// media lightbox backdrop in this file (StoryViewer, FullscreenVideoOverlay): the content
		// composited on top needs a dark surface to read against, whatever the app theme is.
		<div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 330, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
			<style>{`@keyframes mpmZoom{from{transform:scale(0.92);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
			<button onClick={onClose} aria-label={i18n.t("shared.ariaClose")} style={{ position: "fixed", top: 18, right: 22, background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 6, lineHeight: 0, zIndex: 1 }}>
				<svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
			</button>
			{/* Modal chrome (media pane + engagement panel) is intentionally always a dark
			    Instagram-style "zoom-in" post viewer, not theme-tokenized — it's a media lightbox,
			    so it needs to read consistently over unpredictable photo/video content regardless
			    of theme, same as CommentsSheet above. The boxShadow stays hardcoded too (rule 4
			    carve-out for shadows on a media/lightbox element). */}
			<div onClick={e => e.stopPropagation()} style={{ display: "flex", width: "min(1100px, 94vw)", height: "min(86vh, 760px)", background: "#0d0d12", borderRadius: 12, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.6)", animation: "mpmZoom 0.2s cubic-bezier(0.32,0.72,0,1) both" }}>
				{/* Left: media */}
				<div style={{ flex: "0 0 60%", minWidth: 0, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
					{media.url
						? (media.isVideo
							// #438: was a plain <video src>, which cannot play the HLS (.m3u8) sources the feed
							// serves on any browser except Safari — clicking a video on Social was a black screen
							// that never loaded on Chrome/Edge/Firefox.
							? <HlsVideo src={media.url} poster={media.poster} controls autoPlay loop playsInline style={{ width: "100%", height: "100%", objectFit: "contain" }} />
							: <img src={media.url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />)
						: <div style={{ width: "100%", height: "100%", background: media.fallbackBg || "linear-gradient(135deg,#1e3a5f,#0f2744)" }} />}
				</div>
				{/* Right: engagement panel */}
				<div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "#0d0d12" }}>
					{/* Header */}
					<div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
						<div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", background: author.avatarColor || "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
							<Avatar url={author.avatarUrl} initials={author.avatar} size="100%" style={{ background: "transparent", fontWeight: 800, fontSize: 14 }} />
						</div>
						<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff" }}>{author.handle || author.name}</span>
						{author.verified && <svg width={14} height={14} viewBox="0 0 24 24" fill="#2563eb"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
					</div>
					{/* Description + comments (scroll) */}
					<div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "14px 16px" }}>
								{caption && (
							<div style={{ display: "flex", gap: 12, paddingBottom: 16, marginBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
								<div style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", background: author.avatarColor || "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
									<Avatar url={author.avatarUrl} initials={author.avatar} size="100%" style={{ background: "transparent", fontWeight: 800, fontSize: 13 }} />
								</div>
								<ExpandableText
									text={caption}
									prefix={<span style={{ fontWeight: 700, marginRight: 6 }}>{author.handle || author.name}</span>}
									lines={6}
									pill={false}
									className=""
									style={{ fontSize: 14, color: "#fff", lineHeight: 1.5 }}
								/>
							</div>
						)}
						{loading && Array.from({ length: 4 }).map((_, i) => (
							<div key={i} style={{ display: "flex", gap: 12, padding: "10px 0" }}>
								<Skel w={34} h={34} r={17} />
								<div style={{ flex: 1 }}><Skel w="60%" h={11} r={5} style={{ marginBottom: 6 }} /><Skel w="88%" h={11} r={5} /></div>
							</div>
						))}
						{!loading && comments.length === 0 && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center", marginTop: 28 }}>{i18n.t("shared.noCommentsYetShort")}</p>}
						{!loading && comments.map((c, i) => (
							<div key={c.id ?? i} style={{ display: "flex", gap: 12, padding: "10px 0" }}>
								<div style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", background: c.avatarColor || "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
									<Avatar url={c.avatarUrl} initials={c.avatar} size="100%" style={{ background: "transparent", fontWeight: 800, fontSize: 13 }} />
								</div>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff" }}>{c.user}</span>
										{c.verified && <svg width={13} height={13} viewBox="0 0 24 24" fill="#2563eb" style={{ flexShrink: 0 }}><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{c.time}</span>
									</div>
									<ExpandableText
										text={c.text}
										lines={5}
										pill={false}
										className=""
										style={{ fontSize: 13, color: "#fff", lineHeight: 1.4 }}
									/>
									<button onClick={() => onReply?.(c)} style={{ background: "none", border: "none", padding: 0, marginTop: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>{i18n.t("common.reply")}</button>
								</div>
								{onCommentLike && (
									<button onClick={() => onCommentLike?.(c)} aria-label={i18n.t("shared.ariaLikeComment")} style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: 2, color: c.liked ? "#ef4444" : "rgba(255,255,255,0.45)" }}>
										<svg width={16} height={16} viewBox="0 0 24 24" fill={c.liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
										{c.likes > 0 && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{Number(c.likes).toLocaleString()}</span>}
									</button>
								)}
							</div>
						))}
					</div>
					{/* Actions */}
					<div style={{ display: "flex", alignItems: "center", gap: 18, padding: "10px 16px 6px", borderTop: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
						<button onClick={() => onToggleLike?.()} aria-label={i18n.t("shared.ariaLike")} style={{ background: "none", border: "none", cursor: "pointer", color: liked ? "#ef4444" : "rgba(255,255,255,0.8)", padding: 0, lineHeight: 0 }}>
							<svg width={24} height={24} viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
						</button>
						<button onClick={focusInput} aria-label={i18n.t("shared.ariaComment")} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.8)", padding: 0, lineHeight: 0 }}>
							<svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
						</button>
						<button onClick={() => onShare?.()} aria-label={i18n.t("shared.ariaShare")} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.8)", padding: 0, lineHeight: 0 }}>
							<svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
						</button>
						<button onClick={() => onToggleSave?.()} aria-label={i18n.t("shared.ariaSave")} style={{ background: "none", border: "none", cursor: "pointer", color: saved ? "#2563eb" : "rgba(255,255,255,0.8)", padding: 0, lineHeight: 0, marginLeft: "auto" }}>
							<svg width={24} height={24} viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
						</button>
					</div>
					{/* Likes + date */}
					<div style={{ padding: "0 16px 8px", flexShrink: 0 }}>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", margin: "2px 0 2px" }}>{i18n.t("shared.likesCount", { count: Number(likes).toLocaleString() })}</p>
						{time && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(255,255,255,0.4)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>{time}</p>}
					</div>
					{/* Input */}
					<div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px 14px", borderTop: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
						<div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", background: meColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
							<Avatar url={meAvatarUrl} initials={meInitials} size="100%" style={{ background: "transparent", fontWeight: 800, fontSize: 13 }} />
						</div>
						<div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 22, padding: "0 8px 0 16px" }}>
							<input ref={inputRef} value={draft} maxLength={2000} onChange={e => onDraftChange?.(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} placeholder={inputPlaceholder} style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 14, padding: "10px 0" }} />
							{draft.trim() && <button onClick={submit} style={{ background: "none", border: "none", cursor: "pointer", color: "#2563eb", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, padding: "6px 4px" }}>{i18n.t("common.post")}</button>}
						</div>
					</div>
				</div>
			</div>
		</div>
	), document.body);
}
